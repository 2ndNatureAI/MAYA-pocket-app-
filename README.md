# MAYA Pocket Desk

**Production-ready secure business assistant** with Supabase backend and OpenAI integration.

- ✅ **Fully Secure** — JWT auth, bcrypt passwords, RLS policies, input validation
- ✅ **One-Click Deploy** — Vercel + Supabase (no code changes needed)
- ✅ **Cost-Safe** — OpenAI rate limiting, token budgets, fallback mode
- ✅ **Admin Dashboard** — Human review queue, logs export, client management
- ✅ **Mobile Ready** — Responsive design works on phone and desktop

## Quick Deploy (5 minutes)

See [**DEPLOY.md**](./DEPLOY.md) for complete setup instructions:

1. **Supabase** — Create project + import schema
2. **Generate Secrets** — Admin password hash + JWT secret
3. **Vercel** — Connect repo + set environment variables
4. **Done** — Your app is live!

## Features

✨ Real-time chat with MAYA assistant  
🏷️ Automatic intent classification  
👤 Human review workflow for flagged messages  
🌙 After-hours automatic responses  
⏱️ Rate limiting (100 requests/hour)  
📊 Logs export (CSV/JSON)  
🔐 Admin panel with login  
📱 Mobile-responsive UI  
💰 OpenAI cost tracking  
🛡️ Production security hardened  

## Files

```
├── DEPLOY.md                 # ← Start here for setup
├── backend/
│   ├── server-secure.js      # Express API
│   ├── security.js           # Auth & validation
│   ├── openai-safe.js        # Safe OpenAI wrapper
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── App.jsx
│   │   ├── api.js
│   │   └── components/
│   └── package.json
└── vercel.json               # Deployment config
```

## Architecture

```
Browser                      Vercel                      Supabase
┌──────────┐               ┌──────────┐                ┌──────────┐
│ Frontend │ ──api call──> │ Backend  │ ───sql───────> │ Database │
│ (React)  │ <──response── │ (Node)   │ <──────────── │ (PG)     │
└──────────┘               └──────────┘                └──────────┘
                                ↓
                            ┌──────────┐
                            │ OpenAI   │
                            │ API      │
                            └──────────┘
```

## Environment Variables

Set in Vercel:

```
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
OPENAI_API_KEY=sk-... (optional)
ADMIN_USERNAME=admin
ADMIN_PASSWORD_HASH=$2a$10$...
JWT_SECRET=abc123... (32+ chars)
NODE_ENV=production
ALLOWED_ORIGINS=https://your-app.vercel.app
```

## Security

🔐 JWT authentication (2h expiry)  
🔒 Bcrypt password hashing  
🛡️ Supabase Row Level Security  
⏱️ Rate limiting (5 attempts/login, 100 req/hour)  
📝 Audit logging on all actions  
💰 OpenAI cost controls + token limits  
🚫 Input validation on all endpoints  
❌ Error messages don't leak details  

## Support

See [**DEPLOY.md**](./DEPLOY.md) for troubleshooting guide.

**Built with ❤️ for MAYA**
