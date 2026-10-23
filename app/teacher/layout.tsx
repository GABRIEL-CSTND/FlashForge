import type { Metadata } from 'next';

// The page is a Client Component, so its browser title is set here. Pages
// below set their own, and need the template passed on again.
export const metadata: Metadata = { title: { default: 'Teacher dashboard', template: '%s · FlashForge' } };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
