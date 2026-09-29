// Each view is cloned twice (stage and tab), so ids and their
// `url(#id)` / `href="#id"` references get a per-clone prefix.
export function prefixIds(root: Element, prefix: string): void {
  const renamed = new Map<string, string>();
  for (const el of Array.from(root.querySelectorAll('[id]'))) {
    const next = `${prefix}-${el.id}`;
    renamed.set(el.id, next);
    el.id = next;
  }
  if (renamed.size === 0) return;
  const fix = (value: string) =>
    value
      .replace(/url\(\s*(['"]?)#([^'")\s]+)\1\s*\)/g, (m, q: string, id: string) =>
        renamed.has(id) ? `url(${q}#${renamed.get(id)}${q})` : m,
      )
      .replace(/^#(.+)$/, (m, id: string) => (renamed.has(id) ? `#${renamed.get(id)}` : m));
  for (const el of [root, ...Array.from(root.querySelectorAll('*'))]) {
    for (const attr of Array.from(el.attributes)) {
      if (attr.name === 'id' || !attr.value.includes('#')) continue;
      const next = fix(attr.value);
      if (next !== attr.value) el.setAttributeNS(attr.namespaceURI, attr.name, next);
    }
  }
}
