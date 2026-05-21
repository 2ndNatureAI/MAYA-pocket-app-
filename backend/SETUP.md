# MAYA Backend Setup Guide (Secure)

## Prerequisites

- Node.js 16+
- Supabase account (free tier OK)
- OpenAI API key (optional, defaults to fallback mode)

## 1. Generate Security Secrets

### Generate Admin Password Hash

```bash
cd backend
npm install bcryptjs
node -e "console.log(require('bcryptjs').hashSync('your-secure-password-here', 10))"
```

Copy the output (starts with `$2a$`) and set as `ADMIN_PASSWORD_HASH` in `.env`

### Generate JWT Secret

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Copy the output and set as `JWT_SECRET` in `.env`

## 2. Setup Supabase

### Create Tables

1. Go to your Supabase project → SQL Editor
2. Paste the contents of `backend/supabase-schema.sql`
3. Run the query

### Enable RLS with Policies

```sql
-- Clients: Users can only view themselves, admins can view all
CREATE POLICY "Users can view own client"
  ON clients FOR SELECT
  USING (auth.uid()::text = id);

CREATE POLICY "Admins can view all clients"
  ON clients FOR SELECT
  USING (current_setting('request.jwt.claims')::jsonb ->> 'role' = 'admin');

CREATE POLICY "Admins can create clients"
  ON clients FOR INSERT
  WITH CHECK (current_setting('request.jwt.claims')::jsonb ->> 'role' = 'admin');

-- Conversations: Users can only view their own
CREATE POLICY "Users can view own conversations"
  ON conversations FOR SELECT
  USING (
    client_id IN (
      SELECT id FROM clients 
      WHERE auth.uid()::text = id
    )
  );

CREATE POLICY "Admins can view all conversations"
  ON conversations FOR SELECT
  USING (current_setting('request.jwt.claims')::jsonb ->> 'role' = 'admin');

-- Messages: Users can view their own conversation's messages
CREATE POLICY "Users can view own messages"
  ON messages FOR SELECT
  USING (
    conversation_id IN (
      SELECT id FROM conversations 
      WHERE client_id IN (
        SELECT id FROM clients 
        WHERE auth.uid()::text = id
      )
    )
  );

CREATE POLICY "Admins can view all messages"
  ON messages FOR SELECT
  USING (current_setting('request.jwt.claims')::jsonb ->> 'role' = 'admin');

-- Classifications: Admins only
CREATE POLICY "Admins can view classifications"
  ON classifications FOR SELECT
  USING (current_setting('request.jwt.claims')::jsonb ->> 'role' = 'admin');

-- Review Status: Admins only
CREATE POLICY "Admins can view reviews"
  ON review_status FOR SELECT
  USING (current_setting('request.jwt.claims')::jsonb ->> 'role' = 'admin');

CREATE POLICY "Admins can update reviews"
  ON review_status FOR UPDATE
  USING (current_setting('request.jwt.claims')::jsonb ->> 'role' = 'admin');

-- Logs: Admins only
CREATE POLICY "Admins can view logs"
  ON logs FOR SELECT
  USING (current_setting('request.jwt.claims')::jsonb ->> 'role' = 'admin');
```

## 3. Create .env File

```bash
cp .env.example .env
```

Fill in the values:

```
# From Supabase dashboard
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# From OpenAI dashboard (optional)
OPENAI_API_KEY=sk-...

# Generated above
ADMIN_PASSWORD_HASH=$2a$10$...
JWT_SECRET=abc123def456...

# Keep defaults or customize
ADMIN_USERNAME=admin
NODE_ENV=development
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3000
```

## 4. Install & Run

```bash
npm install
npm run check      # Syntax check
npm run dev        # Development mode with auto-reload
```

Server will start on `http://localhost:3000`

## 5. Test Health Check

```bash
curl http://localhost:3000/api/health
```

Expected response:

```json
{
  "status": "ok",
  "environment": "development",
  "openai": { "status": "ok" }
}
```

## 6. Test Admin Login

```bash
curl -X POST http://localhost:3000/api/admin/login \
  -H "Content-Type: application/json" \
  -d '{"username": "admin", "password": "your-password-here"}'
```

Response will include a JWT token. Use it for subsequent requests:

```bash
curl http://localhost:3000/api/reviews \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

## Security Checklist

- ✅ Admin password is bcrypt hashed
- ✅ JWT secret is 32+ random characters
- ✅ Supabase RLS policies are enforced
- ✅ OpenAI calls are rate-limited and validated
- ✅ Input validation on all endpoints
- ✅ CORS restricted to known origins
- ✅ Error messages don't leak details
- ✅ Rate limiting on login endpoint
- ✅ Token expiry is reasonable (2h user, 1h admin)
- ✅ Service role key only used for admin operations

## Troubleshooting

### "JWT_SECRET must be at least 32 characters"

Generate a new secret:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### "ADMIN_PASSWORD_HASH not configured"

Generate and add to `.env`:

```bash
node -e "console.log(require('bcryptjs').hashSync('password', 10))"
```

### OpenAI API Key Invalid

Either:

1. Set a valid `OPENAI_API_KEY` in `.env`
2. Leave it blank to use fallback classification (regex-based)

### Supabase Connection Error

Verify:

- `SUPABASE_URL` matches your project URL
- `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are correct
- Check Supabase dashboard for API keys

## Deployment to Vercel

1. Install Vercel CLI: `npm i -g vercel`
2. Deploy: `vercel`
3. Set environment variables in Vercel dashboard
4. Update `ALLOWED_ORIGINS` to include your Vercel domain

## Next Steps

- [ ] Set up frontend in `frontend/` directory
- [ ] Configure Supabase RLS policies (see above)
- [ ] Test all API endpoints
- [ ] Set up monitoring/alerting
- [ ] Enable database backups
