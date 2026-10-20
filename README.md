# FlashForge

Upload your notes and get an AI-generated study guide in seconds.

FlashForge turns a PDF or TXT file into 10 study items, either **identification-style
flashcards** (a clue on the front, a 1–4 word term on the back) or **multiple-choice
questions** with instant feedback and a score at the end. Sign in with Google to save
study guides, then rename, revisit, or delete them from **My Sets**.

Live site: https://flash-forge-one.vercel.app

## Tech stack

| Part | Uses |
|---|---|
| Web app | [Next.js 16](https://nextjs.org) (App Router), React 19, Tailwind CSS 4, TypeScript |
| AI | Google Gemini API: `gemini-3.5-flash`, then `gemini-3.5-flash-lite`, then `gemma-4-26b-a4b-it` as backups |
| Database and sign-in | [Supabase](https://supabase.com) (Postgres with Row Level Security, Google OAuth) |
| PDF text extraction | [unpdf](https://github.com/unjs/unpdf) |
| Hosting | Vercel (`main` deploys to production; other branches get preview deployments) |
| Tests | [Vitest](https://vitest.dev) (`npm test`) plus SQL security checks in `supabase/tests/` |

> **Next.js 16 note:** this version has breaking changes compared to older Next.js
> tutorials. Check `node_modules/next/dist/docs/` before using an API you're unsure of
> (see `AGENTS.md`).

## Getting started

### 1. Requirements

- Node.js **20.9 or newer** (production runs on Node 24)
- Access to the team's Supabase project and a Gemini API key

### 2. Install

```bash
npm install
```

### 3. Environment variables

Create `.env.local` in the project root. It's gitignored; never commit it.

| Variable | Where to find it | Used by |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API → Project URL | Browser and server |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Project Settings → API → `anon` key | Browser (safe to expose; RLS protects the data) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API → `service_role` key | **Server only.** It bypasses RLS, so never use it in client code |
| `GEMINI_API_KEY` | [Google AI Studio](https://aistudio.google.com/apikey) | Server only (`lib/gemini.ts`) |

> **Use a separate Gemini key for local development if you can.** The free tier allows
> only about **20 requests per day** on the main model, and testing with the production
> key uses up the live site's quota (see #45).

### 4. Run it

```bash
npm run dev
```

Open http://localhost:3000.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start the dev server |
| `npm run build` | Production build (also type-checks) |
| `npm start` | Run the production build |
| `npm run lint` | ESLint (3 known errors in `app/page.tsx` and `app/my-sets/page.tsx`, unrelated to recent work) |
| `npm test` | Unit tests with Vitest |

## Project structure

```
app/
  page.tsx              Upload page; also shows a freshly generated guide
  my-sets/page.tsx      Signed-in user's saved sets
  sets/[id]/page.tsx    A saved set: study, rename, delete
  api/generate/         POST: extract text from the file, generate items with AI
  api/save-set/         POST: save a generated guide (signed-in users only)
components/
  StudyViewer.tsx       Flashcard / multiple-choice study UI
lib/
  gemini.ts             AI model chain, prompts, retries, output validation
  roles.ts              getAuthedUser / requireRole for teacher and admin routes
  supabase.ts           Browser Supabase client (anon key)
  supabase-admin.ts     Server-only Supabase client (service-role key)
  auth.ts               useUser hook, Google sign-in/out
supabase/
  migrations/           Database schema and RLS policies (see supabase/README.md)
  tests/                SQL checks that simulate users; always rolled back
  seed-admins.sql       Makes the first admins
docs/
  ARCHITECTURE.md       How the app works
  CHANGELOG.md          What changed and when
```

## Database

All schema changes go in `supabase/migrations/` and are applied with the Supabase CLI.
There is only one Supabase project, the one the live site uses, so applying a migration
changes production right away. See **[supabase/README.md](supabase/README.md)** for the
commands and the log of applied migrations.

## How we work

1. Plan work as issues on the [project board](https://github.com/users/GABRIEL-CSTND/projects/2).
2. Branch from **`dev`**: `feature/<issue#>-short-name` or `fix/short-name`.
3. Merge finished work into `dev` (directly or through a pull request into `dev`).
4. Open a pull request from `dev` to `main` to release. Merging into `main` deploys to
   the live site, and `Closes #N` lines in the commits close those issues.

The repository ruleset requires pull requests and one approving review. Repository
admins can bypass it with the **"Merge without waiting for requirements"** checkbox.

## More documentation

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): request flow, AI pipeline, auth and roles, data model, security
- [docs/CHANGELOG.md](docs/CHANGELOG.md): history of changes
- [supabase/README.md](supabase/README.md): database migrations and checks
