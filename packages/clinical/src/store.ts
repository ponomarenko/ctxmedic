import fs from "node:fs";
import path from "node:path";
import { stateDir } from "@ctxmedic/core";
import { Anamnesis, Visit, type ScanSettings } from "./schema.js";

const MAX_VISITS = 200;
const historyFile = () => path.join(stateDir(), "history.json");
const profileFile = () => path.join(stateDir(), "profile.json");

function readJson(file: string): unknown {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return undefined;
  }
}

function writeJson(file: string, v: unknown) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file + ".tmp", JSON.stringify(v, null, 2));
  fs.renameSync(file + ".tmp", file);
}

/** `days` only matters when session logs were analyzed. */
export const sameScan = (a: ScanSettings, b: ScanSettings) =>
  a.global === b.global && a.finops === b.finops && (!a.finops || a.days === b.days);

/** Visits, optionally only for one root and only those scanned with the same settings. */
export function loadHistory(root?: string, scan?: ScanSettings): Visit[] {
  const raw = readJson(historyFile());
  const visits = Array.isArray(raw) ? raw.flatMap((v) => { const r = Visit.safeParse(v); return r.success ? [r.data] : []; }) : [];
  return visits.filter((v) => (!root || v.root === root) && (!scan || sameScan(v.scan, scan)));
}

export function recordVisit(v: Visit): void {
  writeJson(historyFile(), [...loadHistory(), Visit.parse(v)].slice(-MAX_VISITS));
}

export function loadAnamnesis(): Anamnesis {
  return Anamnesis.safeParse(readJson(profileFile())).data ?? Anamnesis.parse({});
}

export function saveAnamnesis(a: Anamnesis): void {
  writeJson(profileFile(), Anamnesis.parse(a));
}
