"""Modbus TCP wrapper. Reads the inverter's lifetime energy register."""

from __future__ import annotations

import logging
from dataclasses import dataclass

from pymodbus.client import ModbusTcpClient
from pymodbus.exceptions import ModbusException

log = logging.getLogger(__name__)


@dataclass
class ModbusConfig:
    host: str
    port: int
    unit_id: int
    energy_register: int
    energy_register_count: int
    unit: str  # "Wh" or "kWh"


class ModbusReader:
    """Connects to a Modbus TCP inverter and reads lifetime energy.

    Default mapping targets SunSpec model 103 (3-phase inverter). Override
    register addresses in config for vendor-specific maps (Growatt, Huawei, etc).
    """

    def __init__(self, cfg: ModbusConfig):
        self.cfg = cfg
        self._client = ModbusTcpClient(host=cfg.host, port=cfg.port, timeout=5)

    def connect(self) -> bool:
        ok = self._client.connect()
        if ok:
            log.info("modbus connected %s:%s unit=%s", self.cfg.host, self.cfg.port, self.cfg.unit_id)
        else:
            log.error("modbus connect failed %s:%s", self.cfg.host, self.cfg.port)
        return ok

    def close(self) -> None:
        self._client.close()

    def read_lifetime_kwh(self) -> float:
        """Read lifetime energy from the configured register and return kWh."""
        rr = self._client.read_holding_registers(
            address=self.cfg.energy_register,
            count=self.cfg.energy_register_count,
            slave=self.cfg.unit_id,
        )
        if rr.isError():
            raise ModbusException(f"read error at {self.cfg.energy_register}: {rr}")

        raw = self._combine_registers(rr.registers)
        if self.cfg.unit.lower() == "wh":
            return raw / 1000.0
        if self.cfg.unit.lower() == "kwh":
            return float(raw)
        raise ValueError(f"unknown unit {self.cfg.unit!r}, expected Wh or kWh")

    @staticmethod
    def _combine_registers(regs: list[int]) -> int:
        """Combine 16-bit holding registers (big-endian word order) into a uint."""
        out = 0
        for r in regs:
            out = (out << 16) | (r & 0xFFFF)
        return out
