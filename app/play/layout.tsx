import type { Metadata } from 'next';

// The pages are Client Components, so their browser title is set here.
export const metadata: Metadata = { title: 'Play live' };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
