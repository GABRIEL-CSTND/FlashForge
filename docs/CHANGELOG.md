# Changelog

Notable changes to FlashForge, newest first. Issue and PR numbers refer to
[GABRIEL-CSTND/FlashForge](https://github.com/GABRIEL-CSTND/FlashForge).

## Unreleased

### Added
- **Choose student or teacher at sign-up** (#52). Signed-in users who haven't chosen
  (including the 2 existing students) see a one-time screen. Teachers land on a new
  `/teacher` dashboard (a placeholder until classes arrive in #53), and the upload page
  links to it. `POST /api/profile/role` allows each user exactly one choice, never
  `admin`.
- Component tests with React Testing Library and jsdom. `npm test` now runs 35 tests.

### Security
- Vitest updated 3.2.4 → 3.2.7 (fixes a critical advisory for the Vitest UI server).

## 2026-10-20

Released to `dev`; reaches the live site when PR #48 (`dev` → `main`) is merged.
Database changes marked **(live)** were applied to Supabase the same day.

### Security
- **Closed two database holes (live)** (#46). Anyone with the public anon key could read
  every flashcard, including 110 cards in private sets, and anyone could insert sets
  with any owner. Both policies were removed. The public API now returns only legacy
  ownerless cards, and anonymous inserts are rejected.
- **Database schema and RLS policies are now in the repo** (`supabase/migrations/`),
  with SQL checks in `supabase/tests/` that simulate users in a rolled-back
  transaction (#46).
- The Gemini API key is sent in a request header instead of the URL (#40).

### Added
- **User roles (live)** (#51): `profiles` table (`student` / `teacher` / `admin`), a
  sign-up trigger that creates a student profile, and the first admin
  (castanedag438@gmail.com). Users can't change their own role.
- `lib/roles.ts`: `requireRole()` for upcoming teacher and admin routes (401/403).
- **Gemma 4 as a last-resort AI backup** (PR #49): when both Gemini models are busy or
  out of quota, requests fall through to `gemma-4-26b-a4b-it`, and they go back to
  Gemini automatically once its quota resets. After 15 seconds the page tells users a
  slower backup may be in use.
- **Vitest** test runner (`npm test`) with 9 tests for the role checks.
- Plan for teacher and admin features, with a 6-week schedule: parent issue #50 and
  sub-issues #51–#63.

### Changed
- **Identification-style flashcards** (#35): the question is a clue or definition, and
  the answer is a 1–4 word term. In tests on three sample texts, 30 of 30 answers were
  4 words or fewer.
- **Faster generation** (#39): Gemini's thinking is set to `low`; successful calls took
  about 1.4–12 seconds.
- **Retries and fallbacks** (#40): timeouts, retries with backoff, a fallback to
  `gemini-3.5-flash-lite`, and friendly error messages instead of raw API errors.
  Unreadable files get a clear message.
- **Multiple-choice checks** (#37): the server checks there are exactly 4 options and
  exactly one correct answer, and shuffles the options so the correct answer isn't
  always in the same spot.
- Generation timeout raised to 90 seconds to make room for the Gemma backup.
- New README, plus `docs/ARCHITECTURE.md` and this changelog (#47).

### Fixed
- **The Exit button did nothing on a freshly generated study guide.** It now returns
  to the upload page and asks first if the guide hasn't been saved.
- Network failures while generating now show an error instead of leaving the button
  stuck on "Generating…".
- The browser tab title said "Create Next App" (#47).

### Removed
- `components/FileUpload.tsx`, which was unused (#47).

### Findings
- The free Gemini tier allows only about **20 requests a day** on the main model, for
  everyone combined (details in #45).
- Gemma 4 isn't a drop-in replacement: it rejects Gemini's structured output and
  thinking settings, its fast mode produces garbage, and it answered only 1 of 4 test
  requests.

## 2026-10-04
- Signed-in owners can rename a saved study guide (PR #34, #19).

## 2026-09-13
- The flashcard *Finish* button shows a completion screen instead of doing nothing
  (PR #4).

## 2026-09-05
- Saving is explicit and requires sign-in (#15, #18); owners can delete saved sets (#17).

## 2026-09-03
- Flashcard saving moved to the server with the service-role key, and overly
  permissive anon RLS policies were tightened.

## 2026-09-02
- Google sign-in (#13), the My Sets dashboard (#16), and an Exit button during study
  (#12). Flashcard scoring was removed.

## 2026-08-30
- Study type selector: flashcards or multiple choice (#8, #9), immediate feedback and a
  score summary for multiple choice (#10, #11), capped at 10 questions.

## 2026-08-29
- Project created with Next.js, Supabase, and Vercel (#28). Upload UI for PDF/TXT
  (#29), text extraction (#5), AI generation (#6), the Supabase schema, and the set page.
