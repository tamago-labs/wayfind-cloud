'use client';

import Header from '@/components/landing/Header';
import Hero from '@/components/landing/Hero';
import Background from '@/components/landing/Background';
import CompatibleWith from '@/components/landing/CompatibleWith';
import BotCapabilities from '@/components/landing/BotCapabilities';
import HowItWorks from '@/components/landing/HowItWorks';
import VideoSection from '@/components/landing/VideoSection';
import FAQ from '@/components/landing/FAQ';
import CTA from '@/components/landing/CTA';
import Footer from '@/components/landing/Footer';

export default function Home() {
  return (
    <main className="relative overflow-x-hidden">
        <div className="absolute w-[350px] h-[350px] -top-32 -left-32 rounded-full blur-[80px] opacity-40 bg-accent pointer-events-none" />
        <div className="absolute w-[300px] h-[300px] bottom-40 left-1/4 rounded-full blur-[80px] opacity-40 bg-accent pointer-events-none" />

        <Header />

        <section className="relative z-10">
          <Hero />
        </section>

        <Background />
        <CompatibleWith />
        <BotCapabilities />
         <HowItWorks />
         <VideoSection />
         <FAQ />
        <CTA />
        <Footer />
    </main>
  );
}
