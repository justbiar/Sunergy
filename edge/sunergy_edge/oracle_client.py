"""On-chain wrapper for SunergyOracle commit / reveal / finalize."""

from __future__ import annotations

import logging
import secrets
from dataclasses import dataclass

from eth_account import Account
from web3 import Web3
from web3.contract import Contract

log = logging.getLogger(__name__)

ORACLE_ABI = [
    {"name": "currentEpoch",  "type": "function", "stateMutability": "view",
     "inputs": [], "outputs": [{"type": "uint256"}]},
    {"name": "isCommitPhase", "type": "function", "stateMutability": "view",
     "inputs": [{"name": "epoch", "type": "uint256"}], "outputs": [{"type": "bool"}]},
    {"name": "isRevealPhase", "type": "function", "stateMutability": "view",
     "inputs": [{"name": "epoch", "type": "uint256"}], "outputs": [{"type": "bool"}]},
    {"name": "isFinalizableEpoch", "type": "function", "stateMutability": "view",
     "inputs": [{"name": "epoch", "type": "uint256"}], "outputs": [{"type": "bool"}]},
    {"name": "commit", "type": "function", "stateMutability": "nonpayable",
     "inputs": [
        {"name": "farmId", "type": "bytes32"},
        {"name": "epoch", "type": "uint256"},
        {"name": "commitHash", "type": "bytes32"},
     ], "outputs": []},
    {"name": "reveal", "type": "function", "stateMutability": "nonpayable",
     "inputs": [
        {"name": "farmId", "type": "bytes32"},
        {"name": "epoch", "type": "uint256"},
        {"name": "kwh", "type": "uint256"},
        {"name": "salt", "type": "bytes32"},
     ], "outputs": []},
    {"name": "finalizeEpoch", "type": "function", "stateMutability": "nonpayable",
     "inputs": [
        {"name": "farmId", "type": "bytes32"},
        {"name": "epoch", "type": "uint256"},
     ], "outputs": []},
]


@dataclass
class ChainConfig:
    rpc: str
    chain_id: int
    oracle_address: str
    private_key: str
    tx_timeout_s: int = 60


class OracleClient:
    def __init__(self, cfg: ChainConfig):
        self.cfg = cfg
        self.w3: Web3 = Web3(Web3.HTTPProvider(cfg.rpc, request_kwargs={"timeout": 30}))
        if not self.w3.is_connected():
            raise RuntimeError(f"rpc unreachable: {cfg.rpc}")
        self.account = Account.from_key(cfg.private_key)
        self.contract: Contract = self.w3.eth.contract(
            address=Web3.to_checksum_address(cfg.oracle_address),
            abi=ORACLE_ABI,
        )
        log.info("oracle client ready · validator=%s", self.account.address)

    # ── views ────────────────────────────────────────────────────────────────
    def current_epoch(self) -> int:
        return int(self.contract.functions.currentEpoch().call())

    def is_commit_phase(self, epoch: int) -> bool:
        return bool(self.contract.functions.isCommitPhase(epoch).call())

    def is_reveal_phase(self, epoch: int) -> bool:
        return bool(self.contract.functions.isRevealPhase(epoch).call())

    def is_finalizable(self, epoch: int) -> bool:
        return bool(self.contract.functions.isFinalizableEpoch(epoch).call())

    # ── txs ──────────────────────────────────────────────────────────────────
    def commit(self, farm_id: bytes, epoch: int, kwh: int, salt: bytes) -> tuple[str, bytes]:
        """Build commitHash = keccak256(abi.encode(farmId, epoch, kwh, salt)) and submit."""
        commit_hash = Web3.solidity_keccak(
            ["bytes32", "uint256", "uint256", "bytes32"],
            [farm_id, epoch, kwh, salt],
        )
        tx_hash = self._send(self.contract.functions.commit(farm_id, epoch, commit_hash))
        log.info("commit tx %s epoch=%s kwh*1e3=%s", tx_hash, epoch, kwh)
        return tx_hash, commit_hash

    def reveal(self, farm_id: bytes, epoch: int, kwh: int, salt: bytes) -> str:
        tx_hash = self._send(self.contract.functions.reveal(farm_id, epoch, kwh, salt))
        log.info("reveal tx %s epoch=%s kwh*1e3=%s", tx_hash, epoch, kwh)
        return tx_hash

    def finalize(self, farm_id: bytes, epoch: int) -> str:
        tx_hash = self._send(self.contract.functions.finalizeEpoch(farm_id, epoch))
        log.info("finalize tx %s epoch=%s", tx_hash, epoch)
        return tx_hash

    @staticmethod
    def random_salt() -> bytes:
        return secrets.token_bytes(32)

    # ── helpers ──────────────────────────────────────────────────────────────
    def _send(self, fn) -> str:
        addr = self.account.address
        nonce = self.w3.eth.get_transaction_count(addr, "pending")
        base_fee = self.w3.eth.gas_price
        tx = fn.build_transaction({
            "from": addr,
            "nonce": nonce,
            "chainId": self.cfg.chain_id,
            "gas": 600_000,
            "maxFeePerGas": base_fee * 2,
            "maxPriorityFeePerGas": self.w3.to_wei(1, "gwei"),
        })
        signed = self.account.sign_transaction(tx)
        tx_hash = self.w3.eth.send_raw_transaction(signed.raw_transaction)
        receipt = self.w3.eth.wait_for_transaction_receipt(tx_hash, timeout=self.cfg.tx_timeout_s)
        if receipt.status != 1:
            raise RuntimeError(f"tx reverted: {tx_hash.hex()}")
        return tx_hash.hex()
