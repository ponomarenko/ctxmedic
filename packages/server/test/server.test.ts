import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { checkup, ClinicalReport } from "@ctxmedic/clinical";
import { createApp } from "@ctxmedic/server";

const token = "test-token";
let root: string;
let app: ReturnType<typeof createApp>;
const snapshot = () => fs.readdirSync(root, { recursive: true, encoding: "utf8" }).sort();
const treat = (rx: string, headers: Record<string, string> = { "x-ctxmedic-token": token }) =>
  app.request(`/api/treat/${rx}?dryRun=1`, { method: "POST", headers });
const bloatRx = async () => ClinicalReport.parse(await (await app.request("/api/checkup")).json()).diagnoses.find((d) => d.code === "FIN_BLOAT_IGNORE")!.rx.id;

beforeEach(() => {
  process.env.CTXMEDIC_HOME = fs.mkdtempSync(path.join(os.tmpdir(), "ctxmedic-home-"));
  root = fs.mkdtempSync(path.join(os.tmpdir(), "ctxmedic-srv-"));
  fs.writeFileSync(path.join(root, ".cursorrules"), "Use TypeScript strict mode everywhere.");
  fs.mkdirSync(path.join(root, "dist"));
  app = createApp({ root, lang: "en", token });
});

describe("server", () => {
  it("GET /api/checkup returns a valid ClinicalReport", async () => {
    const res = await app.request("/api/checkup");
    expect(res.status).toBe(200);
    expect(ClinicalReport.parse(await res.json()).patient.harnesses).toContain("cursor");
  });

  it("GET /api/graph returns nodes and edges", async () => {
    const res = await app.request("/api/graph");
    expect(res.status).toBe(200);
    const g = (await res.json()) as { nodes: { id: string; kind: string; label: string }[]; edges: { source: string; target: string; kind: string }[] };
    expect(g.nodes).toContainEqual(expect.objectContaining({ id: "h:cursor", kind: "harness" }));
    expect(g.edges).toContainEqual(expect.objectContaining({ source: "h:cursor", kind: "loads" }));
    for (const e of g.edges) expect(g.nodes.map((n) => n.id)).toContain(e.target);
  });

  it("POST /api/treat without the token returns 403 and changes nothing", async () => {
    const before = snapshot();
    expect((await treat(await bloatRx(), {})).status).toBe(403);
    expect((await treat(await bloatRx(), { "x-ctxmedic-token": "wrong" })).status).toBe(403);
    expect(snapshot()).toEqual(before);
  });

  it("dry-run reports the plan and changes nothing", async () => {
    const before = snapshot();
    const res = await treat(await bloatRx());
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ dryRun: true });
    expect(snapshot()).toEqual(before);
  });

  it("GET /api/history only returns visits scanned like the UI scans", async () => {
    await checkup({ root, lang: "en", global: false });
    await app.request("/api/checkup?record=1");
    const visits = (await (await app.request("/api/history")).json()) as { scan: { global: boolean } }[];
    expect(visits.map((v) => v.scan.global)).toEqual([true]);
  });

  it("unknown RX returns 409", async () => {
    expect((await treat("RX-99")).status).toBe(409);
  });
});

describe("live updates", () => {
  /** Opens /api/events and returns a reader that resolves with the next event name, or null after `ms`. */
  async function events() {
    const ac = new AbortController();
    const res = await app.request("/api/events", { signal: ac.signal });
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    const next = async (ms: number): Promise<string | null> => {
      const deadline = Date.now() + ms;
      for (;;) {
        const m = /event: (\w+)\n[^\n]*\n\n/.exec(buf);
        if (m) {
          buf = buf.slice(m.index + m[0].length);
          if (m[1] !== "ping") return m[1]!;
          continue;
        }
        const left = deadline - Date.now();
        if (left <= 0) return null;
        const chunk = await Promise.race([reader.read(), new Promise<null>((r) => setTimeout(() => r(null), left))]);
        if (!chunk) return null;
        if (chunk.done) return null;
        buf += decoder.decode(chunk.value, { stream: true });
      }
    };
    return { next, close: () => ac.abort() };
  }

  it("sends `changed` within 2 seconds after a config file is edited", async () => {
    const es = await events();
    try {
      expect(await es.next(5000)).toBe("ready");
      fs.appendFileSync(path.join(root, ".cursorrules"), "\nPrefer small functions.");
      expect(await es.next(2000)).toBe("changed");
    } finally {
      es.close();
    }
  });

  it("ignores ctxmedic's own writes", async () => {
    const es = await events();
    try {
      expect(await es.next(5000)).toBe("ready");
      fs.mkdirSync(path.join(root, ".ctxmedic", "backups"), { recursive: true });
      fs.writeFileSync(path.join(root, ".ctxmedic", "backups", "manifest.json"), "{}");
      fs.writeFileSync(path.join(root, "README.md"), "# not a config");
      expect(await es.next(1000)).toBeNull();
    } finally {
      es.close();
    }
  });
});
