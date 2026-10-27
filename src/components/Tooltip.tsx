import type { ComponentChildren } from "preact";
import { createPortal } from "preact/compat";
import { useEffect, useRef, useState } from "preact/hooks";

export type TooltipSide = "left" | "right" | "top" | "bottom";

interface TooltipProps {
  children: ComponentChildren;
  content: ComponentChildren;
  side?: TooltipSide;
  showDelay?: number;
  className?: string;
  tooltipClassName?: string;
}

const arrowClasses: Record<TooltipSide, string> = {
  top: "top-full left-1/2 -translate-x-1/2 border-x-transparent border-b-transparent border-t-subtle/85",
  bottom:
    "bottom-full left-1/2 -translate-x-1/2 border-x-transparent border-t-transparent border-b-subtle/85",
  left: "left-full top-1/2 -translate-y-1/2 border-y-transparent border-r-transparent border-l-subtle/85",
  right:
    "right-full top-1/2 -translate-y-1/2 border-y-transparent border-l-transparent border-r-subtle/85",
};

interface TooltipPosition {
  left: number;
  top: number;
  transform: string;
}

const getTooltipPosition = (
  triggerRect: DOMRect,
  side: TooltipSide,
): TooltipPosition => {
  switch (side) {
    case "top":
      return {
        left: triggerRect.left + triggerRect.width / 2,
        top: triggerRect.top - 8,
        transform: "translate(-50%, -100%)",
      };
    case "bottom":
      return {
        left: triggerRect.left + triggerRect.width / 2,
        top: triggerRect.bottom + 8,
        transform: "translate(-50%, 0)",
      };
    case "left":
      return {
        left: triggerRect.left - 8,
        top: triggerRect.top + triggerRect.height / 2,
        transform: "translate(-100%, -50%)",
      };
    case "right":
      return {
        left: triggerRect.right + 8,
        top: triggerRect.top + triggerRect.height / 2,
        transform: "translate(0, -50%)",
      };
  }
};

export function Tooltip({
  children,
  content,
  side = "top",
  showDelay = 0,
  className = "",
  tooltipClassName = "",
}: TooltipProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [tooltipPosition, setTooltipPosition] =
    useState<TooltipPosition | null>(null);
  const triggerRef = useRef<HTMLSpanElement>(null);
  const showTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const updateTooltipPosition = () => {
    if (!triggerRef.current) {
      return;
    }

    setTooltipPosition(
      getTooltipPosition(triggerRef.current.getBoundingClientRect(), side),
    );
  };

  const clearShowTimer = () => {
    if (showTimerRef.current !== null) {
      clearTimeout(showTimerRef.current);
      showTimerRef.current = null;
    }
  };

  const showTooltip = () => {
    clearShowTimer();
    updateTooltipPosition();

    if (showDelay <= 0) {
      setIsVisible(true);
      return;
    }

    showTimerRef.current = setTimeout(() => {
      setIsVisible(true);
      showTimerRef.current = null;
    }, showDelay);
  };

  const hideTooltip = () => {
    clearShowTimer();
    setIsVisible(false);
  };

  useEffect(() => clearShowTimer, []);

  useEffect(() => {
    if (!isVisible) {
      return;
    }

    updateTooltipPosition();

    window.addEventListener("resize", updateTooltipPosition);
    window.addEventListener("scroll", updateTooltipPosition, true);

    return () => {
      window.removeEventListener("resize", updateTooltipPosition);
      window.removeEventListener("scroll", updateTooltipPosition, true);
    };
  }, [isVisible, side]);

  if (!content) {
    return <>{children}</>;
  }

  return (
    <span
      ref={triggerRef}
      className={`relative inline-flex ${className}`}
      onMouseEnter={showTooltip}
      onMouseLeave={hideTooltip}
      onFocus={showTooltip}
      onBlur={hideTooltip}
    >
      {children}
      {isVisible &&
        tooltipPosition &&
        createPortal(
          <span
            role="tooltip"
            className={`pointer-events-none fixed z-9999 whitespace-nowrap rounded-sm border border-subtle bg-canvas p-2 font-sans text-xs text-white shadow-xl shadow-canvas/15 transition-all duration-150 ease-out ${isVisible ? "opacity-100" : "opacity-0"} ${tooltipClassName}`}
            style={{
              left: tooltipPosition.left,
              top: tooltipPosition.top,
              transform: tooltipPosition.transform,
            }}
          >
            {content}
            <span
              aria-hidden="true"
              className={`absolute h-0 w-0 border-[5px] ${arrowClasses[side]}`}
            />
          </span>,
          document.body,
        )}
    </span>
  );
}

export default Tooltip;
