# UI guide

The design system comes from the ui-ux-pro-max skill, using the "Data-Dense Dashboard" style. It targets a POS and SaaS admin used in Vietnamese: dense tables, fast cashier input, and a calm, professional look. Every new screen, including the GĐ2 fund book, must use these tokens and classes. Do not add new colours inline.

## Tokens (`public/style.css` `:root`)

| Token | Value | Use |
|---|---|---|
| `--primary` | `#1E40AF` | Main actions, links, active tab, focus ring |
| `--primary-soft` / `--primary-line` | `#EFF4FF` / `#DBEAFE` | Hover backgrounds, selected rows, info badges |
| `--accent` | `#D97706` | Only the main money action, e.g. the POS pay button (`.btn.big.primary`) |
| `--bg` / `--card` | `#F8FAFC` / `#fff` | Page background and surfaces |
| `--text` / `--heading` / `--muted` | `#0F172A` / `#1E3A8A` / `#475569` | Body text, headings and KPI values, secondary text |
| `--line` / `--line-2` | `#E2E8F0` / `#CBD5E1` | Dividers, input borders |
| `--ok` / `--warn` / `--danger` | `#15803D` / `#B45309` / `#DC2626` | Status colours; each has `-soft` and `-line` variants |
| `--sidebar` | `#0F1E4A` | Navigation background |

All text and background pairs meet a contrast ratio of at least 4.5:1. `--muted` on `--bg` is about 7:1.

## Typography

- Headings, KPI numbers and the brand use **Be Vietnam Pro** (`--font-head`).
- Body text uses **Noto Sans** (`--font`).
- Both are loaded from Google Fonts and fall back to system fonts. Both have full Vietnamese diacritics.
- The base size is 14px, which suits a dense dashboard. Nothing is smaller than 12px. Table headers are 12px uppercase.
- Money, quantities, barcodes and table cells use `font-variant-numeric: tabular-nums` so digits line up in columns.

## Icons

- Use `icon(name)` from `public/js/icons.js`. It returns inline Lucide-style outline SVG (24px grid, 1.75 stroke, `currentColor`, `aria-hidden`). It needs no dependency.
- Icons are decorative. Always put visible text next to them. An icon-only button needs an `aria-label`.
- For static HTML, add `data-icon="name"`. `app.js` fills these in on load.
- Do not use emoji as icons.
- To add an icon, copy its path data from lucide.dev into the `P` map.

## Components

Class names are stable. Tests and views depend on them.

- **Buttons (`.btn`):** 36px high.
  - Variants: `.primary`, `.danger`, `.ok`, `.ghost`, `.sm` (28px), `.big` (52px, full width).
  - Use one primary action per area.
- **Inputs:** `.field` is 36px high with a 3px primary focus ring. `label.fld` holds the label and field together.
- **Cards:** `.card`, whose `h3` acts as a header with a divider. `.stat` holds a KPI tile; set `.primary`, `.ok`, `.warn` or `.danger` for the value colour.
- **Tables:** `.tbl-wrap > table.grid`. The header row is sticky. Right-align numbers with `.r`.
- **Status badges:** `.badge.paid`, `.pending`, `.cancelled`, `.return`, `.sale`. Pills always carry text, never colour alone.
- **Navigation:** the active item gets a left accent bar and a tinted background.
- **Overlays and switches:**
  - `.tabs`/`.tab` for tabs.
  - `.seg`/`.seg-btn` for segmented switches.
  - `.modal-box` for modals.
  - `.toast` for messages; add `.err` for errors.

## Interaction rules

- Everything clickable has `cursor: pointer` and a hover state. Transitions are 150ms and animate colour or border only, never layout.
- Keyboard focus is always visible (`:focus-visible` outline).
- `prefers-reduced-motion` turns off transitions and animations.
- POS touch targets are at least 36–44px: the qty buttons, quick cash buttons, the delete button and the pay button.
- The layout must work at 375, 768, 1024 and 1440px. Below 820px the sidebar becomes a drawer. The page never scrolls horizontally; only tables do.
- The public report page (`report.css`) uses the same palette with flat colours: no gradients and no animated backgrounds.
