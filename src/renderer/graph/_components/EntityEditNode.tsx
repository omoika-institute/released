// @ts-nocheck
import { memo, useCallback, useRef, useState } from "preact/compat";
import { Icon } from "@/components/icons";
import EntityToolbar from "./EntityToolbar";
import EntityHandles from "./EntityHandles";
import Element from "./Element";
import EntityFormRenderer from "@/components/editor/EntityFormRenderer";
import { toSnakeCase } from "../utils";
import LoadingNode from "./LoadingNode";
import { useFlowStore } from "@/stores";
import Tooltip from "@/components/Tooltip";

const DEFAULT_ENTITY_ICON = "box";

const accentColor = (color?: string) =>
  color && color.trim() ? color : "#274395";

const resolveEntityIcon = (icon?: string) =>
  icon && icon.trim() ? icon : DEFAULT_ENTITY_ICON;

const hasMarkdownElement = (elements: any[] = []) =>
  elements
    .flatMap((entry) => (Array.isArray(entry) ? entry : [entry]))
    .some((element) => element?.type === "md" || element?.type === "markdown");

const hasMultiColumnRow = (elements: any[] = []) =>
  elements.some((entry) => Array.isArray(entry) && entry.length > 1);

export function EditEntityNode({
  ctx,
  blueprint,
  isInvestigating = false,
}: JSONObject) {
  const timelinePlaybackReadOnly = useFlowStore(
    (state) => state.timelinePlaybackReadOnly,
  );

  if (!blueprint) {
    return <LoadingNode entity={ctx} />;
  }

  const { label, ...data } = ctx.data;
  const color = accentColor(blueprint?.color);
  const displayIcon = resolveEntityIcon(blueprint?.icon);
  const nodeWidthClass = hasMultiColumnRow(blueprint?.elements)
    ? "w-[30rem] max-w-[80vw]"
    : "w-full max-w-md min-w-64";

  const [entityIdCopied, setEntityIdCopied] = useState(false);
  const copyFeedbackTimerRef = useRef<number | null>(null);
  const autosaveTimerRef = useRef<number | null>(null);
  const lastAutosaveValueRef = useRef(ctx.id ?? "");
  const copyEntityId = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(ctx.id);
      setEntityIdCopied(true);

      if (copyFeedbackTimerRef.current != null) {
        window.clearTimeout(copyFeedbackTimerRef.current);
      }

      copyFeedbackTimerRef.current = window.setTimeout(() => {
        setEntityIdCopied(false);
        copyFeedbackTimerRef.current = null;
      }, 1000);
    } catch (error) {
      console.error(error);
    }
  }, [ctx.id]);

  return (
    <>
      <EntityHandles />
      {/* <EntityToolbar
        entityId={ctx.id}
        entityTitle={blueprint.label}
        properties={data}
        disabled={timelinePlaybackReadOnly}
      /> */}
      <div
        className={`node entity-edit-node group relative ${nodeWidthClass} cursor-grab border border-subtle/50 bg-canvas text-primary-txt shadow-xl shadow-black/45 transition-colors duration-150 active:cursor-grabbing hover:border-review-border/25`}
      >
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-px"
          style={{ backgroundColor: color }}
        />
        <div className="pointer-events-none absolute bottom-2 right-2 h-3 w-10 border-b border-r border-primary-txt/10" />
        <div className="pointer-events-none absolute left-2 top-2 h-3 w-10 border-l border-t border-primary-txt/10" />

        <div className="relative flex items-stretch border-b border-subtle/50 bg-paper">
          <div
            className="flex w-14 p-1 shrink-0 items-center justify-center border-r border-subtle/50 bg-panel/75 text-primary-txt transition-colors duration-150 "
            style={{ backgroundColor: color }}
          >
            <Icon icon={displayIcon} className="h-10 w-10" />
          </div>

          <div className="flex w-full justify-between items-center px-2.5 py-1">
            <div className="flex min-w-0 items-center ">
              <p className="truncate font-display font-semibold text-[12px] tracking-widest text-primary-txt">
                {blueprint.label}
              </p>
            </div>
            <Tooltip
              side="top"
              showDelay={1300}
              className="flex justify-between"
              content={
                <p class="text-xs ">
                  {entityIdCopied ? (
                    <span class="text-review-txt">Copied!</span>
                  ) : (
                    <span>Click to copy entity ID.</span>
                  )}
                </p>
              }
            >
              <p
                onClick={copyEntityId}
                className="ml-auto font-display text-[9px] uppercase tracking-[0.1em] text-terminal-txt/60 hover:text-terminal-txt"
              >
                {ctx.id.substring(9, 18).toUpperCase()}
              </p>
            </Tooltip>
          </div>
        </div>

        {/* Form fields */}
        {timelinePlaybackReadOnly && (
          <div className="border-b border-review-border/20 bg-review-border/8 px-3 py-1.5 font-display text-[8px] uppercase tracking-[0.22em] text-review-border">
            Timeline playback - read only
          </div>
        )}
        <div
          inert={timelinePlaybackReadOnly ? "" : undefined}
          aria-disabled={timelinePlaybackReadOnly}
          className={`relative bg-paper/20 ${
            timelinePlaybackReadOnly
              ? "pointer-events-none select-text opacity-75"
              : ""
          }`}
        >
          <EntityFormRenderer
            elements={blueprint.elements}
            rowClassName="edit-node-field-row"
            renderElement={(element: NodeInput, meta) => {
              const value = ctx.data[toSnakeCase(element.label)];
              const nextElement = value ? { ...element, value } : element;
              return (
                <Element
                  data={ctx.data}
                  id={ctx.id}
                  element={nextElement}
                  key={`${meta.key}-${blueprint.id}`}
                />
              );
            }}
          />
        </div>
      </div>
    </>
  );
}

export default memo(EditEntityNode);
