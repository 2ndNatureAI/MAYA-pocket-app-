import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import crypto from 'crypto';
import bcryptjs from 'bcryptjs';
import { createClient } from '@supabase/supabase-js';

// Import security utilities
import {
  authenticateToken,
  requireAdmin,
  adminLoginLimiter,
  chatRateLimiter,
  clientCreateLimiter,
  generalLimiter,
  generateToken,
  validateMessage,
  validateClientId,
  validateClientInput,
  getCORSOptions,
  securityHeaders,
  auditLog,
  sanitizeError,
  estimateTokenCount,
} from './security.js';

import {
  safeChatCompletion,
  safeClassify,
  checkOpenAIHealth,
} from './openai-safe.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';

// ============= MIDDLEWARE SETUP =============
app.use(express.json({ limit: '1mb' })); // Prevent large payloads
app.use(cors(getCORSOptions()));
app.use(securityHeaders);
app.use(generalLimiter); // Apply base rate limiter to all routes

// Request ID for tracking
app.use((req, res, next) => {
  req.id = crypto.randomUUID();
  res.setHeader('X-Request-ID', req.id);
  next();
});

// ============= SUPABASE CLIENT (with proper separation) =============
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error('Missing Supabase configuration');
}

// User client (with RLS enforcement)
const supabaseUser = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Admin client (bypasses RLS, only for server-side admin operations)
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

// ============= HEALTH CHECK =============
app.get('/api/health', async (req, res) => {
  try {
    const openaiHealth = await checkOpenAIHealth();
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      environment: NODE_ENV,
      openai: openaiHealth,
    });
  } catch (err) {
    res.status(500).json(sanitizeError(err));
  }
});

// ============= ADMIN LOGIN (SECURED) =============
app.post('/api/admin/login', adminLoginLimiter, async (req, res) => {
  const requestId = req.id;

  try {
    const { username, password } = req.body;

    if (!username || !password) {
      auditLog(req, res, 'auth_failure', { reason: 'missing_credentials' });
      return res.status(400).json({
        error: 'Username and password required',
        requestId,
      });
    }

    // Validate input format
    if (typeof username !== 'string' || typeof password !== 'string') {
      auditLog(req, res, 'auth_failure', { reason: 'invalid_format' });
      return res.status(400).json({
        error: 'Invalid input format',
        requestId,
      });
    }

    // Timing-safe comparison for username
    const expectedUsername = process.env.ADMIN_USERNAME || 'admin';
    const usernameMatch = crypto.timingSafeEqual(
      Buffer.from(username),
      Buffer.from(expectedUsername)
    );

    if (!usernameMatch) {
      auditLog(req, res, 'auth_failure', { reason: 'invalid_username' });
      return res.status(401).json({
        error: 'Invalid credentials',
        requestId,
      });
    }

    // Check password hash
    const passwordHash = process.env.ADMIN_PASSWORD_HASH;
    if (!passwordHash) {
      console.error('[SECURITY] ADMIN_PASSWORD_HASH not configured');
      return res.status(500).json({
        error: 'Server configuration error',
        requestId,
      });
    }

    const passwordMatch = await bcryptjs.compare(password, passwordHash);

    if (!passwordMatch) {
      auditLog(req, res, 'auth_failure', { reason: 'invalid_password' });
      return res.status(401).json({
        error: 'Invalid credentials',
        requestId,
      });
    }

    // Success
    const token = generateToken(`admin-${Date.now()}`, 'admin');
    auditLog(req, res, 'admin_login', { success: true });

    res.json({
      token,
      expiresIn: process.env.ADMIN_JWT_EXPIRY || '1h',
      requestId,
    });
  } catch (err) {
    console.error('[LOGIN_ERROR]', err);
    auditLog(req, res, 'auth_failure', { reason: 'server_error' });
    res.status(500).json(sanitizeError(err));
  }
});

// ============= CLIENT MANAGEMENT =============
app.post('/api/clients', clientCreateLimiter, authenticateToken, requireAdmin, async (req, res) => {
  try {
    // Validate input
    const validation = validateClientInput(req.body);
    if (!validation.valid) {
      auditLog(req, res, 'invalid_input', { errors: validation.errors });
      return res.status(400).json({
        error: 'Invalid input',
        details: validation.errors,
      });
    }

    const { name, email, businessType, config } = req.body;

    // Create client with admin client (safe because it's server-side)
    const { data, error } = await supabaseAdmin
      .from('clients')
      .insert([
        {
          name,
          email,
          business_type: businessType || 'other',
          config: config || {},
          created_at: new Date().toISOString(),
        },
      ])
      .select();

    if (error) throw error;

    auditLog(req, res, 'admin_action', { action: 'create_client', clientId: data[0].id });

    res.json(data[0]);
  } catch (err) {
    console.error('[CREATE_CLIENT_ERROR]', err);
    auditLog(req, res, 'admin_action', { action: 'create_client_failed', error: err.message });
    res.status(500).json(sanitizeError(err));
  }
});

app.get('/api/clients/:id', authenticateToken, async (req, res) => {
  try {
    // Validate client ID format
    const validation = validateClientId(req.params.id);
    if (!validation.valid) {
      return res.status(400).json({ error: validation.error });
    }

    // User can only view their own client (if RLS is properly configured)
    const { data, error } = await supabaseUser
      .from('clients')
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Client not found' });

    res.json(data);
  } catch (err) {
    console.error('[GET_CLIENT_ERROR]', err);
    res.status(500).json(sanitizeError(err));
  }
});

// ============= CHAT WITH FULL PROTECTIONS =============
app.post('/api/chat', chatRateLimiter, authenticateToken, async (req, res) => {
  const requestId = req.id;

  try {
    const { clientId, message, conversationId } = req.body;

    // Validate inputs
    const clientValidation = validateClientId(clientId);
    if (!clientValidation.valid) {
      auditLog(req, res, 'invalid_input', { reason: 'invalid_client_id' });
      return res.status(400).json({
        error: clientValidation.error,
        requestId,
      });
    }

    const messageValidation = validateMessage(message);
    if (!messageValidation.valid) {
      auditLog(req, res, 'invalid_input', { reason: 'invalid_message' });
      return res.status(400).json({
        error: messageValidation.error,
        requestId,
      });
    }

    // Optional: validate conversation ID if provided
    if (conversationId) {
      const convoValidation = validateClientId(conversationId); // UUID format
      if (!convoValidation.valid) {
        return res.status(400).json({ error: 'Invalid conversation ID format' });
      }
    }

    // Get or create conversation
    let convoId = conversationId;
    if (!convoId) {
      const { data: newConvo, error: convoError } = await supabaseAdmin
        .from('conversations')
        .insert([
          {
            client_id: clientId,
            created_at: new Date().toISOString(),
          },
        ])
        .select();

      if (convoError) throw convoError;
      convoId = newConvo[0].id;
    }

    // Log user message
    await supabaseAdmin.from('messages').insert([
      {
        conversation_id: convoId,
        role: 'user',
        content: message,
        created_at: new Date().toISOString(),
      },
    ]);

    // Check after-hours
    const now = new Date();
    const hour = now.getHours();
    const afterHoursStart = parseInt(process.env.AFTER_HOURS_START) || 18;
    const afterHoursEnd = parseInt(process.env.AFTER_HOURS_END) || 8;
    const isAfterHours =
      process.env.AFTER_HOURS_ENABLED === 'true' &&
      (hour >= afterHoursStart || hour < afterHoursEnd);

    let classification = null;
    let assistantMessage = null;
    let requiresHumanReview = isAfterHours;

    try {
      // Classify intent
      const classifyResult = await safeClassify(message);
      classification = classifyResult.intent;

      if (classifyResult.cost) {
        console.log(`[COST_TRACKING] Classification cost: $${classifyResult.cost.toFixed(6)}`);
      }

      // Flag complaints for review
      if (classification === 'complaint') {
        requiresHumanReview = true;
      }
    } catch (classifyErr) {
      console.error('[CLASSIFY_FAILED]', classifyErr.message);
      classification = 'other';
    }

    // Log classification
    if (classification) {
      await supabaseAdmin.from('classifications').insert([
        {
          message_id: convoId,
          intent: classification,
          confidence: 0.85,
          created_at: new Date().toISOString(),
        },
      ]);
    }

    // Generate response
    if (isAfterHours) {
      assistantMessage =
        'Our team is currently offline. Your message has been logged and will be reviewed during business hours.';
    } else {
      try {
        const completion = await safeChatCompletion([
          {
            role: 'system',
            content:
              'You are MAYA, a helpful business assistant. Respond concisely and professionally to user requests.',
          },
          { role: 'user', content: message },
        ]);

        assistantMessage = completion.content;

        if (completion.cost) {
          console.log(`[COST_TRACKING] Chat completion cost: $${completion.cost.toFixed(4)}`);
        }
      } catch (chatErr) {
        console.error('[CHAT_ERROR]', chatErr.message);
        // Fallback message
        assistantMessage =
          'I encountered an error processing your request. Please try again later.';
        requiresHumanReview = true;
      }
    }

    // Store assistant message
    await supabaseAdmin.from('messages').insert([
      {
        conversation_id: convoId,
        role: 'assistant',
        content: assistantMessage,
        created_at: new Date().toISOString(),
      },
    ]);

    // Create review record if needed
    if (requiresHumanReview && process.env.HUMAN_REVIEW_ENABLED === 'true') {
      await supabaseAdmin.from('review_status').insert([
        {
          conversation_id: convoId,
          status: 'pending',
          reason: isAfterHours ? 'after_hours' : classification === 'complaint' ? 'complaint_flagged' : 'error_recovery',
          created_at: new Date().toISOString(),
        },
      ]);
    }

    // Log this request
    await supabaseAdmin.from('logs').insert([
      {
        client_id: clientId,
        conversation_id: convoId,
        action: 'chat',
        intent: classification,
        tokens_used: estimateTokenCount(message),
        status: 'success',
        requires_review: requiresHumanReview,
        created_at: new Date().toISOString(),
      },
    ]);

    auditLog(req, res, 'openai_call', { intent: classification, afterHours: isAfterHours });

    res.json({
      conversationId: convoId,
      message: assistantMessage,
      classification,
      requiresHumanReview,
      isAfterHours,
      requestId,
    });
  } catch (err) {
    console.error('[CHAT_ENDPOINT_ERROR]', err);
    auditLog(req, res, 'openai_call', { error: err.message });
    res.status(500).json(sanitizeError(err));
  }
});

// ============= REVIEW ENDPOINTS =============
app.get('/api/reviews', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('review_status')
      .select('*, conversations(*)')
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) throw error;

    res.json(data || []);
  } catch (err) {
    console.error('[GET_REVIEWS_ERROR]', err);
    res.status(500).json(sanitizeError(err));
  }
});

app.patch('/api/reviews/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { status, notes } = req.body;

    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    if (notes && typeof notes !== 'string') {
      return res.status(400).json({ error: 'Notes must be a string' });
    }

    const { data, error } = await supabaseAdmin
      .from('review_status')
      .update({
        status,
        notes: notes || null,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', req.params.id)
      .select();

    if (error) throw error;

    auditLog(req, res, 'admin_action', { action: `review_${status}`, reviewId: req.params.id });

    res.json(data[0]);
  } catch (err) {
    console.error('[UPDATE_REVIEW_ERROR]', err);
    res.status(500).json(sanitizeError(err));
  }
});

// ============= LOGS EXPORT (ADMIN ONLY) =============
app.get('/api/logs/export', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { clientId, startDate, endDate, format } = req.query;

    let query = supabaseAdmin.from('logs').select('*');

    if (clientId) {
      const validation = validateClientId(clientId);
      if (!validation.valid) {
        return res.status(400).json({ error: 'Invalid client ID' });
      }
      query = query.eq('client_id', clientId);
    }

    if (startDate) {
      // Validate ISO date format
      if (!/^\d{4}-\d{2}-\d{2}/.test(startDate)) {
        return res.status(400).json({ error: 'Invalid start date format' });
      }
      query = query.gte('created_at', startDate);
    }

    if (endDate) {
      if (!/^\d{4}-\d{2}-\d{2}/.test(endDate)) {
        return res.status(400).json({ error: 'Invalid end date format' });
      }
      query = query.lte('created_at', endDate);
    }

    const { data, error } = await query
      .order('created_at', { ascending: false })
      .limit(10000); // Hard cap

    if (error) throw error;

    if (format === 'csv') {
      const csv = [
        ['ID', 'Client ID', 'Conversation ID', 'Action', 'Intent', 'Status', 'Requires Review', 'Created At'].join(','),
        ...data.map((row) =>
          [
            row.id,
            row.client_id,
            row.conversation_id || 'N/A',
            row.action,
            row.intent || 'N/A',
            row.status || 'N/A',
            row.requires_review ? 'Yes' : 'No',
            row.created_at,
          ]
            .map((v) => `"${v}"`) // Escape CSV
            .join(',')
        ),
      ].join('\n');

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="logs-${Date.now()}.csv"`);
      return res.send(csv);
    }

    auditLog(req, res, 'admin_action', { action: 'export_logs', count: data.length });

    res.json(data);
  } catch (err) {
    console.error('[EXPORT_LOGS_ERROR]', err);
    res.status(500).json(sanitizeError(err));
  }
});

// ============= ERROR HANDLING =============
app.use((err, req, res, next) => {
  console.error('[UNHANDLED_ERROR]', err);
  auditLog(req, res, 'error', { error: err.message });
  res.status(500).json(sanitizeError(err));
});

// ============= START SERVER =============
const server = app.listen(PORT, () => {
  console.log(`\n🚀 MAYA Backend (Secure) running on http://localhost:${PORT}`);
  console.log(`📝 Environment: ${NODE_ENV}`);
  console.log(`🔐 Security: ${NODE_ENV === 'production' ? 'ENABLED' : 'DEV MODE'}`);
  console.log(`\n⚠️  IMPORTANT:`);
  console.log(`   1. Ensure .env has all required variables`);
  console.log(`   2. ADMIN_PASSWORD_HASH must be bcrypt hashed`);
  console.log(`   3. JWT_SECRET must be 32+ characters`);
  console.log(`   4. Configure Supabase RLS policies\n`);
});

server.on('error', (err) => {
  console.error('[SERVER_ERROR]', err);
  process.exit(1);
});
