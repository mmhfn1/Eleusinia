# Eleusinia design system (proposed, phase 1)

**This folder is the single reference** for the UI rebuild. It replaces `design/mockups/court.html` and `court-profile.html`. Nothing is built from it until approved.

| File | What |
|---|---|
| `tokens.css` | The token file: type, colour, space, size, radius, shadow, motion; Ink and Ivory; Leaf gold. Moves into `src/renderer/` unchanged once approved |
| `ui.css` | The components: buttons and every clickable variant, rows, fields, menus, tooltips, pictures |
| `screens.css`, `draw.js`, `screens.js` | Every screen of the app, built only from the two files above. Pictures and weaves are drawn exactly as `src/shared/mark.ts` draws them |
| `screen.html?s=<id>&t=ink\|ivory` | One screen. `index.html` lists them all |
| `effects.js` | The profile theme's six effects and their stylesheet, as the build ships it |
| `capture.cjs` | `npx electron design/system/capture.cjs` photographs every screen into `shots/` |
| `contrast.mjs` | `node design/system/contrast.mjs` measures every text token on every surface, in both themes |
| `shots/`, `sheets/` | The pictures, four screens to a sheet |

## Type

One display face, one text face, one mono.

| Face | For | Why |
|---|---|---|
| **Bodoni Moda** (500, 600) | Titles, section headings, names on cards, the wordmark | Kept from court: the display face gives the app its character. It only appears from 20 px, where its hairlines hold; no italics (the first review found 15 px italic labels shimmering) |
| **Alegreya Sans** (400, 500, 700) | Everything you read and press | Kept: a humanist sans that sits with Bodoni without fighting it, and covers Latin, Cyrillic, Greek and Vietnamese |
| **Cascadia Mono** (500) | Friend IDs, keys, codes | The friend ID has always been Cascadia Mono; now it is bundled (`@fontsource/cascadia-mono`) instead of borrowed from Windows, and it is the only mono, for every mono role |

**Seven sizes:** 11, 12.5, 13.5, 15, 20, 26 and 44 px. **Weights:** 2 for Bodoni, 3 for Alegreya and 1 for Cascadia Mono, with nothing in between (no 550 or 650). Measured on the mockups (`npx electron design/system/type-audit.cjs`): 6130 text elements on 51 screens in both themes, 3 families, 7 sizes, 12 combinations, every one a role.

### Every job from `design/audit/type-roles.md` maps to one role token

| Job | Role token | Face, size / line height, weight | Case and style |
|---|---|---|---|
| wordmark | `--type-wordmark` | Bodoni 44 / 1, 600 | −0.01 em |
| screen title | `--type-title` | Bodoni 26 / 1.1, 600 | −0.01 em |
| person name, large (cards) | `--type-title` | Bodoni 26 / 1.1, 600 | |
| big number (score, light level) | `--type-number` | Alegreya 26 / 1, 700 | tabular figures (Bodoni's hairline dash broke up) |
| section heading | `--type-section` | Bodoni 20 / 1.2, 500 | |
| empty-state title | `--type-section` | Bodoni 20 / 1.2, 500 | |
| server name on its banner | `--type-section` | Bodoni 20 / 1.2, 500 | at most two lines (was 22 px: 22 would be an eighth size used once) |
| group label (lists, fields, table columns, menu heads, the day rule) | `--type-label` | Alegreya 13.5 / 1.3, 500 | `--ink-2`, sentence case, never capitals |
| body text | `--type-body` | Alegreya 15 / 1.45, 400 | messages, about lines, toasts |
| input text and placeholders | `--type-body` | Alegreya 15 / 1.45, 400 | |
| link | `--type-body` | Alegreya 15 / 1.45, 400 | underlined, `--voice` |
| menu and navigation item | `--type-name` | Alegreya 15 / 1.3, 500 | menus, the Settings index, rows |
| person or row name (lists) | `--type-name` | Alegreya 15 / 1.3, 500 | unread is shown by colour and the count, never by weight |
| button label | `--type-button` | Alegreya 13.5 / 1, 700 | +0.01 em |
| secondary line | `--type-meta` | Alegreya 13.5 / 1.35, 400 | |
| hint, help, empty-state text | `--type-meta` | Alegreya 13.5 / 1.35, 400 | `--ink-3`; a status line too, in `--ink-2` |
| tooltip and popover | `--type-meta` | Alegreya 13.5 / 1.35, 400 | its first line in `--ink` |
| timestamp and delivery state | `--type-time` | Alegreya 12.5 / 1.3, 400 | tabular |
| badge count | `--type-badge` | Alegreya 11 / 1, 700 | tabular |
| code, keys and IDs | `--type-mono` | Cascadia Mono 12.5 / 1.4, 500 | |

The specimen, made of real app content: `screen.html?s=specimen` (`shots/specimen-*.png`).

## Buttons and everything else you can press

**One shape language.** The notch is **gone everywhere**: today it is on primary and danger buttons only, so it reads as decoration rather than a rule, and putting it on rows, chips and tabs would make the app louder for no gain.

| Scale | Values |
|---|---|
| Radii | `--r-1` 4 px (controls), `--r-2` 8 px (cards, menus, dialogs, tiles), `--r-round` (pictures, switches, counts, chips) |
| Heights | `--h-sm` 28, `--h-md` 36, `--h-lg` 44 |

| Variant | Class | Looks like |
|---|---|---|
| primary | `.btn--primary` | `--gold-fill` with `--on-gold` text; **one per surface** (a screen, a dialog, a toast), everything else secondary |
| secondary | `.btn` | `--raised` with a line |
| quiet | `.btn--quiet` | text until pointed at |
| destructive | `.btn--danger` | `--danger-fill`, white text |
| icon | `.icon-btn` (`--sm`, `--lg`, `--danger` tinted, `--on-art` over pictures and streams) | square, quiet; `aria-pressed` turns it red (muted, deafened) |
| toggle | `.switch` (role switch), `.check` (role checkbox) | on is the gold fill |
| segmented | `.seg` (`--sm` without its frame, for tables: Server settings' deny / take it from the role / allow) | the chosen one is lit by a 2 px gold line, not a fill |
| choice tile | `.tile-choice` | a picture you pick; chosen has a 2 px gold edge |
| select | `.select` | a field with a chevron |
| tab | `.tab` | the chosen one is underlined in gold |
| menu item | `.menu-item` (`--danger`) | full-width, 36 px |
| navigation row | `.row` (`--two` for two lines; also the game glance on a card and the Steam and Bungie.net tiles) | chosen: `--raised` and a 2 px gold mark at its left |
| chip | `.chip` (`--online`) | round-ended, 28 px |
| link | `.link` | `--voice`, underlined |

**States** on every variant:

| State | How it looks |
|---|---|
| Hover | One step stronger: away from the background (lighter on Ink, darker on Ivory) |
| Pressed | One step further |
| Focus-visible | A 2 px `--voice` ring with 2 px of space |
| Disabled | `--raised` with `--ink-3` text, so a disabled primary never reads as a faded gold one |
| Loading | The label hidden behind a spinner, `aria-busy`, still under reduced motion |
| Selected | Explained per variant in the table above |

They're shown in context on Settings, My profile (`s=buttons`), and on every screen below.

**Shadows** belong only to things that float (menus, popovers, dialogs, toasts): one token, `--shadow-float`. Nothing you press has a shadow, a gradient, a clip-path or a border of its own beyond the one line of secondary buttons, fields and chips.

Measured on the mockups (`npx electron design/system/click-audit.cjs`): 4 radii (4 px, 8 px, round, and none on text links) and the three heights, 28, 36 and 44 px. The only things outside the heights are text links, which have no box, and the 58 px picture tiles (weaves and themes), which take their picture's size. The only shadow is on the floating notices.

**Colour has one meaning each.** Gold is what is chosen or speaking. Red is errors, muted, LIVE and destroying things; unread counts are ink, not red. Green is online and allow. Blue is voice, links and focus. Meters are ink.

## Fonts and their licences

Every font is bundled from `@fontsource`, nothing comes from the web and nothing from the system: `@fontsource-variable/bodoni-moda`, `@fontsource/alegreya-sans` and `@fontsource/cascadia-mono`, all under the SIL Open Font License 1.1. The build copies each package's `LICENSE` into `resources/licenses/fonts/`. The mockups load the same files from `node_modules`.

## The logo

The logo stays the koi in its ring, unchanged: `build/icon.png` for the window, taskbar and installer, and `src/renderer/assets/emblem.png` in the app, shaded by the colour it stands in (gold on the rail and the splash, ink elsewhere), as the app shades it today. A minimalist version was tried and dropped: the original is minimalist enough.

## Gold without the glow

These are gone, in all three directions:
- the warm light pool (`radial-gradient(... var(--pool) ...)`);
- Lamplight's `--glow`;
- every `--accent-glow` shadow;
- the glowing border on a speaker's card.

The one light left is a **2 px line**, `--lit`: a speaker's card edge and the seam that runs down from its top as long as their voice is loud. The seam has a 1 px `--surface` keyline so it reads on any banner art. It never blurs.

Gold is **Leaf**: a flat metallic gold, a fill only on a surface's one primary action, and otherwise a line, a mark or text for what is chosen or speaking.

`--lit` is its own colour (brighter in Ink, a darker amber in Ivory), so speaking never reads as chosen.


## Contrast, measured

`node design/system/contrast.mjs` checks every text token on every surface in both themes. The lowest is 5.00:1 in Ink and 4.78:1 in Ivory (hint text on a raised row). Every pair meets AA.

Names and labels on the call's user cards sit on `--surface` below the banner, never on the art. Text on art (game cards, the server banner, the stream's caption) sits on `--scrim-art`.

## Every screen

The audit's 64 build screens (`design/audit/screens/`), and the mockup that covers each:

| Mockup (`s=`) | Covers |
|---|---|
| `splash`, `setup`, `setup-error` | splash, setup, and a form error |
| `home`, `home-empty`, `home-requests` | home, home-cs2, home-ivory, rail, friends, empty states, search results and requests, "can't connect yet" |
| `dm`, `dm-pending`, `group`, `errors`, `rich-chat` | conversation, a DM's person panel, pending and failed messages, an error banner, invite cards, link previews, file cards, pictures |
| `server`, `server-long` | server, server-banner, server-banner-column, server-banner-long, server-unread, server-ivory, the smallest window |
| `call-quiet`, `call-talking`, `call-share`, `call-share-folded`, `call-cameras`, `pip` | server-voice, bars-call, people-row, the stage, pip |
| `card-small`, `card-small-empty`, `card-full`, `card-full-recent` | profile-panel, profile-panel-call, play-grid-mini, play-grid-full, card-* and theme-owner, the grid's empty states |
| `settings-profile` … `settings-account`, `settings-theme` | every settings-*-ink and -ivory, settings-theme, settings-activity, settings-cs2-live, settings-dota, settings-bungie |
| `server-settings-overview` … `-audit-log` | server-settings, -roles, -channels and every other page |
| `menu-channel`, `menu-person`, `menu-add`, `tooltips`, `toasts`, `gif-picker`, `poke-picker`, `update-banner`, `crash` | menu-channel, menu-person, rail-add-menu, tooltips, activity-notice, poke-toast, the still-connecting toast, gif-picker, poke-picker, invite-card, link-preview, the update banner, the crash dialog |
| `specimen`, `buttons` | the type specimen, and every button in every state |

## The profile theme's effects

Six effects (`effects.js`), each with one set of fixed keyframes per depth step, moving by transform and opacity only, stepped about four times a second, a layer of its own only while moving, and still under reduced motion, in a hidden window and off screen:

| Effect | Motion | Cycle at 1× |
|---|---|---|
| Drift | the weave slides slowly corner to corner and back | 24 s |
| Breathe | it fades and swells | 6 s |
| Orbit | it circles slowly round | 16 s |
| Tide | it sways from side to side | 8 s |
| Shimmer | a soft band of the weave's tone passes across | 5 s |
| Parallax | two layers of it move against each other | 24 s |

**Why they are now visible.** The weave behind a card moves only away from the text's luminance: darker than the card in Ink (light text), lighter in Ivory (dark text), in the weave's own hues. Every pixel behind text then has at least the plain card's contrast, so the pattern can be strong (default strength 45 %, depth 60 %) without a scrim dimming it. In Phase 2 the AA test in `mark.test.ts` measures this weave, and `themeScrim` keeps guarding any pixel that would move toward the text. An effect an older copy doesn't know is shown still. See `shots/effects-ink.png` and `effects-ivory.png`: each effect at 0, 25, 50 and 75 % of its cycle.

## Kept as features, restyled

| Feature | What changes |
|---|---|
| The call | Tall user cards side by side above the chat; under a share, the stage and the people row (foldable). The speaker's glow becomes the 2 px `--lit` edge and seam |
| The column server banner | 172 px, fading into the column. Its scrim now stops before the fade, so Ivory has no grey band. The name is now 20 px (`--type-section`), and the menu is its own icon button, so the banner isn't one tall button |
| Two weeks of play | No foot row |
| The profile theme | Its controls now use the system's switches, segments and sliders, and it has six effects you can see (below) |

## The first review (a fresh-context reviewer, no stake in the design)

Its ten main findings, and what changed:

1. **Gold everywhere.** Now one gold primary per surface. Game status and notices use ink, and the speaker is the gold that moves.
2. **Italic Bodoni labels shimmered at 15 px, and were used on fields, table heads and sentences.** Labels are now Alegreya 13.5/500 and Bodoni starts at 20 px.
3. **The speaker's light was weak.** `--lit` is now its own colour, the seam has a keyline, and lit tiles take a 2 px edge.
4. **The banner's fade turned grey in Ivory.** The scrim now stops before the fade, and the default weave is a pattern, not a chart.
5. **The profile surfaces disagreed.** One order everywhere: name, handle, status, grid, about, presence. The version is gone, the theme is weaker, and the status is no longer italic.
6. **The stage was boxed twice.** The video is now the stage, the people row aligns with it, and Leave stream is a real button.
7. **Colours carried several meanings.** Now one meaning each (see Buttons).
8. **Stock callouts and empty states.** Error rows are plain surfaces, link cards plain cards, and empty states words with one action.
9. **Settings dialogs.** One shell for Settings and Server settings, with the title and close in their own header. Destroying things sits in a separate danger zone.
10. **Broken renders.** The tall connection tiles, white-on-white tile labels, the score's dash, the banner preview, the update bar covering the title, the clipped title bar, and Send shown loading by default are all fixed.

Its smaller notes were taken too: it found every control outside the 28/36/44 heights, the 2 px segment radius, the inset-shadow edges, the gradient tile, one-off buttons on art, the hairline after every section heading, the pinstripes on game art and the dashed borders.

## The second review (the same reviewer, on the revised mockups)

It found most of the ten fixed, two new layout breaks and some leftovers. All were fixed:

| Found | Changed |
|---|---|
| The update bar hid the main header | It now sits in the main column's flow and pushes the header down |
| The Settings pane was clipped by the new header | Long panes scroll, with a thin scrollbar and room at the foot |
| The permission table read like loose glyphs | Each three-way choice is framed, and the chosen one is underlined across its cell |
| "Its messages go for everyone" | "Its messages are deleted for everyone" |
| The banner's menu was a heavy dark square | No fill until pointed at; a stronger scrim behind the name |
| The full card showed the friend ID twice | The plate keeps only the unique key |
| The dialog title and the pane title were both 26 px | Pane titles are 20 px (`--type-section`) |
| The theme left smudges | Its strength in the mockups is down to 10 % |
| The day tooltip covered the status | It opens below the cells |
| The people row stopped short of the stage | It runs the stage's full width |

It left as acceptable: two saves on My profile (Save and Set status do different things), and green for "Voice connected" and online.

## Round three (your changes after sign-off)

| Change | Where |
|---|---|
| Leaf only; Brass and Line removed | `tokens.css`, this README |
| The real logo (the koi) back in every mockup, shaded as in the app | `ui.css` `.logo`, every screen with the logo |
| Six theme effects, visible, contrast-safe | `effects.js`, `s=effects`, `s=settings-theme` |
| Every font bundled; the mono is Cascadia Mono | `screen.html`, `tokens.css` |
| Run as administrator moved from Hotkeys to My profile | `s=settings-profile`, `s=settings-hotkeys` |
| "Your friend ID" is now "Friend ID" | Home's friend ID card |

## Waiting on you

- **Recently played** on the full card (`s=card-full-recent`, framed as a decision): yes or no.
- **The theme's effects** (`shots/effects-*.png`).
