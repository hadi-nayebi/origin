import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { api } from "./api";
import type {
  DeliveryStatus,
  FeedbackKind,
  FeedbackRecord,
  FeedbackStatus,
  StopOutcome,
  WikiChapter,
} from "./types";

type Surface = { kind: "canvas" } | { kind: "wiki"; slug?: string };

export default function App() {
  const [surface, setSurface] = useState<Surface>(() => surfaceFromPath(window.location.pathname));
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const navigate = (next: Surface) => {
    window.history.pushState({}, "", next.kind === "wiki" ? `/wiki/${next.slug || ""}` : "/");
    setSurface(next);
  };
  useEffect(() => {
    const handlePop = () => setSurface(surfaceFromPath(window.location.pathname));
    window.addEventListener("popstate", handlePop);
    return () => window.removeEventListener("popstate", handlePop);
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
        aria-label="Give feedback"
      >
        <CommentIcon />
        <span>Feedback</span>
      </button>
      {feedbackOpen && (
        <FeedbackPanel
          pagePath={pagePath}
          pageLabel={pageLabel}
          onClose={() => setFeedbackOpen(false)}
        />
      )}
    </div>
  );
}

function EmptyCanvas() {
  return (
    <section className="empty-canvas" aria-labelledby="canvas-title">
      <div className="empty-message">
        <p className="eyebrow">A local dashboard foundation</p>
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
            Patterns for cultivating this empty foundation into a dashboard and harness that fit its
            user.
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
        Origin ships only the machinery shared by many dashboard-plus-harness projects. This wiki
        preserves the patterns an agent can use when the user is ready to grow it.
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
}: {
  pagePath: string;
  pageLabel: string;
  onClose: () => void;
}) {
  const [kind, setKind] = useState<FeedbackKind>("update");
  const [body, setBody] = useState("");
  const [records, setRecords] = useState<FeedbackRecord[]>([]);
  const [delivery, setDelivery] = useState<DeliveryStatus>({ state: "idle" });
  const [outcome, setOutcome] = useState<StopOutcome>({
    mode: "idle",
    block: false,
    reference: null,
    voiceId: null,
  });
  const [status, setStatus] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [waking, setWaking] = useState(false);
  const panelRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const previousFocus = useRef<HTMLElement | null>(document.activeElement as HTMLElement | null);
  const refresh = async () => {
    const result = await api.feedback();
    setRecords(result.records);
    setDelivery(result.delivery);
    setOutcome(result.outcome);
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
      setStatus(
        result.delivery.state === "unavailable"
          ? "Saved. The agent command is unavailable; run the wake command after installing Codex."
          : result.delivery.state === "disabled"
            ? "Saved to the local queue. Automatic agent delivery is disabled."
            : "Saved to the local queue. The agent runner is active.",
      );
      await refresh();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not save feedback.");
    } finally {
      setSubmitting(false);
    }
  };
  const wake = async () => {
    if (waking) return;
    setWaking(true);
    setStatus("Waking the local agent…");
    try {
      const result = await api.wakeFeedback();
      setDelivery(result.delivery);
      setStatus(
        result.delivery.state === "disabled"
          ? "Automatic agent delivery is disabled by the local operator."
          : "Wake request accepted.",
      );
      await refresh();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not wake the local agent.");
    } finally {
      setWaking(false);
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
              Agent delivery: {delivery.state.replace("-", " ")}
            </p>
            <p>
              Origin uses a headless local worker. It starts when actionable feedback exists and
              writes its output to <code>{delivery.logPath || ".origin/agent.log"}</code>.
            </p>
            {delivery.reference && <small>Working record: {delivery.reference}</small>}
            {delivery.last?.type === "delivery.unavailable" && (
              <small>The last agent attempt did not complete. The supervisor will retry.</small>
            )}
          </div>
          {outcome.block && delivery.state === "unavailable" && (
            <button type="button" onClick={wake} disabled={waking}>
              {waking ? "Waking…" : "Wake agent"}
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
            <h3>Feedback ledger</h3>
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
  const act = async (status: FeedbackStatus) => {
    if (updating) return;
    setUpdating(true);
    setMessage("Updating…");
    try {
      await api.transitionFeedback(record.id, {
        status,
        ...(status === "resolved"
          ? { evidence: detail }
          : ["waiting", "dismissed", "open"].includes(status)
            ? { reason: detail }
            : {}),
      });
      setDetail("");
      setMessage("Updated.");
      await onChanged();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not update feedback.");
    } finally {
      setUpdating(false);
    }
  };
  const actions: FeedbackStatus[] =
    record.status === "open"
      ? ["in_progress", "dismissed"]
      : record.status === "in_progress"
        ? ["waiting", "resolved", "dismissed"]
        : record.status === "waiting"
          ? ["in_progress", "dismissed"]
          : ["open"];
  const requiresDetail = actions.some((action) =>
    ["waiting", "resolved", "dismissed", "open"].includes(action),
  );
  return (
    <article className="feedback-record">
      <div className="record-meta">
        <span>{record.kind}</span>
        <small>{record.status.replace("_", " ")}</small>
      </div>
      <p>{record.body}</p>
      <small>{record.pageLabel}</small>
      <details>
        <summary>Manage</summary>
        {requiresDetail && (
          <label>
            Reason or verification evidence
            <textarea value={detail} onChange={(event) => setDetail(event.target.value)} />
          </label>
        )}
        <div className="record-actions">
          {actions.map((action) => (
            <button type="button" key={action} disabled={updating} onClick={() => act(action)}>
              {actionLabel(action)}
            </button>
          ))}
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
  if (item.matches(':disabled, input[type="hidden"], [hidden], [inert], [aria-hidden="true"]')) {
    return false;
  }
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
function actionLabel(status: FeedbackStatus) {
  return (
    {
      open: "Reopen",
      in_progress: "Start",
      waiting: "Wait",
      resolved: "Resolve",
      dismissed: "Dismiss",
    } as const
  )[status];
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
