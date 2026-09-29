import { describe, expect, it } from 'vitest';
import { computeDisabled, diffSelection, normalizeAdjacency, parseList } from '../src/selection.js';

const parts = ['hood', 'roof', 'trunk', 'door'];

describe('parseList', () => {
  it('splits on spaces and commas and removes duplicates', () => {
    expect(parseList(' hood, roof  hood ')).toEqual(['hood', 'roof']);
    expect(parseList(null)).toEqual([]);
  });
});

describe('normalizeAdjacency', () => {
  it('makes links symmetric and ignores self links', () => {
    const graph = normalizeAdjacency({ hood: ['roof', 'hood'] });
    expect([...graph.get('hood')!]).toEqual(['roof']);
    expect([...graph.get('roof')!]).toEqual(['hood']);
  });
});

describe('computeDisabled', () => {
  it('disables listed parts and parts outside the allow list', () => {
    const out = computeDisabled(parts, new Set(), { disabled: ['trunk'], allowed: ['hood', 'trunk', 'roof'] });
    expect([...out].sort()).toEqual(['door', 'trunk']);
  });

  it('never disables a selected part', () => {
    const out = computeDisabled(parts, new Set(['trunk']), { disabled: ['trunk'] });
    expect(out.has('trunk')).toBe(false);
  });

  it('with adjacency, only neighbours of the selection stay enabled', () => {
    const adjacency = { hood: ['roof'], roof: ['trunk'] };
    expect(computeDisabled(parts, new Set(), { adjacency }).size).toBe(0);
    const out = computeDisabled(parts, new Set(['hood']), { adjacency });
    expect([...out].sort()).toEqual(['door', 'trunk']);
  });

  it('does not restrict when the selection has no known neighbours', () => {
    const out = computeDisabled(parts, new Set(['door']), { adjacency: { hood: ['roof'] } });
    expect(out.size).toBe(0);
  });
});

describe('diffSelection', () => {
  it('reports added and removed ids', () => {
    expect(diffSelection(['a', 'b'], ['b', 'c'])).toEqual({ added: ['c'], removed: ['a'] });
  });
});
