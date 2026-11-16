import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy',
  description: 'What data FlashForge keeps, why it is stored, and how to delete it.',
};

export default function PrivacyLayout({ children }: { children: React.ReactNode }) {
  return children;
}
