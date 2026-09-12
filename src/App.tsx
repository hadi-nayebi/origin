import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { api } from "./api";
import type {
  AgentState,
  DeliveryStatus,
  FeedbackKind,
  FeedbackRecord,
  PluginReference,
  PluginSummary,
  WikiChapter,
} from "./types";

type Surface =
  | { kind: "canvas"; path: string }
  | { kind: "admin"; section: "wiki"; slug?: string }
  | { kind: "admin"; section: "plugins"; plugin?: string };

export default function App() {
  const [surface, setSurface] = useState<Surface>(() => surfaceFromPath(window.location.pathname));
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedbackEnabled, setFeedbackEnabled] = useState(true);
  const [attention, setAttention] = useState(0);
  const refreshAttention = async () => {
    const { records, disabled } = await api.feedback();
    setFeedbackEnabled(!disabled);
    setAttention(
      records.filter(
        (record) => !record.mergedInto && ["waiting", "ready_for_review"].includes(record.status),
      ).length,
    );
  };
  const navigate = (next: Surface) => {
    window.history.pushState({}, "", surfacePath(next));
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
  const pagePath = normalizePagePath(window.location.pathname);
  const pageLabel = pageLabelForSurface(surface, pagePath);
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
          <Admin surface={surface} navigate={navigate} />
        )}
      </main>
      <button
        className="floating-control admin-control"
        onClick={() => navigate({ kind: "admin", section: "wiki" })}
        aria-label="Open Origin admin"
      >
        <AdminIcon />
        <span>Admin</span>
      </button>
      {feedbackEnabled && (
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
      )}
      {feedbackEnabled && feedbackOpen && (
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
        <p className="eyebrow">Hadosh Academy Origin</p>
        <h1 id="canvas-title">Ready to become yours.</h1>
        <p>Ask your agent to shape the first page, or leave feedback to begin.</p>
      </div>
    </section>
  );
}

function Admin({
  surface,
  navigate,
}: {
  surface: Exclude<Surface, { kind: "canvas" }>;
  navigate: (surface: Surface) => void;
}) {
  const [chapters, setChapters] = useState<WikiChapter[]>([]);
  const [chapter, setChapter] = useState<(WikiChapter & { content: string }) | null>(null);
  const [plugins, setPlugins] = useState<PluginSummary[]>([]);
  const [plugin, setPlugin] = useState<PluginReference | null>(null);
  const [loading, setLoading] = useState(
    surface.section === "wiki" ? Boolean(surface.slug) : Boolean(surface.plugin),
  );
  const [error, setError] = useState("");
  useEffect(() => {
    Promise.all([api.wiki(), api.plugins()])
      .then(([wiki, references]) => {
        setChapters(wiki.chapters);
        setPlugins(references.plugins);
      })
      .catch((error: Error) => setError(error.message));
  }, []);
  useEffect(() => {
    let current = true;
    setError("");
    setChapter(null);
    setPlugin(null);
    const selected = surface.section === "wiki" ? surface.slug : surface.plugin;
    setLoading(Boolean(selected));
    if (!selected) {
      return () => {
        current = false;
      };
    }
    const request =
      surface.section === "wiki" ? api.chapter(surface.slug!) : api.plugin(surface.plugin!);
    request
      .then((value) => {
        if (current) {
          if (surface.section === "wiki") setChapter(value as WikiChapter & { content: string });
          else setPlugin(value as PluginReference);
          setLoading(false);
        }
      })
      .catch((error: Error) => {
        if (current) {
          setError(error.message);
          setLoading(false);
        }
      });
    return () => {
      current = false;
    };
  }, [surface.section, surface.section === "wiki" ? surface.slug : surface.plugin]);
  return (
    <section className="admin-surface">
      <aside className="admin-nav">
        <button className="back-button" onClick={() => navigate({ kind: "canvas", path: "/" })}>
          ← Canvas
        </button>
        <div>
          <p className="eyebrow">Repository guide</p>
          <h1>Origin Admin</h1>
          <p className="admin-intro">
            Understand the foundation before asking your agent to extend it.
          </p>
        </div>
        <div className="admin-tabs" role="tablist" aria-label="Admin sections">
          <button
            className={surface.section === "wiki" ? "active" : ""}
            role="tab"
            aria-selected={surface.section === "wiki"}
            onClick={() => navigate({ kind: "admin", section: "wiki" })}
          >
            Wiki
          </button>
          <button
            className={surface.section === "plugins" ? "active" : ""}
            role="tab"
            aria-selected={surface.section === "plugins"}
            onClick={() => navigate({ kind: "admin", section: "plugins" })}
          >
            Plugins
          </button>
        </div>
        {surface.section === "wiki" ? (
          <nav aria-label="Wiki chapters">
            {chapters.map((item) => (
              <button
                className={item.slug === surface.slug ? "admin-link active" : "admin-link"}
                aria-current={item.slug === surface.slug ? "page" : undefined}
                key={item.slug}
                onClick={() => navigate({ kind: "admin", section: "wiki", slug: item.slug })}
              >
                <span>{item.title}</span>
                <small>{labelStatus(item.status)}</small>
              </button>
            ))}
          </nav>
        ) : (
          <nav aria-label="Reference plugins">
            {plugins.map((item) => (
              <button
                className={item.id === surface.plugin ? "admin-link active" : "admin-link"}
                aria-current={item.id === surface.plugin ? "page" : undefined}
                key={item.id}
                onClick={() => navigate({ kind: "admin", section: "plugins", plugin: item.id })}
              >
                <span>{item.name.replace(/^Origin /, "")}</span>
                <small>Reference plugin</small>
              </button>
            ))}
          </nav>
        )}
      </aside>
      <article className="admin-article" aria-live="polite">
        {error ? (
          <p className="error" role="alert">
            {error}
          </p>
        ) : loading ? (
          <p role="status">Loading chapter…</p>
        ) : surface.section === "wiki" && chapter ? (
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{chapter.content}</ReactMarkdown>
        ) : surface.section === "wiki" ? (
          <WikiLanding chapters={chapters} navigate={navigate} />
        ) : plugin ? (
          <PluginDetail plugin={plugin} />
        ) : (
          <PluginLanding plugins={plugins} navigate={navigate} />
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
        Origin is the public Hadosh Academy dashboard-plus-harness substrate. Its wiki teaches how
        the visible world and harness can grow together.
      </p>
      <div className="chapter-grid">
        {chapters.map((chapter) => (
          <button
            key={chapter.slug}
            onClick={() => navigate({ kind: "admin", section: "wiki", slug: chapter.slug })}
          >
            <small>{labelStatus(chapter.status)}</small>
            <strong>{chapter.title}</strong>
            <span>{chapter.summary}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function PluginLanding({
  plugins,
  navigate,
}: {
  plugins: PluginSummary[];
  navigate: (surface: Surface) => void;
}) {
  return (
    <div>
      <p className="eyebrow">Reference implementations</p>
      <h2>Two plugins show how Origin grows.</h2>
      <p className="lead">
        Each plugin owns one coherent objective, durable state, public operations, hooks, voice,
        documentation, and executable proof. Use their structure as a pattern—not their behavior as
        a requirement for every future plugin.
      </p>
      <div className="plugin-grid">
        {plugins.map((item) => (
          <button
            key={item.id}
            onClick={() => navigate({ kind: "admin", section: "plugins", plugin: item.id })}
          >
            <small>{item.id}</small>
            <strong>{item.name}</strong>
            <span>{item.objective}</span>
            <b>{item.complete ? "Complete reference anatomy" : "Reference anatomy needs repair"}</b>
          </button>
        ))}
      </div>
    </div>
  );
}

function PluginDetail({ plugin }: { plugin: PluginReference }) {
  return (
    <div className="plugin-reference">
      <p className="eyebrow">Reference plugin · {plugin.id}</p>
      <h2>{plugin.name}</h2>
      <p className="lead">{plugin.objective}</p>
      <p>{plugin.description}</p>
      <dl className="plugin-metadata">
        <div>
          <dt>Version</dt>
          <dd>{plugin.version}</dd>
        </div>
        <div>
          <dt>Capabilities</dt>
          <dd>{plugin.capabilities.join(" · ") || "No capabilities declared"}</dd>
        </div>
      </dl>
      <section className="plugin-anatomy" aria-labelledby="plugin-anatomy-title">
        <h3 id="plugin-anatomy-title">Anatomy</h3>
        <ul>
          {plugin.anatomy.map((part) => (
            <li key={part.key} className={part.present ? "present" : "missing"}>
              <span aria-hidden="true">{part.present ? "✓" : "!"}</span>
              {part.label}
            </li>
          ))}
        </ul>
      </section>
      {plugin.documents.map((document) => (
        <section className="plugin-document" key={document.name}>
          <header>
            <p className="eyebrow">{document.label}</p>
            <code>{document.name}</code>
          </header>
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{document.content}</ReactMarkdown>
        </section>
      ))}
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
      setStatus(deliveryMessage("Saved", result.delivery));
      await refresh();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not save feedback.");
    } finally {
      setSubmitting(false);
    }
  };
  const controlChannel = async () => {
    try {
      const result = await api.controlFeedback(outcome.mode === "paused" ? "resume" : "pause");
      setOutcome(result.outcome);
      setDelivery(result.delivery);
      setStatus(
        result.outcome.mode === "paused"
          ? "Dashboard channel paused. Incoming comments are retained."
          : "Dashboard channel resumed.",
      );
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : "Could not change dashboard channel state.",
      );
    }
  };
  const retryWake = async () => {
    setStatus("Retrying delivery…");
    try {
      const result = await api.wakeFeedback();
      setDelivery(result.delivery);
      setStatus(deliveryMessage("Retry finished", result.delivery));
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
              Dashboard channel: {outcome.mode} · tmux: {delivery.state}
            </p>
            <p>Saved feedback targets the same interactive Codex session open in your terminal.</p>
            {outcome.reference && <small>Current responsibility: {outcome.reference.id}</small>}
            {delivery.last?.error && <small>{delivery.last.error}</small>}
          </div>
          <button type="button" onClick={controlChannel}>
            {outcome.mode === "paused" ? "Resume dashboard channel" : "Pause dashboard channel"}
          </button>
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
  const needsAttention = ["waiting", "ready_for_review"].includes(record.status);
  const [expanded, setExpanded] = useState(needsAttention);
  useEffect(() => {
    if (needsAttention) setExpanded(true);
  }, [needsAttention]);
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
      record.status === "waiting"
        ? "Answer saved and wake queued."
        : "Comment saved and wake queued.",
    );
  const pullRequest = record.linkedWork
    .find((reference) => reference.startsWith("pull-request:https://github.com/"))
    ?.slice("pull-request:".length);
  const merge = () =>
    run(
      () => api.mergeFeedback(record.id, record.version),
      "Pull request merged; acceptance saved and wake queued.",
    );
  const reopen = () =>
    run(
      () =>
        api.transitionFeedback(record.id, {
          status: "open",
          reason: detail,
          expectedVersion: record.version,
        }),
      "Reopened and wake queued.",
    );
  const dismiss = () =>
    run(
      () =>
        api.transitionFeedback(record.id, {
          status: "dismissed",
          reason: detail,
          expectedVersion: record.version,
        }),
      "Withdrawal saved and wake queued.",
    );
  if (record.mergedInto)
    return (
      <article className="feedback-record">
        <p>{record.body}</p>
        <p>
          Associated with thread <code>{record.mergedInto}</code>. Continue and review the complete
          conversation in its parent thread.
        </p>
      </article>
    );
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
      {pullRequest ? (
        <p className="linked-work">
          <strong>Work unit:</strong>{" "}
          <a href={pullRequest} target="_blank" rel="noreferrer">
            {pullRequest}
          </a>
        </p>
      ) : record.status === "ready_for_review" ? (
        <p className="error" role="alert">
          The agent must link exactly one GitHub pull request before this work can be merged.
        </p>
      ) : null}
      <details open={expanded} onToggle={(event) => setExpanded(event.currentTarget.open)}>
        <summary>Thread and review</summary>
        <div className="thread">
          {record.messages.map((item) => (
            <div className={`thread-message ${item.role}`} key={item.id}>
              <small>
                {item.role} · {item.type}
              </small>
              <p>{item.body}</p>
              {item.material &&
                (item.material.error ? (
                  <p role="alert">{item.material.error}</p>
                ) : (
                  <a
                    href={`/api/feedback/${encodeURIComponent(record.id)}/materials/${encodeURIComponent(item.material.id)}`}
                    download
                  >
                    {item.material.name} ({item.material.size} bytes)
                  </a>
                ))}
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
            Reason to reopen
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
        <label>
          Attach a file to this thread (up to 20 MiB)
          <input
            type="file"
            disabled={updating}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (!file) return;
              if (file.size > 20 * 1024 * 1024) {
                setMessage("File exceeds the 20 MiB limit.");
                return;
              }
              void run(() => api.attachMaterial(record.id, file), "File saved and wake queued.");
            }}
          />
        </label>
        <div className="record-actions">
          {["open", "in_progress", "waiting"].includes(record.status) && (
            <button type="button" disabled={updating || !detail.trim()} onClick={submitMessage}>
              {record.status === "waiting" ? "Send answer" : "Add comment"}
            </button>
          )}
          {record.status === "ready_for_review" && (
            <>
              <button type="button" disabled={updating || !pullRequest} onClick={merge}>
                Merge PR
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
          {["open", "in_progress", "waiting", "ready_for_review"].includes(record.status) && (
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
  const wiki = pathname.match(/^\/(?:admin\/wiki|wiki)(?:\/([^/]*))?\/?$/);
  if (wiki) return { kind: "admin", section: "wiki", slug: wiki[1] || undefined };
  const plugins = pathname.match(/^\/admin\/plugins(?:\/([^/]*))?\/?$/);
  if (plugins) return { kind: "admin", section: "plugins", plugin: plugins[1] || undefined };
  if (/^\/admin\/?$/.test(pathname)) return { kind: "admin", section: "wiki" };
  return { kind: "canvas", path: normalizePagePath(pathname) };
}
function surfacePath(surface: Surface) {
  if (surface.kind === "canvas") return surface.path;
  if (surface.section === "wiki") return `/admin/wiki/${surface.slug || ""}`;
  return `/admin/plugins/${surface.plugin || ""}`;
}
function pageLabelForSurface(surface: Surface, pagePath: string) {
  if (surface.kind === "canvas")
    return pagePath === "/" ? "Origin canvas" : labelFromPath(pagePath);
  if (surface.section === "wiki")
    return `Origin Admin / Wiki${surface.slug ? ` / ${titleFromSlug(surface.slug)}` : ""}`;
  return `Origin Admin / Plugins${surface.plugin ? ` / ${titleFromSlug(surface.plugin)}` : ""}`;
}
function normalizePagePath(pathname: string) {
  const path = pathname.startsWith("/") ? pathname : `/${pathname}`;
  return path.replace(/\/{2,}/g, "/").slice(0, 160) || "/";
}
function labelFromPath(pathname: string) {
  const parts = pathname
    .split("/")
    .filter(Boolean)
    .map((part) => {
      try {
        return decodeURIComponent(part);
      } catch {
        return part;
      }
    })
    .map((part) => titleFromSlug(part));
  return parts.length ? parts.join(" / ").slice(0, 120) : "Origin canvas";
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
function deliveryMessage(prefix: string, delivery: DeliveryStatus) {
  if (delivery.pending > 0)
    return `${prefix}. ${delivery.pending} tmux wake${delivery.pending === 1 ? " is" : "s are"} pending.`;
  if (delivery.state === "connected") return `${prefix}. The tmux wake was delivered.`;
  return `${prefix}. No wake currently requires delivery.`;
}
function AdminIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 4h6v6H4V4Zm10 0h6v6h-6V4ZM4 14h6v6H4v-6Zm10 0h6v6h-6v-6Z" />
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
