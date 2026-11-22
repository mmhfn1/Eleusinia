# Type plan

Status: **waiting for sign-off** for the app-wide sweep. The fonts and the tokens the court-profile pieces use (banner, play grid, profile theme) are in; nothing else is restyled until this is approved.

`design/mockups/court.html` is the reference, and `court-profile.html` uses the same type. This plan names every role the app's text plays and gives each one exact values. The values become tokens in `style.css`. After that, no `font-size` or `font-family` appears anywhere else: not in `hall.css`, `server-settings.css`, `pip.css`, `splash.css`, or inline styles.

## Typefaces

| Role | Family | Files bundled | Licence |
|---|---|---|---|
| Display | **Bodoni Moda** (variable: optical size 6–96, weight 400–800, plus italic) | `@fontsource-variable/bodoni-moda`, Latin and Latin Extended subsets, roman and italic woff2 | SIL OFL 1.1 |
| Text | **Alegreya Sans**: 400, 500, 700, 800 and 400 italic | `@fontsource/alegreya-sans`, Latin, Latin Extended, Cyrillic, Greek and Vietnamese subsets | SIL OFL 1.1 |
| Mono | **IBM Plex Mono** 500 *(proposed: court has no mono)* | `@fontsource/ibm-plex-mono`, Latin subset | SIL OFL 1.1 |

- Bodoni Moda replaces Commissioner, which becomes unused and is removed. Plex Mono replaces Cascadia Mono, which is a Windows system font and isn't bundled at all today.
- Plex Mono goes with Alegreya Sans because both are humanist: its open forms and moderate contrast sit next to Alegreya without looking technical. JetBrains Mono was the other candidate; it reads colder next to the serif.
- Each package's `LICENSE` ships inside it. The build also copies the three OFL texts into `resources/licenses/fonts/`, and Settings → Help and feedback lists them.
- The fonts are bundled through `@fontsource`, which Vite packs as local woff2 files. There are no requests to Google: only `court.html` uses Google Fonts, as a static mockup.

### Fallbacks for scripts the fonts don't cover

```
--f-display: 'Bodoni Moda Variable', 'Bodoni Moda', Georgia, 'Noto Serif', 'Yu Mincho', 'SimSun', serif;
--f-text:    'Alegreya Sans', 'Segoe UI', 'Noto Sans', 'Yu Gothic UI', 'Microsoft YaHei UI', 'Malgun Gothic', system-ui, sans-serif;
--f-mono:    'IBM Plex Mono', 'Cascadia Mono', Consolas, ui-monospace, monospace;
```

- Bodoni Moda covers Latin only. A name in Cyrillic, Greek, CJK, Arabic or Hebrew falls back per glyph: to Georgia or Noto Serif in titles, and to the system sans in text.
- Names typed by people mix scripts, so where a name is the title, its fallback is the text family rather than a serif. A Bodoni Latin name next to a Yu Gothic Japanese one looks broken; a sans fallback looks deliberate. This is done with `unicode-range`-free stacks, not script detection.
- Emoji use the system emoji font, appended to every stack: `'Segoe UI Emoji', 'Apple Color Emoji', 'Noto Color Emoji'`.

## Rules for the whole app

- **Sentence case everywhere.** No all-caps labels. Quiet labels such as group headings ("Text channels", "Online") are *italic Bodoni* instead, as in court.
- **Italic is only for:**
  - those quiet labels;
  - statuses;
  - empty states;
  - captions such as "Sealed for Mira alone".

  Italic is never used for emphasis inside messages, except where a person typed it.
- **Bodoni only at 14 px or larger.** Its hairlines break up below that, at 100 % Windows scaling. Anything smaller uses Alegreya Sans.
- **Numbers** that change or line up (times, counts, scores, hours, ping, sizes) use `font-variant-numeric: tabular-nums` in Alegreya. Big scores are Bodoni with lining figures.
- Letter spacing stays 0, except:
  - display sizes of 26 px and up: −0.01 em;
  - buttons and badges: +0.01 em.
- **Px, like the rest of the app.** The root is 14 px, so rem would read wrong; Windows scaling and Chromium zoom multiply px evenly. 125 % and 150 % are checked with screenshots: the type plan alone doesn't prove it.
- Token names are `--type-*`, since `--t-*` already holds the animation timings.

## The scale

Sizes follow court's steps, kept to a short ladder: 11, 12.5, 13, 13.5, 14, 15, 15.5, 17, 20, 22, 26, 30, 44, 52.

| Token | Role | Family | Size / line height | Weight | Spacing | Case, style | Where |
|---|---|---|---|---|---|---|---|
| `--type-hero` | Display, largest | Bodoni | 52 / 1.0 | 600 | −0.01 em | | Splash wordmark |
| `--type-display` | Display | Bodoni | 44 / 1.0 | 500 | −0.01 em | | Setup's first screen, big empty states ("No friends yet") |
| `--type-title-xl` | Title, full card | Bodoni | 30 / 1.1 | 600 | −0.01 em | | Name on the full profile card, the call's stage title |
| `--type-title-l` | Title, view | Bodoni | 26 / 1.1 | 600 | −0.01 em | | A view's head: Friends, `#plans`, a DM's name, Settings section pages |
| `--type-title` | Title | Bodoni | 22 / 1.15 | 600 | 0 | | Server name on the banner, side column heads, dialog titles, the small card's name (24 → 22 to keep one ladder) |
| `--type-section` | Section | Bodoni | 20 / 1.2 | 500 | 0 | | Settings sections, Server settings pages, "Playing now", "Live calls" |
| `--type-label` | Quiet label | Bodoni | 15 / 1.3 | 400 | 0 | italic | Channel and member group labels, "Two weeks of play", field labels in Settings, the day divider in chat |
| `--type-name` | Name in a list | Alegreya | 15.5 / 1.3 | 500 (700 while unread) | 0 | | Channel rows, DM rows, friends, members |
| `--type-author` | Message author | Alegreya | 15.5 / 1.3 | 700 | 0 | | The name above a message, the user bar's name |
| `--type-body` | Body | Alegreya | 15.5 / 1.45 | 400 | 0 | | Messages, about lines, dialog text, inputs and the composer |
| `--type-status` | Status | Alegreya | 15 / 1.35 | 400 | 0 | italic | A person's status line, `pop-status` |
| `--type-ui` | Interface text | Alegreya | 14.5 / 1.35 | 500 | 0 | | Tabs, menu items, segmented controls, settings rows, tooltips' first line |
| `--type-meta` | Secondary | Alegreya | 13.5 / 1.35 | 400 | 0 | | The line under a name (In voice, a game), hints, file sizes, link previews' description |
| `--type-time` | Timestamps | Alegreya | 13 / 1.3 | 400 | 0 | tabular | Message times, "2 hours ago", call durations |
| `--type-small` | Smallest text | Alegreya | 12.5 / 1.3 | 400 | 0 | | Grid keys ("Less … 4 h+"), cut-off notices, the window's title bar text |
| `--type-button` | Buttons | Alegreya | 14 / 1 | 700 | +0.01 em | | Every `.btn`; 13 px in compact buttons on art cards |
| `--type-badge` | Counts | Alegreya | 11 / 1 | 700 | +0.01 em | tabular | Unread counts, "Live", the seal's number |
| `--type-score` | Big numbers | Bodoni | 24 / 1 | 600 | 0 | lining | Match scores (7–4), the timer on a game card |
| `--type-stat` | Small numbers | Alegreya | 13 / 1.3 | 500 | 0 | tabular | Ping, kbps, hours in the play grid's tooltip, the "23.6 h" total |
| `--type-mono` | Keys and IDs | Plex Mono | 12.5 / 1.4 | 500 | 0 | | Friend IDs (`mira#2210`), key fingerprints, hex colour fields, the hotkey being recorded |
| `--type-code` | Code in messages | Plex Mono | 14 / 1.45 | 500 | 0 | | Inline `code` and code blocks in chat |

### Family weights in use

- Bodoni 400 italic, 500 and 600.
- Alegreya 400, 400 italic, 500, 700, and 800, which is used only for the setup's step numbers. If those go, 800 is dropped from the bundle.
- Plex Mono 500.

The bundle includes only these weights.

## How it lands in code

1. `src/renderer/fonts.css` imports the three `@fontsource` files with `font-display: swap`. Bodoni loads only its Latin subsets.
2. `style.css` `:root` defines `--f-display`, `--f-text` and `--f-mono`, plus one `--type-*` per role above. Each is a full `font` shorthand, e.g. `--type-label: italic 400 15px/1.3 var(--f-display)`, so a rule writes `font: var(--type-label)`. Rules that need tabular figures or spacing add them next to that line.
3. Every `font`, `font-size` and `font-family` in the CSS files and every inline `fontSize` style is moved to a token. This check must print nothing:

   ```
   rg -n "font-size|font-family|font:\s*(?!var\()|fontSize" src/renderer --pcre2
   ```

   The only exception is `fonts.css`.
4. `hall.css` already resets the old tokens. Its few `font` lines move to the tokens too, and the Commissioner import goes.

## Open questions for you

1. Plex Mono as the mono, since court has none. The alternative is JetBrains Mono.
2. Installing the three `@fontsource` packages downloads about 6 MB from npm into `node_modules`, which ships about 700 KB of woff2 in the app. That's a download and new dependencies, so I need your yes.
3. The small card's name drops from 24 to 22 px (`--type-title`) to keep one ladder. If you want the small card's name larger, it becomes 26 px (`--type-title-l`) instead.
