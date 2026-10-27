import { useState } from "preact/hooks";
import { useTranslation } from "react-i18next";
import { Icon } from "@/components/icons";
import ColorPicker from "@/components/ColorPicker";
import IconPicker, { OmoikaIcon } from "@/components/IconPicker";
import Button from "@/components/buttons";
import InfoTip from "@/components/InfoTip";

const GRID_COLUMNS = 12;

type EntityMeta = {
  label: string;
  color: string;
  icon: string;
  description?: string;
  authors?: Array<{ id: string; name: string }>;
};

type BuilderElement = {
  id: string;
  type: string;
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

type BuilderColumn = {
  id: string;
  width: number;
  element: BuilderElement;
};

type Selection =
  | { type: "meta" }
  | { type: "row"; rowId: string }
  | { type: "element"; rowId: string; columnId: string };

interface PropertiesPanelProps {
  meta: EntityMeta;
  selection: Selection;
  selectedElement: BuilderElement | null;
  selectedColumn: BuilderColumn | null;
  authorsInput: string;
  lastGenerated: string | null;
  onSetMetaField: (field: keyof EntityMeta, value: string) => void;
  onSetAuthorsInput: (value: string) => void;
  onAddAuthor: (name: string) => void;
  onRemoveAuthor: (id: string) => void;
  onUpdateElement: (
    rowId: string,
    columnId: string,
    next: Partial<BuilderElement>
  ) => void;
  onUpdateColumnWidth: (rowId: string, columnId: string, width: number) => void;
  onRemoveElement: (rowId: string, columnId: string) => void;
}

export default function PropertiesPanel({
  meta,
  selection,
  selectedElement,
  selectedColumn,
  authorsInput,
  lastGenerated,
  onSetMetaField,
  onSetAuthorsInput,
  onAddAuthor,
  onRemoveAuthor,
  onUpdateElement,
  onUpdateColumnWidth,
  onRemoveElement,
}: PropertiesPanelProps) {
  const { t } = useTranslation();
  const [isMetaOpen, setIsMetaOpen] = useState(true);
  const [isElementMetaOpen, setIsElementMetaOpen] = useState(true);

  return (
    <aside className="relative flex max-w-80 flex-col items-start rounded-md border-r-3 border-black/10 bg-linear-to-tr from-black/40 to-black/50 shadow-2xl shadow-black/25 backdrop-blur-md py-1 w-full min-h-0 overflow-y-auto">
      <header class="hover:border-primary-350 border-mirage-400 flex cursor-pointer py-0.5 pb-1 justify-between items-center text-slate-400 transition-colors duration-500 ease-in-out px-2 w-full">
        <p class="font-semibold tracking-wider text-slate-400">
          {t("workspace.properties.title")}
        </p>
        <InfoTip side="left">
          <p>{t("workspace.properties.info")}</p>
        </InfoTip>
      </header>
      <section className="rounded-md group/section w-full">
        <button
          type="button"
          onClick={() => setIsMetaOpen((prev) => !prev)}
          className="flex w-full items-center justify-between text-xs font-semibold uppercase tracking-wide text-slate-400 border-mirage-400 border-b-2 py-0.5 pb-1 group-hover/section:border-primary-350 px-2 group/toggle"
        >
          <span className=" text-[0.7rem] font-semibold uppercase tracking-wider text-slate-500 group-hover/toggle:text-slate-400 transition-all duration-300">
            {t("workspace.properties.entityMetadata")}
          </span>
          <Icon
            icon="chevron-down"
            className={`h-4 w-4 hover:text-primary-350 group-hover/toggle:text-slate-100 transition-all duration-300 $ ${
              isMetaOpen ? "rotate-180" : ""
            }`}
          />
        </button>
        <div
          className={`grid transition-all duration-200 ease-out ${
            isMetaOpen
              ? "grid-rows-[1fr] opacity-100"
              : "grid-rows-[0fr] opacity-0 pointer-events-none"
          }`}
        >
          <div className="min-h-0 px-2">
            <div className="mt-3 flex flex-col gap-3">
              <label className="flex flex-col gap-1 text-xs text-slate-400">
                {t("workspace.properties.label")}
                <input
                  value={meta.label}
                  onInput={(event) =>
                    onSetMetaField(
                      "label",
                      (event.currentTarget as HTMLInputElement).value
                    )
                  }
                  className="hover:outline-mirage-400 text-base outline-mirage-500 text-slate-350 w-full rounded border-2 border-transparent bg-transparent bg-linear-to-br from-black/35 to-black/10 px-2 py-1 font-sans outline-1 transition-all duration-100 ease-in placeholder:text-slate-700 hover:from-black/35 hover:to-black/20 focus:border-2 focus:border-primary focus:bg-black/60 focus-visible:outline-transparent"
                />
              </label>
              <div className="flex flex-col gap-1 text-xs text-slate-400">
                {t("workspace.properties.icon")}
                <div className="flex">
                  <IconPicker
                    currentIcon={meta.icon}
                    setIcon={(icon: OmoikaIcon) => onSetMetaField("icon", icon)}
                  />
                </div>
              </div>
              <ColorPicker
                label="Color"
                value={meta.color}
                onChange={(value) => onSetMetaField("color", value)}
              />
              <label className="flex flex-col gap-1 text-xs text-slate-400">
                {t("workspace.properties.description")}
                <textarea
                  rows={3}
                  value={meta.description || ""}
                  onInput={(event) =>
                    onSetMetaField(
                      "description",
                      (event.currentTarget as HTMLTextAreaElement).value
                    )
                  }
                  className="hover:outline-mirage-400 outline-mirage-500 text-slate-350 w-full resize-none rounded border-2 border-transparent bg-transparent bg-linear-to-br from-black/35 to-black/10 px-2 py-1 text-base font-sans outline-1 transition-all duration-100 ease-in placeholder:text-slate-700 hover:from-black/35 hover:to-black/20 focus:border-2 focus:border-primary focus:bg-black/60 focus-visible:outline-transparent"
                />
              </label>

              <label className="flex flex-col gap-2 text-xs text-slate-400">
                {t("workspace.properties.authors")}
                <div className="hover:outline-mirage-400 outline-mirage-500 flex flex-wrap gap-2 rounded border-2 border-transparent bg-transparent bg-linear-to-br from-black/35 to-black/10 px-2 py-1 text-slate-350 outline-1 transition-all duration-100 ease-in hover:from-black/35 hover:to-black/20 focus-within:border-primary">
                  {(meta.authors || []).map((author) => (
                    <span
                      key={author.id}
                      className="flex items-center gap-1 rounded-md border border-slate-800/60 bg-slate-900/70 px-2 py-0.5 text-sm text-slate-200"
                    >
                      {author.name}
                      <button
                        type="button"
                        onClick={() => onRemoveAuthor(author.id)}
                        className="text-slate-400 hover:text-slate-200"
                        aria-label={t("workspace.properties.removeAuthor", {
                          name: author.name,
                        })}
                      >
                        x
                      </button>
                    </span>
                  ))}
                  <input
                    value={authorsInput}
                    onInput={(event) =>
                      onSetAuthorsInput(
                        (event.currentTarget as HTMLInputElement).value
                      )
                    }
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === ",") {
                        event.preventDefault();
                        onAddAuthor(authorsInput);
                        onSetAuthorsInput("");
                      }
                    }}
                    placeholder={t("workspace.properties.addAuthor")}
                    className="min-w-24 flex-1 bg-transparent py-0.5 text-base text-slate-350 outline-none placeholder:text-slate-700"
                  />
                </div>
                <p className="text-xs text-slate-500">
                  {t("workspace.properties.addAuthorHint")}
                </p>
              </label>
            </div>
            {lastGenerated && (
              <p className="mt-2 text-xs text-slate-500">
                {t("workspace.properties.generatedIn", {
                  path: lastGenerated,
                })}
              </p>
            )}
          </div>
        </div>
      </section>
      <section className="rounded-md group/section w-full mt-2">
        <button
          type="button"
          onClick={() => setIsElementMetaOpen((prev) => !prev)}
          className="flex w-full items-center justify-between text-xs font-semibold uppercase tracking-wide text-slate-400 border-mirage-400 border-b-2 pb-0.5 group-hover/section:border-primary-350 px-2 group/toggle"
        >
          <span className="text-[0.7rem] font-semibold uppercase tracking-wider text-slate-500 group-hover/toggle:text-slate-400 transition-all duration-300">
            {t("workspace.properties.elementMetadata")}
          </span>
          <Icon
            icon="chevron-down"
            className={`h-4 w-4 transition-all duration-300 group-hover/toggle:text-slate-100 ${
              isElementMetaOpen ? "rotate-180" : ""
            }`}
          />
        </button>
        <div
          className={`grid transition-all px-2 pt-1 duration-200 ease-out overflow-y-auto ${
            isElementMetaOpen
              ? "grid-rows-[1fr] opacity-100"
              : "grid-rows-[0fr] opacity-0"
          }`}
        >
          <div className="min-h-0 overflow-visible px-0.5 pt-2">
            {selectedElement ? (
              <div className="flex flex-col gap-2 text-base text-slate-400">
                <label className="flex flex-col gap-1 text-xs text-slate-400">
                  {t("workspace.properties.label")}
                  <input
                    value={selectedElement.label}
                    onInput={(event) =>
                      onUpdateElement(
                        (selection as any).rowId,
                        (selection as any).columnId,
                        {
                          label: (event.currentTarget as HTMLInputElement)
                            .value,
                        }
                      )
                    }
                    className="hover:outline-mirage-400 text-base outline-mirage-500 text-slate-350 w-full rounded border-2 border-transparent bg-transparent bg-linear-to-br from-black/35 to-black/10 px-2 py-1 font-sans outline-1 transition-all duration-100 ease-in placeholder:text-slate-700 hover:from-black/35 hover:to-black/20 focus:border-2 focus:border-primary focus:bg-black/60 focus-visible:outline-transparent"
                  />
                </label>
                <div className="flex flex-col gap-1 text-xs text-slate-400">
                  {t("workspace.properties.icon")}
                  <div className="flex">
                    <IconPicker
                      currentIcon={
                        (selectedElement.icon as OmoikaIcon) || "shield-checkered"
                      }
                      setIcon={(icon: OmoikaIcon) =>
                        onUpdateElement(
                          (selection as any).rowId,
                          (selection as any).columnId,
                          {
                            icon,
                          }
                        )
                      }
                    />
                  </div>
                </div>
                <label className="flex flex-col gap-1">
                  <p className="text-xs">{t("workspace.properties.width")}</p>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() =>
                        onUpdateColumnWidth(
                          (selection as any).rowId,
                          (selection as any).columnId,
                          (selectedColumn?.width || 1) - 1
                        )
                      }
                      className="rounded border font-medium text-slate-350 border-slate-800/50 px-4 py-1.5 text-xl"
                    >
                      <Icon icon="minus" />
                    </button>
                    <input
                      type="number"
                      min={1}
                      max={GRID_COLUMNS}
                      value={selectedColumn?.width || 1}
                      onInput={(event) =>
                        onUpdateColumnWidth(
                          (selection as any).rowId,
                          (selection as any).columnId,
                          Number(
                            (event.currentTarget as HTMLInputElement).value
                          )
                        )
                      }
                      className="w-full outline-none rounded border border-mirage-500/40 bg-slate-950/50 px-2 py-0.5 text-lg text-slate-100"
                    />
                    <button
                      onClick={() =>
                        onUpdateColumnWidth(
                          (selection as any).rowId,
                          (selection as any).columnId,
                          (selectedColumn?.width || 1) + 1
                        )
                      }
                      className="rounded border font-medium text-slate-350 border-slate-800/50 px-4 py-1.5 text-xl"
                    >
                      <Icon icon="plus" />
                    </button>
                  </div>
                </label>
                {selectedElement.type === "dropdown" && (
                  <label className="flex flex-col gap-1">
                    {t("workspace.properties.dropdownOptions")}
                    <textarea
                      value={serializeOptions(selectedElement.options)}
                      onInput={(event) =>
                        onUpdateElement(
                          (selection as any).rowId,
                          (selection as any).columnId,
                          {
                            options: parseOptions(
                              (event.currentTarget as HTMLTextAreaElement).value
                            ),
                          }
                        )
                      }
                      className="min-h-24 rounded border border-mirage-500/40 bg-slate-950/50 px-2 py-1 text-xs text-slate-100"
                    />
                  </label>
                )}
                <Button.Ghost
                  variant="danger"
                  onClick={() =>
                    onRemoveElement(
                      (selection as any).rowId,
                      (selection as any).columnId
                    )
                  }
                  className="mt-2 rounded-md border border-rose-500/10 bg-rose-500/10 px-2 py-1 text-xs text-rose-200"
                >
                  {t("workspace.properties.removeElement")}
                </Button.Ghost>
              </div>
            ) : (
              <p className="text-sm text-slate-500">
                {t("workspace.properties.selectElementHint")}
              </p>
            )}
          </div>
        </div>
      </section>
      <div className="px-3 w-full mt-auto">
        <Button.Solid
          disabled
          title={t("workspace.properties.publishEntityHint")}
          variant="primary"
          className=" w-full my-3"
        >
          {t("workspace.properties.publishEntity")}
        </Button.Solid>
      </div>
    </aside>
  );
}

function serializeOptions(
  options?: Array<{
    label: string;
    value?: string;
    description?: string | null;
  }>
) {
  if (!options || options.length === 0) return "";
  return options
    .map((option) =>
      [option.label, option.value ?? "", option.description ?? ""]
        .map((part) => String(part).replace(/\n/g, " "))
        .join("|")
    )
    .join("\n");
}

function parseOptions(text: string): Array<{
  label: string;
  value?: string;
  description?: string | null;
}> {
  if (!text.trim()) return [];
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [label, value, description] = line.split("|");
      return {
        label: label?.trim() || "",
        value: value?.trim() || undefined,
        description: description?.trim() || undefined,
      };
    });
}
