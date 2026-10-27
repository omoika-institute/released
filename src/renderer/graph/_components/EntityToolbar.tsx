import { Icon } from "@/components/icons";
import { NodeToolbar, Position } from "@xyflow/react";
import { useAttachmentsStore, usePropertiesStore } from "@/stores";
import { useTranslation } from "react-i18next";

interface Props {
  entityId: string;
  entityTitle: string;
  properties?: JSONObject;
  disabled?: boolean;
}

export default function EntityToolbar({
  entityId,
  entityTitle,
  properties,
  disabled = false,
}: Props) {
  const { t } = useTranslation();
  const { addTab } = useAttachmentsStore();
  const props = usePropertiesStore();

  return (
    <NodeToolbar position={Position.Top} class="pointer-events-none">
      <div className="relative flex gap-x-2 pointer-events-auto">
        <button
          title={t("graph.entityToolbar.openProperties")}
          disabled={disabled}
          onClick={() => props.openWith(entityId, entityTitle, properties)}
          class="bg-slate-925/25 hover:border-primary-350 hover:text-primary-350 relative top-3 flex h-8 w-8 items-center justify-center rounded-full border-2 border-slate-900 p-px text-slate-600 transition-colors duration-75 ease-in hover:bg-slate-950 pointer-events-auto group disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:border-slate-900 disabled:hover:bg-slate-925/25 disabled:hover:text-slate-600"
        >
          <Icon
            icon="file-code"
            className="m-1 h-4.5 w-4.5 opacity-50 group-hover:opacity-100"
          />
        </button>
        <button
          title={t("graph.entityToolbar.openComments")}
          disabled={disabled}
          class="bg-slate-925/25 hover:border-primary-350 hover:text-primary-350 relative flex h-8 w-8 items-center justify-center rounded-full border-2 border-slate-900 p-px text-slate-600 transition-colors duration-200 ease-in hover:bg-slate-950 pointer-events-auto group disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:border-slate-900 disabled:hover:bg-slate-925/25 disabled:hover:text-slate-600"
        >
          <Icon
            icon="message"
            className="m-1 h-4.5 w-4.5 opacity-50 group-hover:opacity-100"
          />
        </button>
        <button
          title={t("graph.entityToolbar.openAttachments")}
          disabled={disabled}
          onClick={() => addTab(entityId, entityTitle)}
          class="bg-slate-925/25 hover:border-primary-350 hover:text-primary-350 relative top-3 flex h-8 w-8 items-center justify-center rounded-full border-2 border-slate-900 p-px text-slate-600 transition-colors duration-200 ease-in hover:bg-slate-950 pointer-events-auto group disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:border-slate-900 disabled:hover:bg-slate-925/25 disabled:hover:text-slate-600"
        >
          <Icon
            icon="note"
            className="m-1 h-4.5 w-4.5 opacity-50 group-hover:opacity-100"
          />
        </button>
      </div>
    </NodeToolbar>
  );
}
