"""Sunergy Edge Node — main loop.

Lifecycle per epoch (commit-reveal):
  1. At commit phase start:
       lifetime_start = read_lifetime_kwh()       (Modbus TCP)
  2. At commit phase end / before reveal:
       lifetime_end   = read_lifetime_kwh()
       epoch_kwh_milli = round((lifetime_end - lifetime_start) * 1000)
       salt = random
       commit(farmId, epoch, epoch_kwh_milli, salt)
  3. In reveal phase:
       reveal(farmId, epoch, epoch_kwh_milli, salt)
  4. After reveal window:
       finalizeEpoch(farmId, epoch)   (anyone can call; we do it ourselves)

State is kept in memory + persisted to a small json file so restarts don't lose
the epoch's salt/start reading.
"""

from __future__ import annotations

import argparse
import json
import logging
import signal
import sys
import time
from dataclasses import dataclass
from pathlib import Path

import yaml

from .modbus_reader import ModbusConfig, ModbusReader
from .oracle_client import ChainConfig, OracleClient

log = logging.getLogger("sunergy_edge")


@dataclass
class EpochState:
    epoch: int
    lifetime_start_kwh: float | None = None
    lifetime_end_kwh: float | None = None
    kwh_milli: int | None = None
    salt_hex: str | None = None
    committed: bool = False
    revealed: bool = False
    finalized: bool = False

    def to_dict(self) -> dict:
        return self.__dict__.copy()

    @classmethod
    def from_dict(cls, d: dict) -> "EpochState":
        return cls(**d)


class EdgeNode:
    def __init__(self, cfg: dict, state_path: Path):
        self.farm_id = bytes.fromhex(cfg["farm"]["id"].removeprefix("0x"))
        if len(self.farm_id) != 32:
            raise ValueError("farm.id must be a 32-byte hex string")

        self.modbus = ModbusReader(ModbusConfig(**cfg["modbus"]))
        self.oracle = OracleClient(ChainConfig(**cfg["chain"]))
        self.poll = cfg["polling"]

        self.state_path = state_path
        self.state: EpochState | None = self._load_state()
        self._stop = False

    # ── persistence ──────────────────────────────────────────────────────────
    def _load_state(self) -> EpochState | None:
        if not self.state_path.exists():
            return None
        try:
            return EpochState.from_dict(json.loads(self.state_path.read_text()))
        except Exception as e:
            log.warning("corrupt state file, ignoring: %s", e)
            return None

    def _save_state(self) -> None:
        if self.state is None:
            return
        self.state_path.write_text(json.dumps(self.state.to_dict(), indent=2))

    # ── per-epoch flow ───────────────────────────────────────────────────────
    def _ensure_state_for(self, epoch: int) -> EpochState:
        if self.state is None or self.state.epoch != epoch:
            # Snapshot lifetime energy at the start of this epoch.
            lifetime = self.modbus.read_lifetime_kwh()
            self.state = EpochState(epoch=epoch, lifetime_start_kwh=lifetime)
            self._save_state()
            log.info("new epoch %s · lifetime_start=%.3f kWh", epoch, lifetime)
        return self.state

    def _do_commit(self, st: EpochState) -> None:
        if st.committed:
            return
        if st.lifetime_start_kwh is None:
            st.lifetime_start_kwh = self.modbus.read_lifetime_kwh()
        st.lifetime_end_kwh = self.modbus.read_lifetime_kwh()
        delta_kwh = max(0.0, st.lifetime_end_kwh - st.lifetime_start_kwh)
        st.kwh_milli = int(round(delta_kwh * 1000))      # contract resolution: kWh × 1e3
        salt = self.oracle.random_salt()
        st.salt_hex = "0x" + salt.hex()
        self.oracle.commit(self.farm_id, st.epoch, st.kwh_milli, salt)
        st.committed = True
        self._save_state()
        log.info("committed epoch %s · delta=%.3f kWh (%d mWh)", st.epoch, delta_kwh, st.kwh_milli)

    def _do_reveal(self, st: EpochState) -> None:
        if st.revealed or not st.committed:
            return
        if st.kwh_milli is None or st.salt_hex is None:
            log.warning("no commit secret to reveal for epoch %s", st.epoch)
            return
        salt = bytes.fromhex(st.salt_hex.removeprefix("0x"))
        self.oracle.reveal(self.farm_id, st.epoch, st.kwh_milli, salt)
        st.revealed = True
        self._save_state()

    def _do_finalize(self, st: EpochState) -> None:
        if st.finalized:
            return
        try:
            self.oracle.finalize(self.farm_id, st.epoch)
            st.finalized = True
            self._save_state()
        except Exception as e:
            # Another validator may already have finalized; that's fine.
            log.info("finalize skipped for epoch %s: %s", st.epoch, e)
            st.finalized = True
            self._save_state()

    # ── main loop ────────────────────────────────────────────────────────────
    def stop(self, *_):
        self._stop = True
        log.info("stopping")

    def run(self) -> None:
        if not self.modbus.connect():
            sys.exit(1)
        signal.signal(signal.SIGINT, self.stop)
        signal.signal(signal.SIGTERM, self.stop)

        try:
            while not self._stop:
                try:
                    self._tick()
                except Exception as e:
                    log.exception("tick failed: %s", e)
                time.sleep(self.poll["epoch_check_s"])
        finally:
            self.modbus.close()

    def _tick(self) -> None:
        epoch = self.oracle.current_epoch()
        st = self._ensure_state_for(epoch)

        if self.oracle.is_commit_phase(epoch) and not st.committed:
            self._do_commit(st)
        elif self.oracle.is_reveal_phase(epoch) and not st.revealed:
            self._do_reveal(st)
        elif self.oracle.is_finalizable(epoch) and not st.finalized:
            self._do_finalize(st)


# ────────────────────────────────────────────────────────────────────────────
# CLI
# ────────────────────────────────────────────────────────────────────────────

def _parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(prog="sunergy-edge")
    p.add_argument("-c", "--config", default="config.yaml", help="config file path")
    p.add_argument("--state", default="edge_state.json", help="persistent state file")
    p.add_argument("--once", action="store_true", help="run one tick and exit (for testing)")
    p.add_argument("--read-only", action="store_true", help="just print Modbus reading and exit")
    return p.parse_args()


def main() -> None:
    args = _parse_args()
    cfg = yaml.safe_load(Path(args.config).read_text())
    logging.basicConfig(
        level=cfg.get("polling", {}).get("log_level", "INFO"),
        format="%(asctime)s %(levelname)s %(name)s · %(message)s",
    )

    if args.read_only:
        mb = ModbusReader(ModbusConfig(**cfg["modbus"]))
        if not mb.connect():
            sys.exit(1)
        try:
            kwh = mb.read_lifetime_kwh()
            print(f"lifetime energy: {kwh:.3f} kWh")
        finally:
            mb.close()
        return

    node = EdgeNode(cfg, Path(args.state))
    if args.once:
        node._tick()
        return
    node.run()


if __name__ == "__main__":
    main()
