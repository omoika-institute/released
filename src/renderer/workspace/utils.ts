import i18n from "@/i18n";
import { v4 as uuidv4 } from "uuid";
import type {
  BuilderRow,
  BuilderColumn,
  BuilderElement,
} from "./_components/LayoutCanvas";
import {
  BuilderState,
  DRAG_DATA_KEY,
  DragPayload,
  ElementType,
  EntityMeta,
  GRID_COLUMNS,
  createDefaultMeta,
  createDefaultState,
} from ".";

export function createElement(type: ElementType): BuilderElement {
  const base = {
    id: uuidv4(),
    type,
    label: "",
  } as BuilderElement;

  switch (type) {
    case "text":
      return {
        ...base,
        label: i18n.t("workspace.elementLabels.text"),
        icon: "ballpen",
        value: "",
      };
    case "textarea":
      return {
        ...base,
        label: i18n.t("workspace.elementLabels.notes"),
        icon: "align-left",
        value: "",
      };
    case "dropdown":
      return {
        ...base,
        label: i18n.t("workspace.elementLabels.dropdown"),
        icon: "chevron-down",
        options: [],
        value: "",
      };
    case "upload":
      return {
        ...base,
        label: i18n.t("workspace.elementLabels.upload"),
        icon: "file-upload",
      };
    case "md":
      return {
        ...base,
        label: i18n.t("workspace.elementLabels.markdown"),
        icon: "markdown",
        value: "",
      };
    case "checkbox":
      return { ...base, label: "Checkbox", icon: "checkbox", value: false };
    case "datetime":
      return { ...base, label: "Datetime", icon: "calendar-time", value: "" };
    case "radio":
      return { ...base, label: "Radio", icon: "radio", options: [] };
    case "taglist":
      return { ...base, label: "Tag List", icon: "tag", value: [] };
    case "title":
      return { ...base, label: "Title" };
    case "section":
      return { ...base, label: "Section" };
    case "copy-text":
      return { ...base, label: "Copy Text", icon: "copy" };
    case "empty":
      return { ...base, label: "", icon: "minus" };
    case "url":
      return { ...base, label: "URL", icon: "link", value: "" };
    case "copy-code":
      return { ...base, label: "Copy Code", icon: "code", value: "" };
    case "json":
      return { ...base, label: "JSON", icon: "braces", value: "" };
    case "img":
      return { ...base, label: "Image", icon: "photo", value: "" };
    case "pdf":
      return { ...base, label: "PDF", icon: "file-type-pdf", value: "" };
    case "video":
      return { ...base, label: "Video", icon: "video", value: "" };
    case "list":
      return { ...base, label: "List", icon: "list", value: [] };
    case "table":
      return { ...base, label: "Table", icon: "table", value: [] };
    default:
      return base;
  }
}

export function evenRowWidths(columns: BuilderColumn[]): BuilderColumn[] {
  if (!columns.length) return columns;
  const base = Math.floor(GRID_COLUMNS / columns.length);
  let remainder = GRID_COLUMNS - base * columns.length;
  return columns.map((column) => {
    const extra = remainder > 0 ? 1 : 0;
    remainder = Math.max(0, remainder - 1);
    return { ...column, width: base + extra };
  });
}

export function defaultInsertWidth(columns: BuilderColumn[]): number {
  if (!columns.length) return GRID_COLUMNS;
  return Math.max(1, Math.round(GRID_COLUMNS / (columns.length + 1)));
}

export function ensureRowWidth(columns: BuilderColumn[]): BuilderColumn[] {
  if (!columns.length) return columns;
  const total = columns.reduce((sum, column) => sum + column.width, 0);
  if (total === GRID_COLUMNS) return columns;
  return normalizeRowColumns(columns);
}

export function normalizeRowColumns(columns: BuilderColumn[]): BuilderColumn[] {
  if (!columns.length) return columns;
  const sum = columns.reduce((total, column) => total + column.width, 0);
  if (sum <= 0) return evenRowWidths(columns);
  const scale = GRID_COLUMNS / sum;
  const scaled = columns.map((column) => ({
    ...column,
    width: Math.max(1, Math.round(column.width * scale)),
  }));
  const nextSum = scaled.reduce((total, column) => total + column.width, 0);
  const diff = GRID_COLUMNS - nextSum;
  if (diff !== 0) {
    const last = scaled[scaled.length - 1];
    last.width = clamp(last.width + diff, 1, GRID_COLUMNS);
  }
  return scaled;
}

export function normalizeRowWidths(
  columns: BuilderColumn[],
  lockedId: string,
  requestedWidth: number
): BuilderColumn[] {
  if (!columns.length) return columns;
  const others = columns.filter((col) => col.id !== lockedId);
  const maxLocked = Math.max(1, GRID_COLUMNS - Math.max(others.length, 0));
  const lockedWidth = clamp(requestedWidth, 1, maxLocked);
  const remaining = GRID_COLUMNS - lockedWidth;

  const even = Math.floor(remaining / Math.max(others.length, 1));
  let remainder = remaining - even * Math.max(others.length, 1);

  const nextColumns = columns.map((column) => {
    if (column.id === lockedId) return { ...column, width: lockedWidth };
    const extra = remainder > 0 ? 1 : 0;
    remainder = Math.max(0, remainder - 1);
    return { ...column, width: Math.max(1, even + extra) };
  });

  const total = nextColumns.reduce((sum, column) => sum + column.width, 0);
  if (total !== GRID_COLUMNS) {
    const diff = GRID_COLUMNS - total;
    const last = nextColumns.find((column) => column.id !== lockedId);
    if (last) last.width = Math.max(1, last.width + diff);
  }

  return nextColumns;
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function cloneState(state: BuilderState): BuilderState {
  return {
    meta: { ...state.meta },
    rows: state.rows.map((row) => ({
      id: row.id,
      columns: row.columns.map((column) => ({
        id: column.id,
        width: column.width,
        element: {
          ...column.element,
          options: column.element.options
            ? [...column.element.options]
            : undefined,
        },
      })),
    })),
  };
}

export function readDragPayload(event: DragEvent): DragPayload | null {
  const raw = event.dataTransfer?.getData(DRAG_DATA_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as DragPayload;
  } catch {
    return null;
  }
}

export function indexAdjusted(
  payload: DragPayload,
  rowId: string,
  index: number,
  rows: BuilderRow[]
) {
  if (payload.source !== "canvas") return index;
  if (payload.rowId !== rowId) return index;
  const row = rows.find((r) => r.id === rowId);
  if (!row) return index;
  const fromIndex = row.columns.findIndex((c) => c.id === payload.columnId);
  if (fromIndex === -1) return index;
  if (fromIndex < index) return index - 1;
  return index;
}

export function swapElements(
  state: BuilderState,
  pushHistory: (next: BuilderState) => void,
  a: { rowId: string; columnId: string },
  b: { rowId: string; columnId: string }
) {
  if (a.rowId === b.rowId && a.columnId === b.columnId) return;
  const nextRows = state.rows.map((row) => {
    if (row.id !== a.rowId && row.id !== b.rowId) return row;
    return {
      ...row,
      columns: row.columns.map((column) => {
        if (row.id === a.rowId && column.id === a.columnId) {
          const target = findColumn(state.rows, b.rowId, b.columnId);
          return target ? { ...column, element: target.element } : column;
        }
        if (row.id === b.rowId && column.id === b.columnId) {
          const source = findColumn(state.rows, a.rowId, a.columnId);
          return source ? { ...column, element: source.element } : column;
        }
        return column;
      }),
    };
  });
  pushHistory({ ...state, rows: nextRows });
}

export function findColumn(
  rows: BuilderRow[],
  rowId: string,
  columnId: string
) {
  const row = rows.find((r) => r.id === rowId);
  return row?.columns.find((col) => col.id === columnId) ?? null;
}

export function buildElementsFromRows(rows: BuilderRow[]) {
  return rows.map((row) => {
    if (row.columns.length === 1) {
      return toElementPayload(row.columns[0]);
    }
    return row.columns.map((column) => toElementPayload(column));
  });
}

export function serializeEntity(state: BuilderState) {
  return {
    label: state.meta.label,
    color: state.meta.color,
    icon: state.meta.icon,
    description: state.meta.description,
    authors: (state.meta.authors || []).map((author) => author.name),
    elements: buildElementsFromRows(state.rows),
  };
}

export function toElementPayload(column: BuilderColumn) {
  const element = column.element;
  const payload: any = {
    type: element.type,
    label: element.label,
  };

  if (element.icon) payload.icon = element.icon;
  if (element.value !== undefined) payload.value = element.value;
  if (element.options && element.options.length > 0)
    payload.options = element.options;
  if (element.accept) payload.accept = element.accept;
  payload.width = column.width;
  return payload;
}

export function parseEntityJson(source: any) {
  if (source && Array.isArray(source.elements)) {
    return { nextState: toBuilderState(source), keys: [] };
  }

  const keys = Object.keys(source || {}).filter(
    (key) => source[key] && Array.isArray(source[key].elements)
  );

  if (keys.length) {
    const first = source[keys[0]];
    return { nextState: toBuilderState(first), keys };
  }

  return { nextState: createDefaultState(), keys: [] };
}

export function toBuilderState(entity: any): BuilderState {
  const meta: EntityMeta = {
    label: entity.label || "Untitled",
    color: entity.color || createDefaultMeta().color,
    icon: entity.icon || createDefaultMeta().icon,
    description: entity.description || "",
    authors: normalizeAuthors(entity.authors),
  };

  const rows = (entity.elements || []).map((entry: any) => {
    if (Array.isArray(entry)) {
      const columns = entry.map((element: any) => toColumn(element));
      const hasWidth = entry.some(
        (element: any) => typeof element?.width === "number"
      );
      return {
        id: uuidv4(),
        columns: hasWidth
          ? normalizeRowColumns(columns)
          : evenRowWidths(columns),
      };
    }

    return {
      id: uuidv4(),
      columns: normalizeRowColumns([toColumn(entry)]),
    };
  });

  return {
    meta,
    rows: rows.length ? rows : [{ id: uuidv4(), columns: [] }],
  };
}

export function toColumn(element: any): BuilderColumn {
  const rawWidth = typeof element?.width === "number" ? element.width : 1;
  return {
    id: uuidv4(),
    width: clamp(Number(rawWidth), 1, GRID_COLUMNS),
    element: {
      id: uuidv4(),
      type: element?.type || "text",
      label: element?.label || "",
      icon: element?.icon,
      value: element?.value,
      options: element?.options,
      accept: element?.accept,
    },
  };
}

export function normalizeAuthors(
  source: any
): Array<{ id: string; name: string }> {
  if (!Array.isArray(source)) return [];
  return source
    .map((entry) => {
      if (typeof entry === "string") {
        const name = entry.trim();
        if (!name) return null;
        return { id: uuidv4(), name };
      }
      if (entry && typeof entry === "object") {
        const name = String(
          entry.name ?? entry.label ?? entry.value ?? ""
        ).trim();
        if (!name) return null;
        const id = typeof entry.id === "string" ? entry.id : uuidv4();
        return { id, name };
      }
      return null;
    })
    .filter(Boolean) as Array<{ id: string; name: string }>;
}
