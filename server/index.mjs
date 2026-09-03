import express from "express";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { readFile, readdir } from "node:fs/promises";
import {
  addFeedbackMessageMutation,
  createFeedbackMutation,
  feedbackMode,
  feedbackWakeIntents,
  listFeedback,
  reconcileAgentState,
  reviewFeedbackMutation,
  verifyFeedback,
} from "../.codex/plugins/contextual-feedback/lib/service.mjs";
import { ensureAgentState, stopOutcome } from "../.codex/plugins/agent-stop-state/lib/state.mjs";
import {
  enqueueFeedbackWake,
  hasFeedbackWakeForEvent,
  retryWakeDelivery,
  scheduleWakeDelivery,
  wakeStatus,
} from "../.codex/plugins/_dashboard-runtime/lib/wake-outbox.mjs";
import { runtimeInstanceId } from "../.codex/plugins/_dashboard-runtime/lib/runtime-control.mjs";

const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export async function createOriginApp(options = {}) {
  const root = path.resolve(options.root || sourceRoot);
  const isDev = Boolean(options.dev);
  const serveUi = options.serveUi !== false;
  const app = express();

  app.disable("x-powered-by");
  app.use(securityHeaders);
  app.use(requireLocalRequest);
  app.use(express.json({ limit: "16kb", strict: true, type: "application/json" }));

  app.get("/api/health", (_request, response) => {
    response.json({
      name: "origin",
      instanceId: runtimeInstanceId(root),
      status: "ready",
      localOnly: true,
      ledger: verifyFeedback(root),
      agent: stopOutcome(root),
      delivery: wakeStatus(root),
    });
  });

  app.get("/api/feedback", (_request, response, next) => {
    try {
      response.json({
        records: listFeedback(root),
        feedbackMode: feedbackMode(root),
        outcome: stopOutcome(root),
        delivery: wakeStatus(root),
      });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/feedback", (request, response, next) => {
    try {
      requireJson(request);
      let previous;
      try {
        previous = stopOutcome(root);
      } catch {
        previous = { mode: "idle", reference: null };
      }
      const mutation = createFeedbackMutation(root, request.body);
      const { record, event } = mutation;
      const kind = previous.mode === "active" ? "feedback.during-active" : "feedback.new";
      const wake = enqueueFeedbackWake(root, {
        kind,
        reference: record.id,
        route: record.pagePath,
        activeReference: previous.reference?.id || record.id,
        sourceEventHash: event.hash,
        sourceSequence: event.sequence,
      });
      if (options.deliverWakes !== false) scheduleWakeDelivery(root, options.wakeOptions);
      response.status(201).json({ record, wake, delivery: wakeStatus(root) });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/feedback/wake", async (request, response, next) => {
    try {
      requireJson(request);
      const delivery =
        options.deliverWakes === false
          ? wakeStatus(root)
          : await retryWakeDelivery(root, options.wakeOptions);
      response.json({ delivery });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/session/wake", (request, response, next) => {
    try {
      requireJson(request);
      let wake = null;
      const delivery = wakeStatus(root);
      const mode = feedbackMode(root);
      if (delivery.pending === 0 && mode.mode === "active" && mode.reference?.id) {
        const intent = feedbackWakeIntents(root).find(
          (candidate) => candidate.reference === mode.reference.id,
        );
        if (intent) {
          wake = enqueueFeedbackWake(root, {
            ...intent,
            kind: "feedback.resume",
            activeReference: mode.reference.id,
          });
          if (options.deliverWakes !== false) scheduleWakeDelivery(root, options.wakeOptions);
        }
      }
      response.json({ wake, delivery: wakeStatus(root) });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/feedback/:id/messages", (request, response, next) => {
    try {
      requireJson(request);
      const mutation = addFeedbackMessageMutation(
        root,
        request.params.id,
        {
          role: "user",
          body: request.body?.body,
        },
        { role: "user" },
      );
      const { record, event } = mutation;
      const kind = event.message.type === "answer" ? "feedback.answer" : "feedback.during-active";
      const wake = enqueueFeedbackWake(root, {
        kind,
        reference: record.id,
        route: record.pagePath,
        activeReference: stopOutcome(root).reference?.id || record.id,
        sourceEventHash: event.hash,
        sourceSequence: event.sequence,
      });
      if (options.deliverWakes !== false) scheduleWakeDelivery(root, options.wakeOptions);
      response.status(201).json({ record, wake, delivery: wakeStatus(root) });
    } catch (error) {
      next(error);
    }
  });

  app.patch("/api/feedback/:id", (request, response, next) => {
    try {
      requireJson(request);
      const { status, reason, acceptance } = request.body || {};
      if (!["resolved", "open", "dismissed"].includes(status))
        throw new Error("Dashboard may only accept, reopen, or dismiss feedback.");
      const detail = status === "resolved" ? { acceptance } : { reason };
      const { record, event } = reviewFeedbackMutation(root, request.params.id, status, detail);
      let wake = null;
      if (["resolved", "open", "dismissed"].includes(status)) {
        wake = enqueueFeedbackWake(root, {
          kind:
            status === "resolved"
              ? "feedback.accepted"
              : status === "dismissed"
                ? "feedback.dismissed"
                : "feedback.reopened",
          reference: record.id,
          route: record.pagePath,
          activeReference: stopOutcome(root).reference?.id || record.id,
          sourceEventHash: event.hash,
          sourceSequence: event.sequence,
        });
        if (options.deliverWakes !== false) scheduleWakeDelivery(root, options.wakeOptions);
      }
      response.json({ record, wake, delivery: wakeStatus(root) });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/wiki", async (_request, response, next) => {
    try {
      response.json({ chapters: await wikiIndex(root) });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/wiki/:slug", async (request, response, next) => {
    try {
      if (!/^[a-z0-9-]+$/.test(request.params.slug))
        return response.status(400).json({ error: "Invalid chapter." });
      const chapters = await wikiIndex(root);
      const chapter = chapters.find((item) => item.slug === request.params.slug);
      if (!chapter) return response.status(404).json({ error: "Wiki chapter not found." });
      const content = await readFile(path.join(root, "docs", "wiki", `${chapter.slug}.md`), "utf8");
      response.json({
        ...chapter,
        content: content.replace(/^---\n[\s\S]*?\n---\n/, "").trimStart(),
      });
    } catch (error) {
      next(error);
    }
  });

  app.use("/api", (_request, response) =>
    response.status(404).json({ error: "API route not found." }),
  );

  if (serveUi && isDev) {
    const { createServer } = await import("vite");
    const vite = await createServer({ root, server: { middlewareMode: true }, appType: "spa" });
    app.use(vite.middlewares);
  } else if (serveUi) {
    app.use(express.static(path.join(root, "dist"), { etag: true, maxAge: "1h" }));
    app.use((_request, response) => response.sendFile(path.join(root, "dist", "index.html")));
  }

  app.use((error, _request, response, _next) => {
    if (error?.type === "entity.too.large")
      return response.status(413).json({ error: "JSON body exceeds the 16 KiB limit." });
    if (error?.type === "entity.parse.failed")
      return response.status(400).json({ error: "Invalid JSON body." });
    const message = error instanceof Error ? error.message : "Origin request failed.";
    const expected =
      /required|invalid|between|unknown|not found|corrupt|transition|json|focused|busy|version|integrity|sequence|hash|dashboard|acceptance|review|closed|reopened/i.test(
        message,
      );
    if (!expected) console.error(error);
    response
      .status(expected ? 400 : 500)
      .json({ error: expected ? message : "Origin could not complete the request." });
  });
  return app;
}

export async function startOriginServer(options = {}) {
  const isDev = options.dev ?? process.argv.includes("--dev");
  const port = Number(options.port ?? process.env.ORIGIN_PORT ?? (isDev ? 5173 : 4173));
  const host = options.host ?? process.env.ORIGIN_HOST ?? "127.0.0.1";
  if (!["127.0.0.1", "localhost", "::1"].includes(host))
    throw new Error("Origin 1.0 may bind only to a loopback address.");
  if (!Number.isInteger(port) || port < 0 || port > 65535)
    throw new Error("ORIGIN_PORT must be a valid TCP port.");
  const root = path.resolve(options.root || sourceRoot);
  ensureAgentState(root);
  reconcileAgentState(root);
  ensureRunnableWakeCoverage(root);
  const app = await createOriginApp({ ...options, root, dev: isDev });
  const server = await new Promise((resolve, reject) => {
    const listening = app.listen(port, host, () => resolve(listening));
    listening.once("error", reject);
  });
  if (options.deliverWakes !== false) scheduleWakeDelivery(root, options.wakeOptions);
  return server;
}

function ensureRunnableWakeCoverage(root) {
  const activeReference = feedbackMode(root).reference?.id;
  for (const intent of feedbackWakeIntents(root)) {
    if (hasFeedbackWakeForEvent(root, intent.sourceEventHash)) continue;
    enqueueFeedbackWake(root, {
      ...intent,
      activeReference: activeReference || intent.reference,
    });
  }
}

function securityHeaders(_request, response, next) {
  response.set({
    "Cache-Control": "no-store",
    "Content-Security-Policy":
      "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Resource-Policy": "same-origin",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
  });
  next();
}

function requireLocalRequest(request, response, next) {
  const authority = String(request.headers.host || "").toLowerCase();
  const host = authority.startsWith("[")
    ? authority.slice(1, authority.indexOf("]"))
    : authority.split(":")[0];
  if (!["127.0.0.1", "localhost", "::1"].includes(host))
    return response.status(403).json({ error: "Origin accepts only loopback Host headers." });
  const origin = request.headers.origin;
  if (origin) {
    try {
      if (new URL(origin).host.toLowerCase() !== authority)
        return response.status(403).json({ error: "Cross-origin requests are not allowed." });
    } catch {
      return response.status(403).json({ error: "Invalid request origin." });
    }
  }
  next();
}

function requireJson(request) {
  if (!request.is("application/json"))
    throw new Error("Content-Type application/json is required.");
}

async function wikiIndex(root) {
  const directory = path.join(root, "docs", "wiki");
  const files = (await readdir(directory))
    .filter((name) => /^\d{2}-[a-z0-9-]+\.md$/.test(name))
    .sort();
  return Promise.all(
    files.map(async (name) => {
      const source = await readFile(path.join(directory, name), "utf8");
      const frontmatter = Object.fromEntries(
        (source.match(/^---\n([\s\S]*?)\n---/)?.[1] || "").split("\n").map((line) => {
          const split = line.indexOf(":");
          return split < 0
            ? [line, ""]
            : [line.slice(0, split).trim(), line.slice(split + 1).trim()];
        }),
      );
      return {
        slug: name.replace(/\.md$/, ""),
        title: frontmatter.title || name,
        summary: frontmatter.summary || "Origin growth guidance.",
        status: frontmatter.status || "growth-pattern",
      };
    }),
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  startOriginServer()
    .then((server) => {
      const address = server.address();
      const shownHost =
        typeof address === "object" && address?.address === "::1"
          ? "[::1]"
          : typeof address === "object"
            ? address?.address
            : "127.0.0.1";
      const shownPort =
        typeof address === "object" ? address?.port : process.env.ORIGIN_PORT || 4173;
      console.log(`Origin is ready at http://${shownHost}:${shownPort}`);
    })
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}
