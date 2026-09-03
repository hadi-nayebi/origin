import type {
  DeliveryStatus,
  FeedbackKind,
  FeedbackRecord,
  FeedbackStatus,
  StopOutcome,
  WikiChapter,
} from "./types";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "Origin request failed.");
  return payload as T;
}

export const api = {
  feedback: () =>
    request<{ records: FeedbackRecord[]; outcome: StopOutcome; delivery: DeliveryStatus }>(
      "/api/feedback",
    ),
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
  transitionFeedback: (
    id: string,
    input: { status: FeedbackStatus; reason?: string; evidence?: string },
  ) =>
    request<{ record: FeedbackRecord; delivery: DeliveryStatus }>(
      `/api/feedback/${encodeURIComponent(id)}`,
      { method: "PATCH", body: JSON.stringify(input) },
    ),
  wiki: () => request<{ chapters: WikiChapter[] }>("/api/wiki"),
  chapter: (slug: string) => request<WikiChapter & { content: string }>(`/api/wiki/${slug}`),
};
