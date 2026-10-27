'use client';

import Section from './Section';

export default function VideoSection() {
  return (
    <section id="demo" className="py-24 scroll-mt-14 relative overflow-hidden bg-black">
     
      <div className="max-w-3xl mx-auto px-6">
        <Section>
          <p className="text-[13px] text-accent uppercase tracking-wider text-center mb-4">Demo</p>
        </Section>

        <Section>
          <h2 className="font-display text-3xl md:text-4xl font-bold text-center tracking-tight mb-12">
            See Wayfind in action
          </h2>
        </Section>

        <div className="relative rounded-2xl overflow-hidden border border-border3 bg-black/30">
          <video
            src="/wayfind-video.mp4"
            controls
            playsInline
            className="w-full h-auto"
          >
            Your browser does not support the video tag.
          </video>
        </div>
      </div>
    </section>
  );
}
