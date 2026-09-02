import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFile, readdir } from "node:fs/promises";
import {
  createFeedback,
  listFeedback,
  stopOutcome,
} from "../.codex/plugins/feedback-loop/lib/service.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const isDev = process.argv.includes("--dev");
const port = Number(process.env.ORIGIN_PORT || (isDev ? 5173 : 4173));
const host = process.env.ORIGIN_HOST || "127.0.0.1";
const app = express();

app.disable("x-powered-by");
app.use(express.json({ limit: "16kb" }));

app.get("/api/health", (_request, response) => {
  response.json({ name: "origin", status: "ready", localOnly: host === "127.0.0.1" || host === "localhost" });
});

app.get("/api/feedback", (_request, response, next) => {
  try {
    response.json({ records: listFeedback(root), outcome: stopOutcome(root).mode });
  } catch (error) { next(error); }
});

app.post("/api/feedback", (request, response, next) => {
  try {
    const record = createFeedback(root, request.body);
    response.status(201).json(record);
  } catch (error) { next(error); }
});

app.get("/api/wiki", async (_request, response, next) => {
  try { response.json({ chapters: await wikiIndex() }); }
  catch (error) { next(error); }
});

app.get("/api/wiki/:slug", async (request, response, next) => {
  try {
    if (!/^[a-z0-9-]+$/.test(request.params.slug)) return response.status(400).json({ error: "Invalid chapter." });
    const chapters = await wikiIndex();
    const chapter = chapters.find((item) => item.slug === request.params.slug);
    if (!chapter) return response.status(404).json({ error: "Wiki chapter not found." });
    const content = await readFile(path.join(root, "docs", "wiki", `${chapter.slug}.md`), "utf8");
    response.json({ ...chapter, content: content.replace(/^---\n[\s\S]*?\n---\n/, "") });
  } catch (error) { next(error); }
});

if (isDev) {
  const { createServer } = await import("vite");
  const vite = await createServer({ root, server: { middlewareMode: true }, appType: "spa" });
  app.use(vite.middlewares);
} else {
  app.use(express.static(path.join(root, "dist")));
  app.use((_request, response) => response.sendFile(path.join(root, "dist", "index.html")));
}

app.use((error, _request, response, _next) => {
  const message = error instanceof Error ? error.message : "Origin request failed.";
  const expected = /required|invalid|between|unknown|not found|corrupt/i.test(message);
  if (!expected) console.error(error);
  response.status(expected ? 400 : 500).json({ error: expected ? message : "Origin could not complete the request." });
});

app.listen(port, host, () => console.log(`Origin is ready at http://${host}:${port}`));

async function wikiIndex() {
  const directory = path.join(root, "docs", "wiki");
  const files = (await readdir(directory)).filter((name) => /^\d{2}-[a-z0-9-]+\.md$/.test(name)).sort();
  return Promise.all(files.map(async (name) => {
    const source = await readFile(path.join(directory, name), "utf8");
    const frontmatter = Object.fromEntries((source.match(/^---\n([\s\S]*?)\n---/)?.[1] || "").split("\n").map((line) => {
      const split = line.indexOf(":");
      return split < 0 ? [line, ""] : [line.slice(0, split).trim(), line.slice(split + 1).trim()];
    }));
    return {
      slug: name.replace(/\.md$/, ""),
      title: frontmatter.title || name,
      summary: frontmatter.summary || "Origin growth guidance.",
      status: frontmatter.status || "growth-pattern",
    };
  }));
}
