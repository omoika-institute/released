const workflows = [
  {
    id: "01",
    title: "Alert Triage",
    description:
      "Pre-scores alert against historical patterns, member profile, transaction data",
    mode: "AUTOMATED",
    type: "auto",
  },
  {
    id: "02",
    title: "Evidence Gathering",
    description:
      "Pulls transaction history, member relationships, prior alerts from Knowledge Fabric",
    mode: "AUTOMATED",
    type: "auto",
  },
  {
    id: "03",
    title: "Case File Assembly",
    description:
      "Builds structured case file with evidence, timeline, risk scoring",
    mode: "AUTOMATED",
    type: "auto",
  },
  {
    id: "04",
    title: "SAR Narrative Draft",
    description:
      "Drafts narrative following your institution's template and FinCEN requirements",
    label: "HUMAN ROLE",
    type: "review",
  },
  {
    id: "05",
    title: "Filing decision",
    description: "Presents recommendation with confidence score",
    label: "HUMAN ROLE",
    type: "decision",
  },
  {
    id: "06",
    title: "Audit Logging",
    description:
      "Logs full investigation trail to Grid, preserves all evidence",
    mode: "AUTOMATED",
    type: "auto",
  },
];

function DotMatrix({ active = false }) {
  return (
    <div className="grid grid-cols-5 gap-[3px] opacity-70">
      {Array.from({ length: 20 }).map((_, i) => (
        <span
          key={i}
          className={`h-[3px] w-[3px] rounded-full ${
            active && i % 3 === 0 ? "bg-[#d5c391]" : "bg-[#6d6a60]"
          }`}
        />
      ))}
    </div>
  );
}

function StatusButton({ children, tone = "neutral" }) {
  const tones = {
    neutral:
      "border-[#b7aa86] bg-[#d8c99b]/10 text-[#d8c99b] hover:bg-[#d8c99b]/15",
    review:
      "border-[#d9aa42] bg-[#d9aa42]/10 text-[#f3c65e] hover:bg-[#d9aa42]/15",
    approve:
      "border-[#5d9d6d] bg-[#5d9d6d]/10 text-[#83d193] hover:bg-[#5d9d6d]/15",
    reject:
      "border-[#a94343] bg-[#a94343]/10 text-[#e86d67] hover:bg-[#a94343]/15",
  };

  return (
    <button
      className={`h-8 border px-3 font-mono text-[10px] uppercase tracking-[0.18em] transition ${tones[tone]}`}
    >
      {children}
    </button>
  );
}

function HatchPanel({ id }) {
  return (
    <div className="relative h-44 border-b border-[#4b4a45] bg-[#151514]">
      <div
        className="absolute inset-0 opacity-45"
        style={{
          backgroundImage:
            "repeating-linear-gradient(135deg, rgba(217,210,185,0.18) 0px, rgba(217,210,185,0.18) 1px, transparent 1px, transparent 8px)",
        }}
      />
      <div
        className="absolute inset-0 opacity-25"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)",
          backgroundSize: "24px 24px",
        }}
      />
      <div className="absolute right-20 top-0 h-full w-px bg-[#57554e]" />
      <div className="absolute right-5 top-5 font-mono text-5xl font-light tracking-[-0.08em] text-[#ddd6bd]">
        {id}
      </div>
      <div className="absolute left-5 top-5 flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.25em] text-[#817d70]">
        <span className="h-1.5 w-1.5 rounded-full bg-[#817d70]" />
        Workflow Node
      </div>
      <div className="absolute bottom-4 left-5 h-px w-24 bg-[#5b584f]" />
    </div>
  );
}

function WorkflowCard({ item }) {
  return (
    <article className="group relative overflow-hidden border border-[#4b4a45] bg-[#11110f] shadow-[0_0_0_1px_rgba(255,255,255,0.015)]">
      <HatchPanel id={item.id} />

      <div className="relative min-h-48 p-5">
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 className="font-serif text-[28px] leading-none tracking-[-0.035em] text-[#e7dfc9]">
            {item.title}
          </h2>
          <span className="font-mono text-[9px] uppercase tracking-[0.25em] text-[#716e64]">
            AML/SAR
          </span>
        </div>

        <p className="max-w-[88%] text-sm leading-6 text-[#9d9789]">
          {item.description}
        </p>

        <div className="mt-6 flex items-center gap-2">
          {item.type === "auto" && <StatusButton>{item.mode}</StatusButton>}

          {item.type === "review" && (
            <>
              <span className="mr-2 font-mono text-[9px] uppercase tracking-[0.22em] text-[#8d887b]">
                {item.label}
              </span>
              <StatusButton tone="review">Review + Edit</StatusButton>
            </>
          )}

          {item.type === "decision" && (
            <>
              <span className="mr-2 font-mono text-[9px] uppercase tracking-[0.22em] text-[#8d887b]">
                {item.label}
              </span>
              <StatusButton tone="approve">Approve</StatusButton>
              <StatusButton tone="reject">Reject</StatusButton>
            </>
          )}
        </div>

        <div className="absolute bottom-5 right-5">
          <DotMatrix active={item.type !== "auto"} />
        </div>
      </div>
    </article>
  );
}

export default function OperationalDashboardPreview() {
  return (
    <main className="min-h-screen bg-[#080808] p-6 text-[#e6dfcc]">
      <div
        className="pointer-events-none fixed inset-0 opacity-[0.06]"
        style={{
          backgroundImage:
            "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.7) 1px, transparent 0)",
          backgroundSize: "18px 18px",
        }}
      />

      <section className="relative mx-auto max-w-7xl">
        <header className="mb-7 flex items-start justify-between border-b border-[#33322f] pb-5">
          <div>
            <div className="mb-3 flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.28em] text-[#797568]">
              <span className="h-px w-10 bg-[#555149]" />
              Investigation Workflow Console
            </div>
            <h1 className="font-serif text-5xl leading-none tracking-[-0.045em] text-[#ebe2cc]">
              SAR Operations Grid
            </h1>
          </div>

          <div className="w-64 text-right font-mono uppercase">
            <div className="flex items-center justify-end gap-3 text-[10px] tracking-[0.28em] text-[#d8c99b]">
              <span>DATA CONNECTED...</span>
              <span className="text-[#898273]">/ 003</span>
            </div>
            <div className="mt-3 border-t border-dashed border-[#686356]" />
            <div className="mt-3 text-[9px] tracking-[0.22em] text-[#686356]">
              Knowledge Fabric / Grid Sync
            </div>
          </div>
        </header>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {workflows.map((item) => (
            <WorkflowCard key={item.id} item={item} />
          ))}
        </div>
      </section>
    </main>
  );
}
