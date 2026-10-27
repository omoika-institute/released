import { type JSX, type ComponentChildren } from "preact";
import { useState } from "preact/hooks";
import Icon from "./icons";

type TooltipSide = "left" | "right" | "top" | "bottom";

interface InfoTipProps {
  children: ComponentChildren;
  symbol?: string | JSX.Element;
  side?: TooltipSide;
  className?: string;
}

export function InfoTip({
  children,
  symbol,
  side = "top",
  className = "",
}: InfoTipProps) {
  const [isVisible, setIsVisible] = useState(false);

  // Position classes for the tooltip based on side
  const positionClasses = {
    top: "bottom-full left-1/2 -translate-x-1/2 mb-2",
    bottom: "top-full left-1/2 -translate-x-1/2 mt-2",
    left: "right-full top-1/2 -translate-y-1/2 mr-2",
    right: "left-full top-1/2 -translate-y-1/2 ml-2",
  };

  // Arrow position classes based on side
  const arrowClasses = {
    top: "top-full left-1/2 -translate-x-1/2 border-l-transparent border-r-transparent border-b-transparent border-t-slate-925",
    bottom:
      "bottom-full left-1/2 -translate-x-1/2 border-l-transparent border-r-transparent border-t-transparent border-b-slate-925",
    left: "left-full top-1/2 -translate-y-1/2 border-t-transparent border-b-transparent border-r-transparent border-l-slate-925",
    right:
      "right-full top-1/2 -translate-y-1/2 border-t-transparent border-b-transparent border-l-transparent border-r-slate-925",
  };

  // Animation origin based on side
  const originClasses = {
    top: "origin-bottom",
    bottom: "origin-top",
    left: "origin-right",
    right: "origin-left",
  };

  return (
    <div
      class={`relative inline-flex ${className}`}
      onMouseEnter={() => setIsVisible(true)}
      onMouseLeave={() => setIsVisible(false)}
    >
      {symbol ? symbol : <Icon icon="help" />}

      {/* Tooltip content */}
      <div
        class={`pointer-events-none absolute whitespace-nowrap ${positionClasses[side]} ${originClasses[side]} transition-all duration-200 ease-out  z-9999 ${
          isVisible
            ? "visible scale-100 opacity-100"
            : "invisible scale-95 opacity-0"
        }`}
      >
        <div class="bg-slate-925 border-black/80 text-slate-200 rounded border px-3 py-2 text-sm shadow-lg shadow-mirage-925/50">
          {children}
        </div>

        {/* Arrow */}
        <span
          class={`absolute h-0 w-0 border-[6px] border-slate-925 ${arrowClasses[side]}`}
          aria-hidden="true"
        />
      </div>
    </div>
  );
}

export default InfoTip;
