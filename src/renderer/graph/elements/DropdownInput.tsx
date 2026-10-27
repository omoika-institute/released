import { Icon } from "@/components/icons";

import { toSnakeCase } from "../utils";
import { usePropertiesStore } from "@/stores";
import { useReactFlow } from "@xyflow/react";
import { useParams } from "react-router-dom";
import {
  ChangeEvent,
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "preact/compat";

interface DropdownInputProps {
  options: DropdownOptionProps[];
  label: string;
  id: string;
  value: string;
  data: any;
}
interface DropdownOptionProps {
  label: string;
  tooltip: string;
  value: string;
}

export function DropdownInput({
  options = [],
  label,
  id,
  value,
  data,
}: DropdownInputProps) {
  const { hid } = useParams();
  const [query, setQuery] = useState("");
  const [displayValue, setDisplayValue] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const comboboxRef = useRef<HTMLDivElement>(null);
  const isScrollingOrMouseDownOnListRef = useRef<boolean | null>(null);
  // TODO: Fix this broken fuzzy search
  const filteredOptions = useMemo(
    () =>
      query === "" || !isOpen
        ? options
        : options.filter((option: DropdownOptionProps) => {
            return (
              option.label.toLowerCase().includes(query.toLowerCase()) ??
              option.value.toLowerCase().includes(query.toLowerCase())
            );
            // option?.label.toLowerCase().includes(query.toLowerCase())
          }),
    [query, options, isOpen],
  );

  const activeOption = options.find(
    (option) => option.value === value || option.label === value,
  );

  const { updateNodeData } = useReactFlow();
  const selectOption = useCallback(
    async (option: DropdownOptionProps) => {
      const optionValue =
        option?.value && option.value.length > 0 ? option.value : option.label;
      setIsOpen(false);
      setActiveIndex(-1);
      setQuery("");
      setDisplayValue(option.label);
      const key = toSnakeCase(label);
      // Update local node data so UI reflects the change immediately
      updateNodeData(id, { [key]: optionValue });
      // Update Properties panel if open and changed
      try {
        const propsStore = usePropertiesStore.getState();
        const tab = propsStore.tabs.find((t) => t.entityId === id);
        if (tab) {
          const nextData = { ...(data || {}), [key]: optionValue };
          const currStr = JSON.stringify(tab.data ?? {});
          const nextStr = JSON.stringify(nextData);
          if (currStr !== nextStr) propsStore.setData(id, nextData);
        }
      } catch (_) {}
      try {
        await window.api.graph.updateEntity({
          graphId: hid as string,
          entityId: id,
          updates: {
            data: {
              ...(data || {}),
              [key]: optionValue,
            },
          },
        });
      } catch (error) {
        console.error("Failed to update entity:", error);
      }
    },
    [label, id, updateNodeData, hid, data],
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
            prev < filteredOptions.length - 1 ? prev + 1 : 0,
          );
          break;
        case "ArrowUp":
          setActiveIndex((prev) =>
            prev > 0 ? prev - 1 : filteredOptions.length - 1,
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
    [isOpen, activeIndex, filteredOptions, selectOption],
  );

  const handleInputChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      setQuery(event?.currentTarget.value);
      setActiveIndex(-1);
    },
    [],
  );

  const handleInputFocus = useCallback(() => {
    setIsOpen(true);
    setQuery("");
    // Find the current active option index when opening
    const currentIndex = options.findIndex(
      (option) => option.value === value || option.label === value,
    );
    setActiveIndex(currentIndex >= 0 ? currentIndex : 0);
  }, [options, value]);

  const handleInputBlur = useCallback((event: FocusEvent) => {
    const relatedTarget = event.relatedTarget as Node | null;

    if (isScrollingOrMouseDownOnListRef.current || relatedTarget === null) {
      isScrollingOrMouseDownOnListRef.current = false;

      if (isOpen && inputRef.current) {
        setIsOpen(false);
        // inputRef.current.blur()
      }

      return;
    }
    if (!comboboxRef.current?.contains(relatedTarget)) {
      return; // Focus moved within the combobox, don't close
    }
    setActiveIndex(-1);
    setQuery("");
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
        (option) => option.value === value || option.label === value,
      );
      setActiveIndex(currentIndex >= 0 ? currentIndex : 0);
      inputRef.current?.focus();
    }
  }, [isOpen, options, value, setIsOpen]);

  useEffect(() => {
    if (activeOption?.label) {
      setDisplayValue(activeOption.label);
    }
  }, [activeOption]);
  useEffect(() => {
    if (isOpen && activeIndex >= 0 && listRef.current) {
      // Use requestAnimationFrame or setTimeout to defer scrolling until after render
      // Ensure listRef.current is still valid
      if (
        !listRef.current ||
        !listRef.current.children ||
        listRef.current.children.length === 0
      ) {
        return;
      }
      const activeElement = listRef.current.children[activeIndex] as
        HTMLElement | undefined;

      if (activeElement) {
        // minimal snappy scrolling to keep active keyboard selection visible
        activeElement.scrollIntoView({
          behavior: "instant",
          block: "nearest",
          inline: "nearest",
        });
      }
    }
  }, [isOpen, activeIndex]);

  return (
    <div ref={comboboxRef} className="dropdown-input w-full">
      <label>
        <p className="mt-1 font-display text-[0.5rem] font-medium tracking-wide text-terminal-txt/60">
          {label}
        </p>
      </label>
      <div className="node-field dropdown relative !px-0">
        <input
          ref={inputRef}
          role="combobox"
          aria-expanded={isOpen}
          aria-haspopup="listbox"
          aria-autocomplete="list"
          aria-controls={`${id}-${label}-listbox`}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          value={isOpen ? query : displayValue}
          onFocus={handleInputFocus}
          onBlur={handleInputBlur}
          className="nodrag mr-4 w-full px-2 outline-hidden"
        />
        <button
          type="button"
          tabIndex={1}
          onClick={handleToggle}
          className="group absolute inset-y-0 right-0 z-99 flex h-full w-6 items-center justify-center border-l border-subtle/50 text-primary-txt/50 transition-colors hover:bg-panel hover:text-review-border focus:outline-hidden"
          aria-label={isOpen ? "Close options" : "Open options"}
        >
          <Icon
            icon={isOpen ? "x" : "chevron-down"}
            className="h-4 w-4 text-inherit"
          />
        </button>
        {isOpen && (
          <div
            ref={listRef}
            role="listbox"
            id={`${id}-${label}-listbox`}
            className="nodrag nowheel absolute left-0 right-0 top-full z-[999] mt-1 max-h-52 w-full overflow-y-auto border border-subtle/50 bg-canvas py-1 text-[0.6rem] shadow-xl shadow-black/35 focus:outline-hidden sm:text-sm overflow-x-hidden"
          >
            {filteredOptions.length === 0 ? (
              <div className="px-2 py-2 font-display text-[10px] tracking-[0.22em] text-terminal-txt/60">
                No options found
              </div>
            ) : (
              filteredOptions.map((option, index) => (
                <button
                  key={`${option.label}-${index}`}
                  role="option"
                  onClick={() => selectOption(option)}
                  onMouseEnter={() => setActiveIndex(index)}
                  className={`nowheel nodrag relative flex w-full cursor-pointer flex-col items-start justify-items-start border-l-2 px-2 py-1.5 transition-colors hover:bg-panel ${
                    activeOption?.label === option.label &&
                    activeOption?.value === option.value // if option is currently selected
                      ? "border-review-border bg-review-border/5 text-primary-txt hover:bg-panel"
                      : index === activeIndex // else if current potential option being hovered
                        ? "border-review-border bg-panel text-primary-txt"
                        : "border-transparent text-terminal-txt"
                  }`}
                >
                  <span
                    className="block truncate font-display text-[0.6rem] font-medium "
                    title={
                      option.tooltip !== option.label ? option.tooltip : ""
                    }
                  >
                    {option.label}
                  </span>
                  {option?.value && (
                    <span
                      className={`flex truncate text-[10px] leading-3 ${index === activeIndex ? "text-primary-txt/70" : "text-terminal-txt/60"}`}
                    >
                      {option.value}
                    </span>
                  )}
                  {activeOption?.label === option.label &&
                    activeOption?.value === option.value && (
                      <div class="absolute right-3 top-2 h-1.5 w-1.5 rounded-full bg-review-border" />
                    )}
                </button>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default memo(DropdownInput);
