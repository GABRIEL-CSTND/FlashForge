'use client';

import Link from 'next/link';

export default function GuidePage() {
  return (
    <main className="min-h-screen w-full max-w-4xl mx-auto p-4 sm:p-8 space-y-10 text-ink">
      {/* Top Header */}
      <header className="space-y-3 border-b border-ink/10 pb-5">
        <div className="flex items-center justify-between">
          <Link
            href="/"
            className="inline-flex items-center gap-1 text-sm font-semibold text-brass-ink hover:underline"
          >
            ← Back to Desk
          </Link>
          <span className="text-xs uppercase tracking-widest text-muted font-semibold">Documentation</span>
        </div>
        <div className="space-y-1">
          <h1 className="font-serif text-3xl sm:text-4xl font-normal tracking-tight text-ink">
            How to Use FlashForge
          </h1>
          <p className="text-muted text-sm sm:text-base max-w-2xl">
            A comprehensive guide to generating AI-crafted study decks on the desk, mastering practice modes, managing your library, and running classes.
          </p>
        </div>

        {/* Quick jump bar */}
        <nav
          aria-label="Table of contents"
          className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-2 text-xs font-medium text-muted"
        >
          <a href="#quick-start" className="text-brass-ink hover:underline">
            Quick Start
          </a>
          <span>·</span>
          <a href="#inputs" className="text-brass-ink hover:underline">
            Supported Materials
          </a>
          <span>·</span>
          <a href="#formats" className="text-brass-ink hover:underline">
            Study Formats
          </a>
          <span>·</span>
          <a href="#study-modes" className="text-brass-ink hover:underline">
            Practice Modes
          </a>
          <span>·</span>
          <a href="#library" className="text-brass-ink hover:underline">
            The Library & History
          </a>
          <span>·</span>
          <a href="#teachers" className="text-brass-ink hover:underline">
            Teachers & Classes
          </a>
          <span>·</span>
          <a href="#faq" className="text-brass-ink hover:underline">
            FAQ
          </a>
        </nav>
      </header>

      {/* Section 1: Quick Start */}
      <section id="quick-start" className="space-y-4">
        <h2 className="font-serif text-xl sm:text-2xl font-normal text-ink border-b border-ink/10 pb-2">
          1. Quick Start in 4 Steps
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="paper rounded-lg p-4 space-y-1.5 border border-ink/10">
            <span className="text-[11px] font-bold uppercase tracking-wider text-brass-ink">Step 1</span>
            <h3 className="font-medium text-sm text-ink">Put notes on the sheet</h3>
            <p className="text-xs text-muted leading-relaxed">
              Drop any document (PDF, Word, PowerPoint, TXT, or photo), paste study text, link a web page, or type any topic. FlashForge automatically detects what you provided.
            </p>
          </div>
          <div className="paper rounded-lg p-4 space-y-1.5 border border-ink/10">
            <span className="text-[11px] font-bold uppercase tracking-wider text-brass-ink">Step 2</span>
            <h3 className="font-medium text-sm text-ink">Customize with the Make Card</h3>
            <p className="text-xs text-muted leading-relaxed">
              Click the words in &ldquo;Make me 10 medium flashcards&rdquo; to fan out paper slips. Choose your card count (5–30), difficulty (Easy, Medium, Hard), and study format.
            </p>
          </div>
          <div className="paper rounded-lg p-4 space-y-1.5 border border-ink/10">
            <span className="text-[11px] font-bold uppercase tracking-wider text-brass-ink">Step 3</span>
            <h3 className="font-medium text-sm text-ink">Watch your deck being made</h3>
            <p className="text-xs text-muted leading-relaxed">
              Click &ldquo;Make my deck&rdquo; to watch a pencil write each card onto a fresh deck while the AI crafts questions from your source, with live progress shown on a paper tag.
            </p>
          </div>
          <div className="paper rounded-lg p-4 space-y-1.5 border border-ink/10">
            <span className="text-[11px] font-bold uppercase tracking-wider text-brass-ink">Step 4</span>
            <h3 className="font-medium text-sm text-ink">Review the spread and study</h3>
            <p className="text-xs text-muted leading-relaxed">
              Your new cards land in a spread on the desk. Inspect them, click &ldquo;Start studying&rdquo; to practice with interactive modes, and sign in to save the deck to your library.
            </p>
          </div>
        </div>
      </section>

      {/* Section 2: Supported Study Materials */}
      <section id="inputs" className="space-y-4">
        <h2 className="font-serif text-xl sm:text-2xl font-normal text-ink border-b border-ink/10 pb-2">
          2. Supported Study Materials
        </h2>
        <p className="text-sm text-muted">
          FlashForge securely parses your documents and sends the extracted text to Google Gemini to formulate concise, high-yield study items:
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <div className="paper rounded-lg p-3.5 space-y-1 border border-ink/10">
            <h3 className="font-medium text-sm text-ink">📄 PDF Documents (.pdf)</h3>
            <p className="text-xs text-muted leading-relaxed">
              Upload textbook chapters, articles, and handouts. Long documents (even 40+ pages) are automatically sampled across the entire document so questions cover every chapter, not just the first few pages.
            </p>
          </div>

          <div className="paper rounded-lg p-3.5 space-y-1 border border-ink/10">
            <h3 className="font-medium text-sm text-ink">📝 Word & PowerPoint (.docx, .pptx)</h3>
            <p className="text-xs text-muted leading-relaxed">
              Upload lecture slide presentations and Word files. Text runs and speaker notes are extracted cleanly without uploading bloated media binaries.
            </p>
          </div>

          <div className="paper rounded-lg p-3.5 space-y-1 border border-ink/10">
            <h3 className="font-medium text-sm text-ink">📋 Pasted Notes</h3>
            <p className="text-xs text-muted leading-relaxed">
              Paste raw study notes or summaries directly onto the sheet (supports up to 30,000 characters). You can also override automatic guesses with &ldquo;Use it as notes&rdquo;.
            </p>
          </div>

          <div className="paper rounded-lg p-3.5 space-y-1 border border-ink/10">
            <h3 className="font-medium text-sm text-ink">🌐 Web Page Links (HTTP / HTTPS)</h3>
            <p className="text-xs text-muted leading-relaxed">
              Paste an article link. FlashForge strips out advertisements, cookie banners, navigation menus, and sidebars to extract the core learning material safely.
            </p>
          </div>

          <div className="paper rounded-lg p-3.5 space-y-1 border border-ink/10">
            <h3 className="font-medium text-sm text-ink">🔍 Topics (Wikipedia)</h3>
            <p className="text-xs text-muted leading-relaxed">
              Don&apos;t have any notes? Just type any topic like &ldquo;Photosynthesis&rdquo; or &ldquo;Treaty of Versailles&rdquo;. FlashForge automatically looks up the best Wikipedia article and credits it.
            </p>
          </div>

          <div className="paper rounded-lg p-3.5 space-y-1 border border-ink/10">
            <h3 className="font-medium text-sm text-ink">📷 Photos of Paper Notes</h3>
            <p className="text-xs text-muted leading-relaxed">
              Snap or upload photos of handwritten notes, textbook diagrams, or classroom whiteboards. Images are compressed in the browser and read directly using multimodal AI.
            </p>
          </div>
        </div>
      </section>

      {/* Section 3: Study Formats */}
      <section id="formats" className="space-y-4">
        <h2 className="font-serif text-xl sm:text-2xl font-normal text-ink border-b border-ink/10 pb-2">
          3. Study Guide Formats
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <div className="paper rounded-lg p-3.5 space-y-1 border border-ink/10">
            <h3 className="font-medium text-sm text-ink">🃏 Identification Flashcards</h3>
            <p className="text-xs text-muted leading-relaxed">
              A clear clue on the front and a concise 1–4 word term on the back. Designed specifically for active recall and rapid spaced repetition without bloated sentences.
            </p>
          </div>

          <div className="paper rounded-lg p-3.5 space-y-1 border border-ink/10">
            <h3 className="font-medium text-sm text-ink">🔘 Multiple Choice</h3>
            <p className="text-xs text-muted leading-relaxed">
              Four paper slips (A–D) under each question. Selecting a choice reveals immediate feedback, strikes through wrong picks, lifts the right answer with a brass edge, and shows source excerpts.
            </p>
          </div>

          <div className="paper rounded-lg p-3.5 space-y-1 border border-ink/10">
            <h3 className="font-medium text-sm text-ink">⚖️ True or False</h3>
            <p className="text-xs text-muted leading-relaxed">
              Concise statements to evaluate as True or False. If a statement is false, FlashForge provides a clear correction explaining why it is inaccurate.
            </p>
          </div>

          <div className="paper rounded-lg p-3.5 space-y-1 border border-ink/10">
            <h3 className="font-medium text-sm text-ink">📑 Mixed Quiz</h3>
            <p className="text-xs text-muted leading-relaxed">
              Organized like a comprehensive classroom exam in parts: Part I (Multiple Choice), Part II (True or False), and Part III (Typed Identification).
            </p>
          </div>
        </div>
      </section>

      {/* Section 4: Practice Modes on the Desk */}
      <section id="study-modes" className="space-y-4">
        <h2 className="font-serif text-xl sm:text-2xl font-normal text-ink border-b border-ink/10 pb-2">
          4. Practice Modes on the Desk
        </h2>
        <p className="text-sm text-muted">
          All study sessions run directly on the green leather desk with tactile paper cards, Got it / Missed it piles, and brass study tools:
        </p>
        <div className="space-y-3 text-sm">
          <div className="paper rounded-lg p-3.5 space-y-1 border border-ink/10">
            <h3 className="font-medium text-sm text-ink">🔄 Flip Cards</h3>
            <p className="text-xs text-muted leading-relaxed">
              Click the card or press Space/Enter to flip between the clue and the answer. Sort cards onto the <strong>Got it</strong> (→ arrow) or <strong>Missed it</strong> (← arrow) piles.
            </p>
          </div>

          <div className="paper rounded-lg p-3.5 space-y-1 border border-ink/10">
            <h3 className="font-medium text-sm text-ink">⌨️ Type the Answer</h3>
            <p className="text-xs text-muted leading-relaxed">
              Practice exact recall by typing your answer directly onto the card line. Intelligent fuzzy matching accepts minor misspellings and provides immediate feedback.
            </p>
          </div>

          <div className="paper rounded-lg p-3.5 space-y-1 border border-ink/10">
            <h3 className="font-medium text-sm text-ink">🧩 Matching Mode</h3>
            <p className="text-xs text-muted leading-relaxed">
              Interactive rounds of paper slips laid out across the desk. Pick a clue and then its matching term to clear pairs with brass outlines.
            </p>
          </div>

          <div className="paper rounded-lg p-3.5 space-y-1 border border-ink/10">
            <h3 className="font-medium text-sm text-ink">🔊 Read Aloud & Auto</h3>
            <p className="text-xs text-muted leading-relaxed">
              Use the brass Read Aloud button to listen to clues and answers using browser speech synthesis. Enable Auto to advance through the deck hands-free.
            </p>
          </div>

          <div className="paper rounded-lg p-3.5 space-y-1 border border-ink/10">
            <h3 className="font-medium text-sm text-ink">✏️ Pencil (Edit Cards)</h3>
            <p className="text-xs text-muted leading-relaxed">
              Click the pencil icon on the desk to open the Card Editor. You can modify questions and answers, add new cards, remove cards, or reorder them.
            </p>
          </div>

          <div className="paper rounded-lg p-3.5 space-y-1 border border-ink/10">
            <h3 className="font-medium text-sm text-ink">🎯 Missed-it Practice</h3>
            <p className="text-xs text-muted leading-relaxed">
              When a deck finishes, click the Missed it (or Wrong) pile to drill only the cards you missed for extra practice without affecting your official score.
            </p>
          </div>

          <div className="paper rounded-lg p-3.5 space-y-1 border border-ink/10">
            <h3 className="font-medium text-sm text-ink">📖 Source Quotes</h3>
            <p className="text-xs text-muted leading-relaxed">
              Each card references the exact excerpt from your uploaded notes or document where the fact was derived, verifying credibility.
            </p>
          </div>
        </div>
      </section>

      {/* Section 5: The Library */}
      <section id="library" className="space-y-4">
        <h2 className="font-serif text-xl sm:text-2xl font-normal text-ink border-b border-ink/10 pb-2">
          5. The Library: Card Box, My Sets & History
        </h2>
        <div className="space-y-3 text-sm">
          <p className="text-xs text-muted leading-relaxed">
            The top header of the desk houses your <strong>Card Box</strong> on the left and your <strong>Library Card</strong> on the right:
          </p>
          <ul className="list-disc pl-5 space-y-2 text-xs text-muted">
            <li>
              <strong className="text-ink">Card Box Tabs:</strong> Sticking up from the wooden box are divider tabs for quick navigation: <em>My Sets</em>, <em>History</em>, <em>My Classes</em> (or <em>Classes</em> for teachers), and <em>Guide</em>.
            </li>
            <li>
              <strong className="text-ink">My Sets:</strong> Each saved set is displayed as a real deck on the green leather desk, tagged with your best score (e.g. <em>Best 9 of 10</em>) or <em>Not studied yet</em>. Picking up a deck morphs smoothly into your study session.
            </li>
            <li>
              <strong className="text-ink">History:</strong> Every study guide you generate while signed in is automatically archived in History, tagged by date and marked as <em>saved</em> or <em>not saved</em>. You can study any past guide or save it to My Sets anytime.
            </li>
            <li>
              <strong className="text-ink">Library Card:</strong> Shows your account name, role, and Sign out button. Sign in with Google to sync all your decks, progress, and class memberships across devices.
            </li>
          </ul>
        </div>
      </section>

      {/* Section 6: Teachers & Classes */}
      <section id="teachers" className="space-y-4">
        <h2 className="font-serif text-xl sm:text-2xl font-normal text-ink border-b border-ink/10 pb-2">
          6. Teachers & Classes
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          <div className="paper rounded-lg p-4 space-y-2 border border-ink/10">
            <h3 className="font-medium text-sm text-ink">For Teachers</h3>
            <ul className="list-disc pl-5 space-y-1.5 text-xs text-muted leading-relaxed">
              <li>Manage your classes using kraft folders with brass join-code plates.</li>
              <li>Share clean join codes (e.g. &ldquo;ABC-123&rdquo;) with students.</li>
              <li>Assign study decks to your classes with optional due dates.</li>
              <li>Open the <strong>Grade Book</strong> to see student attempts, class averages, and export CSV reports.</li>
              <li>Review <strong>Most-missed questions</strong> to pinpoint difficult concepts before tests.</li>
            </ul>
          </div>

          <div className="paper rounded-lg p-4 space-y-2 border border-ink/10">
            <h3 className="font-medium text-sm text-ink">For Students</h3>
            <ul className="list-disc pl-5 space-y-1.5 text-xs text-muted leading-relaxed">
              <li>Visit the <strong>My Classes</strong> tab and enter your teacher&apos;s join code on the paper card.</li>
              <li>View all class assignments in designated leather trays, tagged with due dates (<em>Due Fri</em>, <em>Overdue</em>, or <em>Done</em>).</li>
              <li>Take assigned quizzes and study sets; scores sync directly to your teacher&apos;s grade book.</li>
            </ul>
          </div>
        </div>
      </section>

      {/* Section 7: Tips & FAQ */}
      <section id="faq" className="space-y-4">
        <h2 className="font-serif text-xl sm:text-2xl font-normal text-ink border-b border-ink/10 pb-2">
          7. Tips & Frequently Asked Questions
        </h2>
        <div className="space-y-3 text-sm">
          <div className="paper rounded-lg p-3.5 space-y-1 border border-ink/10">
            <h3 className="font-medium text-sm text-ink">Is FlashForge free?</h3>
            <p className="text-xs text-muted leading-relaxed">
              Yes! FlashForge is completely free to use. Daily study guide generation quotas reset automatically every 24 hours.
            </p>
          </div>
          <div className="paper rounded-lg p-3.5 space-y-1 border border-ink/10">
            <h3 className="font-medium text-sm text-ink">Can I study without creating an account?</h3>
            <p className="text-xs text-muted leading-relaxed">
              Yes. You can generate and practice study decks as a guest without signing in. Signing in is only needed to persist decks in My Sets, track History, or join classes.
            </p>
          </div>
          <div className="paper rounded-lg p-3.5 space-y-1 border border-ink/10">
            <h3 className="font-medium text-sm text-ink">Are there keyboard shortcuts for studying?</h3>
            <p className="text-xs text-muted leading-relaxed">
              Yes! Press Space or Enter to flip a card, → for Got it / Right, ← for Missed it / Wrong, and Esc to dismiss menus and dialogs.
            </p>
          </div>
        </div>
      </section>

      {/* Bottom CTA */}
      <div className="pt-6 border-t border-ink/10 flex flex-col sm:flex-row items-center justify-between gap-4 text-center sm:text-left">
        <div>
          <p className="font-serif text-base font-normal text-ink">Ready to craft your study deck?</p>
          <p className="text-xs text-muted">Place your notes or documents on the sheet to get started.</p>
        </div>
        <Link href="/" className="btn btn-primary">
          Make a study deck →
        </Link>
      </div>
    </main>
  );
}
