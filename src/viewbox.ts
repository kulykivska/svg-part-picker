/** A rectangle in SVG user units, as used by the `viewBox` attribute. */
export interface ViewBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

/** The on-screen box of the rendered `<svg>`, as returned by `getBoundingClientRect()`. */
export interface ClientRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function parseViewBox(value: string | null | undefined): ViewBox | null {
  if (!value) return null;
  const nums = value.trim().split(/[\s,]+/).map(Number);
  if (nums.length !== 4 || nums.some((n) => !Number.isFinite(n))) return null;
  const [x, y, width, height] = nums as [number, number, number, number];
  if (width <= 0 || height <= 0) return null;
  return { x, y, width, height };
}

export function formatViewBox(vb: ViewBox): string {
  const r = (n: number) => Math.round(n * 1000) / 1000;
  return `${r(vb.x)} ${r(vb.y)} ${r(vb.width)} ${r(vb.height)}`;
}

/** Pixels per SVG unit for a `preserveAspectRatio="xMidYMid meet"` drawing. */
export function pixelScale(rect: ClientRect, vb: ViewBox): number {
  const s = Math.min(rect.width / vb.width, rect.height / vb.height);
  return Number.isFinite(s) && s > 0 ? s : 1;
}

/** Converts a client (screen) point to SVG user units, assuming `xMidYMid meet`. */
export function clientToSvg(point: Point, rect: ClientRect, vb: ViewBox): Point {
  const s = pixelScale(rect, vb);
  const offsetX = (rect.width - vb.width * s) / 2;
  const offsetY = (rect.height - vb.height * s) / 2;
  return {
    x: vb.x + (point.x - rect.left - offsetX) / s,
    y: vb.y + (point.y - rect.top - offsetY) / s,
  };
}

/** Returns the viewBox for `zoom` relative to `base`, keeping `anchor` fixed on screen. */
export function zoomViewBox(current: ViewBox, base: ViewBox, zoom: number, anchor: Point): ViewBox {
  const width = base.width / zoom;
  const height = base.height / zoom;
  const fx = (anchor.x - current.x) / current.width;
  const fy = (anchor.y - current.y) / current.height;
  return { x: anchor.x - fx * width, y: anchor.y - fy * height, width, height };
}

/** Moves the viewBox so the drawing follows a drag of `dx`/`dy` screen pixels. */
export function panViewBox(vb: ViewBox, dx: number, dy: number, rect: ClientRect): ViewBox {
  const s = pixelScale(rect, vb);
  return { ...vb, x: vb.x - dx / s, y: vb.y - dy / s };
}

/** Keeps the drawing on screen: centred when zoomed out, inside `base` when zoomed in. */
export function clampViewBox(vb: ViewBox, base: ViewBox): ViewBox {
  const axis = (pos: number, size: number, basePos: number, baseSize: number) =>
    size >= baseSize ? basePos + (baseSize - size) / 2 : clamp(pos, basePos, basePos + baseSize - size);
  return {
    x: axis(vb.x, vb.width, base.x, base.width),
    y: axis(vb.y, vb.height, base.y, base.height),
    width: vb.width,
    height: vb.height,
  };
}

export function center(vb: ViewBox): Point {
  return { x: vb.x + vb.width / 2, y: vb.y + vb.height / 2 };
}
