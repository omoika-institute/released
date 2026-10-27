import type { RunOsintWorkflowResult } from "@/lib/aosint/agentTypes";

function getPromptSummary(result: RunOsintWorkflowResult | null) {
  if (!result) return "";

  const reportSummary = result.report?.summary?.trim();
  if (reportSummary) return reportSummary;

  return result.finalAnswer.trim();
}

function formatPromptTarget(value: string | null | undefined) {
  if (!value) return "current context";

  try {
    const parsed = new URL(value);
    return parsed.hostname || value;
  } catch {
    return value;
  }
}

export function AgentResponsePanel({
  result,
  error,
  busy,
  onClear,
  variant,
}: {
  result: RunOsintWorkflowResult | null;
  error: string | null;
  busy: boolean;
  onClear: () => void;
  variant: "hero" | "sidebar";
}) {
  if (!busy && !error && !result) return null;

  const summary = getPromptSummary(result);
  const isHero = variant === "hero";

  return (
    <div
      className={[
        "-md border border-ink/10 bg-black/20",
        isHero ? "p-5" : "px-4 py-3",
      ].join(" ")}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <p className="text-[10px] font-display uppercase tracking-[0.28em] text-ink-soft">
            {busy
              ? "Investigating"
              : error
                ? "Command failed"
                : `${result?.workflow ?? "recon"} response`}
          </p>
          {result && (
            <p className="text-sm text-ink-hard/70">
              Target · {formatPromptTarget(result.target)}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={onClear}
          className="shrink-0 -md border border-ink/10 px-3 py-2 text-[10px] font-display uppercase tracking-[0.24em] text-ink-hard/60 transition-colors duration-150 hover:border-ink/20 hover:text-paper"
        >
          Clear
        </button>
      </div>

      {busy && (
        <p className="mt-4 max-w-[72ch] text-sm leading-6 text-ink-hard/72">
          The local agent is planning tool calls, browsing the target, and
          assembling an evidence-backed response.
        </p>
      )}

      {error && !busy && (
        <p className="mt-4 max-w-[72ch] text-sm leading-6 text-danger">
          {error}
        </p>
      )}

      {!busy && !error && result && (
        <>
          <p className="mt-4 max-w-[78ch] text-sm leading-6 text-ink-hard/72">
            {summary}
          </p>
          {result.report && (
            <div className="mt-4 flex flex-wrap gap-2">
              {result.report.domains.slice(0, 4).map((domain) => (
                <span
                  key={domain}
                  className="-full border border-ink/10 bg-ink/5 px-3 py-1 text-[10px] font-display uppercase tracking-[0.22em] text-ink-soft"
                >
                  {domain}
                </span>
              ))}
              {result.report.entities.slice(0, 3).map((entity) => (
                <span
                  key={entity}
                  className="-full border border-sea/15 bg-sea/10 px-3 py-1 text-[10px] font-display uppercase tracking-[0.22em] text-sea"
                >
                  {entity}
                </span>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

