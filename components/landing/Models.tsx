const rows = [
  {
    provider: 'Wayfind Included',
    model: 'Muse Glimmer (Meta)',
    bestFor: 'Everyday Bot work out of the box',
    access: 'Included',
    accessCls: 'bg-blagoon/15 text-[#0f7f7d]',
  },
  { provider: 'Anthropic', model: 'Claude', bestFor: 'Long documents, careful writing', access: 'BYOK · soon', accessCls: 'bg-navy/5 text-heroslate' },
  { provider: 'OpenAI', model: 'GPT', bestFor: 'General-purpose work', access: 'BYOK · soon', accessCls: 'bg-navy/5 text-heroslate' },
  { provider: 'Google', model: 'Gemini', bestFor: 'Large context, research', access: 'BYOK · soon', accessCls: 'bg-navy/5 text-heroslate' },
  { provider: 'xAI', model: 'Grok', bestFor: 'Live web-aware tasks', access: 'BYOK · soon', accessCls: 'bg-navy/5 text-heroslate' },
  { provider: 'DeepSeek', model: 'DeepSeek', bestFor: 'Low-cost bulk work', access: 'BYOK · soon', accessCls: 'bg-navy/5 text-heroslate' },
  { provider: 'OpenRouter', model: 'Many models, one key', bestFor: 'Trying models without new accounts', access: 'BYOK · soon', accessCls: 'bg-navy/5 text-heroslate' },
  { provider: 'Custom endpoint', model: 'Any compatible API', bestFor: 'Your own gateway or local model', access: 'BYOK · soon', accessCls: 'bg-navy/5 text-heroslate' },
];

export default function Models() {
  return (
    <section id="models" className="scroll-mt-16 bg-ice px-6 py-24 font-brico text-navy">
      <div className="mx-auto max-w-6xl">
        <div className="max-w-3xl">
          <p className="text-sm font-bold uppercase tracking-wider text-cta">Models</p>
          <h2 className="mt-3 text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl">
            One model included. Any model you bring.
          </h2>
          <p className="mt-5 text-lg text-heroslate">
            Every account starts with an included model and a starter quota, so your first Bot works
            with zero setup. When bring-your-own-key opens, add a provider key in a secure form —
            it is stored securely, never shown in chat, and never enters your Bot&apos;s computer.
          </p>
        </div>

        <div className="mt-10 overflow-hidden rounded-2xl border border-navy/10 bg-white shadow-xl shadow-navy/10">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-[15px]">
              <thead>
                <tr className="border-b border-navy/10 bg-ice text-xs font-bold uppercase tracking-wider text-heroslate">
                  <th className="px-5 py-3.5">Provider</th>
                  <th className="px-5 py-3.5">Model</th>
                  <th className="px-5 py-3.5">Best for</th>
                  <th className="px-5 py-3.5">Access</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-navy/5">
                {rows.map((r) => (
                  <tr key={r.provider} className="hover:bg-ice/50">
                    <td className="px-5 py-3.5 font-bold">{r.provider}</td>
                    <td className="px-5 py-3.5">{r.model}</td>
                    <td className="px-5 py-3.5 text-heroslate">{r.bestFor}</td>
                    <td className="px-5 py-3.5">
                      <span className={`inline-block rounded-full px-3 py-1 text-xs font-bold ${r.accessCls}`}>{r.access}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="border-t border-navy/10 bg-ice px-5 py-3 text-sm text-heroslate">
            Included model runs on every plan. Bring your own key on any plan — keys are resolved by our
            model router, so Bots call one Wayfind endpoint and the key itself never reaches the computer.
          </p>
        </div>
      </div>
    </section>
  );
}
