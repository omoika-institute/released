import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { useTranslation } from "react-i18next";
import Icon from "@/components/icons";
import { getIconIds } from "@/components/sprite";

const ICON_IDS = getIconIds() as OmoikaIcon[];

export type OmoikaIcon = `omoika-${string}`;

export function useIconPicker() {
  const COLS = 7;
  const OVERSCAN_ROWS = 2;
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(0);
  const [rowHeight, setRowHeight] = useState(32);
  const [iconSearch, setIconSearch] = useState("");
  const [showBrowser, setShowBrowser] = useState(false);

  const icons = ICON_IDS;

  const filteredIcons = useMemo(() => {
    const query = iconSearch.trim().toLowerCase();
    if (!query) {
      return icons;
    }
    return icons.filter((icon) => icon.toLowerCase().includes(query));
  }, [icons, iconSearch]);

  const totalRows = Math.ceil(filteredIcons.length / COLS);
  const visibleRowCount = Math.ceil(containerHeight / rowHeight);

  const startRow = Math.max(
    0,
    Math.floor(scrollTop / rowHeight) - OVERSCAN_ROWS
  );
  const endRow = Math.min(
    totalRows,
    startRow + visibleRowCount + OVERSCAN_ROWS * 2
  );

  const startIndex = startRow * COLS;
  const endIndex = endRow * COLS;

  const visibleIcons = useMemo(
    () => filteredIcons.slice(startIndex, endIndex),
    [filteredIcons, startIndex, endIndex]
  );

  const topSpacer = startRow * rowHeight;
  const bottomSpacer = (totalRows - endRow) * rowHeight;

  const handleIconSearch = (value) => setIconSearch(value);

  const hideIconBrowser = () => setShowBrowser(false);
  const showIconBrowser = () => setShowBrowser(true);

  return {
    visibleIcons,
    topSpacer,
    bottomSpacer,
    setScrollTop,
    setContainerHeight,
    setRowHeight,
    COLS,
    showBrowser,
    hideIconBrowser,
    showIconBrowser,
    handleIconSearch,
    iconSearch,
    icons,
  };
}

export type IconPickerProps = {
  currentIcon?: string;
  setIcon?: (icon: OmoikaIcon) => void;
  searchPlaceholder?: string;
};

export default function IconPicker({
  currentIcon = "checkered-shield",
  setIcon,
  searchPlaceholder,
}: IconPickerProps) {
  const { t } = useTranslation();
  const {
    visibleIcons,
    showBrowser,
    hideIconBrowser,
    showIconBrowser,
    handleIconSearch,
    iconSearch,
    setScrollTop,
    setContainerHeight,
    setRowHeight,
    COLS,
    topSpacer,
    bottomSpacer,
    icons,
  } = useIconPicker();
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const gridRef = useRef<HTMLDivElement | null>(null);
  const pickerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const updateHeight = () => setContainerHeight(el.clientHeight);
    updateHeight();
    const resizeObserver = new ResizeObserver(updateHeight);
    resizeObserver.observe(el);
    return () => resizeObserver.disconnect();
  }, [setContainerHeight]);

  useEffect(() => {
    if (!showBrowser) return;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target || !pickerRef.current) return;
      if (!pickerRef.current.contains(target)) {
        hideIconBrowser();
        handleIconSearch(currentIcon);
      }
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [showBrowser, hideIconBrowser, handleIconSearch]);

  useEffect(() => {
    if (!showBrowser) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      inputRef.current?.blur();
      hideIconBrowser();
      handleIconSearch(currentIcon);
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [showBrowser, hideIconBrowser, handleIconSearch]);

  useEffect(() => {
    if (!scrollContainerRef.current) return;
    scrollContainerRef.current.scrollTop = 0;
    setScrollTop(0);
  }, [iconSearch, setScrollTop]);

  useEffect(() => {
    const el = gridRef.current;
    if (!el) return;

    const measureRowHeight = () => {
      const firstButton = el.querySelector("button");
      if (!firstButton) return;
      const buttonRect = firstButton.getBoundingClientRect();
      if (!buttonRect.height) return;
      const rowGapValue = parseFloat(getComputedStyle(el).rowGap || "0");
      const rowGap = Number.isFinite(rowGapValue) ? rowGapValue : 0;
      const nextRowHeight = buttonRect.height + rowGap;
      setRowHeight((prev) =>
        Math.abs(prev - nextRowHeight) > 0.5 ? nextRowHeight : prev
      );
    };

    measureRowHeight();
    const resizeObserver = new ResizeObserver(measureRowHeight);
    resizeObserver.observe(el);
    return () => resizeObserver.disconnect();
  }, [setRowHeight, visibleIcons.length]);

  return (
    <label htmlFor="icon-picker" className="block w-full">
      <div ref={pickerRef} className="flex w-full flex-col relative">
        {/* Icon search field when focused otherwise shows picked icon */}
        <label class="flex items-center hover:outline-mirage-400 outline-mirage-500 focus-within:border-primary text-slate-350 rounded border-2 border-transparent bg-transparent bg-linear-to-br from-black/35 to-black/10 outline-1 transition-all duration-100 ease-in placeholder:text-slate-700 hover:from-black/35 hover:to-black/20 w-full">
          <Icon
            icon={currentIcon}
            className="text-slate-300 w-6 h-6 ml-2 shrink-0"
          />
          <input
            ref={inputRef}
            placeholder={
              searchPlaceholder ?? t("shared.iconPicker.searchPlaceholder")
            }
            spellcheck={false}
            onFocus={() => {
              showIconBrowser();
              handleIconSearch("");
            }}
            value={iconSearch}
            onInput={(event) => {
              handleIconSearch(event.currentTarget.value);
            }}
            className="hover:outline-mirage-400 text-base w-full outline-none text-slate-350 rounded border-2 border-transparent bg-transparent bg-linear-to-br from-black/35 to-black/10 px-2 py-1 font-sans outline-1 transition-all duration-100 ease-in placeholder:text-slate-700 hover:from-black/35 hover:to-black/20 focus:border-2 focus:bg-black/60 focus-visible:outline-transparent"
          />
        </label>
        {/* Icon browser panel */}
        <div
          className={`absolute z-40 w-full overflow-hidden rounded-b-sm bg-slate-950 border-primary border-t-transparent border-2 top-8.5 grid origin-top transform transition-[grid-template-rows,opacity,transform] duration-200 ease-out ${
            showBrowser
              ? "grid-rows-[1fr] opacity-100 scale-y-100 "
              : "grid-rows-[0fr] opacity-0 scale-y-95"
          }`}
        >
          <div
            ref={scrollContainerRef}
            onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
            style={{ overflowAnchor: "none" }}
            className="overflow-y-scroll max-h-40 iconpicker-scroll"
          >
            <div style={{ height: topSpacer }}></div>
            <div className="">
              <div
                ref={gridRef}
                className="grid gap-1 py-1 px-1"
                style={{
                  gridTemplateColumns: `repeat(${COLS}, minmax(0, 1fr))`,
                }}
              >
                {visibleIcons.map((icon) => (
                  <button
                    className={`p-1 group hover:bg-primary-300 border border-transparent rounded-sm ${currentIcon === icon ? "border-primary-300" : ""}`}
                    onClick={() => {
                      setIcon(icon);
                      handleIconSearch(icon);
                      hideIconBrowser();
                    }}
                  >
                    <Icon icon={icon} className="text-slate-300 w-5 h-5 " />
                  </button>
                ))}
              </div>
            </div>
            <div style={{ height: bottomSpacer }}></div>
          </div>
        </div>
      </div>
    </label>
  );
}
