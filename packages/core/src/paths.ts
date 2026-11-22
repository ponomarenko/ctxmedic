import os from "node:os";
import path from "node:path";

/** Home used for every global path; overridable for tests and CI (ADR-013). */
export const homeDir = () => process.env.CTXMEDIC_HOME || os.homedir();
export const stateDir = () => path.join(homeDir(), ".ctxmedic");
export const expandHome = (p: string) => (p.startsWith("~/") ? path.join(homeDir(), p.slice(2)) : p);
