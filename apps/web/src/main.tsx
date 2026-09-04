import "@agent-native/ui/globals.css";
import { TooltipProvider } from "@agent-native/ui/components/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { WagmiProvider } from "wagmi";

import { wagmiConfig } from "./lib/wagmi";
import { router } from "./router";

const root = document.querySelector("#root");
if (!root) {
  throw new Error("Missing #root mount point");
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
    },
  },
});

createRoot(root).render(
  <StrictMode>
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <RouterProvider router={router} />
        </TooltipProvider>
      </QueryClientProvider>
    </WagmiProvider>
  </StrictMode>
);
