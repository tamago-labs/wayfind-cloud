import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Wayfind Cloud — Your Bots',
  description: 'Message your Bots. They work on your cloud computer.',
};

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return children;
}
