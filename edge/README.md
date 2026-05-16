# Sunergy Edge Node

A small Python service that runs on a Raspberry Pi (or any Linux box on the
inverter's LAN). It reads the inverter's lifetime energy register over **Modbus
TCP** and relays the per-epoch kWh to the **SunergyOracle** on Monad using a
commit–reveal flow.

```
┌──────────┐  Modbus TCP   ┌───────────────┐   commit / reveal   ┌──────────┐
│ Inverter │──────────────▶│ Raspberry Pi  │────────────────────▶│  Monad   │
└──────────┘   :502        │  sunergy-edge │     JSON-RPC tx      │ Testnet  │
                            └───────────────┘                      └──────────┘
```

## Quick start (Pi)

```bash
git clone <repo>
cd Sunergy/edge
sudo ./install.sh
sudo nano /opt/sunergy-edge/config.yaml   # set inverter IP, farm id, key
sudo systemctl start sunergy-edge
sudo journalctl -u sunergy-edge -f
```

## Quick start (any machine, for testing)

```bash
cd edge
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp config.example.yaml config.yaml
# edit config.yaml
python -m sunergy_edge.main --read-only          # just print the Modbus reading
python -m sunergy_edge.main --once               # one tick, no loop
python -m sunergy_edge.main                      # full service
```

## Config

See [config.example.yaml](config.example.yaml). Key fields:

| field | meaning |
|---|---|
| `farm.id` | `bytes32` farmId returned by `FarmRegistry.registerFarm` |
| `modbus.host` / `port` | inverter LAN address (`502` is the Modbus TCP default) |
| `modbus.energy_register` | lifetime energy register. Default `40092` = SunSpec model 103 |
| `modbus.unit` | `Wh` (SunSpec) or `kWh` (some Growatt/Huawei firmwares) |
| `chain.oracle_address` | deployed `SunergyOracle` address on Monad testnet |
| `chain.private_key` | edge validator key — must hold `VALIDATOR_ROLE` on the oracle |

> Default register `40092` is **zero-based**; subtract `1` from any SunSpec map
> value (40093 → 40092). Run with `--read-only` first to sanity-check.

## How it sees an epoch

1. **Commit phase** — snapshot lifetime kWh, send
   `commit(farmId, epoch, keccak(farmId, epoch, kwh_milli, salt))`.
2. **Reveal phase** — send `reveal(farmId, epoch, kwh_milli, salt)`.
3. **Finalize** — anyone can call `finalizeEpoch`; the node calls it too.

State (salt, snapshot, phase progress) is persisted to
`/var/lib/sunergy-edge/state.json` so a restart doesn't drop a reveal.
