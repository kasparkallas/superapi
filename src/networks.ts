import sfMeta from "@superfluid-finance/metadata";
import {
  arbitrum,
  avalanche,
  avalancheFuji,
  base,
  baseSepolia,
  bsc,
  celo,
  degen,
  gnosis,
  mainnet,
  optimism,
  optimismSepolia,
  polygon,
  scroll,
  scrollSepolia,
  sepolia
} from 'viem/chains'

const viemChains = [
  mainnet,
  gnosis,
  polygon,
  optimism,
  arbitrum,
  avalanche,
  bsc,
  celo,
  degen,
  base,
  baseSepolia,
  scroll,
  avalancheFuji,
  sepolia,
  optimismSepolia,
  scrollSepolia
] as const;

if (sfMeta.networks.length !== viemChains.length) {
  throw new Error('Networks length mismatch')
}

export const findNetwork = (chainId: number) => {
    const superfluidNetwork = sfMeta.networks.find(n => n.chainId === chainId);
    const viemChain = viemChains.find(n => n.id === chainId);

    if (superfluidNetwork && viemChain) {
        return {
            metadata: superfluidNetwork,
            chain: viemChain
        }
    } else {
        return null;
    }
}