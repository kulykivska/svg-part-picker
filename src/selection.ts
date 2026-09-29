/** Undirected neighbour map: `{ hood: ['windshield', 'front-bumper'] }`. */
export type Adjacency = Record<string, readonly string[]>;

export interface EnableRules {
  /** Parts that can never be selected. */
  disabled?: readonly string[] | null;
  /** When set, only these parts can be selected. */
  allowed?: readonly string[] | null;
  /** When set, a new part must touch the current selection. */
  adjacency?: Adjacency | null;
}

/** Splits a space- or comma-separated attribute value into unique ids. */
export function parseList(value: string | null | undefined): string[] {
  if (!value) return [];
  return unique(value.split(/[\s,]+/).filter(Boolean));
}

export function unique<T>(items: Iterable<T>): T[] {
  return Array.from(new Set(items));
}

/** Makes the neighbour map symmetric, so `a -> b` also implies `b -> a`. */
export function normalizeAdjacency(adjacency: Adjacency): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  const link = (a: string, b: string) => {
    if (a === b) return;
    if (!out.has(a)) out.set(a, new Set());
    out.get(a)!.add(b);
  };
  for (const [part, neighbours] of Object.entries(adjacency)) {
    for (const n of neighbours) {
      link(part, n);
      link(n, part);
    }
  }
  return out;
}

// Returns the ids from `parts` that cannot be toggled on right now.
// Selected parts are never reported, so the user can always deselect them.
export function computeDisabled(
  parts: Iterable<string>,
  selected: ReadonlySet<string>,
  rules: EnableRules,
): Set<string> {
  const disabled = new Set(rules.disabled ?? []);
  const allowed = rules.allowed ? new Set(rules.allowed) : null;
  let reachable: Set<string> | null = null;
  if (rules.adjacency && selected.size > 0) {
    const graph = normalizeAdjacency(rules.adjacency);
    reachable = new Set();
    for (const id of selected) for (const n of graph.get(id) ?? []) reachable.add(n);
    if (reachable.size === 0) reachable = null;
  }
  const out = new Set<string>();
  for (const id of parts) {
    if (selected.has(id)) continue;
    if (disabled.has(id) || (allowed && !allowed.has(id)) || (reachable && !reachable.has(id))) {
      out.add(id);
    }
  }
  return out;
}

export interface SelectionDiff {
  added: string[];
  removed: string[];
}

export function diffSelection(before: readonly string[], after: readonly string[]): SelectionDiff {
  const a = new Set(before);
  const b = new Set(after);
  return {
    added: after.filter((id) => !a.has(id)),
    removed: before.filter((id) => !b.has(id)),
  };
}
