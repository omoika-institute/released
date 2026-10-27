export function AgentPromptBar({
  value,
  onInput,
  onSubmit,
  disabled,
  busy,
  placeholder,
  variant,
}: {
  value: string;
  onInput: (value: string) => void;
  onSubmit: () => void;
  disabled?: boolean;
  busy?: boolean;
  placeholder: string;
  contextLabel?: string;
  variant: "hero" | "sidebar";
}) {
  const isHero = variant === "hero";

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
      className={
        "group relative bg-paper overflow-hidden  text-ink shadow-[0_14px_40px_rgba(0,0,0,0.28)] ring-1 ring-inset ring-ink/4"
      }
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(86,146,255,0.7),transparent)] opacity-70" />
      <div className="flex items-center gap-3 px-3 py-2.5 sm:px-4">
        <div className="min-w-0 flex-1">
          <input
            type="text"
            value={value}
            onInput={(event) => onInput(event.currentTarget.value)}
            placeholder={placeholder}
            disabled={disabled || busy}
            className={[
              "mt-1 w-full bg-transparent outline-none placeholder:text-ink-hard/40",
              isHero ? "text-[15px]" : "text-sm",
            ].join(" ")}
          />
        </div>
        <button
          type="submit"
          disabled={disabled || busy}
          className="shrink-0 -md bg-sea px-3 py-2 text-[10px] font-display uppercase tracking-[0.24em] text-black transition-opacity duration-150 hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45"
        >
          {busy ? "Running" : "Send"}
        </button>
      </div>
    </form>
  );
}
