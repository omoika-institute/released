import { DropdownInput } from "../elements/DropdownInput";
import { TextInput } from "../elements/TextInput";
import { UploadFileInput } from "../elements/FileInput";
import { Title } from "../elements/Title";
import { TextArea } from "../elements/TextArea";
import { Text } from "../elements/Text";
import { CopyElement } from "../elements/CopyText";
import { memo, useState } from "preact/compat";
import { NodeInputProps } from "@/types/graph";
import MarkdownEditor from "@/components/editor/Markdown";
import { toSnakeCase } from "../utils";
import { usePropertiesStore } from "@/stores";
import { useParams } from "react-router-dom";
import { useReactFlow } from "@xyflow/react";
import Url from "../elements/Url";

interface ElementProps {
  id: string;
  element: NodeInputProps;
  key: string;
  data: any;
}

interface MarkdownElementProps {
  id: string;
  label: string;
  value: string;
  data: any;
}

function syncPropertiesTab(entityId: string, nextData: Record<string, any>) {
  try {
    const store = usePropertiesStore.getState();
    const tab = store.tabs.find((t) => t.entityId === entityId);
    if (!tab) return;

    const currStr = JSON.stringify(tab.data ?? {});
    const nextStr = JSON.stringify(nextData);
    if (currStr !== nextStr) store.setData(entityId, nextData);
  } catch (_) {}
}

function MarkdownElement({
  id,
  label,
  value: initValue,
  data,
}: MarkdownElementProps) {
  const [value, setValue] = useState(initValue);
  const { hid } = useParams();
  const { updateNodeData } = useReactFlow();

  const updateLocalData = (nextValue: string) => {
    const key = toSnakeCase(label);
    const nextData = {
      ...data,
      [key]: nextValue,
      __markdown: nextValue,
    };

    updateNodeData(id, nextData);
    syncPropertiesTab(id, nextData);
    return nextData;
  };

  return (
    <div className="flex w-full min-w-82 flex-col gap-1">
      <label className="nodrag font-display text-[0.5rem] font-medium uppercase tracking-[0.22em] text-terminal-txt">
        {label}
      </label>
      <MarkdownEditor
        value={value}
        setValue={(nextValue) => {
          setValue(nextValue);
          updateLocalData(nextValue);
        }}
        onBlur={async (nextValue) => {
          const nextData = updateLocalData(nextValue);

          try {
            await window.api.graph.updateEntity({
              graphId: hid as string,
              entityId: id,
              updates: {
                data: nextData,
              },
            });
          } catch (error) {
            console.error("Failed to update markdown entity:", error);
          }
        }}
        className="nodrag nowheel h-56 min-h-40 max-h-[70vh] w-full min-w-72 max-w-[80vw] resize overflow-hidden border border-subtle/50 bg-paper px-2 py-2 text-xs text-primary-txt transition-colors hover:border-review-border/25 hover:bg-panel focus-within:border-review-border/45!"
      />
    </div>
  );
}

export function Element({ id, element, key, data }: ElementProps) {
  const { label, value, icon, options = [], accept } = element;
  const dropdownOptions = options.map((option) =>
    typeof option === "string"
      ? { label: option, value: option, tooltip: "" }
      : { ...option, tooltip: option.tooltip ?? "" },
  );
  switch (element.type) {
    case "dropdown":
      return (
        <DropdownInput
          key={key}
          id={id}
          options={dropdownOptions}
          label={label}
          value={value ?? ""}
          data={data}
        />
      );
    case "text":
      return (
        <TextInput
          data={data}
          key={key}
          id={id}
          label={label}
          value={value ?? ""}
          icon={icon ?? "ballpen"}
        />
      );
    case "upload":
      return (
        <UploadFileInput
          key={key}
          id={id}
          label={label}
          value={value ?? ""}
          icon={icon ?? "file-upload"}
          accept={accept}
        />
      );
    case "title":
      return <Title key={key} id={id} label={label} value={value || ""} />;
    case "section":
      return (
        <Text
          key={key}
          id={id}
          label={element?.label}
          value={element?.value || ""}
        />
      );
    case "textarea":
      return (
        <TextArea
          data={data}
          key={key}
          id={id}
          label={label}
          value={value || ""}
        />
      );
    case "md":
    case "markdown":
      return (
        <MarkdownElement
          data={data}
          key={key}
          id={id}
          label={label}
          value={value || ""}
        />
      );
    case "copy-text":
      return (
        <CopyElement key={key} id={id} label={label} value={value || ""} />
      );
    case "url":
      return (
        <Url key={key} id={id} label={label} value={value || ""} />
      );
    case "empty":
      return <input className="pointer-events-none h-0 bg-transparent" />;
  }
}

export default memo(Element);
