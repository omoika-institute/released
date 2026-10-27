import type {
  AosintContextSnapshot,
  AosintContextSnapshotTool,
  OpenAIChatMessage,
  OpenAIToolDefinition,
} from "./agentTypes";

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }

  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(
      ([left], [right]) => left.localeCompare(right)
    );
    return `{${entries
      .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
      .join(",")}}`;
  }

  return JSON.stringify(value);
}

function hashText(value: string) {
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 33) ^ value.charCodeAt(index);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function countApproxTokens(value: string) {
  const matches = value.match(/[A-Za-z0-9_]+|[^\sA-Za-z0-9_]/g);
  return matches?.length ?? 0;
}

function messageSignature(message: OpenAIChatMessage) {
  return stableStringify({
    role: message.role,
    name: message.name,
    tool_call_id: message.tool_call_id,
    content: message.content,
    tool_calls: message.tool_calls,
  });
}

function snapshotText(snapshot: Pick<AosintContextSnapshot, "messages" | "tools">) {
  return stableStringify({
    messages: snapshot.messages.map(messageSignature),
    tools: snapshot.tools,
  });
}

function buildChangedSections(
  previous: AosintContextSnapshot,
  current: Pick<AosintContextSnapshot, "messages" | "tools">
) {
  const sections: string[] = [];
  const previousSystem = previous.messages.find((message) => message.role === "system");
  const currentSystem = current.messages.find((message) => message.role === "system");

  if (stableStringify(previousSystem) !== stableStringify(currentSystem)) {
    sections.push("system_prompt");
  }

  const previousToolMessages = previous.messages.filter(
    (message) => message.role === "tool"
  );
  const currentToolMessages = current.messages.filter(
    (message) => message.role === "tool"
  );
  if (stableStringify(previousToolMessages) !== stableStringify(currentToolMessages)) {
    sections.push("tool_outputs");
  }

  const previousAssistant = previous.messages.filter(
    (message) => message.role === "assistant"
  );
  const currentAssistant = current.messages.filter(
    (message) => message.role === "assistant"
  );
  if (stableStringify(previousAssistant) !== stableStringify(currentAssistant)) {
    sections.push("assistant_messages");
  }

  if (stableStringify(previous.tools) !== stableStringify(current.tools)) {
    sections.push("function_schemas");
  }

  return sections;
}

function buildDiff(
  previous: AosintContextSnapshot | undefined,
  current: Pick<AosintContextSnapshot, "messages" | "tools">
): AosintContextSnapshot["diff"] {
  if (!previous) {
    return {
      addedMessages: current.messages.length,
      removedMessages: 0,
      changedMessages: current.messages.length,
      addedTools: current.tools.map((tool) => tool.name),
      removedTools: [],
      approxAddedTokens: countApproxTokens(snapshotText(current)),
      approxRemovedTokens: 0,
      changedSections: ["initial_context"],
    };
  }

  const previousMessages = previous.messages.map(messageSignature);
  const currentMessages = current.messages.map(messageSignature);
  const sharedMessageCount = Math.min(previousMessages.length, currentMessages.length);
  let changedMessages = Math.abs(previousMessages.length - currentMessages.length);

  for (let index = 0; index < sharedMessageCount; index += 1) {
    if (previousMessages[index] !== currentMessages[index]) {
      changedMessages += 1;
    }
  }

  const previousTools = new Set(previous.tools.map((tool) => tool.name));
  const currentTools = new Set(current.tools.map((tool) => tool.name));
  const addedTools = current.tools
    .map((tool) => tool.name)
    .filter((name) => !previousTools.has(name));
  const removedTools = previous.tools
    .map((tool) => tool.name)
    .filter((name) => !currentTools.has(name));
  const previousTokenCount = previous.metrics.approxTokenCount;
  const currentTokenCount = countApproxTokens(snapshotText(current));
  const tokenDelta = currentTokenCount - previousTokenCount;

  return {
    previousSnapshotId: previous.id,
    addedMessages: Math.max(0, currentMessages.length - previousMessages.length),
    removedMessages: Math.max(0, previousMessages.length - currentMessages.length),
    changedMessages,
    addedTools,
    removedTools,
    approxAddedTokens: Math.max(0, tokenDelta),
    approxRemovedTokens: Math.max(0, -tokenDelta),
    changedSections: buildChangedSections(previous, current),
  };
}

export function openAiToolsToSnapshotTools(
  tools: OpenAIToolDefinition[]
): AosintContextSnapshotTool[] {
  return tools.map((tool) => ({
    name: tool.function.name,
    description: tool.function.description,
    parameters: tool.function.parameters,
  }));
}

export function buildAosintContextSnapshot(params: {
  caseId: string;
  round: number;
  model: string;
  messages: OpenAIChatMessage[];
  tools: AosintContextSnapshotTool[];
  previousSnapshot?: AosintContextSnapshot;
}): AosintContextSnapshot {
  const messages = params.messages.map((message) => ({ ...message }));
  const tools = params.tools.map((tool) => ({ ...tool }));
  const serializedTools = stableStringify(tools);
  const serializedSnapshot = snapshotText({ messages, tools });
  const systemPromptChars =
    messages.find((message) => message.role === "system")?.content?.length ?? 0;

  const draft = {
    messages,
    tools,
  };

  return {
    id: `ctx-${params.round}-${hashText(serializedSnapshot).slice(0, 10)}`,
    caseId: params.caseId,
    round: params.round,
    model: params.model,
    createdAt: new Date().toISOString(),
    messages,
    tools,
    metrics: {
      messageCount: messages.length,
      toolCount: tools.length,
      approxTokenCount: countApproxTokens(serializedSnapshot),
      systemPromptChars,
      toolSchemaChars: serializedTools.length,
    },
    diff: buildDiff(params.previousSnapshot, draft),
  };
}
