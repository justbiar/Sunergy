import { defineChain } from "viem";

export const monadTestnet = defineChain({
  id: 10143,
  name: "Monad Testnet",
  nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://testnet-rpc.monad.xyz"] },
  },
  blockExplorers: {
    default: { name: "Monad Explorer", url: "https://testnet.monadexplorer.com" },
  },
  testnet: true,
});

// Filled in after `forge script script/Deploy.s.sol --rpc-url monad_testnet --broadcast`.
// Until deployed these stay as zero addresses; on-chain reads return empty,
// the solar simulation still drives the UI.
export const CONTRACTS = {
  farmRegistry: (process.env.NEXT_PUBLIC_FARM_REGISTRY ?? "0x0000000000000000000000000000000000000000") as `0x${string}`,
  oracle:       (process.env.NEXT_PUBLIC_ORACLE        ?? "0x0000000000000000000000000000000000000000") as `0x${string}`,
  rewards:      (process.env.NEXT_PUBLIC_REWARDS       ?? "0x0000000000000000000000000000000000000000") as `0x${string}`,
  snrToken:     (process.env.NEXT_PUBLIC_SUN_TOKEN     ?? "0x0000000000000000000000000000000000000000") as `0x${string}`,
  carbonCredit: (process.env.NEXT_PUBLIC_CARBON        ?? "0x0000000000000000000000000000000000000000") as `0x${string}`,
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
