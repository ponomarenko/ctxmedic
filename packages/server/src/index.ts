import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { checkup, loadHistory, resolveLang, scanSettings, treat, type Lang } from "@ctxmedic/clinical";
import { ConfigGraph, configHash, examine, FixRefusedError, loadConfig, similarity } from "@ctxmedic/core";
import { harnesses } from "@ctxmedic/harnesses";

export interface ServerOptions {
  root: string;
  lang: Lang;
  port?: number;
  /** Directory with the built UI (index.html). */
  publicDir?: string;
  days?: number;
  /** Load the plugins listed in the config (`ui --plugins`, ADR-027). */
  plugins?: boolean;
}

/**
 * Tells subscribers when a config file changes. Watches, without recursion, the folder of every scanned file
 * and, for skills, the folder that holds them (so a new skill shows up). Only changes to scanned files or to
 * skill folders count: home and project folders change all the time (shell history, builds, session logs).
 */
function configWatcher(root: string) {
  const subs = new Set<() => void>();
  let watchers: fs.FSWatcher[] = [];
  let timer: NodeJS.Timeout | undefined;
  let ready: Promise<void> = Promise.resolve();
  const close = () => {
    for (const w of watchers) w.close();
    watchers = [];
  };
  const watch = async () => {
    const ex = await examine(root, harnesses);
    close();
    if (!subs.size) return;
    // folder → names that count there; null means any entry (a folder that holds skills).
    const dirs = new Map<string, Set<string> | null>();
    for (const f of ex.files) {
      const dir = path.dirname(f.path);
      if (dirs.get(dir) !== null) dirs.set(dir, (dirs.get(dir) ?? new Set()).add(path.basename(f.path)));
      if (f.role === "skill") dirs.set(path.dirname(dir), null);
    }
    // macOS replays recent events when a watch starts and reports no-op ones; compare a snapshot instead.
    const sig = (p: string, isDir: boolean) => {
      try {
        if (isDir) return fs.readdirSync(p).sort().join("/");
        const st = fs.statSync(p);
        return `${st.mtimeMs}:${st.size}`;
      } catch {
        return "gone";
      }
    };
    const seen = new Map<string, string>();
    for (const [dir, names] of dirs) {
      if (!names) seen.set(dir, sig(dir, true));
      else for (const n of names) seen.set(path.join(dir, n), sig(path.join(dir, n), false));
    }
    const onEvent = (dir: string, names: Set<string> | null, name: string | null) => {
      const p = names ? (name && names.has(name) ? path.join(dir, name) : null) : dir;
      if (!p) return;
      const now = sig(p, !names);
      if (now === seen.get(p)) return;
      seen.set(p, now);
      changed();
    };
    for (const [dir, names] of dirs) {
      try {
        const w = fs.watch(dir, (_, name) => onEvent(dir, names, name === null ? null : String(name)));
        w.unref();
        watchers.push(w);
      } catch {
        /* the folder is gone; the next change event rescans */
      }
    }
  };
  // Editors fire several events per save: wait for them to settle, rescan (new files), then notify once.
  const changed = () => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      await (ready = watch());
      for (const s of subs) s();
    }, 300);
  };
  return {
    subscribe(fn: () => void): { ready: Promise<void>; off: () => void } {
      subs.add(fn);
      if (subs.size === 1) ready = watch();
      return {
        ready,
        off: () => {
          subs.delete(fn);
          if (!subs.size) {
            clearTimeout(timer);
            close();
          }
        },
      };
    },
  };
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

  const watcher = configWatcher(root);
  /** Server-Sent Events: `ready` once files are watched, then `changed` after a config edit (ADR-003). */
  app.get("/api/events", (c) =>
    streamSSE(c, async (stream) => {
      const sub = watcher.subscribe(() => void stream.writeSSE({ event: "changed", data: "" }));
      stream.onAbort(sub.off);
      await sub.ready;
      await stream.writeSSE({ event: "ready", data: "" });
      while (!stream.aborted) {
        await stream.sleep(25_000);
        if (!stream.aborted) await stream.writeSSE({ event: "ping", data: "" }); // keeps proxies and the browser from timing out
      }
    }),
  );

  app.get("/api/checkup", async (c) => {
    const lang = c.req.query("lang") ? resolveLang(c.req.query("lang")) : opts.lang;
    return c.json(await checkup({ root, lang, days: opts.days, plugins: opts.plugins, record: c.req.query("record") === "1" }));
  });

  // Only visits scanned like /api/checkup scans, so the chart shows no fake jumps (ADR-017).
  app.get("/api/history", (c) => c.json(loadHistory(root, scanSettings({ days: opts.days, config: configHash(loadConfig(root)) }))));

  /** Nodes and edges for the dependency graph: files per harness, symlinks, duplicates. */
  app.get("/api/graph", async (c) => {
    const ex = await examine(root, harnesses);
    const nodes: ConfigGraph["nodes"] = [
      ...ex.vitals.harnesses.map((h) => ({ id: `h:${h}`, kind: "harness" as const, label: harnesses.find((x) => x.id === h)?.name ?? h })),
      ...ex.files.map((f) => ({ id: f.path, kind: f.role, label: f.rel, tokens: f.tokens, broken: f.broken || f.loop, scope: f.scope })),
    ];
    const edges: ConfigGraph["edges"] = [];
    for (const f of ex.files) {
      for (const h of f.harnesses) edges.push({ source: `h:${h}`, target: f.path, kind: "loads" as const });
      if (f.isSymlink && f.realpath) {
        if (!nodes.some((n) => n.id === f.realpath)) nodes.push({ id: f.realpath, kind: "target" as const, label: path.relative(root, f.realpath), tokens: f.tokens, broken: false, scope: f.scope });
        edges.push({ source: f.path, target: f.realpath, kind: "symlink" });
      }
    }
    const docs = ex.files.filter((f) => f.role === "instructions" && f.text && !f.isSymlink);
    for (let i = 0; i < docs.length; i++)
      for (let j = i + 1; j < docs.length; j++)
        if (similarity(docs[i]!.text!, docs[j]!.text!) > 0.75) edges.push({ source: docs[i]!.path, target: docs[j]!.path, kind: "duplicate" });
    return c.json(ConfigGraph.parse({ nodes, edges }));
  });

  app.post("/api/treat/:rx", async (c) => {
    const dryRun = c.req.query("dryRun") === "1";
    try {
      const r = await treat(c.req.param("rx"), { root, lang: opts.lang, days: opts.days, plugins: opts.plugins, dryRun });
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
