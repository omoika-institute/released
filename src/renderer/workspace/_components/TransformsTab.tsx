import { useEffect, useMemo, useState } from "preact/hooks";
import { Icon } from "@/components/icons";
import JsonEditor from "@/components/editor/JsonEditor";
import PythonEditor from "@/components/editor/PythonEditor";
import Terminal, { useTerminal } from "@/components/terminal/Terminal";
import Button from "@/components/buttons";
import { toSnakeCase } from "@/renderer/graph/utils";

export interface TransformFile {
  label: string;
  filename: string;
  path: string;
  mtime: string;
}

export type TransformInputType =
  | "text"
  | "textarea"
  | "dropdown"
  | "checkbox"
  | "datetime"
  | "radio"
  | "taglist"
  | "url"
  | "json"
  | "upload";

export interface TransformInputField {
  key: string;
  label: string;
  type: TransformInputType;
  defaultValue?: any;
}

interface TransformsTabProps {
  transforms: TransformFile[];
  selectedTransform: string;
  pythonLabel: string;
  pythonDraft: string;
  entityLabel: string;
  inputElements: Array<any | any[]>;
  onSelectTransform: (transform: TransformFile) => void;
  onLabelChange: (value: string) => void;
  onPythonChange: (value: string) => void;
  onSave: () => void;
  onCreate: () => void;
  onDelete: () => void;
  canDelete: boolean;
  canManageTransforms: boolean;
  onRun?: () => void;
}

export default function TransformsTab({
  transforms,
  selectedTransform,
  pythonLabel,
  pythonDraft,
  entityLabel,
  inputElements,
  onSelectTransform,
  onLabelChange,
  onPythonChange,
  onSave,
  onCreate,
  onDelete,
  canDelete,
  canManageTransforms,
  onRun,
}: TransformsTabProps) {
  const { writeLine, clear } = useTerminal();
  const [isRunning, setIsRunning] = useState(false);
  const [jsonInput, setJsonInput] = useState("");
  const [jsonDirty, setJsonDirty] = useState(false);
  const [jsonParseError, setJsonParseError] = useState<string | null>(null);

  const hasTransforms = transforms.length > 0;

  const inputFields = useMemo(() => {
    const fields: TransformInputField[] = [];
    const counts = new Map<string, number>();
    const inputTypes = new Set<string>([
      "text",
      "textarea",
      "dropdown",
      "checkbox",
      "datetime",
      "radio",
      "taglist",
      "url",
      "json",
      "upload",
    ]);

    inputElements.forEach((entry, rowIndex) => {
      const row = Array.isArray(entry) ? entry : [entry];
      row.forEach((element, colIndex) => {
        if (!element || !inputTypes.has(element.type)) return;
        const baseKey = toSnakeCase(element.label || element.type || "field");
        const nextCount = (counts.get(baseKey) ?? 0) + 1;
        counts.set(baseKey, nextCount);
        const key = nextCount > 1 ? `${baseKey}_${nextCount}` : baseKey;
        fields.push({
          key,
          label: element.label || baseKey,
          type: element.type,
          defaultValue: element.value,
        });
      });
    });

    return fields;
  }, [inputElements]);

  useEffect(() => {
    setJsonDirty(false);
  }, [inputFields]);

  const normalizeInputValue = (field: TransformInputField, value: any): any => {
    if (field.type === "checkbox") return Boolean(value);
    if (field.type === "taglist") {
      if (Array.isArray(value)) return value;
      return String(value ?? "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
    }
    if (field.type === "json") {
      if (value == null || String(value).trim().length === 0) return null;
      try {
        return typeof value === "string" ? JSON.parse(value) : value;
      } catch {
        return value;
      }
    }
    return value ?? "";
  };

  const buildDefaultData = () => {
    const data: Record<string, any> = {};
    for (const field of inputFields) {
      const fallback =
        field.defaultValue !== undefined
          ? field.defaultValue
          : field.type === "checkbox"
            ? false
            : field.type === "taglist"
              ? []
              : "";
      data[field.key] = normalizeInputValue(field, fallback);
    }
    return data;
  };

  useEffect(() => {
    if (jsonDirty) return;
    const payload = {
      label: entityLabel || "input",
      data: buildDefaultData(),
    };
    const nextJson = JSON.stringify(payload, null, 2);
    if (nextJson !== jsonInput) {
      setJsonInput(nextJson);
    }
    setJsonParseError(null);
  }, [entityLabel, jsonDirty, jsonInput, inputFields]);

  const jsonReady = jsonInput.trim().length > 0 && !jsonParseError;
  const inputsReady = jsonReady;

  const handleJsonChange = (nextValue: string) => {
    setJsonInput(nextValue);
    setJsonDirty(true);

    if (!nextValue.trim()) {
      setJsonParseError("JSON input is required.");
      return;
    }

    let parsed: any;
    try {
      parsed = JSON.parse(nextValue);
    } catch (error: any) {
      setJsonParseError(error?.message ?? "Invalid JSON");
      return;
    }

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      setJsonParseError("JSON input must be an object.");
      return;
    }

    const data = "data" in parsed ? parsed.data : parsed;

    if (!data || typeof data !== "object" || Array.isArray(data)) {
      setJsonParseError("Input data must be an object.");
      return;
    }

    setJsonParseError(null);
  };

  const handleRun = async () => {
    clear();
    const label = (pythonLabel || selectedTransform || "").trim();
    if (!label) {
      writeLine("\x1b[31m[Error]\x1b[0m Select or name a transform first.");
      return;
    }
    if (!window.api?.transforms?.run) {
      writeLine("\x1b[31m[Error]\x1b[0m Transform runner not available.");
      return;
    }
    if (jsonParseError) {
      writeLine(`\x1b[31m[Error]\x1b[0m ${jsonParseError}`);
      return;
    }
    let inputPayload: any;
    try {
      const parsed = JSON.parse(jsonInput);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        writeLine("\x1b[31m[Error]\x1b[0m JSON input must be an object.");
        return;
      }
      if ("data" in parsed) {
        if (
          !parsed.data ||
          typeof parsed.data !== "object" ||
          Array.isArray(parsed.data)
        ) {
          writeLine("\x1b[31m[Error]\x1b[0m Input data must be an object.");
          return;
        }
        inputPayload = parsed;
      } else {
        const { label: parsedLabel, ...rest } = parsed as Record<string, any>;
        inputPayload = {
          label:
            typeof parsedLabel === "string"
              ? parsedLabel
              : entityLabel || "input",
          data: rest,
        };
      }
    } catch (error: any) {
      writeLine(`\x1b[31m[Error]\x1b[0m ${error?.message ?? "Invalid JSON"}`);
      return;
    }
    writeLine(`\x1b[36m[Run]\x1b[0m Executing transform '${label}'...`);
    setIsRunning(true);
    try {
      const output = await window.api.transforms.run({
        transformLabel: label,
        input: inputPayload,
      });
      if (output?.trim()) {
        writeLine(output);
      } else {
        writeLine("\x1b[90m[Run]\x1b[0m No output returned.");
      }
      onRun?.();
    } catch (error: any) {
      writeLine(
        `\x1b[31m[Error]\x1b[0m ${error?.message ?? "Transform failed"}`
      );
    } finally {
      setIsRunning(false);
    }
  };

  const canRun =
    Boolean((pythonLabel || selectedTransform || "").trim()) && inputsReady;

  return (
    <div className="flex min-h-0 w-full gap-3 flex-1">
      <aside className="relative flex max-w-80 flex-col items-start rounded-md border-r-3 border-black/10 bg-linear-to-tr from-black/40 to-black/50 shadow-2xl shadow-black/25 backdrop-blur-md py-1 w-full min-h-0">
        <header className="hover:border-primary-350 border-mirage-400 flex cursor-pointer py-0.5 pb-1 justify-between items-center text-slate-400 transition-colors duration-500 ease-in-out px-2 w-full">
          <p className="font-semibold tracking-wider text-slate-400">
            Entity Transforms
          </p>

          <span className="text-lg font-black text-slate-350">
            {transforms.length}
          </span>
        </header>
        <header className="hover:border-primary-350 border-mirage-400 flex cursor-pointer items-center border-b-2 py-0.5 pb-1 text-slate-700 transition-colors duration-500 ease-in-out hover:text-slate-500 w-full">
          <p className="px-2 text-[0.7rem] font-semibold uppercase tracking-wider text-slate-500">
            Python
          </p>
        </header>
        <div className="w-full overflow-y-scroll px-1.5 transition-all duration-200 ease-in">
          {!canManageTransforms ? (
            <p className="px-3 py-4 text-xs text-slate-600">
              Save or select an entity to manage transforms.
            </p>
          ) : !hasTransforms ? (
            <p className="px-3 py-4 text-xs text-slate-600">
              No transforms yet. Create one to get started.
            </p>
          ) : (
            transforms.map((transform) => {
              const isActive = transform.label === selectedTransform;
              return (
              <button
                key={transform.label}
                onClick={() => onSelectTransform(transform)}
                  className={`px-4 py-1.5 from-mirage-600/20 to-mirage-600/10 hover:shadow-primary-950/50 shadow-cod-800/20 relative mb-1.5 flex w-full -translate-x-px items-center overflow-hidden rounded-md border border-slate-950 bg-transparent from-10% text-sm shadow-2xs transition-transform duration-300 ease-out first:mt-2 hover:translate-x-0.75 hover:border-slate-900/40 hover:bg-linear-to-tl hover:shadow focus:outline-hidden *:text-slate-400 ${
                    isActive
                      ? "translate-x-0.75 border-slate-900/40 bg-linear-to-tl shadow-none *:text-slate-200"
                      : ""
                  }`}
                >
                  <div className="group mb-0.5 flex w-full flex-col items-start pr-0 text-inherit text-left">
                    <p className="line-clamp-1 pb-0.5 text-base leading-4 group-hover:text-slate-400">
                      {transform.label}
                    </p>
                    <p className="mb-0.5 w-full pr-6 text-[0.65rem] leading-4 text-slate-600">
                      {new Date(transform.mtime).toLocaleString()}
                    </p>
                  </div>
                  <Icon
                    icon="code"
                    className="hover:text-primary-350! absolute right-2 ml-auto h-8 w-8 rounded border border-transparent p-1 transition-colors duration-300 group-hover:text-primary-300! text-slate-700"
                  />
              </button>
              );
            })
          )}
        </div>
      </aside>

      <section className="flex min-h-0 flex-1 flex-col rounded-md border border-black/20 bg-linear-to-br from-black/40 to-black/30 px-4 pt-2">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-sm font-semibold text-slate-400">
            Python Transform Editor
          </h2>
          <div className="flex items-center gap-2">
            <input
              value={pythonLabel}
              onInput={(event) =>
                onLabelChange((event.currentTarget as HTMLInputElement).value)
              }
              placeholder="transform-filename"
              className="hover:outline-mirage-400 text-base outline-mirage-500 text-slate-350 w-full rounded border-2 border-transparent bg-transparent bg-linear-to-br from-black/35 to-black/10 px-2 py-1 font-sans outline-1 transition-all duration-100 ease-in placeholder:text-slate-700 hover:from-black/35 hover:to-black/20 focus:border-2 focus:border-primary focus:bg-black/60 focus-visible:outline-transparent"
            />
            <Button.Ghost variant="primary" onClick={onCreate}>
              New transform
              <Icon icon="plus" className="w-4 h-4 ml-2" />
            </Button.Ghost>
            <Button.Ghost
              variant="accent"
              onClick={onSave}
              disabled={!canManageTransforms}
            >
              Save
              <Icon icon="plus" className="w-4 h-4 ml-2" />
            </Button.Ghost>
            <Button.Ghost
              variant="danger"
              onClick={onDelete}
              disabled={!canDelete || !canManageTransforms}
            >
              Delete
              <Icon icon="trash" className="w-4 h-4 ml-2" />
            </Button.Ghost>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-hidden rounded-md border border-slate-800/50 bg-slate-950/60 overflow-y-scroll">
          <PythonEditor
            value={pythonDraft}
            onChange={onPythonChange}
            className="h-full text-xs text-slate-200"
          />
        </div>

        <div className="mt-3 flex  gap-3">
          <div className="flex min-h-0 shrink flex-col grow">
            <div className="flex items-center justify-between rounded-md border border-slate-800/40 bg-slate-900/40 px-2 py-1">
              <Icon icon="terminal-2" className="h-5 w-5 text-emerald-600" />
              <p className="flex items-center gap-2 text-sm font-semibold text-slate-400">
                Transform Logs
              </p>
              <Button.Ghost
                variant="accent"
                onClick={handleRun}
                className="text-[0.7rem] pr-3"
                disabled={!canRun || isRunning}
              >
                {isRunning ? "Running..." : "Run transform"}
                <Icon icon="terminal" className="h-4 w-4 ml-2" />
              </Button.Ghost>
            </div>
            <Terminal className="mt-2 h-40" />
          </div>
          <div className="flex min-h-0 flex-col rounded-md border border-slate-800/40 bg-slate-900/40 max-w-92 min-w-92">
            <div className="flex items-center justify-between px-2 py-1 text-sm text-slate-300">
              <p className="flex items-center gap-2">
                <Icon icon="code" className="h-5 w-5 text-primary-300" />
                <span>Transform Input (JSON)</span>
              </p>
              <div className="flex items-center gap-2">
                {jsonParseError ? (
                  <span className="text-[0.65rem] text-danger-400">
                    {jsonParseError}
                  </span>
                ) : null}
                <button
                  type="button"
                  onClick={() => setJsonDirty(false)}
                  className="text-[0.7rem] text-slate-500 hover:text-slate-300"
                >
                  Reset
                </button>
              </div>
            </div>
            <div className="border-t border-slate-800/50 bg-slate-950/50 overflow-y-scroll">
              <JsonEditor
                value={jsonInput}
                onChange={handleJsonChange}
                className="h-40 w-full"
              />
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
