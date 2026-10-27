import type { Database } from "@tursodatabase/database";
import { appendEvent } from "./events";
import { applyEvent } from "./projector";

const SHARE_VERSION = 1;
const SHARE_SCHEME = "omoika://share";
const DEFAULT_SIGNALING_URL = "ws://127.0.0.1:8787/ws";
const DEFAULT_OWNER_ID = "local-user";
const DEFAULT_ORG = "local-user";

type ShareKind = "graph" | "database";

type ShareEvent = {
  category: "entity" | "edge";
  event_type: string;
  payload: Record<string, any>;
  valid_from: string;
  valid_to?: string | null;
  causation_id?: string | null;
  correlation_id?: string | null;
  actor_id: string;
};

type ShareCase = {
  id: string;
  label: string;
  description: string;
  ctime?: string;
  mtime?: string;
  events: ShareEvent[];
};

type SharePackage = {
  version: number;
  kind: ShareKind;
  exportedAt: string;
  cases: ShareCase[];
};

function signalingUrlToHttpBase(value?: string | null) {
  const clean =
    (value || DEFAULT_SIGNALING_URL).trim() || DEFAULT_SIGNALING_URL;
  const normalized = clean.endsWith("/ws") ? clean.slice(0, -3) : clean;

  if (normalized.startsWith("ws://")) {
    return normalized.replace(/^ws:\/\//, "http://").replace(/\/$/, "");
  }
  if (normalized.startsWith("wss://")) {
    return normalized.replace(/^wss:\/\//, "https://").replace(/\/$/, "");
  }
  if (normalized.startsWith("http://") || normalized.startsWith("https://")) {
    return normalized.replace(/\/$/, "");
  }

  return `http://${normalized.replace(/\/$/, "")}`;
}

function decodeLegacySharePackage(payload: string): SharePackage {
  const text = payload.startsWith("{")
    ? payload
    : Buffer.from(payload, "base64url").toString("utf8");
  const parsed = JSON.parse(text) as SharePackage;

  if (parsed.version !== SHARE_VERSION || !Array.isArray(parsed.cases)) {
    throw new Error("Unsupported OMOIKA share link.");
  }

  return parsed;
}

async function loadSharePackage(value: string): Promise<SharePackage> {
  const clean = value.trim();

  if (clean.startsWith(SHARE_SCHEME)) {
    const url = new URL(clean);
    const legacyPayload = url.searchParams.get("payload");
    if (legacyPayload) return decodeLegacySharePackage(legacyPayload);

    const shareId = url.searchParams.get("id")?.trim();
    const server = url.searchParams.get("server")?.trim();
    const accessCode = url.searchParams.get("code")?.trim();
    if (!shareId) throw new Error("Share link is missing a share id.");

    const httpBase = signalingUrlToHttpBase(server);
    const shareFetchUrl = new URL(
      `${httpBase}/shares/${encodeURIComponent(shareId)}`,
    );
    if (accessCode) shareFetchUrl.searchParams.set("code", accessCode);
    const response = await fetch(shareFetchUrl.toString());
    if (!response.ok) {
      if (response.status === 401) {
        throw new Error("The one-time code for this graph share was rejected.");
      }
      throw new Error(`Share ${shareId} was not found on ${httpBase}.`);
    }

    const parsed = (await response.json()) as SharePackage;
    if (parsed.version !== SHARE_VERSION || !Array.isArray(parsed.cases)) {
      throw new Error("Unsupported OMOIKA share payload.");
    }

    return parsed;
  }

  if (!clean) throw new Error("Share link is empty.");

  return decodeLegacySharePackage(clean);
}

async function publishSharePackage(
  sharePackage: SharePackage,
  signalingUrl?: string,
  accessCode?: string,
) {
  const httpBase = signalingUrlToHttpBase(signalingUrl);
  let response: Response;

  try {
    response = await fetch(`${httpBase}/shares`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ payload: sharePackage, accessCode }),
    });
  } catch (error: any) {
    throw new Error(
      `Unable to reach P2P share server at ${httpBase}. Start the Rust server or connect to a reachable P2P server. ${error?.message ?? ""}`.trim(),
    );
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    if (response.status === 413) {
      throw new Error(
        `P2P server at ${httpBase} rejected share publishing because the share payload is too large. Rebuild/restart the Rust server with the increased /shares body limit.${detail ? ` ${detail}` : ""}`,
      );
    }
    throw new Error(
      `P2P server at ${httpBase} rejected share publishing (${response.status}). Make sure it is the current Rust server with /shares support.${detail ? ` ${detail}` : ""}`,
    );
  }

  const body = (await response.json()) as { share_id?: string };
  if (!body.share_id) throw new Error("P2P server did not return a share id.");

  const link = new URL(SHARE_SCHEME);
  link.searchParams.set("server", httpBase);
  link.searchParams.set("id", body.share_id);

  return { url: link.toString(), shareId: body.share_id, server: httpBase };
}

async function getCaseRows(db: Database, graphId?: string) {
  if (graphId) {
    return db
      .prepare(
        `SELECT uuid, label, description, ctime, mtime FROM cases WHERE uuid = ?`,
      )
      .all(graphId);
  }

  return db
    .prepare(
      `SELECT uuid, label, description, ctime, mtime FROM cases ORDER BY ctime ASC`,
    )
    .all();
}

async function getCaseEvents(
  db: Database,
  graphId: string,
): Promise<ShareEvent[]> {
  const rows = await db
    .prepare(
      `
SELECT stream_id, event_type, payload, valid_from, valid_to, causation_id, correlation_id, actor_id
FROM events
WHERE stream_id IN (?, ?)
ORDER BY stream_id ASC, version ASC
      `,
    )
    .all(`entity:${graphId}`, `edge:${graphId}`);

  return rows.map((row: any) => ({
    category: row.stream_id.startsWith("entity:") ? "entity" : "edge",
    event_type: String(row.event_type),
    payload: JSON.parse(String(row.payload)),
    valid_from: String(row.valid_from),
    valid_to: row.valid_to ?? null,
    causation_id: row.causation_id ?? null,
    correlation_id: row.correlation_id ?? null,
    actor_id: String(row.actor_id ?? "shared-peer"),
  }));
}

async function buildSharePackage(
  db: Database,
  kind: ShareKind,
  graphId?: string,
): Promise<SharePackage> {
  const rows = await getCaseRows(db, graphId);
  if (graphId && rows.length === 0) throw new Error("Case not found.");

  const cases: ShareCase[] = [];
  for (const row of rows as any[]) {
    cases.push({
      id: String(row.uuid),
      label: String(row.label),
      description: String(row.description ?? ""),
      ctime: row.ctime ? String(row.ctime) : undefined,
      mtime: row.mtime ? String(row.mtime) : undefined,
      events: await getCaseEvents(db, String(row.uuid)),
    });
  }

  return {
    version: SHARE_VERSION,
    kind,
    exportedAt: new Date().toISOString(),
    cases,
  };
}

export async function exportShareLink(
  db: Database,
  payload: {
    kind: ShareKind;
    graphId?: string;
    signalingUrl?: string;
    accessCode?: string;
  },
) {
  const sharePackage = await buildSharePackage(
    db,
    payload.kind,
    payload.graphId,
  );
  const published = await publishSharePackage(
    sharePackage,
    payload.signalingUrl,
    payload.accessCode,
  );

  return {
    url: published.url,
    shareId: published.shareId,
    server: published.server,
    kind: sharePackage.kind,
    caseCount: sharePackage.cases.length,
    eventCount: sharePackage.cases.reduce(
      (count, shareCase) => count + shareCase.events.length,
      0,
    ),
  };
}

export async function importShareLink(
  db: Database,
  createCase: (label: string, description: string) => Promise<{ id: string }>,
  payload: { url: string; preserveCaseIds?: boolean },
) {
  const sharePackage = await loadSharePackage(payload.url);
  const imported: Array<{ sourceId: string; localId: string; label: string }> =
    [];

  for (const sharedCase of sharePackage.cases) {
    const localCase = payload.preserveCaseIds
      ? await ensureSharedCase(db, sharedCase)
      : {
          ...(await createCase(sharedCase.label, sharedCase.description)),
          exists: false,
        };

    if (localCase.exists) {
      imported.push({
        sourceId: sharedCase.id,
        localId: localCase.id,
        label: sharedCase.label,
      });
      continue;
    }

    for (const event of sharedCase.events) {
      const eventRecord = await appendEvent(db, {
        category: event.category,
        key: localCase.id,
        event_type: event.event_type,
        payload: event.payload,
        valid_from: event.valid_from || new Date().toISOString(),
        valid_to: event.valid_to ?? undefined,
        causation_id: event.causation_id ?? undefined,
        correlation_id: event.correlation_id ?? undefined,
        actor_id: `shared:${event.actor_id || "peer"}`,
      });
      await applyEvent(db, eventRecord);
    }

    imported.push({
      sourceId: sharedCase.id,
      localId: localCase.id,
      label: sharedCase.label,
    });
  }

  return {
    kind: sharePackage.kind,
    imported,
    caseCount: imported.length,
    eventCount: sharePackage.cases.reduce(
      (count, shareCase) => count + shareCase.events.length,
      0,
    ),
  };
}

async function ensureSharedCase(db: Database, sharedCase: ShareCase) {
  const existing = await db
    .prepare(`SELECT uuid FROM cases WHERE uuid = ? LIMIT 1`)
    .all(sharedCase.id);

  if (existing.length > 0) {
    return { id: sharedCase.id, exists: true };
  }

  const now = new Date().toISOString();
  await db
    .prepare(
      `
INSERT INTO cases (uuid, label, description, ctime, mtime, org, owner_id)
VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
    )
    .run(
      sharedCase.id,
      sharedCase.label,
      sharedCase.description,
      sharedCase.ctime || now,
      sharedCase.mtime || now,
      DEFAULT_ORG,
      DEFAULT_OWNER_ID,
    );

  return { id: sharedCase.id, exists: false };
}
