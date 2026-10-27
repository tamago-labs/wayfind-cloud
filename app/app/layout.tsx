import type { Metadata } from 'next';
import AppNav from '@/components/app/AppNav';

export const metadata: Metadata = {
  title: 'Wayfind Cloud — Your Bots',
  description: 'Your Finder Bots, chats, computer, skills and routines.',
};

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-paper text-ink flex flex-col md:flex-row">
      <AppNav />
      <main className="flex-1 min-w-0 px-5 md:px-8 py-6 md:py-8 w-full max-w-[980px] mx-auto">
        {children}
      </main>
    </div>
  );
}
