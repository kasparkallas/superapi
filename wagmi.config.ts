import { defineConfig } from '@wagmi/cli'
import bundledAbi from "@superfluid-finance/ethereum-contracts/build/bundled-abi.json" assert { type: "json" };
import { Abi, Address } from 'viem';
import superfluidMetadata from "@superfluid-finance/metadata";

export default defineConfig({
  out: 'src/generated.ts',
  contracts: [
    {
      name: "Super Token",
      abi: bundledAbi.SuperToken as Abi,
    },
    {
      name: "CFA",
      abi: bundledAbi.ConstantFlowAgreementV1 as Abi,
      address: superfluidMetadata.networks.reduce(
        (acc, network) => {
          acc[network.chainId] = network.contractsV1.cfaV1 as Address;
          return acc;
        },
        {} as Record<number, Address>,
      ),
    },
    {
      name: "GDA",
      abi: bundledAbi.GeneralDistributionAgreementV1 as Abi,
      address: superfluidMetadata.networks.reduce(
        (acc, network) => {
          if (network.contractsV1.gdaV1) {
            acc[network.chainId] = network.contractsV1.gdaV1 as Address;
          }
          return acc;
        },
        {} as Record<number, Address>,
      ),
    },
  ],
  plugins: [
  ],
})
