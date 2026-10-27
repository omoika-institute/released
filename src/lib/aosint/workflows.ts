import {
  buildPivotTaskPrompt,
  buildReconTaskPrompt,
  buildReportTaskPrompt,
} from "./agentPrompts";
import type { OsintWorkflowName, RunOsintWorkflowPayload } from "./agentTypes";

export interface OsintWorkflowDefinition {
  name: OsintWorkflowName;
  buildUserPrompt: (payload: RunOsintWorkflowPayload) => string;
}

export const osintWorkflowDefinitions: Record<
  OsintWorkflowDefinition["name"],
  OsintWorkflowDefinition
> = {
  recon: {
    name: "recon",
    buildUserPrompt: (payload) =>
      buildReconTaskPrompt(
        payload.target,
        appendHarnessContext(payload.prompt, payload)
      ),
  },
  pivot: {
    name: "pivot",
    buildUserPrompt: (payload) =>
      buildPivotTaskPrompt(
        payload.target,
        appendHarnessContext(payload.prompt, payload)
      ),
  },
  report: {
    name: "report",
    buildUserPrompt: (payload) =>
      buildReportTaskPrompt(
        payload.target,
        appendHarnessContext(payload.prompt, payload)
      ),
  },
  harness: {
    name: "harness",
    buildUserPrompt: (payload) =>
      appendHarnessContext(
        [
          `Execute editable harness workflow: ${payload.customWorkflow?.name?.trim() || "Untitled harness workflow"}`,
          payload.customWorkflow?.description?.trim()
            ? `Description: ${payload.customWorkflow.description.trim()}`
            : undefined,
          "",
          "Workflow instructions:",
          payload.customWorkflow?.prompt?.trim() ||
            "Follow the visual harness DAG and node-level prompts.",
          payload.prompt?.trim() ? "" : undefined,
          payload.prompt?.trim(),
        ]
          .filter((line) => line !== undefined)
          .join("\n"),
        payload
      ),
  },
};

function appendHarnessContext(
  prompt: string | undefined,
  payload: RunOsintWorkflowPayload
) {
  if (!payload.harness) return prompt;

  return [
    prompt?.trim(),
    "Harness execution context:",
    "The following compact JSON was produced by the visual harness DAG. Treat seedEntities as the authoritative starting data. Do not browse or perform external actions beyond the harness permission mode and node prompts.",
    JSON.stringify(payload.harness, null, 2),
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function resolveOsintWorkflow(
  workflow?: RunOsintWorkflowPayload["workflow"]
) {
  return osintWorkflowDefinitions[workflow ?? "recon"];
}
