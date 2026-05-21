# MAYA Pocket Desk — Production MVP
## One-Click Deploy to Vercel + Supabase

Fully functional business assistant with secure backend, human review, and enterprise features.

**Status:** 🟢 Ready for production deployment

---

## 📋 Table of Contents

1. [Quick Start (5 minutes)](#quick-start)
2. [Supabase Setup](#supabase-setup)
3. [Vercel Deployment](#vercel-deployment)
4. [Configuration](#configuration)
5. [Testing](#testing)
6. [Troubleshooting](#troubleshooting)

---

## Quick Start

### Prerequisites

- Supabase account (free at [supabase.com](https://supabase.com))
- Vercel account (free at [vercel.com](https://vercel.com))
- OpenAI API key (optional, defaults to fallback mode)
- GitHub account (to fork this repo)

### Step 1: Supabase Setup (10 min)

#### 1.1 Create Supabase Project

1. Go to [supabase.com](https://supabase.com) → **New Project**
2. Choose region closest to you
3. Wait for project to initialize

#### 1.2 Create Database Schema

1. In Supabase dashboard, go to **SQL Editor**
2. Click **New Query**
3. **Copy and paste EVERYTHING below** into the editor:

```sql
-- MAYA MVP Database Schema
-- Paste this entire block into Supabase SQL Editor and run

-- Clients table
CREATE TABLE IF NOT EXISTS clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  business_type TEXT,
  config JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Conversations table
CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Messages table
CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Classifications table
CREATE TABLE IF NOT EXISTS classifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  intent TEXT NOT NULL,
  confidence DECIMAL(3, 2),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Review status table
CREATE TABLE IF NOT EXISTS review_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected')),
  reason TEXT,
  notes TEXT,
  reviewed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Logs table
CREATE TABLE IF NOT EXISTS logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES conversations(id),
  action TEXT NOT NULL,
  intent TEXT,
  tokens_used INT,
  status TEXT,
  requires_review BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_conversations_client_id ON conversations(client_id);
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_classifications_message_id ON classifications(message_id);
CREATE INDEX IF NOT EXISTS idx_review_status_conversation_id ON review_status(conversation_id);
CREATE INDEX IF NOT EXISTS idx_review_status_status ON review_status(status);
CREATE INDEX IF NOT EXISTS idx_logs_client_id ON logs(client_id);
CREATE INDEX IF NOT EXISTS idx_logs_created_at ON logs(created_at);

-- Enable Row Level Security
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE classifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE review_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies for clients
CREATE POLICY "Users can view own client" ON clients
  FOR SELECT USING (auth.uid()::text = id);

CREATE POLICY "Admins can view all clients" ON clients
  FOR SELECT USING (
    current_setting('request.jwt.claims')::jsonb ->> 'role' = 'admin'
  );

CREATE POLICY "Admins can create clients" ON clients
  FOR INSERT WITH CHECK (
    current_setting('request.jwt.claims')::jsonb ->> 'role' = 'admin'
  );

-- RLS Policies for conversations
CREATE POLICY "Users can view own conversations" ON conversations
  FOR SELECT USING (
    client_id IN (
      SELECT id FROM clients WHERE auth.uid()::text = id
    )
  );

CREATE POLICY "Admins can view all conversations" ON conversations
  FOR SELECT USING (
    current_setting('request.jwt.claims')::jsonb ->> 'role' = 'admin'
  );

-- RLS Policies for messages
CREATE POLICY "Users can view own messages" ON messages
  FOR SELECT USING (
    conversation_id IN (
      SELECT id FROM conversations WHERE client_id IN (
        SELECT id FROM clients WHERE auth.uid()::text = id
      )
    )
  );

CREATE POLICY "Admins can view all messages" ON messages
  FOR SELECT USING (
    current_setting('request.jwt.claims')::jsonb ->> 'role' = 'admin'
  );

-- RLS Policies for classifications
CREATE POLICY "Admins can view classifications" ON classifications
  FOR SELECT USING (
    current_setting('request.jwt.claims')::jsonb ->> 'role' = 'admin'
  );

-- RLS Policies for review_status
CREATE POLICY "Admins can view reviews" ON review_status
  FOR SELECT USING (
    current_setting('request.jwt.claims')::jsonb ->> 'role' = 'admin'
  );

CREATE POLICY "Admins can update reviews" ON review_status
  FOR UPDATE USING (
    current_setting('request.jwt.claims')::jsonb ->> 'role' = 'admin'
  );

-- RLS Policies for logs
CREATE POLICY "Admins can view logs" ON logs
  FOR SELECT USING (
    current_setting('request.jwt.claims')::jsonb ->> 'role' = 'admin'
  );
```

4. Click **Run** (play button)
5. Wait for success message

#### 1.3 Get API Keys

1. Go to **Settings** (bottom left) → **API**
2. Copy these and save in a text file:
   - **Project URL** (e.g., `https://xxxxx.supabase.co`)
   - **anon public key** (under "Project API keys")
   - **service_role key** (under "Project API keys")

---

### Step 2: Generate Security Secrets (2 min)

Open your terminal and run these commands:

#### Generate Admin Password Hash

```bash
node -e "console.log(require('bcryptjs').hashSync('your-secure-password', 10))"
```

**Replace `your-secure-password` with something strong** (e.g., `MySecure!Pass123`)

Copy the output (starts with `$2a$`)

#### Generate JWT Secret

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Copy the output (32-char hex string)

---

### Step 3: Deploy to Vercel (3 min)

#### 3.1 Fork This Repository

1. Go to this repo on GitHub → **Fork**
2. Name it `maya-pocket-app` (or whatever you prefer)
3. Clone to your machine:

```bash
git clone https://github.com/YOUR-USERNAME/maya-pocket-app.git
cd maya-pocket-app
```

#### 3.2 Deploy to Vercel

1. Go to [vercel.com](https://vercel.com) → **New Project**
2. Select your forked repository
3. Click **Import**
4. In **Environment Variables**, add:

```
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
OPENAI_API_KEY=sk-... (optional, leave blank if you don't have one)
ADMIN_USERNAME=admin
ADMIN_PASSWORD_HASH=$2a$10$... (from Step 2)
JWT_SECRET=abc123... (from Step 2)
ALLOWED_ORIGINS=https://your-vercel-app.vercel.app
NODE_ENV=production
```

5. Click **Deploy**
6. Wait for build to complete (2-3 min)
7. Once live, visit your app URL

#### 3.3 Update CORS Origins

After deployment, you'll have a Vercel URL. Go back to Vercel project settings and update:

```
ALLOWED_ORIGINS=https://your-vercel-app.vercel.app,http://localhost:5173
```

---

## Configuration

### Essential Environment Variables

All these must be set in Vercel before your app works:

| Variable | Value | Required |
|----------|-------|----------|
| `SUPABASE_URL` | From Supabase Settings > API | ✅ Yes |
| `SUPABASE_ANON_KEY` | From Supabase Settings > API | ✅ Yes |
| `SUPABASE_SERVICE_ROLE_KEY` | From Supabase Settings > API | ✅ Yes |
| `ADMIN_USERNAME` | `admin` (or custom) | ✅ Yes |
| `ADMIN_PASSWORD_HASH` | Bcrypt hash from Step 2 | ✅ Yes |
| `JWT_SECRET` | Random 32-char secret from Step 2 | ✅ Yes |
| `OPENAI_API_KEY` | From OpenAI dashboard | ⏸️ Optional |
| `NODE_ENV` | `production` (on Vercel) | ✅ Yes |
| `ALLOWED_ORIGINS` | Your Vercel domain | ✅ Yes |

### Optional Configuration

```
OPENAI_MODEL=gpt-4-turbo
OPENAI_MAX_TOKENS=500
AFTER_HOURS_START=18
AFTER_HOURS_END=8
CHAT_RATE_LIMIT_REQUESTS_PER_HOUR=100
MAX_MESSAGE_LENGTH=2000
```

---

## Testing

### 1. Test Backend Health

```bash
curl https://your-app.vercel.app/api/health
```

Should return:

```json
{
  "status": "ok",
  "environment": "production",
  "openai": { "status": "ok" }
}
```

### 2. Test Admin Login

```bash
curl -X POST https://your-app.vercel.app/api/admin/login \
  -H "Content-Type: application/json" \
  -d '{"username": "admin", "password": "your-secure-password"}'
```

Should return a JWT token:

```json
{
  "token": "eyJ0eXAiOiJKV1QiLCJhbGc...",
  "expiresIn": "1h"
}
```

### 3. Test in Browser

1. Visit `https://your-app.vercel.app`
2. You should see the MAYA Pocket Desk interface
3. Click the ⚙️ gear icon (top right) to access admin panel
4. Login with:
   - Username: `admin`
   - Password: (the one you used in Step 2)
5. You should see the admin dashboard

---

## Troubleshooting

### "Connection refused" or "Cannot reach Supabase"

**Check:**
- Verify `SUPABASE_URL` and `SUPABASE_ANON_KEY` are correct
- Go to Supabase Settings > API and copy again
- Ensure Supabase project is active

### "Invalid token" when logging in

**Causes:**
- `ADMIN_PASSWORD_HASH` is incorrect
- Password doesn't match the hash

**Fix:**
Regenerate the hash:

```bash
node -e "console.log(require('bcryptjs').hashSync('new-password', 10))"
```

Update `ADMIN_PASSWORD_HASH` in Vercel environment variables.

### "JWT_SECRET must be at least 32 characters"

**Fix:**
Regenerate JWT secret:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Update `JWT_SECRET` in Vercel.

### OpenAI API key not working

**Options:**
1. Leave `OPENAI_API_KEY` blank — app will use regex-based classification (no API costs)
2. Get a key from [OpenAI Platform](https://platform.openai.com/api-keys)
3. Add it to Vercel environment variables

### Chat messages not saving

**Check:**
1. Verify Supabase tables exist (go to SQL Editor → see `public.conversations`, `public.messages`)
2. Check RLS policies are created (SQL Editor → run the policies from Step 1.2)
3. Check Supabase logs for errors (Vercel → "Logs" tab)

---

## API Documentation

### Public Endpoints

#### GET /api/health

Check server and OpenAI status.

```bash
curl https://your-app.vercel.app/api/health
```

### Authenticated Endpoints

All these require `Authorization: Bearer TOKEN` header (get token from `/api/admin/login`)

#### POST /api/admin/login

Login as admin.

```bash
curl -X POST https://your-app.vercel.app/api/admin/login \
  -H "Content-Type: application/json" \
  -d '{"username": "admin", "password": "password"}'
```

Response:

```json
{
  "token": "eyJ0eXAiOiJKV1QiLCJhbGc...",
  "expiresIn": "1h"
}
```

#### POST /api/chat

Send message and get response.

```bash
curl -X POST https://your-app.vercel.app/api/chat \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "clientId": "550e8400-e29b-41d4-a716-446655440000",
    "message": "My sink is leaking"
  }'
```

Response:

```json
{
  "conversationId": "550e8400-e29b-41d4-a716-446655440001",
  "message": "I can help with that...",
  "classification": "maintenance",
  "requiresHumanReview": false,
  "isAfterHours": false
}
```

#### GET /api/reviews

Get pending human reviews (admin only).

```bash
curl https://your-app.vercel.app/api/reviews \
  -H "Authorization: Bearer YOUR_TOKEN"
```

#### PATCH /api/reviews/:id

Approve or reject a review.

```bash
curl -X PATCH https://your-app.vercel.app/api/reviews/550e8400-e29b-41d4-a716-446655440002 \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "status": "approved",
    "notes": "Message looks good"
  }'
```

#### GET /api/logs/export

Export logs (admin only).

```bash
# JSON format
curl https://your-app.vercel.app/api/logs/export?format=json \
  -H "Authorization: Bearer YOUR_TOKEN"

# CSV format
curl https://your-app.vercel.app/api/logs/export?format=csv \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -o logs.csv
```

---

## File Structure

```
maya-pocket-app/
├── backend/
│   ├── server-secure.js          # Main Express server (hardened)
│   ├── security.js               # Auth, validation, rate limiting
│   ├── openai-safe.js            # Safe OpenAI wrapper
│   ├── package.json              # Node dependencies
│   ├── .env.example              # Environment variables template
│   └── SETUP.md                  # Local development guide
├── frontend/
│   ├── src/
│   │   ├── App.jsx               # Main React component
│   │   ├── App.css               # Styling
│   │   ├── api.js                # API client
│   │   ├── supabase.js           # Supabase client
│   │   └── components/
│   │       ├── ChatWidget.jsx    # Chat interface
│   │       └── AdminPanel.jsx    # Admin dashboard
│   ├── vite.config.js            # Vite config
│   ├── package.json              # Dependencies
│   └── index.html                # HTML entry point
├── vercel.json                   # Vercel build config
└── README.md                     # This file
```

---

## Features Included

✅ **Chat Widget** — Real-time conversation with MAYA assistant
✅ **Intent Classification** — Automatic categorization of requests
✅ **Human Review Queue** — Admin approval workflow
✅ **After-Hours Mode** — Automatic responses outside business hours
✅ **Rate Limiting** — 100 requests/hour per user
✅ **Cost Tracking** — OpenAI usage logged
✅ **Logs & Export** — CSV download of all activity
✅ **Admin Panel** — Login, review queue, export dashboard
✅ **Client Configuration** — Per-client settings
✅ **Security** — JWT auth, RLS policies, input validation, bcrypt passwords
✅ **Mobile Responsive** — Works on phone and desktop

---

## Security

- 🔐 JWT-based authentication
- 🔒 Bcrypt password hashing
- 🛡️ Supabase Row Level Security (RLS)
- ⏱️ Rate limiting on all endpoints
- 📝 Comprehensive audit logging
- 💰 OpenAI cost controls and token limits
- 🚫 CORS restricted to known origins
- 🔴 Error messages don't leak details
- 📋 Input validation on all endpoints
- 🔑 No API keys exposed in browser

---

## Deployment Checklist

- [ ] Supabase project created and database schema imported
- [ ] All API keys copied from Supabase
- [ ] Admin password hashed with bcrypt
- [ ] JWT secret generated (32+ chars)
- [ ] GitHub repo forked
- [ ] Vercel project created and linked
- [ ] Environment variables added to Vercel
- [ ] Deployment successful (no build errors)
- [ ] Health check endpoint returning 200
- [ ] Admin login working
- [ ] Chat widget responding
- [ ] Logs exporting

---

## Support & Issues

### Check These First

1. **Vercel Logs** — Go to Vercel dashboard → Deployments → View Logs
2. **Supabase Logs** — Go to Supabase dashboard → Logs
3. **Browser Console** — Press F12 → Console tab for errors
4. **Network Tab** — See API requests and responses

### Common Issues

| Problem | Solution |
|---------|----------|
| "503 Service Unavailable" | Supabase credentials wrong, check Settings > API |
| "Unauthorized" on admin panel | Admin password hash incorrect, regenerate |
| "CORS blocked" | Add your domain to `ALLOWED_ORIGINS` env var |
| "OpenAI rate limited" | Reduce `CHAT_RATE_LIMIT_REQUESTS_PER_HOUR` |
| "Database not found" | Run SQL schema from Step 1.2 again |

---

## Next Steps

1. ✅ Set up and deploy (this document)
2. 📞 Test with real users
3. 📊 Monitor logs and costs
4. 🔄 Iterate based on feedback
5. 🚀 Scale as needed

---

**Built with ❤️ for MAYA**

Last updated: 2025-05-21
