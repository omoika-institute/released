import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "preact/hooks";
import { useTranslation } from "react-i18next";
import Button from "@/components/buttons";
import Icon from "@/components/icons";

interface WorkspaceAppbarProps {
  library: Record<string, any> | null;
  onEntitySave: () => void;
  pluginEntities: Array<{ label: string; mtime: string }>;
  selectedEntity: string;
  activeTab: "layout" | "preview" | "json" | "transforms";
  onEntitySelect: (value: string) => void;
  onCreateEntity: () => void;
  onImportFile: (event: Event) => void;
  onGenerate: () => void;
  onTabChange: (tab: "layout" | "preview" | "json" | "transforms") => void;
}

type EntityDropdownOption = {
  label: string;
  value: string;
  group?: string;
  meta?: string;
};

export default function WorkspaceAppbar({
  library,
  pluginEntities,
  selectedEntity,
  activeTab,
  onEntitySelect,
  onCreateEntity,
  onImportFile,
  onGenerate,
  onTabChange,
  onEntitySave,
}: WorkspaceAppbarProps) {
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const comboboxRef = useRef<HTMLDivElement>(null);
  const isScrollingOrMouseDownOnListRef = useRef<boolean | null>(null);
  const [query, setQuery] = useState("");
  const [displayValue, setDisplayValue] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const options = useMemo<EntityDropdownOption[]>(() => {
    const baseOptions: EntityDropdownOption[] = [
      {
        label: t("workspace.appbar.newUnsavedEntity"),
        value: "",
        meta: t("workspace.appbar.unsaved"),
      },
    ];
    const pluginOptions = pluginEntities.map((entity) => ({
      label: entity.label,
      value: `plugin:${entity.label}`,
    }));
    const libraryOptions = library
      ? Object.keys(library).map((key) => ({
          label: key,
          value: `imported:${key}`,
          group: t("workspace.appbar.importedLibrary"),
          meta: t("workspace.appbar.importedEntity"),
        }))
      : [];
    return [...baseOptions, ...pluginOptions, ...libraryOptions];
  }, [library, pluginEntities, t]);

  const activeOption = options.find(
    (option) => option.value === selectedEntity
  );
  const filteredOptions = useMemo(() => {
    if (query === "" || !isOpen) return options;
    const lowered = query.toLowerCase();
    return options.filter((option) => {
      return (
        option.label.toLowerCase().includes(lowered) ||
        option.value.toLowerCase().includes(lowered) ||
        option.meta?.toLowerCase().includes(lowered) ||
        option.group?.toLowerCase().includes(lowered)
      );
    });
  }, [options, query, isOpen]);

  const listRows = useMemo(() => {
    const rows: Array<
      | { type: "group"; label: string }
      | { type: "option"; option: EntityDropdownOption; index: number }
    > = [];
    let currentGroup: string | null = null;
    let optionIndex = -1;

    filteredOptions.forEach((option) => {
      if (option.group && option.group !== currentGroup) {
        rows.push({ type: "group", label: option.group });
        currentGroup = option.group;
      }
      if (!option.group) currentGroup = null;
      optionIndex += 1;
      rows.push({ type: "option", option, index: optionIndex });
    });
    return rows;
  }, [filteredOptions]);

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const selectOption = useCallback(
    (option: EntityDropdownOption) => {
      setIsOpen(false);
      setActiveIndex(-1);
      setQuery("");
      setDisplayValue(option.label);
      onEntitySelect(option.value);
      inputRef.current?.blur();
    },
    [onEntitySelect]
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!isOpen) {
        if (
          event.key === "ArrowDown" ||
          event.key === "Enter" ||
          event.key === " "
        ) {
          setIsOpen(true);
          setActiveIndex(0);
          event.preventDefault();
        }
        return;
      }

      switch (event.key) {
        case "ArrowDown":
          setActiveIndex((prev) =>
            prev < filteredOptions.length - 1 ? prev + 1 : 0
          );
          break;
        case "ArrowUp":
          setActiveIndex((prev) =>
            prev > 0 ? prev - 1 : filteredOptions.length - 1
          );
          event.preventDefault();
          break;
        case "Enter":
          if (activeIndex >= 0 && filteredOptions[activeIndex]) {
            selectOption(filteredOptions[activeIndex]);
          }
          break;
        case "Escape":
          setIsOpen(false);
          setActiveIndex(-1);
          inputRef.current?.blur();
          event.preventDefault();
          break;
        case "Tab":
          setActiveIndex((prev) => {
            if (prev === filteredOptions.length - 1) {
              setIsOpen(false);
              return -1;
            }
            return prev < filteredOptions.length - 1 ? prev + 1 : 0;
          });
          event.preventDefault();
          break;
      }
    },
    [activeIndex, filteredOptions, isOpen, selectOption]
  );

  const handleInputChange = useCallback((event: Event) => {
    const target = event.currentTarget as HTMLInputElement;
    setQuery(target.value);
    setActiveIndex(-1);
  }, []);

  const handleInputFocus = useCallback(() => {
    setIsOpen(true);
    setQuery("");
    const currentIndex = options.findIndex(
      (option) => option.value === selectedEntity
    );
    setActiveIndex(currentIndex >= 0 ? currentIndex : 0);
  }, [options, selectedEntity]);

  const handleInputBlur = useCallback((event: FocusEvent) => {
    const relatedTarget = event.relatedTarget as Node | null;

    if (isScrollingOrMouseDownOnListRef.current) {
      isScrollingOrMouseDownOnListRef.current = false;
      return;
    }
    if (relatedTarget && comboboxRef.current?.contains(relatedTarget)) {
      return;
    }
    setActiveIndex(-1);
    setQuery("");
    setIsOpen(false);
  }, []);

  const handleToggle = useCallback(() => {
    if (isOpen) {
      setIsOpen(false);
      setActiveIndex(-1);
      setQuery("");
      inputRef.current?.blur();
    } else {
      setIsOpen(true);
      setQuery("");
      const currentIndex = options.findIndex(
        (option) => option.value === selectedEntity
      );
      setActiveIndex(currentIndex >= 0 ? currentIndex : 0);
      inputRef.current?.focus();
    }
  }, [isOpen, options, selectedEntity]);

  useEffect(() => {
    if (activeOption?.label) {
      setDisplayValue(activeOption.label);
    } else {
      setDisplayValue(t("workspace.appbar.newUnsavedEntity"));
    }
  }, [activeOption, t]);

  useEffect(() => {
    if (isOpen && activeIndex >= 0 && listRef.current) {
      const activeElement = listRef.current.querySelector(
        `[data-option-index="${activeIndex}"]`
      ) as HTMLElement | null;
      if (activeElement) {
        activeElement.scrollIntoView({
          behavior: "instant",
          block: "nearest",
          inline: "nearest",
        });
      }
    }
  }, [isOpen, activeIndex]);

  return (
    <header class="relative flex shrink items-center rounded-md border-r-3 border-black/10 bg-linear-to-tr from-black/40 to-black/50 shadow-2xl shadow-black/25 backdrop-blur-md  px-2 w-full gap-x-4 z-99">
      <div className="flex items-center gap-x-3">
        <div className="flex items-center gap-3 w-full">
          <div ref={comboboxRef} className="dropdown-input relative min-w-78 ">
            <div className="node-field dropdown relative px-0!">
              <input
                ref={inputRef}
                role="combobox"
                aria-expanded={isOpen}
                aria-haspopup="listbox"
                aria-autocomplete="list"
                aria-controls="workspace-entity-listbox"
                onInput={handleInputChange}
                onKeyDown={handleKeyDown}
                value={isOpen ? query : displayValue}
                onFocus={handleInputFocus}
                onBlur={handleInputBlur}
                placeholder={t("workspace.appbar.selectEntity")}
                className={`nodrag mr-4 w-full outline-transparent rounded border-2 border-transparent bg-transparent bg-linear-to-br from-black/35 to-black/10 px-2 py-2 text-sm font-sans text-slate-350 outline-1 transition-all duration-100 ease-in placeholder:text-slate-700 hover:from-black/35 hover:to-black/20 focus:border-2 focus:border-primary focus:bg-black/60 focus-visible:outline-transparent ${
                  pluginEntities.length || library ? "" : "opacity-80"
                }`}
              />
              <button
                type="button"
                tabIndex={1}
                onClick={handleToggle}
                className="group text-primary absolute inset-y-0  top-1 right-1 z-99 h-5 w-5 focus:outline-hidden"
                aria-label={
                  isOpen
                    ? t("workspace.appbar.closeOptions")
                    : t("workspace.appbar.openOptions")
                }
              >
                <Icon
                  icon={isOpen ? "x" : "chevron-down"}
                  className="h-5 w-5 text-inherit"
                />
              </button>
              {isOpen && (
                <div
                  ref={listRef}
                  role="listbox"
                  id="workspace-entity-listbox"
                  onMouseDown={() => {
                    isScrollingOrMouseDownOnListRef.current = true;
                  }}
                  onMouseUp={() => {
                    isScrollingOrMouseDownOnListRef.current = false;
                  }}
                  className="nodrag nowheel absolute z-999 mt-1 mr-1 max-h-60 w-full overflow-y-auto rounded-b-md bg-linear-to-tl from-slate-950 from-30% to-mirage-950 backdrop-blur-2xl py-1 text-[0.6rem] shadow-lg focus:outline-hidden sm:text-sm"
                >
                  {filteredOptions.length === 0 ? (
                    <div className="px-2 py-2 text-xs text-slate-500">
                      {t("workspace.appbar.noOptionsFound")}
                    </div>
                  ) : (
                    listRows.map((row) => {
                      if (row.type === "group") {
                        return (
                          <div
                            key={`group-${row.label}`}
                            className="px-2 py-1 text-sm font-semibold uppercase tracking-wide text-slate-500"
                          >
                            {row.label}
                          </div>
                        );
                      }

                      const isSelected =
                        activeOption?.label === row.option.label &&
                        activeOption?.value === row.option.value;
                      const isActive = row.index === activeIndex;

                      return (
                        <button
                          key={`${row.option.value}-${row.index}`}
                          role="option"
                          data-option-index={row.index}
                          onClick={() => selectOption(row.option)}
                          onMouseEnter={() => setActiveIndex(row.index)}
                          className={`overflow-y-none nowheel nodrag relative flex w-full cursor-pointer flex-col items-start justify-items-start border-l-2 bg-black/15 px-2 py-1 text-left hover:bg-black/30 ${
                            isSelected
                              ? "border-primary bg-black/50 text-slate-500 hover:bg-black/65 hover:text-slate-500"
                              : isActive
                                ? "border-primary-300 text-slate-350 border-l-2 bg-black/75"
                                : "border-transparent text-slate-600"
                          }`}
                        >
                          <span
                            className="font-display block truncate text-sm font-medium"
                            title={row.option.label}
                          >
                            {row.option.label}
                          </span>

                          {isSelected && (
                            <div class="bg-primary absolute top-2 right-3 h-1.5 w-1.5 rounded-full" />
                          )}
                        </button>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          </div>
          <Button.Ghost
            variant="primary"
            className="text-xs w-full my-2"
            onClick={onCreateEntity}
          >
            {t("common.create")}
            <Icon icon="ghost" className="h-4 w-4 ml-2" />
          </Button.Ghost>
          <Button.Ghost
            variant="primary"
            className="text-xs"
            onClick={handleImportClick}
          >
            {t("workspace.appbar.import")}
            <Icon icon="file-import" className="h-4 w-4 ml-2" />
          </Button.Ghost>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json"
            onChange={onImportFile}
            className="hidden"
          />
        </div>
        <Button.Ghost variant="primary" className="text-xs">
          {t("workspace.appbar.export")}
          <Icon icon="file-download" className="h-4 w-4 ml-2" />
        </Button.Ghost>
      </div>
      <nav className="flex items-center ml-auto mr-2">
        <Button.Solid
          variant="primary"
          onClick={onEntitySave}
          className="text-xs mr-8"
        >
          {t("workspace.appbar.saveEntity")}
          <Icon icon="device-floppy" className="h-4 w-4 ml-2" />
        </Button.Solid>
        <ul className="flex gap-x-6 text-sm font-semibold">
          {[
            { key: "layout", label: t("workspace.appbar.tabs.layout") },
            { key: "preview", label: t("workspace.appbar.tabs.preview") },
            { key: "json", label: t("workspace.appbar.tabs.json") },
            { key: "transforms", label: t("workspace.appbar.tabs.transforms") },
          ].map((item) => (
            <li key={item.key}>
              <button
                type="button"
                onClick={() =>
                  onTabChange(
                    item.key as "layout" | "preview" | "json" | "transforms"
                  )
                }
                className={`font-display transition-colors duration-150 ${
                  activeTab === item.key
                    ? "text-primary-300"
                    : "text-slate-600 hover:text-slate-500"
                }`}
              >
                {item.label}
              </button>
            </li>
          ))}
        </ul>
      </nav>
    </header>
  );
}
