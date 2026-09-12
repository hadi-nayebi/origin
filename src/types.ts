export type FeedbackKind = "update" | "feature" | "bug";
export type FeedbackStatus =
  "open" | "in_progress" | "waiting" | "ready_for_review" | "resolved" | "dismissed";

export interface FeedbackMessage {
  material?: { id: string; name?: string; size?: number; error?: string };
  id: string;
  role: "user" | "agent";
  type:
    "comment" | "question" | "answer" | "interpretation" | "progress" | "verification" | "review";
  body: string;
  at: string;
}

export interface FeedbackRecord {
  id: string;
  version?: string;
  mergedInto?: string;
  kind: FeedbackKind;
  body: string;
  pagePath: string;
  pageLabel: string;
  status: FeedbackStatus;
  createdAt: string;
  updatedAt: string;
  messages: FeedbackMessage[];
  classification: string | null;
  interpretation: string | null;
  linkedWork: string[];
  verification: string | null;
  acceptance: string | null;
  waitReason?: string;
  dismissalReason?: string;
  reopenReason?: string;
}

export interface AgentState {
  mode: "active" | "waiting" | "idle" | "paused";
  block: boolean;
  reference: { plugin: string; id: string } | null;
  voiceId: string;
  reason: string;
  nextAction: string | null;
  revision: number;
}

export interface DeliveryStatus {
  state: "idle" | "pending" | "retrying" | "connected" | "attention";
  transport: "tmux";
  pending: number;
  last: null | {
    id: string;
    kind: string;
    reference: string;
    status: "pending" | "retrying" | "delivering" | "indeterminate" | "delivered" | "cancelled";
    attempts: number;
    updatedAt: string;
    result?: { state: "submitted" | "queued-without-interruption"; session: string } | null;
    error?: string | null;
  };
}

export interface WikiChapter {
  slug: string;
  title: string;
  summary: string;
  status: "included" | "growth-pattern" | "reference" | "future";
}

export interface PluginAnatomyPart {
  key: "manifest" | "state" | "operations" | "hooks" | "voice" | "documentation" | "tests";
  label: string;
  present: boolean;
}

export interface PluginSummary {
  id: string;
  name: string;
  version: string;
  description: string;
  objective: string;
  capabilities: string[];
  anatomy: PluginAnatomyPart[];
  complete: boolean;
}

export interface PluginReference extends PluginSummary {
  documents: Array<{ name: string; label: string; content: string }>;
}
