# Text inventory (after)

From `text-after.json`: every visible text element on every screen the smoke run stops at (69 screens, Ann, Bob and Cy's windows, Ink and Ivory), read with `getComputedStyle`. Screen-reader-only text (230) is left out of the counts.

| | after |
|---|---|
| Text elements | 3501 |
| Families | 3: Alegreya Sans, Bodoni Moda Variable, Cascadia Mono |
| Sizes | 7: 11px, 12.5px, 13.5px, 15px, 20px, 26px, 44px |
| Weights | 4: 400, 500, 600, 700 |
| Family, size and weight combinations | 12 |
| Line heights | 12 |
| Letter spacings | 5 |
| Text colours | 16 |

## Every combination

| Count | Family, size, weight | Line heights | Jobs it does | Where (elements) |
|---|---|---|---|---|
| 899 | Alegreya Sans 15px 500 | 19.5px | screen title; person or row name (lists); menu and navigation item; secondary line (under a name, meta); person name, large (cards); button label; body text (messages, about lines, toasts); link; group label (quiet heading above a list or field) | `span.row-text > span.row-title` 227, `div.settings-index-group > button.settings-index-row` 216, `button.channel > span.channel-name` 75, `header.titlebar > span.titlebar-place` 74 |
| 859 | Alegreya Sans 13.5px 400 | 18.225px | group label (quiet heading above a list or field); code, keys and IDs (mono); menu and navigation item; hint, help and empty-state text; secondary line (under a name, meta); person or row name (lists); tooltip and popover; badge count; button label; body text (messages, about lines, toasts) | `span.row-text > span.row-sub` 255, `header.titlebar > button.titlebar-find` 70, `span.activity-line > b` 57, `span.row-sub > span.activity-line` 41 |
| 356 | Alegreya Sans 13.5px 500 | 17.55px | group label (quiet heading above a list or field); input text and placeholders; body text (messages, about lines, toasts); section heading | `div.settings-index-group > span.side-cat` 48, `section.dms > div.side-cat` 45, `section.friend-id > h2` 40, `section.play-days > h3` 37 |
| 279 | Alegreya Sans 15px 400 | 21.75px | body text (messages, about lines, toasts); input text and placeholders; code, keys and IDs (mono); button label; group label (quiet heading above a list or field); link; screen title; person or row name (lists) | `div.msg-main > p.msg-text` 67, `div.field.with-icon > input` 40, `label.check-row > span` 37, `form.send.composer > textarea` 30 |
| 271 | Alegreya Sans 12.5px 400 | 16.25px | badge count; group label (quiet heading above a list or field); person or row name (lists); secondary line (under a name, meta); timestamp and delivery state; unsorted; button label | `h2.shelf-title > span` 98, `div.msg-head > time` 35, `div.range-ends > span` 28, `h2 > span` 25 |
| 264 | Bodoni Moda Variable 20px 500 | 24px | screen title; section heading; empty-state title; big number (score, light level); person name, large (cards); server name on its banner; group label (quiet heading above a list or field) | `section.settings-section > h2` 47, `aside.sidebar.side.home-column > header.side-title` 40, `section.people-list > h2.shelf-title` 40, `section.offline.people-list > h2.shelf-title` 40 |
| 236 | Alegreya Sans 13.5px 700 | 13.5px, 18.225px | button label; person or row name (lists); group label (quiet heading above a list or field) | `header.page-head > button.button.primary.page-action` 40, `div.settings-row > button.button` 19, `div.theme-cards[radiogroup] > button.theme-card[radio]` 18, `div.game-card-foot > button.button` 16 |
| 136 | Bodoni Moda Variable 26px 600 | 28.6px | screen title; person name, large (cards) | `header.page-head > h1` 40, `header.chat-head > h1` 25, `nav.settings-index > h1` 24, `div.preview-body > b.preview-name` 24 |
| 92 | Cascadia Mono 12.5px 500 | 17.5px | code, keys and IDs (mono) | `div.id-plate > b` 40, `p.row-sub > span.tail` 40, `div.pop-body > p.pop-handle` 3, `dd > b` 3 |
| 84 | Alegreya Sans 11px 700 | 11px | badge count | `button.titlebar-find > kbd` 70, `div.game-card-top > span.game-card-live` 7, `button.side-row.dm-row > span.side-count.dm-count` 2, `button.rail-item.rail-group.rail-server > span.rail-count` 2 |
| 15 | Alegreya Sans 26px 700 | 26px | big number (score, light level) | `section.glance > span.glance-score.ahead` 5, `span.glance-score.ahead > span` 5, `div.destiny-guardian > b.destiny-light` 3, `span.cs2-team.ct.ours > b` 1 |
| 10 | Bodoni Moda Variable 44px 600 | 44px | wordmark | `div[status] > span.splash-word` 6, `header.threshold-head > span.wordmark.large` 4 |
