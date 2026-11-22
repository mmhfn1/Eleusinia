# Mockup against build

Every screen `design/mockups/court.html` and `court-profile.html` draw, each mockup frame beside the build's screenshot at the same width (`compare/*.png`, made from `mockup/*.png` and `screens/*.png`). The build screenshots come from the audit's smoke run (`ELEUSINIA_SMOKE_AUDIT`), so they show test people (Ann, Bob, Cy) and test content, not the mockup's.

The short version: court.html was a pivot that was never built. The build is the Hall (Commissioner, rounded panels, gold-washed primary buttons with a notch) with three court pieces added: the server banner, the two weeks of play and the profile theme. So nearly everything below is "not built", and the three court-profile pieces are the only close matches.

## court.html A: Home (`compare/a-home-ink.png`, `a-home-ivory.png`)

| | Mockup | Build |
|---|---|---|
| Type | Bodoni titles ("Friends", "At play", card lines), Alegreya text, italic Bodoni group labels ("Letters", "Groups") | Commissioner everywhere; group labels are small bold sans |
| Left column head | Ann's weave as a 116 px banner with her name in Bodoni | A plain "Home" title, no banner |
| Left column lists | "Letters" (DMs with crests and presence marks), "Groups" | Friends row, "Direct messages", the friend ID card at the foot |
| People | Key-drawn crests in a ring (mon), presence as a dot, a gold diamond for at play, a ring for in a call | Round pictures (or the key-drawn arch picture), a dot for presence |
| Rail | Columns on shafts with a gold top edge, a lit seam beside the selected one | Rounded tiles, a gold bar beside the selected one |
| Main | "At play" portals (art inside a stepped reveal, Write/Join), "In session" hemicycle cards with Take a seat, "Here" | "Playing now" art cards, Online and Offline lists, a search field at the top |
| Buttons | Knife-edge corner cut on every button, ink, gold, plaster and danger fills | The same notch on primary and danger only; the rest are rounded rectangles |
| Background | Tie-hole dot grid | Plain, with a soft radial wash |
| Title bar | "Eleusinia" wordmark and the place | Back and forward arrows and the place |

## court.html B: a conversation and its keep (`b-conversation-ink.png`; no build Ivory shot of a DM)

| | Mockup | Build (a group chat) |
|---|---|---|
| Right column | "The keep": the encryption drawn as three walled rings, with facts beside it | Members list (Online, Offline); a DM shows the person panel instead |
| Message rows | Crests, Bodoni day divider in italic ("Wednesday the nineteenth"), a seal stamp on hover | Round pictures, a sans "Today" rule, a seal on hover |
| Composer | Flat bar, "Sealed for Mira alone" in italic Bodoni, an indigo line under it when focused | Rounded field with attach and GIF buttons and a send button |
| Header | Crest, name in Bodoni, a Call button | Group emblem, name, member count, Remove member select, leave icon |
| Left column | The person's weave as a banner | The group's emblem and name centred, Start call, then the DM list |

## court.html C: a call as a hemicycle (`c-call-ink.png`)

| | Mockup | Build |
|---|---|---|
| Layout | People as tall pillars on an arc around an empty stage, the speaker lit by a slit of light | A screen share on the stage with the people row under it (the call view without a share is a grid of tall banners) |
| Bottom | A dais bar: signal, mic, deafen, Camera, Show your screen, Leave | The voice bar in the left column; controls sit on the stage |
| Title | "Lounge", "five seated" in Bodoni | The person's name and status |

## court.html D: the pieces (`d-pieces-ink.png`, `d-pieces-ivory.png`; build: Settings, My profile)

| | Mockup | Build |
|---|---|---|
| Crest and weave | Crest (mon) and a woven strip from the key | Key-drawn arch picture and the four weaves (Arcade, Skyline, Bands, Lattice) |
| Buttons | Four fills with the knife edge (Add a friend ink, Take a seat gold, Not now plaster, Leave the server danger) | Gold notched primary ("Save", "Set status"), rounded secondary ("Edit profile"), quiet text buttons |
| Type specimen | Bodoni 52 display, Bodoni italic 26, Alegreya 17 text, Alegreya 13.5 meta | Commissioner 22 title, 12.5 bold labels, 14 text |
| Palette | 8 tokens: ground, paper, stone, ink, gold, indigo, moss, vermilion | 27 text colours in use (text-before.md); the Hall's obsidian and silver tokens |

## court-profile.html 1: the server banner (`cp1-banner-ink.png`, `cp1-banner-ivory.png`)

Close. Differences:
- The build's server picture sits on the banner beside the name; the mockup has no picture there.
- In the Ivory build the server picture is a plain white square (the test server's GIF picture's still, drawn white on ivory). That is a bug to look at, not a design choice.
- The mockup's channel rows are Alegreya and its labels italic Bodoni ("Text channels"); the build's channels have no group label and use Commissioner.
- The mockup puts a member count after "Text channels"; the build has none.

## court-profile.html 2: two weeks of play and the profile cards (`cp2-profiles-ink.png`, `cp2-full-ink.png`, `cp2-profiles-ivory.png`)

Close in the grid; the cards around it are the Hall's.
- Names: Bodoni 24 and 30 in the mockup; Commissioner 19 and 26 in the build.
- Status: italic Alegreya in the mockup; the build's small card shows no status line for Ann (she has none set).
- Handle: mono in the mockup; Commissioner 12.5 in the build's small card, mono only on the full card's ID plate.
- The full card's order differs: the build puts presence, about, the game card and the ID plate in one column; the mockup has tabs (About, Activity, In common), an About list and Recently played (not built: waiting for your yes).
- The Ivory full card's banner is a red-to-white gradient band, which reads as a bug against the mockup's woven banner.

## court-profile.html 3: Profile theme (`cp3-theme-ink.png`, `cp3-theme-ivory.png`)

Same controls in the same order. Differences:
- The mockup's controls are court-styled (sharp segmented control, gold slider, knife-edge Save theme); the build's are the Hall's rounded ones.
- The build's weave tiles are narrower than the mockup's (74 px fixed width from the Hall's banner picker against a 5-column grid).
- The build's preview is the existing What others see card beside all of Settings, rather than a card beside the section.

## What the comparison does not cover

- Screens neither mockup draws: splash, setup, Settings sections other than Profile theme, server settings, menus, the GIF picker, toasts, the floating player, errors and the update banner. They are in `screens/` and in the inventories, but have no mockup to compare with.
- Ivory build shots of a DM conversation and of a call: the smoke run switches to Ivory only for its last few stops.
