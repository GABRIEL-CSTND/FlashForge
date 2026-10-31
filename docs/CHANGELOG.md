# Changelog

Notable changes to FlashForge, newest first. Issue and PR numbers refer to
[GABRIEL-CSTND/FlashForge](https://github.com/GABRIEL-CSTND/FlashForge).

## Unreleased (on `dev`, not on the live site yet)

Everything here was done between 2026-10-20 and 2026-10-24. It reaches the live site when `dev` is merged
into `main`. There is only one Supabase database, so changes marked **(live)** are
already applied there.

### Security
- **Failed guides can't be repeated all day** (#41): a guide that failed after the AI was
  asked didn't count toward the daily limit, so someone could keep sending, say, a photo
  with nothing to study in it, and about 20 tries used up the AI quota everyone shares.
  Failed guides that asked the AI now have their own daily cap, the same size as the
  limit; past it, new guides are paused until the quota resets, with a message saying
  why. Failures before the AI is asked still don't count. (Migration
  `20261031000100_limit_failed_guides.sql`.)
- Web links (#74) are fetched with protections against server-side request forgery:
  only http/https on ports 80 and 443, every resolved address must be public (checked
  as the connection is made, and again after each redirect), and pages are capped at
  2 MB and 10 seconds. The page text is read without patterns that a hostile page could
  make slow.
- Saving a generated guide now checks the study type and every card with the card
  editor's rules, so a set can't be saved in a shape the study screen can't show, and an
  unknown study type is refused by the database too (#68).
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
- **History (live)**: signed in, every study guide you make is kept on a new **History** page
  (linked next to My Sets), saved or not: newest first, with its type, number of
  questions, date and a *Saved* badge. Open one to study it again, or save it to My Sets
  if you didn't; 🗑 removes it from History (a saved set stays in My Sets). Leaving a new
  guide no longer warns that it will be lost when it's in History. New `guide_history`
  table (migration `20261029000200_guide_history.sql`): only its owner can read or remove
  an entry, and only the server adds them. Guides made before this, or while signed out,
  aren't in History.
- **Whole long documents** (#38): a PDF or text file longer than the 30,000 characters the
  AI takes is no longer cut off after roughly its first 10 pages. Pages, or paragraphs,
  from across the whole document are sent instead, always with the first and the last,
  and each keeps its real page or line number for the quotes under the cards. Wherever
  something was left out, the AI sees a "part of the document left out" line, so a
  sentence cut off at the end of one page isn't read as going on in a later one, and no
  quote is accepted across that gap.
- **Quotes under cards** (#21): once a card is answered, it shows the sentence of the notes it
  was made from, and the page of a PDF or the line of a text file or pasted notes ("From
  the document · Page 3"). The AI is asked for the sentence, and the app only shows it if
  it's really in the notes. Saved with the set. Not for photos or scanned PDFs, which have
  no text to check against.
- **Topics and difficulty** (#79): with no notes, students can type a topic ("photosynthesis",
  "the OSI model"); the app looks it up on Wikipedia, makes the guide from the best
  article (skipping "may refer to" pages) and credits it with a link. While it works,
  the progress steps say it's looking the topic up on Wikipedia. Every guide can
  also be **Easy**, **Medium** or **Hard**, for any kind of guide and any source. Still
  one AI request per guide.
- **Read aloud** (#77): a **🔊 Read aloud** button on the study screen reads the card that's
  showing (question and choices, the answer once flipped or answered, the clues in
  matching), and **Auto** reads each card as it appears. Uses the browser's built-in voice,
  so it's free and needs no AI; it's hidden where a browser can't speak.
- **Progress while a study guide is being made** (#42): the upload page now shows each step of
  the wait: uploading, reading, then writing with the AI, with what's done, what's under
  way and a seconds counter, so the wait feels shorter and it's clear the app hasn't
  frozen. If the AI needs another try, or a slower backup takes over, it says so under the
  writing step. The steps are real: the server reports each stage as it starts (as a
  stream of one JSON event per line, only when the page asks for it), and answers exactly
  as before otherwise, so the daily limits, errors and the usage log are unchanged. If the
  page is closed while the AI is working, the usage log still waits for the real outcome,
  so abandoned requests count toward the daily limit like finished ones.
- **Web links** (#74): paste a link to an article or other public page, and the server
  fetches it and keeps its main text (no menus, ads or footers). Pages that need signing in
  get a clear message. With this, all of more file types (#20) is done.
- **Scanned PDFs** (#73): a PDF made of scanned pages has little or no text for the app to
  read, so it used to fail with "Could not extract enough readable text". Now such a PDF
  (under 100 characters of text) goes to the AI itself, which reads the pages, still in
  one request. PDFs with text are read as before.
- **Photos of notes** (#72): upload a JPG, PNG or WebP photo of notes, a whiteboard or a
  textbook page. The AI reads the photo itself, still in one request. Big phone photos are
  shrunk in the browser first (to 1,600 pixels), and a photo with nothing readable gets a
  clear message instead of an error. In a test, a photo of handwritten-style cell biology
  notes gave 5 good flashcards, and the Gemma backup could read it too.
- **Word and PowerPoint files** (#71): the upload page takes `.docx` and `.pptx` (slides in
  order, then speaker notes) besides PDF and TXT. Old `.doc` and `.ppt` files get a clear
  "save it as .docx/.pptx or PDF first", and files over 4 MB are stopped before upload
  with their size instead of failing on the hosting limit. Uses the small
  [fflate](https://github.com/101arrowz/fflate) library (0.8.3) to unzip them, with limits
  against zip bombs.
- **Paste text** (#70): the upload page has an *Upload a file / Paste text* switch, so notes
  from Google Docs, a website or a chat can be used without making a file. Up to 30,000
  characters (what the AI reads from a file), with a counter and a clear message when the
  text is too short or too long. The guide is titled by the text's first line. Part of
  more file types (#20).
- **Mixed quiz** (#69, live database): a study guide laid out like a school exam, made with
  one AI request: Part I multiple choice (about 40%), Part II true or false (30%) and
  Part III identification (30%, typed and checked). Studied part by part, with each
  part's score on the finish screen; the editor adds cards of any of the three kinds.
  Together with #65–#68 this completes the study types plan (#64).
- **True or false** (#68, live database): a new kind of study guide. The AI writes
  statements from the notes, about half true and half false; each false one changes one
  key detail and comes with the corrected fact, shown after answering. Scored like
  multiple choice, editable (statement, True/False, optional explanation), and works with
  assignments and results. The upload page now says what each kind of guide is. New
  `flashcards.explanation` column.
- **Matching** (#67, live database): a third way to study flashcard sets. The set is split
  into even rounds of up to 5; students pick the term for each clue from the round's
  shuffled terms (each used once), then check the round. Scored on the server like other
  attempts, shown as *Matched* to teachers, and wrong matches count on the most-missed
  page.
- **Type the answer** (#66, live database): flashcard sets have a **Flip / Type** switch.
  In Type, students type each term and the app checks it right away: capitals, accents,
  spaces and punctuation don't matter, and one small typo is forgiven on longer words
  (never on numbers or short terms). The server runs the same check for the saved score,
  so typed scores can't be self-marked. Teachers see which attempts were typed or
  self-marked, and the most-missed page shows the most common wrong typed answer. New
  `attempts.mode` column.
- **Choose how many questions** (#65): 5, 10, 15, 20 or 30 on the upload page (10 by
  default), for every kind of study guide. It's still one AI request per guide, so the
  daily limits don't change. Bigger guides give the AI a little more time, and the
  "slower backup" notice waits a little longer for them. Part of the new study types plan
  (#64).
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
- **Daily generation limits** (#63, live database): signed out 2, students 5, teachers 15
  and admins unlimited per day (Pacific time) by default. Admins change them on
  `/admin/usage`, and changes apply from the next request. Over the limit the upload
  page says *"You've reached today's limit of N study guides."* and when more can be made.
  Parallel requests can't slip past it, and signed-out visitors are counted by a hash of
  their IP (never stored as is).
- **AI usage dashboard** (#62, live database): every generation is logged (after the
  response is sent, so it's never slower) with the model that answered and the requests
  made to each model. `/admin/usage` shows today's requests per model against the main
  model's ~20-a-day free quota, the last 14 days (guides, failures, average wait, backups
  used) and the top users. Days follow Pacific time, when the quota resets.
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
- **Automated tests** (`npm test`, 748 tests):
  - Vitest (#51).
  - React Testing Library and jsdom for component tests (#52).
  - `test-utils/fake-supabase.ts`, an in-memory Supabase client for route tests (#53),
    with time-window filters for the join rate limit (#54).
- Plan for teacher and admin features, with a 6-week schedule: parent issue #50 and
  sub-issues #51–#63.

### Changed
- **Short answers only:** AI-generated cards whose answer is too long are now filtered
  out, so every card stays short and easy to identify. The prompt already asked for
  answers of 1 to 4 words, but the code still let flashcard answers run to 8 words and
  multiple-choice choices to 80 characters with no word limit. Now every answer (flashcard
  and identification answers, and every multiple-choice choice, right or wrong) must be
  at most 6 words and 60 characters, or the whole card is dropped. The multiple-choice
  prompts now ask for 1-to-4-word choices too, so fewer cards are lost. Questions and
  true-or-false statements are unchanged.
- **Cleaner look, UI polish phase 1:** the Geist font (the starter template's Arial was
  still forced), soft gray borders instead of black outlines (white in dark mode), a
  FlashForge icon instead of the starter template's, and a browser title per page
  ("My Sets · FlashForge").
- **One set of buttons and one link color, UI polish phase 2:** about nine hand-written
  button styles became `.btn-primary` / `.btn-secondary` (23 buttons). Links use one blue
  that stays readable in dark mode. Selected options and hover outlines use the accent
  color, which is now a single variable, so the team's brand color is a one-line change.
  Fixed a few colors that were hard to read in dark mode.
- `npm test` only runs this project's own tests: it skips the Claude app's worktrees
  in `.claude/` and `node_modules` at any depth (before, a side session's copy added 96
  false failures).
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
- On phones, the links at the top of the upload page (My Classes, My Sets, History, the
  email and Sign out) ran off the screen in one line. They now wrap onto a second line.
- **Quotes under cards** (#21), from the review of PR #80:
  - A quote that isn't in the notes word for word is cut down to its longest real part.
    It used to be stitched together from pieces found anywhere in the notes, so a false
    statement could show as a "quote" ("The mitochondria is the organelle that … stores
    … DNA."). Pieces are never joined now.
  - The page or line is found by whole words, so a sentence on page 2 isn't reported as
    page 1 because a longer word there contains it.
  - The label says where the guide came from (*From the document*, *From the notes*,
    *From the web page* or *From Wikipedia*) instead of "From your document", which was
    wrong for links, topics and other people's sets.
  - Rewriting a card's question or answer drops its quote, which may no longer back it
    (`replace_set_cards()`, migration `20261029000100_clear_edited_quotes.sql`).
- **Whole long documents** (#38), from the review of PR #81: the pages kept were
  sometimes fewer than would fit (a binary search that assumed more pages always take
  more room); every count is tried now. A typed topic's guide is no longer told to cover
  the whole article, so it stays on the topic.
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
