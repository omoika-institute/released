import { Icon } from "@/components/icons";
import { useTranslation } from "react-i18next";
import type { LayoutMode } from "./types";
import { Button, buttonClass } from "@/components/buttons/Button";

type LayoutToggleProps = {
  layoutMode: LayoutMode;
  setLayoutMode: (mode: LayoutMode) => void;
};

export default function LayoutToggle({
  layoutMode,
  setLayoutMode,
}: LayoutToggleProps) {
  const { t } = useTranslation();

  return (
    <>
      <Button
        type="button"
        onClick={() => setLayoutMode("grid")}
        aria-pressed={layoutMode === "grid"}
        className={buttonClass(
          layoutMode === "grid" ? "primary" : "ghost",
          "px-0 w-16"
        )}
        title={t("overview.layout.grid")}
      >
        <Icon icon="layout-2" className="h-4 w-4" />
      </Button>
      <Button
        type="button"
        onClick={() => setLayoutMode("list")}
        aria-pressed={layoutMode === "list"}
        className={buttonClass(
          layoutMode === "list" ? "primary" : "ghost",
          " px-0 w-16"
        )}
        title={t("overview.layout.list")}
      >
        <Icon icon="list" className="h-4 w-4" />
      </Button>
    </>
  );
}
