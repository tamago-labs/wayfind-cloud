export default function HowSection() {
  return (
    <section id="how" className="scroll-mt-16 bg-navy px-6 py-24 font-brico text-white">
      <div className="mx-auto max-w-4xl text-center">
        <p className="text-sm font-bold uppercase tracking-wider text-bamber">Watch it work</p>
        <h2 className="mt-3 text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl">
          One cloud computer. Every Bot.
        </h2>
        <p className="mx-auto mt-5 max-w-3xl text-lg text-white/70">
          We&rsquo;re building each account&rsquo;s computer on Firecracker MicroVMs on AWS Lambda —
          one isolated, serverless computer that all your Bots share, suspending when idle.
        </p>

        <div className="mt-12 overflow-hidden rounded-2xl border border-white/10 bg-[#0b1626] shadow-2xl shadow-black/30">
          <video
            className="aspect-video w-full"
            controls
            preload="metadata"
            playsInline
            src="/wayfind-video.mp4"
          >
            Sorry, your browser doesn&rsquo;t support embedded videos.
          </video>
        </div>
      </div>
    </section>
  );
}
