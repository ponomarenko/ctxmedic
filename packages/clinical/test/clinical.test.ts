import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import type { Finding } from "@ctxmedic/core";
import { checkup, diagnose, healthScore, loadHistory, resolveLang, treat } from "@ctxmedic/clinical";

const f = (ruleId: Finding["ruleId"], severity: Finding["severity"], extra: Partial<Finding> = {}): Finding => ({ ruleId, severity, message: ruleId, files: [], data: {}, ...extra });

describe("health score", () => {
  it("is deterministic, clamped and capped per rule", () => {
    expect(healthScore([])).toBe(100);
    expect(healthScore([f("CRIT_SECRET_LEAK", "critical")])).toBe(75);
    // five criticals from one rule cost at most 2×25
    expect(healthScore(Array.from({ length: 5 }, () => f("CRIT_SECRET_LEAK", "critical")))).toBe(50);
    const many = (["ERR_BROKEN_LINK", "CRIT_SECRET_LEAK", "WARN_CONTEXT_BLOAT", "FIN_CACHE_MISS", "ERR_INVALID_SKILL"] as const).map((r) => f(r, "critical"));
    expect(healthScore(many)).toBe(0);
  });
  it("orders by triage and numbers prescriptions", () => {
    const dx = diagnose([f("INFO_UNSUPPORTED_SYNTAX", "info"), f("CRIT_SECRET_LEAK", "critical")], "en");
    expect(dx.map((d) => d.rx.id)).toEqual(["RX-01", "RX-02"]);
    expect(dx[0]!.triage).toBe("resuscitation");
    expect(dx[0]!.diagnosis).toBe("Credential Hemorrhage");
    expect(dx[0]!.rx.healthGain).toBe(25);
  });
  it("falls back to English for unsupported languages", () => {
    expect(resolveLang("uk")).toBe("en");
    expect(resolveLang("EN-us")).toBe("en");
  });
});

describe("checkup + treat", () => {
  let root: string;
  beforeAll(() => {
    process.env.CTXMEDIC_HOME = fs.mkdtempSync(path.join(os.tmpdir(), "ctxmedic-home-"));
    root = fs.mkdtempSync(path.join(os.tmpdir(), "ctxmedic-proj-"));
    fs.writeFileSync(path.join(root, ".cursorrules"), "Use TypeScript strict mode everywhere.");
    fs.mkdirSync(path.join(root, "dist"));
  });
  it("records history and improves after treatment", async () => {
    const r1 = await checkup({ root, lang: "en" });
    const rx = r1.diagnoses.find((d) => d.code === "FIN_BLOAT_IGNORE")!.rx;
    expect(rx.autoFix).toBe(true);
    const res = await treat(rx.id, { root, lang: "en" });
    expect(res.result?.applied[0]).toContain(".cursorignore");
    const r2 = await checkup({ root, lang: "en" });
    expect(r2.healthScore).toBeGreaterThan(r1.healthScore);
    expect(r2.previous?.healthScore).toBe(r1.healthScore);
    expect(loadHistory(fs.realpathSync(root)).length + loadHistory(root).length).toBeGreaterThanOrEqual(2);
  });
});
