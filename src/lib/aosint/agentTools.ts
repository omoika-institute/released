import { z } from "zod";
import type { OpenAIToolDefinition } from "./agentTypes";

const emptyObjectSchema = z.object({}).strict();
const webSearchEngineValues = ["duckduckgo"] as const;
const webSearchEngineSchema = z.enum(webSearchEngineValues);

const positiveInteger = (minimum: number, maximum: number) =>
  z.number().int().min(minimum).max(maximum);

const strictObject = (
  properties: Record<string, unknown>,
  required: string[] = []
) => ({
  type: "object" as const,
  additionalProperties: false,
  properties,
  required,
});

const extractedEntityJsonSchema = strictObject(
  {
    value: { type: "string" },
    kind: { type: "string" },
    source: { type: "string" },
  },
  ["value"]
);

export const osintToolArgumentSchemas = {
  open_page: z
    .object({
      url: z.string().min(1),
      timeoutMs: positiveInteger(1000, 45000).optional(),
      waitForLoad: z.boolean().optional(),
    })
    .strict(),
  list_links: emptyObjectSchema,
  read_page: z
    .object({
      maxChars: positiveInteger(200, 120000).optional(),
    })
    .strict(),
  click_element: z
    .object({
      selector: z.string().min(1),
    })
    .strict(),
  fill_input: z
    .object({
      selector: z.string().min(1),
      text: z.string(),
      submit: z.boolean().optional(),
    })
    .strict(),
  wait_for_match: z
    .object({
      selector: z.string().min(1).optional(),
      text: z.string().min(1).optional(),
      timeoutMs: positiveInteger(250, 20000).optional(),
    })
    .strict()
    .refine((value) => Boolean(value.selector || value.text), {
      message: "Either selector or text is required.",
    }),
  fetch_url: z
    .object({
      url: z.string().min(1),
      maxChars: positiveInteger(500, 120000).optional(),
    })
    .strict(),
  web_search: z
    .object({
      query: z.string().min(1),
      limit: positiveInteger(1, 10).optional(),
      engines: z.array(webSearchEngineSchema).min(1).max(1).optional(),
      pages: positiveInteger(1, 5).optional(),
      timeoutMs: positiveInteger(1000, 45000).optional(),
    })
    .strict(),
} as const;

export type OsintToolName = keyof typeof osintToolArgumentSchemas;

export const runtimeToolArgumentSchemas = {
  search_entity_types: z
    .object({
      query: z.string().min(1).optional(),
      limit: positiveInteger(1, 20).optional(),
    })
    .strict(),
  add_unverified_entity_to_graph: z
    .object({
      name: z.string().min(1),
      summary: z.string().min(1).optional(),
      suggested_entity_type: z.string().min(1).optional(),
      entity_type: z.string().min(1).optional(),
      display_name: z.string().min(1).optional(),
      confidence: z.string().min(1).optional(),
      facts: z.record(z.string(), z.unknown()).optional(),
      data: z.record(z.string(), z.unknown()).optional(),
      evidence: z.array(z.string()).optional(),
      unknowns: z.array(z.string()).optional(),
      graph_reason: z.string().min(1).optional(),
      extracted_entities: z
        .array(
          z
            .object({
              value: z.string().min(1),
              kind: z.string().min(1).optional(),
              source: z.string().min(1).optional(),
            })
            .strict()
        )
        .optional(),
      extracted_entities_by_message: z
        .array(
          z
            .object({
              message_index: z.number().int().min(0).optional(),
              message_label: z.string().min(1).optional(),
              entities: z
                .array(
                  z
                    .object({
                      value: z.string().min(1),
                      kind: z.string().min(1).optional(),
                      source: z.string().min(1).optional(),
                    })
                    .strict()
                )
                .optional()
                .default([]),
            })
            .strict()
        )
        .optional(),
      notes: z.string().min(1).optional(),
    })
    .strict(),
  ENTITY_RESOLUTION_FINISHED: z
    .object({
      summary: z.string().min(1).optional(),
      processed_count: positiveInteger(0, 200).optional(),
    })
    .strict(),
} as const;

export type RuntimeToolName = keyof typeof runtimeToolArgumentSchemas;

export type RuntimeToolInputMap = {
  [K in RuntimeToolName]: z.infer<(typeof runtimeToolArgumentSchemas)[K]>;
};

export type OsintToolInputMap = {
  [K in OsintToolName]: z.infer<(typeof osintToolArgumentSchemas)[K]>;
};

export const osintToolDescriptions: Record<OsintToolName, string> = {
  open_page: "Open a URL in the agent browser.",
  list_links:
    "List visible links, buttons, and inputs on the current page.",
  read_page:
    "Read the current page as readability-processed markdown and include discovered links.",
  click_element: "Click an element on the current page using a CSS selector.",
  fill_input:
    "Fill an input or textarea on the current page using a CSS selector.",
  wait_for_match:
    "Wait for a selector or text snippet to appear on the current page.",
  fetch_url:
    "Fetch a URL directly and return headers plus a truncated response body.",
  web_search:
    "Run a DuckDuckGo-only agent-browser web search and return deduplicated results. Use pages to collect multiple DuckDuckGo result pages for deeper searches.",
};

export const runtimeToolDescriptions: Record<RuntimeToolName, string> = {
  search_entity_types:
    "Search the graph's available entity type schemas by label, description, category, and field names. Use this before submitting an unverified entity if you are unsure which entity_type matches the evidence.",
  add_unverified_entity_to_graph:
    "Submit one unverified entity intent for the app to map into the best graph blueprint. Provide the name plus concise evidence; entity type and fields are optional hints.",
  ENTITY_RESOLUTION_FINISHED:
    "Signal that every useful unverified entity intent in this resolution pass has been submitted. Call this only after all add_unverified_entity_to_graph calls are complete.",
};

export const osintAgentTools: OpenAIToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "open_page",
      description: osintToolDescriptions.open_page,
      parameters: strictObject(
        {
          url: { type: "string" },
          timeoutMs: { type: "integer", minimum: 1000, maximum: 45000 },
          waitForLoad: { type: "boolean" },
        },
        ["url"]
      ),
    },
  },
  {
    type: "function",
    function: {
      name: "list_links",
      description: osintToolDescriptions.list_links,
      parameters: strictObject({}),
    },
  },
  {
    type: "function",
    function: {
      name: "read_page",
      description: osintToolDescriptions.read_page,
      parameters: strictObject({
        maxChars: { type: "integer", minimum: 200, maximum: 120000 },
      }),
    },
  },
  {
    type: "function",
    function: {
      name: "click_element",
      description: osintToolDescriptions.click_element,
      parameters: strictObject(
        {
          selector: { type: "string" },
        },
        ["selector"]
      ),
    },
  },
  {
    type: "function",
    function: {
      name: "fill_input",
      description: osintToolDescriptions.fill_input,
      parameters: strictObject(
        {
          selector: { type: "string" },
          text: { type: "string" },
          submit: { type: "boolean" },
        },
        ["selector", "text"]
      ),
    },
  },
  {
    type: "function",
    function: {
      name: "wait_for_match",
      description: osintToolDescriptions.wait_for_match,
      parameters: strictObject({
        selector: { type: "string" },
        text: { type: "string" },
        timeoutMs: { type: "integer", minimum: 250, maximum: 20000 },
      }),
    },
  },
  {
    type: "function",
    function: {
      name: "fetch_url",
      description: osintToolDescriptions.fetch_url,
      parameters: strictObject(
        {
          url: { type: "string" },
          maxChars: { type: "integer", minimum: 500, maximum: 120000 },
        },
        ["url"]
      ),
    },
  },
  {
    type: "function",
    function: {
      name: "web_search",
      description: osintToolDescriptions.web_search,
      parameters: strictObject(
        {
          query: { type: "string" },
          limit: { type: "integer", minimum: 1, maximum: 10 },
          engines: {
            type: "array",
            items: {
              type: "string",
              enum: [...webSearchEngineValues],
            },
            minItems: 1,
            maxItems: 1,
          },
          pages: { type: "integer", minimum: 1, maximum: 5 },
          timeoutMs: { type: "integer", minimum: 1000, maximum: 45000 },
        },
        ["query"]
      ),
    },
  },
];

export const runtimeAgentTools: Record<RuntimeToolName, OpenAIToolDefinition> = {
  search_entity_types: {
    type: "function",
    function: {
      name: "search_entity_types",
      description: runtimeToolDescriptions.search_entity_types,
      parameters: strictObject({
        query: { type: "string" },
        limit: { type: "integer", minimum: 1, maximum: 20 },
      }),
    },
  },
  add_unverified_entity_to_graph: {
    type: "function",
    function: {
      name: "add_unverified_entity_to_graph",
      description: runtimeToolDescriptions.add_unverified_entity_to_graph,
      parameters: strictObject(
        {
          name: { type: "string" },
          summary: { type: "string" },
          suggested_entity_type: { type: "string" },
          entity_type: { type: "string" },
          display_name: { type: "string" },
          confidence: { type: "string" },
          facts: {
            type: "object",
            additionalProperties: true,
          },
          data: {
            type: "object",
            additionalProperties: true,
          },
          evidence: {
            type: "array",
            items: { type: "string" },
          },
          unknowns: {
            type: "array",
            items: { type: "string" },
          },
          graph_reason: { type: "string" },
          extracted_entities: {
            type: "array",
            items: extractedEntityJsonSchema,
          },
          extracted_entities_by_message: {
            type: "array",
            items: strictObject({
              message_index: { type: "integer", minimum: 0 },
              message_label: { type: "string" },
              entities: {
                type: "array",
                items: extractedEntityJsonSchema,
              },
            }),
          },
          notes: { type: "string" },
        },
        ["name"]
      ),
    },
  },
  ENTITY_RESOLUTION_FINISHED: {
    type: "function",
    function: {
      name: "ENTITY_RESOLUTION_FINISHED",
      description: runtimeToolDescriptions.ENTITY_RESOLUTION_FINISHED,
      parameters: strictObject({
        summary: { type: "string" },
        processed_count: { type: "integer", minimum: 0, maximum: 200 },
      }),
    },
  },
};

export function getOsintToolParameterShape(name: OsintToolName) {
  return (
    osintToolArgumentSchemas[name] as z.ZodObject<Record<string, z.ZodTypeAny>>
  ).shape;
}
