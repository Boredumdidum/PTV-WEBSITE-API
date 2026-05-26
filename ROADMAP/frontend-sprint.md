# Front-End Developer — Sprint Plan

## Task List
- [ ] Refactor `script.js` into ES module files by domain (map, dashboard, preview, utils)
- [ ] Debounce the route search input to prevent excessive re-renders
- [ ] Add loading skeleton/shimmer state for stat cards during data fetch
- [ ] Implement retry button with exponential backoff on network errors
- [ ] Add keyboard navigation and ARIA labels for accessibility
- [ ] Move Leaflet configuration into a constants/config object
- [ ] Add `prefers-reduced-motion` and `prefers-color-scheme` media query support
- [ ] Extract CSS custom properties into `tokens.css`
- [ ] Add a CSS reset / normalise styles across browsers
- [ ] Add client-side performance instrumentation
- [ ] Create `src/components/`, `src/utils/`, `src/config/` directory structure
- [ ] Add basic DOM smoke tests (Playwright or happy-dom)
- [ ] Create `.env.example` with all documented variables
- [ ] Design and add favicon (SVG + ICO) with neo-brutalist tram icon, configure links in `<head>`

## Weekly Phases

### Phase 1 — Foundations
- Extract CSS custom properties into `tokens.css`
- Add CSS reset / normalise styles across browsers

### Phase 2 — Security (UI side)
- Add `prefers-reduced-motion` and `prefers-color-scheme` media query support
- Move Leaflet tile URL and map defaults into a constants/config object

### Phase 3 — Component Layout
- Create `src/components/`, `src/utils/`, `src/config/` directory structure
- Extract map logic into `components/map.js`

### Phase 4 — Extraction
- Extract dashboard logic (feed selector, stats, status badge) into `components/dashboard.js`
- Extract preview panel into `components/preview.js`
- Move formatting utilities to `utils/format.js`

### Phase 5 — UX Polish
- Debounce route search input (300ms delay)
- Add loading skeleton / shimmer animation for stat cards
- Implement retry button with exponential backoff on fetch failure

### Phase 6 — Accessibility & Instrumentation
- Add keyboard navigation for sidebar (arrow keys, Enter/Space)
- Add ARIA labels to all interactive elements
- Add client-side performance instrumentation (time-to-data, map render time)

### Phase 7 — Final Integration & Docs
- Add basic DOM smoke tests (Playwright or happy-dom)
- Create `.env.example` with all documented variables
- Final integration test — deploy to staging, verify all 5 feeds load correctly, map renders, theme toggles, mock data works offline
