# Problem and crash reports

Testers send reports from **Settings → Help and feedback → Report a problem**. Crash reports are sent by
themselves, unless a tester turns that off in the same place. Nobody needs a GitHub account.

## How a report travels

1. The app builds the report and scrubs it (`src/shared/reports.ts`). It keeps only the last 6 characters of
   keys, and removes network addresses, user folder names and email addresses. Messages, names, pictures, window
   titles and device names are never recorded at all. The tester sees exactly what will be sent before sending.
2. It waits in the tester's `outbox` folder until the developers' inbox is reachable, through restarts too.
3. It goes peer to peer and encrypted, over the same network as chat, to the inbox key built into the app
   (`INBOX_KEY` in `src/shared/reports.ts`). No server or third party carries it.
4. The inbox checks and scrubs it again, accepts at most 20 an hour from one sender and 100 an hour from everyone together, saves it, and confirms
   receipt. The tester's copy is then deleted.
5. The inbox files it as an issue in a private GitHub repo, labelled `bug`, `feedback`, `idea` or `crash`. The
   GitHub token only exists on the inbox machine.

Only the installed app sends to the real inbox. Copies run from source (`npm run dev`) send nowhere unless
`ELEUSINIA_INBOX` names a test inbox, as `npm run smoke` does, so stopping a development run never files a report.

Diagnostics cover the last 15 minutes and live in memory only. A crash report never contains a memory dump. When
the app itself was ended abruptly (a crash, power loss, ending it in Task Manager), the next start sends a short
"closed unexpectedly" report without events, since none survived.

## Running the inbox

On the machine that should receive reports (it must be on for reports to arrive; until then they wait on the
testers' computers):

```bash
npm run inbox
```

It prints its key and where it saves reports (`%APPDATA%\Eleusinia Inbox\reports`: a `.json` and a readable
`.txt` per report). Its identity is `inbox-identity.json` in that folder: **back it up and keep it private.**
Whoever holds it receives every report, and losing it means the next build needs a new `INBOX_KEY`.

Only one machine can run the inbox at a time.

### Filing GitHub issues

1. Create a **private** repository for reports, for example `Eleusinia-reports`.
2. Create a fine-grained personal access token limited to that repository only, with **Issues: Read and write**.
3. Put this in `%APPDATA%\Eleusinia Inbox\github.json`:

   ```json
   { "token": "github_pat_…", "repo": "owner/Eleusinia-reports" }
   ```

   Or set `GITHUB_TOKEN` and `ELEUSINIA_REPORTS_REPO` in the environment instead.

Reports received while GitHub is unreachable are filed later, retried every minute. If the token may not create
labels, issues are filed without them.

### A new inbox key

If the identity is lost or leaked, delete `inbox-identity.json`, run `npm run inbox` to make a new one, put the
printed key in `INBOX_KEY` (`src/shared/reports.ts`), and ship a new build. Reports from older builds go to the
old key and are lost.
