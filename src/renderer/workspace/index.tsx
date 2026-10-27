import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "preact/hooks";
import { v4 as uuidv4 } from "uuid";
import EntityElementsPalette from "./_components/EntityElementsPalette";
import WorkspaceAppbar from "./_components/WorkspaceAppbar";
import LayoutCanvas from "./_components/LayoutCanvas";
import PropertiesPanel from "./_components/PropertiesPanel";
import PreviewTab from "./_components/PreviewTab";
import JsonEditorTab from "./_components/JsonEditorTab";
import TransformsTab from "./_components/TransformsTab";
import ConfirmDelete from "@/components/modals/ConfirmDelete";
import type { TransformFile } from "./_components/TransformsTab";
import type {
  BuilderRow,
  BuilderElement,
  Selection,
} from "./_components/LayoutCanvas";
import {
  buildElementsFromRows,
  cloneState,
  createElement,
  defaultInsertWidth,
  ensureRowWidth,
  evenRowWidths,
  indexAdjusted,
  normalizeRowColumns,
  normalizeRowWidths,
  parseEntityJson,
  readDragPayload,
  serializeEntity,
  swapElements,
} from "./utils";
import { clamp } from "@embedpdf/core";
import i18n from "@/i18n";
import { toast } from "react-toastify";

export const GRID_COLUMNS = 12;
export const MAX_COLUMNS_PER_ROW = 4;
export const DRAG_DATA_KEY = "application/x-omoika-entity-builder";

export type ElementType =
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

export type EntityMeta = {
  label: string;
  color: string;
  icon: string;
  description?: string;
  authors?: Array<{ id: string; name: string }>;
};

export type BuilderState = {
  meta: EntityMeta;
  rows: BuilderRow[];
};

type PluginEntityOption = {
  label: string;
  mtime: string;
};

export type DragPayload =
  | { source: "palette"; elementType: ElementType }
  | { source: "canvas"; rowId: string; columnId: string };

export function createDefaultMeta(): EntityMeta {
  return {
    label: i18n.t("workspace.defaults.newEntity"),
    color: "#22C55E99",
    icon: "shield-checkered",
    authors: [],
  };
}

export function createDefaultState(): BuilderState {
  return {
    meta: createDefaultMeta(),
    rows: [
      {
        id: uuidv4(),
        columns: [],
      },
    ],
  };
}

function createDefaultPythonTemplate() {
  return `from omoika import transform, Registry

@transform(
    target="website@1.0.0",
    label="${i18n.t("workspace.defaults.transformLabel")}",
    icon="world-www"
)
async def to_website(self, entity):
    website_entity = await Registry.get_entity('website')
    return website_entity.create(domain="${i18n.t("workspace.defaults.exampleTransform")}")
`;
}

type WorkspaceTabs = "layout" | "preview" | "json" | "transforms";

export default function Workspace() {
  const [state, setState] = useState<BuilderState>(() => createDefaultState());
  const [selection, setSelection] = useState<Selection>({ type: "meta" });
  const [history, setHistory] = useState<BuilderState[]>([]);
  const [future, setFuture] = useState<BuilderState[]>([]);
  const [activeTab, setActiveTab] = useState<WorkspaceTabs>("layout");
  const [jsonDraft, setJsonDraft] = useState("");
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [pythonDraft, setPythonDraft] = useState(() => createDefaultPythonTemplate());
  const [pythonLabel, setPythonLabel] = useState("");
  const [selectedTransform, setSelectedTransform] = useState("");
  const [pythonTransforms, setPythonTransforms] = useState<TransformFile[]>([]);
  const [pluginTransformMap, setPluginTransformMap] = useState<
    Record<string, any>
  >({});
  const [isCreatingTransform, setIsCreatingTransform] = useState(false);
  const [showTransformDeleteModal, setShowTransformDeleteModal] =
    useState(false);
  const [isDeletingTransform, setIsDeletingTransform] = useState(false);
  const [authorsInput, setAuthorsInput] = useState("");
  const [rowDropHint, setRowDropHint] = useState<{
    rowId: string;
    position: "before" | "after";
  } | null>(null);
  const [library, setLibrary] = useState<Record<string, any> | null>(null);
  const [entitySelectValue, setEntitySelectValue] = useState<string>("");
  const [pluginEntities, setPluginEntities] = useState<PluginEntityOption[]>(
    []
  );
  const [pluginBlueprints, setPluginBlueprints] = useState<
    Record<string, any>
  >({});
  const [lastGenerated, setLastGenerated] = useState<string | null>(null);
  const [isResizing, setIsResizing] = useState(false);
  const stateRef = useRef(state);
  const resizeRef = useRef<{
    rowId: string;
    columnId: string;
    startX: number;
    startWidth: number;
    direction: "left" | "right";
    rowWidth: number;
  } | null>(null);
  const activeTransformEntityLabel = useMemo(() => {
    if (!entitySelectValue) return "";
    if (entitySelectValue.startsWith("plugin:")) {
      return entitySelectValue.replace("plugin:", "").trim();
    }
    if (entitySelectValue.startsWith("imported:")) {
      return entitySelectValue.replace("imported:", "").trim();
    }
    return state.meta.label?.trim() || "";
  }, [entitySelectValue, state.meta.label]);
  const canManageTransforms = activeTransformEntityLabel.length > 0;

  const pushHistory = useCallback(
    (nextState: BuilderState) => {
      setHistory((prev) => [...prev, cloneState(state)]);
      setFuture([]);
      setState(nextState);
    },
    [state]
  );

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const undo = useCallback(() => {
    setHistory((prev) => {
      if (!prev.length) return prev;
      const next = [...prev];
      const previous = next.pop();
      if (!previous) return prev;
      setFuture((fPrev) => [cloneState(state), ...fPrev]);
      setState(previous);
      return next;
    });
  }, [state]);

  const redo = useCallback(() => {
    setFuture((prev) => {
      if (!prev.length) return prev;
      const [next, ...rest] = prev;
      setHistory((hPrev) => [...hPrev, cloneState(state)]);
      setState(next);
      return rest;
    });
  }, [state]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const isUndo = (event.ctrlKey || event.metaKey) && event.key === "z";
      const isRedo =
        (event.ctrlKey || event.metaKey) &&
        (event.key === "y" || (event.shiftKey && event.key === "Z"));
      if (isUndo) {
        event.preventDefault();
        undo();
      }
      if (isRedo) {
        event.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [undo, redo]);

  useEffect(() => {
    if (!window.api?.builder?.onGenerated) return;
    const unsubscribe = window.api.builder.onGenerated((data: any) => {
      setLastGenerated(data?.targetDir ?? null);
    });
    return () => unsubscribe?.();
  }, []);

  const selectedElement = useMemo(() => {
    if (selection.type !== "element") return null;
    const row = state.rows.find((r) => r.id === selection.rowId);
    const column = row?.columns.find((c) => c.id === selection.columnId);
    return column?.element ?? null;
  }, [selection, state.rows]);

  const selectedColumn = useMemo(() => {
    if (selection.type !== "element") return null;
    const row = state.rows.find((r) => r.id === selection.rowId);
    return row?.columns.find((c) => c.id === selection.columnId) ?? null;
  }, [selection, state.rows]);

  const previewElements = useMemo(
    () => buildElementsFromRows(state.rows),
    [state.rows]
  );

  const refreshPluginEntities = useCallback(async () => {
    if (!window.api?.plugins?.list || !window.api?.plugins?.blueprints) return;
    try {
      const [plugins, blueprints] = await Promise.all([
        window.api.plugins.list(),
        window.api.plugins.blueprints(),
      ]);
      const options = (plugins || [])
        .map((plugin: any) => {
          const label =
            plugin?.label || plugin?.name || plugin?.id || plugin?.slug;
          if (!label) return null;
          const mtime =
            plugin?.mtime || plugin?.ctime || new Date().toISOString();
          return { label, mtime };
        })
        .filter(Boolean) as PluginEntityOption[];
      options.sort((a, b) => a.label.localeCompare(b.label));
      setPluginEntities(options);
      setPluginBlueprints(blueprints || {});
    } catch (error) {
      console.error("Failed to load plugin entities:", error);
    }
  }, []);

  useEffect(() => {
    if (activeTab !== "json") return;
    setJsonDraft(JSON.stringify(serializeEntity(state), null, 2));
  }, [activeTab, state]);

  useEffect(() => {
    refreshPluginEntities();
  }, [refreshPluginEntities]);

  const handleTabChange = useCallback(
    (tab: WorkspaceTabs) => {
      setActiveTab(tab);
      if (tab === "json") {
        setJsonDraft(JSON.stringify(serializeEntity(state), null, 2));
        setJsonError(null);
      }
    },
    [state]
  );

  const handleTransformSelect = useCallback(
    async (transform: TransformFile) => {
      const label = transform?.label || "";
      setIsCreatingTransform(false);
      setSelectedTransform(label);
      setPythonLabel(label);
      if (!window.api?.plugins?.readTransformFile) {
        setPythonDraft(createDefaultPythonTemplate());
        return;
      }
      const mapped = pluginTransformMap[label];
      const filePath =
        transform?.path || mapped?.path || mapped?.filePath;
      if (!filePath) {
        setPythonDraft(createDefaultPythonTemplate());
        return;
      }
      try {
        const content = await window.api.plugins.readTransformFile(filePath);
        setPythonDraft(content);
      } catch (error) {
        console.error("Failed to load transform file:", error);
        setPythonDraft(createDefaultPythonTemplate());
      }
    },
    [pluginTransformMap]
  );

  const refreshPythonTransforms = useCallback(async () => {
    if (
      !window.api?.plugins?.transforms ||
      !window.api?.plugins?.listTransformFiles
    )
      return;
    const label = activeTransformEntityLabel.trim();
    if (!label) {
      setPythonTransforms([]);
      setPluginTransformMap({});
      setSelectedTransform("");
      setPythonLabel("");
      setPythonDraft(createDefaultPythonTemplate());
      setIsCreatingTransform(false);
      return;
    }
    try {
      const [transformList, fileList] = await Promise.all([
        window.api.plugins.transforms({ entityLabel: label }),
        window.api.plugins.listTransformFiles(),
      ]);
      const normalized = Array.isArray(transformList) ? transformList : [];
      const files = Array.isArray(fileList) ? fileList : [];
      const fileMap = new Map(files.map((file) => [file.label, file]));
      const map: Record<string, any> = {};
      let mapped: TransformFile[] = [];

      if (normalized.length) {
        mapped = normalized
          .map((transform: any) => {
            const transformLabel =
              transform?.label ||
              transform?.name ||
              transform?.id ||
              transform?.slug;
            if (!transformLabel) return null;
            const filenameLabel = transform?.filename
              ? String(transform.filename).replace(/\.py$/i, "")
              : null;
            const fileMatch =
              fileMap.get(transformLabel) ||
              (filenameLabel ? fileMap.get(filenameLabel) : undefined);
            const path = transform?.path || fileMatch?.path || "";
            map[transformLabel] = { ...transform, path };
            return {
              label: transformLabel,
              filename:
                fileMatch?.filename ||
                transform?.filename ||
                `${transformLabel.toString()}.py`,
              path,
              mtime:
                fileMatch?.mtime ||
                transform?.mtime ||
                transform?.ctime ||
                new Date().toISOString(),
            } as TransformFile;
          })
          .filter(Boolean) as TransformFile[];
      } else {
        mapped = [];
      }

      mapped.sort((a, b) => a.label.localeCompare(b.label));
      setPluginTransformMap(map);
      setPythonTransforms(mapped);
      const selectedStillValid = mapped.some(
        (transform) => transform.label === selectedTransform
      );
      if (!selectedStillValid && !mapped.length) {
        setSelectedTransform("");
        setPythonLabel("");
        setPythonDraft(createDefaultPythonTemplate());
      }
      if (
        mapped.length &&
        !isCreatingTransform &&
        (!selectedTransform || !selectedStillValid)
      ) {
        void handleTransformSelect(mapped[0]);
      }
    } catch (error) {
      console.error("Failed to load plugin transforms:", error);
    }
  }, [
    activeTransformEntityLabel,
    handleTransformSelect,
    isCreatingTransform,
    selectedTransform,
  ]);

  useEffect(() => {
    if (activeTab !== "transforms") return;
    refreshPythonTransforms();
  }, [activeTab, refreshPythonTransforms]);

  const setMetaField = useCallback(
    (field: keyof EntityMeta, value: string) => {
      pushHistory({
        ...state,
        meta: {
          ...state.meta,
          [field]: value,
        },
      });
    },
    [state, pushHistory]
  );

  const setMetaAuthors = useCallback(
    (authors: Array<{ id: string; name: string }>) => {
      pushHistory({
        ...state,
        meta: {
          ...state.meta,
          authors,
        },
      });
    },
    [state, pushHistory]
  );

  const addAuthor = useCallback(
    (raw: string) => {
      const next = raw.trim();
      if (!next) return;
      const current = state.meta.authors ?? [];
      if (current.some((author) => author.name === next)) return;
      setMetaAuthors([...current, { id: uuidv4(), name: next }]);
    },
    [setMetaAuthors, state.meta.authors]
  );

  const removeAuthor = useCallback(
    (id: string) => {
      const current = state.meta.authors ?? [];
      setMetaAuthors(current.filter((author) => author.id !== id));
    },
    [setMetaAuthors, state.meta.authors]
  );

  const addRow = useCallback(() => {
    pushHistory({
      ...state,
      rows: [...state.rows, { id: uuidv4(), columns: [] }],
    });
  }, [state, pushHistory]);

  const removeRow = useCallback(
    (rowId: string) => {
      const nextRows = state.rows.filter((row) => row.id !== rowId);
      pushHistory({
        ...state,
        rows: nextRows.length ? nextRows : [{ id: uuidv4(), columns: [] }],
      });
    },
    [state, pushHistory]
  );

  const updateElement = useCallback(
    (rowId: string, columnId: string, next: Partial<BuilderElement>) => {
      const nextRows = state.rows.map((row) => {
        if (row.id !== rowId) return row;
        return {
          ...row,
          columns: row.columns.map((column) =>
            column.id === columnId
              ? { ...column, element: { ...column.element, ...next } }
              : column
          ),
        };
      });
      pushHistory({ ...state, rows: nextRows });
    },
    [state, pushHistory]
  );

  const updateColumnWidth = useCallback(
    (rowId: string, columnId: string, width: number) => {
      const nextRows = state.rows.map((row) => {
        if (row.id !== rowId) return row;
        const nextColumns = normalizeRowWidths(row.columns, columnId, width);
        return { ...row, columns: nextColumns };
      });
      pushHistory({ ...state, rows: nextRows });
    },
    [state, pushHistory]
  );

  const updateColumnWidthLive = useCallback(
    (rowId: string, columnId: string, width: number) => {
      setState((prev) => {
        const nextRows = prev.rows.map((row) => {
          if (row.id !== rowId) return row;
          const nextColumns = normalizeRowWidths(row.columns, columnId, width);
          return { ...row, columns: nextColumns };
        });
        return { ...prev, rows: nextRows };
      });
    },
    []
  );

  const removeElement = useCallback(
    (rowId: string, columnId: string) => {
      const nextRows = state.rows
        .map((row) => {
          if (row.id !== rowId) return row;
          const remaining = row.columns.filter(
            (column) => column.id !== columnId
          );
          return { ...row, columns: normalizeRowColumns(remaining) };
        })
        .filter((row) => row.columns.length > 0 || state.rows.length === 1);

      pushHistory({
        ...state,
        rows: nextRows.length ? nextRows : [{ id: uuidv4(), columns: [] }],
      });
    },
    [state, pushHistory]
  );

  const insertElementAt = useCallback(
    (rowId: string, index: number, element: BuilderElement) => {
      const nextRows = state.rows.map((row) => {
        if (row.id !== rowId) return row;
        if (row.columns.length >= MAX_COLUMNS_PER_ROW) return row;
        const nextColumns = [...row.columns];
        nextColumns.splice(index, 0, {
          id: uuidv4(),
          width: defaultInsertWidth(row.columns),
          element,
        });
        return { ...row, columns: normalizeRowColumns(nextColumns) };
      });
      pushHistory({ ...state, rows: nextRows });
    },
    [state, pushHistory]
  );

  const replaceElement = useCallback(
    (rowId: string, columnId: string, element: BuilderElement) => {
      const nextRows = state.rows.map((row) => {
        if (row.id !== rowId) return row;
        return {
          ...row,
          columns: row.columns.map((column) =>
            column.id === columnId ? { ...column, element } : column
          ),
        };
      });
      pushHistory({ ...state, rows: nextRows });
    },
    [state, pushHistory]
  );

  const moveElementToIndex = useCallback(
    (
      fromRowId: string,
      fromColumnId: string,
      toRowId: string,
      toIndex: number
    ) => {
      if (fromRowId !== toRowId) {
        const targetRow = state.rows.find((row) => row.id === toRowId);
        if (targetRow && targetRow.columns.length >= MAX_COLUMNS_PER_ROW) {
          return;
        }
      }
      if (fromRowId === toRowId) {
        const row = state.rows.find((r) => r.id === fromRowId);
        if (!row) return;
        const fromIndex = row.columns.findIndex(
          (col) => col.id === fromColumnId
        );
        if (fromIndex === -1) return;
        const nextColumns = [...row.columns];
        const [moved] = nextColumns.splice(fromIndex, 1);
        const insertIndex = Math.min(Math.max(toIndex, 0), nextColumns.length);
        nextColumns.splice(insertIndex, 0, moved);
        const normalized = ensureRowWidth(nextColumns);
        const nextRows = state.rows.map((r) =>
          r.id === fromRowId ? { ...r, columns: normalized } : r
        );
        pushHistory({ ...state, rows: nextRows });
        return;
      }

      const fromRow = state.rows.find((row) => row.id === fromRowId);
      const movingColumn = fromRow?.columns.find(
        (col) => col.id === fromColumnId
      );
      if (!movingColumn) return;

      let nextRows = state.rows.map((row) => {
        if (row.id === fromRowId) {
          return {
            ...row,
            columns: normalizeRowColumns(
              row.columns.filter((col) => col.id !== fromColumnId)
            ),
          };
        }
        if (row.id === toRowId) {
          const nextColumns = [...row.columns];
          const insertIndex = Math.min(
            Math.max(toIndex, 0),
            nextColumns.length
          );
          nextColumns.splice(insertIndex, 0, {
            ...movingColumn,
          });
          return { ...row, columns: normalizeRowColumns(nextColumns) };
        }
        return row;
      });

      nextRows = nextRows.map((row) => ({
        ...row,
        columns: ensureRowWidth(row.columns),
      }));

      pushHistory({
        ...state,
        rows: nextRows.length ? nextRows : [{ id: uuidv4(), columns: [] }],
      });
    },
    [state, pushHistory]
  );

  const handleDragStartPalette = useCallback(
    (event: DragEvent, elementType: ElementType) => {
      const payload: DragPayload = { source: "palette", elementType };
      event.dataTransfer?.setData(DRAG_DATA_KEY, JSON.stringify(payload));
      if (event.dataTransfer) event.dataTransfer.effectAllowed = "copy";
    },
    []
  );

  const handleDragStartElement = useCallback(
    (event: DragEvent, rowId: string, columnId: string) => {
      const payload: DragPayload = { source: "canvas", rowId, columnId };
      event.dataTransfer?.setData(DRAG_DATA_KEY, JSON.stringify(payload));
      if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
    },
    []
  );

  const handleDropOnEmptyRow = useCallback(
    (event: DragEvent, rowId: string) => {
      event.preventDefault();
      event.stopPropagation();
      const payload = readDragPayload(event);
      if (!payload) return;

      if (payload.source === "palette") {
        insertElementAt(rowId, 0, createElement(payload.elementType));
        setRowDropHint(null);
        return;
      }

      moveElementToIndex(payload.rowId, payload.columnId, rowId, 0);
      setRowDropHint(null);
    },
    [insertElementAt, moveElementToIndex]
  );

  const handleDropOnColumn = useCallback(
    (event: DragEvent, rowId: string, columnId: string, rowSize: number) => {
      event.preventDefault();
      event.stopPropagation();
      const payload = readDragPayload(event);
      if (!payload) return;

      const canInsert = rowSize < MAX_COLUMNS_PER_ROW;
      const rowHint =
        canInsert && rowDropHint?.rowId === rowId ? rowDropHint : null;
      const container =
        (event.currentTarget as HTMLElement).parentElement ??
        (event.currentTarget as HTMLElement);
      const rect = container.getBoundingClientRect();
      const position =
        rowHint?.position ??
        (event.clientX < rect.left + rect.width / 2 ? "before" : "after");
      const insertIndex = position === "before" ? 0 : rowSize;

      if (payload.source === "palette") {
        if (canInsert) {
          insertElementAt(
            rowId,
            insertIndex,
            createElement(payload.elementType)
          );
          setRowDropHint(null);
          return;
        }
        replaceElement(rowId, columnId, createElement(payload.elementType));
        setRowDropHint(null);
        return;
      }

      if (payload.rowId !== rowId && canInsert) {
        moveElementToIndex(payload.rowId, payload.columnId, rowId, insertIndex);
        setRowDropHint(null);
        return;
      }

      swapElements(
        state,
        pushHistory,
        { rowId: payload.rowId, columnId: payload.columnId },
        { rowId, columnId }
      );
      setRowDropHint(null);
    },
    [
      insertElementAt,
      moveElementToIndex,
      replaceElement,
      rowDropHint,
      state,
      pushHistory,
    ]
  );

  const handleDropOnInsert = useCallback(
    (event: DragEvent, rowId: string, index: number) => {
      event.preventDefault();
      event.stopPropagation();
      const payload = readDragPayload(event);
      if (!payload) return;
      const row = state.rows.find((r) => r.id === rowId);
      if (!row) return;
      if (
        row.columns.length >= MAX_COLUMNS_PER_ROW &&
        (payload.source === "palette" || payload.rowId !== rowId)
      ) {
        setRowDropHint(null);
        return;
      }
      if (payload.source === "palette") {
        insertElementAt(rowId, index, createElement(payload.elementType));
        setRowDropHint(null);
        return;
      }
      moveElementToIndex(
        payload.rowId,
        payload.columnId,
        rowId,
        indexAdjusted(payload, rowId, index, state.rows)
      );
      setRowDropHint(null);
    },
    [insertElementAt, moveElementToIndex, state.rows]
  );

  const handleRowDragOver = useCallback(
    (event: DragEvent, rowId: string, rowSize: number) => {
      event.preventDefault();
      const payload = readDragPayload(event);
      if (!payload) return;
      if (payload.source === "canvas" && payload.rowId === rowId) {
        setRowDropHint(null);
        return;
      }
      if (rowSize >= MAX_COLUMNS_PER_ROW) {
        setRowDropHint(null);
        return;
      }
      const target = event.currentTarget as HTMLElement;
      const rect = target.getBoundingClientRect();
      const position =
        event.clientX < rect.left + rect.width / 2 ? "before" : "after";
      setRowDropHint({ rowId, position });
    },
    []
  );

  const handleRowDragLeave = useCallback(
    (event: DragEvent, rowId: string) => {
      if (!rowDropHint || rowDropHint.rowId !== rowId) return;
      const target = event.currentTarget as HTMLElement;
      const related = event.relatedTarget as Node | null;
      if (related && target.contains(related)) return;
      setRowDropHint(null);
    },
    [rowDropHint]
  );

  const handleRowDrop = useCallback(
    (event: DragEvent, rowId: string) => {
      event.preventDefault();
      event.stopPropagation();
      const payload = readDragPayload(event);
      if (!payload) return;
      const row = state.rows.find((r) => r.id === rowId);
      if (!row) return;
      if (payload.source === "canvas" && payload.rowId === rowId) {
        setRowDropHint(null);
        return;
      }
      if (row.columns.length >= MAX_COLUMNS_PER_ROW) {
        setRowDropHint(null);
        return;
      }
      const target = event.currentTarget as HTMLElement;
      const rect = target.getBoundingClientRect();
      const position =
        event.clientX < rect.left + rect.width / 2 ? "before" : "after";
      const index = position === "before" ? 0 : row.columns.length;
      if (payload.source === "palette") {
        insertElementAt(rowId, index, createElement(payload.elementType));
      } else {
        moveElementToIndex(
          payload.rowId,
          payload.columnId,
          rowId,
          indexAdjusted(payload, rowId, index, state.rows)
        );
      }
      setRowDropHint(null);
    },
    [insertElementAt, moveElementToIndex, state.rows]
  );

  const handleDropOnCanvas = useCallback(
    (event: DragEvent) => {
      event.preventDefault();
      if (event.target !== event.currentTarget) return;
      event.stopPropagation();
      const payload = readDragPayload(event);
      if (!payload || payload.source !== "palette") return;
      const newRowId = uuidv4();
      pushHistory({
        ...state,
        rows: [
          ...state.rows,
          {
            id: newRowId,
            columns: evenRowWidths([
              {
                id: uuidv4(),
                width: GRID_COLUMNS,
                element: createElement(payload.elementType),
              },
            ]),
          },
        ],
      });
      setRowDropHint(null);
    },
    [state, pushHistory]
  );

  const handleResizeMove = useCallback(
    (event: MouseEvent) => {
      const current = resizeRef.current;
      if (!current) return;
      const unitWidth = Math.max(current.rowWidth / GRID_COLUMNS, 1);
      const delta = event.clientX - current.startX;
      const deltaCols = Math.round(delta / unitWidth);
      const nextWidth =
        current.direction === "right"
          ? current.startWidth + deltaCols
          : current.startWidth - deltaCols;
      updateColumnWidthLive(
        current.rowId,
        current.columnId,
        clamp(nextWidth, 1, GRID_COLUMNS)
      );
    },
    [updateColumnWidthLive]
  );

  const handleResizeEnd = useCallback(() => {
    if (!resizeRef.current) return;
    resizeRef.current = null;
    window.removeEventListener("mousemove", handleResizeMove);
    window.removeEventListener("mouseup", handleResizeEnd);
    document.body.style.cursor = "";
    setIsResizing(false);
  }, [handleResizeMove]);

  const handleResizeStart = useCallback(
    (
      event: MouseEvent,
      rowId: string,
      columnId: string,
      startWidth: number,
      direction: "left" | "right"
    ) => {
      event.preventDefault();
      event.stopPropagation();
      const target = event.currentTarget as HTMLElement;
      const rowEl = target.closest("[data-row-columns]") as HTMLElement | null;
      if (!rowEl) return;
      const rect = rowEl.getBoundingClientRect();
      resizeRef.current = {
        rowId,
        columnId,
        startX: event.clientX,
        startWidth,
        direction,
        rowWidth: Math.max(rect.width, 1),
      };
      setHistory((prev) => [...prev, cloneState(stateRef.current)]);
      setFuture([]);
      setIsResizing(true);
      window.addEventListener("mousemove", handleResizeMove);
      window.addEventListener("mouseup", handleResizeEnd);
      document.body.style.cursor = "col-resize";
    },
    [handleResizeEnd, handleResizeMove]
  );

  useEffect(() => {
    return () => {
      window.removeEventListener("mousemove", handleResizeMove);
      window.removeEventListener("mouseup", handleResizeEnd);
    };
  }, [handleResizeEnd, handleResizeMove]);

  const handleImportFile = useCallback(
    async (event: Event) => {
      const target = event.currentTarget as HTMLInputElement;
      const file = target.files?.[0];
      if (!file) return;
      const text = await file.text();
      try {
        const parsed = JSON.parse(text);
        const { nextState, keys } = parseEntityJson(parsed);
        if (keys.length > 1) {
          setLibrary(parsed);
          setEntitySelectValue(`imported:${keys[0]}`);
          pushHistory(nextState);
        } else {
          setLibrary(null);
          setEntitySelectValue("");
          pushHistory(nextState);
        }
      } catch (error) {
        console.error("Failed to import entity JSON:", error);
      } finally {
        target.value = "";
      }
    },
    [pushHistory]
  );

  const handleSave = useCallback(async () => {
    const payload = serializeEntity(state);
    const content = JSON.stringify(payload, null, 2);
    if (window.api?.builder?.saveEntity) {
      await window.api.builder.saveEntity({
        content,
        defaultPath: `${state.meta.label || "entity"}.json`,
      });
      return;
    }

    const blob = new Blob([content], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${state.meta.label || "entity"}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }, [state]);

  const handleGenerate = useCallback(async () => {
    if (!window.api?.builder?.generateEntity) return;
    const payload = serializeEntity(state);
    await window.api.builder.generateEntity({ entity: payload });
  }, [state]);

  const handleEntitySelect = useCallback(
    async (value: string) => {
      setEntitySelectValue(value);

      if (!value) return;

      if (value.startsWith("plugin:")) {
        const label = value.replace("plugin:", "");
        const blueprint = pluginBlueprints[label];
        if (blueprint) {
          const source =
            blueprint?.entity ||
            blueprint?.blueprint ||
            blueprint?.schema ||
            blueprint;
          const { nextState } = parseEntityJson(source);
          const patchedState = {
            ...nextState,
            meta: {
              ...nextState.meta,
              label: nextState.meta?.label || label,
            },
          };
          setLibrary(null);
          pushHistory(patchedState);
        } else {
          pushHistory({
            ...state,
            meta: { ...state.meta, label },
          });
        }
        return;
      }

      if (value.startsWith("imported:")) {
        if (!library) return;
        const key = value.replace("imported:", "");
        const entity = library[key];
        if (!entity) return;
        const nextState = parseEntityJson(entity).nextState;
        pushHistory(nextState);
      }
    },
    [library, pluginBlueprints, pushHistory, state]
  );

  const handleApplyJson = useCallback(() => {
    try {
      const parsed = JSON.parse(jsonDraft);
      const { nextState, keys } = parseEntityJson(parsed);
      if (keys.length > 1) {
        setLibrary(parsed);
        setEntitySelectValue(`imported:${keys[0]}`);
      } else {
        setLibrary(null);
        setEntitySelectValue("");
      }
      pushHistory(nextState);
      setJsonError(null);
    } catch (error) {
      console.error("Failed to parse JSON editor content:", error);
      setJsonError("Invalid JSON. Please fix errors and try again.");
    }
  }, [jsonDraft, pushHistory]);

  const handleResetJson = useCallback(() => {
    setJsonDraft(JSON.stringify(serializeEntity(state), null, 2));
    setJsonError(null);
  }, [state]);

  const handleCreateEntity = useCallback(() => {
    setLibrary(null);
    setEntitySelectValue("");
    setSelection({ type: "meta" });
    setHistory([]);
    setFuture([]);
    setAuthorsInput("");
    setLastGenerated(null);
    setState({
      meta: { ...createDefaultMeta() },
      rows: [{ id: uuidv4(), columns: [] }],
    });
  }, []);

  const handleCreateTransform = useCallback(() => {
    if (!canManageTransforms) {
      toast.error("Save or select an entity before creating transforms.");
      return;
    }
    setIsCreatingTransform(true);
    setSelectedTransform("");
    setPythonLabel("");
    setPythonDraft(createDefaultPythonTemplate());
  }, [canManageTransforms]);

  const handleSaveTransform = useCallback(async () => {
    if (!window.api?.plugins?.saveTransformFile) return;
    const label = pythonLabel.trim() || "py-transform";
    try {
      const saved = await window.api.plugins.saveTransformFile({
        label,
        content: pythonDraft,
      });
      setIsCreatingTransform(false);
      setSelectedTransform(saved.label);
      setPythonLabel(saved.label);
      await refreshPythonTransforms();
    } catch (error) {
      console.error("Failed to save Python transform:", error);
    }
  }, [pythonDraft, pythonLabel, refreshPythonTransforms]);

  const handleDeleteTransform = useCallback(async () => {
    if (!window.api?.plugins?.deleteTransformFile) return;
    const label = selectedTransform;
    if (!label) return;
    setIsDeletingTransform(true);
    try {
      await window.api.plugins.deleteTransformFile({ label });
      setSelectedTransform("");
      setPythonLabel("");
      setPythonDraft(createDefaultPythonTemplate());
      setIsCreatingTransform(false);
      await refreshPythonTransforms();
      setShowTransformDeleteModal(false);
    } catch (error) {
      console.error("Failed to delete Python transform:", error);
    } finally {
      setIsDeletingTransform(false);
    }
  }, [refreshPythonTransforms, selectedTransform]);

  const isPreviewing = activeTab === "preview";

  return (
    <div className="flex h-full max-h-screen w-full">
      <div className="flex h-full min-h-0 w-full flex-col gap-y-3 p-3">
        <WorkspaceAppbar
          library={library}
          pluginEntities={pluginEntities}
          selectedEntity={entitySelectValue}
          activeTab={activeTab}
          onEntitySelect={handleEntitySelect}
          onCreateEntity={handleCreateEntity}
          onImportFile={handleImportFile}
          onGenerate={handleGenerate}
          onTabChange={handleTabChange}
          onEntitySave={handleSave}
        />
        {activeTab === "json" ? (
          <JsonEditorTab
            jsonDraft={jsonDraft}
            jsonError={jsonError}
            onJsonChange={(nextValue) => {
              setJsonDraft(nextValue);
              setJsonError(null);
            }}
            onReset={handleResetJson}
            onApply={handleApplyJson}
          />
        ) : activeTab === "transforms" ? (
          <TransformsTab
            transforms={pythonTransforms}
            selectedTransform={selectedTransform}
            pythonLabel={pythonLabel}
            pythonDraft={pythonDraft}
            entityLabel={state.meta.label}
            inputElements={previewElements}
            onSelectTransform={handleTransformSelect}
            onLabelChange={setPythonLabel}
            onPythonChange={setPythonDraft}
            onSave={handleSaveTransform}
            onCreate={handleCreateTransform}
            onDelete={() => setShowTransformDeleteModal(true)}
            canDelete={Boolean(selectedTransform)}
            canManageTransforms={canManageTransforms}
          />
        ) : (
          <div className="flex w-full gap-3 flex-1 min-h-0">
            <EntityElementsPalette onDragStart={handleDragStartPalette} />
            <div className="flex w-full min-h-0">
              <div
                className="flex flex-1 flex-col pr-3"
                onDragOver={
                  isPreviewing ? undefined : (event) => event.preventDefault()
                }
                onDrop={isPreviewing ? undefined : handleDropOnCanvas}
              >
                {isPreviewing ? (
                  <PreviewTab meta={state.meta} elements={previewElements} />
                ) : (
                  <LayoutCanvas
                    rows={state.rows}
                    selection={selection}
                    history={history}
                    future={future}
                    isResizing={isResizing}
                    rowDropHint={rowDropHint}
                    onSetSelection={setSelection}
                    onUndo={undo}
                    onRedo={redo}
                    onAddRow={addRow}
                    onRemoveRow={removeRow}
                    onDragStartElement={handleDragStartElement}
                    onDropOnEmptyRow={handleDropOnEmptyRow}
                    onDropOnColumn={handleDropOnColumn}
                    onDropOnInsert={handleDropOnInsert}
                    onDropOnCanvas={handleDropOnCanvas}
                    onRowDragOver={handleRowDragOver}
                    onRowDragLeave={handleRowDragLeave}
                    onRowDrop={handleRowDrop}
                    onResizeStart={handleResizeStart}
                  />
                )}
              </div>
              <PropertiesPanel
                meta={state.meta}
                selection={selection}
                selectedElement={selectedElement}
                selectedColumn={selectedColumn}
                authorsInput={authorsInput}
                lastGenerated={lastGenerated}
                onSetMetaField={setMetaField}
                onSetAuthorsInput={setAuthorsInput}
                onAddAuthor={addAuthor}
                onRemoveAuthor={removeAuthor}
                onUpdateElement={updateElement}
                onUpdateColumnWidth={updateColumnWidth}
                onRemoveElement={removeElement}
              />
            </div>
          </div>
        )}
      </div>
      <ConfirmDelete
        isOpen={showTransformDeleteModal}
        closeModal={() => setShowTransformDeleteModal(false)}
        itemName={selectedTransform}
        itemType="transform"
        onConfirmDelete={handleDeleteTransform}
        isDeleting={isDeletingTransform}
      />
    </div>
  );
}
