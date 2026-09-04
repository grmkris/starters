import { Button } from "@agent-native/ui/components/button";
import { PlugZapIcon, UnplugIcon } from "lucide-react";
import { useConnect, useConnection, useConnectors, useDisconnect } from "wagmi";

const compactAddress = (address: string): string =>
  `${address.slice(0, 6)}…${address.slice(-4)}`;

export const WalletControl = () => {
  const connection = useConnection();
  const connectors = useConnectors();
  const { isPending, mutate: connect } = useConnect();
  const { mutate: disconnect } = useDisconnect();
  const [connector] = connectors;

  if (connection.status === "connected") {
    const address = compactAddress(connection.address);

    return (
      <Button
        aria-label={`Disconnect wallet ${address}`}
        onClick={() => {
          disconnect();
        }}
        size="sm"
        variant="outline"
      >
        <UnplugIcon data-icon="inline-start" />
        <span className="hidden sm:inline">{address}</span>
      </Button>
    );
  }

  const label = isPending ? "Connecting wallet" : "Connect wallet";

  return (
    <Button
      aria-label={label}
      disabled={connector === undefined || isPending}
      onClick={() => {
        if (connector !== undefined) {
          connect({ connector });
        }
      }}
      size="sm"
      variant="outline"
    >
      <PlugZapIcon data-icon="inline-start" />
      <span className="hidden sm:inline">{label}</span>
    </Button>
  );
};
