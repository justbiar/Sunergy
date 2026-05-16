import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { monadLocal } from "./contracts";

export const config = getDefaultConfig({
  appName: "Sunergy",
  projectId: "sunergy-local-dev",
  chains: [monadLocal],
  ssr: true,
});
