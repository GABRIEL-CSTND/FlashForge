'use client';

import { useEffect } from 'react';
import Link from 'next/link';

// Friendly error page (#91): sits on the desk sheet when a page throws.
// Try again calls retry(), which loads the page again; reset() would only draw
// it again without loading anything (this Next version's error.js docs).
export default function ErrorPage({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error('[FlashForge error]', error);
  }, [error]);

  return (
    <main className="flex min-h-[50vh] flex-1 flex-col items-center justify-center p-6 text-center text-ink sm:p-12">
      <div className="max-w-md space-y-4">
        <h1 className="font-serif text-3xl font-normal text-pencil sm:text-4xl">Something went wrong</h1>
        <p className="text-sm leading-relaxed text-muted sm:text-base">
          An unexpected error occurred while loading this page. You can try loading it again or return to the desk.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3 pt-3">
          <button type="button" onClick={() => retry()} className="btn btn-primary min-h-11 px-5">
            Try again
          </button>
          <Link href="/" className="btn btn-secondary min-h-11 px-5">
            Back to desk
          </Link>
        </div>
      </div>
    </main>
  );
}
