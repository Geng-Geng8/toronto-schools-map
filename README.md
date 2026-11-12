# Toronto Schools Atlas

A fast, mobile-first directory and interactive map of Toronto's **TDSB and TCDSB elementary and secondary schools**. Hosted as a static site: no database, API keys, login, npm build, or server-side runtime required.

## Features

- **758 school records** carried over from the original supplied HTML: 559 TDSB, 199 TCDSB; 626 elementary, 132 secondary.
- Clear **dual-channel map legend**: board by colour (blue TDSB, burgundy TCDSB); level by shape (circle elementary, square secondary).
- Fast name/street search, combined board/level filters and dynamic counts.
- **MapLibre GL JS** with real GeoJSON clustering and cluster expansion; one persistent map instance instead of hundreds of DOM markers.
- Searchable school list, paginated in chunks of 100, and mobile results bottom sheet.
- School details, call, safe website links, directions, and copy address.
- Clear empty states, keyboard controls, responsive mobile layout, map-failure fallback.
- Google Maps directions launch externally; no student or user data stored.

## Quick start

No dependency installation necessary.

```bash
python3 -m http.server 8000
```

Open `http://localhost:8000`. Do **not** double-click `index.html` as `file://` restricts loading the JSON data.

## Run tests

```bash
npm test
```

Tests use Node's built-in test runner and do not need packages installed.

## Publish with GitHub Pages

1. Create a **new public repository** on GitHub, e.g. `toronto-schools-map`.
2. Upload the **contents** of this folder to the repository's root: `index.html`, `app.js`, `utils.mjs`, `styles.css`, `favicon.svg`, `.nojekyll`, `data/`, `tests/`, `package.json`, and `README.md`.
3. Go to **Settings → Pages → Build and deployment → Deploy from a branch**.
4. Select branch **main**, folder **/(root)** and save.
5. Your site will use `https://YOUR_USERNAME.github.io/toronto-schools-map/` (replace account/repo). GitHub Pages may take a few minutes to publish.

All paths are relative, so project-repository URLs work without a special `base` setting. For automated deployment, use GitHub Actions later if needed, but a branch deployment is simplest.

## Data provenance and upkeep

Data was extracted **without changing school names, boards, grade ranges, addresses, phone numbers, websites, or coordinates** from the supplied `Toronto Schools Map.html` snapshot. Each record has a stable numeric `id` assigned by its position in the original dataset. The original application's credits indicate **Ontario Ministry of Education school list, Aug 2026** and **City of Toronto Open Data locations, May 2026**.

This is **not a live school-directory feed**. School contact details, campuses, grade ranges and links can change. Review provenance, licences, accuracy and updates before representing data as current or official. Preserve all required source acknowledgements when publishing.

## External services / privacy

- Map library CSS/module: `https://unpkg.com/maplibre-gl@6.17.0/…` (pinned version, CDN).
- Map tiles and styles: [OpenFreeMap](https://openfreemap.org/) using OpenStreetMap-derived data; map attribution remains visible.
- Optional external school websites and Google Maps direction links open only when clicked.
- The website does **not** collect or send search terms to an application backend. The map provider receives standard map-tile requests when the map loads; the CDN receives requests for the library.
- If CDN, maps, or WebGL is unavailable, school search, filters and list still work. A fallback panel explains the issue.

## Technical notes

The app is intentionally framework-free: `index.html` + `styles.css` + `app.js` + pure testable `utils.mjs` + local `data/schools.json`. This keeps GitHub Pages hosting cheap and avoids a build tool for a small directory. A separate Vite/npm pipeline becomes reasonable if the product grows into a CRM or account-based system.

MapLibre's v6 ESM CDN and OpenFreeMap style URL follow official usage documentation. The app uses map-native GeoJSON clustering, not DOM marker grids; filters call `setData()` on the existing source and preserve the camera.

## Known verification limits

Automated tests validate dataset shape, combinations, search, links and geometry. Real map-tile load, cluster tap gestures, Safari/Android rendering, screen-reader behaviour and hosting need final browser/device checks with internet access. No claim of WCAG certification or Lighthouse 100 is made.

## Suggested next steps

- Smoke test published GitHub Pages URL on an Android phone and a desktop browser.
- Audit school data freshness annually or each term.
- Add downloadable filtered CSV only if there is clear value; don't start collecting private outreach data in the public static site.

