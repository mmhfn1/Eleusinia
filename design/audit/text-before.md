# Text inventory (before)

From `text-before.json`: every visible text element on every screen the smoke run stops at (64 screens, Ann, Bob and Cy's windows, Ink and Ivory), read with `getComputedStyle`. Screen-reader-only text (215) is left out of the counts.

| | before |
|---|---|
| Text elements | 3220 |
| Families | 4: Commissioner Variable, Cascadia Mono, Bodoni Moda Variable, Alegreya Sans |
| Sizes | 17: 10.5px, 11px, 11.5px, 12px, 12.5px, 13px, 13.5px, 14px, 15px, 16px, 17px, 19px, 20px, 22px, 24px, 26px, 40px |
| Weights | 6: 400, 500, 550, 600, 650, 700 |
| Family, size and weight combinations | 54 |
| Line heights | 37 |
| Letter spacings | 10 |
| Text colours | 27 |

## Every combination

| Count | Family, size, weight | Line heights | Jobs it does | Where (elements) |
|---|---|---|---|---|
| 463 | Commissioner Variable 14px 400 | 18.2px, 21px, 20.3px | body text (messages, about lines, toasts); menu and navigation item; code, keys and IDs (mono); button label; input text and placeholders; secondary line (under a name, meta); link; person or row name (lists) | `div.settings-index-group > button.settings-index-row` 207, `button.channel > span.channel-name` 73, `div.msg-main > p.msg-text` 70, `label.check-row > span` 38 |
| 433 | Commissioner Variable 12px 400 | 15.6px, 17.4px, 18px | code, keys and IDs (mono); group label (quiet heading above a list or field); secondary line (under a name, meta); person or row name (lists); big number (score, light level); hint, help and empty-state text; timestamp and delivery state; body text (messages, about lines, toasts) | `span.row-text > span.row-sub` 224, `div.msg-head > time` 36, `section.friend-id > p.row-sub` 35, `div.preview-body > span.row-sub` 23 |
| 301 | Commissioner Variable 13px 400 | 19.5px, 18.2px | hint, help and empty-state text; secondary line (under a name, meta); badge count; body text (messages, about lines, toasts); menu and navigation item | `h2.shelf-title > span` 82, `nav.settings-nav > button.settings-page` 35, `header.page-head > span.page-sub` 33, `div.preview-body > p.preview-about` 23 |
| 267 | Commissioner Variable 14px 500 | 21px | button label; person or row name (lists) | `span.row-text > span.row-title` 161, `div.settings-row > button.button` 17, `div.game-card-foot > button.button` 16, `span.row-line > span.row-title` 8 |
| 235 | Commissioner Variable 12.5px 600 | 18.75px, 17.5px | group label (quiet heading above a list or field); badge count; section heading | `div.settings-index-group > span.side-cat` 46, `section.dms > div.side-cat` 40, `section.friend-id > h2` 35, `section > h2` 25 |
| 163 | Commissioner Variable 14px 600 | 21px | button label; link; person or row name (lists) | `span.row-title > span.user` 71, `header.page-head > button.button.primary.page-action` 33, `div.theme-cards[radiogroup] > button.theme-card[radio]` 18, `span.row-title.audit-line > b` 10 |
| 158 | Commissioner Variable 13px 500 | 13px, 19.5px | screen title; group label (quiet heading above a list or field); input text and placeholders; menu and navigation item; body text (messages, about lines, toasts); person or row name (lists) | `header.titlebar > span.titlebar-place` 69, `header.titlebar > button.titlebar-find` 65, `label.field-label > input` 8, `div.signal.good > span.signal-text` 5 |
| 142 | Commissioner Variable 15px 650 | 22.5px, 21px | screen title; section heading; person name, large (cards) | `aside.sidebar.side.home-column > header.side-title` 35, `section.people-list > h2.shelf-title` 33, `section.offline.people-list > h2.shelf-title` 33, `section.playing-now > h2.shelf-title` 16 |
| 87 | Commissioner Variable 12px 500 | 18px, 12px, 16.8px | secondary line (under a name, meta); person or row name (lists); menu and navigation item; badge count | `span.row-sub > span.activity-line` 40, `span.activity-line > b` 40, `div.hotkey > kbd.unset` 6, `header.titlebar > button.titlebar-call` 1 |
| 83 | Commissioner Variable 12px 600 | 18px, 12px | group label (quiet heading above a list or field); badge count; person or row name (lists); button label | `span.row-title > span.row-sub` 32, `div.game-card-top > span.game-card-game` 16, `div.day-rule[separator] > b` 14, `div.game-card-top > span.game-card-live` 7 |
| 71 | Commissioner Variable 14px 550 | 21px | person or row name (lists) | `span.row-text > span.row-title` 36, `button.side-row > span.row-title` 35 |
| 66 | Commissioner Variable 12.5px 400 | 18.75px | secondary line (under a name, meta); person or row name (lists); group label (quiet heading above a list or field); input text and placeholders | `div.game-card-line > span.activity-line` 16, `span.activity-line > b` 16, `div.activity-body > p.activity-kicker` 11, `div.glance-text > span.glance-place` 7 |
| 65 | Commissioner Variable 11px 500 | 11px | badge count | `button.titlebar-find > kbd` 65 |
| 65 | Commissioner Variable 22px 650 | 25.3px, 30.8px | big number (score, light level); section heading | `section.settings-section > h2` 49, `div.game-card-bottom > div.game-card-score` 16 |
| 63 | Commissioner Variable 17px 650 | 20.4px | screen title | `header.page-head > h1` 33, `header.chat-head > h1` 25, `span.row-text > span.chat-title` 4, `div.row-text > h1` 1 |
| 47 | Commissioner Variable 11px 400 | 16.5px | group label (quiet heading above a list or field); timestamp and delivery state; badge count | `div.range-ends > span` 20, `div.msg-main > span.msg-status.delivered` 11, `div > dt` 7, `label.person-volume > span.person-volume-pct` 4 |
| 42 | Bodoni Moda Variable 15px 400 italic | 19.5px | group label (quiet heading above a list or field) | `section.play-days > h3` 36, `label.theme-slider > span.theme-label` 4, `div.theme-edit > span.theme-label` 1, `div > span.theme-label` 1 |
| 42 | Alegreya Sans 13px 500 | 16.9px | group label (quiet heading above a list or field); secondary line (under a name, meta) | `span.server-title > span.server-count` 25, `h3 > span.play-sum` 13, `span.theme-label > output` 4 |
| 41 | Commissioner Variable 13px 600 | 19.5px | person or row name (lists); button label | `span.notice-text > b` 15, `label > b` 12, `div.segmented[radiogroup] > button[radio]` 9, `div.segmented[tablist] > button[tab]` 3 |
| 39 | Cascadia Mono 12px 400 | 18px, 16.8px | code, keys and IDs (mono) | `p.row-sub > span.tail` 35, `dl.identity > dd.key-hint` 2, `p.connection-note > code` 1, `button.role-pick > span.tail` 1 |
| 36 | Commissioner Variable 14px 650 | 21px | person or row name (lists) | `div.msg-head > button.user` 36 |
| 35 | Cascadia Mono 15px 600 | 19.5px | code, keys and IDs (mono) | `div.id-plate > b` 35 |
| 33 | Commissioner Variable 15px 400 | 22.5px | input text and placeholders | `div.field.with-icon > input` 33 |
| 26 | Bodoni Moda Variable 14px 400 italic | 18.9px | hint, help and empty-state text | `section.play-days > p.play-empty` 26 |
| 25 | Commissioner Variable 22px 600 | 26.4px, 33px | screen title; empty-state title; big number (score, light level) | `div.empty-state > p.empty-title` 16, `div.settings-pane > h1` 5, `div.destiny-guardian > b.destiny-light` 3, `form.profile.panel > h1` 1 |
| 25 | Bodoni Moda Variable 22px 600 | 25.3px | server name on its banner | `span.server-title > span.server-name` 25 |
| 23 | Commissioner Variable 20px 600 | 24px | screen title | `nav.settings-index > h1` 23 |
| 23 | Commissioner Variable 19px 600 | 28.5px | person name, large (cards) | `div.preview-body > b.preview-name` 23 |
| 20 | Commissioner Variable 11px 600 | 16.5px | button label; person or row name (lists) | `button.weave-kind[radio] > span` 14, `label.weave-kind.upload[radio] > span` 2, `button.weave-kind.upload > span` 2, `button.weave-kind.none[radio] > span` 1 |
| 10 | Commissioner Variable 26px 600 | 31.2px, 39px | person name, large (cards); big number (score, light level) | `div.card > h1` 6, `span.cs2-team.ct.ours > b` 2, `span.cs2-team.t > b` 2 |
| 8 | Commissioner Variable 13.5px 600 | 20.25px | secondary line (under a name, meta) | `div.glance-text > span.glance-game` 8 |
| 7 | Commissioner Variable 17px 700 | 25.5px | person name, large (cards) | `div.activity-body > h3` 7 |
| 6 | Commissioner Variable 15px 600 | 15px | wordmark | `div[status] > span.splash-word` 6 |
| 6 | Alegreya Sans 13.5px 400 | 18.225px | tooltip and popover; hint, help and empty-state text | `span > span` 4, `div.theme-edit > p.theme-hint` 1, `div > p.theme-hint` 1 |
| 6 | Commissioner Variable 11.5px 600 | 17.25px | button label | `button[radio] > span` 6 |
| 6 | Commissioner Variable 12.5px 500 | 18.75px | group label (quiet heading above a list or field) | `div.show-slots > button.button.subtle` 2, `span.row-text > span.row-title` 2, `div.settings-row > button.button` 2 |
| 5 | Commissioner Variable 22px 700 | 33px | big number (score, light level) | `section.glance > span.glance-score.ahead` 5 |
| 5 | Commissioner Variable 22px 400 | 33px | big number (score, light level) | `span.glance-score.ahead > span` 5 |
| 5 | Commissioner Variable 16px 600 | 24px, 19.2px | person name, large (cards); server name on its banner | `div.cs2-head > span.cs2-map` 3, `div.banner-preview > span.server-name` 2 |
| 4 | Commissioner Variable 20px 650 | 30px | person name, large (cards) | `div.person-body > div.person-name` 4 |
| 4 | Commissioner Variable 14px 700 | 21px | person or row name (lists) | `span.row-text > span.row-title` 2, `button.channel > span.channel-name` 2 |
| 4 | Commissioner Variable 11px 700 | 16.5px, 18px | badge count | `button.side-row.dm-row > span.side-count.dm-count` 2, `button.channel > span.channel-count` 2 |
| 4 | Commissioner Variable 10.5px 700 | 14px | badge count | `button.rail-item.rail-group > span.rail-count` 2, `button.rail-item.rail-group.rail-server > span.rail-count` 2 |
| 3 | Commissioner Variable 19px 650 | 21.85px | person name, large (cards) | `div.pop-body > h2.pop-name` 3 |
| 3 | Cascadia Mono 14px 600 | 21px | code, keys and IDs (mono) | `dd > b` 3 |
| 3 | Cascadia Mono 12px 600 | 18px | code, keys and IDs (mono) | `dd > b.tail` 3 |
| 3 | Commissioner Variable 17px 600 | 25.5px | person name, large (cards) | `div.destiny-activity > span.destiny-activity-name` 3 |
| 2 | Cascadia Mono 13px 400 | 19.5px | code, keys and IDs (mono) | `span.cs2-mid > span.cs2-clock` 2 |
| 2 | Cascadia Mono 14px 500 | 21px | code, keys and IDs (mono) | `dd.key-verify > button.button.subtle` 2 |
| 1 | Commissioner Variable 40px 600 | 40px | wordmark | `header.threshold-head > span.wordmark.large` 1 |
| 1 | Bodoni Moda Variable 14px 600 | 18.2px | person or row name (lists) | `span.play-tip > b` 1 |
| 1 | Bodoni Moda Variable 20px 500 | 24px | section heading | `div.theme-edit > h3` 1 |
| 1 | Commissioner Variable 24px 600 | 28.8px | screen title | `h1 > button.group-name` 1 |
| 1 | Commissioner Variable 12.5px 700 | 18.75px | group label (quiet heading above a list or field) | `div.context-node > p.context-head` 1 |
