import { Icon } from "@/components/icons";
import { memo, useState } from "preact/compat";
import { toSnakeCase } from "../utils";
import { usePropertiesStore } from "@/stores";
import { useParams } from "react-router-dom";
import { useReactFlow } from "@xyflow/react";

interface TextAreaElement {
  id: string;
  label: string;
  value: string;
  data: any;
}

export function TextArea({
  id,
  label,
  value: initValue,
  data,
}: TextAreaElement) {
  const [value, setValue] = useState(initValue);
  const [showMonospace, setShowMonospace] = useState(true);
  const { hid } = useParams();
  const { updateNodeData } = useReactFlow();

  return (
    <div className="flex w-full flex-col">
      <label
        title="Click to toggle the displayed font"
        onClick={() => setShowMonospace(!showMonospace)}
        className="font-display flex items-center justify-between text-[0.5rem] font-medium uppercase tracking-[0.22em] text-terminal-txt/60"
      >
        {label}
        <Icon
          icon={showMonospace ? "brackets-angle" : "brackets-angle-off"}
          className="h-3.5 w-3.5 text-primary-txt/45 hover:text-review-border"
        />
      </label>
      <div className="w-full border border-subtle/50 bg-paper transition-colors hover:border-review-border/25 hover:bg-panel focus-within:!border-review-border/45 focus-within:bg-panel">
        <textarea
          rows={4}
          spellcheck={false}
          className={`nodrag nowheel order block w-full bg-transparent px-2 py-1 text-xs leading-5 text-primary-txt shadow-sm outline-hidden transition-colors duration-150 ease-in-out placeholder:text-terminal-txt/45 focus:outline-hidden sm:text-xs ${showMonospace && "!font-code"}`}
          value={value}
          onChange={(event) => {
            const nextValue = event.currentTarget.value;
            setValue(nextValue);
            const key = toSnakeCase(label);
            const nextData = { ...data, [key]: nextValue };
            updateNodeData(id, nextData);
            try {
              const st = usePropertiesStore.getState();
              const tab = st.tabs.find((t) => t.entityId === id);
              if (tab) {
                const currStr = JSON.stringify(tab.data ?? {});
                const nextStr = JSON.stringify(nextData);
                if (currStr !== nextStr) st.setData(id, nextData);
              }
            } catch (_) {}
          }}
          onBlur={async () => {
            const key = toSnakeCase(label);
            const nextData = { ...data, [key]: value };

            // Update local node data immediately (optimistic update)
            updateNodeData(id, nextData);

            // keep properties preview in sync if open
            try {
              const st = usePropertiesStore.getState();
              const tab = st.tabs.find((t) => t.entityId === id);
              if (tab) {
                const currStr = JSON.stringify(tab.data ?? {});
                const nextStr = JSON.stringify(nextData);
                if (currStr !== nextStr) st.setData(id, nextData);
              }
            } catch (_) {}

            // Persist to database
            try {
              await window.api.graph.updateEntity({
                graphId: hid as string,
                entityId: id,
                updates: {
                  data: nextData,
                },
              });
            } catch (error) {
              console.error("Failed to update entity:", error);
            }
          }}
        />
      </div>
    </div>
  );
}

export default memo(TextArea);
