import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { api } from "./api";
import type {
  AgentState,
  DeliveryStatus,
  FeedbackKind,
  FeedbackRecord,
  WikiChapter,
} from "./types";

type Surface = { kind: "canvas" } | { kind: "wiki"; slug?: string };

export default function App() {
  const [surface, setSurface] = useState<Surface>(() => surfaceFromPath(window.location.pathname));
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [attention, setAttention] = useState(0);
  const refreshAttention = async () => {
    const { records } = await api.feedback();
    setAttention(
      records.filter((record) => ["waiting", "ready_for_review"].includes(record.status)).length,
    );
  };
  const navigate = (next: Surface) => {
    window.history.pushState({}, "", next.kind === "wiki" ? `/wiki/${next.slug || ""}` : "/");
    setSurface(next);
  };
  useEffect(() => {
    const handlePop = () => setSurface(surfaceFromPath(window.location.pathname));
    window.addEventListener("popstate", handlePop);
    void refreshAttention().catch(() => {});
    const polling = window.setInterval(() => void refreshAttention().catch(() => {}), 3000);
    return () => {
      window.removeEventListener("popstate", handlePop);
      window.clearInterval(polling);
    };
  }, []);
  const pagePath = surface.kind === "wiki" ? `/wiki/${surface.slug || ""}` : "/";
  const pageLabel =
    surface.kind === "wiki"
      ? `Origin wiki${surface.slug ? `: ${titleFromSlug(surface.slug)}` : ""}`
      : "Origin canvas";
  return (
    <div className="origin-shell">
      <a className="skip-link" href="#origin-main">
        Skip to content
      </a>
      <header className="brand" aria-label="Origin">
        <span className="brand-mark" aria-hidden="true">
          O
        </span>
        <span>Origin</span>
      </header>
      <main id="origin-main">
        {surface.kind === "canvas" ? (
          <EmptyCanvas />
        ) : (
          <Wiki slug={surface.slug} navigate={navigate} />
        )}
      </main>
      <button
        className="floating-control wiki-control"
        onClick={() => navigate({ kind: "wiki" })}
        aria-label="Open Origin wiki"
      >
        <BookIcon />
        <span>Wiki</span>
      </button>
      <button
        className="floating-control feedback-control"
        onClick={() => setFeedbackOpen(true)}
        aria-label={
          attention ? `Give feedback, ${attention} items need your attention` : "Give feedback"
        }
      >
        <CommentIcon />
        <span>Feedback</span>
        {attention > 0 && (
          <b className="attention-dot" aria-hidden="true">
            {attention}
          </b>
        )}
      </button>
      {feedbackOpen && (
        <FeedbackPanel
          pagePath={pagePath}
          pageLabel={pageLabel}
          onClose={() => setFeedbackOpen(false)}
          onAttention={refreshAttention}
        />
      )}
    </div>
  );
}

function EmptyCanvas() {
  return (
    <section className="empty-canvas" aria-labelledby="canvas-title">
      <div className="empty-message">
        <p className="eyebrow">A Hadosh Academy base dashboard</p>
        <h1 id="canvas-title">Ready to become yours.</h1>
        <p>Ask your agent to shape the first page, or leave feedback to begin.</p>
      </div>
    </section>
  );
}

function Wiki({ slug, navigate }: { slug?: string; navigate: (surface: Surface) => void }) {
  const [chapters, setChapters] = useState<WikiChapter[]>([]);
  const [chapter, setChapter] = useState<(WikiChapter & { content: string }) | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    api
      .wiki()
      .then(({ chapters }) => setChapters(chapters))
      .catch((error: Error) => setError(error.message));
  }, []);
  useEffect(() => {
    let current = true;
    setError("");
    if (!slug) {
      setChapter(null);
      return () => {
        current = false;
      };
    }
    api
      .chapter(slug)
      .then((value) => {
        if (current) setChapter(value);
      })
      .catch((error: Error) => {
        if (current) setError(error.message);
      });
    return () => {
      current = false;
    };
  }, [slug]);
  return (
    <section className="wiki-surface">
      <aside className="wiki-nav">
        <button className="back-button" onClick={() => navigate({ kind: "canvas" })}>
          ← Canvas
        </button>
        <div>
          <p className="eyebrow">Growth guide</p>
          <h1>Origin Wiki</h1>
          <p className="wiki-intro">
            Patterns for cultivating this foundation through Hadosh Academy Phases 6–7.
          </p>
        </div>
        <nav aria-label="Wiki chapters">
          {chapters.map((item) => (
            <button
              className={item.slug === slug ? "chapter-link active" : "chapter-link"}
              aria-current={item.slug === slug ? "page" : undefined}
              key={item.slug}
              onClick={() => navigate({ kind: "wiki", slug: item.slug })}
            >
              <span>{item.title}</span>
              <small>{labelStatus(item.status)}</small>
            </button>
          ))}
        </nav>
      </aside>
      <article className="wiki-article" aria-live="polite">
        {error ? (
          <p className="error" role="alert">
            {error}
          </p>
        ) : chapter ? (
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{chapter.content}</ReactMarkdown>
        ) : (
          <WikiLanding chapters={chapters} navigate={navigate} />
        )}
      </article>
    </section>
  );
}

function WikiLanding({
  chapters,
  navigate,
}: {
  chapters: WikiChapter[];
  navigate: (surface: Surface) => void;
}) {
  return (
    <div>
      <p className="eyebrow">Start here</p>
      <h2>The dashboard is empty. Its context is not.</h2>
      <p className="lead">
        Origin is the Codex implementation of the Hadosh Academy Base Dashboard substrate. Its wiki
        teaches how the visible world and harness can grow together.
      </p>
      <div className="chapter-grid">
        {chapters.map((chapter) => (
          <button key={chapter.slug} onClick={() => navigate({ kind: "wiki", slug: chapter.slug })}>
            <small>{labelStatus(chapter.status)}</small>
            <strong>{chapter.title}</strong>
            <span>{chapter.summary}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function FeedbackPanel({
  pagePath,
  pageLabel,
  onClose,
  onAttention,
}: {
  pagePath: string;
  pageLabel: string;
  onClose: () => void;
  onAttention: () => Promise<void>;
}) {
  const [kind, setKind] = useState<FeedbackKind>("update");
  const [body, setBody] = useState("");
  const [records, setRecords] = useState<FeedbackRecord[]>([]);
  const [delivery, setDelivery] = useState<DeliveryStatus>({
    state: "idle",
    transport: "tmux",
    pending: 0,
    last: null,
  });
  const [outcome, setOutcome] = useState<AgentState>({
    mode: "idle",
    block: false,
    reference: null,
    voiceId: "stop.idle",
    reason: "No work remains.",
    nextAction: null,
    revision: 0,
  });
  const [status, setStatus] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const panelRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const previousFocus = useRef<HTMLElement | null>(document.activeElement as HTMLElement | null);
  const refresh = async () => {
    const result = await api.feedback();
    setRecords(result.records);
    setDelivery(result.delivery);
    setOutcome(result.outcome);
    await onAttention();
  };
  useEffect(() => {
    void refresh().catch((error: Error) => setStatus(error.message));
    const polling = window.setInterval(() => void refresh().catch(() => {}), 2000);
    closeRef.current?.focus();
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === "Tab") trapFocus(event, panelRef.current);
    };
    document.addEventListener("keydown", keyboard);
    return () => {
      window.clearInterval(polling);
      document.removeEventListener("keydown", keyboard);
      previousFocus.current?.focus();
    };
  }, []);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setStatus("Saving…");
    try {
      const result = await api.submitFeedback({ kind, body, pagePath, pageLabel });
      setBody("");
      setDelivery(result.delivery);
      setStatus("Saved. The interactive Codex session has been notified through tmux.");
      await refresh();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not save feedback.");
    } finally {
      setSubmitting(false);
    }
  };
  const retryWake = async () => {
    setStatus("Retrying delivery…");
    try {
      const result = await api.wakeFeedback();
      setDelivery(result.delivery);
      setStatus("Wake delivery scheduled.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not retry delivery.");
    }
  };
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        ref={panelRef}
        className="feedback-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="feedback-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <div>
            <p className="eyebrow">Feedback on {pageLabel}</p>
            <h2 id="feedback-title">Shape what comes next.</h2>
          </div>
          <button ref={closeRef} onClick={onClose} aria-label="Close feedback">
            ×
          </button>
        </header>
        <section className="delivery-summary" aria-labelledby="delivery-title">
          <div>
            <p id="delivery-title" className={`delivery-state ${delivery.state}`}>
              Agent state: {outcome.mode} · tmux: {delivery.state}
            </p>
            <p>
              Feedback is delivered to the same interactive Codex session open in your terminal.
            </p>
            {outcome.reference && <small>Current responsibility: {outcome.reference.id}</small>}
            {delivery.last?.error && <small>{delivery.last.error}</small>}
          </div>
          {delivery.pending > 0 && (
            <button type="button" onClick={retryWake}>
              Retry wake
            </button>
          )}
        </section>
        <form onSubmit={submit}>
          <fieldset>
            <legend>What kind of feedback is this?</legend>
            {(["update", "feature", "bug"] as FeedbackKind[]).map((item) => (
              <label key={item}>
                <input
                  type="radio"
                  name="kind"
                  checked={kind === item}
                  onChange={() => setKind(item)}
                />
                {item === "update"
                  ? "Content or update"
                  : item === "feature"
                    ? "Feature request"
                    : "Bug report"}
              </label>
            ))}
          </fieldset>
          <label className="body-label">
            What should change?
            <textarea
              required
              minLength={3}
              maxLength={2000}
              value={body}
              onChange={(event) => setBody(event.target.value)}
              placeholder="Describe the result you want to see…"
            />
          </label>
          <button className="primary" type="submit" disabled={submitting}>
            {submitting ? "Saving…" : "Save feedback"}
          </button>
          {status && (
            <p className="form-status" role="status">
              {status}
            </p>
          )}
        </form>
        {records.length > 0 && (
          <div className="recent-feedback">
            <h3>Feedback threads</h3>
            {records.map((record) => (
              <FeedbackRecordCard key={record.id} record={record} onChanged={refresh} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function FeedbackRecordCard({
  record,
  onChanged,
}: {
  record: FeedbackRecord;
  onChanged: () => Promise<void>;
}) {
  const [detail, setDetail] = useState("");
  const [message, setMessage] = useState("");
  const [updating, setUpdating] = useState(false);
  const run = async (operation: () => Promise<unknown>, success: string) => {
    if (updating) return;
    setUpdating(true);
    setMessage("Updating…");
    try {
      await operation();
      setDetail("");
      setMessage(success);
      await onChanged();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not update feedback.");
    } finally {
      setUpdating(false);
    }
  };
  const submitMessage = () =>
    run(
      () => api.addFeedbackMessage(record.id, detail),
      record.status === "waiting" ? "Answer sent to Codex." : "Comment sent to Codex.",
    );
  const accept = () =>
    run(
      () =>
        api.transitionFeedback(record.id, {
          status: "resolved",
          acceptance: detail.trim() || "Accepted by user.",
        }),
      "Accepted.",
    );
  const reopen = () =>
    run(
      () => api.transitionFeedback(record.id, { status: "open", reason: detail }),
      "Reopened and sent to Codex.",
    );
  const dismiss = () =>
    run(
      () => api.transitionFeedback(record.id, { status: "dismissed", reason: detail }),
      "Dismissed.",
    );
  const needsAttention = ["waiting", "ready_for_review"].includes(record.status);
  return (
    <article className={`feedback-record ${needsAttention ? "needs-attention" : ""}`}>
      <div className="record-meta">
        <span>{record.kind}</span>
        <small>{record.status.replaceAll("_", " ")}</small>
      </div>
      <p>{record.body}</p>
      <small>{record.pageLabel}</small>
      {record.interpretation && (
        <p className="interpretation">
          <strong>Agent interpretation:</strong> {record.interpretation}
        </p>
      )}
      {record.verification && (
        <p className="verification">
          <strong>Verification:</strong> {record.verification}
        </p>
      )}
      <details open={needsAttention || undefined}>
        <summary>Thread and review</summary>
        <div className="thread">
          {record.messages.map((item) => (
            <div className={`thread-message ${item.role}`} key={item.id}>
              <small>
                {item.role} · {item.type}
              </small>
              <p>{item.body}</p>
            </div>
          ))}
        </div>
        {record.status === "waiting" && (
          <label>
            Your answer
            <textarea value={detail} onChange={(event) => setDetail(event.target.value)} />
          </label>
        )}
        {record.status === "ready_for_review" && (
          <label>
            Acceptance note or reason to reopen
            <textarea value={detail} onChange={(event) => setDetail(event.target.value)} />
          </label>
        )}
        {["open", "in_progress"].includes(record.status) && (
          <label>
            Add context
            <textarea value={detail} onChange={(event) => setDetail(event.target.value)} />
          </label>
        )}
        {["resolved", "dismissed"].includes(record.status) && (
          <label>
            Reason to reopen
            <textarea value={detail} onChange={(event) => setDetail(event.target.value)} />
          </label>
        )}
        <div className="record-actions">
          {["open", "in_progress", "waiting"].includes(record.status) && (
            <button type="button" disabled={updating || !detail.trim()} onClick={submitMessage}>
              {record.status === "waiting" ? "Send answer" : "Add comment"}
            </button>
          )}
          {record.status === "ready_for_review" && (
            <>
              <button type="button" disabled={updating} onClick={accept}>
                Accept
              </button>
              <button type="button" disabled={updating || !detail.trim()} onClick={reopen}>
                Reopen
              </button>
            </>
          )}
          {["resolved", "dismissed"].includes(record.status) && (
            <button type="button" disabled={updating || !detail.trim()} onClick={reopen}>
              Reopen
            </button>
          )}
          {["open", "waiting"].includes(record.status) && (
            <button type="button" disabled={updating || !detail.trim()} onClick={dismiss}>
              Withdraw
            </button>
          )}
        </div>
        {message && <p role="status">{message}</p>}
      </details>
    </article>
  );
}

function surfaceFromPath(pathname: string): Surface {
  const match = pathname.match(/^\/wiki\/?([^/]*)/);
  return match ? { kind: "wiki", slug: match[1] || undefined } : { kind: "canvas" };
}
function trapFocus(event: KeyboardEvent, container: HTMLElement | null) {
  if (!container) return;
  const focusable = [
    ...container.querySelectorAll<HTMLElement>(
      'button, textarea, input, summary, a[href], [tabindex]:not([tabindex="-1"])',
    ),
  ].filter(isVisibleFocusable);
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable.at(-1)!;
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}
function isVisibleFocusable(item: HTMLElement) {
  if (item.matches(':disabled, input[type="hidden"], [hidden], [inert], [aria-hidden="true"]'))
    return false;
  if (item.closest('[hidden], [inert], [aria-hidden="true"]')) return false;
  const closedDetails = item.closest("details:not([open])");
  if (closedDetails && item !== closedDetails.querySelector(":scope > summary")) return false;
  for (let current: HTMLElement | null = item; current; current = current.parentElement) {
    const style = window.getComputedStyle(current);
    if (style.display === "none" || style.visibility === "hidden") return false;
  }
  return true;
}
function titleFromSlug(slug: string) {
  return slug
    .replace(/^\d+-/, "")
    .split("-")
    .map((word) => word[0]?.toUpperCase() + word.slice(1))
    .join(" ");
}
function labelStatus(status: WikiChapter["status"]) {
  return (
    {
      included: "Included now",
      "growth-pattern": "Growth pattern",
      reference: "Reference",
      future: "Future",
    } as const
  )[status];
}
function BookIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 5.5A3.5 3.5 0 0 1 7.5 2H20v17H7.5A3.5 3.5 0 0 0 4 22V5.5Zm0 0V22m4-15h8m-8 4h8" />
    </svg>
  );
}
function CommentIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4v8Z" />
    </svg>
  );
}
