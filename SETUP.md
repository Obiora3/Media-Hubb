# MediaHub — Setup Guide

## Project structure

```
mediahubb/
├── package.json                      ← npm workspaces root
├── vercel.json                       ← Vercel deployment config
├── packages/
│   ├── supabase/
│   │   ├── config.toml               ← Supabase CLI config (project_id set)
│   │   ├── migrations/
│   │   │   ├── 001_initial_schema.sql
│   │   │   └── 002_rls_policies.sql
│   │   ├── seed/
│   │   │   └── seed.sql
│   │   └── functions/
│   │       └── ai-chat/index.ts      ← Anthropic proxy (Deno Edge Function)
│   └── web/
│       ├── public/
│       │   ├── favicon.svg
│       │   └── icons/icon.svg        ← PWA icon
│       ├── src/
│       │   ├── vite-env.d.ts
│       │   ├── types/index.ts
│       │   ├── lib/supabase.ts
│       │   ├── hooks/
│       │   │   ├── useAuth.ts
│       │   │   ├── useSupabaseTable.ts
│       │   │   └── useToast.ts
│       │   ├── components/auth/
│       │   │   └── AuthScreen.tsx
│       │   ├── index.css
│       │   └── App.tsx               ← Supabase-powered, TypeScript
│       ├── .env.local                ← your credentials (gitignored)
│       ├── .env.local.example
│       ├── tsconfig.json
│       └── vite.config.ts            ← includes vite-plugin-pwa (Workbox)
└── SETUP.md
```

---

## Quick start (first time)

### 1. Install dependencies

```bash
npm install
```

### 2. Run the dev server

```bash
npm run dev
```

Open http://localhost:5173

### 3. Create your account

1. Click **Create account** on the sign-in screen
2. Sign up with your email + password

### 4. Promote yourself to admin

In the **Supabase SQL Editor** (replace the UUID with yours from Auth → Users):

```sql
update profiles
set
  workspace_id = '00000000-0000-0000-0000-000000000001',
  name         = 'Your Name',
  role         = 'admin',
  initials     = 'YN',
  color        = '#534AB7',
  permissions  = ARRAY[
    'dashboard','mpo','clients','finance','budgets','reports',
    'calendar','analytics','reminders','users','audit',
    'invoice-wf','settings','dataviz','feed','production'
  ]
where id = 'YOUR-AUTH-USER-UUID';
```

---

## Supabase migrations (run once)

In the Supabase dashboard → **SQL Editor**, run these files in order:

1. `packages/supabase/migrations/001_initial_schema.sql`
2. `packages/supabase/migrations/002_rls_policies.sql`
3. `packages/supabase/seed/seed.sql`

---

## Environment variables

File: `packages/web/.env.local`

```
VITE_SUPABASE_URL=https://zrzrzjihcukbhdqxkqfd.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_...
```

---

## Deploy to Vercel

```bash
# Install Vercel CLI once
npm i -g vercel

# Deploy (uses vercel.json at repo root)
vercel

# Set environment variables in Vercel dashboard or via CLI:
vercel env add VITE_SUPABASE_URL
vercel env add VITE_SUPABASE_ANON_KEY
```

The `vercel.json` at the repo root handles:
- Build command: `npm run build --workspace=packages/web`
- Output dir: `packages/web/dist`
- SPA routing: all paths → `index.html`
- Asset caching headers

---

## Deploy the AI Edge Function (optional)

```bash
cd packages/supabase

# Authenticate
npx supabase login

# Deploy function
npm run functions:deploy

# Set your Anthropic API key
npx supabase secrets set ANTHROPIC_API_KEY=sk-ant-YOUR-KEY --project-ref zrzrzjihcukbhdqxkqfd
```

---

## PWA

The app installs as a PWA on desktop and mobile. Built with Workbox via `vite-plugin-pwa`:
- Precaches all static assets
- NetworkFirst strategy for Supabase API calls (offline reads work)
- Install prompt shown automatically when eligible

---

## Security checklist

- [x] RLS enabled on all tables (migration 002)
- [x] Anthropic API key NOT in `.env.local` — only in Edge Function secrets
- [x] `VITE_SUPABASE_ANON_KEY` is safe to expose (row-level restrictions apply)
- [ ] In production: enable email confirmations in Supabase Auth settings
- [ ] In production: set allowed redirect URLs in Auth → URL Configuration
