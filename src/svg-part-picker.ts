import { prefixIds } from './ids.js';
import { styles } from './styles.js';
import { computeDisabled, diffSelection, parseList, unique, type Adjacency } from './selection.js';
import {
  center,
  clamp,
  clampViewBox,
  clientToSvg,
  formatViewBox,
  panViewBox,
  parseViewBox,
  zoomViewBox,
  type Point,
  type ViewBox,
} from './viewbox.js';

export type SelectionMode = 'multiple' | 'single';

export interface PartInfo {
  id: string;
  label: string;
  views: string[];
}

export interface ViewInfo {
  name: string;
  label: string;
}

export interface SelectionChangeDetail {
  selected: string[];
  added: string[];
  removed: string[];
}

export interface ViewChangeDetail {
  view: string;
  previousView: string | null;
}

export interface ZoomChangeDetail {
  view: string;
  zoom: number;
}

export interface PartHoverDetail {
  part: string | null;
  view: string;
}

export interface SvgPartPickerEventMap {
  'selection-change': CustomEvent<SelectionChangeDetail>;
  'view-change': CustomEvent<ViewChangeDetail>;
  'zoom-change': CustomEvent<ZoomChangeDetail>;
  'part-hover': CustomEvent<PartHoverDetail>;
}

interface ViewState {
  name: string;
  label: string;
  svg: SVGSVGElement;
  thumb: SVGSVGElement;
  tab: HTMLButtonElement;
  badge: HTMLElement;
  base: ViewBox;
  current: ViewBox;
  zoom: number;
}

type Gesture =
  | { kind: 'pan'; start: Point; from: ViewBox; moved: boolean }
  | { kind: 'pinch'; distance: number; zoom: number };

const SVG_NS = 'http://www.w3.org/2000/svg';
const DRAG_THRESHOLD = 4;
const ZOOM_STEP = 1.5;
const EPSILON = 1e-6;

const ICONS = {
  minus: '<path d="M3 8h10"/>',
  plus: '<path d="M3 8h10M8 3v10"/>',
  fit: '<path d="M2 6V2h4M10 2h4v4M14 10v4h-4M6 14H2v-4"/>',
};

function icon(paths: string): string {
  return `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
}

function titleCase(name: string): string {
  return name.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

let instanceCount = 0;

// `<svg-part-picker>`: pick parts on a multi-view SVG schematic.
// Light-DOM `<svg data-view>` children are the views; `[data-part]` shapes are the parts.
export class SvgPartPicker extends HTMLElement {
  static readonly tagName = 'svg-part-picker';
  static readonly formAssociated = true;

  static get observedAttributes(): string[] {
    return [
      'view',
      'selected',
      'selection-mode',
      'disabled',
      'disabled-parts',
      'allowed-parts',
      'min-zoom',
      'max-zoom',
      'no-controls',
      'name',
    ];
  }

  private readonly root: ShadowRoot;
  private readonly internals: ElementInternals | null;
  private readonly uid = `spp-${++instanceCount}`;
  private readonly tabsEl: HTMLElement;
  private readonly stageEl: HTMLElement;
  private readonly emptyEl: HTMLElement;
  private readonly toolbarEl: HTMLElement;
  private readonly zoomLabel: HTMLElement;
  private readonly zoomOutBtn: HTMLButtonElement;
  private readonly zoomInBtn: HTMLButtonElement;
  private readonly resetBtn: HTMLButtonElement;

  private views: ViewState[] = [];
  private activeName: string | null = null;
  private selection: string[] = [];
  private partLabels = new Map<string, string>();
  private partViews = new Map<string, Set<string>>();
  private disabledSet = new Set<string>();
  private allowedList: string[] | null = null;
  private disabledList: string[] = [];
  private adjacencyMap: Adjacency | null = null;
  private formDisabled = false;

  private pointers = new Map<number, Point>();
  private gesture: Gesture | null = null;
  private suppressClick = false;
  private hovered: string | null = null;
  private observer: MutationObserver | null = null;
  private rebuildQueued = false;

  constructor() {
    super();
    this.root = this.attachShadow({ mode: 'open' });
    let internals: ElementInternals | null = null;
    try {
      internals = typeof this.attachInternals === 'function' ? this.attachInternals() : null;
    } catch {
      internals = null;
    }
    this.internals = internals;

    this.root.innerHTML = `
      <style>${styles}</style>
      <div class="root" part="container">
        <div class="tabs" part="tabs" role="tablist" aria-label="Views"></div>
        <div class="stage" part="stage">
          <div class="empty" part="empty"><slot name="empty">No views</slot></div>
        </div>
        <div class="toolbar" part="toolbar">
          <button class="tool" type="button" data-action="zoom-out" aria-label="Zoom out" title="Zoom out">${icon(ICONS.minus)}</button>
          <span class="zoom-level" aria-live="polite">100%</span>
          <button class="tool" type="button" data-action="zoom-in" aria-label="Zoom in" title="Zoom in">${icon(ICONS.plus)}</button>
          <button class="tool" type="button" data-action="reset" aria-label="Reset zoom" title="Reset zoom">${icon(ICONS.fit)}</button>
          <span class="spacer"></span>
          <slot name="actions"></slot>
        </div>
      </div>`;

    const q = <T extends Element>(sel: string) => this.root.querySelector(sel) as T;
    this.tabsEl = q('.tabs');
    this.stageEl = q('.stage');
    this.emptyEl = q('.empty');
    this.toolbarEl = q('.toolbar');
    this.zoomLabel = q('.zoom-level');
    this.zoomOutBtn = q('[data-action="zoom-out"]');
    this.zoomInBtn = q('[data-action="zoom-in"]');
    this.resetBtn = q('[data-action="reset"]');

    this.zoomOutBtn.addEventListener('click', () => this.zoomOut());
    this.zoomInBtn.addEventListener('click', () => this.zoomIn());
    this.resetBtn.addEventListener('click', () => this.resetZoom());
    this.tabsEl.addEventListener('click', this.onTabClick);
    this.tabsEl.addEventListener('keydown', this.onTabKeyDown);
    this.stageEl.addEventListener('click', this.onStageClick);
    this.stageEl.addEventListener('keydown', this.onStageKeyDown);
    this.stageEl.addEventListener('pointerdown', this.onPointerDown);
    this.stageEl.addEventListener('pointermove', this.onPointerMove);
    this.stageEl.addEventListener('pointerup', this.onPointerUp);
    this.stageEl.addEventListener('pointercancel', this.onPointerUp);
    this.stageEl.addEventListener('pointerover', this.onPointerOver);
    this.stageEl.addEventListener('pointerleave', this.onPointerLeave);
    this.stageEl.addEventListener('wheel', this.onWheel, { passive: false });
  }

  connectedCallback(): void {
    for (const prop of ['selected', 'view', 'adjacency', 'allowedParts', 'disabledParts'] as const) {
      this.upgradeProperty(prop);
    }
    this.toolbarEl.hidden = this.hasAttribute('no-controls');
    this.rebuild();
    this.observer = new MutationObserver(() => this.queueRebuild());
    this.observer.observe(this, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['data-part', 'data-label', 'data-view', 'viewBox', 'd', 'points'],
    });
  }

  disconnectedCallback(): void {
    this.observer?.disconnect();
    this.observer = null;
  }

  attributeChangedCallback(name: string, oldValue: string | null, value: string | null): void {
    if (oldValue === value) return;
    switch (name) {
      case 'view':
        if (value) this.activate(value, false);
        break;
      case 'selected':
        this.setSelection(parseList(value));
        break;
      case 'selection-mode':
        if (this.selectionMode === 'single' && this.selection.length > 1) {
          this.setSelection(this.selection.slice(-1));
        }
        break;
      case 'disabled-parts':
        this.disabledList = parseList(value);
        this.sync();
        break;
      case 'allowed-parts':
        this.allowedList = value === null ? null : parseList(value);
        this.sync();
        break;
      case 'min-zoom':
      case 'max-zoom':
        for (const v of this.views) this.setZoom(v, v.zoom, center(v.current), false);
        this.updateToolbar();
        break;
      case 'no-controls':
        this.toolbarEl.hidden = value !== null;
        break;
      case 'disabled':
      case 'name':
        this.sync();
        break;
    }
  }

  // ---- Public properties ----

  /** Selected part ids, in selection order. Setting it does not fire `selection-change`. */
  get selected(): string[] {
    return [...this.selection];
  }
  set selected(ids: readonly string[]) {
    this.setSelection(ids);
  }

  /** Name of the visible view. */
  get view(): string | null {
    return this.activeName;
  }
  set view(name: string | null) {
    if (name) this.activate(name, false);
  }

  get selectionMode(): SelectionMode {
    return this.getAttribute('selection-mode') === 'single' ? 'single' : 'multiple';
  }
  set selectionMode(mode: SelectionMode) {
    this.setAttribute('selection-mode', mode);
  }

  get disabled(): boolean {
    return this.hasAttribute('disabled');
  }
  set disabled(value: boolean) {
    this.toggleAttribute('disabled', value);
  }

  get minZoom(): number {
    const v = Number(this.getAttribute('min-zoom'));
    return Number.isFinite(v) && v > 0 && this.hasAttribute('min-zoom') ? v : 1;
  }
  set minZoom(value: number) {
    this.setAttribute('min-zoom', String(value));
  }

  get maxZoom(): number {
    const v = Number(this.getAttribute('max-zoom'));
    const max = Number.isFinite(v) && v > 0 && this.hasAttribute('max-zoom') ? v : 8;
    return Math.max(max, this.minZoom);
  }
  set maxZoom(value: number) {
    this.setAttribute('max-zoom', String(value));
  }

  /** Current zoom factor of the visible view; 1 shows the whole drawing. */
  get zoom(): number {
    return this.active?.zoom ?? 1;
  }

  /** Parts that can never be selected. Mirrors the `disabled-parts` attribute. */
  get disabledParts(): string[] {
    return [...this.disabledList];
  }
  set disabledParts(ids: readonly string[]) {
    this.disabledList = unique(ids);
    this.sync();
  }

  /** When not null, only these parts can be selected. Mirrors `allowed-parts`. */
  get allowedParts(): string[] | null {
    return this.allowedList ? [...this.allowedList] : null;
  }
  set allowedParts(ids: readonly string[] | null) {
    this.allowedList = ids ? unique(ids) : null;
    this.sync();
  }

  /** Neighbour map. When set, a new part must touch the current selection. */
  get adjacency(): Adjacency | null {
    return this.adjacencyMap;
  }
  set adjacency(map: Adjacency | null) {
    this.adjacencyMap = map;
    this.sync();
  }

  /** All parts found in the views, in document order. */
  get parts(): PartInfo[] {
    return [...this.partViews.entries()].map(([id, views]) => ({
      id,
      label: this.partLabels.get(id) ?? id,
      views: [...views],
    }));
  }

  get viewList(): ViewInfo[] {
    return this.views.map(({ name, label }) => ({ name, label }));
  }

  // ---- Public methods ----

  override addEventListener<K extends keyof SvgPartPickerEventMap>(
    type: K,
    listener: (this: SvgPartPicker, ev: SvgPartPickerEventMap[K]) => unknown,
    options?: boolean | AddEventListenerOptions,
  ): void;
  override addEventListener<K extends keyof HTMLElementEventMap>(
    type: K,
    listener: (this: SvgPartPicker, ev: HTMLElementEventMap[K]) => unknown,
    options?: boolean | AddEventListenerOptions,
  ): void;
  override addEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions,
  ): void;
  override addEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions,
  ): void {
    super.addEventListener(type, listener, options);
  }

  /** Whether a part is currently blocked by the disabled, allowed or adjacency rules. */
  isPartDisabled(id: string): boolean {
    return this.disabled || this.formDisabled || this.disabledSet.has(id);
  }

  select(id: string): boolean {
    if (this.selection.includes(id)) return false;
    this.setSelection(this.selectionMode === 'single' ? [id] : [...this.selection, id]);
    return true;
  }

  deselect(id: string): boolean {
    if (!this.selection.includes(id)) return false;
    this.setSelection(this.selection.filter((s) => s !== id));
    return true;
  }

  /** Returns whether the part is selected afterwards. */
  toggle(id: string): boolean {
    return this.selection.includes(id) ? !this.deselect(id) : this.select(id);
  }

  clear(): void {
    this.setSelection([]);
  }

  zoomIn(): void {
    const v = this.active;
    if (v) this.setZoom(v, v.zoom * ZOOM_STEP, center(v.current), true);
  }

  zoomOut(): void {
    const v = this.active;
    if (v) this.setZoom(v, v.zoom / ZOOM_STEP, center(v.current), true);
  }

  /** Sets the zoom of the visible view, keeping its centre in place. */
  zoomTo(zoom: number): void {
    const v = this.active;
    if (v) this.setZoom(v, zoom, center(v.current), true);
  }

  resetZoom(): void {
    const v = this.active;
    if (v) this.setZoom(v, 1, center(v.base), true);
  }

  /** Re-reads the light-DOM views. Called automatically when children change. */
  refresh(): void {
    this.rebuild();
  }

  // ---- Form association ----

  formDisabledCallback(disabled: boolean): void {
    this.formDisabled = disabled;
    this.sync();
  }

  formResetCallback(): void {
    this.setSelection(parseList(this.getAttribute('selected')));
  }

  // ---- Building ----

  private get active(): ViewState | undefined {
    return this.views.find((v) => v.name === this.activeName);
  }

  private upgradeProperty(prop: 'selected' | 'view' | 'adjacency' | 'allowedParts' | 'disabledParts'): void {
    if (Object.prototype.hasOwnProperty.call(this, prop)) {
      const self = this as unknown as Record<string, unknown>;
      const value = self[prop];
      delete self[prop];
      self[prop] = value;
    }
  }

  private queueRebuild(): void {
    if (this.rebuildQueued) return;
    this.rebuildQueued = true;
    queueMicrotask(() => {
      this.rebuildQueued = false;
      if (this.isConnected) this.rebuild();
    });
  }

  private sources(): { name: string; label: string; svg: SVGSVGElement }[] {
    const out: { name: string; label: string; svg: SVGSVGElement }[] = [];
    for (const child of Array.from(this.children)) {
      const name = child.getAttribute('data-view');
      if (!name) continue;
      const svg =
        child.localName === 'svg'
          ? (child as SVGSVGElement)
          : child instanceof HTMLTemplateElement
            ? child.content.querySelector('svg')
            : null;
      if (!svg) continue;
      const label = child.getAttribute('data-label') ?? svg.getAttribute('data-label') ?? titleCase(name);
      out.push({ name, label, svg });
    }
    return out;
  }

  private rebuild(): void {
    const previous = new Map(this.views.map((v) => [v.name, v]));
    for (const v of this.views) {
      v.svg.remove();
      v.tab.remove();
    }
    this.views = [];
    this.partLabels.clear();
    this.partViews.clear();

    for (const src of this.sources()) {
      const base = this.readViewBox(src.svg);
      const svg = this.cloneView(src.svg, base, `${this.uid}-${this.views.length}`);
      svg.classList.add('view');
      svg.id = `${this.uid}-view-${this.views.length}`;
      svg.setAttribute('role', 'group');
      svg.setAttribute('aria-label', src.label);
      svg.setAttribute('tabindex', '-1');

      const thumb = this.cloneView(src.svg, base, `${this.uid}-${this.views.length}t`);
      thumb.classList.add('thumb');
      thumb.setAttribute('aria-hidden', 'true');
      thumb.setAttribute('focusable', 'false');

      const tab = document.createElement('button');
      tab.type = 'button';
      tab.className = 'tab';
      tab.setAttribute('part', 'tab');
      tab.setAttribute('role', 'tab');
      tab.setAttribute('aria-controls', svg.id);
      tab.dataset['view'] = src.name;
      const label = document.createElement('span');
      label.className = 'label';
      label.textContent = src.label;
      const badge = document.createElement('span');
      badge.className = 'badge';
      badge.setAttribute('part', 'badge');
      tab.append(thumb, label, badge);

      for (const el of Array.from(svg.querySelectorAll<SVGElement>('[data-part]'))) {
        const id = el.getAttribute('data-part')!;
        const partLabel = el.getAttribute('data-label');
        if (partLabel && !this.partLabels.has(id)) this.partLabels.set(id, partLabel);
        if (!this.partViews.has(id)) this.partViews.set(id, new Set());
        this.partViews.get(id)!.add(src.name);
        el.setAttribute('tabindex', '0');
        el.setAttribute('role', 'checkbox');
      }

      const old = previous.get(src.name);
      const sameBase = old && formatViewBox(old.base) === formatViewBox(base);
      const view: ViewState = {
        name: src.name,
        label: src.label,
        svg,
        thumb,
        tab,
        badge,
        base,
        current: sameBase ? old.current : { ...base },
        zoom: sameBase ? old.zoom : 1,
      };
      svg.setAttribute('viewBox', formatViewBox(view.current));
      this.views.push(view);
      this.tabsEl.append(tab);
      this.stageEl.append(svg);
    }

    this.emptyEl.hidden = this.views.length > 0;
    this.tabsEl.hidden = this.views.length < 2;

    const wanted = this.activeName ?? this.getAttribute('view');
    const next = this.views.find((v) => v.name === wanted) ?? this.views[0];
    this.activeName = next?.name ?? null;
    this.showActive();
    this.sync();
  }

  private readViewBox(svg: SVGSVGElement): ViewBox {
    const fromAttr = parseViewBox(svg.getAttribute('viewBox'));
    if (fromAttr) return fromAttr;
    const w = parseFloat(svg.getAttribute('width') ?? '');
    const h = parseFloat(svg.getAttribute('height') ?? '');
    return { x: 0, y: 0, width: w > 0 ? w : 100, height: h > 0 ? h : 100 };
  }

  private cloneView(source: SVGSVGElement, base: ViewBox, prefix: string): SVGSVGElement {
    const svg = document.createElementNS(SVG_NS, 'svg') as SVGSVGElement;
    for (const attr of Array.from(source.attributes)) {
      if (['width', 'height', 'style', 'class', 'id', 'data-view', 'data-label'].includes(attr.name)) continue;
      svg.setAttribute(attr.name, attr.value);
    }
    svg.setAttribute('viewBox', formatViewBox(base));
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    for (const node of Array.from(source.childNodes)) svg.append(document.importNode(node, true));
    prefixIds(svg, prefix);
    return svg;
  }

  // ---- State sync ----

  private setSelection(ids: readonly string[]): void {
    let next = unique(ids);
    if (this.selectionMode === 'single') next = next.slice(-1);
    this.selection = next;
    this.sync();
  }

  private userToggle(id: string): void {
    if (this.isPartDisabled(id) && !this.selection.includes(id)) return;
    if (this.disabled || this.formDisabled) return;
    const before = this.selection;
    this.toggle(id);
    const { added, removed } = diffSelection(before, this.selection);
    if (added.length || removed.length) {
      this.emit('selection-change', { selected: this.selected, added, removed });
    }
  }

  private sync(): void {
    const selected = new Set(this.selection);
    this.disabledSet = computeDisabled(this.partViews.keys(), selected, {
      disabled: this.disabledList,
      allowed: this.allowedList,
      adjacency: this.selectionMode === 'multiple' ? this.adjacencyMap : null,
    });
    const blockAll = this.disabled || this.formDisabled;

    for (const v of this.views) {
      let count = 0;
      for (const svg of [v.svg, v.thumb]) {
        for (const el of Array.from(svg.querySelectorAll<SVGElement>('[data-part]'))) {
          const id = el.getAttribute('data-part')!;
          const isSelected = selected.has(id);
          const isDisabled = blockAll || this.disabledSet.has(id);
          el.classList.toggle('is-selected', isSelected);
          el.classList.toggle('is-disabled', isDisabled && !isSelected);
          if (svg === v.svg) {
            el.setAttribute('aria-checked', String(isSelected));
            el.setAttribute('aria-label', this.partLabels.get(id) ?? titleCase(id));
            if (isDisabled) el.setAttribute('aria-disabled', 'true');
            else el.removeAttribute('aria-disabled');
          }
        }
      }
      for (const id of selected) if (this.partViews.get(id)?.has(v.name)) count++;
      v.badge.textContent = String(count);
      v.badge.hidden = count === 0;
      v.tab.setAttribute('aria-label', count ? `${v.label}, ${count} selected` : v.label);
    }
    this.updateFormValue();
    this.updateToolbar();
  }

  private updateFormValue(): void {
    if (!this.internals || typeof this.internals.setFormValue !== 'function') return;
    const name = this.getAttribute('name');
    if (!name || this.selection.length === 0) {
      this.internals.setFormValue(null);
      return;
    }
    const data = new FormData();
    for (const id of this.selection) data.append(name, id);
    this.internals.setFormValue(data);
  }

  private updateToolbar(): void {
    const v = this.active;
    const zoom = v?.zoom ?? 1;
    this.zoomLabel.textContent = `${Math.round(zoom * 100)}%`;
    this.zoomOutBtn.disabled = !v || zoom <= this.minZoom + EPSILON;
    this.zoomInBtn.disabled = !v || zoom >= this.maxZoom - EPSILON;
    this.resetBtn.disabled = !v || (Math.abs(zoom - 1) < EPSILON && formatViewBox(v.current) === formatViewBox(v.base));
  }

  private activate(name: string, fromUser: boolean): void {
    if (name === this.activeName) return;
    const target = this.views.find((v) => v.name === name);
    if (!target) {
      if (this.views.length === 0) this.activeName = name;
      return;
    }
    const previousView = this.activeName;
    this.activeName = name;
    this.showActive();
    this.updateToolbar();
    if (fromUser) this.emit('view-change', { view: name, previousView });
  }

  private showActive(): void {
    for (const v of this.views) {
      const on = v.name === this.activeName;
      v.svg.toggleAttribute('hidden', !on);
      v.tab.setAttribute('aria-selected', String(on));
      v.tab.tabIndex = on ? 0 : -1;
    }
    if (this.activeName && this.getAttribute('view') !== this.activeName && this.views.length) {
      this.setAttribute('view', this.activeName);
    }
  }

  private setZoom(v: ViewState, zoom: number, anchor: Point, notify: boolean): void {
    const next = clamp(zoom, this.minZoom, this.maxZoom);
    const changed = Math.abs(next - v.zoom) > EPSILON;
    v.current = clampViewBox(zoomViewBox(v.current, v.base, next, anchor), v.base);
    v.zoom = next;
    this.applyViewBox(v);
    if (v === this.active) this.updateToolbar();
    if (changed && notify) this.emit('zoom-change', { view: v.name, zoom: next });
  }

  private applyViewBox(v: ViewState): void {
    v.svg.setAttribute('viewBox', formatViewBox(v.current));
    v.svg.classList.toggle('is-zoomed', v.zoom > 1 + EPSILON);
  }

  private emit<K extends keyof SvgPartPickerEventMap>(
    type: K,
    detail: SvgPartPickerEventMap[K]['detail'],
  ): void {
    this.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));
  }

  // ---- Event handlers ----

  private partFromEvent(e: Event): string | null {
    const target = e.target as Element | null;
    const el = target?.closest?.('[data-part]');
    const view = this.active;
    if (!el || !view || !view.svg.contains(el)) return null;
    return el.getAttribute('data-part');
  }

  private onTabClick = (e: Event): void => {
    const tab = (e.target as Element).closest<HTMLElement>('.tab');
    const name = tab?.dataset['view'];
    if (name) this.activate(name, true);
  };

  private onTabKeyDown = (e: KeyboardEvent): void => {
    const keys: Record<string, number> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
    let index = this.views.findIndex((v) => v.name === this.activeName);
    if (e.key in keys) index = (index + keys[e.key]! + this.views.length) % this.views.length;
    else if (e.key === 'Home') index = 0;
    else if (e.key === 'End') index = this.views.length - 1;
    else return;
    e.preventDefault();
    const v = this.views[index];
    if (!v) return;
    this.activate(v.name, true);
    v.tab.focus();
  };

  private onStageClick = (e: MouseEvent): void => {
    if (this.suppressClick) {
      this.suppressClick = false;
      return;
    }
    const id = this.partFromEvent(e);
    if (id) this.userToggle(id);
  };

  private onStageKeyDown = (e: KeyboardEvent): void => {
    const v = this.active;
    if (!v) return;
    const id = this.partFromEvent(e);
    if (id && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      this.userToggle(id);
      return;
    }
    const pan: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    };
    if (e.key === '+' || e.key === '=') this.zoomIn();
    else if (e.key === '-' || e.key === '_') this.zoomOut();
    else if (e.key === '0') this.resetZoom();
    else if (e.key in pan && e.shiftKey) {
      const [dx, dy] = pan[e.key]!;
      v.current = clampViewBox(
        { ...v.current, x: v.current.x + dx * v.current.width * 0.1, y: v.current.y + dy * v.current.height * 0.1 },
        v.base,
      );
      this.applyViewBox(v);
      this.updateToolbar();
    } else return;
    e.preventDefault();
  };

  private onPointerDown = (e: PointerEvent): void => {
    const v = this.active;
    if (!v || (e.pointerType === 'mouse' && e.button !== 0)) return;
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pointers.size === 1) {
      this.suppressClick = false;
      this.gesture = { kind: 'pan', start: { x: e.clientX, y: e.clientY }, from: { ...v.current }, moved: false };
    } else if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()] as [Point, Point];
      this.suppressClick = true;
      this.gesture = { kind: 'pinch', distance: distance(a, b) || 1, zoom: v.zoom };
    }
  };

  private onPointerMove = (e: PointerEvent): void => {
    const p = this.pointers.get(e.pointerId);
    const v = this.active;
    if (!p || !v || !this.gesture) return;
    p.x = e.clientX;
    p.y = e.clientY;
    const rect = v.svg.getBoundingClientRect();
    if (this.gesture.kind === 'pan') {
      const g = this.gesture;
      const dx = e.clientX - g.start.x;
      const dy = e.clientY - g.start.y;
      if (!g.moved) {
        if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
        g.moved = true;
        this.suppressClick = true;
        v.svg.classList.add('is-panning');
        try {
          v.svg.setPointerCapture?.(e.pointerId);
        } catch {
          // Capture can fail for synthetic pointers; panning still works.
        }
      }
      v.current = clampViewBox(panViewBox(g.from, dx, dy, rect), v.base);
      this.applyViewBox(v);
      this.updateToolbar();
    } else if (this.pointers.size >= 2) {
      const [a, b] = [...this.pointers.values()] as [Point, Point];
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const anchor = rect.width > 0 ? clientToSvg(mid, rect, v.current) : center(v.current);
      this.setZoom(v, (this.gesture.zoom * distance(a, b)) / this.gesture.distance, anchor, true);
    }
  };

  private onPointerUp = (e: PointerEvent): void => {
    if (!this.pointers.delete(e.pointerId)) return;
    const v = this.active;
    if (this.pointers.size === 0) {
      this.gesture = null;
      v?.svg.classList.remove('is-panning');
    } else if (this.pointers.size === 1 && v) {
      const [p] = [...this.pointers.values()] as [Point];
      this.gesture = { kind: 'pan', start: { ...p }, from: { ...v.current }, moved: true };
    }
  };

  private onPointerOver = (e: PointerEvent): void => {
    const id = this.partFromEvent(e);
    if (id === this.hovered || !this.activeName) return;
    this.hovered = id;
    this.emit('part-hover', { part: id, view: this.activeName });
  };

  private onPointerLeave = (): void => {
    if (this.hovered === null || !this.activeName) return;
    this.hovered = null;
    this.emit('part-hover', { part: null, view: this.activeName });
  };

  private onWheel = (e: WheelEvent): void => {
    const v = this.active;
    if (!v) return;
    e.preventDefault();
    const unit = e.deltaMode === 1 ? 0.05 : e.deltaMode === 2 ? 1 : 0.0015;
    const factor = Math.exp(-e.deltaY * unit);
    const rect = v.svg.getBoundingClientRect();
    const anchor =
      rect.width > 0 ? clientToSvg({ x: e.clientX, y: e.clientY }, rect, v.current) : center(v.current);
    this.setZoom(v, v.zoom * factor, anchor, true);
  };
}

declare global {
  interface HTMLElementTagNameMap {
    'svg-part-picker': SvgPartPicker;
  }
}
