import { defineChain } from "viem";

export const monadLocal = defineChain({
  id: 31337,
  name: "Sunergy Local",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: ["http://127.0.0.1:8545"] },
  },
});

export const CONTRACTS = {
  farmRegistry: "0x5FbDB2315678afecb367f032d93F642f64180aa3" as `0x${string}`,
  oracle:        "0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9" as `0x${string}`,
  rewards:       "0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9" as `0x${string}`,
  snrToken:      "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512" as `0x${string}`,
  carbonCredit:  "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0" as `0x${string}`,
};

export const FARM_REGISTRY_ABI = [
  {
    name: "registerFarm",
    type: "function",
    stateMutability: "payable",
    inputs: [
      { name: "deviceFingerprintHash", type: "bytes32" },
      { name: "equipmentCertHash",     type: "bytes32" },
      { name: "locationHash",          type: "bytes32" },
      { name: "nameplateCapacityW",    type: "uint32"  },
      { name: "countryCode",           type: "uint16"  },
    ],
    outputs: [{ name: "farmId", type: "bytes32" }],
  },
  {
    name: "activateFarm",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "farmId", type: "bytes32" }],
    outputs: [],
  },
  {
    name: "isFarmActive",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "farmId", type: "bytes32" }],
    outputs: [{ type: "bool" }],
  },
  {
    name: "getFarmOperator",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "farmId", type: "bytes32" }],
    outputs: [{ type: "address" }],
  },
  {
    name: "totalFarms",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "activeFarms",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "operatorBond",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "bonds",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "operator", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "getOperatorFarms",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "operator", type: "address" }],
    outputs: [{ type: "bytes32[]" }],
  },
  {
    name: "getFarmState",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "farmId", type: "bytes32" }],
    outputs: [
      {
        type: "tuple",
        components: [
          { name: "status",          type: "uint8"   },
          { name: "operator",        type: "address" },
          { name: "activationTime",  type: "uint32"  },
          { name: "lastAuditTime",   type: "uint32"  },
          { name: "suspensionCount", type: "uint32"  },
        ],
      },
    ],
  },
  {
    name: "FarmRegistered",
    type: "event",
    inputs: [
      { name: "farmId",   type: "bytes32", indexed: true  },
      { name: "operator", type: "address", indexed: true  },
      { name: "capacityW",type: "uint32",  indexed: false },
    ],
  },
] as const;

export const REWARDS_ABI = [
  {
    name: "pendingSnr",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "farmId", type: "bytes32" }],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "pendingRewards",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "farmId", type: "bytes32" }],
    outputs: [
      { name: "snrAmount",    type: "uint256" },
      { name: "carbonCredits", type: "uint256" },
    ],
  },
  {
    name: "claimRewards",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "farmId", type: "bytes32" }],
    outputs: [],
  },
  {
    name: "lifetimeKwh",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "farmId", type: "bytes32" }],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "lifetimeSnrMinted",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "farmId", type: "bytes32" }],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "totalVerifiedKwh",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "totalSnrMinted",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "snrPerKwh",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
] as const;

export const ERC20_ABI = [
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "totalSupply",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
] as const;
