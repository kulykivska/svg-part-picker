import { SvgPartPicker } from './svg-part-picker.js';

export * from './svg-part-picker.js';
export type { Adjacency } from './selection.js';
export type { ViewBox } from './viewbox.js';

/** Registers `<svg-part-picker>` unless a definition already exists. */
export function defineSvgPartPicker(tagName: string = SvgPartPicker.tagName): void {
  if (typeof customElements !== 'undefined' && !customElements.get(tagName)) {
    customElements.define(tagName, tagName === SvgPartPicker.tagName ? SvgPartPicker : class extends SvgPartPicker {});
  }
}

defineSvgPartPicker();
