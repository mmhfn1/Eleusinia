# Clickable inventory (after)

From `buttons-after.json`: 2467 clickable things seen on screen (buttons, links, menu items, tabs, switches, sliders, rows), with 126 distinct looks (tag or role, font, colours, border, radius, shadow, clip-path, height, padding). One of each look is pictured at rest, hover, pressed and focus (forced through DevTools, nothing clicked): [buttons-after.html](buttons-after.html).

| Kind | Distinct looks | Seen |
|---|---|---|
| navigation row (rail, channels, lists, settings index) | 29 | 757 |
| segmented control and choice cards | 23 | 70 |
| icon button | 14 | 598 |
| person or card (opens a profile) | 13 | 364 |
| slider | 6 | 27 |
| title bar control | 5 | 315 |
| quiet button | 5 | 22 |
| select (dropdown) | 5 | 22 |
| toggle (switch, checkbox) | 5 | 89 |
| primary button | 4 | 67 |
| destructive button | 4 | 33 |
| secondary button | 3 | 64 |
| menu item | 3 | 15 |
| chip and notice | 2 | 13 |
| picture or preview (opens it) | 2 | 6 |
| link | 2 | 4 |
| inline edit (rename in place) | 1 | 1 |

Looks with a shadow, gradient, clip-path or border: 42 of 126.

## navigation row (rail, channels, lists, settings index)

| Seen | Example | Font | Colour on background | Radius | Height | Extras | States |
|---|---|---|---|---|---|---|---|
| 150 | My profile `div.settings-index-group > button.settings-index-row`; Activity `div.settings-index-group > button.settings-index-row` | Libre Franklin 15px 500 | rgb(183, 174, 156) on rgba(0, 0, 0, 0) | 4px | 36 |  | [rest](buttons/013-rest.png) [hover](buttons/013-hover.png) [pressed](buttons/013-pressed.png) [focus](buttons/013-focus.png) |
| 72 | Activity `div.settings-index-group > button.settings-index-row`; Privacy and safety `div.settings-index-group > button.settings-index-row` | Libre Franklin 15px 500 | rgb(76, 69, 60) on rgba(0, 0, 0, 0) | 4px | 36 |  | [rest](buttons/108-rest.png) [hover](buttons/108-hover.png) [pressed](buttons/108-pressed.png) [focus](buttons/108-focus.png) |
| 63 | 1 `div.rail-groups > button.rail-item.rail-group`; Second `div.rail-groups > button.rail-item.rail-group` | Libre Franklin 15px 400 | rgb(183, 174, 156) on rgb(21, 26, 36) | 8px | 44 |  | [rest](buttons/066-rest.png) [hover](buttons/066-hover.png) [pressed](buttons/066-pressed.png) [focus](buttons/066-focus.png) |
| 56 | CyOnline `section.dms > button.side-row.dm-row`; BobOnline `section.dms > button.side-row.dm-row` | Libre Franklin 15px 400 | rgb(76, 69, 60) on rgba(0, 0, 0, 0) | 4px | 44 |  | [rest](buttons/106-rest.png) [hover](buttons/106-hover.png) [pressed](buttons/106-pressed.png) [focus](buttons/106-focus.png) |
| 55 | Home: friends and direct messages `nav.rail > button.rail-mark` | Libre Franklin 15px 400 | rgb(236, 227, 209) on rgba(0, 0, 0, 0) | 8px | 44 |  | [rest](buttons/006-rest.png) [hover](buttons/006-hover.png) [pressed](buttons/006-pressed.png) [focus](buttons/006-focus.png) |
| 54 | Create or join `div.rail-foot > button.rail-item.rail-add` | Libre Franklin 15px 400 | rgb(150, 144, 128) on rgba(0, 0, 0, 0) | 8px | 44 |  | [rest](buttons/007-rest.png) [hover](buttons/007-hover.png) [pressed](buttons/007-pressed.png) [focus](buttons/007-focus.png) |
| 46 | AnnPlaying Counter-Strike 2 · 1 min `div.friend-row > button.row-button`; BobPlaying Destiny 2 · 1 min `div.friend-row > button.row-button` | Libre Franklin 15px 400 | rgb(183, 174, 156) on rgba(0, 0, 0, 0) | 4px | 44 |  | [rest](buttons/032-rest.png) [hover](buttons/032-hover.png) [pressed](buttons/032-pressed.png) [focus](buttons/032-focus.png) |
| 46 | general `div.channel-row > button.channel`; Lounge `div.channel-row > button.channel` | Libre Franklin 15px 500 | rgb(183, 174, 156) on rgba(0, 0, 0, 0) | 4px | 36 |  | [rest](buttons/072-rest.png) [hover](buttons/072-hover.png) [pressed](buttons/072-pressed.png) [focus](buttons/072-focus.png) |
| 30 | Friends `nav.side-list > button.side-row`; AnnOnline `section.dms > button.side-row.dm-row` | Libre Franklin 15px 400 | rgb(236, 227, 209) on rgb(28, 34, 48) | 4px | 44 |  | [rest](buttons/008-rest.png) [hover](buttons/008-hover.png) [pressed](buttons/008-pressed.png) [focus](buttons/008-focus.png) |
| 30 | Smoke Server `div.rail-groups > button.rail-item.rail-group.rail-server`; The Trio `div.rail-groups > button.rail-item.rail-group` | Libre Franklin 15px 400 | rgb(76, 69, 60) on rgb(245, 240, 229) | 8px | 44 |  | [rest](buttons/100-rest.png) [hover](buttons/100-hover.png) [pressed](buttons/100-pressed.png) [focus](buttons/100-focus.png) |
| 24 | Smoke Server2 members, 2 here `aside.server-side.side > button.server-head`; The Midnight Cartographers of Very Long  `aside.server-side.side > button.server-head` | Libre Franklin 15px 400 | rgb(245, 239, 226) on rgba(0, 0, 0, 0) | 0px | 172 |  | [rest](buttons/071-rest.png) [hover](buttons/071-hover.png) [pressed](buttons/071-pressed.png) [focus](buttons/071-focus.png) |
| 24 | plans `div.channel-row > button.channel`; general `div.channel-row > button.channel` | Libre Franklin 15px 500 | rgb(236, 227, 209) on rgb(28, 34, 48) | 4px | 36 |  | [rest](buttons/073-rest.png) [hover](buttons/073-hover.png) [pressed](buttons/073-pressed.png) [focus](buttons/073-focus.png) |
| 20 | Voice and video `div.settings-index-group > button.settings-index-row`; Activity `div.settings-index-group > button.settings-index-row` | Libre Franklin 15px 500 | rgb(236, 227, 209) on rgb(28, 34, 48) | 4px | 36 |  | [rest](buttons/014-rest.png) [hover](buttons/014-hover.png) [pressed](buttons/014-pressed.png) [focus](buttons/014-focus.png) |
| 16 | Home: friends and direct messages `nav.rail > button.rail-mark` | Libre Franklin 15px 400 | rgb(31, 27, 23) on rgba(0, 0, 0, 0) | 8px | 44 |  | [rest](buttons/023-rest.png) [hover](buttons/023-hover.png) [pressed](buttons/023-pressed.png) [focus](buttons/023-focus.png) |
| 16 | Create or join `div.rail-foot > button.rail-item.rail-add` | Libre Franklin 15px 400 | rgb(94, 87, 75) on rgba(0, 0, 0, 0) | 8px | 44 |  | [rest](buttons/024-rest.png) [hover](buttons/024-hover.png) [pressed](buttons/024-pressed.png) [focus](buttons/024-focus.png) |
| 15 | Friends `nav.side-list > button.side-row` | Libre Franklin 15px 400 | rgb(31, 27, 23) on rgb(227, 217, 198) | 4px | 44 |  | [rest](buttons/025-rest.png) [hover](buttons/025-hover.png) [pressed](buttons/025-pressed.png) [focus](buttons/025-focus.png) |
| 9 | My profile `div.settings-index-group > button.settings-index-row`; Activity `div.settings-index-group > button.settings-index-row` | Libre Franklin 15px 500 | rgb(31, 27, 23) on rgb(227, 217, 198) | 4px | 36 |  | [rest](buttons/107-rest.png) [hover](buttons/107-hover.png) [pressed](buttons/107-pressed.png) [focus](buttons/107-focus.png) |
| 6 | Home `aside.voice.side > button.home.back` | Libre Franklin 15px 500 | rgb(236, 227, 209) on rgba(0, 0, 0, 0) | 0px | 56 |  | [rest](buttons/050-rest.png) [hover](buttons/050-hover.png) [pressed](buttons/050-pressed.png) [focus](buttons/050-focus.png) |
| 5 | Ann `span.row-text > button.voice-where`; Lounge · Smoke Server `span.row-text > button.voice-where` | Libre Franklin 13.5px 400 | rgb(183, 174, 156) on rgba(0, 0, 0, 0) | 0px | 18 |  | [rest](buttons/062-rest.png) [hover](buttons/062-hover.png) [pressed](buttons/062-pressed.png) [focus](buttons/062-focus.png) |
| 4 | Your profile `div.caller > button.caller-who`; Ann: open profile `div.caller.state-connected > button.caller-who` | Libre Franklin 15px 400 | rgb(236, 227, 209) on rgba(0, 0, 0, 0) | 999px | 51 |  | [rest](buttons/059-rest.png) [hover](buttons/059-hover.png) [pressed](buttons/059-pressed.png) [focus](buttons/059-focus.png) |
| 3 | Bob (you) `div.voice-people > button.voice-person.member`; Bob `div.voice-people > button.voice-person.member` | Libre Franklin 15px 400 | rgb(236, 227, 209) on rgba(0, 0, 0, 0) | 4px | 28 |  | [rest](buttons/077-rest.png) [hover](buttons/077-hover.png) [pressed](buttons/077-pressed.png) [focus](buttons/077-focus.png) |
| 3 | Ann (you)anntester#8835 `section > button.member`; Bobbobtester#9908 `section > button.member` | Libre Franklin 15px 400 | rgb(31, 27, 23) on rgba(0, 0, 0, 0) | 4px | 44 |  | [rest](buttons/105-rest.png) [hover](buttons/105-hover.png) [pressed](buttons/105-pressed.png) [focus](buttons/105-focus.png) |
| 2 | plans1 `div.channel-row > button.channel` | Libre Franklin 15px 500 | rgb(236, 227, 209) on rgba(0, 0, 0, 0) | 4px | 36 |  | [rest](buttons/074-rest.png) [hover](buttons/074-hover.png) [pressed](buttons/074-pressed.png) [focus](buttons/074-focus.png) |
| 2 | Lounge `div.role-list > button.role-row.role-pick`; #plans `div.role-list > button.role-row.role-pick` | Libre Franklin 15px 400 | rgb(236, 227, 209) on rgba(0, 0, 0, 0) | 4px | 36 |  | [rest](buttons/084-rest.png) [hover](buttons/084-hover.png) [pressed](buttons/084-pressed.png) [focus](buttons/084-focus.png) |
| 2 | general `div.channel-row > button.channel`; plans `div.channel-row > button.channel` | Libre Franklin 15px 500 | rgb(76, 69, 60) on rgba(0, 0, 0, 0) | 4px | 36 |  | [rest](buttons/102-rest.png) [hover](buttons/102-hover.png) [pressed](buttons/102-pressed.png) [focus](buttons/102-focus.png) |
| 1 | @everyone2 `div.role-row.fixed > button.role-pick` | Libre Franklin 15px 400 | rgb(236, 227, 209) on rgba(0, 0, 0, 0) | 0px | 36 |  | [rest](buttons/080-rest.png) [hover](buttons/080-hover.png) [pressed](buttons/080-pressed.png) [focus](buttons/080-focus.png) |
| 1 | #general `div.role-list > button.role-row.role-pick` | Libre Franklin 15px 400 | rgb(236, 227, 209) on rgb(28, 34, 48) | 4px | 36 |  | [rest](buttons/083-rest.png) [hover](buttons/083-hover.png) [pressed](buttons/083-pressed.png) [focus](buttons/083-focus.png) |
| 1 | Smoke Server3 members, 3 here `aside.server-side.side > button.server-head` | Libre Franklin 15px 400 | rgb(248, 243, 232) on rgba(0, 0, 0, 0) | 0px | 172 |  | [rest](buttons/101-rest.png) [hover](buttons/101-hover.png) [pressed](buttons/101-pressed.png) [focus](buttons/101-focus.png) |
| 1 | Lounge `div.channel-row > button.channel` | Libre Franklin 15px 500 | rgb(31, 27, 23) on rgb(227, 217, 198) | 4px | 36 |  | [rest](buttons/103-rest.png) [hover](buttons/103-hover.png) [pressed](buttons/103-pressed.png) [focus](buttons/103-focus.png) |

## segmented control and choice cards

| Seen | Example | Font | Colour on background | Radius | Height | Extras | States |
|---|---|---|---|---|---|---|---|
| 12 | Off `div.segmented[radiogroup] > button[radio]`; Breathe `div.segmented[radiogroup] > button[radio]` | Libre Franklin 13.5px 700 | rgb(183, 174, 156) on rgba(0, 0, 0, 0) | 4px | 28 |  | [rest](buttons/046-rest.png) [hover](buttons/046-hover.png) [pressed](buttons/046-pressed.png) [focus](buttons/046-focus.png) |
| 6 | ✕ `span.tri[radiogroup] > button.tri-deny[radio]`; ✓ `span.tri[radiogroup] > button.tri-allow[radio]` | Libre Franklin 13.5px 700 | rgb(150, 144, 128) on rgba(0, 0, 0, 0) | 0px | 28 |  | [rest](buttons/085-rest.png) [hover](buttons/085-hover.png) [pressed](buttons/085-pressed.png) [focus](buttons/085-focus.png) |
| 6 | Ivory `div.theme-cards[radiogroup] > button.theme-card[radio]`; Match Windows `div.theme-cards[radiogroup] > button.theme-card[radio]` | Libre Franklin 13.5px 700 | rgb(236, 227, 209) on rgb(21, 26, 36) | 8px | 96 | border | [rest](buttons/098-rest.png) [hover](buttons/098-hover.png) [pressed](buttons/098-pressed.png) [focus](buttons/098-focus.png) |
| 6 | Ivory `div.theme-cards[radiogroup] > button.theme-card[radio]`; Match Windows `div.theme-cards[radiogroup] > button.theme-card[radio]` | Libre Franklin 13.5px 700 | rgb(31, 27, 23) on rgb(245, 240, 229) | 8px | 96 | border | [rest](buttons/120-rest.png) [hover](buttons/120-hover.png) [pressed](buttons/120-pressed.png) [focus](buttons/120-focus.png) |
| 4 | Counter-Strike 2 `div.banner-games[radiogroup] > button[radio]`; Destiny 2 `div.banner-games[radiogroup] > button[radio]` | Libre Franklin 15px 400 | rgb(236, 227, 209) on rgb(11, 14, 20) | 8px | 64 | border | [rest](buttons/087-rest.png) [hover](buttons/087-hover.png) [pressed](buttons/087-pressed.png) [focus](buttons/087-focus.png) |
| 4 | Arcade `div.weave-kinds[radiogroup] > button.weave-kind[radio]`; Skyline `div.weave-kinds[radiogroup] > button.weave-kind[radio]` | Libre Franklin 13.5px 500 | rgb(245, 239, 226) on rgb(11, 14, 20) | 8px | 58 | border | [rest](buttons/094-rest.png) [hover](buttons/094-hover.png) [pressed](buttons/094-pressed.png) [focus](buttons/094-focus.png) |
| 4 | Arcade `div.weave-kinds[radiogroup] > button.weave-kind[radio]`; Skyline `div.weave-kinds[radiogroup] > button.weave-kind[radio]` | Libre Franklin 13.5px 500 | rgb(248, 243, 232) on rgb(251, 248, 241) | 8px | 58 | border | [rest](buttons/115-rest.png) [hover](buttons/115-hover.png) [pressed](buttons/115-pressed.png) [focus](buttons/115-focus.png) |
| 3 | Arcade `div.theme-weaves[radiogroup] > button.weave-kind[radio]`; Skyline `div.theme-weaves[radiogroup] > button.weave-kind[radio]` | Libre Franklin 15px 400 | rgb(245, 239, 226) on rgb(11, 14, 20) | 8px | 58 | border | [rest](buttons/043-rest.png) [hover](buttons/043-hover.png) [pressed](buttons/043-pressed.png) [focus](buttons/043-focus.png) |
| 3 | Drift `div.segmented[radiogroup] > button[radio]`; A game's art `div.segmented[radiogroup] > button[radio]` | Libre Franklin 13.5px 700 | rgb(236, 227, 209) on rgba(0, 0, 0, 0) | 4px | 28 |  | [rest](buttons/047-rest.png) [hover](buttons/047-hover.png) [pressed](buttons/047-pressed.png) [focus](buttons/047-focus.png) |
| 3 | / `span.tri[radiogroup] > button.tri-inherit[radio]` | Libre Franklin 13.5px 700 | rgb(236, 227, 209) on rgba(0, 0, 0, 0) | 0px | 28 |  | [rest](buttons/086-rest.png) [hover](buttons/086-hover.png) [pressed](buttons/086-pressed.png) [focus](buttons/086-focus.png) |
| 3 | Ink `div.theme-cards[radiogroup] > button.theme-card[radio]` | Libre Franklin 13.5px 700 | rgb(236, 227, 209) on rgb(21, 26, 36) | 8px | 96 | border | [rest](buttons/097-rest.png) [hover](buttons/097-hover.png) [pressed](buttons/097-pressed.png) [focus](buttons/097-focus.png) |
| 3 | Ink `div.theme-cards[radiogroup] > button.theme-card[radio]` | Libre Franklin 13.5px 700 | rgb(31, 27, 23) on rgb(245, 240, 229) | 8px | 96 | border | [rest](buttons/119-rest.png) [hover](buttons/119-hover.png) [pressed](buttons/119-pressed.png) [focus](buttons/119-focus.png) |
| 2 | Dota 2 `div.banner-games[radiogroup] > button[radio]` | Libre Franklin 15px 400 | rgb(236, 227, 209) on rgb(11, 14, 20) | 8px | 64 | border | [rest](buttons/088-rest.png) [hover](buttons/088-hover.png) [pressed](buttons/088-pressed.png) [focus](buttons/088-focus.png) |
| 2 | Search `div.segmented[tablist] > button[tab]`; Starred `div.segmented[tablist] > button[tab]` | Libre Franklin 13.5px 700 | rgb(183, 174, 156) on rgba(0, 0, 0, 0) | 4px | 28 |  | [rest](buttons/090-rest.png) [hover](buttons/090-hover.png) [pressed](buttons/090-pressed.png) [focus](buttons/090-focus.png) |
| 1 | None `div.theme-weaves[radiogroup] > button.weave-kind.none[radio]` | Libre Franklin 15px 400 | rgb(245, 239, 226) on rgb(28, 34, 48) | 8px | 58 | border | [rest](buttons/042-rest.png) [hover](buttons/042-hover.png) [pressed](buttons/042-pressed.png) [focus](buttons/042-focus.png) |
| 1 | Lattice `div.theme-weaves[radiogroup] > button.weave-kind[radio]` | Libre Franklin 15px 400 | rgb(245, 239, 226) on rgb(11, 14, 20) | 8px | 58 | border | [rest](buttons/044-rest.png) [hover](buttons/044-hover.png) [pressed](buttons/044-pressed.png) [focus](buttons/044-focus.png) |
| 1 | Recent `div.segmented[tablist] > button[tab]` | Libre Franklin 13.5px 700 | rgb(236, 227, 209) on rgba(0, 0, 0, 0) | 4px | 28 |  | [rest](buttons/091-rest.png) [hover](buttons/091-hover.png) [pressed](buttons/091-pressed.png) [focus](buttons/091-focus.png) |
| 1 | Your picture `div.weave-kinds[radiogroup] > button.weave-kind[radio]` | Libre Franklin 13.5px 500 | rgb(245, 239, 226) on rgb(11, 14, 20) | 8px | 58 | border | [rest](buttons/093-rest.png) [hover](buttons/093-hover.png) [pressed](buttons/093-pressed.png) [focus](buttons/093-focus.png) |
| 1 | Upload `div.weave-kinds[radiogroup] > label.weave-kind.upload[radio]` | Libre Franklin 13.5px 500 | rgb(183, 174, 156) on rgb(11, 14, 20) | 8px | 58 | border | [rest](buttons/095-rest.png) [hover](buttons/095-hover.png) [pressed](buttons/095-pressed.png) [focus](buttons/095-focus.png) |
| 1 | GIF `div.weave-kinds[radiogroup] > button.weave-kind.upload` | Libre Franklin 13.5px 500 | rgb(183, 174, 156) on rgb(11, 14, 20) | 8px | 58 | border | [rest](buttons/096-rest.png) [hover](buttons/096-hover.png) [pressed](buttons/096-pressed.png) [focus](buttons/096-focus.png) |
| 1 | Your picture `div.weave-kinds[radiogroup] > button.weave-kind[radio]` | Libre Franklin 13.5px 500 | rgb(248, 243, 232) on rgb(251, 248, 241) | 8px | 58 | border | [rest](buttons/114-rest.png) [hover](buttons/114-hover.png) [pressed](buttons/114-pressed.png) [focus](buttons/114-focus.png) |
| 1 | Upload `div.weave-kinds[radiogroup] > label.weave-kind.upload[radio]` | Libre Franklin 13.5px 500 | rgb(76, 69, 60) on rgb(251, 248, 241) | 8px | 58 | border | [rest](buttons/116-rest.png) [hover](buttons/116-hover.png) [pressed](buttons/116-pressed.png) [focus](buttons/116-focus.png) |
| 1 | GIF `div.weave-kinds[radiogroup] > button.weave-kind.upload` | Libre Franklin 13.5px 500 | rgb(76, 69, 60) on rgb(251, 248, 241) | 8px | 58 | border | [rest](buttons/117-rest.png) [hover](buttons/117-hover.png) [pressed](buttons/117-pressed.png) [focus](buttons/117-focus.png) |

## icon button

| Seen | Example | Font | Colour on background | Radius | Height | Extras | States |
|---|---|---|---|---|---|---|---|
| 306 | Copy friend ID `div.id-plate > button.icon-button`; Mute `div.user-bar > button.icon-button` | Libre Franklin 15px 400 | rgb(183, 174, 156) on rgba(0, 0, 0, 0) | 4px | 36 |  | [rest](buttons/009-rest.png) [hover](buttons/009-hover.png) [pressed](buttons/009-pressed.png) [focus](buttons/009-focus.png) |
| 110 | Back `span.titlebar-nav > button.icon-button.small`; Forward `span.titlebar-nav > button.icon-button.small` | Libre Franklin 15px 500 | rgb(183, 174, 156) on rgba(0, 0, 0, 0) | 4px | 28 |  | [rest](buttons/004-rest.png) [hover](buttons/004-hover.png) [pressed](buttons/004-pressed.png) [focus](buttons/004-focus.png) |
| 77 | Copy friend ID `div.id-plate > button.icon-button`; Mute `div.user-bar > button.icon-button` | Libre Franklin 15px 400 | rgb(76, 69, 60) on rgba(0, 0, 0, 0) | 4px | 36 |  | [rest](buttons/026-rest.png) [hover](buttons/026-hover.png) [pressed](buttons/026-pressed.png) [focus](buttons/026-focus.png) |
| 33 | Send message `form.pop-note > button.pop-send` | Libre Franklin 15px 400 | rgb(150, 144, 128) on rgb(28, 34, 48) | 4px | 36 |  | [rest](buttons/038-rest.png) [hover](buttons/038-hover.png) [pressed](buttons/038-pressed.png) [focus](buttons/038-focus.png) |
| 32 | Back `span.titlebar-nav > button.icon-button.small`; Forward `span.titlebar-nav > button.icon-button.small` | Libre Franklin 15px 500 | rgb(76, 69, 60) on rgba(0, 0, 0, 0) | 4px | 28 |  | [rest](buttons/020-rest.png) [hover](buttons/020-hover.png) [pressed](buttons/020-pressed.png) [focus](buttons/020-focus.png) |
| 15 | More information `span.info > button.info-icon` | Libre Franklin 13.5px 500 | rgb(150, 144, 128) on rgba(0, 0, 0, 0) | 999px | 28 |  | [rest](buttons/018-rest.png) [hover](buttons/018-hover.png) [pressed](buttons/018-pressed.png) [focus](buttons/018-focus.png) |
| 12 | More information `span.info > button.info-icon` | Libre Franklin 13.5px 500 | rgb(94, 87, 75) on rgba(0, 0, 0, 0) | 999px | 28 |  | [rest](buttons/122-rest.png) [hover](buttons/122-hover.png) [pressed](buttons/122-pressed.png) [focus](buttons/122-focus.png) |
| 5 | Connection good and stable `span.info > button.signal-icon` | Libre Franklin 15px 500 | rgb(159, 176, 127) on rgba(0, 0, 0, 0) | 4px | 28 |  | [rest](buttons/061-rest.png) [hover](buttons/061-hover.png) [pressed](buttons/061-pressed.png) [focus](buttons/061-focus.png) |
| 3 | Open full profile `div.pop-head > button.icon-button.pop-expand` | Libre Franklin 15px 400 | rgb(245, 239, 226) on rgba(10, 12, 16, 0.62) | 4px | 36 |  | [rest](buttons/036-rest.png) [hover](buttons/036-hover.png) [pressed](buttons/036-pressed.png) [focus](buttons/036-focus.png) |
| 1 | More information `span.info > button.info-icon` | Libre Franklin 15px 400 | rgb(150, 144, 128) on rgba(0, 0, 0, 0) | 999px | 28 |  | [rest](buttons/048-rest.png) [hover](buttons/048-hover.png) [pressed](buttons/048-pressed.png) [focus](buttons/048-focus.png) |
| 1 | Copy the launch option `p.connection-note > button.icon-button` | Libre Franklin 13.5px 400 | rgb(183, 174, 156) on rgba(0, 0, 0, 0) | 4px | 36 |  | [rest](buttons/049-rest.png) [hover](buttons/049-hover.png) [pressed](buttons/049-pressed.png) [focus](buttons/049-focus.png) |
| 1 | Hide the people in the call `div.people-row > button.people-toggle` | Libre Franklin 15px 400 | rgb(183, 174, 156) on rgb(15, 18, 26) | 4px | 28 |  | [rest](buttons/065-rest.png) [hover](buttons/065-hover.png) [pressed](buttons/065-pressed.png) [focus](buttons/065-focus.png) |
| 1 | @everyone cannot be moved `div.role-row.fixed > button.role-grip` | Libre Franklin 15px 400 | rgb(150, 144, 128) on rgba(0, 0, 0, 0) | 4px | 28 |  | [rest](buttons/079-rest.png) [hover](buttons/079-hover.png) [pressed](buttons/079-pressed.png) [focus](buttons/079-focus.png) |
| 1 | Send message `form.send.composer > button.send-button` | Libre Franklin 15px 400 | rgb(94, 87, 75) on rgb(227, 217, 198) | 4px | 36 |  | [rest](buttons/104-rest.png) [hover](buttons/104-hover.png) [pressed](buttons/104-pressed.png) [focus](buttons/104-focus.png) |

## person or card (opens a profile)

| Seen | Example | Font | Colour on background | Radius | Height | Extras | States |
|---|---|---|---|---|---|---|---|
| 110 | Input devices `div.user-bar > button.bar-arrow`; Output devices `div.user-bar > button.bar-arrow` | Libre Franklin 15px 400 | rgb(150, 144, 128) on rgba(0, 0, 0, 0) | 4px | 36 |  | [rest](buttons/011-rest.png) [hover](buttons/011-hover.png) [pressed](buttons/011-pressed.png) [focus](buttons/011-focus.png) |
| 75 | Annanntester#8835 · Online `header.chat-head > button.chat-person`; Bob (you)Playing Destiny 2 · Raid · Salv `aside.members > button.member` | Libre Franklin 15px 400 | rgb(236, 227, 209) on rgba(0, 0, 0, 0) | 4px | 44 |  | [rest](buttons/051-rest.png) [hover](buttons/051-hover.png) [pressed](buttons/051-pressed.png) [focus](buttons/051-focus.png) |
| 55 | Cycytester#2457 `div.user-bar > button.user-bar-me`; AnnPlaying Counter-Strike 2 · 1 min `div.user-bar > button.user-bar-me` | Libre Franklin 15px 400 | rgb(236, 227, 209) on rgba(0, 0, 0, 0) | 4px | 44 |  | [rest](buttons/010-rest.png) [hover](buttons/010-hover.png) [pressed](buttons/010-pressed.png) [focus](buttons/010-focus.png) |
| 38 | Ann `div.msg-head > button.user`; Bob `div.msg-head > button.user` | Libre Franklin 15px 500 | rgb(236, 227, 209) on rgba(0, 0, 0, 0) | 4px | 20 |  | [rest](buttons/053-rest.png) [hover](buttons/053-hover.png) [pressed](buttons/053-pressed.png) [focus](buttons/053-focus.png) |
| 32 | Input devices `div.user-bar > button.bar-arrow`; Output devices `div.user-bar > button.bar-arrow` | Libre Franklin 15px 400 | rgb(94, 87, 75) on rgba(0, 0, 0, 0) | 4px | 36 |  | [rest](buttons/029-rest.png) [hover](buttons/029-hover.png) [pressed](buttons/029-pressed.png) [focus](buttons/029-focus.png) |
| 16 | AnnPlaying Counter-Strike 2 · 1 min `div.user-bar > button.user-bar-me`; Annanntester#8835 `div.user-bar > button.user-bar-me` | Libre Franklin 15px 400 | rgb(31, 27, 23) on rgba(0, 0, 0, 0) | 4px | 44 |  | [rest](buttons/028-rest.png) [hover](buttons/028-hover.png) [pressed](buttons/028-pressed.png) [focus](buttons/028-focus.png) |
| 16 | Ann `div.game-card-foot > button.game-card-who`; Bob `div.game-card-foot > button.game-card-who` | Libre Franklin 15px 500 | rgb(245, 239, 226) on rgba(0, 0, 0, 0) | 4px | 28 |  | [rest](buttons/030-rest.png) [hover](buttons/030-hover.png) [pressed](buttons/030-pressed.png) [focus](buttons/030-focus.png) |
| 5 | Open Ann's profile `div.person-panel > button.person-head`; Open Bob's profile `div.person-panel > button.person-head` | Libre Franklin 15px 400 | rgb(236, 227, 209) on rgba(0, 0, 0, 0) | 0px | 120 |  | [rest](buttons/055-rest.png) [hover](buttons/055-hover.png) [pressed](buttons/055-pressed.png) [focus](buttons/055-focus.png) |
| 4 | SteamCS2 `div.connections[group] > button.connection`; SteamCS2 · Dota 2 `div.connections[group] > button.connection` | Libre Franklin 15px 400 | rgb(236, 227, 209) on rgb(28, 34, 48) | 8px | 44 | border | [rest](buttons/034-rest.png) [hover](buttons/034-hover.png) [pressed](buttons/034-pressed.png) [focus](buttons/034-focus.png) |
| 4 | Bungie.netLink `div.connections[group] > button.connection`; SteamCS2 `div.connections[group] > button.connection` | Libre Franklin 15px 400 | rgb(236, 227, 209) on rgb(21, 26, 36) | 8px | 44 | border | [rest](buttons/035-rest.png) [hover](buttons/035-hover.png) [pressed](buttons/035-pressed.png) [focus](buttons/035-focus.png) |
| 4 | Counter-Strike 2Mirage · CompetitiveFor  `div.pop-body > button.pop-glance`; Destiny 2Raid · Salvation's EdgeFor 2 mi `div.person-body > button.pop-glance` | Libre Franklin 15px 400 | rgb(236, 227, 209) on rgb(28, 34, 48) | 8px | 44 |  | [rest](buttons/037-rest.png) [hover](buttons/037-hover.png) [pressed](buttons/037-pressed.png) [focus](buttons/037-focus.png) |
| 4 | Your profile `figure.oculus-person > button.oculus-who`; Ann's profile `figure.oculus-person > button.oculus-who` | Libre Franklin 15px 400 | rgb(236, 227, 209) on rgba(0, 0, 0, 0) | 999px | 79 |  | [rest](buttons/060-rest.png) [hover](buttons/060-hover.png) [pressed](buttons/060-pressed.png) [focus](buttons/060-focus.png) |
| 1 | Use this GIF `div.gif-tile > button.gif-use` | Libre Franklin 15px 400 | rgb(236, 227, 209) on rgba(0, 0, 0, 0) | 0px | 114 |  | [rest](buttons/092-rest.png) [hover](buttons/092-hover.png) [pressed](buttons/092-pressed.png) [focus](buttons/092-focus.png) |

## slider

| Seen | Example | Font | Colour on background | Radius | Height | Extras | States |
|---|---|---|---|---|---|---|---|
| 8 | (icon) `div.setting > input` | Libre Franklin 13.5px 500 | rgb(183, 174, 156) on rgba(0, 0, 0, 0) | 0px | 28 |  | [rest](buttons/015-rest.png) [hover](buttons/015-hover.png) [pressed](buttons/015-pressed.png) [focus](buttons/015-focus.png) |
| 8 | (icon) `label.theme-slider > input`; Volume for Ann `label.person-volume > input` | Libre Franklin 15px 400 | rgb(236, 227, 209) on rgba(0, 0, 0, 0) | 0px | 28 |  | [rest](buttons/045-rest.png) [hover](buttons/045-hover.png) [pressed](buttons/045-pressed.png) [focus](buttons/045-focus.png) |
| 6 | (icon) `div.setting > input` | Libre Franklin 13.5px 500 | rgb(76, 69, 60) on rgba(0, 0, 0, 0) | 0px | 28 |  | [rest](buttons/121-rest.png) [hover](buttons/121-hover.png) [pressed](buttons/121-pressed.png) [focus](buttons/121-focus.png) |
| 2 | (icon) `div.setting.mic-gate > input` | Libre Franklin 13.5px 500 | rgb(183, 174, 156) on rgba(0, 0, 0, 0) | 0px | 28 |  | [rest](buttons/019-rest.png) [hover](buttons/019-hover.png) [pressed](buttons/019-pressed.png) [focus](buttons/019-focus.png) |
| 2 | (icon) `label.weave-tones > input` | Libre Franklin 13.5px 400 | rgb(150, 144, 128) on rgba(0, 0, 0, 0) | 0px | 28 |  | [rest](buttons/089-rest.png) [hover](buttons/089-hover.png) [pressed](buttons/089-pressed.png) [focus](buttons/089-focus.png) |
| 1 | (icon) `div.setting.mic-gate > input` | Libre Franklin 13.5px 500 | rgb(76, 69, 60) on rgba(0, 0, 0, 0) | 0px | 28 |  | [rest](buttons/123-rest.png) [hover](buttons/123-hover.png) [pressed](buttons/123-pressed.png) [focus](buttons/123-focus.png) |

## title bar control

| Seen | Example | Font | Colour on background | Radius | Height | Extras | States |
|---|---|---|---|---|---|---|---|
| 195 | Minimize `div.window-buttons > button`; Maximize `div.window-buttons > button` | Libre Franklin 15px 500 | rgb(150, 144, 128) on rgba(0, 0, 0, 0) | 0px | 36 |  | [rest](buttons/001-rest.png) [hover](buttons/001-hover.png) [pressed](buttons/001-pressed.png) [focus](buttons/001-focus.png) |
| 55 | Find a friend, group, server or channelC `header.titlebar > button.titlebar-find` | Libre Franklin 13.5px 400 | rgb(150, 144, 128) on rgb(11, 14, 20) | 4px | 28 | border | [rest](buttons/005-rest.png) [hover](buttons/005-hover.png) [pressed](buttons/005-pressed.png) [focus](buttons/005-focus.png) |
| 48 | Minimize `div.window-buttons > button`; Maximize `div.window-buttons > button` | Libre Franklin 15px 500 | rgb(94, 87, 75) on rgba(0, 0, 0, 0) | 0px | 36 |  | [rest](buttons/022-rest.png) [hover](buttons/022-hover.png) [pressed](buttons/022-pressed.png) [focus](buttons/022-focus.png) |
| 16 | Find a friend, group, server or channelC `header.titlebar > button.titlebar-find` | Libre Franklin 13.5px 400 | rgb(94, 87, 75) on rgb(251, 248, 241) | 4px | 28 | border | [rest](buttons/021-rest.png) [hover](buttons/021-hover.png) [pressed](buttons/021-pressed.png) [focus](buttons/021-focus.png) |
| 1 | In a call in Ann `header.titlebar > button.titlebar-call` | Libre Franklin 13.5px 400 | rgb(147, 169, 207) on rgba(0, 0, 0, 0) | 999px | 28 | border | [rest](buttons/064-rest.png) [hover](buttons/064-hover.png) [pressed](buttons/064-pressed.png) [focus](buttons/064-focus.png) |

## quiet button

| Seen | Example | Font | Colour on background | Radius | Height | Extras | States |
|---|---|---|---|---|---|---|---|
| 12 | Later `div.toast.update-toast[status] > button.button.subtle`; Unlink `div.connection-panel > button.button.subtle` | Libre Franklin 13.5px 700 | rgb(183, 174, 156) on rgba(0, 0, 0, 0) | 4px | 36 | border | [rest](buttons/012-rest.png) [hover](buttons/012-hover.png) [pressed](buttons/012-pressed.png) [focus](buttons/012-focus.png) |
| 4 | Reset `div.settings-row.save-bar > button.button.subtle` | Libre Franklin 13.5px 700 | rgb(150, 144, 128) on rgba(0, 0, 0, 0) | 4px | 36 | border | [rest](buttons/082-rest.png) [hover](buttons/082-hover.png) [pressed](buttons/082-pressed.png) [focus](buttons/082-focus.png) |
| 3 | Block `div.pop-body > button.link-button.pop-block` | Libre Franklin 13.5px 400 | rgb(150, 144, 128) on rgba(0, 0, 0, 0) | 0px | 18 |  | [rest](buttons/039-rest.png) [hover](buttons/039-hover.png) [pressed](buttons/039-pressed.png) [focus](buttons/039-focus.png) |
| 2 | We compared it: mark as verified `dd.key-verify > button.link-button` | Libre Franklin 15px 400 | rgb(147, 169, 207) on rgba(0, 0, 0, 0) | 0px | 44 |  | [rest](buttons/040-rest.png) [hover](buttons/040-hover.png) [pressed](buttons/040-pressed.png) [focus](buttons/040-focus.png) |
| 1 | Pin a game or achievement `div.show-slots > button.button.subtle` | Libre Franklin 13.5px 700 | rgb(76, 69, 60) on rgba(0, 0, 0, 0) | 4px | 36 | border | [rest](buttons/112-rest.png) [hover](buttons/112-hover.png) [pressed](buttons/112-pressed.png) [focus](buttons/112-focus.png) |

## select (dropdown)

| Seen | Example | Font | Colour on background | Radius | Height | Extras | States |
|---|---|---|---|---|---|---|---|
| 7 | System defaultFake Audio Input 1Fake Aud `label.field-label > select`; Don't clearClear after 30 minutesClear a `div.settings-row > select` | Libre Franklin 13.5px 500 | rgb(183, 174, 156) on rgb(11, 14, 20) | 4px | 36 | gradient or image, border | [rest](buttons/016-rest.png) [hover](buttons/016-hover.png) [pressed](buttons/016-pressed.png) [focus](buttons/016-focus.png) |
| 6 | Don't clearClear after 30 minutesClear a `div.settings-row > select`; System defaultFake Audio Output 1Fake Au `label.field-label > select` | Libre Franklin 13.5px 500 | rgb(76, 69, 60) on rgb(251, 248, 241) | 4px | 36 | gradient or image, border | [rest](buttons/110-rest.png) [hover](buttons/110-hover.png) [pressed](buttons/110-pressed.png) [focus](buttons/110-focus.png) |
| 4 | 256.0 MB512.0 MB1.00 GB2.00 GB5.00 GB `div.settings-row > select` | Libre Franklin 15px 400 | rgb(236, 227, 209) on rgb(11, 14, 20) | 4px | 36 | gradient or image, border | [rest](buttons/099-rest.png) [hover](buttons/099-hover.png) [pressed](buttons/099-pressed.png) [focus](buttons/099-focus.png) |
| 4 | 256.0 MB512.0 MB1.00 GB2.00 GB5.00 GB `div.settings-row > select` | Libre Franklin 15px 400 | rgb(31, 27, 23) on rgb(251, 248, 241) | 4px | 36 | gradient or image, border | [rest](buttons/124-rest.png) [hover](buttons/124-hover.png) [pressed](buttons/124-pressed.png) [focus](buttons/124-focus.png) |
| 1 | Remove member…BobCy `label.add-member > select` | Libre Franklin 15px 400 | rgb(150, 144, 128) on rgb(11, 14, 20) | 4px | 36 | gradient or image, border | [rest](buttons/068-rest.png) [hover](buttons/068-hover.png) [pressed](buttons/068-pressed.png) [focus](buttons/068-focus.png) |

## toggle (switch, checkbox)

| Seen | Example | Font | Colour on background | Radius | Height | Extras | States |
|---|---|---|---|---|---|---|---|
| 48 | (icon) `label.check-row > input[switch]`; Counter-Strike 2 live match details `div.connection-game-head > input[switch]` | Libre Franklin 15px 400 | rgb(236, 227, 209) on rgba(0, 0, 0, 0) | 4px | 28 |  | [rest](buttons/033-rest.png) [hover](buttons/033-hover.png) [pressed](buttons/033-pressed.png) [focus](buttons/033-focus.png) |
| 14 | (icon) `label.check-row > input[switch]` | Libre Franklin 13.5px 500 | rgb(183, 174, 156) on rgba(0, 0, 0, 0) | 4px | 28 |  | [rest](buttons/017-rest.png) [hover](buttons/017-hover.png) [pressed](buttons/017-pressed.png) [focus](buttons/017-focus.png) |
| 12 | (icon) `label.check-row.inline > input[switch]` | Libre Franklin 13.5px 500 | rgb(76, 69, 60) on rgba(0, 0, 0, 0) | 4px | 28 |  | [rest](buttons/111-rest.png) [hover](buttons/111-hover.png) [pressed](buttons/111-pressed.png) [focus](buttons/111-focus.png) |
| 10 | (icon) `label.check-row > input[switch]` | Libre Franklin 15px 400 | rgb(31, 27, 23) on rgba(0, 0, 0, 0) | 4px | 28 |  | [rest](buttons/118-rest.png) [hover](buttons/118-hover.png) [pressed](buttons/118-pressed.png) [focus](buttons/118-focus.png) |
| 5 | Mute `div.context-section[group] > button.context-item.has-check[menuitemcheckbox]`; Disable video `div.context-section[group] > button.context-item.has-check[menuitemcheckbox]` | Libre Franklin 15px 500 | rgb(236, 227, 209) on rgba(0, 0, 0, 0) | 4px | 36 |  | [rest](buttons/078-rest.png) [hover](buttons/078-hover.png) [pressed](buttons/078-pressed.png) [focus](buttons/078-focus.png) |

## primary button

| Seen | Example | Font | Colour on background | Radius | Height | Extras | States |
|---|---|---|---|---|---|---|---|
| 41 | Enter Eleusinia `div.form-actions > button.button.primary`; Add friend `header.page-head > button.button.primary.page-action` | Libre Franklin 13.5px 700 | rgb(27, 22, 14) on rgb(207, 174, 105) | 4px | 36 | border | [rest](buttons/003-rest.png) [hover](buttons/003-hover.png) [pressed](buttons/003-pressed.png) [focus](buttons/003-focus.png) |
| 16 | Add friend `header.page-head > button.button.primary.page-action`; Edit profile `div.card-actions > button.button.primary` | Libre Franklin 13.5px 700 | rgb(255, 250, 240) on rgb(138, 106, 44) | 4px | 36 | border | [rest](buttons/027-rest.png) [hover](buttons/027-hover.png) [pressed](buttons/027-pressed.png) [focus](buttons/027-focus.png) |
| 8 | Save changes `div.settings-row.save-bar > button.button.primary`; Save `div.settings-row > button.button.primary` | Libre Franklin 13.5px 700 | rgb(150, 144, 128) on rgb(28, 34, 48) | 4px | 36 | border | [rest](buttons/081-rest.png) [hover](buttons/081-hover.png) [pressed](buttons/081-pressed.png) [focus](buttons/081-focus.png) |
| 2 | Save `div.settings-row > button.button.primary`; Set status `div.settings-row > button.button.primary` | Libre Franklin 13.5px 700 | rgb(94, 87, 75) on rgb(227, 217, 198) | 4px | 36 | border | [rest](buttons/109-rest.png) [hover](buttons/109-hover.png) [pressed](buttons/109-pressed.png) [focus](buttons/109-focus.png) |

## destructive button

| Seen | Example | Font | Colour on background | Radius | Height | Extras | States |
|---|---|---|---|---|---|---|---|
| 20 | Disconnect `div.voice-bar-head > button.icon-button.leave`; Unmute `div.user-bar > button.icon-button` | Libre Franklin 15px 400 | rgb(224, 112, 90) on color(srgb 0.878431 0.439216 0.352941 / 0.12) | 4px | 36 |  | [rest](buttons/063-rest.png) [hover](buttons/063-hover.png) [pressed](buttons/063-pressed.png) [focus](buttons/063-focus.png) |
| 6 | Remove friend `div.card-actions > button.button.danger`; Delete channel `div.settings-row.save-bar > button.button.danger` | Libre Franklin 13.5px 700 | rgb(255, 248, 242) on rgb(179, 65, 45) | 4px | 36 | border | [rest](buttons/041-rest.png) [hover](buttons/041-hover.png) [pressed](buttons/041-pressed.png) [focus](buttons/041-focus.png) |
| 4 | Delete channel `div.context-section[group] > button.context-item.danger[menuitem]`; Remove friend `div.context-section[group] > button.context-item.danger[menuitem]` | Libre Franklin 15px 500 | rgb(224, 112, 90) on rgba(0, 0, 0, 0) | 4px | 36 |  | [rest](buttons/076-rest.png) [hover](buttons/076-hover.png) [pressed](buttons/076-pressed.png) [focus](buttons/076-focus.png) |
| 3 | Delete `div.settings-row > button.button.danger` | Libre Franklin 13.5px 700 | rgb(255, 248, 242) on rgb(163, 56, 31) | 4px | 36 | border | [rest](buttons/125-rest.png) [hover](buttons/125-hover.png) [pressed](buttons/125-pressed.png) [focus](buttons/125-focus.png) |

## secondary button

| Seen | Example | Font | Colour on background | Radius | Height | Extras | States |
|---|---|---|---|---|---|---|---|
| 34 | GIF `div > button.button`; Set `div.hotkey > button.button` | Libre Franklin 13.5px 700 | rgb(236, 227, 209) on rgb(28, 34, 48) | 4px | 36 | border | [rest](buttons/002-rest.png) [hover](buttons/002-hover.png) [pressed](buttons/002-pressed.png) [focus](buttons/002-focus.png) |
| 16 | Message `div.game-card-foot > button.button` | Libre Franklin 13.5px 700 | rgb(236, 227, 209) on rgb(28, 34, 48) | 4px | 28 | border | [rest](buttons/031-rest.png) [hover](buttons/031-hover.png) [pressed](buttons/031-pressed.png) [focus](buttons/031-focus.png) |
| 14 | Edit profile `div.settings-row > button.button`; Add a game… `div.activity-extra > button.button` | Libre Franklin 13.5px 700 | rgb(31, 27, 23) on rgb(227, 217, 198) | 4px | 36 | border | [rest](buttons/113-rest.png) [hover](buttons/113-hover.png) [pressed](buttons/113-pressed.png) [focus](buttons/113-focus.png) |

## menu item

| Seen | Example | Font | Colour on background | Radius | Height | Extras | States |
|---|---|---|---|---|---|---|---|
| 9 | Join with an invite `div.context-section[group] > button.context-item[menuitem]`; Create a group `div.context-section[group] > button.context-item[menuitem]` | Libre Franklin 15px 500 | rgb(236, 227, 209) on rgba(0, 0, 0, 0) | 4px | 36 |  | [rest](buttons/070-rest.png) [hover](buttons/070-hover.png) [pressed](buttons/070-pressed.png) [focus](buttons/070-focus.png) |
| 4 | 15 minutes `div.context-section[group] > button.context-item.nested[menuitem]`; 1 hour `div.context-section[group] > button.context-item.nested[menuitem]` | Libre Franklin 15px 500 | rgb(236, 227, 209) on rgba(0, 0, 0, 0) | 4px | 36 |  | [rest](buttons/075-rest.png) [hover](buttons/075-hover.png) [pressed](buttons/075-pressed.png) [focus](buttons/075-focus.png) |
| 2 | Create a server `div.context-section[group] > button.context-item[menuitem]`; Profile `div.context-section[group] > button.context-item[menuitem]` | Libre Franklin 15px 500 | rgb(236, 227, 209) on rgb(28, 34, 48) | 4px | 36 |  | [rest](buttons/069-rest.png) [hover](buttons/069-hover.png) [pressed](buttons/069-pressed.png) [focus](buttons/069-focus.png) |

## chip and notice

| Seen | Example | Font | Colour on background | Radius | Height | Extras | States |
|---|---|---|---|---|---|---|---|
| 8 | Ann came online `div.notices[status] > button.notice`; Ann started playing Counter-Strike 2 `div.notices[status] > button.notice.game` | Libre Franklin 13.5px 400 | rgb(183, 174, 156) on rgb(21, 26, 36) | 8px | 44 | shadow |  |
| 5 | Private · direct `span.keep > button.keep-chip` | Libre Franklin 13.5px 400 | rgb(159, 176, 127) on rgba(0, 0, 0, 0) | 999px | 28 | border | [rest](buttons/052-rest.png) [hover](buttons/052-hover.png) [pressed](buttons/052-pressed.png) [focus](buttons/052-focus.png) |

## picture or preview (opens it)

| Seen | Example | Font | Colour on background | Radius | Height | Extras | States |
|---|---|---|---|---|---|---|---|
| 4 | View red.png `figure.msg-image > button.image-button` | Libre Franklin 15px 400 | rgb(236, 227, 209) on rgba(0, 0, 0, 0) | 8px | 50 |  | [rest](buttons/054-rest.png) [hover](buttons/054-hover.png) [pressed](buttons/054-pressed.png) [focus](buttons/054-focus.png) |
| 2 | Open A page about fog `div.link-card.with-image > button.link-image` | Libre Franklin 15px 400 | rgb(236, 227, 209) on rgba(0, 0, 0, 0) | 0px | 84 |  | [rest](buttons/058-rest.png) [hover](buttons/058-hover.png) [pressed](buttons/058-pressed.png) [focus](buttons/058-focus.png) |

## link

| Seen | Example | Font | Colour on background | Radius | Height | Extras | States |
|---|---|---|---|---|---|---|---|
| 2 | http://127.0.0.1:65486/fog `p.msg-text > a.msg-link` | Libre Franklin 15px 400 | rgb(147, 169, 207) on rgba(0, 0, 0, 0) | 0px | 18 |  | [rest](buttons/056-rest.png) [hover](buttons/056-hover.png) [pressed](buttons/056-pressed.png) [focus](buttons/056-focus.png) |
| 2 | A page about fog `div.link-text > a.link-title` | Libre Franklin 15px 500 | rgb(236, 227, 209) on rgba(0, 0, 0, 0) | 0px | 20 |  | [rest](buttons/057-rest.png) [hover](buttons/057-hover.png) [pressed](buttons/057-pressed.png) [focus](buttons/057-focus.png) |

## inline edit (rename in place)

| Seen | Example | Font | Colour on background | Radius | Height | Extras | States |
|---|---|---|---|---|---|---|---|
| 1 | The Trio `h1 > button.group-name` | Bodoni Moda Variable 26px 600 | rgb(236, 227, 209) on rgba(0, 0, 0, 0) | 4px | 31 | border | [rest](buttons/067-rest.png) [hover](buttons/067-hover.png) [pressed](buttons/067-pressed.png) [focus](buttons/067-focus.png) |
