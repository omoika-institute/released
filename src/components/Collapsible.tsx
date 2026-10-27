import { ComponentChildren } from "preact";
import { useState } from "preact/hooks";
import Icon from "./icons";

interface CollapsibleProps {
  children: ComponentChildren;
  count?: number;
  title: string | ComponentChildren;
  className?: string;
  startOpen?: boolean;
  compact?: boolean;
}

export function Collapsible({
  children,
  count,
  title,
  className,
  startOpen = true,
  compact = false,
}: CollapsibleProps) {
  const [isOpen, setIsOpen] = useState(startOpen);

  return (
    <div className={["w-full", className].filter(Boolean).join(" ")}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        type="button"
        className={`${compact ? "px-4 py-2" : "mb-2 pr-1"} flex w-full items-center justify-between text-[0.7rem] font-semibold uppercase tracking-wider text-muted-txt hover:text-primary-txt`}
      >
        <>
          <span
            className={
              compact
                ? "flex min-w-0 flex-1 items-center gap-2 overflow-hidden"
                : "flex items-center gap-2"
            }
          >
            <Icon
              icon="chevron-down"
              className={`shrink-0 h-4 w-4 transition-transform duration-300 ${
                isOpen ? "rotate-0" : "-rotate-90"
              }`}
            />
            <span
              class={`select-none${compact ? " min-w-0 flex-1 overflow-hidden" : ""}`}
            >
              {title}
            </span>
          </span>
          {!compact && (
            <span className="text-slate-500 pr-2 select-none">{count}</span>
          )}
        </>
      </button>

      <div
        class={[
          "grid overflow-hidden transition-[grid-template-rows] duration-300 ease-out",
          isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        ].join(" ")}
      >
        <div className="min-h-0">{children}</div>
      </div>
    </div>
  );
}
