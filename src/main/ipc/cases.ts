import { titleCase, toSnakeCase } from "../utils";
import { exportShareLink, importShareLink } from "../app/share";
import { bindHandle } from "./handle";
import type { IpcContext } from "./types";

const PALETTE = [
  "#60a5fa", // sky-400
  "#a78bfa", // violet-400
  "#34d399", // emerald-400
  "#fbbf24", // amber-400
  "#f472b6", // pink-400
  "#22d3ee", // cyan-400
  "#818cf8", // indigo-400
  "#84cc16", // lime-500
  "#fb7185", // rose-400
  "#14b8a6", // teal-500
  "#f59e0b", // orange-500
  "#e879f9", // fuchsia-400
  "#94a3b8", // slate-400
  "#4ade80", // green-400
];

// Turn a string into a stable color.
// We hash the string (FNV-1a) and use the hash to choose a palette index.
// Same string -> same color, different strings -> mostly different colors.
// Reference: https://en.wikipedia.org/wiki/Fowler–Noll–Vo_hash_function
function colorForType(typeKey: string): string {
  let h = BigInt("1469598103934665603");
  const prime = BigInt("1099511628211");

  for (const c of Buffer.from(typeKey)) {
    h ^= BigInt(c);
    h = (h * prime) & BigInt("0xffffffffffffffff");
  }

  const idx = Number(h % BigInt(PALETTE.length));
  return PALETTE[idx];
}

export function registerCasesIpc({ app, database }: IpcContext) {
  bindHandle(
    "cases:list",
    async (_, payload: { skip: number; limit: number }) =>
      database.listCases(payload.skip, payload.limit),
  );

  bindHandle(
    "cases:create",
    async (_, payload: { label: string; description: string }) =>
      database.createCase(payload.label, payload.description),
  );

  bindHandle(
    "cases:export-share",
    async (
      _,
      payload: {
        kind: "graph" | "database";
        graphId?: string;
        signalingUrl?: string;
        accessCode?: string;
      },
    ) => exportShareLink(database.getDb(), payload),
  );

  bindHandle(
    "cases:import-share",
    async (_, payload: { url: string; preserveCaseIds?: boolean }) =>
      importShareLink(
        database.getDb(),
        (label, description) => database.createCase(label, description),
        payload,
      ),
  );

  bindHandle("cases:getById", async (_, uuid: string) =>
    database.getCaseById(uuid),
  );

  bindHandle(
    "cases:update",
    async (_, payload: { id: string; label: string; description: string }) =>
      database.updateCase(payload.id, payload.label, payload.description),
  );

  bindHandle("cases:delete", async (_, payload: { id: string }) =>
    database.deleteCase(payload.id),
  );

  bindHandle(
    "cases:favorite",
    async (_, payload: { graph_id: string; is_favorite: boolean }) =>
      database.favoriteCase(payload.graph_id, payload.is_favorite),
  );

  bindHandle(
    "cases:activity",
    async (_, payload: { graphId: string; skip: number; limit: number }) => {
      const db = database.getDb();
      const { graphId, skip, limit } = payload;

      // Query events for this graph from the events table
      const streamId = `entity:${graphId}`;
      const edgeStreamId = `edge:${graphId}`;

      const result = await db
        .prepare(
          `
SELECT
  seq, stream_id, event_type, payload, recorded_at, actor_id, correlation_id
FROM events
WHERE stream_id IN (?, ?)
ORDER BY seq DESC
LIMIT ? OFFSET ?
  `,
        )
        .all(streamId, edgeStreamId, limit, skip);

      const events = result.map((row: any) => {
        const payload = JSON.parse(row.payload);
        const category = row.stream_id.startsWith("entity:")
          ? "entity"
          : "edge";

        return {
          seq: row.seq,
          category,
          event_type: row.event_type,
          payload,
          recorded_at: row.recorded_at,
          actor_id: row.actor_id,
          correlation_id: row.correlation_id,
        };
      });

      return { events };
    },
  );

  bindHandle(
    "cases:activity-summary",
    async (_, payload: { graphId: string; days: number }) => {
      const db = database.getDb();
      const { graphId, days } = payload;

      const streamId = `entity:${graphId}`;
      const edgeStreamId = `edge:${graphId}`;

      // Calculate date range
      const end = new Date();
      const start = new Date();
      start.setDate(start.getDate() - days);

      // Query events grouped by date
      const result = await db
        .prepare(
          `
SELECT
  DATE(recorded_at) as date,
  COUNT(*) as count
FROM events
WHERE stream_id IN (?, ?)
  AND recorded_at >= ?
  AND recorded_at <= ?
GROUP BY DATE(recorded_at)
ORDER BY date ASC
  `,
        )
        .all(streamId, edgeStreamId, start.toISOString(), end.toISOString());

      const buckets = result.map((row: any) => ({
        date: row.date,
        count: Number(row.count),
      }));

      return {
        start: start.toISOString(),
        end: end.toISOString(),
        buckets,
      };
    },
  );

  bindHandle("cases:chord", async (_, payload: { graphId: string }) => {
    const db = database.getDb();
    const { graphId } = payload;

    /**
     * Aggregate edge counts by (src_type → dst_type)
     * while preserving human-readable labels.
     *
     * This matches the Rust SQL almost verbatim.
     */
    const rows = await db
      .prepare(
        `
SELECT
  COALESCE(
    json_extract(e_src.doc, '$.entity_type'),
    json_extract(e_src.doc, '$.data.label'),
    json_extract(e_src.doc, '$.label')
  ) AS src_type,
  COALESCE(
    json_extract(e_dst.doc, '$.entity_type'),
    json_extract(e_dst.doc, '$.data.label'),
    json_extract(e_dst.doc, '$.label')
  ) AS dst_type,
  COALESCE(
    json_extract(e_src.doc, '$.label'),
    json_extract(e_src.doc, '$.data.label'),
    json_extract(e_src.doc, '$.entity_type')
  ) AS src_label,
  COALESCE(
    json_extract(e_dst.doc, '$.label'),
    json_extract(e_dst.doc, '$.data.label'),
    json_extract(e_dst.doc, '$.entity_type')
  ) AS dst_label,
  COUNT(*) AS value
FROM edges_current ec
JOIN entities_current e_src
  ON e_src.entity_id = ec.src_id
  AND e_src.graph_id  = ec.graph_id
  AND e_src.sys_to IS NULL
JOIN entities_current e_dst
  ON e_dst.entity_id = ec.dst_id
  AND e_dst.graph_id  = ec.graph_id
  AND e_dst.sys_to IS NULL
WHERE ec.graph_id = ?
  AND ec.sys_to IS NULL
GROUP BY src_type, dst_type, src_label, dst_label
ORDER BY value DESC
        `,
      )
      .all(graphId);
    const links: Array<{ source: string; target: string; value: number }> = [];
    const nodeLabels = new Set<string>();
    const colorKeyForLabel = new Map<string, string>(); // label → normalized type key

    for (const r of rows) {
      const srcTypeRaw = r.src_type ?? "";
      const dstTypeRaw = r.dst_type ?? "";
      const srcLabelRaw = r.src_label ?? "";
      const dstLabelRaw = r.dst_label ?? "";

      const srcKey = srcTypeRaw ? toSnakeCase(srcTypeRaw) : "unknown";
      const dstKey = dstTypeRaw ? toSnakeCase(dstTypeRaw) : "unknown";

      const srcLabel = srcLabelRaw || titleCase(srcKey);
      const dstLabel = dstLabelRaw || titleCase(dstKey);

      const value = Number(r.value) || 0;
      if (value <= 0) continue;

      nodeLabels.add(srcLabel);
      nodeLabels.add(dstLabel);

      if (!colorKeyForLabel.has(srcLabel)) {
        colorKeyForLabel.set(srcLabel, srcKey);
      }
      if (!colorKeyForLabel.has(dstLabel)) {
        colorKeyForLabel.set(dstLabel, dstKey);
      }

      // Human labels are used as node IDs (same as Rust)
      links.push({
        source: srcLabel,
        target: dstLabel,
        value,
      });
    }

    if (links.length === 0) {
      return { nodes: [], links };
    }

    const nodes = Array.from(nodeLabels)
      .map((label) => {
        const key = colorKeyForLabel.get(label) ?? toSnakeCase(label);
        return {
          id: label,
          label,
          color: colorForType(key),
        };
      })
      // Deterministic ordering
      .sort((a, b) => a.label.localeCompare(b.label));

    return { nodes, links };
  });
}
