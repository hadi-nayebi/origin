import { useEffect, useState } from "react";
import { api } from "./api";
import type { FeedbackKind, FeedbackRecord, WikiChapter } from "./types";

type Surface = { kind: "canvas" } | { kind: "wiki"; slug?: string };

export default function App() {
  const [surface, setSurface] = useState<Surface>(() => {
    const match = window.location.pathname.match(/^\/wiki\/?([^/]*)/);
    return match ? { kind: "wiki", slug: match[1] || undefined } : { kind: "canvas" };
  });
  const [feedbackOpen, setFeedbackOpen] = useState(false);

  const navigate = (next: Surface) => {
    const path = next.kind === "wiki" ? `/wiki/${next.slug || ""}` : "/";
    window.history.pushState({}, "", path);
    setSurface(next);
  };

  useEffect(() => {
    const handlePop = () => {
      const match = window.location.pathname.match(/^\/wiki\/?([^/]*)/);
      setSurface(match ? { kind: "wiki", slug: match[1] || undefined } : { kind: "canvas" });
    };
    window.addEventListener("popstate", handlePop);
    return () => window.removeEventListener("popstate", handlePop);
  }, []);

  const pagePath = surface.kind === "wiki" ? `/wiki/${surface.slug || ""}` : "/";
  const pageLabel = surface.kind === "wiki" ? "Origin wiki" : "Origin canvas";

  return (
    <div className="origin-shell">
      <header className="brand" aria-label="Origin">
        <span className="brand-mark" aria-hidden="true">O</span>
        <span>Origin</span>
      </header>

      <main>
        {surface.kind === "canvas" ? <EmptyCanvas /> : <Wiki slug={surface.slug} navigate={navigate} />}
      </main>

      <button className="floating-control wiki-control" onClick={() => navigate({ kind: "wiki" })} aria-label="Open Origin wiki">
        <BookIcon />
        <span>Wiki</span>
      </button>
      <button className="floating-control feedback-control" onClick={() => setFeedbackOpen(true)} aria-label="Give feedback">
        <CommentIcon />
        <span>Feedback</span>
      </button>

      {feedbackOpen && <FeedbackPanel pagePath={pagePath} pageLabel={pageLabel} onClose={() => setFeedbackOpen(false)} />}
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
    api.wiki().then(({ chapters }) => setChapters(chapters)).catch((e: Error) => setError(e.message));
  }, []);
  useEffect(() => {
    if (!slug) return setChapter(null);
    api.chapter(slug).then(setChapter).catch((e: Error) => setError(e.message));
  }, [slug]);

  return (
    <section className="wiki-surface">
      <aside className="wiki-nav">
        <button className="back-button" onClick={() => navigate({ kind: "canvas" })}>← Canvas</button>
        <div>
          <p className="eyebrow">Growth guide</p>
          <h1>Origin Wiki</h1>
          <p className="wiki-intro">Patterns for cultivating this empty foundation into a dashboard and harness that fit its user.</p>
        </div>
        <nav aria-label="Wiki chapters">
          {chapters.map((item) => (
            <button className={item.slug === slug ? "chapter-link active" : "chapter-link"} key={item.slug} onClick={() => navigate({ kind: "wiki", slug: item.slug })}>
              <span>{item.title}</span><small>{labelStatus(item.status)}</small>
            </button>
          ))}
        </nav>
      </aside>
      <article className="wiki-article">
        {error ? <p className="error">{error}</p> : chapter ? <Markdown content={chapter.content} /> : <WikiLanding chapters={chapters} navigate={navigate} />}
      </article>
    </section>
  );
}

function WikiLanding({ chapters, navigate }: { chapters: WikiChapter[]; navigate: (surface: Surface) => void }) {
  return <div><p className="eyebrow">Start here</p><h2>The dashboard is empty. Its context is not.</h2><p className="lead">Origin ships only the machinery shared by many dashboard-plus-harness projects. This wiki preserves the patterns an agent can use when the user is ready to grow it.</p><div className="chapter-grid">{chapters.map((chapter) => <button key={chapter.slug} onClick={() => navigate({ kind: "wiki", slug: chapter.slug })}><small>{labelStatus(chapter.status)}</small><strong>{chapter.title}</strong><span>{chapter.summary}</span></button>)}</div></div>;
}

function Markdown({ content }: { content: string }) {
  const blocks = content.split(/\n{2,}/);
  return <>{blocks.map((block, index) => {
    const value = block.trim();
    if (!value || value === "---" || /^\w[\w-]*:/.test(value)) return null;
    const heading = value.match(/^(#{1,3})\s+(.+)$/s);
    if (heading) {
      if (heading[1].length === 1) return <h2 key={index}>{heading[2]}</h2>;
      if (heading[1].length === 2) return <h3 key={index}>{heading[2]}</h3>;
      return <h4 key={index}>{heading[2]}</h4>;
    }
    if (value.startsWith("```")) return <pre key={index}><code>{value.replace(/^```\w*\n?|```$/g, "")}</code></pre>;
    if (value.split("\n").every((line) => /^[-*]\s/.test(line))) return <ul key={index}>{value.split("\n").map((line, i) => <li key={i}>{inline(line.replace(/^[-*]\s/, ""))}</li>)}</ul>;
    if (/^\d+\.\s/.test(value)) return <ol key={index}>{value.split("\n").map((line, i) => <li key={i}>{inline(line.replace(/^\d+\.\s/, ""))}</li>)}</ol>;
    if (value.startsWith("> ")) return <blockquote key={index}>{inline(value.replace(/^>\s?/gm, ""))}</blockquote>;
    return <p key={index}>{inline(value.replace(/\n/g, " "))}</p>;
  })}</>;
}

function inline(text: string) {
  return text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g).map((part, i) => part.startsWith("`") ? <code key={i}>{part.slice(1, -1)}</code> : part.startsWith("**") ? <strong key={i}>{part.slice(2, -2)}</strong> : part);
}

function FeedbackPanel({ pagePath, pageLabel, onClose }: { pagePath: string; pageLabel: string; onClose: () => void }) {
  const [kind, setKind] = useState<FeedbackKind>("update");
  const [body, setBody] = useState("");
  const [records, setRecords] = useState<FeedbackRecord[]>([]);
  const [status, setStatus] = useState("");

  const refresh = () => api.feedback().then(({ records }) => setRecords(records));
  useEffect(() => { void refresh(); }, []);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setStatus("Saving…");
    try { await api.submitFeedback({ kind, body, pagePath, pageLabel }); setBody(""); setStatus("Saved. Your agent can now claim this feedback."); await refresh(); }
    catch (e) { setStatus(e instanceof Error ? e.message : "Could not save feedback."); }
  };

  return <div className="modal-backdrop" role="presentation" onMouseDown={onClose}><section className="feedback-panel" role="dialog" aria-modal="true" aria-labelledby="feedback-title" onMouseDown={(e) => e.stopPropagation()}><header><div><p className="eyebrow">Feedback on {pageLabel}</p><h2 id="feedback-title">Shape what comes next.</h2></div><button onClick={onClose} aria-label="Close feedback">×</button></header><form onSubmit={submit}><fieldset><legend>What kind of feedback is this?</legend>{(["update", "feature", "bug"] as FeedbackKind[]).map((item) => <label key={item}><input type="radio" name="kind" checked={kind === item} onChange={() => setKind(item)} />{item === "update" ? "Content or update" : item === "feature" ? "Feature request" : "Bug report"}</label>)}</fieldset><label className="body-label">What should change?<textarea required minLength={3} maxLength={2000} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Describe the result you want to see…" /></label><button className="primary" type="submit">Save feedback</button>{status && <p className="form-status" aria-live="polite">{status}</p>}</form>{records.length > 0 && <div className="recent-feedback"><h3>Recent feedback</h3>{records.slice(0, 4).map((record) => <div key={record.id}><span>{record.kind.replace("_", " ")}</span><p>{record.body}</p><small>{record.status.replace("_", " ")}</small></div>)}</div>}</section></div>;
}

function labelStatus(status: WikiChapter["status"]) { return ({ included: "Included now", "growth-pattern": "Growth pattern", reference: "Reference", future: "Future" } as const)[status]; }
function BookIcon() { return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5A3.5 3.5 0 0 1 7.5 2H20v17H7.5A3.5 3.5 0 0 0 4 22V5.5Zm0 0V22m4-15h8m-8 4h8" /></svg>; }
function CommentIcon() { return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4v8Z" /></svg>; }
