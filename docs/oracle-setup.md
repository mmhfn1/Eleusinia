# Setting up the hosted relay on Oracle Cloud

The hosted relay from `design/plan-public-relay.md`: an always-on server with a public address that links any two
Eleusinia users who cannot reach each other, and carries the developers' inbox. Parts A and B set up the
server; part C installs the relay program (`src/relay/main.ts`).

The app finds the relay by its **public key**, never by IP address, so the server's IP may change without a new
release. The key file is what must never be lost: a new key needs a new app release.

## A. The Oracle account and the server (now)

1. Sign up at cloud.oracle.com. The **home region is permanent** and the only one the free tier covers: pick the one
   nearest the middle of the testers (ping times between testers today are 170–220 ms). A card is needed to verify the
   account; Always Free resources are not charged.
2. Recommended: upgrade the account to **Pay As You Go** (Billing → Upgrade). Always Free resources stay free, and
   Oracle stops reclaiming servers it considers idle, which a mostly quiet relay would be. Add a budget alert at 1 in
   your currency (Billing → Budgets) so any charge is noticed at once.
3. Compute → Instances → Create instance:
   - Image: **Canonical Ubuntu 24.04**.
   - Shape: Ampere **VM.Standard.A1.Flex**, 1 OCPU and 6 GB memory (plenty for a relay and the inbox; the free tier
     allows up to 4 OCPU and 24 GB in total).
   - Networking: the default new VCN with a public subnet, **Assign a public IPv4 address** on.
   - SSH keys: upload your public key (`ssh-keygen -t ed25519` on your PC if you have none). Keep the private key.
   - "Out of capacity": try another availability domain, or again a few hours later. Free ARM capacity is often
     short in popular regions.
4. Note the public IP shown on the instance page and log in: `ssh ubuntu@<ip>`.

## B. The two firewalls (now)

The relay listens on a fixed UDP port, **49737**, but hyperdht also opens a second UDP socket on a random port
(Linux's 32768–60999), and that is where the DHT forwards connection handshakes. So the whole range must be open, not
only 49737: with only 49737 open, `nat.cjs` and the relay both say `firewalled=false` while every dial to it fails
with `PEER_CONNECTION_FAILED`. Oracle blocks it in two places, and missing either one has the same effect.

1. **Oracle's Security List:** Networking → Virtual cloud networks → your VCN → Security Lists → Default → Add
   Ingress Rule: source `0.0.0.0/0`, IP protocol **UDP**, destination port range **32768-60999**.
2. **The server's own firewall** (Oracle's Ubuntu image ships iptables rules that reject everything but SSH):

   ```bash
   sudo iptables -I INPUT 1 -p udp --dport 32768:60999 -j ACCEPT
   sudo netfilter-persistent save
   ```

   Nothing else listens there (`sudo ss -ulpn`: only resolved on localhost, DHCP and rpcbind on 111).

3. Basic hardening while you are there:

   ```bash
   sudo apt update && sudo apt -y full-upgrade && sudo apt -y install unattended-upgrades git
   sudo adduser --system --group --home /var/lib/eleusinia eleusinia
   ```

   SSH with keys only is Oracle's default; leave password login off.

## C. The relay

The relay is one bundled file, `relay.cjs`, plus its two dependencies (`hyperdht`, `blind-relay`, pinned in
`deploy/relay/package.json`). It is built on your PC, since building on the server would need the whole app's
`npm ci` (Electron included); the server only installs the two dependencies.

1. Node 22 LTS on the server:

   ```bash
   curl -fsSL https://deb.nodesource.com/setup_22.x | sudo bash - && sudo apt -y install nodejs
   ```

2. On your PC, in the repository: build, then copy the files over.

   ```bash
   npm run relay:build
   scp deploy/relay/relay.cjs deploy/relay/package.json scripts/nat.cjs deploy/relay.service ubuntu@<ip>:
   ```

3. On the server, put them in place and install the two dependencies as the `eleusinia` user:

   ```bash
   sudo mkdir -p /var/lib/eleusinia/relay-app
   sudo mv ~/relay.cjs ~/package.json ~/nat.cjs /var/lib/eleusinia/relay-app/
   sudo chown -R eleusinia:eleusinia /var/lib/eleusinia/relay-app
   cd /var/lib/eleusinia/relay-app && sudo -u eleusinia npm install --omit=dev
   ```

4. Check the network sees the server as open, while the relay is not running (the check takes the relay's port,
   49737, which is hyperdht's default). It must print `firewalled=false randomized=false` three times:

   ```bash
   sudo -u eleusinia node nat.cjs
   ```

   If it says `firewalled=true`, one of the two firewalls in part B is still closed.
5. Create the key and print the public half:

   ```bash
   sudo -u eleusinia node relay.cjs --data /var/lib/eleusinia/relay --print-key
   ```

   The private key is in `/var/lib/eleusinia/relay/relay-key` (mode 600). **Copy it off the server**, then delete the
   copy in the home folder:

   ```bash
   sudo install -m 600 -o ubuntu /var/lib/eleusinia/relay/relay-key ~/relay-key   # on the server
   scp ubuntu@<ip>:relay-key %USERPROFILE%\.eleusinia\relay-key                    # on your PC
   rm ~/relay-key                                                                   # on the server
   ```

   Keep it with your other signing material. Never commit it.
6. Start it for good:

   ```bash
   sudo mv ~/relay.service /etc/systemd/system/eleusinia-relay.service
   sudo systemctl daemon-reload && sudo systemctl enable --now eleusinia-relay
   journalctl -u eleusinia-relay -f
   ```

   The first line says `firewalled=false randomized=false` again, from the relay's own port. Then, every minute, only
   counts: pairs open, bytes relayed since start and this month (kept in `/var/lib/eleusinia/relay/usage.json`), and
   refusals in that minute, with a warning past 80 % of 10 TB.
7. Updating the relay later: `npm run relay:build` and the `scp` of `relay.cjs` (step 2), then on the server
   `sudo mv ~/relay.cjs /var/lib/eleusinia/relay-app/ && sudo systemctl restart eleusinia-relay`. Links through it drop
   for a few seconds and come back by themselves.

Trying it on your PC first: `npm run relay -- --print-key` (the key goes in `./relay-data`, ignored by git) and
`npm run relay` to run it; `ELEUSINIA_BOOTSTRAP` joins a local test DHT as with the app.

## D. What makes the app use it

1. The public key from C4 goes into `HOSTED_RELAYS` in `src/shared/relays.ts` (phase 4). From the next release on,
   every copy measures it at start and uses it as the fallback, with no setting for users to change.
2. Test before release: with the key in `HOSTED_RELAYS`, run `npm run dev` on two strict copies (your hotspot and a
   tester on a strict network, or a second data folder with `ELEUSINIA_DATA` on your hotspot), and check that chat, a
   call and a screen share go "through an Eleusinia relay". (`ELEUSINIA_RELAYS` cannot stand in here: it is read only
   on a local test DHT.)
3. Then merge to `main` as usual; testers get it as an update.

## E. Moving the inbox (optional, but it is why strict testers' reports never arrive)

The inbox is an Electron app today (`npm run inbox` starts the app with `--inbox`). On a server with no screen it needs
either `xvfb-run` or a plain Node entry like the relay's; the second is cleaner and is a small change, not done yet.

1. On your PC, stop the inbox. Copy `%APPDATA%\Eleusinia Inbox\inbox-identity.json` and `github.json` to
   `/var/lib/eleusinia/inbox/` on the server, owner `eleusinia`, mode 600. The identity is what testers send to
   (`INBOX_KEY`), so the app needs no change.
2. Start it there as its own systemd service. **Never run two inboxes at once**: both would file every report.
3. Log pulls (`npm run logs`) are then run on the server over SSH, or from your PC with the same identity copied back,
   only while the server's inbox is stopped.

## Costs and limits to keep in mind

- About 10 TB a month out is free: roughly 30 Mbit/s around the clock, or about 10 screen shares running non-stop.
- One region only on the free tier; testers far from it get a longer detour on relayed links.
- If the server is down, users fall back to friends and server-mates who relay, and otherwise see "Can't connect yet".
- Oracle, like any host, can see which IP addresses talk through the relay and when, never what is said.
