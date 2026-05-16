# Sunergy

**Proof-of-generation for solar farms.** Sunergy is a decentralized protocol that
verifies real solar production with on-chain commit–reveal oracles and rewards
producers in **$SUN** tokens plus **ERC-1155 carbon credits** — running on
**Monad Testnet**.

```
┌──────────┐  Modbus TCP   ┌───────────────┐   commit / reveal   ┌────────────┐
│ Inverter │──────────────▶│ Raspberry Pi  │────────────────────▶│   Monad    │
└──────────┘   :502        │  sunergy-edge │     JSON-RPC tx      │  Testnet   │
                            └───────────────┘                      └─────┬──────┘
                                                                         │
                                                          ┌──────────────┴────────────┐
                                                          │ FarmRegistry · Oracle ·    │
                                                          │ Rewards · SunToken · CCNFT │
                                                          └──────────────┬────────────┘
                                                                         │
                                                          ┌──────────────┴────────────┐
                                                          │  web (Next.js · wagmi)    │
                                                          └───────────────────────────┘
```

## Repo layout

| path | what it is |
|---|---|
| [`src/`](src) | Solidity contracts — `FarmRegistry`, `Oracle`, `Rewards`, `SunToken`, `CarbonCredit` |
| [`script/Deploy.s.sol`](script/Deploy.s.sol) | Forge deploy script for Monad Testnet |
| [`test/`](test) | Foundry tests |
| [`edge/`](edge) | Raspberry Pi service — Modbus TCP reader + on-chain relay (Python) |
| [`web/`](web) | Next.js app — landing, dashboard, wallet, live simulation |
| [`.env.example`](.env.example) | Required environment variables |

## Stack

- **Contracts** — Solidity 0.8.24 + Foundry, via-IR optimizer (1M runs).
- **Chain** — Monad Testnet (chain id `10143`, RPC `https://testnet-rpc.monad.xyz`).
- **Oracle** — commit-reveal with trimmed-median aggregation, quorum-gated.
- **Edge node** — Python 3 + `pymodbus` + `web3.py`, deployable as a systemd
  service on a Raspberry Pi.
- **Web** — Next.js 16 (Turbopack), React 19, wagmi + RainbowKit, viem.
- **Live data** — the landing/dashboard streams **real solar radiation** from
  [Open-Meteo](https://open-meteo.com/) for four reference sites (Konya,
  Murcia, Antalya, Jaipur) and converts it to simulated kWh / SUN so the UI
  shows what a populated network would look like even before any farm has
  registered on-chain.

## Quick start

### 1 · Build & test the contracts

```bash
forge install              # one-time, fetches forge-std + OZ
forge build
forge test -vvv
```

### 2 · Deploy to Monad Testnet

```bash
cp .env.example .env
# fill in PRIVATE_KEY (must hold testnet MON), then:
forge script script/Deploy.s.sol \
  --rpc-url monad_testnet \
  --broadcast
```

Copy the printed addresses into `web/.env.local` as `NEXT_PUBLIC_*` vars
(template lives at the bottom of `.env.example`).

> **Testnet MON?** Faucet: <https://faucet.monad.xyz>

### 3 · Run the web app

```bash
cd web
npm install
npm run dev          # http://localhost:3000
```

Wallet connect uses RainbowKit (MetaMask, WalletConnect, Rabby, Phantom,
Safe). The landing and dashboard show the **simulated network** by default;
when you connect a wallet that holds farms, on-chain reads override the sim.

### 4 · Install the edge node on a Raspberry Pi

```bash
git clone https://github.com/justbiar/Sunergy
cd Sunergy/edge
sudo ./install.sh                              # creates user, venv, systemd unit
sudo nano /opt/sunergy-edge/config.yaml        # inverter IP, farm id, key
sudo systemctl start sunergy-edge
sudo journalctl -u sunergy-edge -f
```

Full edge-node docs in [`edge/README.md`](edge/README.md).

## How an epoch settles

1. **Epoch start** — edge node snapshots `lifetime_kwh` from the inverter over
   Modbus TCP.
2. **Commit phase** — node samples again, computes `Δ kWh = end − start`, picks
   a random salt, sends
   `commit(farmId, epoch, keccak(farmId, epoch, kwh, salt))`.
3. **Reveal phase** — node sends `reveal(farmId, epoch, kwh, salt)`.
4. **Finalize** — anyone may call `finalizeEpoch`. The oracle drops outliers,
   takes the trimmed median, and `Rewards` mints SUN and CCNFT to the farm
   operator.

State (salt, snapshot, phase progress) is persisted to disk on the Pi so a
restart never drops a reveal.

## Tokenomics

| token | type | what for |
|---|---|---|
| `SUN` | ERC-20 | `10 SUN` per kWh verified; halves every `8760` epochs (~yearly at 1h epochs) |
| `CCNFT` | ERC-1155 | one credit per `1000 kWh` (≈ 1 tCO₂e avoided) |

Configurable in [`script/Deploy.s.sol`](script/Deploy.s.sol).

## License

MIT.
