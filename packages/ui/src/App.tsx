import { useCallback, useEffect, useMemo, useState } from "react";
import { Background, Controls, ReactFlow, type Edge, type Node } from "@xyflow/react";
import { Activity, CircleDollarSign, GitBranch, HeartPulse, Languages, Loader2, RefreshCw, Stethoscope, Wrench } from "lucide-react";
import type { ClinicalDiagnosis, ClinicalReport, Visit } from "@ctxmedic/clinical";

type Tab = "dashboard" | "diagnoses" | "finops" | "graph";
interface GraphData {
  nodes: { id: string; kind: string; label: string; tokens?: number; broken?: boolean }[];
  edges: { source: string; target: string; kind: string }[];
}

const token = new URLSearchParams(location.hash.slice(1)).get("token") ?? "";
const usd = (n: number) => `$${n.toFixed(2)}`;
// UI strings per language. To add one, add a catalog here (keys are checked against `en`) and in packages/clinical/src/i18n.ts.
const L = {
  en: { dashboard: "Dashboard", diagnoses: "Diagnoses", finops: "FinOps", graph: "Graph", health: "Health Score", savings: "Potential savings", spend: "Spend", runRate: "Run rate", cache: "Cache hit", treat: "Treat", dry: "Preview", trend: "Recovery dynamics", none: "No complaints. The patient is healthy.", noLogs: "No session logs found.", prognosis: "Prognosis", rx: "Prescription", manual: "Manual treatment", model: "Model", cost: "Cost", requests: "Requests", mo: "/mo" },
} satisfies Record<string, Record<string, string>>;
type Lang = keyof typeof L;
const LANGS = Object.keys(L) as Lang[];
const TRIAGE = {
  resuscitation: { dot: "bg-red-500", ring: "border-red-500/40", label: { en: "Resuscitation" } },
  therapy: { dot: "bg-amber-500", ring: "border-amber-500/40", label: { en: "Therapy" } },
  preventive: { dot: "bg-emerald-500", ring: "border-emerald-500/40", label: { en: "Preventive" } },
} as const;

const scoreColor = (s: number) => (s >= 90 ? "text-emerald-500" : s >= 70 ? "text-amber-500" : "text-red-500");

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, { ...init, headers: { "x-ctxmedic-token": token, ...init?.headers } });
  const body = await r.json();
  if (!r.ok) throw new Error(body.error ?? r.statusText);
  return body as T;
}

function Panel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <section className={`rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 ${className}`}>{children}</section>;
}

function Stat({ icon, label, value, accent = "" }: { icon: React.ReactNode; label: string; value: string; accent?: string }) {
  return (
    <Panel>
      <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">{icon}{label}</div>
      <div className={`mt-2 text-3xl font-semibold tabular-nums ${accent}`}>{value}</div>
    </Panel>
  );
}

function Trend({ visits }: { visits: Visit[] }) {
  const pts = visits.slice(-30);
  if (pts.length < 2) return <p className="text-sm text-slate-500">—</p>;
  const w = 600;
  const h = 120;
  const x = (i: number) => (i / (pts.length - 1)) * w;
  const y = (s: number) => h - (s / 100) * h;
  const d = pts.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v.healthScore).toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-32 w-full" role="img" aria-label="Health Score history">
      <path d={d} fill="none" stroke="currentColor" strokeWidth="2.5" className="text-sky-500" />
      {pts.map((v, i) => (
        <circle key={v.at} cx={x(i)} cy={y(v.healthScore)} r="3.5" className="fill-sky-500">
          <title>{`${v.at.slice(0, 16).replace("T", " ")}: ${v.healthScore}`}</title>
        </circle>
      ))}
    </svg>
  );
}

function Card({ d, lang, onTreat }: { d: ClinicalDiagnosis; lang: Lang; onTreat: (rx: string, dry: boolean) => void }) {
  const t = L[lang];
  const tr = TRIAGE[d.triage];
  return (
    <Panel className={`border-l-4 ${tr.ring}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-slate-500">
            <span className={`h-2 w-2 rounded-full ${tr.dot}`} />
            {tr.label[lang]} · {d.rx.id} · <code>{d.code}</code>
          </div>
          <h3 className="mt-1 text-lg font-semibold">{d.diagnosis}</h3>
          <p className="text-sm text-slate-600 dark:text-slate-300">{d.summary}</p>
        </div>
        <div className="flex gap-2">
          {d.rx.autoFix ? (
            <>
              <button onClick={() => onTreat(d.rx.id, true)} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800">{t.dry}</button>
              <button onClick={() => onTreat(d.rx.id, false)} className="flex items-center gap-1.5 rounded-lg bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-700"><Wrench size={14} />{t.treat}</button>
            </>
          ) : (
            <span className="rounded-lg bg-slate-100 px-3 py-1.5 text-sm text-slate-500 dark:bg-slate-800">{t.manual}</span>
          )}
        </div>
      </div>
      <dl className="mt-4 grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[10rem_1fr]">
        {d.vitals.map((v) => (
          <div key={v.label} className="contents">
            <dt className="text-slate-500">{v.label}</dt>
            <dd className="break-all font-mono text-xs leading-5">{v.value}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-sm"><span className="font-medium">{t.prognosis}: </span>{d.prognosis}</p>
      <p className="mt-1 text-sm">
        <span className="font-medium">Rx: </span>{d.rx.action}
        {(d.rx.healthGain > 0 || d.rx.monthlySavingsUsd) && (
          <span className="ml-2 text-emerald-600 dark:text-emerald-400">
            {d.rx.healthGain > 0 && `+${d.rx.healthGain}`} {d.rx.monthlySavingsUsd ? `${usd(d.rx.monthlySavingsUsd)}${t.mo}` : ""}
          </span>
        )}
      </p>
    </Panel>
  );
}

function Graph({ data }: { data: GraphData }) {
  const { nodes, edges } = useMemo(() => {
    const col = (k: string) => (k === "harness" ? 0 : k === "target" ? 2 : 1);
    const rows = [0, 0, 0];
    const nodes: Node[] = data.nodes.map((n) => {
      const c = col(n.kind);
      const y = rows[c]!++ * 64;
      const color = n.broken ? "#ef4444" : n.kind === "harness" ? "#0284c7" : n.kind === "target" ? "#7c3aed" : "#64748b";
      return {
        id: n.id,
        position: { x: c * 340, y },
        data: { label: `${n.label}${n.tokens ? ` · ${n.tokens.toLocaleString("en")} tok` : ""}` },
        style: { border: `1.5px solid ${color}`, borderRadius: 8, fontSize: 11, width: 280, background: "var(--node-bg, white)" },
      };
    });
    const edges: Edge[] = data.edges.map((e, i) => ({
      id: `e${i}`,
      source: e.source,
      target: e.target,
      animated: e.kind === "symlink",
      label: e.kind === "loads" ? undefined : e.kind,
      style: { stroke: e.kind === "duplicate" ? "#f59e0b" : e.kind === "symlink" ? "#7c3aed" : "#94a3b8", strokeDasharray: e.kind === "duplicate" ? "6 4" : undefined },
    }));
    return { nodes, edges };
  }, [data]);
  return (
    <div className="h-[70vh] overflow-hidden rounded-xl border border-slate-200 bg-white text-slate-900 dark:border-slate-800">
      <ReactFlow nodes={nodes} edges={edges} fitView minZoom={0.1}>
        <Background />
        <Controls />
      </ReactFlow>
    </div>
  );
}

export function App() {
  const [lang, setLang] = useState<Lang>(() => LANGS.find((l) => navigator.language.startsWith(l)) ?? "en");
  const [tab, setTab] = useState<Tab>("dashboard");
  const [report, setReport] = useState<ClinicalReport | null>(null);
  const [history, setHistory] = useState<Visit[]>([]);
  const [graph, setGraph] = useState<GraphData | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const t = L[lang];

  const load = useCallback(async (record = false) => {
    setBusy(true);
    try {
      setReport(await api<ClinicalReport>(`/api/checkup?lang=${lang}${record ? "&record=1" : ""}`));
      setHistory(await api<Visit[]>("/api/history"));
    } catch (e) {
      setToast((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, [lang]);

  useEffect(() => void load(true), []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => void (report && load()), [lang]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => void (tab === "graph" && !graph && api<GraphData>("/api/graph").then(setGraph).catch((e) => setToast(e.message))), [tab, graph]);

  const onTreat = async (rx: string, dry: boolean) => {
    if (!dry && !confirm(`${t.treat} ${rx}? Originals are backed up to .ctxmedic/backups.`)) return;
    try {
      const r = await api<{ applied: string[]; backupDir?: string; manual?: string }>(`/api/treat/${rx}${dry ? "?dryRun=1" : ""}`, { method: "POST" });
      setToast(r.manual ?? `${dry ? "Preview" : "Done"}:\n${r.applied.join("\n")}${!dry && r.backupDir ? `\nBackup: ${r.backupDir}` : ""}`);
      if (!dry) {
        setGraph(null);
        await load(true);
      }
    } catch (e) {
      setToast((e as Error).message);
    }
  };

  const f = report?.finops;
  const tabs: [Tab, React.ReactNode][] = [
    ["dashboard", <HeartPulse size={16} />],
    ["diagnoses", <Stethoscope size={16} />],
    ["finops", <CircleDollarSign size={16} />],
    ["graph", <GitBranch size={16} />],
  ];

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold">🩺 ctxmedic <span className="text-sm font-normal text-slate-500">{report?.version}</span></h1>
          <p className="truncate text-sm text-slate-500">{report?.patient.root}</p>
        </div>
        <div className="flex items-center gap-2">
          {LANGS.length > 1 && <button onClick={() => setLang(LANGS[(LANGS.indexOf(lang) + 1) % LANGS.length]!)} className="flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm dark:border-slate-700" aria-label="Switch language"><Languages size={14} />{lang.toUpperCase()}</button>}
          <button onClick={() => load(true)} disabled={busy} className="flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm dark:border-slate-700" aria-label="Re-run checkup">{busy ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}</button>
        </div>
      </header>

      <nav className="mt-5 flex gap-1 overflow-x-auto border-b border-slate-200 dark:border-slate-800">
        {tabs.map(([id, icon]) => (
          <button key={id} onClick={() => setTab(id)} className={`flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2 text-sm ${tab === id ? "border-sky-500 font-medium" : "border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"}`}>
            {icon}{t[id]}
            {id === "diagnoses" && report ? <span className="rounded-full bg-slate-200 px-1.5 text-xs dark:bg-slate-800">{report.diagnoses.length}</span> : null}
          </button>
        ))}
      </nav>

      {toast && (
        <div role="status" className="mt-4 flex items-start justify-between gap-3 whitespace-pre-wrap rounded-lg border border-sky-300 bg-sky-50 p-3 font-mono text-xs dark:border-sky-800 dark:bg-sky-950">
          {toast}
          <button onClick={() => setToast(null)} aria-label="Dismiss">✕</button>
        </div>
      )}

      {!report ? (
        <div className="mt-20 flex justify-center text-slate-500"><Loader2 className="animate-spin" /></div>
      ) : (
        <main className="mt-5 space-y-4">
          {tab === "dashboard" && (
            <>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Stat icon={<HeartPulse size={16} />} label={t.health} value={`${report.healthScore}/100`} accent={scoreColor(report.healthScore)} />
                <Stat icon={<CircleDollarSign size={16} />} label={t.savings} value={`${usd(report.potentialMonthlySavingsUsd)}${t.mo}`} accent="text-emerald-500" />
                <Stat icon={<Activity size={16} />} label={t.runRate} value={f?.sessions ? `${usd(f.monthlyRunRateUsd)}${t.mo}` : "—"} />
                <Stat icon={<Activity size={16} />} label={t.cache} value={f?.cacheHitRatio != null ? `${Math.round(f.cacheHitRatio * 100)}%` : "—"} />
              </div>
              <Panel>
                <p className="text-lg italic">{report.opinion}</p>
                <div className="mt-3 flex flex-wrap gap-4 text-sm">
                  {(Object.keys(TRIAGE) as (keyof typeof TRIAGE)[]).map((k) => (
                    <span key={k} className="flex items-center gap-1.5"><span className={`h-2.5 w-2.5 rounded-full ${TRIAGE[k].dot}`} />{TRIAGE[k].label[lang]}: <b>{report.counts[k]}</b></span>
                  ))}
                  <span className="text-slate-500">{report.patient.harnesses.join(", ")}</span>
                </div>
              </Panel>
              <Panel>
                <h2 className="mb-2 font-medium">{t.trend}</h2>
                <Trend visits={history} />
              </Panel>
            </>
          )}

          {tab === "diagnoses" && (report.diagnoses.length ? report.diagnoses.map((d) => <Card key={d.rx.id} d={d} lang={lang} onTreat={onTreat} />) : <Panel>{t.none}</Panel>)}

          {tab === "finops" && (
            !f?.sessions ? <Panel>{t.noLogs}</Panel> : (
              <>
                <div className="grid gap-4 sm:grid-cols-3">
                  <Stat icon={<CircleDollarSign size={16} />} label={`${t.spend} (${f.periodDays}d)`} value={usd(f.costUsd)} />
                  <Stat icon={<Activity size={16} />} label={t.runRate} value={`${usd(f.monthlyRunRateUsd)}${t.mo}`} />
                  <Stat icon={<CircleDollarSign size={16} />} label={t.savings} value={`${usd(f.potentialMonthlySavingsUsd)}${t.mo}`} accent="text-emerald-500" />
                </div>
                <Panel className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-left text-slate-500"><tr><th className="py-1">{t.model}</th><th className="text-right">{t.requests}</th><th className="text-right">{t.cost}</th><th className="w-1/3" /></tr></thead>
                    <tbody>
                      {f.byModel.map((m) => (
                        <tr key={m.model} className="border-t border-slate-100 dark:border-slate-800">
                          <td className="py-1.5 font-mono text-xs">{m.model}</td>
                          <td className="text-right tabular-nums">{m.steps.toLocaleString("en")}</td>
                          <td className="text-right tabular-nums">{usd(m.costUsd)}</td>
                          <td className="pl-3"><div className="h-2 rounded bg-sky-500" style={{ width: `${(m.costUsd / (f.byModel[0]?.costUsd || 1)) * 100}%` }} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="mt-2 text-xs text-slate-500">Prices as of {f.pricingAsOf}. Token counts come from local session logs; nothing leaves this machine.</p>
                </Panel>
                {report.diagnoses.filter((d) => d.code.startsWith("FIN_")).map((d) => <Card key={d.rx.id} d={d} lang={lang} onTreat={onTreat} />)}
              </>
            )
          )}

          {tab === "graph" && (graph ? <Graph data={graph} /> : <div className="flex justify-center py-20"><Loader2 className="animate-spin" /></div>)}
        </main>
      )}
    </div>
  );
}
