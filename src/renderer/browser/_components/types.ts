import type { OpenAIToolCall } from "@/lib/aosint/agentTypes";

export interface BrowserWebViewHandle extends HTMLElement {
  src: string;
  canGoBack: () => boolean;
  canGoForward: () => boolean;
  goBack: () => void;
  goForward: () => void;
  loadURL: (url: string) => Promise<void>;
  executeJavaScript: <T>(code: string, userGesture?: boolean) => Promise<T>;
  reload: () => void;
  stop: () => void;
  getURL: () => string;
  getTitle: () => string;
  isLoading: () => boolean;
}

export type AgentPromptSettingsTab = "system" | "user";

export type AgentTimelineEntry =
  | {
      id: string;
      kind: "prompt";
      label: string;
      tone: "neutral";
      content: string;
    }
  | {
      id: string;
      kind: "thinking";
      label: string;
      tone: "sea";
      content: string;
    }
  | {
      id: string;
      kind: "tool_call";
      label: string;
      tone: "amber";
      call: OpenAIToolCall;
      content: string;
    }
  | {
      id: string;
      kind: "tool_result";
      label: string;
      tone: "slate";
      toolCallId?: string;
      content: string;
    }
  | {
      id: string;
      kind: "context";
      label: string;
      tone: "slate";
      content: string;
    }
  | {
      id: string;
      kind: "response";
      label: string;
      tone: "signal" | "danger";
      content: string;
    };

export type AgentTimelineRenderItem = {
  entry: AgentTimelineEntry;
  toolResults: Extract<AgentTimelineEntry, { kind: "tool_result" }>[];
};

