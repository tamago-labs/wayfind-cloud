import type { Metadata } from 'next';
import Header from '@/components/landing/Header';
import Footer from '@/components/landing/Footer';
import Sidebar from '@/components/docs/Sidebar';
import DocNav from '@/components/docs/DocNav';

export const metadata: Metadata = {
  title: 'Docs — Wayfind Cloud',
  description:
    'Wayfind Cloud docs: quickstart, Bots, cloud computer, connectors and billing for your AI team.',
};

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-herobg font-brico text-navy">
      <Header />
      <div className="mx-auto max-w-6xl px-6 pb-24 pt-6">
        <div className="lg:grid lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-12">
          <Sidebar />
          <main className="min-w-0 max-w-3xl">
            {children}
            <DocNav />
          </main>
        </div>
      </div>
      <Footer />
    </div>
  );
}
