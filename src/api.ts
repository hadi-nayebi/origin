import type {
  AgentState,
  DeliveryStatus,
  FeedbackKind,
  FeedbackRecord,
  FeedbackStatus,
  WikiChapter,
} from "./types";

export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const response = await fetch(path, { ...init, headers });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "Origin request failed.");
  return payload as T;
}

export type FeedbackView = {
  records: FeedbackRecord[];
  outcome: AgentState;
  delivery: DeliveryStatus;
};

export const api = {
  feedback: () => request<FeedbackView>("/api/feedback"),
  submitFeedback: (input: {
    kind: FeedbackKind;
    body: string;
    pagePath: string;
    pageLabel: string;
  }) =>
    request<{ record: FeedbackRecord; delivery: DeliveryStatus }>("/api/feedback", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  addFeedbackMessage: (id: string, body: string) =>
    request<{ record: FeedbackRecord; delivery: DeliveryStatus }>(
      `/api/feedback/${encodeURIComponent(id)}/messages`,
      { method: "POST", body: JSON.stringify({ body }) },
    ),
  transitionFeedback: (
    id: string,
    input: {
      status: Extract<FeedbackStatus, "resolved" | "open" | "dismissed">;
      reason?: string;
      acceptance?: string;
    },
  ) =>
    request<{ record: FeedbackRecord; delivery: DeliveryStatus }>(
      `/api/feedback/${encodeURIComponent(id)}`,
      { method: "PATCH", body: JSON.stringify(input) },
    ),
  wakeFeedback: () =>
    request<{ delivery: DeliveryStatus }>("/api/feedback/wake", {
      method: "POST",
      body: JSON.stringify({}),
    }),
  wiki: () => request<{ chapters: WikiChapter[] }>("/api/wiki"),
  chapter: (slug: string) => request<WikiChapter & { content: string }>(`/api/wiki/${slug}`),
};
