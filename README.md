# svg-part-picker

A framework-agnostic Web Component for picking parts on an SVG schematic drawn from several views: front, side, top, or any other set.

- Bring your own artwork. Any shape with a `data-part` attribute becomes selectable.
- Several views, each on its own tab with a live thumbnail and a count of selected parts.
- A part that appears in more than one view (the hood seen from the front and from above) stays in sync everywhere.
- Zoom with the mouse wheel, a pinch or the toolbar. Pan by dragging. A drag never counts as a click.
- Single or multiple selection, plus optional rules: disabled parts, an allow list, or "neighbours only".
- Keyboard and screen reader support. Parts are `role="checkbox"`, and views are ARIA tabs.
- Form-associated. Give it a `name` and the selected ids are submitted with the surrounding `<form>`.
- No runtime dependencies, about 8 kB gzipped. Written in strict TypeScript and ships with type declarations.

## Install

```sh
npm install github:kulykivska/svg-part-picker
```

```js
import 'svg-part-picker'; // registers <svg-part-picker>
```

To register the element under a different tag, or to get the class without registering it:

```js
import { defineSvgPartPicker } from 'svg-part-picker';
defineSvgPartPicker('car-part-picker');

import { SvgPartPicker } from 'svg-part-picker/element'; // no side effects
```

## Example

```html
<svg-part-picker name="damaged" selected="hood" max-zoom="6">
  <svg data-view="side" data-label="Side" viewBox="0 0 640 280">
    <path data-part="hood" data-label="Hood" d="M72 134 L214 128 L230 132 Z" />
    <circle data-part="front-wheel" data-label="Front wheel" cx="150" cy="206" r="36" />
    <!-- Anything without data-part is decoration. -->
    <circle cx="150" cy="206" r="17" fill="none" stroke="currentColor" pointer-events="none" />
  </svg>

  <svg data-view="top" data-label="Top" viewBox="0 0 650 300">
    <path data-part="hood" data-label="Hood" d="M78 74 L220 70 L220 230 L78 226 Z" />
  </svg>
</svg-part-picker>

<script type="module">
  import 'svg-part-picker';

  const picker = document.querySelector('svg-part-picker');
  picker.addEventListener('selection-change', (e) => {
    console.log(e.detail.selected, e.detail.added, e.detail.removed);
  });
</script>
```

Views are the direct children that carry `data-view`. Each one is either an `<svg>` or a `<template>` wrapping an `<svg>`. A `<template>` never renders on its own, so it avoids a flash of the raw artwork before the script loads. With plain `<svg>` children you can hide them with `svg-part-picker:not(:defined) { visibility: hidden; }`.

The drawing is copied into the shadow root. Ids inside it are prefixed per copy, and `url(#id)` and `href="#id"` references are rewritten, so gradients and clip paths keep working. Changes to the light DOM are picked up automatically.

## Markup

| Attribute | On | Meaning |
| --- | --- | --- |
| `data-view` | `<svg>` or `<template>` child | Required. The view name, used by the `view` attribute and in events. |
| `data-label` | view | Tab label. Defaults to the view name in title case. |
| `data-part` | any SVG element | Required. The part id. The same id in several views is the same part. |
| `data-label` | part | Accessible name and `parts[].label`. Defaults to the id. |

## Attributes

| Attribute | Property | Default | Description |
| --- | --- | --- | --- |
| `selected` | `selected: string[]` | `[]` | Selected part ids, space or comma separated. The attribute sets the initial value and the value restored on form reset. |
| `view` | `view: string \| null` | first view | The visible view. Reflected. |
| `selection-mode` | `selectionMode` | `multiple` | `multiple` or `single`. |
| `disabled` | `disabled: boolean` | `false` | Blocks selection. Zoom and pan still work. |
| `disabled-parts` | `disabledParts: string[]` | `[]` | Parts that cannot be selected. |
| `allowed-parts` | `allowedParts: string[] \| null` | `null` | When set, only these parts can be selected. |
| (none) | `adjacency: Record<string, string[]> \| null` | `null` | Neighbour map. When set in `multiple` mode, a new part must touch the current selection. Links are treated as two-way. |
| `min-zoom` | `minZoom: number` | `1` | Smallest zoom factor. Below 1 the drawing gets smaller than the stage. |
| `max-zoom` | `maxZoom: number` | `8` | Largest zoom factor. |
| `no-controls` | (none) | absent | Hides the zoom toolbar. |
| `name` | (none) | none | Form field name. Each selected id is submitted as its own entry. |

Read-only properties:

| Property | Type | Description |
| --- | --- | --- |
| `zoom` | `number` | Zoom factor of the visible view. `1` shows the whole drawing. |
| `parts` | `{ id, label, views }[]` | Every part found, in document order. |
| `viewList` | `{ name, label }[]` | Every view, in document order. |

Rules never remove a part that is already selected. It stays selected and the user can still deselect it.

## Methods

| Method | Returns | Description |
| --- | --- | --- |
| `select(id)` | `boolean` | Selects a part. Returns `false` if it was already selected. |
| `deselect(id)` | `boolean` | Deselects a part. Returns `false` if it was not selected. |
| `toggle(id)` | `boolean` | Toggles a part and returns whether it is now selected. |
| `clear()` | `void` | Deselects everything. |
| `isPartDisabled(id)` | `boolean` | Whether the current rules block the part. |
| `zoomIn()` / `zoomOut()` | `void` | Zooms the visible view by a factor of 1.5 around its centre. |
| `zoomTo(zoom)` | `void` | Sets the zoom factor, clamped to `min-zoom` and `max-zoom`. |
| `resetZoom()` | `void` | Shows the whole drawing again. |
| `refresh()` | `void` | Re-reads the views. Normally not needed. |

Methods and property setters do not fire `selection-change` or `view-change`, in the same way that setting `input.value` does not fire `input`. Events report what the user did.

## Events

All events are `CustomEvent`s that bubble and cross the shadow boundary.

| Event | `detail` | Fired when |
| --- | --- | --- |
| `selection-change` | `{ selected: string[], added: string[], removed: string[] }` | The user selects or deselects a part. |
| `view-change` | `{ view: string, previousView: string \| null }` | The user switches tabs. |
| `zoom-change` | `{ view: string, zoom: number }` | The zoom factor changes through user input or a zoom method. |
| `part-hover` | `{ part: string \| null, view: string }` | The pointer moves onto a part, or off all parts. |

In TypeScript, `addEventListener` is typed for these events:

```ts
picker.addEventListener('selection-change', (e) => e.detail.added); // string[]
```

## Interaction

| Input | Action |
| --- | --- |
| Click or tap a part | Toggle it |
| Wheel, pinch, toolbar `+` / `-` | Zoom around the pointer (or the centre) |
| Drag | Pan when zoomed in |
| `Tab` then `Space` or `Enter` | Toggle the focused part |
| `+` / `-` / `0` | Zoom in, zoom out, reset (focus inside the drawing) |
| `Shift` + arrow keys | Pan |
| Arrow keys, `Home`, `End` on the tabs | Switch view |

## Styling

The look is set by CSS custom properties on the element. The defaults use `light-dark()`, so they follow the page `color-scheme`.

| Property | Purpose |
| --- | --- |
| `--spp-accent` | Accent colour for selection, focus and badges |
| `--spp-bg`, `--spp-surface`, `--spp-border` | Stage, tab bar and toolbar, borders |
| `--spp-text`, `--spp-muted` | Text colours |
| `--spp-line` | `currentColor` inside the drawing, for decoration |
| `--spp-part-fill`, `--spp-part-stroke`, `--spp-part-stroke-width` | Idle parts |
| `--spp-part-hover-fill` | Hovered parts |
| `--spp-selected-fill`, `--spp-selected-stroke` | Selected parts |
| `--spp-disabled-opacity` | Blocked parts |
| `--spp-radius`, `--spp-font` | Corner radius and font |

The element is `28rem` tall by default. Set `height` on it to change that.

Shadow parts for deeper styling: `container`, `tabs`, `tab`, `badge`, `stage`, `toolbar`, `empty`.

Slots: `actions` (the end of the toolbar, for example a Submit button) and `empty` (shown when there are no views).

## Development

```sh
npm install
npm run dev        # demo at http://localhost:5173/demo/
npm test           # vitest + happy-dom
npm run typecheck
npm run build      # ESM + .d.ts into dist/
```

The demo in `demo/index.html` uses an original, deliberately simple car schematic with side, front and top views.

## License

[MIT](./LICENSE)
