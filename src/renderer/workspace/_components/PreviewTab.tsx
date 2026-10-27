import { useEffect, useMemo } from "preact/hooks";
import { useTranslation } from "react-i18next";
import { Icon } from "@/components/icons";
import EntityFormRenderer from "@/components/editor/EntityFormRenderer";
import {
  Background,
  BackgroundVariant,
  type Node,
  ReactFlow,
  useEdgesState,
  useNodesState,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { ViewEntityNode } from "@/renderer/graph/_components/EntityViewNode";
import { toSnakeCase } from "@/renderer/graph/utils";
import type { BuilderElement } from "./LayoutCanvas";

type EntityMeta = {
  label: string;
  color: string;
  icon: string;
  description?: string;
  authors?: Array<{ id: string; name: string }>;
};

interface PreviewTabProps {
  meta: EntityMeta;
  elements: Array<any | any[]>;
}

export default function PreviewTab({ meta, elements }: PreviewTabProps) {
  const { t } = useTranslation();
  const blueprint = useMemo(
    () => ({
      label: meta.label || t("workspace.previewTab.entity"),
      color: meta.color,
      icon: meta.icon,
      elements,
    }),
    [meta, elements, t]
  );

  const primaryLabel = useMemo(() => {
    if (!elements.length) return "";
    const first = elements[0];
    if (Array.isArray(first)) {
      return first[0]?.label || "";
    }
    return first?.label || "";
  }, [elements]);

  const sampleData = useMemo(() => {
    const label = primaryLabel || t("workspace.previewTab.preview");
    const key = toSnakeCase(label);
    return {
      label: meta.label || t("workspace.previewTab.entity"),
      [key]: label,
    };
  }, [meta.label, primaryLabel, t]);

  const initialFormNodes = useMemo<Node[]>(
    () => [
      {
        id: "form-preview-node",
        type: "formPreview",
        position: { x: 0, y: 0 },
        data: {},
      },
    ],
    []
  );

  const initialViewNodes = useMemo<Node[]>(
    () => [
      {
        id: "preview-node",
        type: "entityPreview",
        position: { x: 0, y: 0 },
        data: sampleData,
      },
    ],
    [sampleData]
  );

  const [formNodes, setFormNodes, onFormNodesChange] =
    useNodesState(initialFormNodes);
  const [formEdges, _setFormEdges, onFormEdgesChange] = useEdgesState([]);
  const [viewNodes, setViewNodes, onViewNodesChange] =
    useNodesState(initialViewNodes);
  const [viewEdges, _setViewEdges, onViewEdgesChange] = useEdgesState([]);

  useEffect(() => {
    setFormNodes(initialFormNodes);
  }, [initialFormNodes, setFormNodes]);

  useEffect(() => {
    setViewNodes(initialViewNodes);
  }, [initialViewNodes, setViewNodes]);

  const formNodeTypes = useMemo(
    () => ({
      formPreview: () => (
        <div className="scale-100">
          <EntityFormPreview meta={meta} elements={elements} />
        </div>
      ),
    }),
    [meta, elements]
  );

  const viewNodeTypes = useMemo(
    () => ({
      entityPreview: (node) => (
        <ViewEntityNode ctx={node} blueprint={blueprint} />
      ),
    }),
    [blueprint]
  );

  return (
    <section className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="relative flex min-h-0 flex-1 overflow-hidden rounded-md">
        <div className="relative z-10 h-full w-full border border-black/10 bg-linear-to-tr from-black/40 to-black/50 shadow-2xl shadow-black/25 backdrop-blur-md">
          <ReactFlow
            className="h-full w-full"
            nodes={formNodes}
            edges={formEdges}
            nodeTypes={formNodeTypes}
            onNodesChange={onFormNodesChange}
            onEdgesChange={onFormEdgesChange}
            fitView
            fitViewOptions={{ padding: 0.4 }}
            zoomOnScroll
            zoomOnPinch
            panOnDrag
            minZoom={0.2}
            maxZoom={1.8}
            proOptions={{ hideAttribution: true }}
          >
            <Background
              color="#5b609bee"
              bgColor="transparent"
              variant={BackgroundVariant.Dots}
            />
          </ReactFlow>
        </div>
      </div>
      <div className="relative flex min-h-0 flex-1 overflow-hidden rounded-md">
        <div className="relative z-10 h-full w-full border border-black/10 bg-linear-to-tr from-black/40 to-black/50 shadow-2xl shadow-black/25 backdrop-blur-md">
          <ReactFlow
            className="h-full w-full"
            nodes={viewNodes}
            edges={viewEdges}
            nodeTypes={viewNodeTypes}
            onNodesChange={onViewNodesChange}
            onEdgesChange={onViewEdgesChange}
            fitView
            fitViewOptions={{ padding: 0.4 }}
            zoomOnScroll
            zoomOnPinch
            panOnDrag
            minZoom={0.2}
            maxZoom={1.8}
            proOptions={{ hideAttribution: true }}
          >
            <Background
              color="#5b609bee"
              bgColor="transparent"
              variant={BackgroundVariant.Dots}
            />
          </ReactFlow>
        </div>
      </div>
    </section>
  );
}

function EntityFormPreview({
  meta,
  elements,
}: {
  meta: EntityMeta;
  elements: Array<any | any[]>;
}) {
  const { t } = useTranslation();

  return (
    <div className="node container w-full max-w-none">
      <div
        className="text-slate-350 flex h-full w-full items-center justify-between rounded-t-md px-1 py-2"
        style={{
          backgroundColor:
            meta.color?.length === 7 ? `${meta.color}99` : meta.color,
        }}
      >
        <Icon icon="grip-vertical" className="h-7 w-7" />
        <div className="flex w-full flex-col px-2 font-medium">
          <p className="font-display text-[0.4rem] font-light text-slate-200">
            {t("workspace.previewTab.preview")}
          </p>
          <p className="font-display text-[0.65rem] font-semibold text-slate-200">
            {meta.label || t("workspace.previewTab.entity")}
          </p>
        </div>
        <Icon icon={meta.icon || "shield-checkered"} className="mx-1 h-6 w-6" />
      </div>
      <EntityFormRenderer
        elements={elements}
        renderElement={(element, meta) => (
          <BuilderElementField
            key={meta.key}
            element={element as BuilderElement}
          />
        )}
      />
    </div>
  );
}

function BuilderElementField({ element }: { element: BuilderElement }) {
  const { t } = useTranslation();

  switch (element.type) {
    case "text":
      return (
        <div className="flex flex-col gap-1">
          <label className="font-display text-[0.55rem] text-slate-400">
            {element.label || t("workspace.previewTab.text")}
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
            {element.label || t("workspace.previewTab.textarea")}
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
