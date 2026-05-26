# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Start dev server at localhost:3000
npm run build        # Production build
npm run lint         # ESLint via Next.js
npm run pages:build  # Build for Cloudflare Pages (uses @cloudflare/next-on-pages)
npm run preview      # Local Cloudflare Pages preview (pages:build + wrangler)
```

No test framework is configured.

## Environment Setup

Copy `.env.example` to `.env.local`. Required:
- `ANTHROPIC_API_KEY` — all AI features fail without it

Optional (app works without them):
- `JIRA_BASE_URL`, `JIRA_EMAIL`, `JIRA_API_TOKEN`, `JIRA_BOARD_ID`, `JIRA_TC_ISSUE_TYPE`
- `DEV_API_URL` / `DEV_API_TOKEN`, `STAGING_*`, `UAT_*` — for the API run page
- `ZEPHYR_TYPE`, `ZEPHYR_TOKEN` — Zephyr Scale or Squad integration

## Architecture

**Next.js 14 App Router**. All session state lives in client-side React context — there is no server-side session or database.

### User flow

Landing page (`app/page.tsx`) offers three entry points:
1. **Load from Jira** — fetches issue via `/api/jira/issue`, sets requirement, navigates to `/session/generate`
2. **Paste requirement** — text + up to 5 images (auto-resized to 800×600 JPEG), navigates to `/session/generate`
3. **Import Excel** — parses `.xlsx`/`.csv`, loads TCs directly into `/session/standard` or `/session/e2e`

After generation, users navigate between session sub-pages via the `<Sidebar>`:
- `/session/generate` — trigger AI generation
- `/session/standard` → `/session/standard/run` — Standard TC table + execution
- `/session/e2e` → `/session/e2e/run` — E2E TC table + execution
- `/session/api` → `/session/api/run` — API TC table + live run
- `/session/export` — XLSX / PDF / Postman export
- `/session/report` — AI-generated test report
- `/session/robot` — Robot Framework export

### Session state (`lib/session-context.tsx`)

`SessionProvider` wraps the entire app (set in `app/layout.tsx`). State held:
```
requirement, jiraKey, images, standardTCs[], e2eTCs[], apiTCs[]
```
Every setter that mutates TCs calls `saveSession()` (localStorage autosave). The landing page checks for a saved session on mount and shows a resume banner.

### Core types (`lib/types.ts`)

Three TC variants share a discriminated union `TC = StandardTC | E2ETC | APITC`. ID conventions:
- Standard: `TC-01`, `TC-02`, …
- E2E: `TC-E2E-01`, …
- API: `ATC-01`, …

Status: `Pending | Pass | Fail | Skip | Blocked`  
Priority: `High | Med | Low`

### AI routes (`app/api/`)

All routes use `export const runtime = 'nodejs'`. The primary generation route is `app/api/generate/route.ts`:
- Uses `claude-haiku-4-5-20251001` with prompt caching (`cache_control: { type: 'ephemeral' }` on the system prompt)
- Validates input with Zod, then runs `classify()` from `lib/classifier.ts` before calling the API
- For `type: 'all'`, fires three parallel `callAI()` calls with `Promise.allSettled`

Other AI routes follow the same shape: Zod input, classify, call Anthropic, return JSON.

**`lib/classifier.ts`** — scans requirement text for PII patterns (account numbers, Thai national IDs, Bearer tokens, API keys, credit cards, internal email domains). Returns `{ safe: false }` when triggered, which causes the API route to return HTTP 400. This is a hard block — do not bypass it.

### Export utilities (`lib/`)

| File | Output |
|---|---|
| `export-xlsx.ts` | XLSX with styled columns via `xlsx-js-style` |
| `export-pdf.ts` | PDF via `jspdf` + `jspdf-autotable` |
| `export-postman.ts` | Postman collection JSON for API TCs |
| `export-robot.ts` / `export-robot-workflow.ts` / `export-robot-keywords.ts` | Robot Framework `.robot` files |
| `import-excel.ts` | Parse Excel on import |
| `response-differ.ts` | Diff two API responses |

### Design system

Custom Tailwind theme in `tailwind.config.ts` — colors use `ink-*` scale (neutrals), `accent` (blue #1A56DB), `success/danger/warn`. Dark mode via `class` strategy.

Reusable utility classes defined in `app/globals.css`:
- `.card` — white card with border, dark-mode aware
- `.btn-primary` / `.btn-ghost` — action buttons
- `.badge-status-{pass|fail|skip|blocked|pending}` — status badges
- `.badge-priority-{high|med|low}` — priority badges
- `.tc-id` — monospace TC ID chip

Always use these utility classes rather than raw Tailwind for UI consistency.

### Deployment targets

The project targets two platforms simultaneously:
- **Vercel** — primary (`.vercel/project.json` present, `next start` works normally)
- **Cloudflare Pages** — via `@cloudflare/next-on-pages`; `wrangler.toml` sets `nodejs_compat` and points to `.vercel/output/static`

API routes must keep `export const runtime = 'nodejs'` to work on Cloudflare Pages with `nodejs_compat`.
