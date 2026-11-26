import { describe, expect, it } from "vitest";
import type { ConfigGraph } from "@ctxmedic/core";
import { layout, type GraphText } from "../src/Graph";

const t: GraphText = { loads: "loads", symlink: "symlink", duplicate: "duplicate", broken: "broken", project: "Project", global: "Global" };

/** A home folder with 25 skills, two project files, a symlink and a duplicate pair. */
function fixture(): ConfigGraph {
  const skills = Array.from({ length: 25 }, (_, i) => ({ id: `/home/.claude/skills/s${i}/SKILL.md`, kind: "skill" as const, label: `s${i}`, scope: "global" as const }));
  return {
    nodes: [
      { id: "h:claude-code", kind: "harness", label: "Claude Code" },
      { id: "h:cursor", kind: "harness", label: "Cursor" },
      { id: "/p/CLAUDE.md", kind: "instructions", label: "CLAUDE.md", scope: "project", tokens: 900 },
      { id: "/p/AGENTS.md", kind: "instructions", label: "AGENTS.md", scope: "project", broken: true },
      { id: "/p/.ai/rules.md", kind: "target", label: ".ai/rules.md", scope: "project" },
      ...skills,
    ],
    edges: [
      { source: "h:claude-code", target: "/p/CLAUDE.md", kind: "loads" },
      { source: "h:cursor", target: "/p/AGENTS.md", kind: "loads" },
      { source: "/p/AGENTS.md", target: "/p/.ai/rules.md", kind: "symlink" },
      { source: "/p/CLAUDE.md", target: "/p/AGENTS.md", kind: "duplicate" },
      ...skills.map((s) => ({ source: "h:claude-code", target: s.id, kind: "loads" as const })),
    ],
  };
}

describe("graph layout", () => {
  const { nodes, edges } = layout(fixture(), t);
  const byId = new Map(nodes.map((n) => [n.id, n]));
  // Absolute top-left corner of a node (children are positioned relative to their parent).
  const abs = (id: string) => {
    const n = byId.get(id)!;
    const p = n.parentId ? byId.get(n.parentId)!.position : { x: 0, y: 0 };
    return { x: n.position.x + p.x, y: n.position.y + p.y };
  };

  it("puts one box per scope before the files it holds", () => {
    expect(nodes.filter((n) => n.type === "scope").map((n) => n.id)).toEqual(["scope:project", "scope:global"]);
    for (const n of nodes) if (n.parentId) expect(nodes.indexOf(byId.get(n.parentId)!)).toBeLessThan(nodes.indexOf(n));
    expect(byId.get("/p/CLAUDE.md")!.parentId).toBe("scope:project");
    expect(byId.get("/home/.claude/skills/s0/SKILL.md")!.parentId).toBe("scope:global");
    expect(byId.get("h:claude-code")!.parentId).toBeUndefined();
  });

  it("does not overlap file nodes", () => {
    const files = nodes.filter((n) => n.type !== "scope").map((n) => ({ id: n.id, ...abs(n.id) }));
    for (let i = 0; i < files.length; i++)
      for (let j = i + 1; j < files.length; j++) {
        const a = files[i]!, b = files[j]!;
        expect(Math.abs(a.x - b.x) >= 320 || Math.abs(a.y - b.y) >= 44, `${a.id} overlaps ${b.id}`).toBe(true);
      }
  });

  it("flows left to right: harnesses before their files", () => {
    expect(abs("h:claude-code").x).toBeLessThan(abs("/p/CLAUDE.md").x);
    expect(abs("/p/AGENTS.md").x).toBeLessThan(abs("/p/.ai/rules.md").x);
  });

  it("keeps every edge, duplicates included, and marks broken nodes red", () => {
    expect(edges).toHaveLength(fixture().edges.length);
    expect(String(byId.get("/p/AGENTS.md")!.style?.border)).toContain("#ef4444");
  });
});
