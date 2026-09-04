---
name: kit-onchain
description: Implement or review Solidity, Foundry, viem, wagmi, wallet, contract-address, gas, indexing, deployment, or Ethereum security work.
---

# Kit onchain

Fetch and read `https://ethskills.com/SKILL.md` first for current Ethereum facts and follow the relevant routed material. Verify protocol and contract addresses from primary sources; never supply them from memory.

Foundry owns `packages/contracts`. `packages/chain` owns validated addresses and non-React viem access inside Effect services. Browser accounts and transaction signing belong to wagmi in `apps/web`; user private keys never do.

Use Anvil and testnets by default. Run Forge unit and fuzz tests for contract changes. Deployment, mainnet actions, and systems that custody value require explicit user direction; ETHSkills review is a pre-audit aid, not a substitute for an independent audit.
