# VANTAGE v1.3.10.3 — Tall-Screen Mobile UI Optimisation

## Scope
UI-only update based on the stable v1.3.10.2 build. No database schema, workout, LISS, OCR, recovery, macro or evidence logic has been changed.

## Changes
- Added dynamic viewport height (`100dvh`) with `100vh` fallback.
- Added independent Android safe-area handling for top, bottom, left and right edges.
- Added geometry-based compact portrait rules for phones materially taller than 16:9; no Sony-specific user-agent detection is used.
- Reduced wasted card/header/panel spacing on tall phones while retaining touch target sizes.
- Increased usable workout width by reducing side gutters on narrow portrait displays.
- Tightened exercise, metrics, recovery and LISS vertical rhythm.
- Adjusted fixed bottom navigation and toast offsets for safe-area/navigation-bar space.
- Dialogs use dynamic viewport height so they do not extend behind Android browser/system UI.

## Compatibility
The PWA identity and `http://localhost:8080` origin are unchanged, so existing IndexedDB data remains in place.
