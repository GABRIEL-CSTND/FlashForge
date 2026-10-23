import type { Metadata } from 'next';

// The page is a Client Component, so its browser title is set here.
export const metadata: Metadata = { title: 'Users and roles' };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
