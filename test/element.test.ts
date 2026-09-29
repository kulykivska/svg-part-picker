import { afterEach, describe, expect, it, vi } from 'vitest';
import '../src/index.js';
import { SvgPartPicker, defineSvgPartPicker } from '../src/index.js';
import { prefixIds } from '../src/ids.js';

const FRONT = `
  <svg data-view="front" viewBox="0 0 100 50">
    <rect data-part="hood" data-label="Hood" x="10" y="10" width="30" height="10" />
    <rect data-part="grille" x="10" y="25" width="30" height="10" />
  </svg>`;
const SIDE = `
  <svg data-view="side" data-label="Left side" viewBox="0 0 200 100">
    <rect data-part="hood" x="10" y="10" width="30" height="10" />
    <g data-part="door" data-label="Door"><rect x="50" y="10" width="30" height="30" /></g>
    <circle data-part="wheel" cx="100" cy="80" r="10" />
  </svg>`;

// Like a real parser, children arrive after connectedCallback, so wait for the rebuild.
const flush = () => new Promise((resolve) => setTimeout(resolve));

async function mount(attrs = '', views = FRONT + SIDE): Promise<SvgPartPicker> {
  document.body.innerHTML = `<svg-part-picker ${attrs}>${views}</svg-part-picker>`;
  await flush();
  return document.querySelector('svg-part-picker')!;
}

const shadow = (el: SvgPartPicker) => el.shadowRoot!;
const stageParts = (el: SvgPartPicker, id: string) =>
  Array.from(shadow(el).querySelectorAll<SVGElement>(`.view [data-part="${id}"]`));
const stagePart = (el: SvgPartPicker, view: string, id: string) => {
  const index = el.viewList.findIndex((v) => v.name === view);
  return shadow(el).querySelectorAll('.view')[index]!.querySelector<SVGElement>(`[data-part="${id}"]`)!;
};
const tabs = (el: SvgPartPicker) => Array.from(shadow(el).querySelectorAll<HTMLButtonElement>('.tab'));
const click = (node: Element) => node.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
const key = (node: Element, k: string, init: KeyboardEventInit = {}) =>
  node.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, composed: true, ...init }));
const viewBoxOf = (el: SvgPartPicker) =>
  shadow(el).querySelector('.view:not([hidden])')!.getAttribute('viewBox');

afterEach(() => {
  document.body.innerHTML = '';
});

describe('registration', () => {
  it('defines the custom element once', async () => {
    expect(customElements.get('svg-part-picker')).toBe(SvgPartPicker);
    expect(() => defineSvgPartPicker()).not.toThrow();
  });

  it('can register under another tag name', async () => {
    defineSvgPartPicker('my-part-picker');
    expect(customElements.get('my-part-picker')).toBeDefined();
  });
});

describe('rendering', () => {
  it('renders one stage view and one tab per light-DOM view', async () => {
    const el = await mount();
    expect(shadow(el).querySelectorAll('.view')).toHaveLength(2);
    expect(tabs(el).map((t) => t.querySelector('.label')!.textContent)).toEqual(['Front', 'Left side']);
    expect(el.viewList).toEqual([
      { name: 'front', label: 'Front' },
      { name: 'side', label: 'Left side' },
    ]);
  });

  it('shows the first view by default and reflects it to the attribute', async () => {
    const el = await mount();
    expect(el.view).toBe('front');
    expect(el.getAttribute('view')).toBe('front');
    expect(tabs(el)[0]!.getAttribute('aria-selected')).toBe('true');
  });

  it('honours the initial view attribute', async () => {
    const el = await mount('view="side"');
    expect(el.view).toBe('side');
    expect(shadow(el).querySelectorAll('.view')[0]!.hasAttribute('hidden')).toBe(true);
  });

  it('hides tabs for a single view and shows an empty state without views', async () => {
    const one = await mount('', FRONT);
    expect((shadow(one).querySelector('.tabs') as HTMLElement).hidden).toBe(true);
    const none = await mount('', '');
    expect((shadow(none).querySelector('.empty') as HTMLElement).hidden).toBe(false);
  });

  it('accepts views wrapped in <template>', async () => {
    const el = await mount('', `<template data-view="top" data-label="Top">${FRONT}</template>`);
    expect(el.viewList).toEqual([{ name: 'top', label: 'Top' }]);
    expect(el.parts.map((p) => p.id)).toEqual(['hood', 'grille']);
  });

  it('lists parts with labels and the views they appear in', async () => {
    const el = await mount();
    expect(el.parts).toEqual([
      { id: 'hood', label: 'Hood', views: ['front', 'side'] },
      { id: 'grille', label: 'grille', views: ['front'] },
      { id: 'door', label: 'Door', views: ['side'] },
      { id: 'wheel', label: 'wheel', views: ['side'] },
    ]);
  });

  it('makes parts accessible checkboxes', async () => {
    const el = await mount();
    const hood = stagePart(el, 'front', 'hood');
    expect(hood.getAttribute('role')).toBe('checkbox');
    expect(hood.getAttribute('tabindex')).toBe('0');
    expect(hood.getAttribute('aria-checked')).toBe('false');
    expect(hood.getAttribute('aria-label')).toBe('Hood');
    expect(stagePart(el, 'front', 'grille').getAttribute('aria-label')).toBe('Grille');
  });

  it('rebuilds when the light DOM changes', async () => {
    const el = await mount('', FRONT);
    el.insertAdjacentHTML('beforeend', SIDE);
    await flush();
    expect(el.viewList.map((v) => v.name)).toEqual(['front', 'side']);
  });
});

describe('selection', () => {
  it('toggles a part on click and fires selection-change', async () => {
    const el = await mount();
    const spy = vi.fn();
    el.addEventListener('selection-change', (e) => spy(e.detail));
    click(stagePart(el, 'front', 'hood'));
    expect(el.selected).toEqual(['hood']);
    expect(spy).toHaveBeenLastCalledWith({ selected: ['hood'], added: ['hood'], removed: [] });
    click(stagePart(el, 'front', 'hood'));
    expect(el.selected).toEqual([]);
    expect(spy).toHaveBeenLastCalledWith({ selected: [], added: [], removed: ['hood'] });
  });

  it('the event bubbles out of the element', async () => {
    const el = await mount();
    const spy = vi.fn();
    document.body.addEventListener('selection-change', spy);
    click(stagePart(el, 'front', 'grille'));
    expect(spy).toHaveBeenCalledOnce();
    document.body.removeEventListener('selection-change', spy);
  });

  it('clicks on a child of a grouped part select the group', async () => {
    const el = await mount('view="side"');
    click(stagePart(el, 'side', 'door').querySelector('rect')!);
    expect(el.selected).toEqual(['door']);
  });

  it('keeps a part shared between views in sync', async () => {
    const el = await mount();
    click(stagePart(el, 'front', 'hood'));
    const all = shadow(el).querySelectorAll('[data-part="hood"]');
    expect(all.length).toBe(4);
    for (const node of all) expect(node.classList.contains('is-selected')).toBe(true);
  });

  it('reads the initial selection from the attribute without firing events', async () => {
    const spy = vi.fn();
    document.addEventListener('selection-change', spy);
    const el = await mount('selected="hood door"');
    expect(el.selected).toEqual(['hood', 'door']);
    expect(stagePart(el, 'front', 'hood').getAttribute('aria-checked')).toBe('true');
    expect(spy).not.toHaveBeenCalled();
    document.removeEventListener('selection-change', spy);
  });

  it('supports the selected property and methods', async () => {
    const el = await mount();
    el.selected = ['wheel', 'wheel', 'door'];
    expect(el.selected).toEqual(['wheel', 'door']);
    expect(el.select('hood')).toBe(true);
    expect(el.select('hood')).toBe(false);
    expect(el.deselect('wheel')).toBe(true);
    expect(el.toggle('grille')).toBe(true);
    expect(el.toggle('grille')).toBe(false);
    expect(el.selected).toEqual(['door', 'hood']);
    el.clear();
    expect(el.selected).toEqual([]);
  });

  it('single mode keeps only the latest part', async () => {
    const el = await mount('selection-mode="single" selected="hood grille"');
    expect(el.selected).toEqual(['grille']);
    const spy = vi.fn();
    el.addEventListener('selection-change', (e) => spy(e.detail));
    click(stagePart(el, 'front', 'hood'));
    expect(el.selected).toEqual(['hood']);
    expect(spy).toHaveBeenCalledWith({ selected: ['hood'], added: ['hood'], removed: ['grille'] });
  });

  it('switching to single mode trims the selection', async () => {
    const el = await mount('selected="hood grille"');
    el.selectionMode = 'single';
    expect(el.selected).toEqual(['grille']);
  });

  it('shows per-view selection counts on the tabs', async () => {
    const el = await mount('selected="hood door wheel"');
    const badges = tabs(el).map((t) => t.querySelector('.badge') as HTMLElement);
    expect(badges.map((b) => (b.hidden ? '' : b.textContent))).toEqual(['1', '3']);
  });
});

describe('restrictions', () => {
  it('disabled-parts cannot be selected by the user', async () => {
    const el = await mount('disabled-parts="grille"');
    const grille = stagePart(el, 'front', 'grille');
    expect(grille.classList.contains('is-disabled')).toBe(true);
    expect(grille.getAttribute('aria-disabled')).toBe('true');
    click(grille);
    expect(el.selected).toEqual([]);
    expect(el.isPartDisabled('grille')).toBe(true);
    el.disabledParts = [];
    expect(el.isPartDisabled('grille')).toBe(false);
  });

  it('allowed-parts limits what can be picked', async () => {
    const el = await mount('allowed-parts="hood"');
    click(stagePart(el, 'front', 'grille'));
    click(stagePart(el, 'front', 'hood'));
    expect(el.selected).toEqual(['hood']);
    el.allowedParts = null;
    expect(el.isPartDisabled('grille')).toBe(false);
  });

  it('adjacency only allows parts that touch the selection', async () => {
    const el = await mount('view="side"');
    el.adjacency = { hood: ['door'] };
    click(stagePart(el, 'side', 'hood'));
    click(stagePart(el, 'side', 'wheel'));
    click(stagePart(el, 'side', 'door'));
    expect(el.selected).toEqual(['hood', 'door']);
  });

  it('the disabled attribute blocks all user selection', async () => {
    const el = await mount('disabled');
    click(stagePart(el, 'front', 'hood'));
    expect(el.selected).toEqual([]);
    el.disabled = false;
    click(stagePart(el, 'front', 'hood'));
    expect(el.selected).toEqual(['hood']);
  });
});

describe('views', () => {
  it('switches view on tab click and fires view-change', async () => {
    const el = await mount();
    const spy = vi.fn();
    el.addEventListener('view-change', (e) => spy(e.detail));
    click(tabs(el)[1]!);
    expect(el.view).toBe('side');
    expect(el.getAttribute('view')).toBe('side');
    expect(spy).toHaveBeenCalledWith({ view: 'side', previousView: 'front' });
  });

  it('setting the view programmatically does not fire view-change', async () => {
    const el = await mount();
    const spy = vi.fn();
    el.addEventListener('view-change', spy);
    el.view = 'side';
    el.setAttribute('view', 'front');
    expect(el.view).toBe('front');
    el.view = 'missing';
    expect(el.view).toBe('front');
    expect(spy).not.toHaveBeenCalled();
  });

  it('supports arrow keys on the tab list', async () => {
    const el = await mount();
    key(tabs(el)[0]!, 'ArrowRight');
    expect(el.view).toBe('side');
    key(tabs(el)[1]!, 'ArrowRight');
    expect(el.view).toBe('front');
    key(tabs(el)[0]!, 'End');
    expect(el.view).toBe('side');
  });

  it('only parts of the visible view react to clicks', async () => {
    const el = await mount();
    click(stagePart(el, 'side', 'wheel'));
    expect(el.selected).toEqual([]);
  });
});

describe('zoom and pan', () => {
  it('zooms in and out around the centre and fires zoom-change', async () => {
    const el = await mount();
    const spy = vi.fn();
    el.addEventListener('zoom-change', (e) => spy(e.detail));
    el.zoomTo(2);
    expect(el.zoom).toBe(2);
    expect(viewBoxOf(el)).toBe('25 12.5 50 25');
    expect(spy).toHaveBeenLastCalledWith({ view: 'front', zoom: 2 });
    el.resetZoom();
    expect(viewBoxOf(el)).toBe('0 0 100 50');
    expect(el.zoom).toBe(1);
  });

  it('clamps zoom to min-zoom and max-zoom', async () => {
    const el = await mount('max-zoom="3"');
    el.zoomTo(10);
    expect(el.zoom).toBe(3);
    el.zoomOut();
    el.zoomOut();
    el.zoomOut();
    expect(el.zoom).toBe(1);
    el.setAttribute('min-zoom', '0.5');
    el.zoomTo(0.1);
    expect(el.zoom).toBe(0.5);
    expect(viewBoxOf(el)).toBe('-50 -25 200 100');
  });

  it('keeps zoom per view', async () => {
    const el = await mount();
    el.zoomIn();
    el.view = 'side';
    expect(el.zoom).toBe(1);
    el.view = 'front';
    expect(el.zoom).toBe(1.5);
  });

  it('zooms with the mouse wheel', async () => {
    const el = await mount();
    const view = shadow(el).querySelector('.view')!;
    const wheel = new WheelEvent('wheel', { deltaY: -200, bubbles: true, cancelable: true });
    view.dispatchEvent(wheel);
    expect(el.zoom).toBeGreaterThan(1);
    expect(wheel.defaultPrevented).toBe(true);
  });

  it('updates the toolbar buttons and label', async () => {
    const el = await mount('max-zoom="2"');
    const root = shadow(el);
    const btn = (a: string) => root.querySelector<HTMLButtonElement>(`[data-action="${a}"]`)!;
    expect(btn('zoom-out').disabled).toBe(true);
    expect(btn('reset').disabled).toBe(true);
    click(btn('zoom-in'));
    click(btn('zoom-in'));
    expect(btn('zoom-in').disabled).toBe(true);
    expect(root.querySelector('.zoom-level')!.textContent).toBe('200%');
    el.toggleAttribute('no-controls', true);
    expect((root.querySelector('.toolbar') as HTMLElement).hidden).toBe(true);
  });

  it('keyboard shortcuts zoom, pan and toggle parts', async () => {
    const el = await mount();
    const hood = stagePart(el, 'front', 'hood');
    key(hood, '+');
    expect(el.zoom).toBe(1.5);
    const before = viewBoxOf(el);
    key(hood, 'ArrowRight', { shiftKey: true });
    expect(viewBoxOf(el)).not.toBe(before);
    key(hood, '0');
    expect(el.zoom).toBe(1);
    key(hood, 'Enter');
    key(stagePart(el, 'front', 'grille'), ' ');
    expect(el.selected).toEqual(['hood', 'grille']);
  });

  it('a drag pans the view and does not select the part under the pointer', async () => {
    const el = await mount();
    el.zoomTo(2);
    const hood = stagePart(el, 'front', 'hood');
    const opts = { bubbles: true, composed: true, pointerId: 1, pointerType: 'mouse', button: 0 };
    hood.dispatchEvent(new PointerEvent('pointerdown', { ...opts, clientX: 100, clientY: 100 }));
    hood.dispatchEvent(new PointerEvent('pointermove', { ...opts, clientX: 80, clientY: 100 }));
    hood.dispatchEvent(new PointerEvent('pointerup', { ...opts, clientX: 80, clientY: 100 }));
    click(hood);
    expect(el.selected).toEqual([]);
    expect(viewBoxOf(el)).toBe('45 12.5 50 25');
    click(hood);
    expect(el.selected).toEqual(['hood']);
  });

  it('fires part-hover when the pointer enters and leaves parts', async () => {
    const el = await mount();
    const spy = vi.fn();
    el.addEventListener('part-hover', (e) => spy(e.detail));
    stagePart(el, 'front', 'hood').dispatchEvent(new PointerEvent('pointerover', { bubbles: true, composed: true }));
    expect(spy).toHaveBeenLastCalledWith({ part: 'hood', view: 'front' });
    shadow(el).querySelector('.stage')!.dispatchEvent(new PointerEvent('pointerleave'));
    expect(spy).toHaveBeenLastCalledWith({ part: null, view: 'front' });
  });
});

describe('prefixIds', () => {
  it('renames ids and rewrites url() and href references', async () => {
    const host = document.createElement('div');
    host.innerHTML = `<svg><defs><linearGradient id="g"></linearGradient><path id="p" d="M0 0"/></defs>
      <rect fill="url(#g)" style="stroke: url('#g')"/><use href="#p"/><a href="#other"></a></svg>`;
    const svg = host.querySelector('svg')!;
    prefixIds(svg, 'x');
    expect(svg.querySelector('linearGradient')!.id).toBe('x-g');
    expect(svg.querySelector('rect')!.getAttribute('fill')).toBe('url(#x-g)');
    expect(svg.querySelector('rect')!.getAttribute('style')).toBe("stroke: url('#x-g')");
    expect(svg.querySelector('use')!.getAttribute('href')).toBe('#x-p');
    expect(svg.querySelector('a')!.getAttribute('href')).toBe('#other');
  });
});
