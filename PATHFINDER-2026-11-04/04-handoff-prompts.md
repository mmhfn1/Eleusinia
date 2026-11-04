# Handoff prompts

## U1: shared value clamps

```
/make-plan Create src/shared/clean.ts exporting num(v: unknown, max = 1e6) and str(v: unknown, max: number), copied exactly from src/shared/cs2.ts:39 (num) and src/shared/activity.ts:67 (str). Delete the local copies and import them in: src/shared/cs2.ts:39, src/shared/dota.ts:50, src/shared/destiny.ts:44 (num), src/shared/destiny.ts:43 (text -> str, rename the uses) and src/shared/activity.ts:67 (str). Do NOT touch src/shared/links.ts:41 (it collapses whitespace), src/shared/reports.ts:53 (it returns an empty string) or activity.ts:68 int: they behave differently. No other helpers, no options. Verify with npm run typecheck and npm test (gsi, dota, destiny and activity tests must pass unchanged). Flowchart: PATHFINDER-2026-11-04/01-flowcharts/5-activity.md. Repo conventions: no semicolons, single quotes, 2-space indent.
```

## U2: one backoff formula in node.ts

```
/make-plan In src/main/node.ts add one local function later(n: number, base: number) returning Date.now() + base * Math.min(2 ** (n - 1), 20), and use it in backOff (node.ts:595-597, base redialMs) and relayFailed (node.ts:458-464, base RETRY). Keep the maps retries, fails and retryAt as they are: they track different things and are reset at different times. Do NOT add a backoff class, a config option or a shared module. Verify with npm run typecheck, npm test (the strict relay tests in test/node.test.ts) and the three smoke modes (npm run smoke; ELEUSINIA_NO_DIRECT=1 node test/smoke.mjs .; ELEUSINIA_SMOKE_RELAYED=1 node test/smoke.mjs .), since this touches connection setup. Flowchart: PATHFINDER-2026-11-04/01-flowcharts/3-transport-relay.md.
```
