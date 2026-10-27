'use client';

import Header from '@/components/landing/Header';
import Hero from '@/components/landing/Hero';
import Problem from '@/components/landing/Problem';
import HowSection from '@/components/landing/HowSection';
import Bots from '@/components/landing/Bots';
import Trust from '@/components/landing/Trust';
import Pricing from '@/components/landing/Pricing';
import Faq from '@/components/landing/Faq';
import FinalCta from '@/components/landing/FinalCta';
import Footer from '@/components/landing/Footer';

export default function Home() {
  return (
    <main className="relative overflow-x-hidden bg-white text-navy min-h-screen">
      <Header />
      <Hero />
      <Problem />
      <HowSection />
      <Bots />
      <Trust />
      <Pricing />
      <Faq />
      <FinalCta />
      <Footer />
    </main>
  );
}
