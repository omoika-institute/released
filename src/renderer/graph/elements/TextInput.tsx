import { Icon } from "@/components/icons";
import { NodeElementProps } from "@/types/graph";
import { ChangeEvent, memo, useState } from "preact/compat";
import { toSnakeCase } from "../utils";
import { usePropertiesStore } from "@/stores";
import { useParams } from "react-router-dom";
import { useReactFlow } from "@xyflow/react";

interface TextInputProps {
  id: string;
  label: string;
  icon: string;
  value: string;
  data: any;
}

export function TextInput({
  id,
  label,
  icon,
  value: initValue,
  data,
}: TextInputProps) {
  const [value, setValue] = useState(initValue);
  const { hid } = useParams();
  const { updateNodeData } = useReactFlow();

  return (
    <>
      <div className="flex flex-col">
        <label className="nodrag ml-0.5 mt-1 font-display text-[0.5rem] font-medium  tracking-wide text-terminal-txt/60 active:cursor-grabbing">
          {label}
        </label>
        <div className="node-field nodrag">
          <input
            id={`${id}-${label}`}
            type="text"
            onBlur={async () => {
              const key = toSnakeCase(label);
              const nextData = {
                ...data,
                [key]: value,
              };
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
            onChange={(event: ChangeEvent<HTMLInputElement>) => {
              const nextValue = event.currentTarget.value;
              setValue(nextValue);
              const key = toSnakeCase(label);
              const nextData = {
                ...data,
                [key]: nextValue,
              };
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
            value={value ?? initValue}
          />
          <Icon icon={icon || "ballpen"} />
        </div>
      </div>
    </>
  );
}

export default memo(TextInput);
