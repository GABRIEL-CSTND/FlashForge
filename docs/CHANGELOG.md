# Changelog

Notable changes to FlashForge, newest first. Issue and PR numbers refer to
[GABRIEL-CSTND/FlashForge](https://github.com/GABRIEL-CSTND/FlashForge).

## Unreleased (on `dev`, not on the live site yet)

Everything here was done between 2026-10-20 and 2026-10-22. It reaches the live site when `dev` is merged
into `main`. There is only one Supabase database, so changes marked **(live)** are
already applied there.

### Security
- Admins can now read every study set (to check reported or broken content), but still
  can't edit or delete other people's sets except through the logged admin delete
  (#61). All 8 database check files pass (117 cases).
- Role changes by admins happen in one locked database transaction that refuses to
  remove the last admin, and every change is written to a new server-only `audit_log`
  (#60, 16 of 16 database checks pass).
- Study results can only be written by the server, which scores them from the real cards
  (#57). Teachers can read a student's results only for their own class's assignments,
  and never private study. All 6 database check files pass (86 cases).
- Card access now always follows set access (#56): the cards policy checks the set
  through the set's own RLS, so the two can't drift apart. All 5 database check files pass
  (69 cases), and they now reset the simulated sign-in before acting as anonymous.
- **Closed two database holes (live)** (#46). Anyone with the public anon key could read
  every flashcard, including 110 cards in private sets, and anyone could insert sets
  with any owner. Both policies were removed. The public API now returns only legacy
  ownerless cards, and anonymous inserts are rejected.
- **Database schema and RLS policies are now in the repo** (`supabase/migrations/`),
  with SQL checks in `supabase/tests/` that simulate users in a rolled-back
  transaction (#46).
- The Gemini API key is sent in a request header instead of the URL (#40).
- Vitest updated 3.2.4 → 3.2.7 (fixes a critical advisory for the Vitest UI server).
  Advisories that are still open are listed under *Known limitations* in
  `docs/ARCHITECTURE.md`.

### Added
- **User roles (live)** (#51): `profiles` table (`student` / `teacher` / `admin`), a
  sign-up trigger that creates a student profile, and the first admin
  (castanedag438@gmail.com). Users can't change their own role. `lib/roles.ts` has
  `requireRole()` for teacher and admin routes (401/403).
- **Choose student or teacher at sign-up** (#52). Signed-in users who haven't chosen
  (including the 2 existing students) see a one-time screen. Teachers land on the
  `/teacher` dashboard, and the upload page links to it. `POST /api/profile/role`
  allows each user exactly one choice, never `admin`.
- **Classes with join codes (live database)** (#53):
  - Teachers create classes on `/teacher` and each class gets a code like `K7M-2QX`.
  - A class page shows the code (copy, or get a new one; the old one stops working) and
    the roster (names and emails), and lets the teacher rename the class, remove students
    and delete it.
  - Teachers can only see and change their own classes, with up to 50 each.
  - New tables `classes` and `class_members`, with RLS and a `class_roster()` function
    (16 of 16 database checks pass).
- **Assign sets to classes** (#56, live database):
  - On a set they own, teachers pick one or more of their classes and an optional due
    date (**📌 Assign to class**).
  - The class page lists assigned sets with due dates and an Overdue badge, and lets the
    teacher change the due date or unassign.
  - Students see each class's assigned sets on **My classes**, in their own time zone, and
    can open them.
  - New `assignments` table. Students can read a set and its cards only while it's
    assigned to a class they're in.
- **Admin: study sets** (#61, live database): `/admin/sets` lists every set with its
  owner, cards and how many classes it's assigned to, with search. Admins can open any set
  and delete it after a confirmation that warns when classes will lose it and students'
  scores on it will be deleted. Deletions are logged in `audit_log`.
- **Admin: users and roles** (#60, live database): admins get an **Admin** link and an
  `/admin/users` page to find any user (by email or name) and make them a student, teacher
  or admin, with a confirmation. The last admin can't be demoted, and each change is
  logged with who, whom, from → to and when.
- **Most-missed questions** (#59): from the results table, each assignment opens its
  questions hardest first, with the % of students who got each wrong (by their latest
  attempt) and, for multiple choice, the wrong answer picked most often. Edited sets are
  handled by card id: deleted cards drop out and new ones show "No answers yet".
- **Student results for teachers** (#58):
  - Each class has a **📊 Student results** page: every student × assignment with the
    best score, number of attempts, and Late or Not started (never shown as 0%), plus
    each assignment's class average.
  - Selecting a student lists all of their attempts on the class's assignments.
  - **Download CSV** for a grade book (safe against spreadsheet formulas, and Excel keeps
    accents).
  - Teachers see only their own class, its current students, and attempts made from its
    assignments, never private study.
- **Saved study results** (#57, live database):
  - Finished study sessions are saved with their score for signed-in users. Flashcards
    get **✓ Got it / ✗ Missed it** buttons after flipping (self-marking; flashcard scoring
    was removed in September), and multiple choice is scored as before.
  - The server works out multiple-choice scores from the real answers, so they can't be
    faked (flashcard marks are the student's own), and a retried save never counts twice.
  - The finish screen says whether the teacher can see the result (opened from a class
    assignment) or only the student (private study), and lists recent scores.
  - My classes marks finished assignments **Done · best 8/10** instead of Overdue.
  - New `attempts` table: students read their own; teachers read their students' results
    on their own class's assignments only (17 of 17 database checks pass).
- **Card editor** (#55, live database): the owner of a set can edit questions and
  answers, delete, add (up to 50) and reorder cards, and for multiple choice edit the 4
  choices and pick the correct one. Everything saves at once in one transaction
  (`replace_set_cards()`), and edited cards keep their ids. The editor and the server use
  the same rules (`lib/card-rules.ts`), and AI generation now uses the same choice-matching
  rule.
- **Students join classes with a code** (#54, live database):
  - Students get a **My classes** page (`/classes`, linked in the header) to join with a
    code, see their classes and teachers, and leave a class.
  - Before joining, they're told their teacher will see their name, email and scores.
  - Joining twice changes nothing. Codes are checked on the server, and after 10 wrong
    codes in 15 minutes a student has to wait (new `class_join_failures` table, server-only).
  - Teachers' class pages now tell them where students enter the code.
- **Gemma 4 as a last-resort AI backup** (PR #49): when both Gemini models are busy or
  out of quota, requests fall through to `gemma-4-26b-a4b-it`, and they go back to
  Gemini automatically once its quota resets. After 15 seconds the page tells users a
  slower backup may be in use.
- **Automated tests** (`npm test`, 346 tests):
  - Vitest (#51).
  - React Testing Library and jsdom for component tests (#52).
  - `test-utils/fake-supabase.ts`, an in-memory Supabase client for route tests (#53),
    with time-window filters for the join rate limit (#54).
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
- On phones, a teacher's class page could be wider than the screen when a set had a
  long title, cutting off the Rename, Unassign and Remove buttons. Long titles now
  shorten with "…" instead.
- Date pickers, checkboxes and other built-in controls were hard to see in dark mode
  (e.g. a dark calendar icon on a dark background). The page now sets `color-scheme`.
- On phones, My Sets, My classes and the Teacher dashboard could be wider than the screen
  when a set title or class name was long, cutting off buttons such as + New set, Create
  class, Join, Leave and 🗑. Long names now shorten with "…" instead.
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
