import { useEffect, useRef, useState } from "preact/hooks";
import { useTranslation } from "react-i18next";
import i18n from "@/i18n";
import { Icon } from "@/components/icons";
import {
  LANGUAGE_OPTIONS,
  resolveSupportedLanguage,
  type SupportedLanguage,
} from "@/i18n/languages";
import { useSettingsStore } from "@/stores/settings";

type LanguageSwitcherProps = {
  menuPlacement?: "bottom" | "top";
};

export default function LanguageSwitcher({
  menuPlacement = "bottom",
}: LanguageSwitcherProps) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target || !containerRef.current?.contains(target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [isOpen]);

  const currentLanguage = resolveSupportedLanguage(
    i18n.resolvedLanguage || i18n.language,
  );

  const handleLanguageChange = async (language: SupportedLanguage) => {
    if (language === currentLanguage) {
      setIsOpen(false);
      return;
    }

    window.localStorage.setItem("i18nextLng", language);
    await useSettingsStore.getState().update({ language });
    await i18n.changeLanguage(language);
    setIsOpen(false);
  };

  return (
    <div ref={containerRef} className="relative cursor-pointer group">
      <button
        onClick={() => setIsOpen((prev) => !prev)}
        className="w-56 text-right cursor-pointer"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
      >
        {menuPlacement === "top" && (
          <div className="mb-1.5 border-t border-dashed border-micro-txt" />
        )}
        <div className="flex items-center justify-end gap-3 text-sm text-auto-txt  ">
          <Icon
            icon="language"
            className="h-4 w-4 group-hover:animate-wiggle group-hover:text-main-txt transition-colors duration-300"
          />{" "}
          <span className="text-counter-txt">/</span>
          <span className="group-hover:text-main-txt transition-colors duration-300">
            {t("common.language")}...
          </span>
          <span className="text-counter-txt">/</span>
          <span className="text-[10px] tracking-[0.15rem] uppercase group-hover:text-review-border transition-colors duration-300">
            {currentLanguage}
          </span>
        </div>
        {menuPlacement === "bottom" && (
          <div className="mt-1.5 border-t border-dashed border-micro-txt" />
        )}
      </button>

      <div
        role="listbox"
        aria-label={t("overview.languageSwitcher.select")}
        class={[
          "grid transition-[grid-template-rows] duration-150 ease-in-out absolute min-w-56 overflow-hidden rounded-sm  bg-panel shadow-2xl shadow-black/40",
          isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
          menuPlacement === "top"
            ? "bottom-[calc(100%+.25rem)] left-0"
            : "right-0 top-[calc(100%+0.25rem)]",
        ].join(" ")}
      >
        <div class="overflow-hidden">
          {LANGUAGE_OPTIONS.map((option) => {
            const isSelected = option.value === currentLanguage;

            return (
              <button
                key={option.value}
                type="button"
                onClick={() => handleLanguageChange(option.value)}
                className={`cursor-pointer flex w-full items-center gap-2 py-1 px-3 text-left text-sm transition-colors ${
                  isSelected
                    ? "bg-subtle/50 text-primary-txt"
                    : "text-body-txt hover:bg-subtle/25 hover:text-primary-txt"
                }`}
              >
                <span className="font-display border-r pr-2 border-subtle text-[10px] uppercase tracking-[0.25em] text-terminal-txt">
                  {option.value}
                </span>
                <span className="flex-1">{option.label}</span>
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
  );
}
