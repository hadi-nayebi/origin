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
}

export interface WikiChapter {
  slug: string;
  title: string;
  summary: string;
  status: "included" | "growth-pattern" | "reference" | "future";
}

