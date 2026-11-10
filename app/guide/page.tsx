'use client';

import Link from 'next/link';

export default function GuidePage() {
  return (
    <main className="min-h-screen w-full p-6 max-w-3xl mx-auto space-y-10">
      {/* Top Header */}
      <header className="space-y-3">
        <div className="flex items-center justify-between">
          <Link href="/" className="text-sm text-link hover:underline">
            ← Back to FlashForge
          </Link>
          <span className="text-xs uppercase tracking-wider text-gray-400 font-medium">Documentation</span>
        </div>
        <div className="space-y-1">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">How to Use FlashForge</h1>
          <p className="text-gray-500 text-sm sm:text-base">
            Your comprehensive guide to generating AI-powered study materials, mastering practice modes, saving sets,
            and managing classes.
          </p>
        </div>

        {/* Quick jump bar */}
        <nav
          aria-label="Table of contents"
          className="flex flex-wrap gap-2 pt-2 border-t text-xs font-medium text-gray-500"
        >
          <a href="#quick-start" className="hover:text-link hover:underline">
            Quick Start
          </a>
          <span>·</span>
          <a href="#inputs" className="hover:text-link hover:underline">
            Supported Files & Notes
          </a>
          <span>·</span>
          <a href="#formats" className="hover:text-link hover:underline">
            Study Guide Formats
          </a>
          <span>·</span>
          <a href="#study-modes" className="hover:text-link hover:underline">
            Practice Modes
          </a>
          <span>·</span>
          <a href="#saving-history" className="hover:text-link hover:underline">
            Saving & History
          </a>
          <span>·</span>
          <a href="#teachers" className="hover:text-link hover:underline">
            Teachers & Classes
          </a>
          <span>·</span>
          <a href="#faq" className="hover:text-link hover:underline">
            FAQ
          </a>
        </nav>
      </header>

      {/* Section 1: Quick Start */}
      <section id="quick-start" className="space-y-4">
        <h2 className="text-lg font-semibold border-b pb-2">1. Quick Start in 4 Steps</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="border rounded-lg p-4 space-y-1 bg-accent/5 border-accent/20">
            <span className="text-xs font-bold text-link uppercase tracking-wider">Step 1</span>
            <h3 className="font-medium text-sm">Provide your notes</h3>
            <p className="text-xs text-gray-500">
              Drop a file (PDF, Word, PowerPoint, TXT), paste text, link a web page, or type any topic.
            </p>
          </div>
          <div className="border rounded-lg p-4 space-y-1 bg-accent/5 border-accent/20">
            <span className="text-xs font-bold text-link uppercase tracking-wider">Step 2</span>
            <h3 className="font-medium text-sm">Pick your format</h3>
            <p className="text-xs text-gray-500">
              Select Flashcards, Multiple Choice, True or False, or a multi-part Mixed Quiz.
            </p>
          </div>
          <div className="border rounded-lg p-4 space-y-1 bg-accent/5 border-accent/20">
            <span className="text-xs font-bold text-link uppercase tracking-wider">Step 3</span>
            <h3 className="font-medium text-sm">Set questions & difficulty</h3>
            <p className="text-xs text-gray-500">
              Choose from 5 to 30 questions, and set the challenge level: Easy, Medium, or Hard.
            </p>
          </div>
          <div className="border rounded-lg p-4 space-y-1 bg-accent/5 border-accent/20">
            <span className="text-xs font-bold text-link uppercase tracking-wider">Step 4</span>
            <h3 className="font-medium text-sm">Study and save</h3>
            <p className="text-xs text-gray-500">
              Flip, type answers, play matching rounds, listen aloud, and sign in to save your set to My Sets.
            </p>
          </div>
        </div>
      </section>

      {/* Section 2: What You Can Upload */}
      <section id="inputs" className="space-y-4">
        <h2 className="text-lg font-semibold border-b pb-2">2. Supported Study Materials</h2>
        <p className="text-sm text-gray-500">
          FlashForge extracts readable content safely and feeds it to Google Gemini to formulate questions:
        </p>
        <div className="space-y-3">
          <div className="border rounded-lg p-3 space-y-1">
            <h3 className="text-sm font-medium">📄 PDF Files (.pdf)</h3>
            <p className="text-xs text-gray-500">
              Upload textbook chapters, slide handouts, and articles. Long documents (even 40+ pages) are automatically
              sampled across the beginning, middle, and end so questions cover your whole document. Scanned image PDFs
              and password-protected PDFs are also supported.
            </p>
          </div>

          <div className="border rounded-lg p-3 space-y-1">
            <h3 className="text-sm font-medium">📝 Word & PowerPoint (.docx, .pptx)</h3>
            <p className="text-xs text-gray-500">
              Upload lecture slide presentations and Word handouts. Only text runs and speaker notes are extracted,
              shielding your files against oversized archives.
            </p>
          </div>

          <div className="border rounded-lg p-3 space-y-1">
            <h3 className="text-sm font-medium">📋 Pasted Notes</h3>
            <p className="text-xs text-gray-500">
              Quickly paste raw study notes or summaries directly into the text box (supports up to 30,000 characters).
            </p>
          </div>

          <div className="border rounded-lg p-3 space-y-1">
            <h3 className="text-sm font-medium">🌐 Web Page Links (HTTPS)</h3>
            <p className="text-xs text-gray-500">
              Paste a link to any online article or reference page. FlashForge strips out advertisements, sidebars, and
              navigation headers to study the core article.
            </p>
          </div>

          <div className="border rounded-lg p-3 space-y-1">
            <h3 className="text-sm font-medium">🔍 Topics (Wikipedia)</h3>
            <p className="text-xs text-gray-500">
              Don&apos;t have any notes? Just type a topic like &ldquo;Photosynthesis&rdquo; or &ldquo;Treaty of
              Versailles&rdquo;. FlashForge looks up the best Wikipedia article and generates accurate study questions.
            </p>
          </div>

          <div className="border rounded-lg p-3 space-y-1">
            <h3 className="text-sm font-medium">📷 Photos of Paper Notes</h3>
            <p className="text-xs text-gray-500">
              Take or upload photos of your handwritten notes, textbooks, or classroom whiteboards. FlashForge shrinks
              them for quick transmission and reads them directly with multimodal AI.
            </p>
          </div>
        </div>
      </section>

      {/* Section 3: Study Guide Formats */}
      <section id="formats" className="space-y-4">
        <h2 className="text-lg font-semibold border-b pb-2">3. Study Guide Formats</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <div className="border rounded-lg p-3 space-y-1">
            <h3 className="font-medium text-sm">🃏 Identification Flashcards</h3>
            <p className="text-xs text-gray-500">
              Clear clue on the front, concise 1–4 word term on the back. Ideal for memorizing terms, vocabulary, dates,
              and definitions.
            </p>
          </div>
          <div className="border rounded-lg p-3 space-y-1">
            <h3 className="font-medium text-sm">🔘 Multiple Choice</h3>
            <p className="text-xs text-gray-500">
              Four options with exactly one correct answer in a randomized slot. Gives immediate feedback when you tap an
              option.
            </p>
          </div>
          <div className="border rounded-lg p-3 space-y-1">
            <h3 className="font-medium text-sm">⚖️ True or False</h3>
            <p className="text-xs text-gray-500">
              Test your grasp of factual statements. When a statement is false, FlashForge provides the corrected fact
              so you learn the truth right away.
            </p>
          </div>
          <div className="border rounded-lg p-3 space-y-1">
            <h3 className="font-medium text-sm">📝 Mixed Quiz</h3>
            <p className="text-xs text-gray-500">
              Structured like a real school exam: Part I (Multiple Choice), Part II (True or False), and Part III (Typed
              Identification).
            </p>
          </div>
        </div>
      </section>

      {/* Section 4: Practice Modes */}
      <section id="study-modes" className="space-y-4">
        <h2 className="text-lg font-semibold border-b pb-2">4. Ways to Practice & Study</h2>
        <div className="space-y-3 text-sm">
          <div className="border rounded-lg p-3 space-y-1">
            <h3 className="font-medium">Flip Cards (Self-Assessment)</h3>
            <p className="text-xs text-gray-500">
              Click or tap any flashcard to flip between the clue and the answer. Mark &ldquo;Got it&rdquo; or
              &ldquo;Missed it&rdquo; to track your progress, with a button to review missed cards at the end.
            </p>
          </div>
          <div className="border rounded-lg p-3 space-y-1">
            <h3 className="font-medium">Type the Answer (Active Recall)</h3>
            <p className="text-xs text-gray-500">
              Type your answer to test deep recall. The checker tolerates minor spelling mistakes (1 small typo),
              accents, and letter casing so you aren&apos;t penalized unfairly.
            </p>
          </div>
          <div className="border rounded-lg p-3 space-y-1">
            <h3 className="font-medium">Matching Mode</h3>
            <p className="text-xs text-gray-500">
              Connect cards and terms in timed rounds of up to 5 pairs. A fun, interactive way to solidify your grasp on
              definitions.
            </p>
          </div>
          <div className="border rounded-lg p-3 space-y-1">
            <h3 className="font-medium">🔊 Read Aloud</h3>
            <p className="text-xs text-gray-500">
              Click the speaker icon to listen to questions, options, and answers using your device&apos;s built-in voice
              synthesis. Turn on the &ldquo;Auto&rdquo; switch for continuous, hands-free audio review.
            </p>
          </div>
          <div className="border rounded-lg p-3 space-y-1">
            <h3 className="font-medium">📌 Source Quotes & Verification</h3>
            <p className="text-xs text-gray-500">
              Under each revealed answer or quiz explanation, FlashForge shows the exact sentence and page or line number
              from your uploaded document (e.g., &ldquo;Page 4&rdquo; or &ldquo;Line 18&rdquo;) so you can verify facts
              directly in your source notes.
            </p>
          </div>
        </div>
      </section>

      {/* Section 5: Saving & History */}
      <section id="saving-history" className="space-y-4">
        <h2 className="text-lg font-semibold border-b pb-2">5. Saving, Editing & History</h2>
        <div className="space-y-3 text-sm">
          <p className="text-xs text-gray-500">
            Sign in with Google to unlock full persistence across all your devices:
          </p>
          <ul className="list-disc pl-5 space-y-2 text-xs text-gray-600">
            <li>
              <strong>My Sets:</strong> Save your favorite study guides to revisit anytime. You can rename sets, study
              them in different modes, or delete them when finished.
            </li>
            <li>
              <strong>Card Editor:</strong> Need to fix an AI typo or add a new question? Click &ldquo;Edit
              cards&rdquo; on any saved set to modify questions and answers, add cards, remove cards, or reorder them.
            </li>
            <li>
              <strong>History:</strong> Every study guide you generate while signed in is automatically archived in your
              History tab, even if you forgot to save it. You can open any historical guide to study or save it to My Sets
              later.
            </li>
            <li>
              <strong>Saved Scores:</strong> Your completed quiz and study runs are logged with your percentage score and
              date so you can watch your improvement over time.
            </li>
          </ul>
        </div>
      </section>

      {/* Section 6: Teachers & Classes */}
      <section id="teachers" className="space-y-4">
        <h2 className="text-lg font-semibold border-b pb-2">6. Teachers & Classes</h2>
        <div className="space-y-3 text-sm">
          <div className="border rounded-lg p-3 space-y-2">
            <h3 className="font-medium text-sm">For Teachers</h3>
            <ul className="list-disc pl-5 space-y-1 text-xs text-gray-500">
              <li>Choose the &ldquo;Teacher&rdquo; role when signing up (or switch roles via your profile).</li>
              <li>Create classes and share easy join codes (e.g., &ldquo;ABC-123&rdquo;) with your students.</li>
              <li>Assign study sets directly to your classes with an optional due date.</li>
              <li>
                Track your students&apos; best scores and attempt counts, download full grade reports as CSV, and review
                the <strong>Most-missed questions</strong> to know which concepts need review in class.
              </li>
            </ul>
          </div>

          <div className="border rounded-lg p-3 space-y-2">
            <h3 className="font-medium text-sm">For Students</h3>
            <ul className="list-disc pl-5 space-y-1 text-xs text-gray-500">
              <li>Head to <strong>My Classes</strong> and enter your teacher&apos;s join code.</li>
              <li>Immediately view all assignments, due dates, and your past scores in one place.</li>
            </ul>
          </div>
        </div>
      </section>

      {/* Section 7: Tips & FAQ */}
      <section id="faq" className="space-y-4">
        <h2 className="text-lg font-semibold border-b pb-2">7. Tips & Frequently Asked Questions</h2>
        <div className="space-y-3 text-sm">
          <div className="border rounded-lg p-3 space-y-1">
            <h3 className="font-medium text-sm">Is FlashForge free?</h3>
            <p className="text-xs text-gray-500">
              Yes! FlashForge is completely free to use. To ensure fair access for everyone, daily generation limits
              apply per role and reset every 24 hours.
            </p>
          </div>
          <div className="border rounded-lg p-3 space-y-1">
            <h3 className="font-medium text-sm">Can I study without creating an account?</h3>
            <p className="text-xs text-gray-500">
              Yes. You can generate and practice study guides without signing in. Signing in is only needed if you want to
              save sets, view history, or join classes.
            </p>
          </div>
          <div className="border rounded-lg p-3 space-y-1">
            <h3 className="font-medium text-sm">What makes FlashForge cards effective?</h3>
            <p className="text-xs text-gray-500">
              FlashForge generates strict identification-style cards (1–4 word terms as answers, never long paragraphs)
              to facilitate rapid active recall and spaced repetition.
            </p>
          </div>
        </div>
      </section>

      {/* Bottom CTA */}
      <div className="pt-4 border-t flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-left">
        <div>
          <p className="font-medium text-sm">Ready to start studying?</p>
          <p className="text-xs text-gray-500">Create your first AI study guide in seconds.</p>
        </div>
        <Link href="/" className="btn btn-primary">
          Generate a study guide →
        </Link>
      </div>
    </main>
  );
}
