import { Icon } from "@/components/icons";

export function OnionToggle({
  checked,
  disabled,
  onToggle,
  variant = "switch",
}: {
  checked: boolean;
  disabled: boolean;
  onToggle: () => void;
  variant?: "switch" | "appbar";
}) {
  if (variant === "appbar") {
    return (
      <button
        type="button"
        role="switch"
        title={checked ? "Disable Tor routing" : "Enable Tor routing"}
        aria-checked={checked}
        onClick={onToggle}
        disabled={disabled}
        className={[
          "relative inline-flex h-full w-10 shrink-0 items-center justify-center border-l border-ink-hard/12 bg-paper/30 transition-colors duration-150 hover:bg-sea/8 hover:text-sea focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-sea",
          disabled
            ? "cursor-not-allowed opacity-40"
            : checked
              ? "bg-emerald-400/10 text-emerald-400"
              : "text-ink-hard/60",
        ].join(" ")}
      >
        <span className="pointer-events-none absolute inset-y-0 left-0 w-px bg-current/10" />
        <span className="pointer-events-none absolute bottom-0 right-0 h-px w-5 bg-current/25" />
        <Icon
          icon="world-longitude"
          className={[
            "h-3.5 w-3.5 transition-transform duration-300",
            checked ? "rotate-[360deg] text-emerald-400" : "rotate-0",
          ].join(" ")}
        />
      </button>
    );
  }

  return (
    <button
      type="button"
      role="switch"
      title={checked ? "Disable Tor routing" : "Enable Tor routing"}
      aria-checked={checked}
      onClick={onToggle}
      disabled={disabled}
      className={[
        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors duration-200 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-sea",
        disabled
          ? "cursor-not-allowed opacity-40"
          : checked
            ? "border-sea/45 bg-sea/25"
            : "border-ink-hard/20 bg-ink-hard/18 hover:border-ink-hard/35",
      ].join(" ")}
    >
      <span
        className={[
          "pointer-events-none h-4 w-4 rounded-full border shadow-[0_1px_4px_rgba(0,0,0,0.35)] transition-transform duration-200",
          checked
            ? "translate-x-5 border-sea/70 bg-sea"
            : "translate-x-1 border-ink-hard/30 bg-ink-hard/70",
        ].join(" ")}
      />
    </button>
  );
}
