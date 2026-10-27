'use client';

import Header from '@/components/landing/Header';
import Hero from '@/components/landing/Hero';
import CompatibleWith from '@/components/landing/CompatibleWith';
import BotCapabilities from '@/components/landing/BotCapabilities';
import HowItWorks from '@/components/landing/HowItWorks';
import HeroChatMockup from '@/components/landing/HeroChatMockup';
import Background from '@/components/landing/Background';
import Pricing from '@/components/landing/Pricing';
import FAQ from '@/components/landing/FAQ';
import CTA from '@/components/landing/CTA';
import Footer from '@/components/landing/Footer';

export default function Home() {
  return (
    <main className="relative overflow-x-hidden bg-paper text-ink min-h-screen">
      <Header />
      <Hero />
      <CompatibleWith />
      <BotCapabilities />
      <HowItWorks />
      <HeroChatMockup />
      <Background />
      <Pricing />
      <FAQ />
      <CTA />
      <Footer />
    </main>
  );
}
