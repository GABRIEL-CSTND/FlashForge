import Link from 'next/link';

export const metadata = {
  title: 'Page Not Found',
};

// Friendly 404 page (#91): sits on the desk sheet and offers a way back to the library.
export default function NotFound() {
  return (
    <main className="flex min-h-[50vh] flex-1 flex-col items-center justify-center p-6 text-center text-ink sm:p-12">
      <div className="max-w-md space-y-4">
        <p className="font-serif text-5xl font-normal text-brass-ink sm:text-6xl">404</p>
        <h1 className="font-serif text-2xl font-normal tracking-tight text-ink sm:text-3xl">Page not found</h1>
        <p className="text-sm leading-relaxed text-muted sm:text-base">
          This desk has no page by that name. The link might be broken, or the page may have been moved.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3 pt-3">
          <Link href="/" className="btn btn-primary min-h-11 px-5">
            Make a study deck
          </Link>
          <Link href="/my-sets" className="btn btn-secondary min-h-11 px-5">
            Back to library
          </Link>
        </div>
      </div>
    </main>
  );
}
