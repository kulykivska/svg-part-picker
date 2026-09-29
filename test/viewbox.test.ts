import { describe, expect, it } from 'vitest';
import {
  clamp,
  clampViewBox,
  clientToSvg,
  formatViewBox,
  panViewBox,
  parseViewBox,
  pixelScale,
  zoomViewBox,
} from '../src/viewbox.js';

const base = { x: 0, y: 0, width: 200, height: 100 };

describe('parseViewBox / formatViewBox', () => {
  it('parses space and comma separated values', () => {
    expect(parseViewBox('0 0 200 100')).toEqual(base);
    expect(parseViewBox(' -5,10, 20 30 ')).toEqual({ x: -5, y: 10, width: 20, height: 30 });
  });

  it('rejects malformed or empty boxes', () => {
    expect(parseViewBox(null)).toBeNull();
    expect(parseViewBox('0 0 10')).toBeNull();
    expect(parseViewBox('0 0 0 10')).toBeNull();
    expect(parseViewBox('a b c d')).toBeNull();
  });

  it('rounds when formatting', () => {
    expect(formatViewBox({ x: 1 / 3, y: 0, width: 10, height: 10 })).toBe('0.333 0 10 10');
  });
});

describe('coordinate conversion', () => {
  const rect = { left: 10, top: 20, width: 400, height: 400 };

  it('uses the smaller axis ratio like xMidYMid meet', () => {
    expect(pixelScale(rect, base)).toBe(2);
    expect(pixelScale({ left: 0, top: 0, width: 0, height: 0 }, base)).toBe(1);
  });

  it('maps client points into SVG units with letterboxing', () => {
    // 200x100 drawn at 2x is 400x200, centred vertically with a 100px band.
    expect(clientToSvg({ x: 10, y: 120 }, rect, base)).toEqual({ x: 0, y: 0 });
    expect(clientToSvg({ x: 410, y: 320 }, rect, base)).toEqual({ x: 200, y: 100 });
  });
});

describe('zoomViewBox', () => {
  it('keeps the anchor at the same relative position', () => {
    const next = zoomViewBox(base, base, 2, { x: 50, y: 50 });
    expect(next).toEqual({ x: 25, y: 25, width: 100, height: 50 });
  });

  it('zooms around the centre back to the base box', () => {
    const zoomed = zoomViewBox(base, base, 4, { x: 100, y: 50 });
    expect(zoomViewBox(zoomed, base, 1, { x: 100, y: 50 })).toEqual(base);
  });
});

describe('panViewBox / clampViewBox', () => {
  it('moves opposite to the drag, in SVG units', () => {
    const rect = { left: 0, top: 0, width: 400, height: 200 };
    expect(panViewBox(base, 40, -20, rect)).toEqual({ x: -20, y: 10, width: 200, height: 100 });
  });

  it('centres a box that is larger than the drawing', () => {
    expect(clampViewBox({ x: 500, y: -90, width: 400, height: 200 }, base)).toEqual({
      x: -100,
      y: -50,
      width: 400,
      height: 200,
    });
  });

  it('keeps a zoomed box inside the drawing', () => {
    expect(clampViewBox({ x: -30, y: 80, width: 100, height: 50 }, base)).toEqual({
      x: 0,
      y: 50,
      width: 100,
      height: 50,
    });
  });

  it('clamps numbers', () => {
    expect(clamp(5, 0, 3)).toBe(3);
    expect(clamp(-1, 0, 3)).toBe(0);
  });
});
