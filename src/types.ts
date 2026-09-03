export type FeedbackKind = "update" | "feature" | "bug";
export type FeedbackStatus = "open" | "in_progress" | "waiting" | "resolved" | "dismissed";

export interface FeedbackRecord {
  id: string;
  kind: FeedbackKind;
  body: string;
  pagePath: string;
  pageLabel: string;
  status: FeedbackStatus;
  createdAt: string;
  updatedAt: string;
  resolution?: string;
  waitReason?: string;
  dismissalReason?: string;
  reopenReason?: string;
  recoveryReason?: string;
}

export interface StopOutcome {
  mode: "active" | "waiting" | "idle";
  block: boolean;
  reference: string | null;
  voiceId: string | null;
}
export interface DeliveryStatus {
  state: "disabled" | "idle" | "starting" | "running" | "unavailable";
  pid?: number;
  startedAt?: string;
  reference?: string | null;
}

export interface WikiChapter {
  slug: string;
  title: string;
  summary: string;
  status: "included" | "growth-pattern" | "reference" | "future";
}
