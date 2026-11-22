# Type roles

Every visible text element from `text-before.json` (3220), sorted by the job it does, read from its markup (`scripts/audit-report.mjs`, `JOBS`). Each job becomes one role in the type system; today most jobs are set in several styles at once, which is the problem the roles fix.

| Role | Elements | Styles in use today | Screens |
|---|---|---|---|
| person or row name (lists) | 587 | 14 | 63 |
| secondary line (under a name, meta) | 507 | 7 | 63 |
| group label (quiet heading above a list or field) | 391 | 10 | 64 |
| menu and navigation item | 332 | 4 | 63 |
| button label | 217 | 7 | 53 |
| screen title | 202 | 6 | 64 |
| body text (messages, about lines, toasts) | 188 | 4 | 53 |
| badge count | 177 | 8 | 63 |
| section heading | 137 | 4 | 45 |
| code, keys and IDs (mono) | 117 | 8 | 35 |
| input text and placeholders | 80 | 4 | 64 |
| hint, help and empty-state text | 73 | 4 | 49 |
| person name, large (cards) | 69 | 8 | 41 |
| timestamp and delivery state | 47 | 2 | 14 |
| big number (score, light level) | 37 | 6 | 16 |
| server name on its banner | 27 | 2 | 25 |
| empty-state title | 16 | 1 | 16 |
| wordmark | 7 | 2 | 2 |
| link | 5 | 2 | 3 |
| tooltip and popover | 4 | 1 | 1 |

## person or row name (lists)

Styles today: Commissioner Variable 14px 500 (178); Commissioner Variable 14px 400 (86); Commissioner Variable 14px 600 (84); Commissioner Variable 14px 550 (71); Commissioner Variable 12px 500 (40); Commissioner Variable 14px 650 (36); Commissioner Variable 12px 600 (35); Commissioner Variable 13px 600 (27); Commissioner Variable 12.5px 400 (16); Commissioner Variable 12px 400 (5); Commissioner Variable 14px 700 (4); Commissioner Variable 13px 500 (3); Bodoni Moda Variable 14px 600 (1); Commissioner Variable 11px 600 (1).

| Element | Count | Example | Style | Screens |
|---|---|---|---|---|
| `span.row-text > span.row-title` | 200 | Ann | Commissioner Variable 14px 500; Commissioner Variable 14px 550; Commissioner Variable 14px 700; Commissioner Variable 14px 600 | home-ivory, activity-notice, settings-activity, profile-panel, card-cs2, … |
| `button.channel > span.channel-name` | 75 | general | Commissioner Variable 14px 400; Commissioner Variable 14px 700 | server, server-unread, menu-channel, server-voice, bars-call, … |
| `span.row-title > span.user` | 74 | Ann | Commissioner Variable 14px 600; Commissioner Variable 13px 500 | link-preview, profile-panel-call, people-row, conversation, server, … |
| `span.activity-line > b` | 56 | Counter-Strike 2 | Commissioner Variable 12px 500; Commissioner Variable 12.5px 400 | home-ivory, activity-notice, settings-activity, profile-panel, card-cs2, … |
| `div.msg-head > button.user` | 36 | Ann | Commissioner Variable 14px 650 | link-preview, profile-panel-call, people-row, conversation, server, … |
| `button.side-row > span.row-title` | 35 | Friends | Commissioner Variable 14px 550 | home-ivory, activity-notice, settings-activity, profile-panel, card-cs2, … |
| `span.row-title > span.row-sub` | 32 | (you) | Commissioner Variable 12px 600 | link-preview, profile-panel-call, people-row, conversation, server, … |
| `span.notice-text > b` | 15 | Ann | Commissioner Variable 13px 600 | activity-notice, card-dota, conversation, menu-person, settings-my-profile-ink |
| `label > b` | 12 | 100 | Commissioner Variable 13px 600 | settings-appearance-ink, settings-voice-and-video-ink, settings-appearance-ivory, settings-voice-and-video-ivory |
| `span.row-title.audit-line > b` | 10 | Ann | Commissioner Variable 14px 600 | server-settings |
| `span.row-line > span.row-title` | 8 | Restart App as Administrator | Commissioner Variable 14px 500 | settings-hotkeys-ink, settings-storage-ink, settings-help-and-feedback-ink, settings-account-ink, settings-hotkeys-ivory, … |
| `div.connection-game-head > span.row-title` | 6 | Counter-Strike 2 | Commissioner Variable 14px 500 | settings-activity, settings-cs2-live, settings-dota |
| `span.row-text > span.row-title.audit-line` | 6 | let someone in with an invite | Commissioner Variable 14px 400 | server-settings |
| `span.row-title > span.destiny-title` | 3 | Rivensbane | Commissioner Variable 14px 500 | settings-bungie, card-destiny, card-destiny-loadout |
| `span.row-sub.destiny-clan > b` | 3 | [ | Commissioner Variable 12px 600 | settings-bungie, card-destiny, card-destiny-loadout |
| `button.role-row.role-pick > span.row-title` | 3 | general | Commissioner Variable 14px 400 | server-settings-channels |
| `div.connection-game-head > span.gsi-state` | 2 | Start or restart | Commissioner Variable 12px 400 | settings-activity, settings-dota |
| `div.connection-game-head > span.gsi-state.live` | 2 | Live | Commissioner Variable 12px 400 | settings-cs2-live, settings-dota |
| `span.row-title > button.user` | 2 | Ann | Commissioner Variable 14px 600 | profile-panel-call, people-row |
| `button.role-row.role-pick > span.channel-hash` | 2 | # | Commissioner Variable 14px 400 | server-settings-channels |
| `span.play-tip > b` | 1 | Saturday, November 21 | Bodoni Moda Variable 14px 600 | play-grid-mini |
| `figure.screen > figcaption` | 1 | Ann | Commissioner Variable 12px 400 | pip |
| `div.person-tile > span.person-name` | 1 | You | Commissioner Variable 11px 600 | people-row |
| `button.role-pick > span.row-title` | 1 | @everyone | Commissioner Variable 14px 400 | server-settings-roles |
| `span.access-line[row] > span.access-role[rowheader]` | 1 | @everyone | Commissioner Variable 14px 400 | server-settings-channels |

## secondary line (under a name, meta)

Styles today: Commissioner Variable 12px 400 (350); Commissioner Variable 13px 400 (46); Commissioner Variable 12px 500 (40); Commissioner Variable 12.5px 400 (31); Alegreya Sans 13px 500 (25); Commissioner Variable 13.5px 600 (8); Commissioner Variable 14px 400 (7).

| Element | Count | Example | Style | Screens |
|---|---|---|---|---|
| `span.row-text > span.row-sub` | 219 | Online | Commissioner Variable 12px 400; Commissioner Variable 13px 400 | settings-activity, card-cs2-state, settings-cs2-live, settings-theme, theme-owner, … |
| `span.row-sub > span.activity-line` | 40 | Playing | Commissioner Variable 12px 500 | home-ivory, activity-notice, settings-activity, profile-panel, card-cs2, … |
| `section.friend-id > p.row-sub` | 35 | Unique Key | Commissioner Variable 12px 400 | home-ivory, activity-notice, settings-activity, profile-panel, card-cs2, … |
| `header.page-head > span.page-sub` | 33 | 0 | Commissioner Variable 13px 400 | home-ivory, activity-notice, settings-activity, profile-panel, card-cs2, … |
| `span.server-title > span.server-count` | 25 | 2 members | Alegreya Sans 13px 500 | server, server-unread, menu-channel, server-voice, bars-call, … |
| `div.preview-body > span.row-sub` | 23 | anntester#2078 | Commissioner Variable 12px 400 | settings-activity, settings-cs2-live, settings-theme, settings-dota, settings-bungie, … |
| `div.game-card-line > span.activity-line` | 16 | Playing | Commissioner Variable 12.5px 400 | activity-notice, settings-activity, profile-panel, card-cs2, card-cs2-state, … |
| `div.activity-body > p.row-sub` | 10 | For 1 min | Commissioner Variable 12px 400 | settings-activity, card-cs2, card-cs2-state, settings-cs2-live, play-grid-full, … |
| `button.connection > span.connection-state` | 8 | CS2 | Commissioner Variable 12px 400 | settings-activity, settings-cs2-live, settings-dota, settings-bungie |
| `div.glance-text > span.glance-game` | 8 | Counter-Strike 2 | Commissioner Variable 13.5px 600 | settings-activity, profile-panel, settings-cs2-live, play-grid-mini, settings-theme, … |
| `div.glance-text > span.glance-meta` | 8 | For 1 min | Commissioner Variable 12px 400 | settings-activity, profile-panel, settings-cs2-live, play-grid-mini, settings-theme, … |
| `div.glance-text > span.glance-place` | 7 | Mirage · Competitive | Commissioner Variable 12.5px 400 | profile-panel, settings-cs2-live, play-grid-mini, settings-theme, settings-dota, … |
| `div > dd` | 7 | 12 | Commissioner Variable 14px 400 | card-cs2-state |
| `span.row-sub > span.voice-line` | 7 | In voice: | Commissioner Variable 12px 400 | profile-panel-call, pip, people-row, splash |
| `div.card > p.row-sub` | 5 | Online | Commissioner Variable 12px 400 | card-cs2, play-grid-full, card-dota, card-destiny, card-destiny-loadout |
| `span.row-text > button.voice-where` | 5 | Ann | Commissioner Variable 12px 400 | profile-panel-call, pip, people-row, server-voice, bars-call |
| `button.notice.voice > span.notice-text` | 5 | joined | Commissioner Variable 13px 400 | conversation, menu-person, settings-my-profile-ink |
| `div.activity-preview > p.row-sub` | 4 | Preview | Commissioner Variable 12px 400 | settings-activity, settings-cs2-live, settings-dota, settings-bungie |
| `div.person-body > span.row-sub` | 4 | bobtester#8591 | Commissioner Variable 12px 400 | link-preview, profile-panel-call, people-row, invite-card |
| `div.pop-body > p.pop-handle` | 3 | anntester#2078 | Commissioner Variable 12.5px 400 | profile-panel, play-grid-mini, profile-panel-call |
| `div.pop-body > p.pop-presence` | 3 | Online | Commissioner Variable 12.5px 400 | profile-panel, play-grid-mini, profile-panel-call |
| `div.destiny-activity > span.destiny-activity-mode` | 3 | Raid | Commissioner Variable 12px 400 | settings-bungie, card-destiny, card-destiny-loadout |
| `div.destiny-activity > span.destiny-activity-light` | 3 | 1990 | Commissioner Variable 12px 400 | settings-bungie, card-destiny, card-destiny-loadout |
| `div.cs2.destiny > p.row-sub.destiny-where` | 3 | The Pale Heart · 558 h 33 min | Commissioner Variable 12px 400 | settings-bungie, card-destiny, card-destiny-loadout |
| `span.row-text > span.row-sub.destiny-clan` | 3 | The Last Wardens | Commissioner Variable 12px 400 | settings-bungie, card-destiny, card-destiny-loadout |
| `div.destiny-fireteam > p.row-sub` | 3 | Fireteam | Commissioner Variable 12px 400 | settings-bungie, card-destiny, card-destiny-loadout |
| `figcaption > span.row-sub.live` | 3 | Talking | Commissioner Variable 12px 400 | profile-panel-call, bars-call |
| `button.notice.game > span.notice-text` | 2 | started playing | Commissioner Variable 13px 400 | activity-notice, card-dota |
| `div.activity-body > p.activity-facts` | 2 | Action, Free To Play · Valve | Commissioner Variable 12.5px 400 | settings-activity, card-cs2-state |
| `div.cs2-head > span.row-sub` | 2 | Competitive · Round 12 · Live | Commissioner Variable 12px 400 | card-cs2-state, settings-cs2-live |
| `div.link-text > span.link-site` | 2 | 127.0.0.1 | Commissioner Variable 12px 400 | link-preview, profile-panel-call |
| `div.activity-extra > p.row-sub` | 2 | Other games | Commissioner Variable 12px 400 | settings-activity-ink, settings-activity-ivory |
| `button.notice > span.notice-text` | 1 | came online | Commissioner Variable 13px 400 | activity-notice |
| `span.row-text > span.achievement-desc` | 1 | Played a match | Commissioner Variable 12px 400 | card-cs2-state |
| `div.stage-bar > span.row-sub` | 1 | 2 videos in this call | Commissioner Variable 12px 400 | people-row |
| `div.row-text > span.row-sub` | 1 | 3 members · 3 online | Commissioner Variable 13px 400 | conversation |

## group label (quiet heading above a list or field)

Styles today: Commissioner Variable 12.5px 600 (226); Bodoni Moda Variable 15px 400 italic (42); Commissioner Variable 12px 600 (32); Commissioner Variable 11px 400 (31); Alegreya Sans 13px 500 (17); Commissioner Variable 12px 400 (15); Commissioner Variable 12.5px 400 (13); Commissioner Variable 13px 500 (8); Commissioner Variable 12.5px 500 (6); Commissioner Variable 12.5px 700 (1).

| Element | Count | Example | Style | Screens |
|---|---|---|---|---|
| `div.settings-index-group > span.side-cat` | 46 | You | Commissioner Variable 12.5px 600 | settings-activity, settings-cs2-live, settings-theme, settings-dota, settings-bungie, … |
| `section.dms > div.side-cat` | 40 | Direct messages | Commissioner Variable 12.5px 600 | home-ivory, activity-notice, settings-activity, profile-panel, card-cs2, … |
| `section.play-days > h3` | 36 | Two weeks of play | Bodoni Moda Variable 15px 400 italic | settings-activity, profile-panel, card-cs2, settings-cs2-live, play-grid-mini, … |
| `section.friend-id > h2` | 35 | Your friend ID | Commissioner Variable 12.5px 600 | home-ivory, activity-notice, settings-activity, profile-panel, card-cs2, … |
| `section > h2` | 25 | Online | Commissioner Variable 12.5px 600 | server, server-unread, menu-channel, server-voice, bars-call, … |
| `div.settings-preview > h2` | 23 | What others see | Commissioner Variable 12.5px 600 | settings-activity, settings-cs2-live, settings-theme, settings-dota, settings-bungie, … |
| `div.range-ends > span` | 20 | 0% | Commissioner Variable 11px 400 | settings-appearance-ink, settings-voice-and-video-ink, settings-appearance-ivory, settings-voice-and-video-ivory |
| `div.game-card-top > span.game-card-game` | 16 | Counter-Strike 2 | Commissioner Variable 12px 600 | activity-notice, settings-activity, profile-panel, card-cs2, card-cs2-state, … |
| `div.day-rule[separator] > b` | 14 | Today | Commissioner Variable 12px 600 | link-preview, profile-panel-call, people-row, conversation, server, … |
| `h3 > span.play-sum` | 13 | 15 h | Alegreya Sans 13px 500 | settings-activity, profile-panel, card-cs2, settings-cs2-live, play-grid-mini, … |
| `div.activity-body > p.activity-kicker` | 11 | Playing | Commissioner Variable 12.5px 400 | settings-activity, card-cs2, card-cs2-state, settings-cs2-live, play-grid-full, … |
| `div.audio-settings > label.field-label` | 10 | Speakers | Commissioner Variable 12.5px 600 | settings-privacy-and-safety-ink, settings-appearance-ink, settings-voice-and-video-ink, settings-privacy-and-safety-ivory, settings-appearance-ivory, … |
| `aside.members > h2` | 8 | Online ( | Commissioner Variable 12.5px 600 | link-preview, profile-panel-call, people-row, conversation, invite-card |
| `div > dt` | 7 | K / A / D | Commissioner Variable 11px 400 | card-cs2-state |
| `dl.identity > dt` | 6 | Friend ID | Commissioner Variable 12px 400 | card-cs2-state, card-destiny-loadout, card-own-ivory |
| `section.settings-section > div.field-label` | 6 | Showcase | Commissioner Variable 12.5px 600 | settings-my-profile-ink, settings-my-profile-ivory |
| `section.chamber > h2` | 5 | Voice | Commissioner Variable 12.5px 600 | link-preview, profile-panel-call, people-row, conversation, invite-card |
| `section.person-section > h3` | 5 | Shared pictures | Commissioner Variable 12.5px 600 | link-preview, profile-panel-call, people-row, invite-card |
| `div.achievement-head > span` | 4 | Achievements | Commissioner Variable 12px 400 | settings-activity, card-cs2-state |
| `label.theme-slider > span.theme-label` | 4 | Tones | Bodoni Moda Variable 15px 400 italic | settings-theme |
| `span.theme-label > output` | 4 | 40 | Alegreya Sans 13px 500 | settings-theme |
| `aside.members > h2.in-chat` | 4 | In this chat | Commissioner Variable 12.5px 600 | link-preview, profile-panel-call, people-row, invite-card |
| `section.settings-section > label.field-label` | 4 | Display name | Commissioner Variable 12.5px 600 | settings-my-profile-ink, settings-my-profile-ivory |
| `section.settings-section > h3` | 4 | Blocked people | Commissioner Variable 12.5px 600 | settings-activity-ink, settings-privacy-and-safety-ink, settings-activity-ivory, settings-privacy-and-safety-ivory |
| `span.range-ends > span` | 4 | Join a call to see your level here | Commissioner Variable 11px 400 | settings-voice-and-video-ink, settings-voice-and-video-ivory |
| `div.activity-body > h3` | 3 | Counter-Strike 2 | Commissioner Variable 12.5px 600 | settings-activity, settings-cs2-live, settings-bungie |
| `div.role-edit > label.field-label` | 3 | Role name | Commissioner Variable 13px 500 | server-settings-roles, server-settings-channels |
| `span.access-head[row] > span.access-col[columnheader]` | 3 | See it | Commissioner Variable 12px 400 | server-settings-channels |
| `form.profile.panel > label.field-label` | 2 | Username | Commissioner Variable 13px 500 | setup |
| `form.settings-section > label.field-label` | 2 | Server name | Commissioner Variable 13px 500 | server-banner, gif-picker |
| `section.settings-section.banner-section > h2` | 2 | Banner | Commissioner Variable 12.5px 600 | server-banner, gif-picker |
| `section.settings-section.banner-section > label.weave-tones` | 2 | Darkness | Commissioner Variable 12.5px 400 | server-banner, gif-picker |
| `section.settings-section > div.field-label.status-edit` | 2 | Status | Commissioner Variable 12.5px 600 | settings-my-profile-ink, settings-my-profile-ivory |
| `label.check-row.inline > span` | 2 | Quiet: no pokes | Commissioner Variable 12.5px 600 | settings-my-profile-ink, settings-my-profile-ivory |
| `div.settings-row > button.button.primary` | 2 | Set status | Commissioner Variable 12.5px 600 | settings-my-profile-ink, settings-my-profile-ivory |
| `div.show-slots > button.button.subtle` | 2 | Pin a game or achievement | Commissioner Variable 12.5px 500 | settings-my-profile-ink, settings-my-profile-ivory |
| `span.row-text > span.row-title` | 2 | Your picture | Commissioner Variable 12.5px 500 | settings-my-profile-ink, settings-my-profile-ivory |
| `span.row-text > span.row-sub` | 2 | Shown to everyone you share a chat with. | Commissioner Variable 12px 600 | settings-my-profile-ink, settings-my-profile-ivory |
| `div.settings-row > button.button` | 2 | Edit profile | Commissioner Variable 12.5px 500 | settings-my-profile-ink, settings-my-profile-ivory |
| `label.field-label > span.hint` | 1 | Letters, numbers, dots and underscores. A random | Commissioner Variable 12px 400 | setup |
| `label.field-label > span` | 1 | About you | Commissioner Variable 13px 500 | setup |
| `span > span.hint.inline` | 1 | (optional) | Commissioner Variable 12px 400 | setup |
| `div.theme-edit > span.theme-label` | 1 | Weave | Bodoni Moda Variable 15px 400 italic | settings-theme |
| `div > span.theme-label` | 1 | Motion | Bodoni Moda Variable 15px 400 italic | settings-theme |
| `div.context-node > p.context-head` | 1 | User volume | Commissioner Variable 12.5px 700 | menu-person |

## menu and navigation item

Styles today: Commissioner Variable 14px 400 (207); Commissioner Variable 13px 500 (65); Commissioner Variable 13px 400 (59); Commissioner Variable 12px 500 (1).

| Element | Count | Example | Style | Screens |
|---|---|---|---|---|
| `div.settings-index-group > button.settings-index-row` | 207 | My profile | Commissioner Variable 14px 400 | settings-activity, settings-cs2-live, settings-theme, settings-dota, settings-bungie, … |
| `header.titlebar > button.titlebar-find` | 65 | Find a friend, group, server or channel | Commissioner Variable 13px 500 | home-ivory, activity-notice, settings-activity, profile-panel, card-cs2, … |
| `nav.settings-nav > button.settings-page` | 35 | Overview | Commissioner Variable 13px 400 | server-settings-roles, server-settings-channels, server-settings, server-banner, gif-picker |
| `div.context-section[group] > button.context-item[menuitem]` | 11 | Create a server | Commissioner Variable 13px 400 | rail-add-menu, menu-channel, menu-person |
| `div.context-section[group] > button.context-item.has-check[menuitemcheckbox]` | 5 | Mute | Commissioner Variable 13px 400 | menu-person |
| `div.context-section[group] > button.context-item.nested[menuitem]` | 4 | 15 minutes | Commissioner Variable 13px 400 | menu-channel |
| `div.context-section[group] > button.context-item.danger[menuitem]` | 4 | Delete channel | Commissioner Variable 13px 400 | menu-channel, menu-person |
| `header.titlebar > button.titlebar-call` | 1 | In a call in | Commissioner Variable 12px 500 | pip |

## button label

Styles today: Commissioner Variable 14px 500 (89); Commissioner Variable 14px 600 (77); Commissioner Variable 11px 600 (19); Commissioner Variable 13px 600 (14); Commissioner Variable 12px 600 (9); Commissioner Variable 11.5px 600 (6); Commissioner Variable 14px 400 (3).

| Element | Count | Example | Style | Screens |
|---|---|---|---|---|
| `header.page-head > button.button.primary.page-action` | 33 | Add friend | Commissioner Variable 14px 600 | home-ivory, activity-notice, settings-activity, profile-panel, card-cs2, … |
| `div.theme-cards[radiogroup] > button.theme-card[radio]` | 18 | Ink | Commissioner Variable 14px 600 | settings-activity-ink, settings-privacy-and-safety-ink, settings-appearance-ink, settings-activity-ivory, settings-privacy-and-safety-ivory, … |
| `div.settings-row > button.button` | 17 | Reset | Commissioner Variable 14px 500 | settings-theme, settings-hotkeys-ink, settings-storage-ink, settings-help-and-feedback-ink, settings-account-ink, … |
| `div.game-card-foot > button.button` | 16 | Message | Commissioner Variable 14px 500 | activity-notice, settings-activity, profile-panel, card-cs2, card-cs2-state, … |
| `button.weave-kind[radio] > span` | 14 | Arcade | Commissioner Variable 11px 600 | settings-theme, settings-my-profile-ink, settings-my-profile-ivory |
| `div.segmented[radiogroup] > button[radio]` | 9 | Off | Commissioner Variable 13px 600 | settings-theme, server-banner, gif-picker |
| `button.connection > span.connection-name` | 8 | Steam | Commissioner Variable 14px 600 | settings-activity, settings-cs2-live, settings-dota, settings-bungie |
| `div.settings-row.admin-row > button.button` | 8 | Restart | Commissioner Variable 14px 500 | settings-hotkeys-ink, settings-storage-ink, settings-help-and-feedback-ink, settings-account-ink, settings-hotkeys-ivory, … |
| `div.settings-row > button.button.primary` | 7 | Save theme | Commissioner Variable 14px 600 | settings-theme, server-banner, gif-picker, settings-my-profile-ink, settings-my-profile-ivory |
| `div.activity-actions > button.button` | 6 | Store page | Commissioner Variable 14px 500 | card-cs2-state, settings-bungie, card-destiny-loadout |
| `button[radio] > span` | 6 | Counter-Strike 2 | Commissioner Variable 11.5px 600 | server-banner, gif-picker |
| `div.hotkey > button.button` | 6 | Set | Commissioner Variable 14px 500 | settings-hotkeys-ink, settings-hotkeys-ivory |
| `div.settings-row > button.button.danger` | 6 | Delete | Commissioner Variable 14px 500 | settings-storage-ink, settings-help-and-feedback-ink, settings-account-ink, settings-storage-ivory, settings-help-and-feedback-ivory, … |
| `div.card-actions > button.button` | 5 | Call | Commissioner Variable 14px 500 | card-cs2-state, card-destiny-loadout, card-own-ivory |
| `div.settings-row > button.button.subtle` | 5 | Refresh | Commissioner Variable 14px 500 | server-settings, server-banner, gif-picker |
| `div > label.button.file-button` | 3 | Choose a picture | Commissioner Variable 14px 500 | setup, server-banner, gif-picker |
| `div > button.button` | 3 | GIF | Commissioner Variable 14px 500 | setup, server-banner, gif-picker |
| `div.pop-body > button.link-button.pop-block` | 3 | Block | Commissioner Variable 14px 400 | profile-panel, play-grid-mini, profile-panel-call |
| `div.card-actions > button.button.primary` | 3 | Message | Commissioner Variable 14px 600 | card-cs2-state, card-destiny-loadout, card-own-ivory |
| `section.chamber > button.button.primary.wide` | 3 | Start call | Commissioner Variable 14px 600 | link-preview, conversation, invite-card |
| `span.tri[radiogroup] > button.tri-deny[radio]` | 3 | ✕ | Commissioner Variable 12px 600 | server-settings-channels |
| `span.tri[radiogroup] > button.tri-inherit[radio]` | 3 | / | Commissioner Variable 12px 600 | server-settings-channels |
| `span.tri[radiogroup] > button.tri-allow[radio]` | 3 | ✓ | Commissioner Variable 12px 600 | server-settings-channels |
| `div.segmented[tablist] > button[tab]` | 3 | Search | Commissioner Variable 13px 600 | gif-picker |
| `div.card-actions > button.button.danger` | 2 | Remove friend | Commissioner Variable 14px 500 | card-cs2-state, card-destiny-loadout |
| `div.file-card > button.button.subtle` | 2 | Show in folder | Commissioner Variable 14px 500 | profile-panel-call, people-row |
| `div.stage-bar > button.button.subtle` | 2 | Leave stream | Commissioner Variable 14px 500 | people-row |
| `div.settings-row.save-bar > button.button.primary` | 2 | Save changes | Commissioner Variable 14px 600 | server-settings-roles, server-settings-channels |
| `div.settings-row.save-bar > button.button.subtle` | 2 | Reset | Commissioner Variable 14px 500 | server-settings-roles, server-settings-channels |
| `div.segmented[radiogroup] > label.segmented-file[radio]` | 2 | A picture | Commissioner Variable 13px 600 | server-banner, gif-picker |
| `label.weave-kind.upload[radio] > span` | 2 | Upload | Commissioner Variable 11px 600 | settings-my-profile-ink, settings-my-profile-ivory |
| `button.weave-kind.upload > span` | 2 | GIF | Commissioner Variable 11px 600 | settings-my-profile-ink, settings-my-profile-ivory |
| `div.activity-extra > button.button` | 2 | Add a game… | Commissioner Variable 14px 500 | settings-activity-ink, settings-activity-ivory |
| `div.form-actions > button.button.primary` | 1 | Enter Eleusinia | Commissioner Variable 14px 600 | setup |
| `button.weave-kind.none[radio] > span` | 1 | None | Commissioner Variable 11px 600 | settings-theme |
| `div.connection-panel > button.button.subtle` | 1 | Unlink | Commissioner Variable 14px 500 | settings-bungie |
| `div.toast.poke-toast[status] > button.button.primary` | 1 | Join | Commissioner Variable 14px 600 | poke-toast |
| `div.role-list > button.button.subtle` | 1 | Create a channel | Commissioner Variable 14px 500 | server-settings-channels |
| `div.settings-row.save-bar > button.button.danger` | 1 | Delete channel | Commissioner Variable 14px 500 | server-settings-channels |
| `div.gif-foot > label.button.file-button` | 1 | Upload a GIF | Commissioner Variable 14px 500 | gif-picker |
| `div.invite-card > button.button.primary` | 1 | Join | Commissioner Variable 14px 600 | invite-card |

## screen title

Styles today: Commissioner Variable 13px 500 (69); Commissioner Variable 17px 650 (63); Commissioner Variable 15px 650 (40); Commissioner Variable 20px 600 (23); Commissioner Variable 22px 600 (6); Commissioner Variable 24px 600 (1).

| Element | Count | Example | Style | Screens |
|---|---|---|---|---|
| `header.titlebar > span.titlebar-place` | 69 | Create your account | Commissioner Variable 13px 500 | splash, setup, home-ivory, activity-notice, settings-activity, … |
| `aside.sidebar.side.home-column > header.side-title` | 35 | Home | Commissioner Variable 15px 650 | home-ivory, activity-notice, settings-activity, profile-panel, card-cs2, … |
| `header.page-head > h1` | 33 | Friends | Commissioner Variable 17px 650 | home-ivory, activity-notice, settings-activity, profile-panel, card-cs2, … |
| `header.chat-head > h1` | 25 | plans | Commissioner Variable 17px 650 | server, server-unread, menu-channel, server-voice, bars-call, … |
| `nav.settings-index > h1` | 23 | Settings | Commissioner Variable 20px 600 | settings-activity, settings-cs2-live, settings-theme, settings-dota, settings-bungie, … |
| `div.settings-pane > h1` | 5 | Roles | Commissioner Variable 22px 600 | server-settings-roles, server-settings-channels, server-settings, server-banner, gif-picker |
| `span.row-text > span.chat-title` | 4 | Bob | Commissioner Variable 17px 650 | link-preview, profile-panel-call, people-row, invite-card |
| `aside.voice.side > button.home.back` | 3 | Home | Commissioner Variable 15px 650 | link-preview, conversation, invite-card |
| `aside.voice.side.live > button.home.back` | 2 | Home | Commissioner Variable 15px 650 | profile-panel-call, people-row |
| `form.profile.panel > h1` | 1 | Create your account | Commissioner Variable 22px 600 | setup |
| `h1 > button.group-name` | 1 | The Trio | Commissioner Variable 24px 600 | conversation |
| `div.row-text > h1` | 1 | The Trio | Commissioner Variable 17px 650 | conversation |

## body text (messages, about lines, toasts)

Styles today: Commissioner Variable 14px 400 (97); Commissioner Variable 13px 400 (77); Commissioner Variable 12px 400 (9); Commissioner Variable 13px 500 (5).

| Element | Count | Example | Style | Screens |
|---|---|---|---|---|
| `div.msg-main > p.msg-text` | 70 | dm online | Commissioner Variable 14px 400 | link-preview, profile-panel-call, people-row, conversation, server, … |
| `label.check-row > span` | 33 | Share what I'm playing | Commissioner Variable 14px 400; Commissioner Variable 13px 400 | settings-theme, settings-activity-ink, settings-privacy-and-safety-ink, settings-appearance-ink, settings-voice-and-video-ink, … |
| `div.preview-body > p.preview-about` | 23 | I am Ann | Commissioner Variable 13px 400 | settings-activity, settings-cs2-live, settings-theme, settings-dota, settings-bungie, … |
| `div.setting > label` | 10 | Master volume | Commissioner Variable 13px 400 | settings-appearance-ink, settings-voice-and-video-ink, settings-appearance-ivory, settings-voice-and-video-ivory |
| `li > span` | 9 | Ann | Commissioner Variable 13px 400 | settings-bungie, card-destiny, card-destiny-loadout |
| `span.row-text > span.row-sub` | 9 | Change the name and picture. | Commissioner Variable 12px 400 | server-settings-roles |
| `div.card > p.about` | 7 | I am Ann | Commissioner Variable 14px 400 | card-cs2, play-grid-full, theme-owner, card-dota, card-destiny, … |
| `div[status] > span.splash-status` | 6 | Opening the window | Commissioner Variable 14px 400 | splash |
| `div.signal.good > span.signal-text` | 5 | Voice Connected | Commissioner Variable 13px 500 | profile-panel-call, pip, people-row, server-voice, bars-call |
| `div.person-body > p.person-about` | 4 | I am Bob | Commissioner Variable 13px 400 | link-preview, profile-panel-call, people-row, invite-card |
| `div.pop-body > p.pop-about` | 3 | I am Ann | Commissioner Variable 13px 400 | profile-panel, play-grid-mini, profile-panel-call |
| `label.check-row.activity-hide > span` | 2 | Show them what I'm playing | Commissioner Variable 14px 400 | card-cs2-state, card-destiny-loadout |
| `div.link-text > p.link-desc` | 2 | Mist over stone, all day. | Commissioner Variable 13px 400 | link-preview, profile-panel-call |
| `section.person-section > p` | 2 | Talked | Commissioner Variable 13px 400 | people-row, invite-card |
| `div.setting.mic-gate > label` | 2 | Mic sensitivity | Commissioner Variable 13px 400 | settings-voice-and-video-ink, settings-voice-and-video-ivory |
| `div.toast.poke-toast[status] > span` | 1 | Ann invites you to Lounge in Smoke Server | Commissioner Variable 14px 400 | poke-toast |

## badge count

Styles today: Commissioner Variable 13px 400 (82); Commissioner Variable 11px 500 (65); Commissioner Variable 12px 600 (7); Commissioner Variable 12px 500 (6); Commissioner Variable 11px 400 (5); Commissioner Variable 12.5px 600 (4); Commissioner Variable 11px 700 (4); Commissioner Variable 10.5px 700 (4).

| Element | Count | Example | Style | Screens |
|---|---|---|---|---|
| `h2.shelf-title > span` | 82 | 0 | Commissioner Variable 13px 400 | home-ivory, activity-notice, settings-activity, profile-panel, card-cs2, … |
| `button.titlebar-find > kbd` | 65 | Ctrl K | Commissioner Variable 11px 500 | home-ivory, activity-notice, settings-activity, profile-panel, card-cs2, … |
| `div.game-card-top > span.game-card-live` | 7 | Live | Commissioner Variable 12px 600 | profile-panel, card-cs2, card-cs2-state, home-cs2, play-grid-mini, … |
| `div.hotkey > kbd.unset` | 6 | Not set | Commissioner Variable 12px 500 | settings-hotkeys-ink, settings-hotkeys-ivory |
| `span.keep > button.keep-chip` | 4 | Private | Commissioner Variable 12.5px 600 | link-preview, profile-panel-call, people-row, invite-card |
| `label.person-volume > span.person-volume-pct` | 4 | 100 | Commissioner Variable 11px 400 | profile-panel-call, people-row, menu-person |
| `button.side-row.dm-row > span.side-count.dm-count` | 2 | 2 | Commissioner Variable 11px 700 | rail, splash |
| `button.rail-item.rail-group > span.rail-count` | 2 | 1 | Commissioner Variable 10.5px 700 | conversation, splash |
| `button.rail-item.rail-group.rail-server > span.rail-count` | 2 | 1 | Commissioner Variable 10.5px 700 | server-unread, menu-channel |
| `button.channel > span.channel-count` | 2 | 1 | Commissioner Variable 11px 700 | server-unread, menu-channel |
| `button.row-button > span.call-chip` | 1 | Calling | Commissioner Variable 11px 400 | pip |

## section heading

Styles today: Commissioner Variable 15px 650 (82); Commissioner Variable 22px 650 (49); Commissioner Variable 12.5px 600 (5); Bodoni Moda Variable 20px 500 (1).

| Element | Count | Example | Style | Screens |
|---|---|---|---|---|
| `section.settings-section > h2` | 49 | Activity | Commissioner Variable 22px 650 | settings-theme, settings-my-profile-ink, settings-activity-ink, settings-privacy-and-safety-ink, settings-appearance-ink, … |
| `section.people-list > h2.shelf-title` | 33 | Online | Commissioner Variable 15px 650 | home-ivory, activity-notice, settings-activity, profile-panel, card-cs2, … |
| `section.offline.people-list > h2.shelf-title` | 33 | Offline | Commissioner Variable 15px 650 | home-ivory, activity-notice, settings-activity, profile-panel, card-cs2, … |
| `section.playing-now > h2.shelf-title` | 16 | Playing now | Commissioner Variable 15px 650 | activity-notice, settings-activity, profile-panel, card-cs2, card-cs2-state, … |
| `div.role-edit > h2` | 2 | Permissions | Commissioner Variable 12.5px 600 | server-settings-roles, server-settings-channels |
| `div.theme-edit > h3` | 1 | Profile theme | Bodoni Moda Variable 20px 500 | settings-theme |
| `div.section-head > h2` | 1 | Highest first | Commissioner Variable 12.5px 600 | server-settings-roles |
| `div.role-list > h2` | 1 | In order | Commissioner Variable 12.5px 600 | server-settings-channels |
| `div.dialog-body > h2` | 1 | Choose a GIF | Commissioner Variable 12.5px 600 | gif-picker |

## code, keys and IDs (mono)

Styles today: Cascadia Mono 12px 400 (39); Cascadia Mono 15px 600 (35); Commissioner Variable 14px 400 (27); Commissioner Variable 12px 400 (6); Cascadia Mono 14px 600 (3); Cascadia Mono 12px 600 (3); Cascadia Mono 13px 400 (2); Cascadia Mono 14px 500 (2).

| Element | Count | Example | Style | Screens |
|---|---|---|---|---|
| `div.id-plate > b` | 35 | anntester#2078 | Cascadia Mono 15px 600 | home-ivory, activity-notice, settings-activity, profile-panel, card-cs2, … |
| `p.row-sub > span.tail` | 35 | 02F2E7 | Cascadia Mono 12px 400 | home-ivory, activity-notice, settings-activity, profile-panel, card-cs2, … |
| `label.check-row > span` | 27 | Genre, developer and release date | Commissioner Variable 14px 400 | settings-activity, settings-cs2-live, settings-theme, settings-dota, settings-bungie, … |
| `div[status] > span.splash-detail` | 6 | your conversations, microphones and speakers | Commissioner Variable 12px 400 | splash |
| `dd > b` | 3 | anntester#2078 | Cascadia Mono 14px 600 | card-cs2-state, card-destiny-loadout, card-own-ivory |
| `dd > b.tail` | 3 | 02F2E7 | Cascadia Mono 12px 600 | card-cs2-state, card-destiny-loadout, card-own-ivory |
| `span.cs2-mid > span.cs2-clock` | 2 | 1:23 | Cascadia Mono 13px 400 | card-cs2-state, settings-cs2-live |
| `dl.identity > dd.key-hint` | 2 | Their key's last letters. Read them out on a cal | Cascadia Mono 12px 400 | card-cs2-state, card-destiny-loadout |
| `dd.key-verify > button.button.subtle` | 2 | We compared it: mark as verified | Cascadia Mono 14px 500 | card-cs2-state, card-destiny-loadout |
| `p.connection-note > code` | 1 | -gamestateintegration | Cascadia Mono 12px 400 | settings-dota |
| `button.role-pick > span.tail` | 1 | 2 | Cascadia Mono 12px 400 | server-settings-roles |

## input text and placeholders

Styles today: Commissioner Variable 15px 400 (33); Commissioner Variable 14px 400 (33); Commissioner Variable 13px 500 (8); Commissioner Variable 12.5px 400 (6).

| Element | Count | Example | Style | Screens |
|---|---|---|---|---|
| `div.field.with-icon > input` | 33 | Username (4+ letters) or friend ID | Commissioner Variable 15px 400 | home-ivory, activity-notice, settings-activity, profile-panel, card-cs2, … |
| `form.send.composer > textarea` | 30 | Message Bob | Commissioner Variable 14px 400 | link-preview, profile-panel-call, people-row, conversation, server, … |
| `label.field-label > input` | 12 |  | Commissioner Variable 13px 500; Commissioner Variable 12.5px 400 | setup, server-settings-roles, server-settings-channels, server-banner, gif-picker, … |
| `form.pop-note > input` | 3 | Message Ann | Commissioner Variable 14px 400 | profile-panel, play-grid-mini, profile-panel-call |
| `div.field-label.status-edit > input` | 2 | What are you up to? | Commissioner Variable 12.5px 400 | settings-my-profile-ink, settings-my-profile-ivory |

## hint, help and empty-state text

Styles today: Commissioner Variable 13px 400 (37); Bodoni Moda Variable 14px 400 italic (26); Commissioner Variable 12px 400 (8); Alegreya Sans 13.5px 400 (2).

| Element | Count | Example | Style | Screens |
|---|---|---|---|---|
| `section.play-days > p.play-empty` | 26 | No play in the last 14 days | Bodoni Moda Variable 14px 400 italic | settings-bungie, card-destiny, link-preview, profile-panel-call, people-row, … |
| `section.dms > p.quiet` | 17 | Conversations show here once a message is sent. | Commissioner Variable 13px 400 | home-ivory, activity-notice, settings-activity, profile-panel, card-cs2, … |
| `div.empty-state > p.quiet` | 16 | Search for someone's friend ID above. Your own I | Commissioner Variable 13px 400 | home-ivory, server-unread, menu-channel, server-voice, bars-call, … |
| `section.settings-section > p.hint` | 4 | Eleusinia may carry voice and text for friends a | Commissioner Variable 12px 400 | settings-activity-ink, settings-privacy-and-safety-ink, settings-activity-ivory, settings-privacy-and-safety-ivory |
| `section.settings-section > p.quiet` | 4 | Nobody. Block someone from their profile, or by  | Commissioner Variable 13px 400 | settings-activity-ink, settings-privacy-and-safety-ink, settings-activity-ivory, settings-privacy-and-safety-ivory |
| `div.theme-edit > p.theme-hint` | 1 | A weave behind your whole card, small and full.  | Alegreya Sans 13.5px 400 | settings-theme |
| `div > p.theme-hint` | 1 | Held still for anyone who asks their system for  | Alegreya Sans 13.5px 400 | settings-theme |
| `div.connection-game > p.connection-note` | 1 | Add | Commissioner Variable 12px 400 | settings-dota |
| `div.role-list > p.hint` | 1 | Drag to reorder. As the owner you can move and e | Commissioner Variable 12px 400 | server-settings-roles |
| `div.role-edit > p.hint` | 1 | ✕ deny, / take it from the role, ✓ allow. | Commissioner Variable 12px 400 | server-settings-channels |
| `div.settings-row > p.hint` | 1 | Newest first. | Commissioner Variable 12px 400 | server-settings |

## person name, large (cards)

Styles today: Commissioner Variable 19px 600 (23); Commissioner Variable 15px 650 (20); Commissioner Variable 17px 700 (7); Commissioner Variable 26px 600 (6); Commissioner Variable 20px 650 (4); Commissioner Variable 19px 650 (3); Commissioner Variable 16px 600 (3); Commissioner Variable 17px 600 (3).

| Element | Count | Example | Style | Screens |
|---|---|---|---|---|
| `div.preview-body > b.preview-name` | 23 | Ann | Commissioner Variable 19px 600 | settings-activity, settings-cs2-live, settings-theme, settings-dota, settings-bungie, … |
| `button.game-card-who > span` | 16 | Ann | Commissioner Variable 15px 650 | activity-notice, settings-activity, profile-panel, card-cs2, card-cs2-state, … |
| `div.activity-body > h3` | 7 | Counter-Strike 2 | Commissioner Variable 17px 700 | card-cs2, card-cs2-state, play-grid-full, theme-owner, card-dota, … |
| `div.card > h1` | 6 | Ann | Commissioner Variable 26px 600 | card-cs2, play-grid-full, theme-owner, card-dota, card-destiny, … |
| `div.person-body > div.person-name` | 4 | Bob | Commissioner Variable 20px 650 | link-preview, profile-panel-call, people-row, invite-card |
| `figcaption > span.row-title` | 4 | You | Commissioner Variable 15px 650 | profile-panel-call, server-voice, bars-call |
| `div.pop-body > h2.pop-name` | 3 | Ann | Commissioner Variable 19px 650 | profile-panel, play-grid-mini, profile-panel-call |
| `div.cs2-head > span.cs2-map` | 3 | Mirage | Commissioner Variable 16px 600 | card-cs2-state, settings-cs2-live, theme-owner |
| `div.destiny-activity > span.destiny-activity-name` | 3 | Salvation's Edge | Commissioner Variable 17px 600 | settings-bungie, card-destiny, card-destiny-loadout |

## timestamp and delivery state

Styles today: Commissioner Variable 12px 400 (36); Commissioner Variable 11px 400 (11).

| Element | Count | Example | Style | Screens |
|---|---|---|---|---|
| `div.msg-head > time` | 36 | 09:13 PM | Commissioner Variable 12px 400 | link-preview, profile-panel-call, people-row, conversation, server, … |
| `div.msg-main > span.msg-status.delivered` | 11 | Delivered | Commissioner Variable 11px 400 | link-preview, server, menu-person, poke-picker, server-settings-roles, … |

## big number (score, light level)

Styles today: Commissioner Variable 22px 650 (16); Commissioner Variable 22px 700 (5); Commissioner Variable 22px 400 (5); Commissioner Variable 12px 400 (4); Commissioner Variable 26px 600 (4); Commissioner Variable 22px 600 (3).

| Element | Count | Example | Style | Screens |
|---|---|---|---|---|
| `div.game-card-bottom > div.game-card-score` | 16 | Counter-Strike 2 | Commissioner Variable 22px 650 | activity-notice, settings-activity, profile-panel, card-cs2, card-cs2-state, … |
| `section.glance > span.glance-score.ahead` | 5 | 7 | Commissioner Variable 22px 700 | profile-panel, settings-cs2-live, play-grid-mini, settings-theme, settings-dota |
| `span.glance-score.ahead > span` | 5 | – | Commissioner Variable 22px 400 | profile-panel, settings-cs2-live, play-grid-mini, settings-theme, settings-dota |
| `div.destiny-guardian > b.destiny-light` | 3 | 2010 | Commissioner Variable 22px 600 | settings-bungie, card-destiny, card-destiny-loadout |
| `span.cs2-team.ct.ours > span` | 2 | CT | Commissioner Variable 12px 400 | card-cs2-state, settings-cs2-live |
| `span.cs2-team.ct.ours > b` | 2 | 7 | Commissioner Variable 26px 600 | card-cs2-state, settings-cs2-live |
| `span.cs2-team.t > b` | 2 | 4 | Commissioner Variable 26px 600 | card-cs2-state, settings-cs2-live |
| `span.cs2-team.t > span` | 2 | T | Commissioner Variable 12px 400 | card-cs2-state, settings-cs2-live |

## server name on its banner

Styles today: Bodoni Moda Variable 22px 600 (25); Commissioner Variable 16px 600 (2).

| Element | Count | Example | Style | Screens |
|---|---|---|---|---|
| `span.server-title > span.server-name` | 25 | Smoke Server | Bodoni Moda Variable 22px 600 | server, server-unread, menu-channel, server-voice, bars-call, … |
| `div.banner-preview > span.server-name` | 2 | Smoke Server | Commissioner Variable 16px 600 | server-banner, gif-picker |

## empty-state title

Styles today: Commissioner Variable 22px 600 (16).

| Element | Count | Example | Style | Screens |
|---|---|---|---|---|
| `div.empty-state > p.empty-title` | 16 | No friends yet | Commissioner Variable 22px 600 | home-ivory, server-unread, menu-channel, server-voice, bars-call, … |

## wordmark

Styles today: Commissioner Variable 15px 600 (6); Commissioner Variable 40px 600 (1).

| Element | Count | Example | Style | Screens |
|---|---|---|---|---|
| `div[status] > span.splash-word` | 6 | Eleusinia | Commissioner Variable 15px 600 | splash |
| `header.threshold-head > span.wordmark.large` | 1 | Eleusinia | Commissioner Variable 40px 600 | setup |

## link

Styles today: Commissioner Variable 14px 400 (3); Commissioner Variable 14px 600 (2).

| Element | Count | Example | Style | Screens |
|---|---|---|---|---|
| `p.msg-text > a.msg-link` | 3 | http://127.0.0.1:50584/fog | Commissioner Variable 14px 400 | link-preview, profile-panel-call, people-row |
| `div.link-text > a.link-title` | 2 | A page about fog | Commissioner Variable 14px 600 | link-preview, profile-panel-call |

## tooltip and popover

Styles today: Alegreya Sans 13.5px 400 (4).

| Element | Count | Example | Style | Screens |
|---|---|---|---|---|
| `span > span` | 4 | Counter-Strike 2 | Alegreya Sans 13.5px 400 | play-grid-mini |
