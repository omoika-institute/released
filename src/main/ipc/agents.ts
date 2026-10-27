import {
  getAgentSessionDetails,
  getAgentSessionStats,
  listAgentSessions,
} from "../app/agentSessions";
import { bindHandle } from "./handle";
import type { IpcContext } from "./types";

export function registerAgentsIpc({ database }: IpcContext) {
  bindHandle(
    "agents:list-sessions",
    async (_event, payload: { skip?: number; limit?: number; caseId?: string } = {}) =>
      listAgentSessions(database.getDb(), payload)
  );

  bindHandle("agents:get-session", async (_event, sessionId: string) =>
    getAgentSessionDetails(database.getDb(), sessionId)
  );

  bindHandle("agents:get-stats", async (_event, payload: { caseId?: string } = {}) =>
    getAgentSessionStats(database.getDb(), payload)
  );
}
