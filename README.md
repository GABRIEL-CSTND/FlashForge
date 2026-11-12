# FlashForge

Upload your notes and get an AI-generated study guide in seconds.

FlashForge turns a PDF (scanned ones too), Word, PowerPoint or TXT file, a photo of your notes, notes pasted as text, a link to a web page, or just a **topic** (looked up on Wikipedia) into a study guide of 5 to 30 questions (10 by
default): **identification-style flashcards** (a clue on the front, a 1–4 word term on
the back), **multiple-choice questions**, **true-or-false statements** with the
correction shown after each false one, or a **mixed quiz** set out like a school exam
(Part I multiple choice, Part II true or false, Part III identification). Quizzes give
instant feedback and a score at the end. Flashcards can be studied by flipping them (and marking *Got it* or *Missed it*),
by **typing the answer**, which the app checks and forgives one small typo, or by
**matching** clues to terms in rounds of up to 5. Every guide can be **easy, medium or hard**. Any card can be **read aloud**, one at a time
or automatically, with the browser's built-in voice. Sign in
with Google to save study guides, then rename, revisit, or delete them from **My Sets**.
Signed in, every guide you make is also kept in **History**, saved or not, so you can study one again
or save it later.
Signed in, every finished study session is saved with its score. Teachers can create classes, assign sets, and see each student's scores and
the most-missed questions; students join with a code. Admins manage users' roles and can remove any study set.

Live site: https://flash-forge-one.vercel.app

## Tech stack

| Part | Uses |
|---|---|
| Web app | [Next.js 16](https://nextjs.org) (App Router), React 19, Tailwind CSS 4, TypeScript |
| AI | Google Gemini API: `gemini-3.5-flash`, then `gemini-3.5-flash-lite`, then `gemma-4-26b-a4b-it` as backups. All three read photos directly |
| Database and sign-in | [Supabase](https://supabase.com) (Postgres with Row Level Security, Google OAuth) |
| Text extraction | [unpdf](https://github.com/unjs/unpdf) for PDFs; [fflate](https://github.com/101arrowz/fflate) to unzip Word and PowerPoint files |
| Hosting | Vercel (`main` deploys to production; other branches get preview deployments) |
| Tests | [Vitest](https://vitest.dev) and React Testing Library (`npm test`), plus SQL security checks in `supabase/tests/` |

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
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Project Settings → API → `anon` key | Browser (safe to expose; RLS and table grants protect the data) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API → `service_role` key | **Server only.** It bypasses RLS, so never use it in client code |
| `GEMINI_API_KEY` | [Google AI Studio](https://aistudio.google.com/apikey) | Server only (`lib/gemini.ts`) |
| `IP_HASH_SECRET` | Optional: any long random string | Server only. Key for hashing signed-out visitors' IPs for the daily limits (#63); defaults to the service-role key |

> **Use a separate Gemini key for local development if you can.** The free tier allows
> only about **20 requests per day** on the main model, and testing with the production
> key uses up the live site's quota (see #45). Admins can watch it, and set each role's
> daily limit, on **/admin/usage**.

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
| `npm run lint` | ESLint (no errors) |
| `npm test` | Unit, API-route and component tests (Vitest + React Testing Library) |

## Project structure

```
app/
  page.tsx              The desk where a deck is made: notes sheet, Make me card, the new cards spread out, then studying
  layout.tsx            Root layout: fonts, the desk around every page, profile provider,
                        title template ("%s · FlashForge")
  globals.css           Tailwind, the desk's colors and textures, brass buttons, the default border color
  icon.svg              FlashForge icon (favicon.ico and apple-icon.png are the same design)
  */layout.tsx          Section layouts that only set the browser title ("My Sets · FlashForge")
  my-sets/page.tsx      My Sets: the saved sets as decks on the desk, each with its best score; delete one
  history/page.tsx      History: every guide made while signed in, as decks; save one to My Sets or remove it
  history/[id]/page.tsx One guide from History: study it again, or save it to My Sets
  sets/[id]/page.tsx    A saved set: study and save the score; the owner can edit cards, rename, delete
  teacher/page.tsx      Your classes (teachers): each class a kraft folder with its join code; make a new one
  teacher/classes/[id]/ One class on the desk: join-code plate, assigned decks, roster on paper, rename, delete
  teacher/classes/[id]/results/  The grade book: best scores, attempts, late / not started, averages, CSV
  teacher/classes/[id]/assignments/[assignmentId]/  One assignment's cards on the desk, hardest first
  classes/page.tsx      My Classes (students): a tray of assigned decks per class (due, overdue, done), join with a code, leave
  admin/page.tsx        Admin home (admins only)
  admin/users/          Users and roles: search users, change roles
  admin/sets/           Study sets: open or delete any set
  admin/usage/          AI usage: guides per day, models used, today's quota, top users
  api/generate/         POST: extract text from the file, generate items with AI, keep the guide in History
  api/save-set/         POST: save a generated guide or one from History (signed-in users only)
  api/sets/[id]/cards/  PUT: save the owner's edited cards, all at once
  api/attempts/         POST: save a finished study session (scored on the server); GET: my recent scores
  api/profile/role/     POST: one-time student/teacher choice at sign-up
  api/admin/users/      Admin API: list users (GET), change a role (PATCH [id])
  api/admin/sets/       Admin API: list sets (GET), delete one (DELETE [id])
  api/admin/usage/      Admin API: generation usage for the last 14 days, and the daily limits
  api/admin/limits/     Admin API: change the daily generation limits (PUT)
  api/teacher/classes/  Teacher class API (list/create, rename/delete, new code, remove student,
                        change due date / unassign, student results, one student's attempts,
                        an assignment's hardest questions)
  api/teacher/sets/[id]/assignments/  Assign a set to the teacher's classes
  api/student/classes/  Student class API (list with assignments and my progress, join with a code, leave)
components/
  StudyViewer.tsx       Study screen: flashcards and quizzes, each on its own desk; reports each finish
  study/FlashcardDesk.tsx  Flashcards on the desk: deck, card, Got it / Missed it piles, Flip / Type / Match, read aloud
  study/MatchBoard.tsx  One Match round: clue and term slips, a brass edge when right, red pencil when wrong
  study/QuizDesk.tsx    Quizzes on the desk: question card, Right / Wrong piles, a card for each part, score by part
  study/AnswerSlips.tsx A quiz question's answers as paper slips (A–D, or True and False)
  study/TypedForm.tsx   The line to type an answer on (Type mode, and Part III of a mixed quiz)
  study/StudyTools.tsx  The brass Flip / Type / Match / Read aloud buttons and the Auto switch (quizzes: Read aloud only)
  study/logic.ts        Card and result types, scoring and reporting, what Read aloud says (both desks)
  study/sizes.ts        Text sizes that keep a clue, a question or a term on its card
  study/SourceNote.tsx  Where a card came from: its quote and page
  study/parts.tsx       Exit, the line above the desk, and the verdicts for typed and picked answers
  CardEditor.tsx        Edit mode for a set: change, add, delete and reorder cards (of any kind in a mixed quiz)
  AssignPanel.tsx       "Assign to class" dialog on a set the teacher owns
  StudentResultsPanel.tsx  One student's attempts, opened from the results table
  ProfileProvider.tsx   Shares the signed-in user's profile (role) with every page
  RoleChooser.tsx       "Student or teacher?" screen for users who haven't chosen
  RoleGate.tsx          Shows a page only to the allowed roles (sign-in/denied messages otherwise)
  TeacherOnly.tsx       RoleGate for teacher pages (teachers and admins)
  AdminOnly.tsx         RoleGate for admin pages
  desk/Desk.tsx         The desk around every page: card box and library card on top, the page on a sheet of paper
  desk/PageTurn.tsx     The sheet; turns the page on every navigation (React ViewTransition) and eases it in on Back
  desk/view-transition.ts  React's ViewTransition, looked up, since the tests' React doesn't have it
  desk/DeskTurn.tsx     Turns one view of a page into another the same way (the home page's notes sheet, deck being made, new cards)
  desk/CardBox.tsx      Card box (top left): FlashForge for a new guide, and a tab for each section the role can open
  desk/LibraryCard.tsx  Library card (top right): name, role and Sign out, or Sign in with Google
  desk/PaperCard.tsx    A card with two faces that turns over
  desk/Pencil.tsx       The pencil on the desk that opens the card editor
  desk/LibraryDesk.tsx  The library pages' frame on the desk: name, line, tip note, and a paper note for empty states
  desk/LibraryDeck.tsx  A deck lying in the library: the link that picks it up, with its paper tag
  desk/PaperTag.tsx     A small paper tag: best score, saved or not, due date
  desk/DeckMorph.tsx    Morphs a deck picked up in the library into the page it opens (React ViewTransition)
  desk/OpeningDeck.tsx  The deck a set or guide page shows while it loads, so the morph has somewhere to land
  desk/KraftFolder.tsx  A class on the teacher's desk: a kraft folder with its name and join code
  desk/SlipMenu.tsx     A word that fans out paper slips to choose from ("Make me [10] [medium] [flashcards]")
  make/NotesSheet.tsx   One sheet for a file, notes, a link or a topic; says what it found
  make/MakeCard.tsx     The "Make me 10 medium flashcards" card and Make my deck
  make/MakingDeck.tsx   While the AI works: a pencil writes a card, the deck is shuffled, over and over
  make/DeckSpread.tsx   A new deck spread out on the desk; Start studying gathers it
  desk/useDeskLayout.ts Where the deck, the card and the piles lie (laptop and phone), for the card motion
lib/
  gemini.ts             AI model chain, prompts, retries, output validation
  roles.ts              getAuthedUser / requireRole / chooseOwnRole (server-only)
  role-types.ts         Role types and helpers shared by server and client
  admin.ts              Admin tools: users and roles, sets, AI usage (server-only)
  generation-logs.ts    Usage log and daily limit check for /api/generate (server-only)
  generation-limits.ts  Daily limits per role: rules and message (shared)
  card-rules.ts         Card rules shared by the editor and the server (validateCards)
  study-types.ts        Study types, their labels, ways to study flashcards, question count rules (shared)
  sources.ts            Where notes come from (file or pasted text), accepted file types and limits (shared)
  source-quotes.ts      Checks each card's quote against the notes, finds its page or line, samples long documents
  office-text.ts        Text from Word (.docx) and PowerPoint (.pptx) files, with zip-bomb limits (server-only)
  shrink-image.ts       Shrinks photos to 1,600 pixels before upload (browser-only)
  pending-guide.ts      Keeps an unsaved guide across the Google sign-in redirect (browser-only)
  speech.ts             Reading cards aloud with the browser's built-in speech, and the Auto setting (browser-only)
  web-page.ts           Fetches a linked web page safely (no private addresses) and keeps its main text (server-only)
  topic.ts              Looks a typed topic up on Wikipedia and returns the best article's text (server-only)
  answer-check.ts       Checking typed answers (capitals, accents, one typo), shared by the study screen and server
  sets.ts               Study sets scoped to their owner; saving edited cards (server-only)
  history.ts            History: adding each generated guide, marking one saved (server-only)
  library.ts            The library's tags: each deck's best score, short dates ("Today", "Oct 29")
  ids.ts                isUuid() and newId(), shared by server and client
  classes.ts            Class logic, always scoped to the acting teacher (server-only)
  classes-shared.ts     Class name, join-code and student-name rules shared by server and client
  student-classes.ts    Joining/leaving classes and the wrong-code rate limit (server-only)
  assignments.ts        Assigning sets to classes, scoped to the teacher/student (server-only)
  due-dates.ts          Due-date checks, local-time display, Overdue, sorting (shared)
  attempts.ts           Saving study results, scored from the real cards; recent scores, progress (server-only)
  class-results.ts      A teacher's view of student results, scoped like the attempts RLS (server-only)
  results-shared.ts     Done / late / not started, best score, class average, CSV (shared)
  api-client.ts         apiFetch(): calls our API routes with the user's token
  route-helpers.ts      Shared error/404 responses for API routes
  supabase.ts           Browser Supabase client (anon key)
  supabase-admin.ts     Server-only Supabase client (service-role key)
  auth.ts               useUser hook, Google sign-in/out
test-utils/
  fake-supabase.ts      In-memory Supabase client for route tests
public/
  textures/             Leather and paper tiles for the desk
scripts/
  make-textures.cjs     Makes public/textures, the same bytes on every run:
                        node scripts/make-textures.cjs public/textures
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
2. Branch from **`dev`**, the default branch: `feature/<issue#>-short-name` or `fix/short-name`.
3. Merge finished work into `dev` (directly or through a pull request into `dev`).
   `Closes #N` lines in the commits close those issues once they reach `dev`, and
   GitHub's Insights count the commits on `dev`.
4. Open a pull request from `dev` to `main` to release (pick `main` as the base; new
   pull requests start out aimed at `dev`). Merging into `main` deploys to the live site:
   Vercel's production branch is `main`, and every other branch gets a preview.

**The desk redesign** (the new look) is built in phases on **`UI_changes`**: branch from
`UI_changes` and merge back into it, not into `dev`, until the redesign is ready for `dev`.

The repository ruleset requires pull requests and one approving review. Repository
admins can bypass it with the **"Merge without waiting for requirements"** checkbox.

## More documentation

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): request flow, AI pipeline, auth and roles, data model, security
- [docs/CHANGELOG.md](docs/CHANGELOG.md): history of changes
- [supabase/README.md](supabase/README.md): database migrations and checks
