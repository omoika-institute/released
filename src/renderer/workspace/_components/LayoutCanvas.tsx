import { Fragment } from "preact/compat";
import { Icon } from "@/components/icons";
import Button from "@/components/buttons";

const MAX_COLUMNS_PER_ROW = 4;

type ElementType =
  | "text"
  | "dropdown"
  | "upload"
  | "textarea"
  | "title"
  | "section"
  | "copy-text"
  | "checkbox"
  | "datetime"
  | "radio"
  | "taglist"
  | "md"
  | "empty"
  | "url"
  | "copy-code"
  | "json"
  | "img"
  | "pdf"
  | "video"
  | "list"
  | "table";

export type BuilderElement = {
  id: string;
  type: ElementType;
  label: string;
  icon?: string;
  value?: any;
  options?: Array<{
    label: string;
    value?: string;
    description?: string | null;
  }>;
  accept?: string;
};

export type BuilderColumn = {
  id: string;
  width: number;
  element: BuilderElement;
};

export type BuilderRow = {
  id: string;
  columns: BuilderColumn[];
};

export type Selection =
  | { type: "meta" }
  | { type: "row"; rowId: string }
  | { type: "element"; rowId: string; columnId: string };

interface LayoutCanvasProps {
  rows: BuilderRow[];
  selection: Selection;
  history: any[];
  future: any[];
  isResizing: boolean;
  rowDropHint: {
    rowId: string;
    position: "before" | "after";
  } | null;
  onSetSelection: (selection: Selection) => void;
  onUndo: () => void;
  onRedo: () => void;
  onAddRow: () => void;
  onRemoveRow: (rowId: string) => void;
  onDragStartElement: (
    event: DragEvent,
    rowId: string,
    columnId: string
  ) => void;
  onDropOnEmptyRow: (event: DragEvent, rowId: string) => void;
  onDropOnColumn: (
    event: DragEvent,
    rowId: string,
    columnId: string,
    rowSize: number
  ) => void;
  onDropOnInsert: (event: DragEvent, rowId: string, index: number) => void;
  onDropOnCanvas: (event: DragEvent) => void;
  onRowDragOver: (event: DragEvent, rowId: string, rowSize: number) => void;
  onRowDragLeave: (event: DragEvent, rowId: string) => void;
  onRowDrop: (event: DragEvent, rowId: string) => void;
  onResizeStart: (
    event: MouseEvent,
    rowId: string,
    columnId: string,
    startWidth: number,
    direction: "left" | "right"
  ) => void;
}

export default function LayoutCanvas({
  rows,
  selection,
  history,
  future,
  isResizing,
  rowDropHint,
  onSetSelection,
  onUndo,
  onRedo,
  onAddRow,
  onRemoveRow,
  onDragStartElement,
  onDropOnEmptyRow,
  onDropOnColumn,
  onDropOnInsert,
  onDropOnCanvas,
  onRowDragOver,
  onRowDragLeave,
  onRowDrop,
  onResizeStart,
}: LayoutCanvasProps) {
  return (
    <div
      className="flex flex-1 flex-col"
      onDragOver={(event) => event.preventDefault()}
      onDrop={onDropOnCanvas}
    >
      <section className="rounded-md border border-black/20 bg-linear-to-br from-black/50 to-black/45 p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-sm font-semibold text-slate-350">
            Layout Canvas
          </h2>
          <div className="flex items-center gap-3">
            <button
              onClick={onUndo}
              disabled={history.length === 0}
              className="flex rounded-md border border-slate-800/40 bg-slate-900/60 px-2 py-1 text-xs text-slate-300 disabled:opacity-40"
            >
              <Icon icon="arrow-back" className="w-4 h-4 mr-2" />
              Undo
            </button>
            <button
              onClick={onRedo}
              disabled={future.length === 0}
              className="flex rounded-md border border-slate-800/40 bg-slate-900/60 px-2 py-1 text-xs text-slate-300 disabled:opacity-40"
            >
              Redo
              <Icon icon="arrow-forward" className="w-4 h-4 ml-2" />
            </button>

          </div>
        </div>
        <div className="flex flex-col gap-6">
          {rows.map((row, rowIndex) => {
            const canInsertToRow = row.columns.length < MAX_COLUMNS_PER_ROW;
            const showRowHint = canInsertToRow && rowDropHint?.rowId === row.id;
            return (
              <div key={row.id} className="rounded-md" data-row-id={row.id}>
                <div className="mb-2 flex items-center justify-between text-xs text-slate-500">
                  <span>Row {rowIndex + 1}</span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => onRemoveRow(row.id)}
                      className="text-slate-500 hover:text-slate-300"
                    >
                      Remove row
                    </button>
                  </div>
                </div>
                {row.columns.length === 0 ? (
                  <div
                    className="rounded-md border border-dashed border-slate-700/60 p-4 text-center text-xs text-slate-500"
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) =>
                      onDropOnEmptyRow(event as DragEvent, row.id)
                    }
                  >
                    Drop elements here
                  </div>
                ) : (
                  <div
                    className="relative flex items-stretch "
                    data-row-columns
                    onDragOver={
                      canInsertToRow
                        ? (event) =>
                            onRowDragOver(
                              event as DragEvent,
                              row.id,
                              row.columns.length
                            )
                        : undefined
                    }
                    onDragLeave={
                      canInsertToRow
                        ? (event) => onRowDragLeave(event as DragEvent, row.id)
                        : undefined
                    }
                    onDrop={
                      canInsertToRow
                        ? (event) => onRowDrop(event as DragEvent, row.id)
                        : undefined
                    }
                  >
                    {showRowHint ? (
                      <div className="pointer-events-none absolute inset-0 flex rounded-md">
                        <div
                          className={`flex-1 rounded-l-md border-2 border-dotted ${
                            rowDropHint?.position === "before"
                              ? "border-sky-400/80 bg-sky-500/10"
                              : "border-green-400"
                          }`}
                        />
                        <div
                          className={`flex-1 rounded-r-md border-2 border-dotted ${
                            rowDropHint?.position === "after"
                              ? "border-sky-400/80 bg-sky-500/10"
                              : "border-transparent"
                          }`}
                        />
                      </div>
                    ) : null}
                    {row.columns.map((column, index) => {
                      const isSelected =
                        selection.type === "element" &&
                        selection.rowId === row.id &&
                        selection.columnId === column.id;
                      return (
                        <Fragment key={column.id}>
                          <DropZone
                            onDrop={(event) =>
                              onDropOnInsert(event, row.id, index)
                            }
                          />
                          <div
                            draggable={!isResizing}
                            onDragStart={(event) => {
                              if (isResizing) {
                                event.preventDefault();
                                event.stopPropagation();
                                return;
                              }
                              onDragStartElement(
                                event as DragEvent,
                                row.id,
                                column.id
                              );
                            }}
                            onClick={() =>
                              onSetSelection({
                                type: "element",
                                rowId: row.id,
                                columnId: column.id,
                              })
                            }
                            onDragOver={(event) => event.preventDefault()}
                            onDrop={(event) =>
                              onDropOnColumn(
                                event as DragEvent,
                                row.id,
                                column.id,
                                row.columns.length
                              )
                            }
                            className={`group relative rounded-sm px-2 py-2 transition ${
                              isSelected
                                ? "border-sky-400/20 border  bg-sky-500/10"
                                : "hover:bg-slate-950/40 "
                            }`}
                            style={{
                              flex: `${column.width} ${column.width} 0%`,
                            }}
                          >
                            <div
                              onMouseDown={(event) =>
                                onResizeStart(
                                  event as MouseEvent,
                                  row.id,
                                  column.id,
                                  column.width,
                                  "left"
                                )
                              }
                              draggable={false}
                              onDragStart={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                              }}
                              className="absolute inset-y-0 -left-1 w-1 cursor-col-resize transition hover:bg-amber-500/10"
                            />
                            <div
                              onMouseDown={(event) =>
                                onResizeStart(
                                  event as MouseEvent,
                                  row.id,
                                  column.id,
                                  column.width,
                                  "right"
                                )
                              }
                              draggable={false}
                              onDragStart={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                              }}
                              className="absolute inset-y-0 -right-1 w-1 cursor-col-resize  transition hover:bg-amber-500/10"
                            />
                            <BuilderElementField element={column.element} />
                          </div>
                        </Fragment>
                      );
                    })}
                    <DropZone
                      onDrop={(event) =>
                        onDropOnInsert(event, row.id, row.columns.length)
                      }
                    />
                  </div>
                )}
              </div>
            );
          })}
          <button
            onClick={onAddRow}
            className="rounded-md border border-slate-800/50 bg-slate-900/50 px-3 py-2 text-xs text-slate-300"
          >
            Add Row
          </button>
        </div>
      </section>
    </div>
  );
}

function BuilderElementField({ element }: { element: BuilderElement }) {
  switch (element.type) {
    case "text":
      return (
        <div className="flex flex-col gap-1">
          <label className="font-display text-[0.55rem] text-slate-400">
            {element.label || "Text"}
          </label>
          <div className="node-field">
            <input
              disabled
              type="text"
              placeholder={element.value || ""}
              className="w-full bg-transparent"
            />
            <Icon icon={element.icon || "ballpen"} />
          </div>
        </div>
      );
    case "textarea":
      return (
        <div className="flex flex-col gap-1">
          <label className="font-display text-[0.55rem] text-slate-400">
            {element.label || "Textarea"}
          </label>
          <textarea
            disabled
            className="min-h-16 w-full rounded-md border border-slate-800/40 bg-slate-950/60 px-2 py-1 text-xs text-slate-300"
          />
        </div>
      );
    case "dropdown":
      return (
        <div className="flex flex-col gap-1">
          <label className="font-display text-[0.55rem] text-slate-400">
            {element.label || "Dropdown"}
          </label>
          <div className="node-field dropdown">
            <input disabled type="text" className="w-full bg-transparent" />
            <Icon icon={element.icon || "chevron-down"} />
          </div>
        </div>
      );
    case "checkbox":
      return (
        <label className="flex items-center gap-2 text-xs text-slate-300">
          <input type="checkbox" disabled className="rounded-sm" />
          {element.label || "Checkbox"}
        </label>
      );
    case "datetime":
      return (
        <div className="flex flex-col gap-1">
          <label className="font-display text-[0.55rem] text-slate-400">
            {element.label || "Datetime"}
          </label>
          <div className="node-field">
            <input disabled type="text" className="w-full bg-transparent" />
            <Icon icon={element.icon || "calendar-time"} />
          </div>
        </div>
      );
    case "radio":
      return (
        <label className="flex items-center gap-2 text-xs text-slate-300">
          <input type="radio" disabled />
          {element.label || "Radio"}
        </label>
      );
    case "taglist":
      return (
        <div className="flex flex-wrap gap-1 text-[0.6rem] text-slate-400">
          <span className="rounded border border-slate-800/60 px-1 py-0.5">
            {element.label || "Tag"}
          </span>
          <span className="rounded border border-slate-800/60 px-1 py-0.5">
            Tag
          </span>
        </div>
      );
    case "md":
      return (
        <div className="text-[0.65rem] text-slate-400">
          {element.label || "Markdown"}
        </div>
      );
    case "upload":
      return (
        <div className="flex flex-col gap-1">
          <label className="font-display text-[0.55rem] text-slate-400">
            {element.label || "Upload"}
          </label>
          <div className="flex items-center gap-2 rounded-md border border-dashed border-slate-700/60 px-2 py-2 text-xs text-slate-500">
            <Icon icon={element.icon || "file-upload"} className="h-4 w-4" />
            Drop file here
          </div>
        </div>
      );
    case "title":
      return (
        <div className="text-sm font-semibold text-slate-200">
          {element.label || "Title"}
        </div>
      );
    case "section":
      return (
        <div className="text-xs text-slate-400">
          {element.label || "Section"}
        </div>
      );
    case "copy-text":
      return (
        <div className="flex items-center justify-between text-xs text-slate-300">
          <span>{element.label || "Copy"}</span>
          <Icon icon={element.icon || "copy"} className="h-4 w-4" />
        </div>
      );
    case "url":
      return (
        <div className="flex items-center gap-2 text-xs text-slate-300">
          <Icon icon={element.icon || "link"} className="h-4 w-4" />
          {element.label || "URL"}
        </div>
      );
    case "copy-code":
      return (
        <div className="flex items-center justify-between text-xs text-slate-300">
          <span>{element.label || "Copy Code"}</span>
          <Icon icon={element.icon || "code"} className="h-4 w-4" />
        </div>
      );
    case "json":
      return (
        <div className="rounded-md border border-slate-800/50 bg-slate-950/60 px-2 py-1 text-[0.6rem] text-slate-400">
          {element.label || "JSON"}
        </div>
      );
    case "img":
      return (
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <Icon icon={element.icon || "photo"} className="h-4 w-4" />
          {element.label || "Image"}
        </div>
      );
    case "pdf":
      return (
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <Icon icon={element.icon || "file-type-pdf"} className="h-4 w-4" />
          {element.label || "PDF"}
        </div>
      );
    case "video":
      return (
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <Icon icon={element.icon || "video"} className="h-4 w-4" />
          {element.label || "Video"}
        </div>
      );
    case "list":
      return (
        <div className="text-xs text-slate-400">{element.label || "List"}</div>
      );
    case "table":
      return (
        <div className="text-xs text-slate-400">{element.label || "Table"}</div>
      );
    case "empty":
      return (
        <div className="rounded-md border border-dashed border-slate-800/60 px-2 py-3 text-center text-xs text-slate-600">
          Spacer
        </div>
      );
    default:
      return null;
  }
}

function DropZone({ onDrop }: { onDrop: (event: DragEvent) => void }) {
  return (
    <div
      onDragOver={(event) => event.preventDefault()}
      onDrop={onDrop}
      className="flex h-full w-2 shrink-0 cursor-pointer items-stretch rounded-md border border-dashed border-transparent transition hover:border-slate-600/60"
      title="Insert here"
    />
  );
}
