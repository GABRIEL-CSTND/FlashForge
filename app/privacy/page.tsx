'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { signInWithGoogle, signOut, useUser } from '@/lib/auth';
import { useProfile } from '@/components/ProfileProvider';
import { apiFetch } from '@/lib/api-client';

export default function PrivacyPage() {
  const router = useRouter();
  const { user, loading: userLoading } = useUser();
  const { profile } = useProfile();

  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');
  const [showConfirm, setShowConfirm] = useState(false);

  const handleDeleteAccount = async () => {
    setDeleting(true);
    setError('');
    try {
      const res = await apiFetch('/api/profile/data', {
        method: 'DELETE',
        body: { confirm: true },
      });

      if (!res.ok) {
        const data = res.data as { error?: string };
        setError(data?.error || "Couldn't delete your account. Please try again.");
        setDeleting(false);
        return;
      }

      // Sign out and redirect to home desk
      await signOut();
      router.push('/');
    } catch {
      setError('Could not reach the server. Please check your connection and try again.');
      setDeleting(false);
    }
  };

  return (
    <main className="min-h-screen w-full max-w-4xl mx-auto p-4 sm:p-8 space-y-10 text-ink">
      {/* Header */}
      <header className="space-y-3 border-b border-ink/10 pb-5">
        <div className="flex items-center justify-between">
          <Link
            href="/"
            className="inline-flex items-center gap-1 text-sm font-semibold text-brass-ink hover:underline"
          >
            ← Back to Desk
          </Link>
          <span className="text-xs uppercase tracking-widest text-muted font-semibold">Privacy Policy</span>
        </div>
        <div className="space-y-1">
          <h1 className="font-serif text-3xl sm:text-4xl font-normal tracking-tight text-ink">
            Privacy & Your Data
          </h1>
          <p className="text-muted text-sm sm:text-base max-w-2xl">
            How FlashForge handles your personal information, who can view your study progress, and how to delete your data.
          </p>
        </div>
      </header>

      {/* Section 1: What is stored */}
      <section className="space-y-3">
        <h2 className="font-serif text-xl sm:text-2xl font-normal text-ink border-b border-ink/10 pb-2">
          1. What We Store
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          <div className="paper rounded-lg p-4 space-y-1.5 border border-ink/10">
            <h3 className="font-medium text-sm text-ink">Account Profile</h3>
            <p className="text-xs text-muted leading-relaxed">
              When you sign in with Google, we store your Google email address, display name, and chosen role (Student, Teacher, or Admin) to identify your account.
            </p>
          </div>

          <div className="paper rounded-lg p-4 space-y-1.5 border border-ink/10">
            <h3 className="font-medium text-sm text-ink">Saved Decks & Cards</h3>
            <p className="text-xs text-muted leading-relaxed">
              The study guides and flashcards you save to <strong>My Sets</strong> are stored securely in our database so you can revisit, edit, or practice them anytime.
            </p>
          </div>

          <div className="paper rounded-lg p-4 space-y-1.5 border border-ink/10">
            <h3 className="font-medium text-sm text-ink">Guide History</h3>
            <p className="text-xs text-muted leading-relaxed">
              Study guides generated while signed in are kept in your private <strong>History</strong> log, allowing you to review past materials or save them to your library later.
            </p>
          </div>

          <div className="paper rounded-lg p-4 space-y-1.5 border border-ink/10">
            <h3 className="font-medium text-sm text-ink">Study Attempts & Scores</h3>
            <p className="text-xs text-muted leading-relaxed">
              When you finish practicing a deck, we record your score, date, and question accuracy so you can monitor your progress over time.
            </p>
          </div>

          <div className="paper rounded-lg p-4 space-y-1.5 border border-ink/10">
            <h3 className="font-medium text-sm text-ink">Classes & Memberships</h3>
            <p className="text-xs text-muted leading-relaxed">
              For teachers, we store the classes you create, rosters, and assigned decks. For students, we store the classes you join using teacher join codes.
            </p>
          </div>

          <div className="paper rounded-lg p-4 space-y-1.5 border border-ink/10">
            <h3 className="font-medium text-sm text-ink">AI Use</h3>
            <p className="text-xs text-muted leading-relaxed">
              Each study guide you make is logged (when, what kind, which AI model, whether it worked) to keep the daily limit and spot problems. Signed out, the log keeps a scrambled (hashed) form of your internet address instead of an account, so the limit works for guests too.
            </p>
          </div>
        </div>
      </section>

      {/* Section 2: Who can see your data */}
      <section className="space-y-3">
        <h2 className="font-serif text-xl sm:text-2xl font-normal text-ink border-b border-ink/10 pb-2">
          2. Who Can See Your Data
        </h2>
        <div className="space-y-3 text-sm text-muted leading-relaxed">
          <p>
            <strong className="text-ink">Your Decks & History:</strong> Other students and teachers can&apos;t see the decks in your My Sets or your History. A deck a teacher assigns to a class can be studied by the students in that class.
          </p>
          <p>
            <strong className="text-ink">Class Assignments:</strong> When you join a class, the teacher of that class can see your name, email, and your scores on sets assigned specifically to that class (in their Grade Book). Teachers <em>cannot</em> view your private, unassigned sets or unrelated history.
          </p>
          <p>
            <strong className="text-ink">Administrators:</strong> Admins can see every account&apos;s email, name and role, and change roles. They can open or delete any saved deck, and they see its owner&apos;s email. They can also see how many study guides each person has made with the AI. They can&apos;t see your History.
          </p>
          <p>
            <strong className="text-ink">Google&apos;s Gemini AI:</strong> What you put on the notes sheet (a file&apos;s text, a photo, your notes, or the page a link or topic leads to) is sent to Google&apos;s Gemini API to write your cards. FlashForge uses the API&apos;s free tier, and under Google&apos;s terms for it, Google may use what&apos;s sent, and the cards it writes, to improve its products, and people at Google may read them. So don&apos;t put anything private or sensitive on the sheet.
          </p>
          <p>
            <strong className="text-ink">No Ads or Tracking:</strong> FlashForge doesn&apos;t sell your data, show ads, or track you across other sites.
          </p>
        </div>
      </section>

      {/* Section 3: Retention & Deletion Policy */}
      <section className="space-y-3">
        <h2 className="font-serif text-xl sm:text-2xl font-normal text-ink border-b border-ink/10 pb-2">
          3. Retention & Deletion Policy
        </h2>
        <div className="space-y-3 text-sm text-muted leading-relaxed">
          <p>
            Your data is stored for as long as your account remains active. You can delete individual decks from My Sets, remove history items, or leave classes at any time.
          </p>
          <p>
            <strong className="text-ink">What happens if a teacher deletes their account?</strong> The classes they made, the decks they assigned, and their students&apos; scores on those decks are deleted. Students keep their accounts, their own decks, and their other scores.
          </p>
        </div>
      </section>

      {/* Section 4: Account Deletion */}
      <section className="space-y-4 pt-4 border-t border-ink/10">
        <h2 className="font-serif text-xl sm:text-2xl font-normal text-ink">
          4. Delete Your Account & Data
        </h2>

        {userLoading ? (
          <p className="text-sm text-muted">Checking account status...</p>
        ) : user ? (
          <div className="paper paper-shadow rounded-lg p-5 border border-pencil/30 space-y-4 bg-pencil/5">
            <div>
              <p className="text-sm font-medium text-ink">
                Signed in as: <span className="font-serif text-base">{profile?.displayName || user.email}</span> ({user.email})
              </p>
              <p className="text-xs text-muted mt-1 leading-relaxed">
                Deleting your account permanently removes it with your saved decks and cards, History, scores, class memberships, and the classes you teach. Records of AI use and of admin actions are kept, without your name or email. This is immediate and can&apos;t be undone: signing in with Google again later starts a new, empty account.
              </p>
            </div>

            {error && (
              <p role="alert" className="text-sm font-medium text-pencil">
                {error}
              </p>
            )}

            {!showConfirm ? (
              <button
                type="button"
                onClick={() => setShowConfirm(true)}
                className="btn btn-secondary text-pencil border-pencil/40 hover:bg-pencil/10 min-h-11 px-5"
              >
                Delete my account and data
              </button>
            ) : (
              <div className="space-y-3 pt-2">
                <p className="text-sm font-semibold text-pencil">
                  Are you absolutely sure? Everything tied to your account will be erased.
                </p>
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={handleDeleteAccount}
                    disabled={deleting}
                    className="btn btn-primary bg-pencil text-white hover:bg-pencil/90 min-h-11 px-5"
                  >
                    {deleting ? 'Deleting...' : 'Yes, delete everything'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowConfirm(false)}
                    disabled={deleting}
                    className="btn btn-secondary min-h-11 px-5"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="paper rounded-lg p-5 border border-ink/10 space-y-3">
            <p className="text-sm text-muted leading-relaxed">
              You are signed out. For guests, FlashForge keeps no account, decks, or History, only the AI use log described above. If you have an account and want to delete it and its data, sign in.
            </p>
            <button
              type="button"
              onClick={() => signInWithGoogle()}
              className="btn btn-primary min-h-11 px-5"
            >
              Sign in with Google
            </button>
          </div>
        )}
      </section>
    </main>
  );
}
