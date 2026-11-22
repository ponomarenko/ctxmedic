import path from "node:path";
import { applyConfig, levelOf, loadConfig, optionsOf, type CtxmedicConfig } from "./config.js";
import { runRules } from "./rules/index.js";
import { scan, type ScanOptions } from "./scan.js";
import { PatientVitals, type Finding, type HarnessProfile, type ScannedFile } from "./schema.js";
import { detectedHarnesses, startupLoad, type StartupLoad } from "./vitals.js";

export interface Examination {
  vitals: PatientVitals;
  files: ScannedFile[];
  startup: Record<string, StartupLoad>;
  findings: Finding[];
  /** `ctxmedic.config.json`, already applied to `findings`; pass it on to `analyze`. */
  config: CtxmedicConfig;
}

/** Scan + rules: everything about the config, nothing about logs. */
export async function examine(root: string, profiles: HarnessProfile[], opts: ScanOptions = {}): Promise<Examination> {
  root = path.resolve(root);
  const config = loadConfig(root);
  const files = await scan(root, profiles, opts);
  const startup = startupLoad(files, profiles);
  const entries = Object.entries(config.rules);
  const off = new Set(entries.filter(([, e]) => levelOf(e) === "off").map(([id]) => id));
  const options = Object.fromEntries(entries.map(([id, e]) => [id, optionsOf(e)]));
  const findings = applyConfig(await runRules({ root, files, profiles, startup }, undefined, options, off), files, config);
  const vitals = PatientVitals.parse({
    root,
    scannedAt: new Date().toISOString(),
    filesScanned: files.length,
    harnesses: detectedHarnesses(files),
    startupTokens: Object.fromEntries(Object.entries(startup).map(([k, v]) => [k, v.tokens])),
  });
  return { vitals, files, startup, findings, config };
}
