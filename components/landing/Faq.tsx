const faqs = [
  {
    q: 'Which AI models do my Bots use?',
    a: 'Hosted Meta open-weight models (Muse Spark Open and Muse Glimmer), served via Modal, on every plan — no keys to bring, no setup. Premium adds Muse Wonder — Meta\u2019s new frontier, in the class of GPT-6 and Claude Fable — for complex work, agentic coding, and graphical computer work.',
  },
  {
    q: 'What can a Bot actually do?',
    a: 'Complete multi-step work across your connected apps, remember your workflows, and keep going in the background. A Bot produces finished results — reconciliation reports, drafted emails, prepared announcements — and asks for your approval before anything sensitive.',
  },
  {
    q: 'Do I need to watch every step?',
    a: 'No. Bots run routines on their own and only stop for your OK before sending, paying, publishing, or changing important records.',
  },
  {
    q: 'Which business apps connect?',
    a: 'Zoho-based services for books, mail, calendar and more — 100+ services via Zoho MCP — plus Web3 MCP connectors made by the Wayfind team for USDC payments and treasury.',
  },
  {
    q: 'What is a MicroVM?',
    a: 'A very small virtual machine. We are building Wayfind\u2019s cloud computer on Firecracker MicroVMs on AWS Lambda, which combine VM-level isolation with near-instant launch and resume, and they keep your computer\u2019s state while it sleeps.',
  },
  {
    q: 'Will it run with my laptop closed?',
    a: 'That is the design: your computer lives in the cloud, so you message a Bot, close the lid, and come back to the result. It arrives with the cloud computer rollout — early access today covers accounts, Bots and the app around it.',
  },
  {
    q: 'Will I pay while my Bots are idle?',
    a: 'No. A suspended computer costs nothing, and you only pay for active Bot work and active computer minutes.',
  },
  {
    q: 'Where is Wayfind available?',
    a: 'Available worldwide from day one — no region-locked launches.',
  },
];

export default function Faq() {
  return (
    <section id="faq" className="scroll-mt-16 bg-white px-6 py-24 font-brico text-navy">
      <div className="mx-auto max-w-3xl">
        <h2 className="text-4xl font-extrabold tracking-tight sm:text-5xl">Questions</h2>
        <div className="mt-10 divide-y divide-slate-200 border-y border-slate-200">
          {faqs.map((f) => (
            <details key={f.q} className="group py-5">
              <summary className="flex cursor-pointer items-center justify-between gap-4 text-lg font-bold">
                {f.q}
                <span className="plus text-2xl font-medium transition-transform">+</span>
              </summary>
              <p className="mt-3 text-heroslate">{f.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
