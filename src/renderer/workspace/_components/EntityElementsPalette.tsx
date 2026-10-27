import { Icon } from "@/components/icons";
import InfoTip from "@/components/InfoTip";
import { useTranslation } from "react-i18next";

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

interface EntityElementsPaletteProps {
  onDragStart: (event: DragEvent, elementType: ElementType) => void;
}

export default function EntityElementsPalette({
  onDragStart,
}: EntityElementsPaletteProps) {
  const { t } = useTranslation();
  const INPUTS_PALETTE = [
    {
      type: "text" as const,
      label: t("workspace.palette.inputs.text.label"),
      icon: "ballpen",
      description: t("workspace.palette.inputs.text.description"),
    },
    {
      type: "textarea" as const,
      label: t("workspace.palette.inputs.textarea.label"),
      icon: "align-left",
      description: t("workspace.palette.inputs.textarea.description"),
    },
    {
      type: "dropdown" as const,
      label: t("workspace.palette.inputs.dropdown.label"),
      icon: "chevron-down",
      description: t("workspace.palette.inputs.dropdown.description"),
    },
    {
      type: "upload" as const,
      label: t("workspace.palette.inputs.upload.label"),
      icon: "file-upload",
      description: t("workspace.palette.inputs.upload.description"),
    },
    {
      type: "md" as const,
      label: t("workspace.palette.inputs.markdown.label"),
      icon: "markdown",
      description: t("workspace.palette.inputs.markdown.description"),
    },
    {
      type: "taglist" as const,
      label: t("workspace.palette.inputs.taglist.label"),
      icon: "tag",
      description: t("workspace.palette.inputs.taglist.description"),
    },
    {
      type: "datetime" as const,
      label: t("workspace.palette.inputs.datetime.label"),
      icon: "calendar-time",
      description: t("workspace.palette.inputs.datetime.description"),
    },
    {
      type: "checkbox" as const,
      label: t("workspace.palette.inputs.checkbox.label"),
      icon: "checkbox",
      description: t("workspace.palette.inputs.checkbox.description"),
    },
  ];
  const DISPLAY_ELEMENTS = [
    {
      type: "title" as const,
      label: t("workspace.palette.display.title.label"),
      icon: "text-size",
      description: t("workspace.palette.display.title.description"),
    },
    {
      type: "section" as const,
      label: t("workspace.palette.display.section.label"),
      icon: "align-left",
      description: t("workspace.palette.display.section.description"),
    },
    {
      type: "empty" as const,
      label: t("workspace.palette.display.empty.label"),
      icon: "minus",
      description: t("workspace.palette.display.empty.description"),
    },
    {
      type: "copy-text" as const,
      label: t("workspace.palette.display.copyText.label"),
      icon: "copy",
      description: t("workspace.palette.display.copyText.description"),
    },
    {
      type: "url" as const,
      label: t("workspace.palette.display.url.label"),
      icon: "link",
      description: t("workspace.palette.display.url.description"),
    },
    {
      type: "copy-code" as const,
      label: t("workspace.palette.display.copyCode.label"),
      icon: "code",
      description: t("workspace.palette.display.copyCode.description"),
    },
    {
      type: "json" as const,
      label: t("workspace.palette.display.json.label"),
      icon: "braces",
      description: t("workspace.palette.display.json.description"),
    },
    {
      type: "img" as const,
      label: t("workspace.palette.display.image.label"),
      icon: "photo",
      description: t("workspace.palette.display.image.description"),
    },
    {
      type: "pdf" as const,
      label: t("workspace.palette.display.pdf.label"),
      icon: "file-type-pdf",
      description: t("workspace.palette.display.pdf.description"),
    },
    {
      type: "video" as const,
      label: t("workspace.palette.display.video.label"),
      icon: "video",
      description: t("workspace.palette.display.video.description"),
    },
    {
      type: "list" as const,
      label: t("workspace.palette.display.list.label"),
      icon: "list",
      description: t("workspace.palette.display.list.description"),
    },
  ];

  return (
    <aside class="relative flex max-w-80 flex-col items-start rounded-md border-r-3 border-black/10 bg-linear-to-tr from-black/40 to-black/50 shadow-2xl shadow-black/25 backdrop-blur-md py-1 w-full min-h-0">
      <header class="hover:border-primary-350 border-mirage-400 flex cursor-pointer py-0.5 pb-1 justify-between items-center text-slate-400 transition-colors duration-500 ease-in-out px-2 w-full">
        <p class="font-semibold tracking-wider text-slate-400">
          {t("workspace.palette.title")}
        </p>

        <InfoTip side="bottom">
          <p>{t("workspace.palette.info")}</p>
        </InfoTip>
      </header>

      <header class="hover:border-primary-350 border-mirage-400 flex cursor-pointer items-center border-b-2 py-0.5 pb-1 text-slate-700 transition-colors duration-500 ease-in-out hover:text-slate-500 w-full">
        <p class="px-2 text-[0.7rem] font-semibold uppercase tracking-wider text-slate-500">
          {t("workspace.palette.inputElements")}
        </p>
      </header>
      <div class="w-full overflow-y-scroll px-1.5 transition-all duration-200 ease-in">
        {INPUTS_PALETTE.map((inputField) => (
          <button
            draggable
            onDragStart={(event) =>
              onDragStart(event as DragEvent, inputField.type)
            }
            className="px-4 py-1.5 from-mirage-600/20 to-mirage-600/10 hover:shadow-primary-950/50 shadow-cod-800/20 relative mb-1.5 flex w-full -translate-x-px items-center overflow-hidden rounded-md border border-slate-950 bg-transparent from-10% text-sm shadow-2xs transition-transform duration-300 ease-out first:mt-2 hover:translate-x-0.75 hover:border-slate-900/40 hover:bg-linear-to-tl hover:shadow focus:outline-hidden *:text-slate-400"
          >
            <div class="group mb-0.5 flex w-full flex-col items-start pr-0 text-inherit text-left">
              <p class="line-clamp-1 pb-0.5 text-base leading-4 group-hover:text-slate-400">
                {inputField.label}
              </p>
              <p class="mb-0.5 w-full pr-6 leading-4">
                {inputField.description}
              </p>
            </div>
            <Icon
              icon={inputField.icon}
              className="hover:text-primary-350! absolute right-2 ml-auto h-8 w-8 rounded border border-transparent p-1 transition-colors duration-300 group-hover:text-primary-300! text-slate-700"
            />
          </button>
        ))}
      </div>
      <header
        class={`hover:border-primary-350 border-mirage-400 flex cursor-pointer items-center border-b-2 py-0.5 pb-1 text-slate-700 transition-colors duration-500 ease-in-out hover:text-slate-500 w-full`}
      >
        <p class="px-2 text-[0.7rem] font-semibold uppercase tracking-wider text-slate-500">
          {t("workspace.palette.displayElements")}
        </p>
      </header>
      <div class="w-full overflow-y-scroll px-1.5 transition-all duration-200 ease-in">
        {DISPLAY_ELEMENTS.map((inputField) => (
          <button
            draggable
            onDragStart={(event) =>
              onDragStart(event as DragEvent, inputField.type)
            }
            className="px-4 py-1.5 from-mirage-600/20 to-mirage-600/10 hover:shadow-primary-950/50 shadow-cod-800/20 relative mb-1.5 flex w-full -translate-x-px items-center overflow-hidden rounded-md border border-slate-950 bg-transparent from-10% text-sm shadow-2xs transition-transform duration-300 ease-out first:mt-2 hover:translate-x-0.75 hover:border-slate-900/40 hover:bg-linear-to-tl hover:shadow focus:outline-hidden *:text-slate-400"
          >
            <div class="group mb-0.5 flex w-full flex-col items-start pr-0 text-inherit text-left">
              <p class="line-clamp-1 pb-0.5 text-base leading-4 group-hover:text-slate-400">
                {inputField.label}
              </p>
              <p class="mb-0.5 w-full pr-6 leading-4">
                {inputField.description}
              </p>
            </div>
            <Icon
              icon={inputField.icon}
              className="hover:text-primary-350! absolute right-2 ml-auto h-8 w-8 rounded border border-transparent p-1 transition-colors duration-300 group-hover:text-primary-300! text-slate-700"
            />
          </button>
        ))}
      </div>
    </aside>
  );
}
