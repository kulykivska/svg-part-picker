export const styles = /* css */ `
:host {
  --spp-accent: #2563eb;
  --spp-bg: light-dark(#ffffff, #0f172a);
  --spp-surface: light-dark(#f8fafc, #111c33);
  --spp-border: light-dark(#e2e8f0, #1e293b);
  --spp-text: light-dark(#0f172a, #e2e8f0);
  --spp-muted: light-dark(#64748b, #94a3b8);
  --spp-line: light-dark(#94a3b8, #475569);
  --spp-part-fill: color-mix(in srgb, var(--spp-accent) 5%, var(--spp-bg));
  --spp-part-stroke: light-dark(#475569, #94a3b8);
  --spp-part-stroke-width: 1.5;
  --spp-part-hover-fill: color-mix(in srgb, var(--spp-accent) 18%, var(--spp-bg));
  --spp-selected-fill: color-mix(in srgb, var(--spp-accent) 70%, var(--spp-bg));
  --spp-selected-stroke: var(--spp-accent);
  --spp-disabled-opacity: 0.3;
  --spp-radius: 14px;
  --spp-font: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;

  display: block;
  height: 28rem;
  font-family: var(--spp-font);
  color: var(--spp-text);
}
:host([hidden]) { display: none; }

.root {
  box-sizing: border-box;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--spp-bg);
  border: 1px solid var(--spp-border);
  border-radius: var(--spp-radius);
  overflow: hidden;
}

.tabs {
  display: flex;
  gap: 6px;
  padding: 8px;
  border-bottom: 1px solid var(--spp-border);
  background: var(--spp-surface);
  overflow-x: auto;
}
.tabs[hidden] { display: none; }
.tab {
  all: unset;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 10px 4px 4px;
  border-radius: 10px;
  border: 1px solid transparent;
  color: var(--spp-muted);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.15s, color 0.15s, border-color 0.15s;
}
.tab:hover { color: var(--spp-text); background: var(--spp-bg); }
.tab[aria-selected="true"] {
  color: var(--spp-text);
  background: var(--spp-bg);
  border-color: var(--spp-border);
  box-shadow: 0 1px 2px rgb(0 0 0 / 0.06);
}
.tab:focus-visible { outline: 2px solid var(--spp-accent); outline-offset: 1px; }
.thumb {
  width: 44px;
  height: 30px;
  border-radius: 6px;
  background: var(--spp-bg);
  pointer-events: none;
}
.thumb [data-part] { --spp-part-stroke-width: 0.75; }
.badge {
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  box-sizing: border-box;
  border-radius: 9px;
  background: var(--spp-accent);
  color: #fff;
  font-size: 11px;
  font-weight: 600;
  line-height: 18px;
  text-align: center;
}
.badge[hidden] { display: none; }

.stage {
  position: relative;
  flex: 1 1 auto;
  min-height: 0;
  background:
    radial-gradient(circle, color-mix(in srgb, var(--spp-line) 35%, transparent) 1px, transparent 1.5px) 0 0 / 18px 18px,
    var(--spp-bg);
}
.view {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  color: var(--spp-line);
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
  outline: none;
}
.view[hidden] { display: none; }
.view.is-zoomed { cursor: grab; }
.view.is-panning { cursor: grabbing; }
.view.is-panning [data-part] { cursor: grabbing; }
.empty {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  color: var(--spp-muted);
  font-size: 14px;
}
.empty[hidden] { display: none; }

[data-part],
[data-part] :is(path, rect, circle, ellipse, polygon, polyline) {
  fill: var(--spp-part-fill);
  stroke: var(--spp-part-stroke);
  stroke-width: var(--spp-part-stroke-width);
  stroke-linejoin: round;
  vector-effect: non-scaling-stroke;
  transition: fill 0.15s, stroke 0.15s, opacity 0.15s;
}
.view [data-part] { cursor: pointer; outline: none; }
.view [data-part]:hover,
.view [data-part]:hover :is(path, rect, circle, ellipse, polygon, polyline) {
  fill: var(--spp-part-hover-fill);
  stroke: var(--spp-selected-stroke);
}
.view [data-part]:focus-visible,
.view [data-part]:focus-visible :is(path, rect, circle, ellipse, polygon, polyline) {
  stroke: var(--spp-selected-stroke);
  stroke-width: 3;
}
[data-part].is-selected,
[data-part].is-selected :is(path, rect, circle, ellipse, polygon, polyline),
.view [data-part].is-selected:hover,
.view [data-part].is-selected:hover :is(path, rect, circle, ellipse, polygon, polyline) {
  fill: var(--spp-selected-fill);
  stroke: var(--spp-selected-stroke);
}
[data-part].is-disabled { opacity: var(--spp-disabled-opacity); }
.view [data-part].is-disabled { cursor: not-allowed; }
.view [data-part].is-disabled:hover,
.view [data-part].is-disabled:hover :is(path, rect, circle, ellipse, polygon, polyline) {
  fill: var(--spp-part-fill);
  stroke: var(--spp-part-stroke);
}
:host([disabled]) .view [data-part] { cursor: default; }

.toolbar {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 8px;
  border-top: 1px solid var(--spp-border);
  background: var(--spp-surface);
}
.toolbar[hidden] { display: none; }
.tool {
  all: unset;
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border-radius: 8px;
  color: var(--spp-muted);
  cursor: pointer;
}
.tool:hover:not(:disabled) { background: var(--spp-bg); color: var(--spp-text); }
.tool:focus-visible { outline: 2px solid var(--spp-accent); }
.tool:disabled { opacity: 0.35; cursor: default; }
.tool svg { width: 16px; height: 16px; }
.zoom-level {
  min-width: 44px;
  text-align: center;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  color: var(--spp-muted);
}
.spacer { flex: 1; }
`;
