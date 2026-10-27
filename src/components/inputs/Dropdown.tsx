import { Icon } from "@/components/icons";

import { usePropertiesStore } from "@/stores";
import { useReactFlow } from "@xyflow/react";
import type { JSX } from "preact";
import {
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
  onChange?: (event: any) => void;
}
interface DropdownOptionProps {
  label: string;
  tooltip?: string;
  value: string;
}

interface AltDropdownProps {
  options: DropdownOptionProps[];
  value: string;
  label?: string;
  title?: string;
  disabled?: boolean;
  className?: string;
  menuClassName?: string;
  onValueChange: (value: string) => void;
}

export function AltDropdown({
  options,
  value,
  label,
  title,
  disabled,
  onValueChange,
}: AltDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const activeOption = options.find((option) => option.value === value);
  const displayValue = activeOption?.label ?? value;

  const updateMenuPosition = useCallback(() => {
    const rect = dropdownRef.current?.getBoundingClientRect();
    if (!rect) return;
  }, []);

  const commitValue = useCallback(
    (nextValue: string) => {
      onValueChange(nextValue);
      setIsOpen(false);
      setActiveIndex(-1);
    },
    [onValueChange],
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (disabled) return;

      if (!isOpen) {
        if (
          event.key === "ArrowDown" ||
          event.key === "ArrowUp" ||
          event.key === "Enter" ||
          event.key === " "
        ) {
          setIsOpen(true);
          updateMenuPosition();
          setActiveIndex(
            Math.max(
              0,
              options.findIndex((option) => option.value === value),
            ),
          );
          event.preventDefault();
        }
        return;
      }

      if (event.key === "ArrowDown") {
        setActiveIndex((previous) =>
          options.length === 0 || previous + 1 >= options.length
            ? 0
            : previous + 1,
        );
        event.preventDefault();
      } else if (event.key === "ArrowUp") {
        setActiveIndex((previous) =>
          options.length === 0
            ? 0
            : previous - 1 < 0
              ? options.length - 1
              : previous - 1,
        );
        event.preventDefault();
      } else if (event.key === "Enter" && options[activeIndex]) {
        commitValue(options[activeIndex].value);
        event.preventDefault();
      } else if (event.key === "Escape") {
        setIsOpen(false);
        setActiveIndex(-1);
        event.preventDefault();
      }
    },
    [
      activeIndex,
      commitValue,
      disabled,
      isOpen,
      options,
      updateMenuPosition,
      value,
    ],
  );

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        !dropdownRef.current?.contains(target) &&
        !menuRef.current?.contains(target)
      ) {
        setIsOpen(false);
        setActiveIndex(-1);
      }
    };

    updateMenuPosition();
    document.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("resize", updateMenuPosition);
    window.addEventListener("scroll", updateMenuPosition, true);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("resize", updateMenuPosition);
      window.removeEventListener("scroll", updateMenuPosition, true);
    };
  }, [isOpen, updateMenuPosition]);
  return (
    <div ref={dropdownRef} className={`relative h-full w-full z-99 bg-canvas`}>
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={label}
        title={title ?? label}
        onClick={() => {
          setIsOpen((open) => !open);
          updateMenuPosition();
          setActiveIndex(
            Math.max(
              0,
              options.findIndex((option) => option.value === value),
            ),
          );
        }}
        onKeyDown={handleKeyDown}
        className={`flex text-primary-txt cursor-pointer h-full px-3 w-full items-center justify-between text-left outline-none disabled:cursor-not-allowed disabled:opacity-60 font-display text-sm border-b ${isOpen ? "border-b-review-border/15 bg-black/30" : "border-b-transparent"}`}
      >
        <span className="truncate">{displayValue}</span>
        <Icon
          icon={"chevron-down"}
          className={`${isOpen ? "rotate-180" : "rotate-0"} transition-transform duration-150 origin-center h-4 w-4 shrink-0 text-review-border`}
        />
      </button>
      <div
        role="listbox"
        class={[
          "grid transition-[grid-template-rows] duration-150 ease-in-out absolute mt-0.5 w-full rounded-sm bg-panel max-h-42 shadow-2xl shadow-black/40",
          isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        ].join(" ")}
      >
        <div className="overflow-hidden ">
          <div className="max-h-42 overflow-y-scroll">
            {options.map((option, index) => {
              const isSelected = option.value === value;
              const isActive = index === activeIndex;

              return (
                <button
                  key={option.value}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  title={option.tooltip ?? option.label}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => commitValue(option.value)}
                  className={`cursor-pointer w-full flex items-center justify-between gap-2 px-3 py-1 text-sm transition-colors font-sans ${
                    isSelected
                      ? "bg-subtle/50 text-primary-txt"
                      : "text-body-txt hover:bg-subtle/25 hover:text-primary-txt"
                  }`}
                >
                  <span className="whitespace-nowrap">{option.label}</span>
                  {isSelected && (
                    <Icon
                      icon="square-check"
                      className="h-4 w-4 text-review-border"
                    />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

export function Dropdown({
  options = [],
  label,
  id,
  value,
  data,
  onChange,
}: DropdownInputProps) {
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
              option.label.toLowerCase().includes(query.toLowerCase()) ||
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
    (option: DropdownOptionProps) => {
      onChange(option);
      const optionValue =
        option?.value && option.value.length > 0 ? option.value : option.label;
      setIsOpen(false);
      setActiveIndex(-1);
      setQuery("");
      setDisplayValue(option.label);
      const key = label;
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
    },
    [label, id, updateNodeData, data],
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
    (event: JSX.TargetedEvent<HTMLInputElement, Event>) => {
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
        | HTMLElement
        | undefined;

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
        <p className="whitespace-wrap font-display mt-1 text-xs font-semibold text-slate-400">
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
          className="nodrag mr-4 w-full px-2 outline-hidden text-base"
        />
        <button
          type="button"
          tabIndex={1}
          onClick={handleToggle}
          className="group text-primary absolute inset-y-0 right-0 h-5 w-5 focus:outline-hidden"
          aria-label={isOpen ? "Close options" : "Open options"}
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
            id={`${id}-${label}-listbox`}
            className="nodrag nowheel absolute z-999 mt-1 mr-1 max-h-52 w-full overflow-y-auto rounded-b-md bg-linear-to-br text-base! from-slate-950 from-30% to-black/20 py-1 shadow-lg backdrop-blur-lg focus:outline-hidden "
          >
            {filteredOptions.length === 0 ? (
              <div className="px-2 py-2 text-xs text-slate-500">
                No options found
              </div>
            ) : (
              filteredOptions.map((option, index) => (
                <button
                  key={`${option.label}-${index}`}
                  role="option"
                  onClick={() => selectOption(option)}
                  onMouseEnter={() => setActiveIndex(index)}
                  className={`overflow-y-none nowheel nodrag relative flex w-full cursor-pointer flex-col items-start justify-items-start border-l-2 bg-black/15 px-2 py-1 hover:bg-black/30 ${
                    activeOption?.label === option.label &&
                    activeOption?.value === option.value // if option is currently selected
                      ? "border-primary bg-black/50 text-slate-500 hover:bg-black/65 hover:text-slate-500"
                      : index === activeIndex // else if current potential option being hovered
                        ? "border-primary-300 text-slate-350 border-l-2 bg-black/75"
                        : "border-transparent text-slate-600"
                  }`}
                >
                  <span
                    className="font-display block truncate text-xs font-medium"
                    title={
                      option.tooltip !== option.label ? option.tooltip : ""
                    }
                  >
                    {option.label}
                  </span>
                  {option?.value && (
                    <span
                      className={`flex truncate text-[0.65rem] leading-3 ${index === activeIndex && "text-slate-400"}`}
                    >
                      {option.value}
                    </span>
                  )}
                  {activeOption?.label === option.label &&
                    activeOption?.value === option.value && (
                      <div class="bg-primary absolute top-2 right-3 h-1.5 w-1.5 rounded-full" />
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

export default Dropdown;
