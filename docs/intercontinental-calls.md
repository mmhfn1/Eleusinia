# Calls between continents: why they wobble, and what to do

Status: the ping display (B) and phase 1 (A, C, E, F) are built; the rest is planned in order below.

## What testers see

On calls between continents (for example Europe and Asia, or the Americas and Oceania):
- the ping number jumps around;
- the connection sign flips between orange and red;
- voice sometimes cuts out for a moment or comes back robotic.

Calls in the same country are fine.

## What is normal at that distance

| Route (typical) | Round trip on a good line |
|---|---|
| Within one country | 10–40 ms |
| Europe ↔ US East | 80–110 ms |
| Europe ↔ US West | 140–170 ms |
| Europe ↔ India | 120–180 ms |
| Europe ↔ East Asia | 200–280 ms |
| US ↔ Australia | 150–200 ms |
| Europe ↔ Australia | 250–330 ms |

On top of that come:
- **Jitter:** 10–50 ms, more on Wi-Fi or a busy uplink.
- **Loss:** 0.5–3 % on long routes, often in bursts.

A one-way delay under ~150 ms (300 ms round trip) is still a usable call. Some of what testers see is real distance; the rest is how the app reacts to it.

## Possible causes, most likely first

### 1. The connection sign treats distance as a fault

`src/shared/quality.ts`:
- grades a link *poor* at a round trip of 300 ms or more, and *fair* from 150 ms;
- uses jitter limits of 60 and 30 ms.

Most intercontinental links sit right on those lines, so the median of 5 samples over 10 s flips between fair and poor. The call can be perfectly usable while the sign says it is broken. This is part of the "wonky ping".

### 2. The ping value itself is noisy

`sampleLink` in `src/renderer/call.ts` takes `roundTripTime` from the audio `remote-inbound-rtp` report. That value only updates when an RTCP receiver report arrives, roughly every 1–5 s.

With Opus DTX on (`lightOpus`, `usedtx=1`), a silent sender sends almost nothing. The value goes stale during silence, then jumps once speech resumes and the first reports are delayed or lost. When it is missing, the code falls back to the candidate pair's round trip, which is measured differently. The displayed number can switch between two methods.

### 3. Recovery that is too eager for long, lossy routes

`src/shared/callstate.ts`:
- restarts ICE 3 s after a link goes `disconnected` (`RESTART_AFTER`);
- rebuilds after 8 s more (`RESTART_GRACE`).

Chromium marks a link `disconnected` after about 5 s without STUN consent replies. On a long route, a short burst of loss (common on undersea routes and Wi-Fi) can cause that while media is still mostly flowing.

An ICE restart then renegotiates the route. That is an audible gap of 0.5–2 s, and a rebuild is longer. The fix for a blip becomes the blip people hear: "the call becomes unstable".

### 4. The voice is not protected against burst loss

- Opus in-band FEC is on by Chromium's default. It only covers a single lost packet, and only once the receiver reports loss.
- Nothing tells the sender to expect loss: no `packetlosspercentage`, no RED.
- 20 ms packets are used, which give the most packets to lose and the most per-packet overhead.

Bursts of 2–5 lost packets, typical on long routes, come out as robotic or missing syllables.

### 5. The jitter buffer starts small and grows only after damage

Chromium's NetEQ adapts its buffer to the jitter it measures. On a link whose jitter changes in waves (Wi-Fi, a busy uplink, a congested peering point), it shrinks during calm patches and then underruns. Underruns are heard as stretched or clipped audio.

Nothing sets `RTCRtpReceiver.jitterBufferTarget`, so the buffer always starts from Chromium's minimum.

### 6. Voice competes with video and file transfers

- Screen shares and cameras are sent on the same connections.
- File transfers and the upload probe share the chat link, which may be the relay route (`src/main/relay.ts`).
- No sender sets `priority` / `networkPriority`.

On a long route, the congestion controller (GCC) reacts in multiples of the round trip. It backs off more slowly, so queues build and voice packets wait behind video. The full mesh adds to this: everyone uploads one copy per person.

### 7. Detours: the chat-link relay and a friend's relay

When routers block every direct WebRTC route, the call goes over the chat link instead (the `relay` ICE candidate). That link is a HyperDHT/UDX stream. It is usually direct after hole punching, but:

- packets over 1000 bytes go on the **reliable** stream (`network.ts` `packet()`). Voice packets are small, but video and DTLS packets are not. A loss there blocks everything behind it until it is resent, a full round trip later. On a 250 ms route that is a long stall.
- when the chat link itself goes through a mutual friend's blind relay (Settings: connect through mutual friends), the route is A → friend → B. If the friend is on a third continent, the round trip can double. The relay is also capped at 48 KB/s per pair.

The call panel already shows "relayed through the chat link". Reports from affected testers should say whether that was on.

### 8. No TURN, IPv4 only

- STUN only, through one Google STUN server. Some carrier-grade NATs (mobile hotspots, some ISPs in Asia and South America) give no usable direct route, so those calls always take the detour in cause 7.
- HyperDHT is IPv4 only, so an IPv6 path that would be shorter is never used.

### 9. The chat link's own timeout

The peer link sends keepalives every 5 s and closes after 20 s of silence. A long loss burst can close it. The call then waits out `OFFLINE_GRACE` (15 s) and reconnects. That is only a problem when the call itself also goes over that link (cause 7).

## First: measure, before changing anything

Causes 1–2 are certain from the code. Causes 3–7 need evidence from real calls. Two cheap steps:

1. **Richer call diagnostics** (in memory, sent only in a problem report, already scrubbed). Every 2 s per link, record:
   - round trip from both methods;
   - jitter;
   - loss;
   - `concealedSamples` and `concealmentEvents` (heard as glitches);
   - `jitterBufferDelay`;
   - candidate types (host / srflx / relay) and whether it is our chat-link relay;
   - connection state changes, ICE restarts and rebuilds.

   Ask affected testers to send a report right after a bad call.
2. **A reproducible bad line on one PC.** Run the smoke call under simulated distance, for example 250 ms round trip, 30 ms jitter and 2 % bursty loss:
   - [clumsy](https://jagt.github.io/clumsy/) on Windows;
   - `tc netem` in WSL or a Linux VM.

   Count ICE restarts, rebuilds and concealment events before and after each fix.

## Options

Each option lists its effort, its risk, and whether it needs `CALL_VERSION` raised.

### A. Grade links relative to distance (cause 1). Small, safe, no version change

- Grade mostly on jitter and loss, and on *changes* in round trip rather than its size. For example:
  - poor when loss ≥ 5 % or jitter ≥ 60 ms;
  - fair when loss ≥ 2 % or jitter ≥ 30 ms;
  - poor on round trip only above 450 ms.
- Show the round trip as a number, not a colour judgement.
- Smooth the shown value (median of the window), so it stops jumping.

Fixes the "wonky" look; changes nothing about the audio.

### B. Steady ping measurement (cause 2). Small, safe

- Use the candidate pair's `totalRoundTripTime / responsesReceived`, taking deltas between samples. STUN consent checks run whether or not anyone talks.
- Use the RTCP value only as a cross-check.
- Ignore samples older than the last update.

### C. Calmer recovery on long links (cause 3). Small to medium, low risk, no version change

- Before restarting ICE, check whether packets still arrive (`bytesReceived` growing on the voice receiver). If they do, wait.
- Scale `RESTART_AFTER` with the link's normal round trip and loss, for example 3 s on a short link and up to 8 s on a 250 ms one.
- Never rebuild while audio is still arriving.

Unit-testable in `callstate.ts` with the fake connection. This is likely the biggest win for "unstable".

### D. Protect the voice against loss (cause 4). Medium, low risk

- **RED for Opus** (`audio/red`, supported by Chromium): each packet also carries the previous one, so a single loss is fully hidden at the cost of about twice the voice bitrate (~64 kbps instead of 32). Turn it on per link only when measured loss stays above ~1 %. It is negotiated through codec preferences, so an older copy just ignores it; no version change.
- Let Opus know the expected loss (`packetlosspercentage` / stronger in-band FEC on lossy links).
- Optionally 40 ms packets on high-round-trip links: half the packets and half the per-packet overhead, for 20 ms more delay.

### E. A larger starting jitter buffer on jittery links (cause 5). Small, low risk

Set `receiver.jitterBufferTarget` from the measured jitter, for example 2× the jitter, capped at 150 ms, and only on links graded fair or poor. It adds a little delay to stop the stretch-and-clip. Chromium 114+ supports it, and Electron 44 does.

### F. Voice first (cause 6). Small, low risk

- Set `priority: 'high'` and `networkPriority: 'high'` on the voice sender, and `low` on screen and camera.
- Pause file transfers and the upload probe while a call link is graded poor.

This lets congestion control drop video before voice.

### G. Shorter detours (causes 7–8). Medium to large

1. Send relayed call packets as datagrams whenever they fit. Raise the 1000-byte cut, or split larger packets across datagrams, so a lost packet never stalls the reliable stream. Media stays DTLS-SRTP encrypted either way. Needs a version change if the framing changes.
2. Pick the relaying friend by measured round trip to *both* sides, not at random among the first who say yes.
3. IPv6 host candidates for WebRTC are already gathered by Chromium; HyperDHT IPv6 support would shorten some chat-link routes. That is hyperdht's work, so watch upstream.
4. TURN servers (self-hosted coturn or a paid service) fix every NAT case and give fast routes on good backbones. But it is a server, which the project avoids, it costs money, and it sees metadata. Not recommended unless the others fall short.
5. Long term, the roadmap's well-connected forwarders (`docs/roadmap-video.md`) could also forward voice for people with bad routes.

### H. Keep the chat link through loss bursts (cause 9). Small

Raise the link timeout from 20 s to 30 s while a call runs over it. It only matters together with G.

## Suggested order

1. Diagnostics and the bad-line test setup. Collect 3–5 real reports.
2. A + B: the sign and the number stop lying. One small change.
3. C: calmer recovery. Probably the biggest effect on "unstable".
4. F + E: voice priority and the jitter buffer.
5. D: RED on lossy links, if reports still show concealment.
6. G1/G2 only if reports show relayed calls are the bad ones.

Steps 2–4 need no new dependency and no version change. Each one is tested against the simulated bad line, and the call smoke modes stay green.
