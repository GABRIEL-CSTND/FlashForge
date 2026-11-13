import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'User Guide',
  description:
    'Comprehensive guide on how to use FlashForge: making decks from files, notes, web links and topics, study modes on the desk, saving sets, and teacher tools.',
};

export default function GuideLayout({ children }: { children: React.ReactNode }) {
  return children;
}
