import path from "node:path";
import { runRules } from "./rules/index.js";
import { scan, type ScanOptions } from "./scan.js";
import { PatientVitals, type Finding, type HarnessProfile, type ScannedFile } from "./schema.js";
import { detectedHarnesses, startupLoad, type StartupLoad } from "./vitals.js";

export interface Examination {
  vitals: PatientVitals;
  files: ScannedFile[];
  startup: Record<string, StartupLoad>;
  findings: Finding[];
}

/** Scan + rules: everything about the config, nothing about logs. */
export async function examine(root: string, profiles: HarnessProfile[], opts: ScanOptions = {}): Promise<Examination> {
  root = path.resolve(root);
  const files = await scan(root, profiles, opts);
  const startup = startupLoad(files, profiles);
  const findings = await runRules({ root, files, profiles, startup });
  const vitals = PatientVitals.parse({
    root,
    scannedAt: new Date().toISOString(),
    filesScanned: files.length,
    harnesses: detectedHarnesses(files),
    startupTokens: Object.fromEntries(Object.entries(startup).map(([k, v]) => [k, v.tokens])),
  });
  return { vitals, files, startup, findings };
}
