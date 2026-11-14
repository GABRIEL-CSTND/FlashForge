# FlashForge Presentation Demo Script & Sample Data Guide

> **Issue #92**: Presentation run-through script, speaker assignments, sample data catalog, and offline contingency plan.

---

## 1. Demo Objectives & Constraints

- **Time Limit:** 5 to 7 minutes total.
- **Quota Safety Rule:** Free-tier Gemini AI is limited to ~20 requests per day and can hit `429 (quota exceeded)` or `503 (high demand)`. **Never rely exclusively on a live generation during the presentation.** All core capabilities have pre-seeded sample data on the site so the demo flows seamlessly even if the network or AI is unavailable.
- **Presentation Setup:**
  - One laptop connected to projector (or screen share).
  - Browser tabs prepared in advance (see [Tab Preparation](#2-browser-tab-preparation)).

---

## 2. Browser Tab Preparation

Before starting the presentation, open the following 4 tabs in your browser:

| Tab # | Target Page | Purpose |
|---|---|---|
| **Tab 1** | `http://localhost:3000` (or live site) | Home desk, file generator, and study modes |
| **Tab 2** | `/teacher/classes/c0000000-0000-4000-8000-000000000001` | Teacher class management (BIO 101) & roster |
| **Tab 3** | `/teacher/classes/c0000000-0000-4000-8000-000000000001/results` | Class gradebook, student attempts, and question analysis |
| **Tab 4** | `/admin/usage` (or `/admin/users`) | Admin dashboard, AI telemetry & fallback tiering |

---

## 3. Team Roles & Speaker Breakdown

| Section | Speaker | Focus | Est. Time |
|---|---|---|---|
| **1. Intro & Desk Concept** | Speaker 1 | The vision, tactile desk redesign, paper cards, brass controls | 1:00 |
| **2. Student Study Experience** | Speaker 1 | Studying flashcards (Flip, Type, Match) & Quizzes with source quotes | 2:00 |
| **3. Teacher Tools & Analytics** | Speaker 2 | Class roster, assignment distribution, class averages & hardest questions | 2:00 |
| **4. Admin, Privacy & Architecture** | Speaker 3 | Multi-model fallback, rate limits, self-serve data wipe (#88), technical wrap-up | 1:30 |
| **Q&A / Buffer** | All | Answering instructor/peer questions | 1:00 |

---

## 4. Step-by-Step Presentation Script

### Part 1: Introduction & The Desk (Speaker 1 — 1:00)

1. **Open Tab 1 (`/`)**:
   - *“Good morning everyone. This is **FlashForge**, an AI-powered study companion designed for students and teachers.”*
   - *“Unlike generic study apps that look like flat corporate spreadsheets, FlashForge is built around a tactile study desk experience: rich green leather, cream paper cards, and brass library plates.”*
   - Point out the **Card Box** on the top-left (section tabs) and the **Library Card** on the top-right.

2. **Highlight Privacy & User Empowerment**:
   - Click the small **Privacy** link on the Library Card:
   - *“Right from the library card, anyone can inspect our Privacy page (`/privacy`), which outlines our strict data retention policy and provides a one-click self-serve data wipe for full user control.”*
   - Return to the desk.

---

### Part 2: Student Study Experience (Speaker 1 — 2:00)

1. **Select Pre-Seeded Deck ("Cell Biology Essentials")**:
   - Go to **My Sets** and click **Cell Biology Essentials** (or navigate to `/sets/b0000000-0000-4000-8000-000000000001`).
   - *“Let’s study a deck. Here is our interactive desk: the deck sits on the left, the active study card in the middle, and our ‘Got it’ and ‘Missed it’ sorting piles on the right.”*

2. **Demonstrate Study Modes**:
   - **Flip Mode:** Press `Space` or click the card to flip it over with 3D paper rotation. Click *Got it* (or press `Right Arrow`) to sort it into the tray.
   - **Type Mode:** Switch to **Type** on the bottom brass tool ribbon:
     - *“Students can switch study modes instantly without remaking their deck. In Type mode, our server fuzzy-checks student spelling against the real card answer.”*
   - **Match Mode:** Switch to **Match**:
     - *“In Match mode, terms and definitions are shuffled into an interactive grid for rapid recall.”*

3. **Demonstrate Multiple Choice & Source Quotes**:
   - Open **Cellular Genetics & Heredity** (`/sets/b0000000-0000-4000-8000-000000000002`).
   - Answer the first question (e.g. click "DNA"). Show the paper answer slips lifting with a brass indicator and the instant verification.
   - Highlight the **Source Quote**:
     - *“Notice the source quote at the bottom: FlashForge anchors every generated question directly to the source text page or line, virtually eliminating AI hallucination.”*

---

### Part 3: Teacher Management & Learning Analytics (Speaker 2 — 2:00)

1. **Switch to Tab 2 (`/teacher/classes/c...`)**:
   - *“Now let’s look at the educator workflow. Teachers can organize students into classes without requiring complex school domain integrations.”*
   - Show the class: **BIO 101 - Cell Biology & Genetics**.
   - Point out the 6-character Join Code: `CHE-M88`.
     - *“Join codes use an unambiguous 32-character alphabet—omitting lookalikes like 0/O and 1/I/L—so teachers can write them on a blackboard or read them aloud without confusion.”*
   - Show the enrolled roster: **Marcus Chen** and **Sofia Patel**.

2. **Switch to Tab 3 (Class Results & Analytics)**:
   - Navigate to `/teacher/classes/c.../results`:
   - *“Teachers get instant visibility into student progress. Here is our class gradebook for the genetics assignment.”*
   - Show the **Class Average** and student performance:
     - Marcus Chen: 100% (5/5)
     - Sofia Patel: 60% (3/5)
   - Click into the assignment's detailed question analysis:
     - *“Here is where FlashForge shines: our **Hardest Questions** analytics. Teachers don't just see a grade—they see exactly which concepts confused their students.”*
     - Point out Question 2 (*“What process reduces chromosome number by half?”*):
     - *“The system automatically surfaces that Sofia chose ‘Mitosis’ instead of ‘Meiosis’, identifying the exact conceptual hurdle for the next lecture.”*

---

### Part 4: Administration, Resilience & Wrap-up (Speaker 3 — 1:30)

1. **Switch to Tab 4 (`/admin/usage`)**:
   - *“Under the hood, FlashForge is engineered for high availability on budget-constrained developer plans.”*
   - Show the usage and AI fallback graph:
     - *“We built a 3-tier model fallback: primary generations run on `gemini-3.5-flash`. If Google's API returns 503 or 429 under peak load, the server seamlessly retries on `gemini-3.5-flash-lite`, and falls back to `gemma-4-26b` as a safety net.”*
     - Show the role-based daily generation limits protecting the system from quota abuse.

2. **Closing Statement**:
   - *“By combining an intuitive tactile aesthetic, grounded source attribution, multi-modal study methods, and diagnostic teacher analytics, FlashForge provides a complete learning loop. Thank you, and we’d love to answer any questions!”*

---

## 5. Contingency Plan & Fallbacks

| Scenario | What Happened | Immediate Response |
|---|---|---|
| **Live generation demo attempted and stalls or fails** | Gemini quota 429 or slow response (>10s) | Say: *“While the cloud AI pipeline processes the document in the background, let’s jump straight into the pre-generated biology deck to see how the study experience behaves.”* (Switch to Tab 1 / My Sets immediately). |
| **Internet disconnection / Wi-Fi drop** | Campus/Room Wi-Fi dropped | Local dev server (`http://localhost:3000`) runs entirely locally. Cached mock data or pre-loaded tabs will continue rendering without external connectivity. |
| **Question on Google Sign-In** | Evaluator asks how auth works | Explain: *“Auth uses Supabase Auth with Google OAuth. Role assignment is a one-time step that configures permissions as student, teacher, or admin.”* |

---

## 6. How to Seed the Database

To populate the demo accounts and sample data on a local or remote Supabase instance:

1. Open your Supabase Project Dashboard -> **SQL Editor**.
2. Open [supabase/seed-demo.sql](../supabase/seed-demo.sql).
3. Copy and paste the script, then click **Run**.
4. The following records will be created/updated with guaranteed idempotency:
   - 4 Demo accounts (`demo.teacher`, `demo.student1`, `demo.student2`, `demo.admin`)
   - Class: `BIO 101 - Cell Biology & Genetics` (Join Code: `CHE-M88`)
   - 4 Study Decks covering all formats (`flashcard`, `multiple_choice`, `true_false`, `mixed`)
   - 1 Assignment with student scores and question analytics.
