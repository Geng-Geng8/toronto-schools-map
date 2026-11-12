# Live GitHub Pages acceptance checklist

These steps must be checked on the **published URL** with an internet connection; the implementation cannot be called fully production-validated until they pass.

- [ ] Live map tiles render and OpenStreetMap / OpenFreeMap attribution is visible.
- [ ] All 758 schools display when both boards and levels are selected.
- [ ] Markers use blue circles/squares for TDSB and burgundy circles/squares for TCDSB.
- [ ] Zooming out clusters nearby schools into neutral count markers.
- [ ] Tapping a cluster zooms in and eventually shows separate school markers.
- [ ] Tapping individual markers opens the correct school detail card.
- [ ] The View all control fits the currently filtered school set without recreating the map.
- [ ] Search by name and street matches schools, including after other filters are applied.
- [ ] All four category combinations, zero-results state and Reset filters work.
- [ ] Directions, copy address, school websites and optional phone links work.
- [ ] Mobile bottom sheet opens, closes, scrolls, and selects a school without blocking the map afterward.
- [ ] Mobile landscape and 320/375/390px portrait have no horizontal overflow or blocked controls.
- [ ] Desktop, Android Chrome and iOS Safari render correctly.
- [ ] Keyboard Tab, Enter, Escape, focus outlines, screen-reader names, and 200% zoom tested.
- [ ] Map-unavailable fallback shows while list/search/filter remain usable.
- [ ] All data licenses/attributions verified and preserved.

**Automated tests:** `npm test` verifies records, combinations, search, coordinates and safe links; `.github/workflows/quality.yml` runs it on each push and pull request.
