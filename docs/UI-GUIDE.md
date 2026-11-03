# UI guide

The design system comes from the ui-ux-pro-max skill, using the "Data-Dense Dashboard" style, recoloured to match the in-app Làng Số screens (blue palette from `src/pages/TrangChu.vue`, `ViecCanLam.vue` and `BaoCao.vue`, purple as the Thanh toán số module colour, Be Vietnam Pro, light blue gradient background, soft rounded cards). It targets a POS and SaaS admin used in Vietnamese, including elderly village heads: large text, large touch targets, top tabs instead of a hidden menu, and a calm, professional look. Every new screen, including the GĐ2 fund book, must use these tokens and classes. Do not add new colours inline.

## Tokens (`public/style.css` `:root`)

| Token | Value | Use |
|---|---|---|
| `--primary` / `--primary-h` / `--primary-d` | `#1D4ED8` / `#1E40AF` / `#1E3A8A` | Main actions, links, active tab, focus ring; hover; pressed |
| `--primary-soft` / `--primary-line` | `#E5EEFC` / `#C7D7F5` | Hover backgrounds, active tab, selected rows, info badges |
| `--accent` | `#1D4ED8` | Only the main money action, e.g. the POS pay button (`.btn.big.primary`) |
| `--brand` / `--brand-soft` | `#7C3AED` / `#EDE5FD` | Thanh toán số identity only: logo tile, favicon, report page highlights. Never for buttons |
| `--bg` / `--card` | `#F5F8FC` / `#fff` | Page background (under the `#E6EFFB` to `#F5F8FC` gradient) and surfaces |
| `--text` / `--heading` / `--muted` | `#1F2A44` / `#1E3A8A` / `#4A5B82` | Body text, headings and KPI values, secondary text |
| `--line` / `--line-2` | `#E3EAF5` / `#D6DEEC` | Dividers, input borders |
| `--ok` / `--warn` / `--danger` | `#15803D` / `#B45309` / `#B3261E` | Status colours; each has `-soft` and `-line` variants |

All text and background pairs meet a contrast ratio of at least 4.5:1. `--muted` on `--bg` is about 6.5:1.

## Typography

- All text uses **Be Vietnam Pro** (`--font`, `--font-head`), the same font as Làng Số.
- It is loaded from Google Fonts, falls back to system fonts and has full Vietnamese diacritics.
- The base size is 16px so elderly users can read without zooming. Page titles are 26px (22px on phones), card titles 18px, tabs 17px. Nothing is smaller than 13px. Table headers are 14px.
- Money, quantities, barcodes and table cells use `font-variant-numeric: tabular-nums` so digits line up in columns.

## Icons

- Use `icon(name)` from `public/js/icons.js`. It returns inline Lucide-style outline SVG (24px grid, 1.75 stroke, `currentColor`, `aria-hidden`). It needs no dependency.
- Icons are decorative. Always put visible text next to them. An icon-only button needs an `aria-label`.
- For static HTML, add `data-icon="name"`. `app.js` fills these in on load.
- Do not use emoji as icons.
- To add an icon, copy its path data from lucide.dev into the `P` map.

## Components

Class names are stable. Tests and views depend on them.

- **Buttons (`.btn`):** 44px high. `.icon-btn` is 44px square.
  - Variants: `.primary`, `.danger`, `.ok`, `.ghost`, `.sm` (38px, only inside dense tables), `.big` (52px, full width).
  - Use one primary action per area.
- **Inputs:** `.field` is at least 44px high, 16px text, with a 3px primary focus ring. `label.fld` holds the label and field together.
- **Cards:** `.card`, whose `h3` acts as a header with a divider. `.stat` holds a KPI tile; set `.primary`, `.ok`, `.warn` or `.danger` for the value colour.
- **Tables:** `.tbl-wrap > table.grid`. The header row is sticky. Right-align numbers with `.r`.
- **Status badges:** `.badge.paid`, `.pending`, `.cancelled`, `.return`, `.sale`. Pills always carry text, never colour alone.
- **Navigation:** a sticky top header (`.topbar`), as in Làng Số. Row 1: logo, shop name, user and Đăng xuất. Row 2: one tab per module (`.nav-item`, 52px); the active tab has a tinted background and a 3px underline. A module with sub-screens (Báo cáo) shows them as pills in `.nav-subrow` under the tabs. On phones the tab row scrolls sideways and the active tab scrolls into view.
- **Overlays and switches:**
  - `.tabs`/`.tab` for tabs.
  - `.seg`/`.seg-btn` for segmented switches.
  - `.modal-box` for modals.
  - `.toast` for messages; add `.err` for errors.

## Interaction rules

- Everything clickable has `cursor: pointer` and a hover state. Transitions are 150ms and animate colour or border only, never layout.
- Keyboard focus is always visible (`:focus-visible` outline).
- `prefers-reduced-motion` turns off transitions and animations.
- Touch targets are at least 44px (38px only for `.btn.sm` inside tables): tabs, buttons, qty buttons, quick cash buttons and the pay button.
- The layout must work at 375, 768, 1024 and 1440px. Below 820px the header tightens and the tab row scrolls; below 480px the user name hides and only Đăng xuất stays. The page never scrolls horizontally; only tables and the tab row do.
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
