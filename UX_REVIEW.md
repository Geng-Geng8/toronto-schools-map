# School discovery UX review

## Scope

Refine the existing static application; preserve MapLibre, GeoJSON clustering,
all school records, links, classification logic, and GitHub Pages deployment.
No runtime dependencies, tracking, accounts, build step, or deployment changes.

The advertised remote branches and pull-request heads were inspected. No separate
secondary-marker design preview was available. This branch starts from main
`4c18d86534b7724fd71c4e07e6549fc7402cc4c6`; the deployed HTML, JS, CSS, utility
module, and dataset were verified byte-for-byte against that commit.

## Design decisions

- At zoom 13, outlined circles are 16px across and squares are 21.6px (35% wider).
  The ratio holds across the zoom stops. Square corners are crisp; UI symbols
  use the same relative proportions and board colours.
- A transparent 44px target and one nearest-point decision replace competing
  click handlers. Coincident coordinates resolve deterministically by ID;
  individual records remain directly accessible through search/results.
- The selected school is redrawn above other layers with a restrained halo.
  Camera padding reserves space for its information card. Filtering preserves
  the map instance and camera. Desktop map selections reveal the matching result
  row, extending pagination only when needed.
- Positron provides a quieter, brighter basemap (55 layers versus Liberty's 111).
  Initial bounds are applied at construction, avoiding an initial camera flight
  and redundant tile work. Map CSS preloads without blocking directory rendering.
- A narrower desktop sidebar, more compact mobile controls, stronger control
  states, 44px primary targets, and shared symbols improve scanning.
- The four-category key opens by default, collapses, and clears the detail card.
  Mobile overlays reserve room for map attribution.
- The mobile results sheet traps focus, makes background controls inert, closes
  with Escape/backdrop/close, and restores focus. Selecting a row focuses the
  detail heading; closing returns to an appropriate origin. Opening results
  dismisses details so panels do not stack.
- Counts derive from loaded data, including the first displayed values. Empty
  grade/contact/website fields stay hidden. Reduced-motion settings remain honoured.

## Repeatable checks

```sh
node --check app.js
node --check utils.mjs
npm test
python3 -m http.server 8000 --bind 0.0.0.0
```

Optional browser regression checks require Python Playwright, a running Chromium
CDP endpoint, and access to the real CDN and tile service:

```sh
python3 tests/browser_smoke.py --evidence /tmp/atlas-evidence
# Limit widths while investigating a particular layout:
python3 tests/browser_smoke.py --widths 320 390
```

Browser state is exposed only in intercepted test responses. No test globals or
mock map assets are shipped. The browser checks cover the real MapLibre renderer,
all four categories, each filter and combinations, search/clear/Enter, empty
results, clipboard, details, focus, pagination, cluster expansion, persistent map
identity, attribution clearance, and separate module/CSS/style failure recovery.

## Evidence and limits

Ten Node tests pass, including marker proportions and nearest-target regressions.
Chrome checks use emulated 320, 375, 390, 768 and 1440px viewports and software
WebGL, not physical phones. Before/after mobile and desktop screenshots and JSON
audit artifacts are retained in the task's `/tmp/atlas-evidence` directory.
Axe WCAG A/AA checks passed in initial, filtered, results-sheet and detail states
at 390px and 1440px. A further 900px check covers the narrow desktop map. This is not a complete accessibility certification.

A concurrent browser run timed out waiting for map recovery; subsequent serial
module/CSS/style recovery checks passed. Cloud startup under load needs real-device
follow-up rather than a blanket reliability claim. Selecting a school before map
initialization completes is covered by a gated-load regression check.

WebKit was downloaded and launch was attempted. The image lacks GTK4, Graphene,
HarfBuzz ICU, Manette, Hyphen and GLES system libraries; Safari is unverified.
Real-device gestures, virtual keyboards, screen readers and field INP remain
manual acceptance checks. Third-party CDN/tile availability remains external.

## Performance sample

Lighthouse 12.8.2, localhost server, real external map resources, headless Chromium
156, software WebGL (SwiftShader), 412 × 823 CSS px at DPR 1.75, simulated mobile
network (150ms RTT, 1,638.4 Kbps) and 4× CPU slowdown. Other test contexts were
closed for this run. Scores: **Performance 68, Accessibility 100**. LCP **2.52s**,
FCP **1.2s**, CLS **0.044**, TBT **2,330ms**, Speed Index **3.0s**. These are one
lab sample, not real-device or field measurements. The 90+ performance target
is not met in this software-rendered cloud run; MapLibre startup remains the
main CPU cost. No field INP or physical-device frame-rate claim is made.
The raw report is `lighthouse-final-mobile.json` in the evidence directory.

## Release

Prepared for review only. No merge or deployment is authorized. Roll back to
`4c18d86534b7724fd71c4e07e6549fc7402cc4c6` if a later approved release needs reverting.
