import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { monadTestnet } from "./contracts";

export const config = getDefaultConfig({
  appName: "Sunergy",
  projectId: process.env.NEXT_PUBLIC_WC_PROJECT_ID ?? "sunergy-monad-testnet",
  chains: [monadTestnet],
  ssr: true,
});
