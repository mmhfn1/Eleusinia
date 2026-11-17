// What the public DHT thinks of this machine's network, 3 times: a hosted relay must print
// firewalled=false randomized=false (randomized: a strict router, which no relay can sit behind).
// Usage: node scripts/nat.cjs [dir with node_modules/hyperdht] (repo root, deploy/relay, or the server's relay-app)
const { join } = require('node:path')

const where = [process.argv[2], process.cwd(), __dirname, join(__dirname, '..'), join(__dirname, '../deploy/relay')]
const DHT = require(require.resolve('hyperdht', { paths: where.filter(Boolean) }))

;(async () => {
  for (let run = 1; run <= 3; run++) {
    const dht = new DHT()
    await dht.fullyBootstrapped()
    console.log(`run ${run}: firewalled=${dht.firewalled} randomized=${dht.randomized}`)
    await dht.destroy()
  }
})()
