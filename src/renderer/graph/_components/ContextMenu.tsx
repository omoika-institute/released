import { Icon } from "@/components/icons";
import { useState, useEffect, useCallback, useMemo } from "preact/hooks";
import { useTranslation } from "react-i18next";
import Input from "@/components/inputs";
import { useEntitiesStore, useFlowStore } from "@/stores";
import { toSnakeCase } from "../utils";
import { CtxPosition } from "./Graph";
import { toast } from "react-toastify";
import ShinyText from "@/components/ShinyText";
import { useParams } from "react-router-dom";
import { Node as FlowNode } from "@xyflow/react";
import Tooltip from "@/components/Tooltip";
import { getLocalPluginDirs } from "@/renderer/plugins/catalog";

type ContextMenuNodeData = Record<string, unknown> & {
  label?: string;
};

type ContextMenuNode = FlowNode<ContextMenuNodeData>;

const menuPanelClass =
  "absolute right-0 z-10 w-64 origin-top-right overflow-hidden border border-subtle/50 bg-canvas shadow-xl shadow-black/35 focus:outline-hidden";
const menuSectionClass = "border-b border-subtle/50 last:border-b-0";
const menuRowClass =
  "group relative flex w-full items-center gap-2 border-l-2 border-l-transparent px-3 py-2 text-left font-display text-[10px] uppercase tracking-[0.24em] text-terminal-txt transition-colors duration-150 hover:border-l-review-border hover:bg-panel hover:text-ink-soft focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-review-border";
const menuDangerRowClass =
  "group relative flex w-full items-center gap-2 border-l-2 border-l-transparent px-3 py-2 text-left font-display text-[10px] uppercase tracking-[0.24em] text-terminal-txt transition-colors duration-150 hover:border-l-danger hover:bg-red-400/5 hover:text-danger focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-danger";
const menuIconClass = "h-3.5 w-3.5 shrink-0 text-primary-txt/50";
const menuDangerIconClass =
  "h-3.5 w-3.5 shrink-0 text-primary-txt/50 group-hover:text-danger";

export interface ContextMenuProps {
  closeMenu: () => void;
  position?: CtxPosition;
  selection: ContextMenuNode | ContextMenuNode[] | null;
  onDeleteEntities: (nodes: ContextMenuNode[]) => void | Promise<void>;
}

export default function ContextMenu({
  closeMenu,
  position,
  selection,
  onDeleteEntities,
}: ContextMenuProps) {
  const { t } = useTranslation();
  if (!position) return null;
  const { hid } = useParams();
  const { transforms, fetchTransforms, isLoadingTransforms } =
    useEntitiesStore();
  const { nodes, setEntities } = useFlowStore();
  const [query, setQuery] = useState("");

  const isArraySelection = Array.isArray(selection);
  const multiSelection = isArraySelection && selection.length > 1;
  const singleSelection = !isArraySelection
    ? selection
    : selection.length === 1
      ? selection[0]
      : null;
  const selectedNodes: ContextMenuNode[] = multiSelection
    ? selection
    : singleSelection
      ? [singleSelection]
      : [];
  const selectedCount = selectedNodes.length;

  const handleCtxMenuIdClick = useCallback(() => {
    if (singleSelection?.id) {
      navigator.clipboard.writeText(singleSelection.id);
      toast.info(t("graph.contextMenu.copiedId", { id: singleSelection.id }));
    }
  }, [singleSelection]);

  const handleBulkTypeChange = useCallback(
    (nextType: "edit" | "view") => {
      if (!selectedNodes.length) return;
      const selectedIds = new Set(selectedNodes.map((node) => node.id));
      setEntities(
        nodes.map((node) =>
          selectedIds.has(node.id) ? { ...node, type: nextType } : node,
        ),
      );
      closeMenu();
    },
    [nodes, selectedNodes, setEntities, closeMenu],
  );

  const handleDeleteSelection = useCallback(async () => {
    if (!selectedNodes.length) return;
    closeMenu();
    await onDeleteEntities(selectedNodes);
  }, [closeMenu, onDeleteEntities, selectedNodes]);

  const selectedLabel =
    typeof singleSelection?.data?.label === "string"
      ? singleSelection.data.label
      : undefined;
  const isUnverified = singleSelection?.type === "unverifiedNodeType";
  const localPluginDirs = useMemo(() => getLocalPluginDirs(), []);
  const availableTransforms = selectedLabel
    ? (transforms[selectedLabel] ?? [])
    : [];
  const filteredTransforms = useMemo(
    () =>
      availableTransforms.length
        ? query
          ? availableTransforms.filter((transform: any) =>
              transform.label.toLowerCase().includes(query.toLowerCase()),
            )
          : availableTransforms
        : [],
    [availableTransforms, query],
  );

  // Fetch transforms if ctx selection change
  useEffect(() => {
    if (selectedLabel) fetchTransforms(selectedLabel, localPluginDirs);
  }, [selectedLabel, fetchTransforms, localPluginDirs]);

  return (
    <>
      <div
        id="context-menu"
        className="absolute z-999 inline-block text-left"
        style={{ ...position }}
      >
        <div className={menuPanelClass}>
          {singleSelection && (
            <Tooltip
              className="absolute w-full"
              side="bottom"
              showDelay={1500}
              content={t("graph.contextMenu.copyId")}
            >
              <button
                onClick={handleCtxMenuIdClick}
                className={`${menuRowClass} bg-review-border/5 text-primary-txt hover:bg-panel`}
              >
                <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-review-border" />
                <Icon
                  icon="copy"
                  className="h-3.5 w-3.5 shrink-0 text-review-border"
                />
                <span className="text-primary-txt/50">ID</span>
                <span className="truncate">
                  {singleSelection.id.toUpperCase().slice(0, 8)}
                </span>
              </button>
            </Tooltip>
          )}
          {multiSelection && (
            <div className={`${menuSectionClass} bg-review-border/5 px-3 py-2`}>
              <span className="font-display text-[10px] uppercase tracking-[0.24em] text-primary-txt">
                {t("graph.contextMenu.selectedEntities", {
                  count: selectedCount,
                })}
              </span>
            </div>
          )}
          {multiSelection && (
            <div className={menuSectionClass}>
              <button
                className={menuRowClass}
                onClick={() => handleBulkTypeChange("edit")}
                type="button"
              >
                <Icon icon="edit" className={menuIconClass} />
                {t("graph.contextMenu.setEditMode")}
              </button>
              <button
                className={menuRowClass}
                onClick={() => handleBulkTypeChange("view")}
                type="button"
              >
                <Icon icon="eye" className={menuIconClass} />
                {t("graph.contextMenu.setViewMode")}
              </button>
              <button
                className={menuDangerRowClass}
                onClick={handleDeleteSelection}
                type="button"
              >
                <Icon icon="trash" className={menuDangerIconClass} />
                {t("graph.contextMenu.deleteSelected")}
              </button>
            </div>
          )}
          {singleSelection && (
            <div className={menuSectionClass}>
              <Input.AltIcon
                onChange={(e) => setQuery(e.currentTarget.value)}
                className="h-8 rounded-none! border-0! bg-paper! px-2! py-1! font-display! text-[10px]! uppercase! tracking-[0.18em]! text-primary-txt! outline-none! placeholder:text-terminal-txt/50!"
                icon={
                  <Icon
                    icon="search"
                    className="relative right-0 h-3.5 w-3.5 text-primary-txt/50"
                  />
                }
              />
            </div>
          )}
          {!singleSelection?.id && !multiSelection && (
            <p
              class={`${menuSectionClass} relative mt-auto px-3 py-2 font-display text-[10px] uppercase tracking-[0.24em] text-terminal-txt/60`}
            >
              {t("graph.contextMenu.noEntitySelected")}
            </p>
          )}

          {(selectedLabel || isUnverified) &&
            !isLoadingTransforms &&
            singleSelection?.id && (
              <div
                className={`${menuSectionClass} flex max-h-40 flex-col items-start overflow-y-auto`}
              >
                {filteredTransforms.map((transform: any) => (
                  <button
                    key={transform.label}
                    onClick={async (e) => {
                      e.preventDefault();
                      closeMenu();
                      // Build a clean data payload for the backend.
                      // 1) Start from node.data
                      const rawData: ContextMenuNodeData = {
                        ...(singleSelection.data ?? {}),
                      };
                      // 2) Remove UI-only fields
                      if ("elements" in rawData)
                        delete (rawData as any).elements;
                      // 3) Migrate any stray top-level fields into data (e.g. "CSE Categories")
                      const knownTop = new Set([
                        "id",
                        "data",
                        "type",
                        "position",
                        "measured",
                        "selected",
                        "dragging",
                        "width",
                        "height",
                        "zIndex",
                        "sourcePosition",
                        "targetPosition",
                        "style",
                      ]);
                      const singleSelectionRecord = singleSelection as Record<
                        string,
                        unknown
                      >;
                      Object.keys(singleSelectionRecord).forEach((k) => {
                        const value = singleSelectionRecord[k];
                        if (!knownTop.has(k) && value != null) {
                          const key = toSnakeCase(k);
                          if (rawData[key] == null) rawData[key] = value;
                        }
                      });

                      try {
                        const { jobId } = await window.api.graph.transform({
                          graphId: hid as string,
                          entity: {
                            id: singleSelection.id,
                            label: selectedLabel,
                            type: selectedLabel,
                            data: rawData,
                            position: singleSelection.position,
                          },
                          transformLabel: transform.label,
                          extraPluginDirs: localPluginDirs,
                        });

                        toast.loading(
                          `Transforming ${transform.label.toLowerCase()}. Please wait...`,
                          {
                            closeButton: true,
                            isLoading: true,
                            toastId: jobId,
                            progress: 0,
                          },
                        );
                      } catch (error) {
                        console.error("Failed to start transform:", error);
                        toast.error("Failed to start transform");
                      }
                    }}
                    class={menuRowClass}
                  >
                    <Icon
                      icon={transform.icon}
                      className={menuIconClass}
                    ></Icon>
                    <span className="truncate">{transform.label}</span>
                  </button>
                ))}

                {!isUnverified && filteredTransforms?.length === 0 && (
                  <p class="relative px-3 py-2 font-display text-[10px] uppercase tracking-[0.24em] text-terminal-txt/60">
                    {singleSelection?.id ? "No transforms found!" : ""}
                  </p>
                )}
              </div>
            )}
          {isLoadingTransforms && (
            <div
              class={`${menuSectionClass} flex min-h-28.75 flex-col bg-paper`}
            >
              <p class="relative flex w-full px-3 py-2">
                <ShinyText className="font-display text-[10px] uppercase tracking-[0.24em] text-terminal-txt">
                  Loading transforms
                </ShinyText>
                <span class="dot-flashing left-3 top-4" />
              </p>
            </div>
          )}

          {singleSelection?.data?.label && (
            <button
              className={menuDangerRowClass}
              onClick={handleDeleteSelection}
              type="button"
            >
              <Icon icon="trash" className={menuDangerIconClass} />
              Delete
            </button>
          )}
        </div>
      </div>
    </>
  );
}
