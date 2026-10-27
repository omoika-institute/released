import type { IpcMainInvokeEvent } from "electron";
import { randomUUID } from "node:crypto";
import { runOsintWorkflow } from "../app/aosint";
import {
  createAgentSession,
  finishAgentSession,
  recordAgentSessionEvent,
} from "../app/agentSessions";
import {
  createLMStudioClient,
  DEFAULT_LM_STUDIO_MODEL,
} from "../../lib/aosint/lmstudio";
import { DEFAULT_OPENROUTER_MODEL } from "../../lib/aosint/openrouterAgent";
import { executeBrowserCommand } from "../browserController";
import { requestVisibleBrowserCommand } from "./browser";
import { bindHandle } from "./handle";
import type { IpcContext } from "./types";
import type {
  BrowserCommand,
  RunOsintWorkflowPayload,
} from "../../lib/aosint/agentTypes";
import {
  sanitizeAosintWorkflowEventForRenderer,
  sanitizeAosintWorkflowResultForRenderer,
} from "../../lib/aosint/workflowPayloads";

const activeWorkflowControllers = new Map<string, Set<AbortController>>();

function getWorkflowCaseId(payload: RunOsintWorkflowPayload) {
  return payload.caseId?.trim() || "";
}

function cancelWorkflowControllers(params: {
  caseId?: string;
  caseIdPrefix?: string;
}) {
  let canceled = 0;
  for (const [caseId, controllers] of activeWorkflowControllers) {
    const matchesCase = params.caseId && caseId === params.caseId;
    const matchesPrefix =
      params.caseIdPrefix && caseId.startsWith(params.caseIdPrefix);
    if (!matchesCase && !matchesPrefix) continue;
    for (const controller of controllers) {
      controller.abort(new Error("AOSINT workflow was canceled."));
      canceled += 1;
    }
    activeWorkflowControllers.delete(caseId);
  }

  return canceled;
}

function isVisibleBrowserTimeout(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("Visible browser command timed out");
}

async function executeWorkflowBrowserCommand(
  event: IpcMainInvokeEvent,
  payload: RunOsintWorkflowPayload,
  command: BrowserCommand,
  signal?: AbortSignal
) {
  if (payload.browserMode === "visible") {
    try {
      return await requestVisibleBrowserCommand(
        event.sender,
        command,
        payload.caseId,
        signal
      );
    } catch (error) {
      if (!isVisibleBrowserTimeout(error)) {
        throw error;
      }

      console.warn("[aosint:ipc] visible-browser-timeout:fallback", {
        commandId: command.id,
        type: command.type,
        caseId: payload.caseId ?? null,
      });
    }
  }

  return executeBrowserCommand(command);
}

export function registerAosintIpc(deps: IpcContext) {
  bindHandle(
    "aosint:list-lmstudio-models",
    async (_event, payload: { baseUrl?: string } = {}) => {
      const client = createLMStudioClient({ baseUrl: payload.baseUrl });
      try {
        const models = await client.system.listDownloadedModels("llm");
        return models.map((m) => ({ modelKey: m.modelKey, displayName: m.displayName }));
      } finally {
        if (Symbol.asyncDispose in client) {
          await (client as any)[Symbol.asyncDispose]();
        }
      }
    }
  );

  bindHandle(
    "aosint:run-workflow",
    async (event, payload: RunOsintWorkflowPayload) => {
      const sessionId = randomUUID();
      const payloadWithCaseId: RunOsintWorkflowPayload = {
        ...payload,
        caseId: getWorkflowCaseId(payload) || sessionId,
      };
      const caseId = getWorkflowCaseId(payloadWithCaseId);
      const abortController = new AbortController();
      const provider = payloadWithCaseId.provider ?? "lmstudio";
      const model =
        payloadWithCaseId.model?.trim() ||
        (provider === "openrouter"
          ? DEFAULT_OPENROUTER_MODEL
          : DEFAULT_LM_STUDIO_MODEL);
      const startedAt = new Date().toISOString();
      const startedAtMs = Date.now();
      const agentDb = deps.database.getDb();
      let persistQueue = Promise.resolve();

      if (caseId) {
        const controllers =
          activeWorkflowControllers.get(caseId) ?? new Set<AbortController>();
        controllers.add(abortController);
        activeWorkflowControllers.set(caseId, controllers);
      }

      console.log("[aosint:ipc] run-workflow:start", {
        workflow: payloadWithCaseId.workflow ?? "recon",
        target: payloadWithCaseId.target,
        caseId: caseId || null,
        sessionId,
        browserMode: payloadWithCaseId.browserMode ?? "background",
      });

      await deps.userTools.ready(deps.app);
      const [enabledBuiltinNames, userToolsList] = await Promise.all([
        deps.userTools.getEnabledBuiltinNames(),
        deps.userTools.list().then((tools) => tools.filter((t) => t.enabled)),
      ]);

      try {
        await createAgentSession(agentDb, {
          sessionId,
          payload: payloadWithCaseId,
          provider,
          model,
          startedAt,
        });

        const result = await runOsintWorkflow(payloadWithCaseId, {
          executeVisibleBrowserCommand: (command) =>
            executeWorkflowBrowserCommand(
              event,
              payloadWithCaseId,
              command,
              abortController.signal
            ),
          enabledBuiltinNames,
          userTools: userToolsList,
          abortSignal: abortController.signal,
          onProgressEvent: (progress) => {
            persistQueue = persistQueue
              .then(() => recordAgentSessionEvent(agentDb, sessionId, progress))
              .catch((error) => {
                console.warn("[aosint:ipc] persist-event:error", {
                  sessionId,
                  eventType: progress.type,
                  error: error instanceof Error ? error.message : String(error),
                });
              });
            event.sender.send(
              "aosint:workflow-event",
              sanitizeAosintWorkflowEventForRenderer(progress)
            );
          },
        });
        await persistQueue;
        await finishAgentSession(agentDb, {
          sessionId,
          startedAtMs,
          result,
        });
        console.log("[aosint:ipc] run-workflow:success", {
          workflow: result.workflow,
          target: result.target,
          sessionId,
        });
        return sanitizeAosintWorkflowResultForRenderer(
          payloadWithCaseId.includeMessages === false
            ? {
                ...result,
                messages: [],
              }
            : result
        );
      } catch (error) {
        await persistQueue;
        await finishAgentSession(agentDb, {
          sessionId,
          startedAtMs,
          error,
        }).catch((persistError) => {
          console.warn("[aosint:ipc] persist-finish:error", {
            sessionId,
            error:
              persistError instanceof Error
                ? persistError.message
                : String(persistError),
          });
        });
        console.error("[aosint:ipc] run-workflow:error", {
          workflow: payloadWithCaseId.workflow ?? "recon",
          target: payloadWithCaseId.target,
          sessionId,
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      } finally {
        if (caseId) {
          const controllers = activeWorkflowControllers.get(caseId);
          controllers?.delete(abortController);
          if (controllers && controllers.size === 0) {
            activeWorkflowControllers.delete(caseId);
          }
        }
      }
    }
  );

  bindHandle(
    "aosint:cancel-workflows",
    async (_event, payload: { caseId?: string; caseIdPrefix?: string } = {}) => {
      const canceled = cancelWorkflowControllers(payload);
      console.log("[aosint:ipc] cancel-workflows", {
        caseId: payload.caseId ?? null,
        caseIdPrefix: payload.caseIdPrefix ?? null,
        canceled,
      });
      return { canceled };
    }
  );
}
