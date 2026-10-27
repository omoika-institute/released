import { Graph, CaseActivityItem, casesApi, ChordNode, ChordLink } from "@/api";
import { useGraphStore, useCasesStore } from "@/stores";
import { ChamferFrame } from "@/components/ChamferFrame";
import { Icon } from "@/components/icons";
import type { ComponentChildren } from "preact";
import {
  Dispatch,
  StateUpdater,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "preact/hooks";
import { useParams } from "react-router-dom";
import { toast } from "react-toastify";
import ActivityGrid from "@/components/charts/ActivityGrid";
import ChordDiagram from "@/components/charts/ChordDiagram";
import RotationControl from "@/components/charts/RotationControl";
import { buildFullYearMap, formatDate } from "@/components/utils";
import { XYPosition } from "@xyflow/react";
import MarkdownEditor from "@/components/editor/Markdown";
import { Button } from "@/components/buttons/Button";

// ---------------------------------------------------------------------------
// Overview-style panel
// ---------------------------------------------------------------------------

function DetailsPanel({
  title,
  action,
  children,
  className = "",
  bodyClassName = "",
}: {
  title: ComponentChildren;
  action?: ComponentChildren;
  children: ComponentChildren;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section
      className={`relative min-h-0 overflow-hidden rounded-md border border-ink-hard/12 bg-paper/40 shadow-lg ${className}`}
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,#0515C212,transparent_30%)]" />
      <ChamferFrame colorClass="bg-ink-hard/20" />
      <div className="relative flex min-h-12 items-center justify-between gap-4 border-b border-ink/8 px-5 py-3">
        <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-ink-soft">
          {title}
        </p>
        {action}
      </div>
      <div
        className={`relative flex min-h-0 flex-1 flex-col overflow-hidden ${bodyClassName}`}
      >
        {children}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Stat card
// ---------------------------------------------------------------------------

function SimpleStatCard({
  value,
  label,
}: {
  value?: number | null;
  label: string;
}) {
  return (
    <div className="rounded-sm border border-dashed border-ink/10 bg-[rgb(4,6,12)] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.025)]">
      <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-ink-soft">
        {label}
      </p>
      <div className="mt-3 font-mono text-4xl font-medium leading-none tracking-[-0.08em] text-ink">
        {value ?? 0}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Activity feed
// ---------------------------------------------------------------------------

function CaseActivityPanel({ graphId }: { graphId: string }) {
  const [events, setEvents] = useState<CaseActivityItem[]>([]);
  const [skip, setSkip] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const limit = 10;

  const colorByCategory: Record<string, string> = useMemo(
    () => ({
      entity: "from-emerald-400/70 to-emerald-200/70",
      edge: "from-amber-300/70 to-amber-200/70",
      default: "from-sea/70 to-blue-200/70",
    }),
    []
  );

  const iconByEvent = useMemo(
    () => ({
      "entity:create": "plus",
      "entity:update": "pencil",
      "entity:delete": "trash",
      "edge:create": "link",
      "edge:update": "link",
      "edge:delete": "link-off",
    }),
    []
  );

  const titleByEvent = (e: CaseActivityItem) =>
    `${e.category.charAt(0).toUpperCase()}${e.category.slice(1)} ${e.event_type}`;

  const formatTime = (iso: string) =>
    new Date(iso).toLocaleString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      month: "short",
      day: "2-digit",
    });

  const describe = (e: CaseActivityItem) => {
    try {
      if (e.category === "entity") {
        const label = e.payload?.data?.label;
        return label ? `Entity: ${label}` : `Entity ${e.event_type}`;
      }
      if (e.category === "edge") {
        const src = e.payload?.source;
        const dst = e.payload?.target;
        return src && dst ? `Link ${src} → ${dst}` : `Edge ${e.event_type}`;
      }
    } catch {}
    return `${e.category}:${e.event_type}`;
  };

  const loadMore = async () => {
    if (loading || !hasMore) return;
    setLoading(true);
    try {
      const page = await casesApi.activity(graphId, { skip, limit });
      const newEvents = page.events ?? [];
      setEvents((prev) => [...prev, ...newEvents]);
      setSkip(skip + newEvents.length);
      if (newEvents.length < limit) setHasMore(false);
    } catch {
      setHasMore(false);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setEvents([]);
    setSkip(0);
    setHasMore(true);
    setLoading(false);
    loadMore();
  }, [graphId]);

  const listRef = useRef<HTMLOListElement>(null);
  const onScroll = (e: Event) => {
    const el = e.currentTarget as HTMLOListElement;
    if (!el) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 16) loadMore();
  };

  return (
    <ol
      ref={listRef}
      onScroll={onScroll as any}
      className="relative max-h-64 overflow-y-auto px-5 py-4"
    >
      {events.map((e) => {
        const key = `${e.category}:${e.event_type}`;
        const icon = iconByEvent[key as keyof typeof iconByEvent] ?? "dots";
        const ring = colorByCategory[e.category] ?? colorByCategory["default"];
        const actorRaw =
          e.payload?.actor?.name ??
          e.actor_name ??
          (e.actor_id != null ? String(e.actor_id) : "omoika");
        const actorName =
          typeof actorRaw === "string"
            ? actorRaw
            : actorRaw != null
              ? String(actorRaw)
              : "";

        return (
          <li
            key={e.seq}
            className="ml-11 border-b border-dashed border-ink/8 py-3 last:border-b-0"
          >
            <span
              className={`absolute left-5 flex h-8 w-8 items-center justify-center rounded-sm bg-radial-[at_10%_65%] from-65% ring-6 ring-ink/10 ${ring}`}
            >
              <Icon icon={icon} className="h-4 w-4 text-black/80" />
            </span>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-medium uppercase tracking-[-0.02em] text-ink">
                {titleByEvent(e)}
              </h3>
              <time className="ml-auto font-mono text-[10px] uppercase tracking-[0.18em] text-ink-hard/50">
                {formatTime(e.recorded_at)}
              </time>
            </div>
            <p className="mt-1 text-sm text-ink-soft">{describe(e)}</p>
            <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-hard/50">
              by <span className="text-ink-soft">{actorName || "unknown"}</span>
            </p>
          </li>
        );
      })}
      {loading && (
        <li className="ml-11 py-3 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-hard/50">
          Loading…
        </li>
      )}
      {!loading && !hasMore && events.length === 0 && (
        <li className="ml-11 py-3 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-hard/50">
          No activity yet.
        </li>
      )}
    </ol>
  );
}

// ---------------------------------------------------------------------------
// Context / details panel
// ---------------------------------------------------------------------------

function CaseContextPanel({ graph }: { graph: Graph }) {
  const { updateCase, isUpdating } = useCasesStore();
  const { getGraph, vertices_count, edges_count } = useGraphStore();

  const [editing, setEditing] = useState<null | "label" | "description">(null);
  const [labelVal, setLabelVal] = useState<string>("");
  const [descVal, setDescVal] = useState<string>(graph?.description ?? "");
  const [saving, setSaving] = useState(false);
  const labelRef = useRef<HTMLTextAreaElement>(null);
  const descRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setEditing(null);
    setLabelVal("");
    setDescVal("");
  }, [graph?.id]);

  const autosize = (el: HTMLDivElement | HTMLTextAreaElement | null) => {
    if (!el) return;
    el.style.height = "0px";
    el.style.height = Math.min(Math.max(el.scrollHeight, 24), 300) + "px";
  };

  const beginEdit = (field: "label" | "description") => {
    if (!graph) return;
    setEditing(field);
    if (field === "label") {
      setLabelVal(graph.label ?? "");
      requestAnimationFrame(() => {
        autosize(labelRef.current);
        labelRef.current?.focus();
        labelRef.current?.select();
      });
    } else {
      setDescVal(graph.description ?? "");
      requestAnimationFrame(() => {
        autosize(descRef.current);
        descRef.current?.focus();
      });
    }
  };

  const cancelEdit = () => {
    setEditing(null);
    setLabelVal("");
    setDescVal("");
  };

  const commitEdit = async (nextDesc?: string | FocusEvent) => {
    if (!graph || saving) return;
    const newLabel = editing === "label" ? labelVal.trim() : graph.label;
    const resolvedDesc = typeof nextDesc === "string" ? nextDesc : descVal;
    const newDesc =
      editing === "description"
        ? resolvedDesc.trim()
        : (graph.description ?? "");
    const changed =
      newLabel !== graph.label || newDesc !== (graph.description ?? "");
    if (!changed) {
      cancelEdit();
      return;
    }
    try {
      setSaving(true);
      await updateCase({ id: graph.id, label: newLabel, description: newDesc });
      getGraph(graph.id);
      toast.success("Case details updated.");
    } catch {
      toast.error("Failed to update case!");
    } finally {
      setSaving(false);
      cancelEdit();
    }
  };

  const handleDescCommit = (nextDesc: string) => {
    setDescVal(nextDesc);
    void commitEdit(nextDesc);
  };

  return (
    <DetailsPanel title="Case details" className="flex h-full flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        <div className="flex flex-wrap items-center gap-3 font-mono text-[10px] uppercase tracking-[0.24em] text-ink-soft">
          <span>Case record</span>
          <span className="h-1 w-1 rounded-full bg-sea" />
          <span>{graph?.ctime ? formatDate(graph.ctime) : "No date"}</span>
          <span className="h-1 w-1 rounded-full bg-sea" />
          <span>{graph?.id?.slice(0, 8) ?? "No id"}</span>
        </div>

        <div className="mt-5">
          {editing === "label" ? (
            <textarea
              ref={labelRef}
              value={labelVal}
              onInput={(e: any) => {
                setLabelVal(e.currentTarget.value);
                autosize(labelRef.current);
              }}
              onKeyDown={(e: any) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  (e.currentTarget as HTMLTextAreaElement).blur();
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  cancelEdit();
                }
              }}
              onBlur={commitEdit}
              rows={1}
              disabled={saving || isUpdating}
              className="w-full resize-none border-0 border-b border-sea/35 bg-transparent px-0 py-1 text-3xl font-medium uppercase tracking-tight text-ink outline-none focus:border-sea focus:ring-0"
              placeholder="Enter case title"
            />
          ) : (
            <button
              type="button"
              className="block w-full min-w-0 text-left"
              onDblClick={() => beginEdit("label")}
              onClick={() => beginEdit("label")}
              title="Click to edit title"
            >
              <h2 className="truncate text-3xl font-medium uppercase tracking-tight text-ink">
                {graph?.label}
              </h2>
            </button>
          )}
        </div>

        <div className="mt-6 border-t border-dashed border-ink/10 pt-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-ink-soft">
              Description
            </p>
            {editing !== "description" && (
              <button
                type="button"
                onClick={() => beginEdit("description")}
                className="rounded-sm border border-ink/10 bg-ink/3 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.2em] text-ink-soft transition-colors hover:border-sea/35 hover:text-sea"
              >
                Edit
              </button>
            )}
          </div>

          {graph?.description || editing === "description" ? (
            <div className="min-h-72 overflow-hidden rounded-sm border border-ink/10 bg-black/20">
              <MarkdownEditor
                className="h-full"
                onCancel={cancelEdit}
                onBlur={handleDescCommit}
                value={graph.description}
                setValue={setDescVal}
                onFocus={() => setEditing("description")}
              />
            </div>
          ) : (
            <button
              type="button"
              className="w-full rounded-sm border border-dashed border-ink/12 bg-ink/3 px-4 py-8 text-left text-sm text-ink-soft transition-colors hover:border-sea/30 hover:text-ink"
              onClick={() => beginEdit("description")}
              title="Click to add description"
            >
              No description. Click to add Markdown.
            </button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="border-t border-ink/8 p-5">
        <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.28em] text-ink-soft">
          Case Statistics
        </p>
        <div className="grid grid-cols-2 gap-2">
          <SimpleStatCard value={vertices_count} label="Entities" />
          <SimpleStatCard value={edges_count} label="Edges" />
        </div>
      </div>
    </DetailsPanel>
  );
}

// ---------------------------------------------------------------------------
// Tabbed activity panel
// ---------------------------------------------------------------------------

function TabbedActivityPanel({
  activityData,
  graphId,
}: {
  activityData: Record<string, number>;
  graphId: string;
}) {
  const [activeTab, setActiveTab] = useState<"overview" | "activity">(
    "overview"
  );

  return (
    <DetailsPanel
      title="Case activity"
      className="flex min-h-0 flex-col"
      bodyClassName="bg-[rgb(4,6,12)]"
    >
      <div className="flex border-b border-ink/8">
        {(
          [
            { id: "overview", label: "Events Overview" },
            { id: "activity", label: "Recent Activity" },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`px-5 py-3 font-mono text-[10px] uppercase tracking-[0.28em] transition-colors ${
              activeTab === tab.id
                ? "border-b-2 border-sea text-ink"
                : "text-ink-hard/40 hover:text-ink-hard/60"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "overview" && (
        <ActivityGrid data={activityData} showHeader={false} />
      )}
      {activeTab === "activity" && <CaseActivityPanel graphId={graphId} />}
    </DetailsPanel>
  );
}

// ---------------------------------------------------------------------------
// Chord diagram panel
// ---------------------------------------------------------------------------

interface ChordDiagramPanelProps {
  resetView: () => void;
  chordNodes: ChordNode[];
  chordLinks: ChordLink[];
  chordZoom: number;
  chordPan: XYPosition;
  chordRotation: number;
  setChordRotation: Dispatch<StateUpdater<number>>;
}

function ChordDiagramPanel({
  resetView,
  chordNodes,
  chordLinks,
  chordZoom,
  chordPan,
  chordRotation,
  setChordRotation,
}: ChordDiagramPanelProps) {
  return (
    <DetailsPanel
      title="Entity types // Relationships"
      className="flex h-full min-w-0 flex-col"
      bodyClassName="bg-[rgb(4,6,12)]"
      action={
        <div className="flex items-center gap-2">
          <RotationControl
            rotation={chordRotation}
            onRotationChange={setChordRotation}
          />
          <Button
            type="button"
            onClick={resetView}
            className="h-8 px-0"
            title="Reset view"
          >
            <Icon icon="viewport-wide" className="h-3.5 w-3.5" />
          </Button>
        </div>
      }
    >
      <div className="relative h-full min-h-0 w-full min-w-0 overflow-hidden">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,#0515C212,transparent_34%)]" />
        <div className="pointer-events-none absolute inset-x-5 top-4 h-px bg-sea/40" />

        <div className="group absolute bottom-3 right-3 z-10 flex items-center rounded-sm border border-ink/10 bg-black/35 px-1.5 py-1 text-xs text-ink-hard/50 transition-all">
          <Icon icon="help" className="h-3.5 w-3.5" />
          <span className="h-4 w-px overflow-hidden text-nowrap text-transparent transition-all duration-150 group-hover:w-40 group-hover:pl-1.5 group-hover:text-ink-soft">
            Scroll to zoom, drag to pan.
          </span>
        </div>

        <ChordDiagram
          width={260}
          height={196}
          nodes={chordNodes}
          links={chordLinks}
          scale={chordZoom}
          panX={chordPan.x}
          panY={chordPan.y}
          rotation={chordRotation}
        />
      </div>
    </DetailsPanel>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function GraphDetails() {
  const { hid = "" } = useParams();
  const { getGraph, graph } = useGraphStore();

  useEffect(() => getGraph(hid), [hid]);

  const [activityData, setActivityData] = useState<Record<string, number>>({});
  useEffect(() => {
    let cancelled = false;
    setActivityData({});
    if (!hid) return;

    casesApi
      .activitySummary(hid, 365)
      .then((res) => {
        if (cancelled) return;
        const map = buildFullYearMap();
        for (const b of res.buckets ?? []) {
          map[b.date] = b.count ?? 0;
        }
        setActivityData(map);
      })
      .catch(() => !cancelled && setActivityData({}));

    return () => {
      cancelled = true;
    };
  }, [hid]);

  const [chordNodes, setChordNodes] = useState<ChordNode[]>([]);
  const [chordLinks, setChordLinks] = useState<ChordLink[]>([]);
  useEffect(() => {
    let cancelled = false;
    setChordNodes([]);
    setChordLinks([]);
    if (!hid) return;

    casesApi
      .chord(hid)
      .then((res) => {
        if (cancelled) return;
        setChordNodes(res.nodes || []);
        setChordLinks(res.links || []);
      })
      .catch(() => {
        if (!cancelled) {
          setChordNodes([]);
          setChordLinks([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [hid]);

  const [chordZoom, setChordZoom] = useState(1);
  const [chordPan, setChordPan] = useState<XYPosition>({ x: 0, y: 0 });
  const [chordRotation, setChordRotation] = useState(0);
  const chordContainerRef = useRef<HTMLDivElement>(null);

  const resetView = () => {
    setChordZoom(1);
    setChordPan({ x: 0, y: 0 });
    setChordRotation(0);
  };

  useEffect(() => {
    const container = chordContainerRef.current;
    if (!container) return;
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.1 : 0.1;
      setChordZoom((z) =>
        Math.min(2, Math.max(0.2, Number((z + delta).toFixed(2))))
      );
    };
    container.addEventListener("wheel", handleWheel, { passive: false });
    return () => container.removeEventListener("wheel", handleWheel);
  }, []);

  return (
    <div className="relative isolate flex h-screen min-h-0 flex-col overflow-hidden bg-cod-950 text-ink">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.025)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.025)_1px,transparent_1px)] bg-size-[56px_56px] opacity-35" />
      <div className="pointer-events-none absolute inset-x-[16%] top-14 h-48 rounded-full bg-[radial-gradient(circle,rgba(39,67,149,0.24),transparent_68%)] blur-3xl" />
      <div className="pointer-events-none absolute inset-x-[36%] bottom-4 h-36 rounded-full bg-[radial-gradient(circle,rgba(47,211,190,0.08),transparent_70%)] blur-3xl" />

      {/* Content */}
      <div className="relative z-10 flex min-h-0 flex-1 flex-col gap-3 overflow-hidden p-6 pt-14 sm:px-4">
        <div className="flex min-h-0 flex-1 gap-6 overflow-hidden">
          {/* Left column — scrolls internally */}
          <div className="w-164 shrink-0 overflow-y-auto">
            <CaseContextPanel graph={graph as Graph} />
          </div>
          <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-6 overflow-y-auto pr-1">
            <TabbedActivityPanel activityData={activityData} graphId={hid} />

            <div
              ref={chordContainerRef}
              className="flex-1 min-h-0 min-w-0 max-w-full overflow-hidden"
            >
              <ChordDiagramPanel
                resetView={resetView}
                chordLinks={chordLinks}
                chordNodes={chordNodes}
                chordPan={chordPan}
                chordRotation={chordRotation}
                setChordRotation={setChordRotation}
                chordZoom={chordZoom}
              />
            </div>
          </div>
          {/* Right column — scrolls internally */}
        </div>
      </div>
    </div>
  );
}
