import { useMemo } from "react";
import { Graph as DagreGraph, layout as dagreLayout } from "@dagrejs/dagre";
import { Background, Controls, Panel, Position, ReactFlow, type Edge, type Node, type NodeProps } from "@xyflow/react";
import type { ConfigGraph } from "@ctxmedic/core";

type EdgeKind = ConfigGraph["edges"][number]["kind"];
type Scope = "project" | "global";
export interface GraphText {
  loads: string;
  symlink: string;
  duplicate: string;
  broken: string;
  project: string;
  global: string;
}

const W = 320;
const H = 44;
const PAD = 24;
const EDGE: Record<EdgeKind, { stroke: string; dash?: string }> = {
  loads: { stroke: "#94a3b8" },
  symlink: { stroke: "#7c3aed" },
  duplicate: { stroke: "#f59e0b", dash: "6 4" },
};
const BROKEN = "#ef4444";
const border = (n: ConfigGraph["nodes"][number]) => (n.broken ? BROKEN : n.kind === "harness" ? "#0284c7" : n.kind === "target" ? "#7c3aed" : "#64748b");

/**
 * Lays the graph out left to right with dagre: harnesses, then the files they load, then symlink targets.
 * Files sit in one box per scope (project, global). Duplicate edges are drawn but do not shape the layout,
 * because they link files of the same rank.
 */
export function layout(data: ConfigGraph, t: GraphText): { nodes: Node[]; edges: Edge[] } {
  const g = new DagreGraph({ compound: true });
  g.setGraph({ rankdir: "LR", nodesep: 10, ranksep: 90, marginx: 10, marginy: 10 });
  g.setDefaultEdgeLabel(() => ({}));
  const ids = new Set(data.nodes.map((n) => n.id));
  const scopes = [...new Set(data.nodes.flatMap((n) => (n.scope ? [n.scope] : [])))];
  for (const s of scopes) g.setNode(`scope:${s}`, { paddingLeft: PAD, paddingRight: PAD, paddingTop: PAD, paddingBottom: PAD });
  for (const n of data.nodes) {
    g.setNode(n.id, { width: W, height: H });
    if (n.scope) g.setParent(n.id, `scope:${n.scope}`);
  }
  for (const e of data.edges) if (e.kind !== "duplicate" && ids.has(e.source) && ids.has(e.target)) g.setEdge(e.source, e.target);
  dagreLayout(g);

  // React Flow wants a parent before its children, and child positions relative to the parent's top-left corner.
  const box = (id: string) => {
    const b = g.node(id);
    return { x: b.x - b.width / 2, y: b.y - b.height / 2, width: b.width, height: b.height };
  };
  const groups: Node[] = scopes.map((s) => {
    const b = box(`scope:${s}`);
    return { id: `scope:${s}`, type: "scope", position: { x: b.x, y: b.y }, data: { label: t[s as Scope] }, style: { width: b.width, height: b.height }, selectable: false, draggable: false };
  });
  const nodes: Node[] = data.nodes.map((n) => {
    const b = box(n.id);
    const parent = n.scope ? box(`scope:${n.scope}`) : { x: 0, y: 0 };
    return {
      id: n.id,
      position: { x: b.x - parent.x, y: b.y - parent.y },
      ...(n.scope ? { parentId: `scope:${n.scope}`, extent: "parent" as const } : {}),
      // Left to right: edges enter on the left and leave on the right (default handles are top and bottom).
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
      data: { label: `${n.label}${n.tokens ? ` · ${n.tokens.toLocaleString("en")} tok` : ""}` },
      style: { border: `1.5px solid ${border(n)}`, borderRadius: 8, fontSize: 11, width: W, height: H, display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1.2 },
    };
  });
  const edges: Edge[] = data.edges.map((e, i) => ({
    id: `e${i}`,
    source: e.source,
    target: e.target,
    animated: e.kind === "symlink",
    style: { stroke: EDGE[e.kind].stroke, strokeDasharray: EDGE[e.kind].dash },
  }));
  return { nodes: [...groups, ...nodes], edges };
}

function ScopeBox({ data }: NodeProps) {
  return (
    <div className="h-full w-full rounded-xl border border-dashed border-slate-300 bg-slate-500/5 px-3 py-1 text-xs font-medium text-slate-500 dark:border-slate-700">
      {String(data.label)}
    </div>
  );
}
const nodeTypes = { scope: ScopeBox };

function Legend({ t }: { t: GraphText }) {
  return (
    <Panel position="top-right" className="space-y-1 rounded-lg border border-slate-200 bg-white/90 p-2 text-xs dark:border-slate-700 dark:bg-slate-900/90">
      {(Object.keys(EDGE) as EdgeKind[]).map((k) => (
        <div key={k} className="flex items-center gap-2">
          <svg width="28" height="6" aria-hidden>
            <line x1="0" y1="3" x2="28" y2="3" stroke={EDGE[k].stroke} strokeWidth="2" strokeDasharray={EDGE[k].dash} />
          </svg>
          {t[k]}
        </div>
      ))}
      <div className="flex items-center gap-2">
        <span className="inline-block h-3 w-7 rounded border-[1.5px]" style={{ borderColor: BROKEN }} aria-hidden />
        {t.broken}
      </div>
    </Panel>
  );
}

export function Graph({ data, t }: { data: ConfigGraph; t: GraphText }) {
  const { nodes, edges } = useMemo(() => layout(data, t), [data, t]);
  return (
    <div className="h-[70vh] overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800">
      <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} colorMode="system" fitView minZoom={0.05}>
        <Background />
        <Controls />
        <Legend t={t} />
      </ReactFlow>
    </div>
  );
}
