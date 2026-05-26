# UI Style Guide — Neo-Brutalist

Follow every rule in this document exactly when styling a website. This is a visual design system specification. Do not deviate from these rules unless the user explicitly asks you to.

---

## DESIGN PHILOSOPHY

The visual style is **neo-brutalist**: bold, graphic, and unapologetically sharp. Every element must follow these absolute rules:

- `border-radius: 0` on ALL elements. Never round any corners.
- Borders are always `3px solid` using the `--border` colour variable.
- Box shadows are always hard-offset with zero blur: `Npx Npx 0 var(--shadow)`. Cards use `6px 6px 0`. Buttons use `4px 4px 0`. Small buttons use `3px 3px 0`. Toasts use `4px 4px 0`.
- No glows, no gradients, no soft shadows, no drop-shadow filters.
- Accent colours are bold and saturated, never pastel or muted.

---

## COLOUR SYSTEM

Use CSS custom properties on `:root`. All components must reference these variables — never hard-code colours on elements (except per-item accent backgrounds like icon boxes and chart bars).

### Light theme (default)

```css
:root {
    --bg: #F5F0EB;
    --bg-card: #FFFFFF;
    --text: #1A1A1A;
    --text-muted: #6B6B6B;
    --border: #1A1A1A;
    --accent: #339AF0;
    --accent-hover: #1C7ED6;
    --danger: #FF6B6B;
    --danger-hover: #E03131;
    --sidebar-bg: #1A1A1A;
    --sidebar-text: #F5F0EB;
    --sidebar-hover: #333333;
    --shadow: #1A1A1A;
}
```

### Dark theme (applied via `body.dark` class)

```css
body.dark {
    --bg: #1A1A1A;
    --bg-card: #2A2A2A;
    --text: #F5F0EB;
    --text-muted: #A0A0A0;
    --border: #F5F0EB;
    --sidebar-bg: #111111;
    --sidebar-text: #F5F0EB;
    --sidebar-hover: #333333;
    --shadow: #000000;
}
```

### Accent palette

| Colour | Hex |
|--------|-----|
| Yellow | `#FFD43B` |
| Blue | `#339AF0` |
| Red | `#FF6B6B` |
| Green | `#51CF66` / `#B2F2BB` |
| Light Blue | `#A5D8FF` |
| Pink | `#FFBDBD` |
| Purple | `#CC5DE8` |
| Orange | `#FF922B` |
| Teal | `#20C997` |

Use these for icon backgrounds, chart bars, progress fills, highlights, and any place a bold spot colour is needed.

---

## TYPOGRAPHY

### Fonts to load

1. **Display font** — a bold, condensed sans-serif for headings and large values. Use "Barlow Condensed" from Google Fonts.
2. **Body font** — "Inter" from Google Fonts (optical sizing, weights 300–800).
3. **Data font** — "JetBrains Mono" from Google Fonts (weights 400, 500, 600, 700).

### Font variables

```css
--font-display: "Barlow Condensed", "Barlow", "DM Sans", sans-serif;
--font-body: "Inter", system-ui, -apple-system, sans-serif;
--font-data: "JetBrains Mono", "Consolas", monospace;
```

### Where to apply

- `font-family: var(--font-display)` → page title, card titles, large stat/counter values, logo text
- `font-family: var(--font-body)` → everything else (body, buttons, inputs, labels, toasts)

### Sizes

| Element | Size |
|---------|------|
| Page title | 36px |
| Card title | 22px |
| Stat value | 26px |
| Large display value | 48px |
| Body/buttons/inputs | 14px |
| Small label | 12px, uppercase, letter-spacing 1px |
| Subtitle | 15px |
| Logo text | 54px |

---

## LAYOUT STRUCTURE

The page uses a **fixed sidebar + scrollable main content** layout.

```
┌──────────┬──────────────────────────────────┐
│          │  Header (title + subtitle + btn) │
│ Sidebar  ├──────────────────────────────────┤
│ (fixed)  │  Main content area               │
│ 220px    │  max-width: 960px                │
│          │  padding: 32px 40px              │
└──────────┴──────────────────────────────────┘
```

- Sidebar: `width: 220px`, `position: fixed`, `top: 0`, `left: 0`, `bottom: 0`, background `var(--sidebar-bg)`, right border `3px solid var(--border)`
- Main content: `margin-left: 220px`, `max-width: 960px`, `padding: 32px 40px`
- Sidebar toggle: hamburger button (`#sidebar-toggle`) positioned `absolute; left: 100%` inside the sidebar. When collapsed (`body.sidebar-closed`), sidebar translates `-100%` off-screen via CSS transition; main margin adjusts. State persisted in `localStorage`.

### Sidebar contents (top to bottom)

1. **Logo area** — centered text, 100px tall, bottom border `3px solid #333`, background `var(--sidebar-bg)`, font-size 54px, colour `#FFD43B`
2. **Nav buttons** — flex column, 2px gap. Each button: flex row, `gap: 12px`, `padding: 12px 20px`, `border-left: 4px solid transparent`. Active state: `background: var(--sidebar-hover)`, `border-left-color: #FFD43B`, `color: #FFD43B`
3. **Footer** — top border `3px solid #333`, contains the theme toggle button

---

## ICON SYSTEM

Use **Lucide** icons via CDN:

```html
<script src="https://unpkg.com/lucide@latest/dist/umd/lucide.js"></script>
```

Place icons with: `<i data-lucide="icon-name" class="icon"></i>`

Call `lucide.createIcons()` on page load. After dynamically inserting elements with icons, call `lucide.createIcons({ nodes: [parentElement] })` to render them.

Base icon size: `width: 18px; height: 18px`. Stat card icons: `22px`.

---

## COMPONENT SPECIFICATIONS

### Buttons

Base class `.btn` with modifier classes:

```css
.btn {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 10px 18px;
    font-family: var(--font-body);
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    border: 3px solid var(--border);
    border-radius: 0;
    box-shadow: 4px 4px 0 var(--shadow);
    transition: transform 0.1s, box-shadow 0.1s;
}

.btn:active {
    transform: translate(2px, 2px);
    box-shadow: 2px 2px 0 var(--shadow);
}
```

| Variant | Background | Text colour |
|---------|-----------|-------------|
| `.btn-primary` | `var(--accent)` | `#fff` |
| `.btn-outline` | `var(--bg-card)` | `var(--text)` |
| `.btn-danger` | `var(--danger)` | `#fff` |
| `.btn-sm` | (inherits) | (inherits), padding `6px 12px`, font-size `12px`, shadow `3px 3px 0` |

The `:active` state creates a physical "press" effect by translating the button 2px down-right and shrinking the shadow.

### Cards

```css
.card {
    background: var(--bg-card);
    border: 3px solid var(--border);
    border-radius: 0;
    padding: 24px;
    margin-bottom: 24px;
    box-shadow: 6px 6px 0 var(--shadow);
}
```

### Card Grid

```css
.card-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
    gap: 16px;
    margin-bottom: 24px;
}
```

### Stat Cards

A card containing a coloured icon box (48x48, 3px border) and a label/value pair. Layout: `display: flex; align-items: center; gap: 16px`. The label is 12px uppercase muted text. The value uses `var(--font-display)` at 26px.

### Text Inputs & Textareas

```css
border: 3px solid var(--border);
border-radius: 0;
padding: 10px 14px;       /* inputs */
padding: 12px;            /* textareas */
background: var(--bg);
color: var(--text);
font-family: var(--font-body);
font-size: 14px;
```

Focus state: `outline: 3px solid var(--accent); outline-offset: -3px`.

### List Items

List items are flex rows. Use `border: 2px solid var(--border)`, `background: var(--bg)`, `margin-bottom: 6px`. Include content text and optional action buttons or metadata (e.g. timestamps).

For checkable items: include a checkbox (20x20 square, 3px border, no radius). When `.done`: `text-decoration: line-through`, `color: var(--text-muted)`, checkbox fills with `var(--accent)` and shows a white check icon.

### Bar Chart

A flex container (`align-items: flex-end`, `height: 200px`, `gap: 12px`). Each column is `flex: 1`, flex-column, `justify-content: flex-end`. Bars have `border: 3px solid var(--border)`, `transition: height 0.4s ease`. Height is set dynamically as a percentage via JS.

### Progress Bars

A flex row: label (13px, 600 weight, 90px wide), track (flex: 1, 24px tall, 3px border, `overflow: hidden`), percentage text (13px, 700 weight, 40px wide right-aligned). The fill div inside the track has `height: 100%` and `transition: width 0.5s ease`.

### Accordion

Each item has a `3px solid var(--border)` border with `margin-bottom: -3px` (so borders collapse). The trigger is a full-width flex button with text and a chevron icon. Content uses `max-height: 0; overflow: hidden; transition: max-height 0.25s ease`. When `.open`: `max-height: 200px`. The chevron rotates 180deg when open. Only one item open at a time.

### Toast Notifications

Container: `position: fixed; top: 20px; right: 20px; z-index: 9999; flex-direction: column; gap: 8px`.

Each toast: `padding: 12px 18px`, `border: 3px solid var(--border)`, `box-shadow: 4px 4px 0 var(--shadow)`, flex row with icon and text. Animate in by sliding from right (`translateX(40px)` → `translateX(0)`, 0.25s). Auto-dismiss after ~3 seconds by adding a `.toast-out` class that reverses the animation, then remove from DOM on `animationend`.

---

## INTERACTION PATTERNS

### Tab / Page Navigation

Sidebar nav buttons switch between content panels. Clicking a button:
1. Removes `.active` from all nav buttons and all panel elements
2. Adds `.active` to the clicked button and the corresponding panel

Panels: `display: none` by default, `.active` → `display: block`.

### Dark/Light Theme Toggle

- Toggle `body.dark` class on click
- Save preference to `localStorage` (values: `"dark"` or `"light"`)
- Load saved preference on page start
- Update the toggle button's icon (sun ↔ moon) and label text
- Show a toast confirming the change

### Keyboard

Where applicable, text inputs should support `Enter` key to submit (e.g. adding items to a list).

---

## SECURITY

Always escape user input before inserting into `innerHTML`:

```js
function escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}
```

Apply `escapeHTML()` to all user-provided text before rendering.

---

## RESPONSIVE BEHAVIOUR

At `max-width: 768px`:

- Sidebar shrinks to `60px`. Hide all `span` text inside nav buttons and the logo text. Centre nav button icons. Adjust padding.
- Main content: `margin-left: 60px`, `padding: 20px 16px`
- Page title: `36px` → `26px`
- Card grid: force `repeat(2, 1fr)`
- Page header: `flex-direction: column`

---

## TRANSITIONS SUMMARY

| Element | Property | Duration | Easing |
|---------|----------|----------|--------|
| `body` | `background, color` | `0.2s` | default |
| `.btn` | `transform, box-shadow` | `0.1s` | default |
| `.bar` | `height` | `0.4s` | `ease` |
| `.progress-fill` | `width` | `0.5s` | `ease` |
| `.accordion-content` | `max-height` | `0.25s` | `ease` |
| `.accordion-chevron` | `transform` | `0.2s` | default |
| `.nav-btn` | `background, border-color` | `0.15s` | default |
| List items | `background` | `0.1s` | default |
| Toast in | `opacity, transform` | `0.25s` | `ease` |
| Toast out | `opacity, transform` | `0.2s` | `ease` |

---

## TECH STACK

- Vanilla HTML, CSS, JavaScript only — no frameworks, no build tools
- Lucide icons via CDN (`https://unpkg.com/lucide@latest/dist/umd/lucide.js`)
- Google Fonts: Barlow Condensed, Inter, JetBrains Mono (`https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@400;500;600;700&family=Inter:opsz,wght@14..32,300..800&family=JetBrains+Mono:wght@400;500;600;700&display=swap`)
- `localStorage` for persisting user preferences and data
- Single `index.html`, `style.css`, `script.js` file structure
