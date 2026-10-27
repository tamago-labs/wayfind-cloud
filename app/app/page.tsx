import Link from 'next/link';
import { Logo } from '@/components/landing/Header';
import Mascot from '@/components/Mascot';

export const metadata = {
  title: 'Wayfind Cloud — Your Bots',
  description: 'Your Bots live here soon. Early access.',
};

export default function AppPlaceholderPage() {
  return (
    <div className="min-h-screen bg-ice font-brico text-navy flex flex-col items-center justify-center px-6 text-center">
      <Logo />
      <div className="mt-10 flex justify-center -space-x-3">
        <Mascot color="amber" size="md" motion="none" className="ring-4 ring-ice" />
        <Mascot color="moss" size="md" motion="none" blinkDelay="-1.7s" className="ring-4 ring-ice" />
        <Mascot color="lagoon" size="md" motion="none" blinkDelay="-3.1s" className="ring-4 ring-ice" />
        <Mascot color="ash" size="md" motion="none" blinkDelay="-4.4s" className="ring-4 ring-ice" />
      </div>
      <h1 className="mt-8 text-4xl font-extrabold tracking-tight sm:text-5xl">
        Your Bots live here soon.
      </h1>
      <p className="mt-4 max-w-md text-lg text-heroslate">
        The app opens with the backend rollout. Join early access and we&rsquo;ll notify you.
      </p>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
        <Link
          href="/"
          className="rounded-full bg-navy px-7 py-3.5 font-semibold text-white hover:opacity-90 transition-opacity"
        >
          Back to site
        </Link>
      </div>
    </div>
  );
}
