import rateLimit from 'express-rate-limit';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';

// ============= RATE LIMITERS =============
export const adminLoginLimiter = rateLimit({
  windowMs: parseInt(process.env.ADMIN_LOGIN_WINDOW_MS) || 15 * 60 * 1000,
  max: parseInt(process.env.ADMIN_LOGIN_MAX_ATTEMPTS) || 5,
  skipSuccessfulRequests: true,
  message: 'Too many login attempts, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
});

export const chatRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: parseInt(process.env.CHAT_RATE_LIMIT_REQUESTS_PER_HOUR) || 100,
  keyGenerator: (req) => req.userId || req.ip,
  message: 'Too many chat requests, please wait before sending another message',
  standardHeaders: true,
});

export const clientCreateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 50,
  skipSuccessfulRequests: true,
  message: 'Too many client creation attempts',
});

export const generalLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30,
  standardHeaders: true,
});

// ============= JWT HELPERS =============
export function validateJWTSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('JWT_SECRET must be at least 32 characters. Set in .env');
  }
  return secret;
}

export function generateToken(userId, role = 'user') {
  const secret = validateJWTSecret();
  const expiryTime = role === 'admin' 
    ? process.env.ADMIN_JWT_EXPIRY || '1h'
    : process.env.JWT_EXPIRY || '2h';
  
  return jwt.sign(
    {
      userId,
      role,
      iat: Math.floor(Date.now() / 1000),
    },
    secret,
    {
      expiresIn: expiryTime,
      algorithm: 'HS512',
    }
  );
}

export function verifyToken(token) {
  try {
    return jwt.verify(token, validateJWTSecret(), {
      algorithms: ['HS512'],
    });
  } catch (err) {
    console.error('[AUTH] Token verification failed:', err.message);
    return null;
  }
}

// ============= AUTH MIDDLEWARE =============
export function authenticateToken(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({
      error: 'Unauthorized',
      code: 'NO_TOKEN',
    });
  }

  const decoded = verifyToken(token);
  if (!decoded) {
    return res.status(403).json({
      error: 'Invalid or expired token',
      code: 'INVALID_TOKEN',
    });
  }

  req.userId = decoded.userId;
  req.userRole = decoded.role || 'user';
  next();
}

export function requireAdmin(req, res, next) {
  if (req.userRole !== 'admin') {
    return res.status(403).json({
      error: 'Admin access required',
      code: 'FORBIDDEN',
    });
  }
  next();
}

// ============= INPUT VALIDATION =============
export function validateMessage(message) {
  const MAX_LENGTH = parseInt(process.env.MAX_MESSAGE_LENGTH) || 2000;

  if (!message || typeof message !== 'string') {
    return { valid: false, error: 'Message must be a non-empty string' };
  }

  if (message.trim().length === 0) {
    return { valid: false, error: 'Message cannot be blank' };
  }

  if (message.length > MAX_LENGTH) {
    return {
      valid: false,
      error: `Message exceeds maximum length of ${MAX_LENGTH} characters`,
    };
  }

  return { valid: true };
}

export function validateClientId(clientId) {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  
  if (!clientId || typeof clientId !== 'string') {
    return { valid: false, error: 'Invalid client ID format' };
  }

  if (!uuidRegex.test(clientId)) {
    return { valid: false, error: 'Client ID must be a valid UUID' };
  }

  return { valid: true };
}

export function validateEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

export function validateClientInput(data) {
  const errors = {};

  if (!data.name || typeof data.name !== 'string' || data.name.length > 255) {
    errors.name = 'Name must be 1-255 characters';
  }

  if (!data.email || !validateEmail(data.email)) {
    errors.email = 'Invalid email format';
  }

  if (data.businessType && !['maintenance', 'billing', 'inquiry', 'complaint', 'other'].includes(data.businessType)) {
    errors.businessType = 'Invalid business type';
  }

  if (data.config && typeof data.config !== 'object') {
    errors.config = 'Config must be an object';
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}

// ============= TOKEN ESTIMATION (prevent OpenAI abuse) =============
export function estimateTokenCount(text) {
  // Rough estimate: 1 token ≈ 4 characters
  // More accurate: 1 token ≈ 0.75 words
  return Math.ceil(text.length / 4);
}

export function validateTokenBudget(messages) {
  const MAX_TOKENS = parseInt(process.env.MAX_TOKENS_PER_REQUEST) || 2500;
  let totalTokens = 0;

  messages.forEach((msg) => {
    totalTokens += estimateTokenCount(msg.content || '');
  });

  // Add buffer for system prompts
  totalTokens += 200;

  if (totalTokens > MAX_TOKENS) {
    return {
      valid: false,
      error: `Request exceeds token budget (${totalTokens}/${MAX_TOKENS})`,
      estimatedTokens: totalTokens,
    };
  }

  return {
    valid: true,
    estimatedTokens: totalTokens,
  };
}

// ============= CORS CONFIGURATION =============
export function getCORSOptions() {
  const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:5173').split(',').map(o => o.trim());

  return {
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps, Curl requests)
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('CORS policy: Origin not allowed'));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    maxAge: 3600,
  };
}

// ============= SECURITY HEADERS =============
export function securityHeaders(req, res, next) {
  const isProd = process.env.NODE_ENV === 'production';

  // Enforce HTTPS in production
  if (isProd && req.header('x-forwarded-proto') !== 'https') {
    return res.redirect(`https://${req.header('host')}${req.url}`);
  }

  // Security headers
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'");

  next();
}

// ============= AUDIT LOGGING =============
export function auditLog(req, res, action, details = {}) {
  const logEntry = {
    timestamp: new Date().toISOString(),
    action,
    userId: req.userId || 'anonymous',
    ip: req.ip || req.connection.remoteAddress,
    method: req.method,
    path: req.path,
    status: res.statusCode,
    details,
  };

  // Log security-relevant events
  if (['admin_login', 'admin_action', 'auth_failure', 'rate_limit', 'invalid_input', 'openai_call'].includes(action)) {
    console.log(`[AUDIT] ${JSON.stringify(logEntry)}`);
  }

  return logEntry;
}

// ============= RESPONSE SANITIZATION =============
export function sanitizeError(error) {
  // Never expose internal error details in production
  if (process.env.NODE_ENV === 'production') {
    // Log the real error
    console.error('[ERROR]', error);
    // Return generic message
    return {
      error: 'An error occurred processing your request',
      code: 'INTERNAL_ERROR',
      requestId: crypto.randomUUID(),
    };
  }
  // In development, can show more details for debugging
  return {
    error: error.message,
    code: error.code || 'ERROR',
  };
}
