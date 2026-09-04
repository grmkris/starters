import { baseSepolia, foundry } from "viem/chains";
import { createConfig, http } from "wagmi";
import { injected } from "wagmi/connectors";

export const wagmiConfig = createConfig({
  chains: [foundry, baseSepolia],
  connectors: [injected()],
  transports: {
    [foundry.id]: http(),
    [baseSepolia.id]: http(),
  },
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
