export type FeedbackKind = "update" | "feature" | "bug";
export type FeedbackStatus =
  "open" | "in_progress" | "waiting" | "ready_for_review" | "resolved" | "dismissed";

export interface FeedbackMessage {
  id: string;
  role: "user" | "agent";
  type:
    "comment" | "question" | "answer" | "interpretation" | "progress" | "verification" | "review";
  body: string;
  at: string;
}

export interface FeedbackRecord {
  id: string;
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
  state: "idle" | "pending" | "retrying" | "connected";
  transport: "tmux";
  pending: number;
  last: null | {
    id: string;
    kind: string;
    reference: string;
    status: "pending" | "retrying" | "delivered" | "cancelled";
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
