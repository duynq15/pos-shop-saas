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

## Fund book screen (`public/js/views/funds.js`, `.fd-*` in `style.css`)

The screen follows the treasurer's daily work, not the database tables.

- **Fund picker:** each fund is a `.fd-chip` showing its name and balance. On a phone the chips scroll sideways and the scrollbar is hidden.
- **Figures:** balance, income this month, spending this month, and the number of open tasks. Each uses the `.stat` colour for its meaning. On a phone the balance takes the whole first row.
- **Actions:**
  - "Thu tiền" (record income) is the one primary button.
  - "Lập phiếu chi" (new expense) is a normal button.
  - Rarely used actions (adjustment, edit fund) sit in the "Thêm" `<details>` menu.
  - On a phone, a fixed `.fd-bar` at the bottom holds Thu tiền and Phiếu chi.
- **Tabs:**
  - **Việc cần làm (to do):** one card per item, showing what is missing and the next action. A disabled button explains itself in its title.
  - **Sổ thu chi (ledger):** income is `+` in green and spending is `−` in red. The source and the "has photo" flag appear as a subline, and a row opens its details. On a phone each row becomes a card, so nothing scrolls sideways.
  - **Báo cáo (report):** loads this month straight away and has quick ranges in a `.seg` switch.
- **Money input:**
  - A text field with `inputmode="numeric"` that formats thousands as you type.
  - Quick amount buttons.
  - Parse the value with `parseMoney` before sending.
- **Receipt photo:** a `.fd-drop` area with a preview. Tapping it opens the phone camera or gallery.
