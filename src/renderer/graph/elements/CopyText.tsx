import { Icon } from "@/components/icons";
import Tooltip from "@/components/Tooltip";
import { memo } from "preact/compat";
import { toast } from "react-toastify";

interface CopyElementProps {
  id: string;
  label: string;
  value: string;
}

export function CopyElement({ id, label, value }: CopyElementProps) {
  const onCopyClick = () => {
    navigator.clipboard.writeText(value);
    toast.success(`Copied ${label} to clipboard!`);
  };

  return (
    <Tooltip side="bottom" content="Click to copy">
      <div
        onClick={onCopyClick}
        className="group flex min-w-0 cursor-copy items-center border border-subtle/50 bg-canvas px-2 py-1 text-primary-txt transition-colors hover:border-review-border/25 hover:bg-panel hover:text-review-border"
      >
        <p
          data-type="link"
          className="truncate font-display text-[10px] tracking-widest text-inherit"
        >
          {value}
        </p>
        <input
          type="text"
          className="hidden"
          data-label={label}
          id={`${id}-${label}`}
          value={value}
          readOnly
        />
      </div>
    </Tooltip>
  );
}

export default memo(CopyElement);
