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

Every report also says how much memory the app was using (`appMemoryMb`, all its processes together). Diagnostics cover the last 15 minutes of this session (and, past that, enough of its older lines from the last day to make 200, so a copy left open for hours still says what its call did), plus up to 200 lines from earlier sessions in the last day: those are kept, already scrubbed, in `diagnostics.json` in the app's owner-only data folder, so a crash report or a log pull after a restart or a crash still shows what happened before it (a call that failed and was followed by a restart used to leave nothing to pull). A report over the size limit loses its oldest lines rather than being turned away. A crash report never contains a memory dump. When
the app itself was ended abruptly (a crash, power loss, ending it in Task Manager; not Windows shutting down or logging off, which `session-end` catches), the next start sends a short
"closed unexpectedly" report without events, since none survived.

## Running the inbox

On the machine that should receive reports (it must be on for reports to arrive; until then they wait on the
testers' computers):

```bash
npm run inbox
```

It prints its key and where it saves reports (`%APPDATA%\Eleusinia Inbox\reports`: a `.json` and a readable
`.txt` per report). Its identity is `inbox-identity.json` in that folder: **back it up and keep it private.**
On a server, the same inbox runs without Electron as a service, pulls included: see `docs/oracle-setup.md`, part E.
Run one inbox, the server's: two with the same identity split what testers send between them, whichever one the
network finds first. An inbox that receives answers to a pull the other one made still files them under that pull,
and a new pull keeps the other one's pulls in the record (with a higher record number), but problem and crash
reports still land in either, and both file what they get when both have a GitHub token. So make pulls on the
server (below), and run a local inbox only while the server's is stopped.
Whoever holds the identity receives every report, and losing it means the next build needs a new `INBOX_KEY`.

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

### Pulling logs from testers

Tester builds can be asked for their logs without anyone writing a report:

```bash
npm run logs
```

asks every tester; `npm run logs -- kestrel#2741 a1b2c3` asks only those friend IDs or Unique Keys (the last 6
characters of a key, as Settings shows). Run it on the inbox machine after `npm run inbox` has built the app; while the
inbox runs, the command is handed to it, otherwise it starts the inbox itself. With the inbox on the server, run
`node inbox.cjs --data /var/lib/eleusinia/inbox --pull all` there instead (part E of `docs/oracle-setup.md`).

The inbox publishes the request as a record signed by its own key, which the DHT checks, so nobody else can make one.
The record holds the day's pulls, newest first (as many as fit in 1000 bytes), so a pull made right after another
does not hide it; copies from 0.1.4 and 0.1.5 read only the newest. The window running `npm run logs` says what it
asked for, and the inbox window says `pull asked for …`, then `published` or why not.
Tester copies read it every 2 minutes and once on start, and each answers a request once, within a day, with what a
crash report carries: the app and system details and the scrubbed diagnostics described above. The answers arrive
as `[logs]` reports in the reports folder. With GitHub filing set up, each pull becomes **one** issue, labelled
`logs`, 10 minutes after it was made: who was asked, who answered, and a section per tester (version, system, memory
in use and their newest events, shortened to fit GitHub's size limit). Testers who answer later, within the day, are
added as comments on that issue. Pulls and the answers to each are kept in `pulls.json` beside the reports folder,
so a restarted inbox carries on where it left off. Testers can turn this off in Settings →
Help and feedback; builds other than the tester build never answer.

### A new inbox key

If the identity is lost or leaked, delete `inbox-identity.json`, run `npm run inbox` to make a new one, put the
printed key in `INBOX_KEY` (`src/shared/reports.ts`), and ship a new build. Reports from older builds go to the
old key and are lost.
