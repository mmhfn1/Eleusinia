# Clickable inventory (before)

From `buttons-before.json`: 2306 clickable things seen on screen (buttons, links, menu items, tabs, switches, sliders, rows), with 159 distinct looks (tag or role, font, colours, border, radius, shadow, clip-path, height, padding). One of each look is pictured at rest, hover, pressed and focus (forced through DevTools, nothing clicked): [buttons-before.html](buttons-before.html).

| Kind | Distinct looks | Seen |
|---|---|---|
| navigation row (rail, channels, lists, settings index) | 38 | 776 |
| segmented control and choice cards | 23 | 66 |
| icon button | 18 | 449 |
| person or card (opens a profile) | 17 | 273 |
| toggle (switch, checkbox) | 11 | 84 |
| title bar control | 7 | 421 |
| primary button | 7 | 53 |
| slider | 7 | 22 |
| select (dropdown) | 7 | 21 |
| secondary button | 5 | 65 |
| quiet button | 5 | 20 |
| destructive button | 4 | 18 |
| menu item | 3 | 15 |
| chip and notice | 2 | 12 |
| picture or preview (opens it) | 2 | 5 |
| link | 2 | 5 |
| inline edit (rename in place) | 1 | 1 |

Looks with a shadow, gradient, clip-path or border: 87 of 159.

## navigation row (rail, channels, lists, settings index)

| Seen | Example | Font | Colour on background | Radius | Height | Extras | States |
|---|---|---|---|---|---|---|---|
| 112 | Activity `div.settings-index-group > button.settings-index-row`; Privacy and safety `div.settings-index-group > button.settings-index-row` | Commissioner Variable 14px 400 | rgb(180, 173, 159) on rgba(0, 0, 0, 0) | 5px | 35 |  | [rest](buttons/026-rest.png) [hover](buttons/026-hover.png) [pressed](buttons/026-pressed.png) [focus](buttons/026-focus.png) |
| 72 | Activity `div.settings-index-group > button.settings-index-row`; Privacy and safety `div.settings-index-group > button.settings-index-row` | Commissioner Variable 14px 400 | rgb(92, 84, 71) on rgba(0, 0, 0, 0) | 5px | 35 |  | [rest](buttons/133-rest.png) [hover](buttons/133-hover.png) [pressed](buttons/133-pressed.png) [focus](buttons/133-focus.png) |
| 64 | Bob (you)Playing Destiny 2 · Raid · Salv `aside.members > button.member`; Annanntester#2078 `aside.members > button.member` | Commissioner Variable 14px 400 | rgb(239, 233, 222) on rgba(0, 0, 0, 0) | 5px | 49 |  | [rest](buttons/068-rest.png) [hover](buttons/068-hover.png) [pressed](buttons/068-pressed.png) [focus](buttons/068-focus.png) |
| 52 | Home: friends and direct messages `nav.rail > button.rail-mark` | Commissioner Variable 14px 400 | rgb(239, 233, 222) on rgba(0, 0, 0, 0) | 50% | 48 |  | [rest](buttons/016-rest.png) [hover](buttons/016-hover.png) [pressed](buttons/016-pressed.png) [focus](buttons/016-focus.png) |
| 51 | Create or join `div.rail-foot > button.rail-item.rail-add` | Commissioner Variable 14px 400 | rgb(180, 173, 159) on rgba(0, 0, 0, 0) | 50% | 46 | border | [rest](buttons/017-rest.png) [hover](buttons/017-hover.png) [pressed](buttons/017-pressed.png) [focus](buttons/017-focus.png) |
| 46 | general `div.channel-row > button.channel`; Lounge `div.channel-row > button.channel` | Commissioner Variable 14px 400 | rgb(180, 173, 159) on rgba(0, 0, 0, 0) | 5px | 34 |  | [rest](buttons/084-rest.png) [hover](buttons/084-hover.png) [pressed](buttons/084-pressed.png) [focus](buttons/084-focus.png) |
| 38 | Second `div.rail-groups > button.rail-item.rail-group`; 1 `div.rail-groups > button.rail-item.rail-group` | Commissioner Variable 14px 400 | rgb(214, 207, 194) on rgba(0, 0, 0, 0) | 50% | 46 | border | [rest](buttons/076-rest.png) [hover](buttons/076-hover.png) [pressed](buttons/076-pressed.png) [focus](buttons/076-focus.png) |
| 30 | AnnPlaying Counter-Strike 2 · 1 min `div.friend-row > button.row-button`; BobPlaying Destiny 2 · 1 min `div.friend-row > button.row-button` | Commissioner Variable 14px 400 | rgb(239, 233, 222) on rgba(0, 0, 0, 0) | 6px | 53 | border | [rest](buttons/022-rest.png) [hover](buttons/022-hover.png) [pressed](buttons/022-pressed.png) [focus](buttons/022-focus.png) |
| 30 | Overview `nav.settings-nav > button.settings-page`; Members `nav.settings-nav > button.settings-page` | Commissioner Variable 13px 400 | rgb(214, 207, 194) on rgba(0, 0, 0, 0) | 4px | 34 |  | [rest](buttons/091-rest.png) [hover](buttons/091-hover.png) [pressed](buttons/091-pressed.png) [focus](buttons/091-focus.png) |
| 25 | 1 `div.rail-groups > button.rail-item.rail-group`; Smoke Server `div.rail-groups > button.rail-item.rail-group.rail-server` | Commissioner Variable 14px 400 | rgb(239, 233, 222) on rgb(36, 42, 51) | 15px | 46 | border | [rest](buttons/075-rest.png) [hover](buttons/075-hover.png) [pressed](buttons/075-pressed.png) [focus](buttons/075-focus.png) |
| 25 | Smoke Server2 members, 2 here `aside.server-side.side > button.server-head`; The Midnight Cartographers of Very Long  `aside.server-side.side > button.server-head` | Commissioner Variable 14px 400 | rgb(255, 255, 255) on rgba(0, 0, 0, 0) | 0px | 172 |  | [rest](buttons/083-rest.png) [hover](buttons/083-hover.png) [pressed](buttons/083-pressed.png) [focus](buttons/083-focus.png) |
| 24 | plans `div.channel-row > button.channel`; general `div.channel-row > button.channel` | Commissioner Variable 14px 400 | rgb(239, 233, 222) on rgb(36, 42, 51) | 5px | 34 |  | [rest](buttons/085-rest.png) [hover](buttons/085-hover.png) [pressed](buttons/085-pressed.png) [focus](buttons/085-focus.png) |
| 23 | Friends `nav.side-list > button.side-row` | Commissioner Variable 14px 400 | rgb(239, 233, 222) on rgb(36, 42, 51) | 5px | 40 |  | [rest](buttons/018-rest.png) [hover](buttons/018-hover.png) [pressed](buttons/018-pressed.png) [focus](buttons/018-focus.png) |
| 23 | The Trio `div.rail-groups > button.rail-item.rail-group`; Smoke Server `div.rail-groups > button.rail-item.rail-group.rail-server` | Commissioner Variable 14px 400 | rgb(58, 52, 44) on rgba(0, 0, 0, 0) | 50% | 46 | border | [rest](buttons/125-rest.png) [hover](buttons/125-hover.png) [pressed](buttons/125-pressed.png) [focus](buttons/125-focus.png) |
| 22 | CyOnline `section.dms > button.side-row.dm-row`; BobOnline `section.dms > button.side-row.dm-row` | Commissioner Variable 14px 400 | rgb(92, 84, 71) on rgba(0, 0, 0, 0) | 5px | 49 |  | [rest](buttons/130-rest.png) [hover](buttons/130-hover.png) [pressed](buttons/130-pressed.png) [focus](buttons/130-focus.png) |
| 22 | BobOnline `div.friend-row > button.row-button`; CyOnline `div.friend-row > button.row-button` | Commissioner Variable 14px 400 | rgb(33, 29, 24) on rgba(0, 0, 0, 0) | 6px | 53 | border | [rest](buttons/131-rest.png) [hover](buttons/131-hover.png) [pressed](buttons/131-pressed.png) [focus](buttons/131-focus.png) |
| 14 | My profile `div.settings-index-group > button.settings-index-row`; Activity `div.settings-index-group > button.settings-index-row` | Commissioner Variable 14px 400 | rgb(239, 233, 222) on rgb(36, 42, 51) | 5px | 35 |  | [rest](buttons/025-rest.png) [hover](buttons/025-hover.png) [pressed](buttons/025-pressed.png) [focus](buttons/025-focus.png) |
| 13 | Home: friends and direct messages `nav.rail > button.rail-mark` | Commissioner Variable 14px 400 | rgb(33, 29, 24) on rgba(0, 0, 0, 0) | 50% | 48 |  | [rest](buttons/007-rest.png) [hover](buttons/007-hover.png) [pressed](buttons/007-pressed.png) [focus](buttons/007-focus.png) |
| 13 | Create or join `div.rail-foot > button.rail-item.rail-add` | Commissioner Variable 14px 400 | rgb(92, 84, 71) on rgba(0, 0, 0, 0) | 50% | 46 | border | [rest](buttons/008-rest.png) [hover](buttons/008-hover.png) [pressed](buttons/008-pressed.png) [focus](buttons/008-focus.png) |
| 12 | Friends `nav.side-list > button.side-row` | Commissioner Variable 14px 400 | rgb(33, 29, 24) on rgb(226, 218, 203) | 5px | 40 |  | [rest](buttons/009-rest.png) [hover](buttons/009-hover.png) [pressed](buttons/009-pressed.png) [focus](buttons/009-focus.png) |
| 12 | AnnOnline2 `section.dms > button.side-row.dm-row`; AnnIn voice: Ann `section.dms > button.side-row.dm-row` | Commissioner Variable 14px 400 | rgb(180, 173, 159) on rgba(0, 0, 0, 0) | 5px | 49 |  | [rest](buttons/063-rest.png) [hover](buttons/063-hover.png) [pressed](buttons/063-pressed.png) [focus](buttons/063-focus.png) |
| 9 | My profile `div.settings-index-group > button.settings-index-row`; Activity `div.settings-index-group > button.settings-index-row` | Commissioner Variable 14px 400 | rgb(33, 29, 24) on rgb(226, 218, 203) | 5px | 35 |  | [rest](buttons/132-rest.png) [hover](buttons/132-hover.png) [pressed](buttons/132-pressed.png) [focus](buttons/132-focus.png) |
| 5 | Home `aside.voice.side > button.home.back` | Commissioner Variable 15px 650 | rgb(239, 233, 222) on rgba(0, 0, 0, 0) | 0px | 52 | border | [rest](buttons/050-rest.png) [hover](buttons/050-hover.png) [pressed](buttons/050-pressed.png) [focus](buttons/050-focus.png) |
| 5 | Ann `span.row-text > button.voice-where`; Lounge · Smoke Server `span.row-text > button.voice-where` | Commissioner Variable 12px 400 | rgb(180, 173, 159) on rgba(0, 0, 0, 0) | 0px | 18 |  | [rest](buttons/070-rest.png) [hover](buttons/070-hover.png) [pressed](buttons/070-pressed.png) [focus](buttons/070-focus.png) |
| 5 | Roles `nav.settings-nav > button.settings-page`; Channels `nav.settings-nav > button.settings-page` | Commissioner Variable 13px 400 | rgb(239, 233, 222) on rgba(216, 184, 120, 0.1) | 4px | 34 | shadow | [rest](buttons/092-rest.png) [hover](buttons/092-hover.png) [pressed](buttons/092-pressed.png) [focus](buttons/092-focus.png) |
| 4 | BobPlaying Destiny 2 · Raid · Salvation' `section.dms > button.side-row.dm-row`; AnnIn voice: Ann `section.dms > button.side-row.dm-row` | Commissioner Variable 14px 400 | rgb(239, 233, 222) on rgb(36, 42, 51) | 5px | 49 |  | [rest](buttons/051-rest.png) [hover](buttons/051-hover.png) [pressed](buttons/051-pressed.png) [focus](buttons/051-focus.png) |
| 4 | Ann (you)anntester#2078 `aside.members > button.member`; BobPlaying Destiny 2 · Raid · Salvation' `aside.members > button.member` | Commissioner Variable 14px 400 | rgb(239, 233, 222) on rgba(0, 0, 0, 0) | 5px | 42 |  | [rest](buttons/062-rest.png) [hover](buttons/062-hover.png) [pressed](buttons/062-pressed.png) [focus](buttons/062-focus.png) |
| 4 | Your profile `div.caller > button.caller-who`; Ann: open profile `div.caller.state-connected > button.caller-who` | Commissioner Variable 14px 400 | rgb(239, 233, 222) on rgba(0, 0, 0, 0) | 50% | 49 |  | [rest](buttons/064-rest.png) [hover](buttons/064-hover.png) [pressed](buttons/064-pressed.png) [focus](buttons/064-focus.png) |
| 3 | Bob (you) `div.voice-people > button.voice-person.member`; Bob `div.voice-people > button.voice-person.member` | Commissioner Variable 13px 400 | rgb(239, 233, 222) on rgba(0, 0, 0, 0) | 5px | 42 |  | [rest](buttons/089-rest.png) [hover](buttons/089-hover.png) [pressed](buttons/089-pressed.png) [focus](buttons/089-focus.png) |
| 3 | Ann (you)anntester#2078 `section > button.member`; Bobbobtester#8591 `section > button.member` | Commissioner Variable 14px 400 | rgb(33, 29, 24) on rgba(0, 0, 0, 0) | 5px | 49 |  | [rest](buttons/129-rest.png) [hover](buttons/129-hover.png) [pressed](buttons/129-pressed.png) [focus](buttons/129-focus.png) |
| 2 | plans1 `div.channel-row > button.channel` | Commissioner Variable 14px 600 | rgb(239, 233, 222) on rgba(0, 0, 0, 0) | 5px | 34 |  | [rest](buttons/086-rest.png) [hover](buttons/086-hover.png) [pressed](buttons/086-pressed.png) [focus](buttons/086-focus.png) |
| 2 | Lounge `div.role-list > button.role-row.role-pick`; #plans `div.role-list > button.role-row.role-pick` | Commissioner Variable 14px 400 | rgb(239, 233, 222) on rgba(0, 0, 0, 0) | 6px | 34 |  | [rest](buttons/096-rest.png) [hover](buttons/096-hover.png) [pressed](buttons/096-pressed.png) [focus](buttons/096-focus.png) |
| 2 | general `div.channel-row > button.channel`; plans `div.channel-row > button.channel` | Commissioner Variable 14px 400 | rgb(92, 84, 71) on rgba(0, 0, 0, 0) | 5px | 34 |  | [rest](buttons/126-rest.png) [hover](buttons/126-hover.png) [pressed](buttons/126-pressed.png) [focus](buttons/126-focus.png) |
| 1 | Create or join `div.rail-foot > button.rail-item.rail-add` | Commissioner Variable 14px 400 | rgb(239, 233, 222) on rgba(0, 0, 0, 0) | 50% | 46 | border | [rest](buttons/080-rest.png) [hover](buttons/080-hover.png) [pressed](buttons/080-pressed.png) [focus](buttons/080-focus.png) |
| 1 | @everyone2 `div.role-row.fixed > button.role-pick` | Commissioner Variable 14px 400 | rgb(239, 233, 222) on rgba(0, 0, 0, 0) | 0px | 34 |  | [rest](buttons/094-rest.png) [hover](buttons/094-hover.png) [pressed](buttons/094-pressed.png) [focus](buttons/094-focus.png) |
| 1 | #general `div.role-list > button.role-row.role-pick` | Commissioner Variable 14px 400 | rgb(239, 233, 222) on rgb(36, 42, 51) | 6px | 34 |  | [rest](buttons/095-rest.png) [hover](buttons/095-hover.png) [pressed](buttons/095-pressed.png) [focus](buttons/095-focus.png) |
| 1 | Smoke Server `div.rail-groups > button.rail-item.rail-group.rail-server` | Commissioner Variable 14px 400 | rgb(33, 29, 24) on rgb(226, 218, 203) | 15px | 46 | border | [rest](buttons/124-rest.png) [hover](buttons/124-hover.png) [pressed](buttons/124-pressed.png) [focus](buttons/124-focus.png) |
| 1 | Lounge `div.channel-row > button.channel` | Commissioner Variable 14px 400 | rgb(33, 29, 24) on rgb(226, 218, 203) | 5px | 34 |  | [rest](buttons/127-rest.png) [hover](buttons/127-hover.png) [pressed](buttons/127-pressed.png) [focus](buttons/127-focus.png) |

## segmented control and choice cards

| Seen | Example | Font | Colour on background | Radius | Height | Extras | States |
|---|---|---|---|---|---|---|---|
| 8 | Off `div.segmented[radiogroup] > button[radio]`; Breathe `div.segmented[radiogroup] > button[radio]` | Commissioner Variable 13px 600 | rgb(180, 173, 159) on rgba(0, 0, 0, 0) | 5px | 30 |  | [rest](buttons/045-rest.png) [hover](buttons/045-hover.png) [pressed](buttons/045-pressed.png) [focus](buttons/045-focus.png) |
| 6 | ✕ `span.tri[radiogroup] > button.tri-deny[radio]`; ✓ `span.tri[radiogroup] > button.tri-allow[radio]` | Commissioner Variable 12px 600 | rgb(133, 127, 115) on rgba(0, 0, 0, 0) | 0px | 26 |  | [rest](buttons/097-rest.png) [hover](buttons/097-hover.png) [pressed](buttons/097-pressed.png) [focus](buttons/097-focus.png) |
| 6 | Ivory `div.theme-cards[radiogroup] > button.theme-card[radio]`; Match Windows `div.theme-cards[radiogroup] > button.theme-card[radio]` | Commissioner Variable 14px 600 | rgb(239, 233, 222) on rgb(16, 19, 24) | 10px | 115 | border | [rest](buttons/115-rest.png) [hover](buttons/115-hover.png) [pressed](buttons/115-pressed.png) [focus](buttons/115-focus.png) |
| 6 | Ivory `div.theme-cards[radiogroup] > button.theme-card[radio]`; Match Windows `div.theme-cards[radiogroup] > button.theme-card[radio]` | Commissioner Variable 14px 600 | rgb(33, 29, 24) on rgb(231, 224, 209) | 10px | 115 | border | [rest](buttons/147-rest.png) [hover](buttons/147-hover.png) [pressed](buttons/147-pressed.png) [focus](buttons/147-focus.png) |
| 4 | Counter-Strike 2 `div.banner-games[radiogroup] > button[radio]`; Destiny 2 `div.banner-games[radiogroup] > button[radio]` | Commissioner Variable 14px 400 | rgb(239, 233, 222) on rgb(20, 24, 30) | 7px | 64 | border | [rest](buttons/099-rest.png) [hover](buttons/099-hover.png) [pressed](buttons/099-pressed.png) [focus](buttons/099-focus.png) |
| 4 | Arcade `div.weave-kinds[radiogroup] > button.weave-kind[radio]`; Skyline `div.weave-kinds[radiogroup] > button.weave-kind[radio]` | Commissioner Variable 12.5px 600 | rgb(133, 127, 115) on rgb(20, 24, 30) | 7px | 92 | border | [rest](buttons/111-rest.png) [hover](buttons/111-hover.png) [pressed](buttons/111-pressed.png) [focus](buttons/111-focus.png) |
| 4 | Arcade `div.weave-kinds[radiogroup] > button.weave-kind[radio]`; Skyline `div.weave-kinds[radiogroup] > button.weave-kind[radio]` | Commissioner Variable 12.5px 600 | rgb(135, 126, 110) on rgb(239, 233, 221) | 7px | 92 | border | [rest](buttons/140-rest.png) [hover](buttons/140-hover.png) [pressed](buttons/140-pressed.png) [focus](buttons/140-focus.png) |
| 3 | Arcade `div.theme-weaves[radiogroup] > button.weave-kind[radio]`; Skyline `div.theme-weaves[radiogroup] > button.weave-kind[radio]` | Commissioner Variable 14px 400 | rgb(239, 233, 222) on rgb(20, 24, 30) | 7px | 58 | border | [rest](buttons/042-rest.png) [hover](buttons/042-hover.png) [pressed](buttons/042-pressed.png) [focus](buttons/042-focus.png) |
| 3 | Drift `div.segmented[radiogroup] > button[radio]`; A game's art `div.segmented[radiogroup] > button[radio]` | Commissioner Variable 13px 600 | rgb(239, 233, 222) on rgb(43, 49, 59) | 5px | 30 |  | [rest](buttons/046-rest.png) [hover](buttons/046-hover.png) [pressed](buttons/046-pressed.png) [focus](buttons/046-focus.png) |
| 3 | / `span.tri[radiogroup] > button.tri-inherit[radio]` | Commissioner Variable 12px 600 | rgb(214, 207, 194) on rgb(43, 49, 59) | 0px | 26 |  | [rest](buttons/098-rest.png) [hover](buttons/098-hover.png) [pressed](buttons/098-pressed.png) [focus](buttons/098-focus.png) |
| 3 | Ink `div.theme-cards[radiogroup] > button.theme-card[radio]` | Commissioner Variable 14px 600 | rgb(239, 233, 222) on rgb(16, 19, 24) | 10px | 115 | border | [rest](buttons/114-rest.png) [hover](buttons/114-hover.png) [pressed](buttons/114-pressed.png) [focus](buttons/114-focus.png) |
| 3 | Ink `div.theme-cards[radiogroup] > button.theme-card[radio]` | Commissioner Variable 14px 600 | rgb(33, 29, 24) on rgb(231, 224, 209) | 10px | 115 | border | [rest](buttons/146-rest.png) [hover](buttons/146-hover.png) [pressed](buttons/146-pressed.png) [focus](buttons/146-focus.png) |
| 2 | Dota 2 `div.banner-games[radiogroup] > button[radio]` | Commissioner Variable 14px 400 | rgb(239, 233, 222) on rgb(20, 24, 30) | 7px | 64 | border | [rest](buttons/100-rest.png) [hover](buttons/100-hover.png) [pressed](buttons/100-pressed.png) [focus](buttons/100-focus.png) |
| 2 | Search `div.segmented[tablist] > button[tab]`; Starred `div.segmented[tablist] > button[tab]` | Commissioner Variable 13px 600 | rgb(180, 173, 159) on rgba(0, 0, 0, 0) | 5px | 30 |  | [rest](buttons/102-rest.png) [hover](buttons/102-hover.png) [pressed](buttons/102-pressed.png) [focus](buttons/102-focus.png) |
| 1 | None `div.theme-weaves[radiogroup] > button.weave-kind.none[radio]` | Commissioner Variable 14px 400 | rgb(239, 233, 222) on rgb(36, 42, 51) | 7px | 58 | border | [rest](buttons/041-rest.png) [hover](buttons/041-hover.png) [pressed](buttons/041-pressed.png) [focus](buttons/041-focus.png) |
| 1 | Lattice `div.theme-weaves[radiogroup] > button.weave-kind[radio]` | Commissioner Variable 14px 400 | rgb(239, 233, 222) on rgb(20, 24, 30) | 7px | 58 | border | [rest](buttons/043-rest.png) [hover](buttons/043-hover.png) [pressed](buttons/043-pressed.png) [focus](buttons/043-focus.png) |
| 1 | Recent `div.segmented[tablist] > button[tab]` | Commissioner Variable 13px 600 | rgb(239, 233, 222) on rgb(43, 49, 59) | 5px | 30 |  | [rest](buttons/103-rest.png) [hover](buttons/103-hover.png) [pressed](buttons/103-pressed.png) [focus](buttons/103-focus.png) |
| 1 | Your picture `div.weave-kinds[radiogroup] > button.weave-kind[radio]` | Commissioner Variable 12.5px 600 | rgb(133, 127, 115) on rgb(20, 24, 30) | 7px | 92 | border | [rest](buttons/110-rest.png) [hover](buttons/110-hover.png) [pressed](buttons/110-pressed.png) [focus](buttons/110-focus.png) |
| 1 | Upload `div.weave-kinds[radiogroup] > label.weave-kind.upload[radio]` | Commissioner Variable 12.5px 600 | rgb(180, 173, 159) on rgb(20, 24, 30) | 7px | 92 | border | [rest](buttons/112-rest.png) [hover](buttons/112-hover.png) [pressed](buttons/112-pressed.png) [focus](buttons/112-focus.png) |
| 1 | GIF `div.weave-kinds[radiogroup] > button.weave-kind.upload` | Commissioner Variable 12.5px 600 | rgb(180, 173, 159) on rgb(20, 24, 30) | 7px | 92 | border | [rest](buttons/113-rest.png) [hover](buttons/113-hover.png) [pressed](buttons/113-pressed.png) [focus](buttons/113-focus.png) |
| 1 | Your picture `div.weave-kinds[radiogroup] > button.weave-kind[radio]` | Commissioner Variable 12.5px 600 | rgb(135, 126, 110) on rgb(239, 233, 221) | 7px | 92 | border | [rest](buttons/139-rest.png) [hover](buttons/139-hover.png) [pressed](buttons/139-pressed.png) [focus](buttons/139-focus.png) |
| 1 | Upload `div.weave-kinds[radiogroup] > label.weave-kind.upload[radio]` | Commissioner Variable 12.5px 600 | rgb(92, 84, 71) on rgb(239, 233, 221) | 7px | 92 | border | [rest](buttons/141-rest.png) [hover](buttons/141-hover.png) [pressed](buttons/141-pressed.png) [focus](buttons/141-focus.png) |
| 1 | GIF `div.weave-kinds[radiogroup] > button.weave-kind.upload` | Commissioner Variable 12.5px 600 | rgb(92, 84, 71) on rgb(239, 233, 221) | 7px | 92 | border | [rest](buttons/142-rest.png) [hover](buttons/142-hover.png) [pressed](buttons/142-pressed.png) [focus](buttons/142-focus.png) |

## icon button

| Seen | Example | Font | Colour on background | Radius | Height | Extras | States |
|---|---|---|---|---|---|---|---|
| 279 | Copy friend ID `div.id-plate > button.icon-button`; Mute `div.user-bar > button.icon-button` | Commissioner Variable 14px 400 | rgb(180, 173, 159) on rgba(0, 0, 0, 0) | 6px | 30 | border | [rest](buttons/019-rest.png) [hover](buttons/019-hover.png) [pressed](buttons/019-pressed.png) [focus](buttons/019-focus.png) |
| 64 | Copy friend ID `div.id-plate > button.icon-button`; Mute `div.user-bar > button.icon-button` | Commissioner Variable 14px 400 | rgb(92, 84, 71) on rgba(0, 0, 0, 0) | 6px | 30 | border | [rest](buttons/010-rest.png) [hover](buttons/010-hover.png) [pressed](buttons/010-pressed.png) [focus](buttons/010-focus.png) |
| 29 | Send message `form.send.composer > button.send-button` | Commissioner Variable 14px 400 | rgb(133, 127, 115) on rgb(36, 42, 51) | 6px | 36 | border | [rest](buttons/059-rest.png) [hover](buttons/059-hover.png) [pressed](buttons/059-pressed.png) [focus](buttons/059-focus.png) |
| 15 | Unmute `div.user-bar > button.icon-button` | Commissioner Variable 14px 400 | rgb(226, 102, 78) on rgb(36, 42, 51) | 6px | 30 | border | [rest](buttons/079-rest.png) [hover](buttons/079-hover.png) [pressed](buttons/079-pressed.png) [focus](buttons/079-focus.png) |
| 13 | More information `span.info > button.info-icon` | Commissioner Variable 13px 400 | rgb(216, 184, 120) on rgba(0, 0, 0, 0) | 50% | 26 |  | [rest](buttons/119-rest.png) [hover](buttons/119-hover.png) [pressed](buttons/119-pressed.png) [focus](buttons/119-focus.png) |
| 13 | More information `span.info > button.info-icon` | Commissioner Variable 13px 400 | rgb(139, 105, 43) on rgba(0, 0, 0, 0) | 50% | 26 |  | [rest](buttons/151-rest.png) [hover](buttons/151-hover.png) [pressed](buttons/151-pressed.png) [focus](buttons/151-focus.png) |
| 10 | Turn on camera `div.voice-bar-row > button.round.wide`; Share screen `div.voice-bar-row > button.round.wide` | Commissioner Variable 14px 400 | rgb(180, 173, 159) on rgba(0, 0, 0, 0) | 5px | 32 |  | [rest](buttons/072-rest.png) [hover](buttons/072-hover.png) [pressed](buttons/072-pressed.png) [focus](buttons/072-focus.png) |
| 5 | Connection good and stable `span.info > button.signal-icon` | Commissioner Variable 13px 500 | rgb(111, 213, 152) on rgba(0, 0, 0, 0) | 50% | 30 |  | [rest](buttons/069-rest.png) [hover](buttons/069-hover.png) [pressed](buttons/069-pressed.png) [focus](buttons/069-focus.png) |
| 4 | More information `span.info > button.info-icon` | Commissioner Variable 14px 400 | rgb(216, 184, 120) on rgba(0, 0, 0, 0) | 50% | 26 |  | [rest](buttons/121-rest.png) [hover](buttons/121-hover.png) [pressed](buttons/121-pressed.png) [focus](buttons/121-focus.png) |
| 4 | More information `span.info > button.info-icon` | Commissioner Variable 14px 400 | rgb(139, 105, 43) on rgba(0, 0, 0, 0) | 50% | 26 |  | [rest](buttons/153-rest.png) [hover](buttons/153-hover.png) [pressed](buttons/153-pressed.png) [focus](buttons/153-focus.png) |
| 3 | Open full profile `div.pop-head > button.icon-button.pop-expand` | Commissioner Variable 14px 400 | rgb(180, 173, 159) on color(srgb 0.0431373 0.0509804 0.0666667 / 0.55) | 6px | 30 | border | [rest](buttons/031-rest.png) [hover](buttons/031-hover.png) [pressed](buttons/031-pressed.png) [focus](buttons/031-focus.png) |
| 3 | Send message `form.pop-note > button.pop-send` | Commissioner Variable 14px 400 | rgb(11, 13, 17) on rgb(216, 184, 120) | 6px | 38 |  | [rest](buttons/033-rest.png) [hover](buttons/033-hover.png) [pressed](buttons/033-pressed.png) [focus](buttons/033-focus.png) |
| 2 | Copy friend ID `dd > button.icon-button` | Cascadia Mono 14px 400 | rgb(180, 173, 159) on rgba(0, 0, 0, 0) | 6px | 30 | border | [rest](buttons/035-rest.png) [hover](buttons/035-hover.png) [pressed](buttons/035-pressed.png) [focus](buttons/035-focus.png) |
| 1 | Copy the launch option `p.connection-note > button.icon-button` | Commissioner Variable 12px 400 | rgb(180, 173, 159) on rgba(0, 0, 0, 0) | 6px | 30 | border | [rest](buttons/047-rest.png) [hover](buttons/047-hover.png) [pressed](buttons/047-pressed.png) [focus](buttons/047-focus.png) |
| 1 | Hide the people in the call `div.people-row > button.people-toggle` | Commissioner Variable 14px 400 | rgb(214, 207, 194) on rgb(27, 32, 40) | 6px | 22 | border | [rest](buttons/074-rest.png) [hover](buttons/074-hover.png) [pressed](buttons/074-pressed.png) [focus](buttons/074-focus.png) |
| 1 | @everyone cannot be moved `div.role-row.fixed > button.role-grip` | Commissioner Variable 14px 400 | rgb(133, 127, 115) on rgba(0, 0, 0, 0) | 4px | 28 |  | [rest](buttons/093-rest.png) [hover](buttons/093-hover.png) [pressed](buttons/093-pressed.png) [focus](buttons/093-focus.png) |
| 1 | Send message `form.send.composer > button.send-button` | Commissioner Variable 14px 400 | rgb(135, 126, 110) on rgb(226, 218, 203) | 6px | 36 | border | [rest](buttons/128-rest.png) [hover](buttons/128-hover.png) [pressed](buttons/128-pressed.png) [focus](buttons/128-focus.png) |
| 1 | Copy friend ID `dd > button.icon-button` | Cascadia Mono 14px 400 | rgb(92, 84, 71) on rgba(0, 0, 0, 0) | 6px | 30 | border | [rest](buttons/157-rest.png) [hover](buttons/157-hover.png) [pressed](buttons/157-pressed.png) [focus](buttons/157-focus.png) |

## person or card (opens a profile)

| Seen | Example | Font | Colour on background | Radius | Height | Extras | States |
|---|---|---|---|---|---|---|---|
| 104 | Input devices `div.user-bar > button.bar-arrow`; Output devices `div.user-bar > button.bar-arrow` | Commissioner Variable 14px 400 | rgb(133, 127, 115) on rgba(0, 0, 0, 0) | 4px | 30 |  | [rest](buttons/024-rest.png) [hover](buttons/024-hover.png) [pressed](buttons/024-pressed.png) [focus](buttons/024-focus.png) |
| 52 | BobPlaying Destiny 2 · 1 min `div.user-bar > button.user-bar-me`; AnnPlaying Counter-Strike 2 · 1 min `div.user-bar > button.user-bar-me` | Commissioner Variable 14px 400 | rgb(239, 233, 222) on rgba(0, 0, 0, 0) | 6px | 47 |  | [rest](buttons/023-rest.png) [hover](buttons/023-hover.png) [pressed](buttons/023-pressed.png) [focus](buttons/023-focus.png) |
| 36 | Ann `div.msg-head > button.user`; Bob `div.msg-head > button.user` | Commissioner Variable 14px 650 | rgb(239, 233, 222) on rgba(0, 0, 0, 0) | 4px | 21 |  | [rest](buttons/054-rest.png) [hover](buttons/054-hover.png) [pressed](buttons/054-pressed.png) [focus](buttons/054-focus.png) |
| 26 | Input devices `div.user-bar > button.bar-arrow`; Output devices `div.user-bar > button.bar-arrow` | Commissioner Variable 14px 400 | rgb(135, 126, 110) on rgba(0, 0, 0, 0) | 4px | 30 |  | [rest](buttons/013-rest.png) [hover](buttons/013-hover.png) [pressed](buttons/013-pressed.png) [focus](buttons/013-focus.png) |
| 16 | Ann `div.game-card-foot > button.game-card-who`; Bob `div.game-card-foot > button.game-card-who` | Commissioner Variable 15px 650 | rgb(255, 255, 255) on rgba(0, 0, 0, 0) | 0px | 24 |  | [rest](buttons/020-rest.png) [hover](buttons/020-hover.png) [pressed](buttons/020-pressed.png) [focus](buttons/020-focus.png) |
| 13 | AnnPlaying Counter-Strike 2 · 1 min `div.user-bar > button.user-bar-me`; Annanntester#2078 `div.user-bar > button.user-bar-me` | Commissioner Variable 14px 400 | rgb(33, 29, 24) on rgba(0, 0, 0, 0) | 6px | 47 |  | [rest](buttons/012-rest.png) [hover](buttons/012-hover.png) [pressed](buttons/012-pressed.png) [focus](buttons/012-focus.png) |
| 4 | Bobbobtester#8591 · Online `header.chat-head > button.chat-person`; Annanntester#2078 · Online `header.chat-head > button.chat-person` | Commissioner Variable 14px 400 | rgb(239, 233, 222) on rgba(0, 0, 0, 0) | 6px | 40 |  | [rest](buttons/052-rest.png) [hover](buttons/052-hover.png) [pressed](buttons/052-pressed.png) [focus](buttons/052-focus.png) |
| 4 | Open Bob's profile `div.person-panel > button.person-head`; Open Ann's profile `div.person-panel > button.person-head` | Commissioner Variable 14px 400 | rgb(239, 233, 222) on rgba(0, 0, 0, 0) | 0px | 120 |  | [rest](buttons/060-rest.png) [hover](buttons/060-hover.png) [pressed](buttons/060-pressed.png) [focus](buttons/060-focus.png) |
| 4 | Your profile `figure.oculus-person > button.oculus-who`; Ann's profile `figure.oculus-person > button.oculus-who` | Commissioner Variable 14px 400 | rgb(239, 233, 222) on rgba(0, 0, 0, 0) | 50% | 77 |  | [rest](buttons/067-rest.png) [hover](buttons/067-hover.png) [pressed](buttons/067-pressed.png) [focus](buttons/067-focus.png) |
| 3 | SteamCS2 `div.connections[group] > button.connection`; SteamCS2 · Dota 2 `div.connections[group] > button.connection` | Commissioner Variable 14px 400 | rgb(239, 233, 222) on rgb(36, 42, 51) | 6px | 65 | border | [rest](buttons/028-rest.png) [hover](buttons/028-hover.png) [pressed](buttons/028-pressed.png) [focus](buttons/028-focus.png) |
| 3 | Bungie.netLink `div.connections[group] > button.connection`; SteamCS2 `div.connections[group] > button.connection` | Commissioner Variable 14px 400 | rgb(239, 233, 222) on rgb(36, 42, 51) | 6px | 65 | border | [rest](buttons/029-rest.png) [hover](buttons/029-hover.png) [pressed](buttons/029-pressed.png) [focus](buttons/029-focus.png) |
| 2 | Counter-Strike 2Mirage · CompetitiveFor  `div.pop-body > button.pop-glance` | Commissioner Variable 14px 400 | rgb(239, 233, 222) on rgb(36, 42, 51) | 8px | 75 | border | [rest](buttons/032-rest.png) [hover](buttons/032-hover.png) [pressed](buttons/032-pressed.png) [focus](buttons/032-focus.png) |
| 2 | Ann `span.row-title > button.user` | Commissioner Variable 14px 600 | rgb(239, 233, 222) on rgba(0, 0, 0, 0) | 4px | 21 |  | [rest](buttons/065-rest.png) [hover](buttons/065-hover.png) [pressed](buttons/065-pressed.png) [focus](buttons/065-focus.png) |
| 1 | SteamCS2 `div.connections[group] > button.connection` | Commissioner Variable 14px 400 | rgb(239, 233, 222) on rgb(36, 42, 51) | 6px | 64 | border | [rest](buttons/039-rest.png) [hover](buttons/039-hover.png) [pressed](buttons/039-pressed.png) [focus](buttons/039-focus.png) |
| 1 | Bungie.netLink `div.connections[group] > button.connection` | Commissioner Variable 14px 400 | rgb(239, 233, 222) on rgb(36, 42, 51) | 6px | 64 | border | [rest](buttons/040-rest.png) [hover](buttons/040-hover.png) [pressed](buttons/040-pressed.png) [focus](buttons/040-focus.png) |
| 1 | Destiny 2Raid · Salvation's EdgeFor 2 mi `div.person-body > button.pop-glance` | Commissioner Variable 14px 400 | rgb(239, 233, 222) on rgb(36, 42, 51) | 8px | 85 | border | [rest](buttons/061-rest.png) [hover](buttons/061-hover.png) [pressed](buttons/061-pressed.png) [focus](buttons/061-focus.png) |
| 1 | Use this GIF `div.gif-tile > button.gif-use` | Commissioner Variable 14px 400 | rgb(239, 233, 222) on rgba(0, 0, 0, 0) | 0px | 137 |  | [rest](buttons/104-rest.png) [hover](buttons/104-hover.png) [pressed](buttons/104-pressed.png) [focus](buttons/104-focus.png) |

## toggle (switch, checkbox)

| Seen | Example | Font | Colour on background | Radius | Height | Extras | States |
|---|---|---|---|---|---|---|---|
| 31 | (icon) `label.check-row > input[switch]`; Counter-Strike 2 live match details `div.connection-game-head > input[switch]` | Commissioner Variable 14px 400 | rgb(239, 233, 222) on rgb(240, 217, 166) | 10px | 20 | border | [rest](buttons/027-rest.png) [hover](buttons/027-hover.png) [pressed](buttons/027-pressed.png) [focus](buttons/027-focus.png) |
| 16 | (icon) `label.check-row > input[switch]`; Dota 2 live match details `div.connection-game-head > input[switch]` | Commissioner Variable 14px 400 | rgb(239, 233, 222) on rgb(43, 49, 59) | 10px | 20 | border | [rest](buttons/030-rest.png) [hover](buttons/030-hover.png) [pressed](buttons/030-pressed.png) [focus](buttons/030-focus.png) |
| 8 | (icon) `label.check-row > input[switch]` | Commissioner Variable 13px 400 | rgb(214, 207, 194) on rgb(240, 217, 166) | 10px | 20 | border | [rest](buttons/123-rest.png) [hover](buttons/123-hover.png) [pressed](buttons/123-pressed.png) [focus](buttons/123-focus.png) |
| 8 | (icon) `label.check-row > input[switch]` | Commissioner Variable 13px 400 | rgb(58, 52, 44) on rgb(111, 82, 28) | 10px | 20 | border | [rest](buttons/155-rest.png) [hover](buttons/155-hover.png) [pressed](buttons/155-pressed.png) [focus](buttons/155-focus.png) |
| 5 | Mute `div.context-section[group] > button.context-item.has-check[menuitemcheckbox]`; Disable video `div.context-section[group] > button.context-item.has-check[menuitemcheckbox]` | Commissioner Variable 13px 400 | rgb(214, 207, 194) on rgba(0, 0, 0, 0) | 4px | 34 |  | [rest](buttons/090-rest.png) [hover](buttons/090-hover.png) [pressed](buttons/090-pressed.png) [focus](buttons/090-focus.png) |
| 4 | (icon) `label.check-row > input[switch]` | Commissioner Variable 14px 400 | rgb(33, 29, 24) on rgb(216, 207, 190) | 10px | 20 | border | [rest](buttons/143-rest.png) [hover](buttons/143-hover.png) [pressed](buttons/143-pressed.png) [focus](buttons/143-focus.png) |
| 4 | (icon) `label.check-row > input[switch]` | Commissioner Variable 14px 400 | rgb(33, 29, 24) on rgb(111, 82, 28) | 10px | 20 | border | [rest](buttons/144-rest.png) [hover](buttons/144-hover.png) [pressed](buttons/144-pressed.png) [focus](buttons/144-focus.png) |
| 3 | (icon) `label.check-row > input[switch]` | Commissioner Variable 13px 400 | rgb(214, 207, 194) on rgb(43, 49, 59) | 10px | 20 | border | [rest](buttons/118-rest.png) [hover](buttons/118-hover.png) [pressed](buttons/118-pressed.png) [focus](buttons/118-focus.png) |
| 3 | (icon) `label.check-row > input[switch]` | Commissioner Variable 13px 400 | rgb(58, 52, 44) on rgb(216, 207, 190) | 10px | 20 | border | [rest](buttons/150-rest.png) [hover](buttons/150-hover.png) [pressed](buttons/150-pressed.png) [focus](buttons/150-focus.png) |
| 1 | (icon) `label.check-row.inline > input[switch]` | Commissioner Variable 12.5px 400 | rgb(239, 233, 222) on rgb(43, 49, 59) | 10px | 20 | border | [rest](buttons/106-rest.png) [hover](buttons/106-hover.png) [pressed](buttons/106-pressed.png) [focus](buttons/106-focus.png) |
| 1 | (icon) `label.check-row.inline > input[switch]` | Commissioner Variable 12.5px 400 | rgb(33, 29, 24) on rgb(216, 207, 190) | 10px | 20 | border | [rest](buttons/135-rest.png) [hover](buttons/135-hover.png) [pressed](buttons/135-pressed.png) [focus](buttons/135-focus.png) |

## title bar control

| Seen | Example | Font | Colour on background | Radius | Height | Extras | States |
|---|---|---|---|---|---|---|---|
| 186 | Minimize `div.window-buttons > button`; Maximize `div.window-buttons > button` | Commissioner Variable 12px 500 | rgb(180, 173, 159) on rgba(0, 0, 0, 0) | 0px | 36 |  | [rest](buttons/001-rest.png) [hover](buttons/001-hover.png) [pressed](buttons/001-pressed.png) [focus](buttons/001-focus.png) |
| 104 | Back `span.titlebar-nav > button`; Forward `span.titlebar-nav > button` | Commissioner Variable 12px 500 | rgb(180, 173, 159) on rgba(0, 0, 0, 0) | 4px | 28 |  | [rest](buttons/014-rest.png) [hover](buttons/014-hover.png) [pressed](buttons/014-pressed.png) [focus](buttons/014-focus.png) |
| 52 | Find a friend, group, server or channelC `header.titlebar > button.titlebar-find` | Commissioner Variable 13px 500 | rgb(133, 127, 115) on rgb(20, 24, 30) | 4px | 26 | border | [rest](buttons/015-rest.png) [hover](buttons/015-hover.png) [pressed](buttons/015-pressed.png) [focus](buttons/015-focus.png) |
| 39 | Minimize `div.window-buttons > button`; Maximize `div.window-buttons > button` | Commissioner Variable 12px 500 | rgb(92, 84, 71) on rgba(0, 0, 0, 0) | 0px | 36 |  | [rest](buttons/006-rest.png) [hover](buttons/006-hover.png) [pressed](buttons/006-pressed.png) [focus](buttons/006-focus.png) |
| 26 | Back `span.titlebar-nav > button`; Forward `span.titlebar-nav > button` | Commissioner Variable 12px 500 | rgb(92, 84, 71) on rgba(0, 0, 0, 0) | 4px | 28 |  | [rest](buttons/004-rest.png) [hover](buttons/004-hover.png) [pressed](buttons/004-pressed.png) [focus](buttons/004-focus.png) |
| 13 | Find a friend, group, server or channelC `header.titlebar > button.titlebar-find` | Commissioner Variable 13px 500 | rgb(135, 126, 110) on rgb(239, 233, 221) | 4px | 26 | border | [rest](buttons/005-rest.png) [hover](buttons/005-hover.png) [pressed](buttons/005-pressed.png) [focus](buttons/005-focus.png) |
| 1 | In a call in Ann `header.titlebar > button.titlebar-call` | Commissioner Variable 12px 500 | rgb(147, 168, 210) on rgba(0, 0, 0, 0) | 11px | 22 | border | [rest](buttons/073-rest.png) [hover](buttons/073-hover.png) [pressed](buttons/073-pressed.png) [focus](buttons/073-focus.png) |

## primary button

| Seen | Example | Font | Colour on background | Radius | Height | Extras | States |
|---|---|---|---|---|---|---|---|
| 35 | Enter Eleusinia `div.form-actions > button.button.primary`; Add friend `header.page-head > button.button.primary.page-action` | Commissioner Variable 14px 600 | rgb(27, 20, 8) on rgb(216, 184, 120) | 5px | 36 | clip-path, border | [rest](buttons/003-rest.png) [hover](buttons/003-hover.png) [pressed](buttons/003-pressed.png) [focus](buttons/003-focus.png) |
| 13 | Add friend `header.page-head > button.button.primary.page-action`; Save `div.settings-row > button.button.primary` | Commissioner Variable 14px 600 | rgb(251, 246, 234) on rgb(139, 105, 43) | 5px | 36 | clip-path, border | [rest](buttons/011-rest.png) [hover](buttons/011-hover.png) [pressed](buttons/011-pressed.png) [focus](buttons/011-focus.png) |
| 1 | Message `div.card-actions > button.button.primary` | Commissioner Variable 14px 600 | rgb(20, 17, 12) on rgb(211, 162, 105) | 5px | 36 | clip-path, border | [rest](buttons/037-rest.png) [hover](buttons/037-hover.png) [pressed](buttons/037-pressed.png) [focus](buttons/037-focus.png) |
| 1 | Message `div.card-actions > button.button.primary` | Commissioner Variable 14px 600 | rgb(20, 17, 12) on oklab(0.682796 -0.0417617 -0.0105419) | 5px | 36 | clip-path, border | [rest](buttons/049-rest.png) [hover](buttons/049-hover.png) [pressed](buttons/049-pressed.png) [focus](buttons/049-focus.png) |
| 1 | Set status `div.settings-row > button.button.primary` | Commissioner Variable 12.5px 600 | rgb(27, 20, 8) on rgb(216, 184, 120) | 5px | 36 | clip-path, border | [rest](buttons/107-rest.png) [hover](buttons/107-hover.png) [pressed](buttons/107-pressed.png) [focus](buttons/107-focus.png) |
| 1 | Set status `div.settings-row > button.button.primary` | Commissioner Variable 12.5px 600 | rgb(251, 246, 234) on rgb(139, 105, 43) | 5px | 36 | clip-path, border | [rest](buttons/136-rest.png) [hover](buttons/136-hover.png) [pressed](buttons/136-pressed.png) [focus](buttons/136-focus.png) |
| 1 | Edit profile `div.card-actions > button.button.primary` | Commissioner Variable 14px 600 | rgb(20, 17, 12) on oklab(0.65974 0.0805682 0.01627) | 5px | 36 | clip-path, border | [rest](buttons/158-rest.png) [hover](buttons/158-hover.png) [pressed](buttons/158-pressed.png) [focus](buttons/158-focus.png) |

## slider

| Seen | Example | Font | Colour on background | Radius | Height | Extras | States |
|---|---|---|---|---|---|---|---|
| 5 | (icon) `div.setting > input` | Commissioner Variable 13px 400 | rgb(214, 207, 194) on rgb(59, 59, 59) | 0px | 16 |  | [rest](buttons/117-rest.png) [hover](buttons/117-hover.png) [pressed](buttons/117-pressed.png) [focus](buttons/117-focus.png) |
| 5 | (icon) `div.setting > input` | Commissioner Variable 13px 400 | rgb(58, 52, 44) on rgb(255, 255, 255) | 0px | 16 |  | [rest](buttons/149-rest.png) [hover](buttons/149-hover.png) [pressed](buttons/149-pressed.png) [focus](buttons/149-focus.png) |
| 4 | (icon) `label.theme-slider > input` | Commissioner Variable 14px 400 | rgb(239, 233, 222) on rgb(59, 59, 59) | 0px | 16 |  | [rest](buttons/044-rest.png) [hover](buttons/044-hover.png) [pressed](buttons/044-pressed.png) [focus](buttons/044-focus.png) |
| 4 | Volume for Ann `label.person-volume > input`; Volume for Bob `label.person-volume > input` | Commissioner Variable 14px 400 | rgb(180, 173, 159) on rgb(59, 59, 59) | 0px | 16 |  | [rest](buttons/066-rest.png) [hover](buttons/066-hover.png) [pressed](buttons/066-pressed.png) [focus](buttons/066-focus.png) |
| 2 | (icon) `label.weave-tones > input` | Commissioner Variable 12.5px 400 | rgb(133, 127, 115) on rgb(59, 59, 59) | 0px | 16 |  | [rest](buttons/101-rest.png) [hover](buttons/101-hover.png) [pressed](buttons/101-pressed.png) [focus](buttons/101-focus.png) |
| 1 | (icon) `div.setting.mic-gate > input` | Commissioner Variable 13px 400 | rgb(214, 207, 194) on rgba(0, 0, 0, 0) | 0px | 16 |  | [rest](buttons/120-rest.png) [hover](buttons/120-hover.png) [pressed](buttons/120-pressed.png) [focus](buttons/120-focus.png) |
| 1 | (icon) `div.setting.mic-gate > input` | Commissioner Variable 13px 400 | rgb(58, 52, 44) on rgba(0, 0, 0, 0) | 0px | 16 |  | [rest](buttons/152-rest.png) [hover](buttons/152-hover.png) [pressed](buttons/152-pressed.png) [focus](buttons/152-focus.png) |

## select (dropdown)

| Seen | Example | Font | Colour on background | Radius | Height | Extras | States |
|---|---|---|---|---|---|---|---|
| 5 | System defaultFake Audio Output 1Fake Au `label.field-label > select`; System defaultFake Audio Input 1Fake Aud `label.field-label > select` | Commissioner Variable 12.5px 600 | rgb(133, 127, 115) on rgb(16, 19, 24) | 6px | 36 | border | [rest](buttons/116-rest.png) [hover](buttons/116-hover.png) [pressed](buttons/116-pressed.png) [focus](buttons/116-focus.png) |
| 5 | System defaultFake Audio Output 1Fake Au `label.field-label > select`; System defaultFake Audio Input 1Fake Aud `label.field-label > select` | Commissioner Variable 12.5px 600 | rgb(135, 126, 110) on rgb(231, 224, 209) | 6px | 36 | border | [rest](buttons/148-rest.png) [hover](buttons/148-hover.png) [pressed](buttons/148-pressed.png) [focus](buttons/148-focus.png) |
| 4 | 256.0 MB512.0 MB1.00 GB2.00 GB5.00 GB `div.settings-row > select` | Commissioner Variable 14px 400 | rgb(239, 233, 222) on rgb(16, 19, 24) | 6px | 36 | border | [rest](buttons/122-rest.png) [hover](buttons/122-hover.png) [pressed](buttons/122-pressed.png) [focus](buttons/122-focus.png) |
| 4 | 256.0 MB512.0 MB1.00 GB2.00 GB5.00 GB `div.settings-row > select` | Commissioner Variable 14px 400 | rgb(33, 29, 24) on rgb(231, 224, 209) | 6px | 36 | border | [rest](buttons/154-rest.png) [hover](buttons/154-hover.png) [pressed](buttons/154-pressed.png) [focus](buttons/154-focus.png) |
| 1 | Remove member…BobCy `label.add-member > select` | Commissioner Variable 14px 400 | rgb(180, 173, 159) on rgb(16, 19, 24) | 6px | 32 | border | [rest](buttons/078-rest.png) [hover](buttons/078-hover.png) [pressed](buttons/078-pressed.png) [focus](buttons/078-focus.png) |
| 1 | Don't clearClear after 30 minutesClear a `div.settings-row > select` | Commissioner Variable 12.5px 600 | rgb(239, 233, 222) on rgb(16, 19, 24) | 5px | 34 | border | [rest](buttons/105-rest.png) [hover](buttons/105-hover.png) [pressed](buttons/105-pressed.png) [focus](buttons/105-focus.png) |
| 1 | Don't clearClear after 30 minutesClear a `div.settings-row > select` | Commissioner Variable 12.5px 600 | rgb(33, 29, 24) on rgb(231, 224, 209) | 5px | 34 | border | [rest](buttons/134-rest.png) [hover](buttons/134-hover.png) [pressed](buttons/134-pressed.png) [focus](buttons/134-focus.png) |

## secondary button

| Seen | Example | Font | Colour on background | Radius | Height | Extras | States |
|---|---|---|---|---|---|---|---|
| 30 | GIF `div > button.button`; Store page `div.activity-actions > button.button` | Commissioner Variable 14px 500 | rgb(239, 233, 222) on rgb(43, 49, 59) | 5px | 36 | border | [rest](buttons/002-rest.png) [hover](buttons/002-hover.png) [pressed](buttons/002-pressed.png) [focus](buttons/002-focus.png) |
| 17 | Add a game… `div.activity-extra > button.button`; Set `div.hotkey > button.button` | Commissioner Variable 14px 500 | rgb(33, 29, 24) on rgb(216, 207, 190) | 5px | 36 | border | [rest](buttons/145-rest.png) [hover](buttons/145-hover.png) [pressed](buttons/145-pressed.png) [focus](buttons/145-focus.png) |
| 16 | Message `div.game-card-foot > button.button` | Commissioner Variable 14px 500 | rgb(255, 255, 255) on rgba(255, 255, 255, 0.14) | 5px | 30 | border | [rest](buttons/021-rest.png) [hover](buttons/021-hover.png) [pressed](buttons/021-pressed.png) [focus](buttons/021-focus.png) |
| 1 | Edit profile `div.settings-row > button.button` | Commissioner Variable 12.5px 500 | rgb(239, 233, 222) on rgb(43, 49, 59) | 5px | 36 | border | [rest](buttons/109-rest.png) [hover](buttons/109-hover.png) [pressed](buttons/109-pressed.png) [focus](buttons/109-focus.png) |
| 1 | Edit profile `div.settings-row > button.button` | Commissioner Variable 12.5px 500 | rgb(33, 29, 24) on rgb(216, 207, 190) | 5px | 36 | border | [rest](buttons/138-rest.png) [hover](buttons/138-hover.png) [pressed](buttons/138-pressed.png) [focus](buttons/138-focus.png) |

## quiet button

| Seen | Example | Font | Colour on background | Radius | Height | Extras | States |
|---|---|---|---|---|---|---|---|
| 13 | Unlink `div.connection-panel > button.button.subtle`; Show in folder `div.file-card > button.button.subtle` | Commissioner Variable 14px 500 | rgb(180, 173, 159) on rgba(0, 0, 0, 0) | 5px | 36 | border | [rest](buttons/048-rest.png) [hover](buttons/048-hover.png) [pressed](buttons/048-pressed.png) [focus](buttons/048-focus.png) |
| 3 | Block `div.pop-body > button.link-button.pop-block` | Commissioner Variable 14px 400 | rgb(239, 233, 222) on rgba(0, 0, 0, 0) | 0px | 21 |  | [rest](buttons/034-rest.png) [hover](buttons/034-hover.png) [pressed](buttons/034-pressed.png) [focus](buttons/034-focus.png) |
| 2 | We compared it: mark as verified `dd.key-verify > button.button.subtle` | Cascadia Mono 14px 500 | rgb(141, 180, 122) on rgba(0, 0, 0, 0) | 5px | 23 | border | [rest](buttons/036-rest.png) [hover](buttons/036-hover.png) [pressed](buttons/036-pressed.png) [focus](buttons/036-focus.png) |
| 1 | Pin a game or achievement `div.show-slots > button.button.subtle` | Commissioner Variable 12.5px 500 | rgb(180, 173, 159) on rgba(0, 0, 0, 0) | 5px | 36 | border | [rest](buttons/108-rest.png) [hover](buttons/108-hover.png) [pressed](buttons/108-pressed.png) [focus](buttons/108-focus.png) |
| 1 | Pin a game or achievement `div.show-slots > button.button.subtle` | Commissioner Variable 12.5px 500 | rgb(92, 84, 71) on rgba(0, 0, 0, 0) | 5px | 36 | border | [rest](buttons/137-rest.png) [hover](buttons/137-hover.png) [pressed](buttons/137-pressed.png) [focus](buttons/137-focus.png) |

## destructive button

| Seen | Example | Font | Colour on background | Radius | Height | Extras | States |
|---|---|---|---|---|---|---|---|
| 6 | Remove friend `div.card-actions > button.button.danger`; Delete channel `div.settings-row.save-bar > button.button.danger` | Commissioner Variable 14px 500 | rgb(255, 255, 255) on rgb(226, 102, 78) | 5px | 36 | clip-path, border | [rest](buttons/038-rest.png) [hover](buttons/038-hover.png) [pressed](buttons/038-pressed.png) [focus](buttons/038-focus.png) |
| 5 | Disconnect `div.voice-bar-head > button.icon-button.leave` | Commissioner Variable 14px 400 | rgb(226, 102, 78) on rgba(0, 0, 0, 0) | 6px | 30 | border | [rest](buttons/071-rest.png) [hover](buttons/071-hover.png) [pressed](buttons/071-pressed.png) [focus](buttons/071-focus.png) |
| 4 | Delete channel `div.context-section[group] > button.context-item.danger[menuitem]`; Remove friend `div.context-section[group] > button.context-item.danger[menuitem]` | Commissioner Variable 13px 400 | rgb(240, 163, 176) on rgba(0, 0, 0, 0) | 4px | 34 |  | [rest](buttons/088-rest.png) [hover](buttons/088-hover.png) [pressed](buttons/088-pressed.png) [focus](buttons/088-focus.png) |
| 3 | Delete `div.settings-row > button.button.danger` | Commissioner Variable 14px 500 | rgb(255, 255, 255) on rgb(176, 63, 43) | 5px | 36 | clip-path, border | [rest](buttons/156-rest.png) [hover](buttons/156-hover.png) [pressed](buttons/156-pressed.png) [focus](buttons/156-focus.png) |

## menu item

| Seen | Example | Font | Colour on background | Radius | Height | Extras | States |
|---|---|---|---|---|---|---|---|
| 9 | Join with an invite `div.context-section[group] > button.context-item[menuitem]`; Create a group `div.context-section[group] > button.context-item[menuitem]` | Commissioner Variable 13px 400 | rgb(214, 207, 194) on rgba(0, 0, 0, 0) | 4px | 34 |  | [rest](buttons/082-rest.png) [hover](buttons/082-hover.png) [pressed](buttons/082-pressed.png) [focus](buttons/082-focus.png) |
| 4 | 15 minutes `div.context-section[group] > button.context-item.nested[menuitem]`; 1 hour `div.context-section[group] > button.context-item.nested[menuitem]` | Commissioner Variable 13px 400 | rgb(214, 207, 194) on rgba(0, 0, 0, 0) | 4px | 34 |  | [rest](buttons/087-rest.png) [hover](buttons/087-hover.png) [pressed](buttons/087-pressed.png) [focus](buttons/087-focus.png) |
| 2 | Create a server `div.context-section[group] > button.context-item[menuitem]`; Profile `div.context-section[group] > button.context-item[menuitem]` | Commissioner Variable 13px 400 | rgb(239, 233, 222) on rgb(36, 42, 51) | 4px | 34 | shadow | [rest](buttons/081-rest.png) [hover](buttons/081-hover.png) [pressed](buttons/081-pressed.png) [focus](buttons/081-focus.png) |

## chip and notice

| Seen | Example | Font | Colour on background | Radius | Height | Extras | States |
|---|---|---|---|---|---|---|---|
| 8 | Ann came online `div.notices[status] > button.notice`; Ann started playing Counter-Strike 2 `div.notices[status] > button.notice.game` | Commissioner Variable 13px 400 | rgb(180, 173, 159) on rgb(20, 24, 30) | 8px | 40 | shadow, border |  |
| 4 | Private · direct `span.keep > button.keep-chip` | Commissioner Variable 12.5px 600 | rgb(141, 180, 122) on color(srgb 0.552941 0.705882 0.478431 / 0.13) | 13px | 26 | border | [rest](buttons/053-rest.png) [hover](buttons/053-hover.png) [pressed](buttons/053-pressed.png) [focus](buttons/053-focus.png) |

## picture or preview (opens it)

| Seen | Example | Font | Colour on background | Radius | Height | Extras | States |
|---|---|---|---|---|---|---|---|
| 3 | View red.png `figure.msg-image > button.image-button` | Commissioner Variable 14px 400 | rgb(239, 233, 222) on rgba(0, 0, 0, 0) | 6px | 48 |  | [rest](buttons/055-rest.png) [hover](buttons/055-hover.png) [pressed](buttons/055-pressed.png) [focus](buttons/055-focus.png) |
| 2 | Open A page about fog `div.link-card.with-image > button.link-image` | Commissioner Variable 14px 400 | rgb(239, 233, 222) on rgba(0, 0, 0, 0) | 0px | 76 |  | [rest](buttons/058-rest.png) [hover](buttons/058-hover.png) [pressed](buttons/058-pressed.png) [focus](buttons/058-focus.png) |

## link

| Seen | Example | Font | Colour on background | Radius | Height | Extras | States |
|---|---|---|---|---|---|---|---|
| 3 | http://127.0.0.1:50584/fog `p.msg-text > a.msg-link` | Commissioner Variable 14px 400 | rgb(239, 233, 222) on rgba(0, 0, 0, 0) | 0px | 17 |  | [rest](buttons/056-rest.png) [hover](buttons/056-hover.png) [pressed](buttons/056-pressed.png) [focus](buttons/056-focus.png) |
| 2 | A page about fog `div.link-text > a.link-title` | Commissioner Variable 14px 600 | rgb(239, 233, 222) on rgba(0, 0, 0, 0) | 0px | 26 |  | [rest](buttons/057-rest.png) [hover](buttons/057-hover.png) [pressed](buttons/057-pressed.png) [focus](buttons/057-focus.png) |

## inline edit (rename in place)

| Seen | Example | Font | Colour on background | Radius | Height | Extras | States |
|---|---|---|---|---|---|---|---|
| 1 | The Trio `h1 > button.group-name` | Commissioner Variable 24px 600 | rgb(239, 233, 222) on rgba(0, 0, 0, 0) | 4px | 31 | border | [rest](buttons/077-rest.png) [hover](buttons/077-hover.png) [pressed](buttons/077-pressed.png) [focus](buttons/077-focus.png) |
