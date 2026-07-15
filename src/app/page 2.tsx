const phaseItems = [
  {
    label: "Phase 0",
    title: "Foundation",
    status: "Current",
    detail: "Next.js app, Supabase schema, seed data, and environment setup.",
  },
  {
    label: "Phase 1",
    title: "Provider and prompts",
    status: "Next",
    detail: "Anthropic provider abstraction and prompt template workflow.",
  },
  {
    label: "Phase 2",
    title: "Pipeline and Quick Generate",
    status: "Queued",
    detail: "One API call starts brief, draft, QA, and status polling.",
  },
  {
    label: "Phase 3",
    title: "QA and scheduling",
    status: "Queued",
    detail: "Scoring, JSON-LD, review routing, and future-dated publishing.",
  },
];

const properties = [
  {
    name: "herzenco.co",
    language: "English",
    threshold: "75",
    target: "Immediate or scheduled",
  },
  {
    name: "humanismoevolutivo.com",
    language: "Spanish",
    threshold: "75",
    target: "Immediate or scheduled",
  },
];

const quickGenerateFields = [
  "Property",
  "Prompt",
  "Content type",
  "Publish date",
  "Title",
  "Keywords",
  "Tone override",
  "Review override",
];

export default function Home() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-10 px-6 py-10 sm:px-8 lg:px-10">
        <header className="flex flex-col gap-4 border-b border-foreground/10 pb-8">
          <p className="font-mono text-xs uppercase tracking-wide text-foreground/60">
            Herzen Content Engine
          </p>
          <div className="grid gap-5 lg:grid-cols-[1fr_280px] lg:items-end">
            <div>
              <h1 className="max-w-3xl text-4xl font-semibold leading-tight sm:text-5xl">
                Quick Generate is the front door to quality-gated publishing.
              </h1>
              <p className="mt-4 max-w-2xl text-base leading-7 text-foreground/70">
                A short prompt should become a finished article, pass through QA,
                and either publish immediately, schedule for later, or land in a
                review queue. The same contract will power the dashboard and API.
              </p>
            </div>
            <div className="border border-foreground/10 bg-foreground/[0.03] p-4">
              <p className="font-mono text-xs uppercase tracking-wide text-foreground/50">
                Primary manual entry
              </p>
              <p className="mt-2 text-2xl font-semibold">Quick Generate</p>
              <p className="mt-2 text-sm leading-6 text-foreground/65">
                Form submit to live status: drafting, QA, published, scheduled,
                or review needed.
              </p>
            </div>
          </div>
        </header>

        <section className="grid gap-4 lg:grid-cols-4">
          {phaseItems.map((item) => (
            <article
              className="border border-foreground/10 bg-foreground/[0.025] p-5"
              key={item.label}
            >
              <div className="flex items-center justify-between gap-3">
                <p className="font-mono text-xs text-foreground/55">
                  {item.label}
                </p>
                <p className="font-mono text-xs text-foreground/70">
                  {item.status}
                </p>
              </div>
              <h2 className="mt-5 text-xl font-semibold">{item.title}</h2>
              <p className="mt-3 text-sm leading-6 text-foreground/65">
                {item.detail}
              </p>
            </article>
          ))}
        </section>

        <section className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="border border-foreground/10 bg-foreground/[0.025] p-5">
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
              <div>
                <p className="font-mono text-xs uppercase tracking-wide text-foreground/50">
                  Contract
                </p>
                <h2 className="mt-2 text-2xl font-semibold">
                  One prompt, one pipeline, one status to poll.
                </h2>
              </div>
              <p className="font-mono text-xs text-foreground/60">
                POST /api/engine/generate
              </p>
            </div>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              {quickGenerateFields.map((field) => (
                <div
                  className="border border-foreground/10 bg-background px-3 py-3 text-sm text-foreground/75"
                  key={field}
                >
                  {field}
                </div>
              ))}
            </div>
          </div>

          <div className="border border-foreground/10 bg-foreground/[0.025] p-5">
            <p className="font-mono text-xs uppercase tracking-wide text-foreground/50">
              Publishing decision
            </p>
            <ol className="mt-4 space-y-4 text-sm leading-6 text-foreground/70">
              <li>
                Score above threshold with no hard fail becomes approved.
              </li>
              <li>
                Empty or past publish date publishes as soon as QA passes.
              </li>
              <li>
                Future publish date moves the item to scheduled and queues a
                publish job for that time.
              </li>
              <li>
                Low score, banned claims, or review override sends it to review.
              </li>
            </ol>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-[1fr_360px]">
          <div>
            <h2 className="text-2xl font-semibold">Launch properties</h2>
            <div className="mt-4 overflow-hidden border border-foreground/10">
              <table className="w-full border-collapse text-left text-sm">
                <thead className="bg-foreground/[0.04] text-foreground/60">
                  <tr>
                    <th className="px-4 py-3 font-medium">Property</th>
                    <th className="px-4 py-3 font-medium">Language</th>
                    <th className="px-4 py-3 font-medium">Gate</th>
                    <th className="px-4 py-3 font-medium">Publish</th>
                  </tr>
                </thead>
                <tbody>
                  {properties.map((property) => (
                    <tr className="border-t border-foreground/10" key={property.name}>
                      <td className="px-4 py-3 font-medium">{property.name}</td>
                      <td className="px-4 py-3 text-foreground/70">
                        {property.language}
                      </td>
                      <td className="px-4 py-3 font-mono text-foreground/70">
                        {property.threshold}
                      </td>
                      <td className="px-4 py-3 text-foreground/70">
                        {property.target}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <aside className="border border-foreground/10 bg-foreground/[0.025] p-5">
            <h2 className="text-lg font-semibold">Phase 0 checklist</h2>
            <ul className="mt-4 space-y-3 text-sm leading-6 text-foreground/70">
              <li>Next.js 16 App Router scaffolded.</li>
              <li>Supabase migration includes scheduled publishing fields.</li>
              <li>Environment variables documented.</li>
              <li>Quick Generate is now reflected in product docs.</li>
            </ul>
          </aside>
        </section>
      </div>
    </main>
  );
}
