import type { Metadata } from 'next';

// The page is a Client Component, so its browser title is set here.
export const metadata: Metadata = {
  title: 'User Guide',
  description: 'Learn how to generate study guides, practice flashcards, take quizzes, and manage classes in FlashForge.',
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
