const faqs = [
  {
    q: 'Can I use any AI model?',
    a: 'You choose the model each Bot runs on from the models we offer. Bringing your own API key is planned for the Premium plan, and isn\u2019t available yet.',
  },
  {
    q: 'What is a MicroVM?',
    a: 'A very small virtual machine. Wayfind uses AWS Lambda MicroVMs, which combine VM-level isolation with near-instant launch and resume, and they keep your computer\u2019s state while it sleeps.',
  },
  {
    q: 'Does it really run with my laptop closed?',
    a: 'Yes. Your computer lives in the cloud. Message a Bot, close the lid, and come back to the result.',
  },
  {
    q: 'Will I pay while my Bots are idle?',
    a: 'No. A suspended computer costs nothing, and you only pay for active Bot work and active computer minutes.',
  },
  {
    q: 'Where is Wayfind available?',
    a: 'We start in the ap-southeast-1 region, so it works well from Southeast Asia, and we\u2019re not limited to US-first launches.',
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
