import { Config, Context, Effect, Layer, Redacted, Schema } from "effect";
import { createPublicClient, getAddress, http } from "viem";
import { foundry } from "viem/chains";

export const Address = Schema.String.pipe(
  Schema.check(
    Schema.isPattern(/^0x[0-9a-fA-F]{40}$/u, {
      message: "Expected a 20-byte hexadecimal Ethereum address",
    })
  ),
  Schema.brand("Address")
);

export type Address = typeof Address.Type;

export class InvalidAddress extends Schema.TaggedError<InvalidAddress>()(
  "InvalidAddress",
  {
    cause: Schema.Defect(),
    input: Schema.String,
  }
) {}

export class EvmRpcError extends Schema.TaggedError<EvmRpcError>()(
  "EvmRpcError",
  {
    cause: Schema.Defect(),
    operation: Schema.String,
  }
) {}

export const parseAddress = Effect.fn("parseAddress")((input: string) =>
  Effect.try({
    catch: (cause) => new InvalidAddress({ input, cause }),
    try: () => Schema.decodeUnknownSync(Address)(getAddress(input)),
  })
);

export class EvmClient extends Context.Service<
  EvmClient,
  {
    readonly getBlockNumber: () => Effect.Effect<bigint, EvmRpcError>;
  }
>()("agent-native/chain/EvmClient") {
  static readonly layer = Layer.effect(
    EvmClient,
    Effect.gen(function* layer() {
      const rpcUrl = yield* Config.redacted("ETHEREUM_RPC_URL").pipe(
        Config.withDefault(Redacted.make("http://127.0.0.1:8545"))
      );
      const client = createPublicClient({
        chain: foundry,
        transport: http(Redacted.value(rpcUrl)),
      });

      const getBlockNumber = Effect.fn("EvmClient.getBlockNumber")(() =>
        Effect.tryPromise({
          catch: (cause) =>
            new EvmRpcError({ operation: "eth_blockNumber", cause }),
          try: async () => await client.getBlockNumber(),
        })
      );

      return EvmClient.of({ getBlockNumber });
    })
  );
}
