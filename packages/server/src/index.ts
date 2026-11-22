import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { checkup, loadHistory, treat, type Lang } from "@ctxmedic/clinical";
import { examine, FixRefusedError, similarity } from "@ctxmedic/core";
import { harnesses } from "@ctxmedic/harnesses";

export interface ServerOptions {
  root: string;
  lang: Lang;
  port?: number;
  /** Directory with the built UI (index.html). */
  publicDir?: string;
  days?: number;
}

/** Builds the API. Write routes require the per-run token (ADR-008), so other local pages cannot trigger fixes. */
export function createApp(opts: ServerOptions & { token: string }) {
  const app = new Hono();
  const root = path.resolve(opts.root);

  app.use("/api/*", async (c, next) => {
    c.header("cache-control", "no-store");
    if (c.req.method !== "GET" && c.req.header("x-ctxmedic-token") !== opts.token) return c.json({ error: "invalid session token" }, 403);
    await next();
  });

  app.get("/api/checkup", async (c) => {
    const lang = (c.req.query("lang") === "uk" ? "uk" : c.req.query("lang") === "en" ? "en" : opts.lang) as Lang;
    return c.json(await checkup({ root, lang, days: opts.days, record: c.req.query("record") === "1" }));
  });

  app.get("/api/history", (c) => c.json(loadHistory(root)));

  /** Nodes and edges for the dependency graph: files per harness, symlinks, duplicates. */
  app.get("/api/graph", async (c) => {
    const ex = await examine(root, harnesses);
    const nodes: { id: string; kind: string; label: string; tokens?: number; broken?: boolean; scope?: string }[] = [
      ...ex.vitals.harnesses.map((h) => ({ id: `h:${h}`, kind: "harness", label: harnesses.find((x) => x.id === h)?.name ?? h })),
      ...ex.files.map((f) => ({ id: f.path, kind: f.role, label: f.rel, tokens: f.tokens, broken: f.broken || f.loop, scope: f.scope })),
    ];
    const edges: { source: string; target: string; kind: string }[] = [];
    for (const f of ex.files) {
      for (const h of f.harnesses) edges.push({ source: `h:${h}`, target: f.path, kind: "loads" });
      if (f.isSymlink && f.realpath) {
        if (!nodes.some((n) => n.id === f.realpath)) nodes.push({ id: f.realpath, kind: "target", label: path.relative(root, f.realpath), tokens: f.tokens, broken: false, scope: f.scope });
        edges.push({ source: f.path, target: f.realpath, kind: "symlink" });
      }
    }
    const docs = ex.files.filter((f) => f.role === "instructions" && f.text && !f.isSymlink);
    for (let i = 0; i < docs.length; i++)
      for (let j = i + 1; j < docs.length; j++)
        if (similarity(docs[i]!.text!, docs[j]!.text!) > 0.75) edges.push({ source: docs[i]!.path, target: docs[j]!.path, kind: "duplicate" });
    return c.json({ nodes, edges });
  });

  app.post("/api/treat/:rx", async (c) => {
    const dryRun = c.req.query("dryRun") === "1";
    try {
      const r = await treat(c.req.param("rx"), { root, lang: opts.lang, days: opts.days, dryRun });
      return c.json({ rx: r.diagnosis.rx.id, applied: r.result?.applied ?? [], backupDir: r.result?.backupDir, dryRun, manual: r.manual });
    } catch (e) {
      return c.json({ error: (e as Error).message }, e instanceof FixRefusedError ? 409 : 500);
    }
  });

  if (opts.publicDir && fs.existsSync(path.join(opts.publicDir, "index.html"))) {
    const rel = path.relative(process.cwd(), opts.publicDir) || ".";
    app.use("/*", serveStatic({ root: rel }));
    app.get("*", serveStatic({ path: path.join(rel, "index.html") }));
  } else app.get("/", (c) => c.text("ctxmedic UI is not built. Run `pnpm build` in the repository."));
  return app;
}

export async function startServer(opts: ServerOptions): Promise<{ url: string; close: () => void }> {
  const token = crypto.randomBytes(16).toString("hex");
  const app = createApp({ ...opts, token });
  return new Promise((resolve) => {
    const server = serve({ fetch: app.fetch, hostname: "127.0.0.1", port: opts.port ?? 7337 }, (info) =>
      resolve({ url: `http://127.0.0.1:${info.port}/#token=${token}`, close: () => server.close() }),
    );
  });
}
