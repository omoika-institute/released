import { type InputHTMLAttributes } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { Icon } from "@/components/icons";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
}

export interface ComboOption {
  label?: string;
  value: string;
}

interface ComboBoxProps extends Omit<InputProps, "defaultValue" | "onInput"> {
  options: ComboOption[];
  defaultValue?: string;
  emptyMsg?: string;
  isOpen: boolean;
  setIsOpen: (v: boolean) => void;
  onInputValueChange?: (value: string) => void;
  onValueChange?: (value: string) => void;
}

export function AltComboBox(props: ComboBoxProps) {
  const {
    className,
    label,
    options,
    value,
    onInputValueChange,
    onValueChange,
    disabled,
    emptyMsg,
    isOpen,
    setIsOpen,
    ...inputProps
  } = props;
  const [activeIndex, setActiveIndex] = useState(-1);

  const commitValue = (val: string) => {
    onValueChange(val);
    setIsOpen(false);
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (!isOpen && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      setIsOpen(true);
      setActiveIndex(0);
      e.preventDefault();
      return;
    }
    if (e.key === "ArrowDown") {
      setActiveIndex((prev) => (prev + 1 >= options.length ? 0 : prev + 1));
      e.preventDefault();
    } else if (e.key === "ArrowUp") {
      setActiveIndex((prev) => (prev - 1 < 0 ? options.length - 1 : prev - 1));
      e.preventDefault();
    } else if (e.key === "Enter" && activeIndex >= 0) {
      commitValue(options[activeIndex]?.value);
      e.preventDefault();
    } else if (e.key === "Escape") {
      setIsOpen(false);
    }
  };

  const activeOption = options.filter(
    (opt) => value === (opt.value ?? opt?.label)
  )[0];
  const inputLabel = activeOption?.label ?? activeOption?.value;
  const displayedValue = inputLabel ?? value ?? "";
  const cancelRef = useRef<HTMLDivElement | null>(null);

  return (
    <div className="relative mt-7 flex flex-col w-full" ref={cancelRef}>
      {label && (
        <label class="text-slate-350/90 font-display absolute -top-6 -left-1 rounded-t px-2 text-sm font-medium">
          {label}
        </label>
      )}
      <div className="group relative w-full">
        <input
          {...inputProps}
          disabled={disabled}
          value={displayedValue}
          onInput={(e) => onInputValueChange?.(e.currentTarget.value)}
          onFocus={() => setIsOpen(true)}
          onBlur={() => setTimeout(() => setIsOpen(false), 120)}
          onKeyDown={handleKeyDown}
          className={`hover:outline-mirage-400 outline-mirage-600 focus-visible:border-primary text-slate-350 w-full rounded border-2 border-transparent bg-linear-to-br from-black/35 to-black/10 px-2 py-1 font-sans outline-1 transition-all duration-100 ease-in placeholder:text-slate-700 hover:from-black/35 hover:to-black/20 focus:border-2 focus:bg-black/60 focus-visible:outline-transparent pr-6 ${disabled ? "opacity-60 cursor-not-allowed" : ""} ${className ?? ""}`}
        />
        <button
          type="button"
          aria-label="Toggle options"
          disabled={disabled}
          onClick={() => setIsOpen(!isOpen)}
          className="focus:text-primary-350 hover:text-primary-350 focus:outline-primary-400 absolute top-1 right-1 h-6 w-6 rounded p-0.5 text-slate-600 outline-hidden disabled:cursor-not-allowed bg-mirage-800"
        >
          <Icon
            icon={isOpen ? "chevron-up" : "chevron-down"}
            className="mx-0! btn-icon pointer-events-none"
          />
        </button>
        {isOpen && options.length > 0 && (
          <ul className=" bg-mirage-900 ring-1 ring-mirage-700 absolute z-20  max-h-44 w-full overflow-y-auto rounded-sm shadow-lg text-left mt-1">
            {options.map((opt, idx) => (
              <li
                key={`${opt.value}-${idx}`}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  commitValue(opt.value);
                  setIsOpen(false);
                }}
                className={`${
                  idx === activeIndex
                    ? "bg-primary-500/30 text-slate-100"
                    : "text-slate-300 hover:bg-mirage-600 hover:text-slate-100"
                } cursor-pointer rounded-xs px-2 py-1 text-sm transition-colors`}
              >
                {opt.label}
              </li>
            ))}
          </ul>
        )}
        {isOpen && options.length === 0 && (
          <ul className="bg-mirage-950 ring-1 ring-mirage-700 absolute z-20 mt-1 max-h-44 w-full overflow-y-auto rounded-sm shadow-lg backdrop-blur text-left">
            <li
              onMouseDown={(e) => e.preventDefault()}
              className={`bg-slate-950 text-slate-400 py-2 cursor-pointer rounded-xs px-2 text-sm transition-colors`}
            >
              {emptyMsg}
            </li>
          </ul>
        )}
      </div>
    </div>
  );
}
