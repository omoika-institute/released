import { HTMLAttributes } from "preact/compat";
import { ICON_SPRITE_SYMBOL_PREFIX, normalizeIconName } from "./sprite";

interface OmoikaProps extends HTMLAttributes<SVGSVGElement> {
  icon: string;
  className?: string;
}

export function Icon({ icon, className, ...props }: OmoikaProps) {
  const symbolHref = `${ICON_SPRITE_SYMBOL_PREFIX}${normalizeIconName(icon)}`;

  return (
    <svg
      {...props}
      className={`${className ?? "h-5 w-5 text-inherit"}`}
      fill="none"
      stroke="currentColor"
    >
      <use href={symbolHref} />
    </svg>
  );
}

export default Icon;
