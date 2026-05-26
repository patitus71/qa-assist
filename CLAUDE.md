# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Start dev server at localhost:3000
npm run build        # Production build
npm run lint         # ESLint via Next.js
npm run pages:build  # Build for Cloudflare Pages (uses @cloudflare/next-on-pages)
npm run preview      # Local Cloudflare Pages preview (pages:build + wrangler)

npx prisma migrate dev --name <name>   # Create and apply a migration
npx prisma db push                     # Push schema without migration file
npx prisma studio                      # Open Prisma Studio GUI
```

No test framework is configured.

## Environment Setup

Copy `.env.example` to `.env.local`. Required:
- `ANTHROPIC_API_KEY` — all AI features fail without it
- `DATABASE_URL` — SQLite path, e.g. `file:./prisma/dev.db`
- `NEXTAUTH_SECRET` — NextAuth JWT signing key
- `NEXTAUTH_URL` — e.g. `http://localhost:3000`

Optional:
- `JIRA_BASE_URL`, `JIRA_EMAIL`, `JIRA_API_TOKEN`, `JIRA_BOARD_ID`, `JIRA_TC_ISSUE_TYPE`
- `DEV_API_URL` / `DEV_API_TOKEN`, `STAGING_*`, `UAT_*` — for the API run page
- `ZEPHYR_TYPE`, `ZEPHYR_TOKEN` — Zephyr Scale or Squad integration

## Architecture

**Next.js 14 App Router** with **Prisma + SQLite** for persistence and **NextAuth v4** for auth.

### Auth & Roles

Authentication is credentials-based (email + password via bcryptjs). JWT strategy with **30-minute inactivity timeout** (`maxAge: 1800, updateAge: 0` — every request resets the clock).

Four roles enforced at middleware and API layer:
- `ADMIN` — full access including `/admin`, all user management, last-admin guard prevents removal
- `MANAGER` — access to `/admin`, manage non-ADMIN users, assign squads; cannot touch ADMIN role
- `QA_LEAD` — dashboard only, squad-scoped reports and email config
- `QA_ENGINEER` — session pages, timesheet auto-tracking

`lib/auth.ts` — NextAuth config with role in JWT. `middleware.ts` — guards `/admin` to ADMIN+MANAGER; all other routes require a valid token.

Post-login redirects: ADMIN/MANAGER → `/admin`, others → `/dashboard`.

### Database (`prisma/schema.prisma`)

SQLite in dev/prod (Vercel copies to `/tmp` at runtime to bypass read-only FS). Models:
- `User` — id, name, email, passwordHash, role, active, squadId
- `Squad` — id, name; one-to-many with User
- `AuditLog` — userId, action, details; written on every admin mutation
- `Timesheet` — userId, ticketKey, startTime, endTime, duration (minutes)
- `SavedSession` — userId, ticketKey, sessionData (JSON string), resumed flag
- `EmailConfig` — userId (unique), squadId, autoSend, sendTime, recipients (comma-separated string — SQLite has no array type)

`lib/prisma.ts` — singleton Prisma client.

### TC Session State (`lib/session-context.tsx`)

`SessionProvider` wraps the entire app (`app/layout.tsx`). Client-side only state:
```
requirement, jiraKey, images, standardTCs[], e2eTCs[], apiTCs[]
```
Every TC mutation calls `saveSession()` from `lib/autosave.ts` (localStorage). Session layout (`app/session/layout.tsx`) adds a `SessionExpiryGuard` that auto-saves to DB every 5 min and shows an expiry modal when NextAuth session lapses.

### User Flow

Landing page (`app/page.tsx`) — three entry points:
1. **Load from Jira** → `/api/jira/issue` → `/session/generate`
2. **Paste requirement** + up to 5 images (auto-resized 800×600 JPEG) → `/session/generate`
3. **Import Excel** → parse `.xlsx`/`.csv` → `/session/standard` or `/session/e2e`

Session sub-pages (all under `/session/*`, rendered with `<Sidebar>`):
- `/session/generate` — AI TC generation
- `/session/standard` → `/session/standard/run` — standard TC table + execution
- `/session/e2e` → `/session/e2e/run`
- `/session/api` → `/session/api/run` — live API runner
- `/session/export` — XLSX / PDF / Postman
- `/session/report` — AI-generated report
- `/session/robot` — Robot Framework export
- `/session/timesheet` — timesheet log for current user

### AI Routes (`app/api/generate/`, etc.)

All AI routes: `export const runtime = 'nodejs'`, Zod validation, then `classify()` check.

`lib/classifier.ts` — PII scanner (Thai IDs, account numbers, Bearer tokens, credit cards, internal email domains). Returns `{ safe: false }` → HTTP 400. **Hard block, do not bypass.**

Primary generation (`app/api/generate/route.ts`): `claude-haiku-4-5-20251001` with `cache_control: { type: 'ephemeral' }` on the system prompt. For `type: 'all'`, three parallel `callAI()` calls via `Promise.allSettled`.

### Admin Panel (`app/admin/page.tsx`)

Tabs: Users | Squads | Audit log | Settings (ADMIN only).
- **Users**: role dropdown (MANAGER sees ADMIN option grayed), squad assignment, active toggle, last-admin guard
- **Squads**: add/rename (inline edit)/delete (blocked if members exist)
- **Audit log**: last 200 entries from `AuditLog` table

API routes under `/api/admin/`: `users/`, `users/[id]/`, `squads/`, `squads/[id]/`, `audit/` — all check ADMIN or MANAGER role server-side.

### Timesheet (`app/components/Sidebar.tsx` + `/api/timesheet/`)

QA_ENGINEER only. Timer auto-starts when entering `/session/*` with a `jiraKey`, auto-stops on leaving. Displayed in Sidebar below user chip. DB backed via `/api/timesheet` (GET/POST/PATCH).

### Email Config (`/api/email-config/`)

MANAGER and QA_LEAD. DB-backed via `EmailConfig` model. `recipients` stored as comma-separated string (SQLite compat). `autoSend` toggle + `sendTime` + multi-recipient input in dashboard.

### Export Utilities (`lib/`)

| File | Output |
|---|---|
| `export-xlsx.ts` | XLSX via `xlsx-js-style` |
| `export-pdf.ts` | PDF via `jspdf` + `jspdf-autotable` |
| `export-postman.ts` | Postman collection JSON |
| `export-robot.ts` / `export-robot-workflow.ts` / `export-robot-keywords.ts` | Robot Framework `.robot` |
| `import-excel.ts` | Parse Excel on import |
| `response-differ.ts` | Diff two API responses |

### Design System

Tailwind custom theme (`tailwind.config.ts`): `ink-*` scale (neutrals), `accent` (#1A56DB), `success` (#0B7A51), `danger`, `warn`. Dark mode via `class` strategy.

Utility classes in `app/globals.css` — always use these instead of raw Tailwind:
- `.card` — white card with border, dark-mode aware
- `.btn-primary` / `.btn-ghost`
- `.badge-status-{pass|fail|skip|blocked|pending}`
- `.badge-priority-{high|med|low}`
- `.tc-id` — monospace TC ID chip

Timer/timesheet numbers: use `font-mono` (DM Mono).

### Core Types (`lib/types.ts`)

Discriminated union `TC = StandardTC | E2ETC | APITC`. ID conventions: `TC-01`, `TC-E2E-01`, `ATC-01`. Status: `Pending | Pass | Fail | Skip | Blocked`. Priority: `High | Med | Low`.

### Deployment

Two targets simultaneously:
- **Vercel** — primary; SQLite DB is copied to `/tmp` on cold start
- **Cloudflare Pages** — via `@cloudflare/next-on-pages`; `wrangler.toml` sets `nodejs_compat`

All API routes must keep `export const runtime = 'nodejs'`.
`*.db` files are gitignored — never commit the SQLite database.
