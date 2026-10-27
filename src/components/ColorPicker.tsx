import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import { useTranslation } from "react-i18next";
import { HexAlphaColorPicker } from "react-colorful";

type ColorPickerProps = {
  value: string;
  onChange: (value: string) => void;
  label?: string;
};

export default function ColorPicker({
  value,
  onChange,
  label,
}: ColorPickerProps) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  const closePicker = useCallback(() => setIsOpen(false), []);

  useEffect(() => {
    if (!isOpen) return;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target || !wrapperRef.current) return;
      if (!wrapperRef.current.contains(target)) closePicker();
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [isOpen, closePicker]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      closePicker();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, closePicker]);

  return (
    <label className="flex flex-col gap-2 text-xs text-slate-400">
      {label ?? t("shared.colorPicker.label")}
      <div
        ref={wrapperRef}
        className="hover:outline-mirage-400 outline-mirage-500 focus-within:border-primary text-slate-350 relative w-full rounded border-2 border-transparent bg-transparent bg-linear-to-br from-black/35 to-black/10 outline-1 transition-all duration-100 ease-in placeholder:text-slate-700 hover:from-black/35 hover:to-black/20"
      >
        <span
          className="pointer-events-none absolute left-2 top-1/2 h-7 w-7 -translate-y-1/2 rounded-sm border border-slate-800/60"
          style={{ backgroundColor: value }}
        />
        <input
          value={value}
          onFocus={() => setIsOpen(true)}
          onInput={(event) =>
            onChange((event.currentTarget as HTMLInputElement).value)
          }
          className="hover:outline-mirage-400 text-slate-350 w-full rounded border-2 border-transparent bg-transparent bg-linear-to-br from-black/35 to-black/10 py-1 pr-2 pl-11 font-sans outline-none transition-all duration-100 ease-in placeholder:text-slate-700 hover:from-black/35 hover:to-black/20 focus:border-2 focus:bg-black/60 focus-visible:outline-transparent text-base"
        />
        <div
          className={`absolute left-0 top-full z-10 mt-2 w-56 rounded-md border border-slate-800/60 bg-slate-950/95 p-3 shadow-2xl shadow-black/40 transition-all duration-150 ${
            isOpen
              ? "opacity-100 scale-100"
              : "pointer-events-none opacity-0 scale-95"
          }`}
          onMouseDown={(event) => event.preventDefault()}
        >
          <HexAlphaColorPicker
            color={value}
            onChange={onChange}
            className="h-24 w-full"
          />
        </div>
      </div>
    </label>
  );
}
