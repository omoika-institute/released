import { useState, useMemo, useEffect, useRef } from "preact/hooks";
import { useTranslation } from "react-i18next";
import { Icon } from "@/components/icons";
import Input from "@/components/inputs";

export default function CommandBar({
  blueprints,
  typeFilters,
  setTypeFilters,
}: {
  blueprints: Record<string, any>;
  typeFilters: string[];
  setTypeFilters: (t: string[]) => void;
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const entityTypes = useMemo(
    () => Object.keys(blueprints).sort(),
    [blueprints],
  );

  const typeQuery = useMemo(() => {
    const match = query.match(/^type:(.*)$/i);
    return match ? match[1] : null;
  }, [query]);

  const suggestions = useMemo(() => {
    if (typeQuery === null) return [];
    const q = typeQuery.toLowerCase();
    return entityTypes.filter((t) => t.toLowerCase().includes(q));
  }, [typeQuery, entityTypes]);

  const showDropdown = open && typeQuery !== null && suggestions.length > 0;

  useEffect(() => {
    setActiveIndex(-1);
  }, [suggestions]);

  // Scroll active item into view
  useEffect(() => {
    if (activeIndex < 0 || !listRef.current) return;
    const item = listRef.current.children[activeIndex] as
      | HTMLElement
      | undefined;
    item?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as unknown as globalThis.Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const toggleType = (type: string) => {
    setTypeFilters(
      typeFilters.includes(type)
        ? typeFilters.filter((t) => t !== type)
        : [...typeFilters, type],
    );
    // Reset query to allow picking another type immediately
    setQuery("type:");
    setActiveIndex(-1);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const removeType = (type: string) => {
    setTypeFilters(typeFilters.filter((t) => t !== type));
  };

  const clear = () => {
    setQuery("");
    setTypeFilters([]);
    setOpen(false);
  };

  const handleInput = (e: Event) => {
    const val = (e.target as HTMLInputElement).value;
    setQuery(val);
    setOpen(true);
    if (!/^type:/i.test(val)) setTypeFilters([]);
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    e.stopPropagation();

    if (e.key === "Escape") {
      setOpen(false);
      (e.target as HTMLInputElement).blur();
      return;
    }

    // Backspace on empty query removes last active filter
    if (e.key === "Backspace" && query === "" && typeFilters.length > 0) {
      setTypeFilters(typeFilters.slice(0, -1));
      return;
    }

    if (!showDropdown) return;

    if (e.key === "Tab") {
      e.preventDefault();
      const next = e.shiftKey
        ? activeIndex <= 0
          ? suggestions.length - 1
          : activeIndex - 1
        : activeIndex >= suggestions.length - 1
          ? 0
          : activeIndex + 1;
      setActiveIndex(next);
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => (i >= suggestions.length - 1 ? 0 : i + 1));
      return;
    }

    if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
      return;
    }

    if (e.key === "Enter") {
      if (activeIndex >= 0) toggleType(suggestions[activeIndex]);
      else if (suggestions.length === 1) toggleType(suggestions[0]);
    }
  };

  const hasFilters = typeFilters.length > 0;

  return (
    <div ref={containerRef} className="relative">
      {/* Suggestions dropdown — appears above the bar */}
      {showDropdown && (
        <div
          ref={listRef}
          className="absolute bottom-full mb-2 left-0 right-0 max-h-64 overflow-y-auto rounded-sm border border-ink/10 bg-[linear-gradient(180deg,rgba(8,12,22,0.97),rgba(4,6,12,0.95))] shadow-xl"
        >
          {suggestions.map((type, i) => {
            const isActive = i === activeIndex;
            const isSelected = typeFilters.includes(type);
            return (
              <button
                key={type}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  toggleType(type);
                }}
                onMouseEnter={() => setActiveIndex(i)}
                className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors ${
                  isActive ? "bg-ink/10" : "hover:bg-ink/5"
                }`}
              >
                <span className="font-display text-[10px] uppercase tracking-[0.28em] text-ink-hard/40">
                  {t("graph.commandBar.kind")}
                </span>
                <span className={isSelected ? "text-sea" : "text-ink"}>
                  {type}
                </span>
                {isActive && !isSelected && (
                  <span className="ml-auto font-display text-[10px] uppercase tracking-[0.24em] text-ink-hard/30">
                    {`↵ ${t("graph.commandBar.select")}`}
                  </span>
                )}
                {isSelected && (
                  <Icon icon="check" className="ml-auto h-3.5 w-3.5 text-sea" />
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Active filter pills — above the input */}
      {hasFilters && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {typeFilters.map((type) => (
            <span
              key={type}
              className="inline-flex items-center gap-1 rounded-sm border border-sea/30 bg-sea/10 pl-2 pr-1 py-0.5 font-display text-[10px] uppercase tracking-[0.24em] text-sea"
            >
              {type}
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  removeType(type);
                }}
                className="text-sea/60 hover:text-sea transition-colors"
              >
                <Icon icon="x" className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* <Input.AltIcon
        icon={
          <div class="inline-flex relative">
            <Icon icon="command" className="h-5 w-5 mt-0.5 -ml-1" />
            {query && (
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  clear();
                }}
                className="shrink-0 text-ink-hard/40 mx-2 bg-paper transition-colors hover:text-ink-soft"
              >
                <Icon icon="x" className="h-5 w-5 text-danger" />
              </button>
            )}
          </div>
        }
        ref={inputRef}
        value={query}
        onInput={handleInput}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        className="rounded-full min-w-100"
        placeholder={t("graph.commandBar.placeholder")}
      /> */}
    </div>
  );
}
