# UI audit, phase 0 (before)

Made by the smoke run with `ELEUSINIA_SMOKE_AUDIT=design/audit ELEUSINIA_SMOKE_SHOTS=design/audit/screens npm run smoke` (`test/audit.mjs`, hooked into every screenshot the run takes, plus every Settings section and the main screens in Ivory at the end), then `node scripts/audit-report.mjs design/audit before`. Rerun both after the rebuild with `ELEUSINIA_SMOKE_AUDIT_NAME=after` and `after`.

| File | What |
|---|---|
| `text-before.json`, `text-before.md` | Every visible text element on 64 screens: computed family, size, weight, line height, letter spacing, colour, italic, case, with its screen and element path |
| `type-roles.md` | Every text element sorted into the job it does (20 roles), each with the styles it uses today and where it appears |
| `buttons-before.json`, `buttons-before.md` | Every clickable thing (2306 seen) and its 159 distinct looks, grouped into 17 kinds |
| `buttons-before-1.png` … `-4.png` (and `.html`) | One of each look at rest, hover, pressed and focus, forced through DevTools (`buttons/`) |
| `mockup-vs-build.md`, `compare/` | Each court.html and court-profile.html screen beside the build's, both themes where the build has one, and every difference |
| `screens/` | The 64 build screenshots the inventories came from |

## Numbers before

| | |
|---|---|
| Text elements | 3220 (and 215 screen-reader-only, not counted) |
| Families | 4: Commissioner Variable, Cascadia Mono, Bodoni Moda Variable, Alegreya Sans |
| Sizes | 17: 10.5, 11, 11.5, 12, 12.5, 13, 13.5, 14, 15, 16, 17, 19, 20, 22, 24, 26, 40 px |
| Weights | 6: 400, 500, 550, 600, 650, 700 |
| Family, size and weight combinations | 54 |
| Line heights / letter spacings / text colours | 37 / 10 / 27 |
| Clickable looks | 159 in 17 kinds; 87 with a shadow, gradient, clip-path or border |
| Button corner radii | 11: 0, 4, 5, 6, 7, 8, 10, 11, 13, 15 px and 50 % |
| Button heights | 37 different heights, 16 to 172 px |
| The notch (clip-path) | on 9 looks only: the primary and danger buttons; nothing else has it |

## What stands out

- Every job is set several ways. "Person or row name" alone uses 14 styles (14 px at 400, 500, 550, 600, 650 and 700, plus 12, 12.5 and 13 px); "group label" uses 10; "secondary line" 7. The worst offenders are the 550 and 650 weights, which exist only because Commissioner is variable.
- Two type systems are mixed: the Hall's Commissioner almost everywhere, and court's Bodoni and Alegreya in the three pieces built last round (banner, play grid, profile theme).
- Navigation rows have 38 looks: rail tiles, channels, DM rows, settings index rows and member rows were each styled on their own, with their own radius (5, 6, 7, 10, 15 px, 50 %) and selection mark.
- The notch is on primary and danger buttons and nowhere else, so it reads as decoration, not a shape language.
- The gold glow is in the surfaces, not the buttons: a pool of warm light rises from the bottom of the main column (hall.css `radial-gradient(… var(--pool) …)`, Lamplight's `--glow` underneath in style.css), and `--accent-glow` shadows are still defined. The primary button itself is a flat gold fill with no shadow; the focus ring is a gold ring with a dark gap on everything.

## Not covered

- Screens the smoke run never reaches: an error state from a failed action, the update banner, a crash dialog, the "can't connect yet" states, the stream picker's Applications tab, and tooltips other than the play grid's. They are missing from the inventories too.
- Pressed and hover states are forced pseudo-classes: styles that come from JavaScript on pointer events (dragging, the banner tilt) are not pictured.
- Only Ann's window was walked in Ivory, and only at the end of the run.
- The build screenshots are from the smoke run's hidden windows at 1280 by 800 and 100 % scaling.
