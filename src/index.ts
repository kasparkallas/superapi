import { Address, createPublicClient, erc20Abi, http, isAddress } from "viem";
import { findNetwork } from "./networks";
import {
  cfaAbi,
  cfaAddress,
  gdaAbi,
  gdaAddress,
  superTokenAbi,
  superfluidPoolAbi,
} from "./generated";
import { z, createRoute, OpenAPIHono } from "@hono/zod-openapi";
import { swaggerUI } from "@hono/swagger-ui";
import { getBuiltGraphSDK } from "./subgraph-protocol/.graphclient";

const app = new OpenAPIHono();

const RequestSchema = z.object({
  chain: z.coerce.number().int().positive().openapi({
    param: {
      name: "chain",
      in: "query",
    },
    example: 8453,
  }),
  token: z
    .string()
    .refine(isAddress)
    .openapi({
      param: {
        name: "token",
        in: "query",
      },
      example: "0x1efF3Dd78F4A14aBfa9Fa66579bD3Ce9E1B30529",
    }),
  account: z
    .string()
    .refine(isAddress)
    .openapi({
      param: {
        name: "account",
        in: "query",
      },
      example: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
    }),
});

const ResponseSchema = z
  .object({
    chain: z.number(),
    token: z.string().refine(isAddress),
    account: z.string().refine(isAddress),
    connectedNetFlow: z.coerce.string(),
    connectedBalance: z.coerce.string(),
    unconnectedBalance: z.coerce.string(),
    timestamp: z.coerce.string(),
    maybeCriticalAt: z
      .coerce
      .string()
      .nullable(),
    underlyingToken: z.object({
      address: z.string().refine(isAddress),
      balance: z.coerce.string(),
      decimals: z.coerce.number().int(),
    }).nullable(),
  })
  .strict()
  .openapi("SuperTokenBalance");

const route = createRoute({
  method: "get",
  path: "/super-token-balance",
  request: {
    query: RequestSchema,
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: ResponseSchema,
        },
      },
      description: "Retrieve the balance and flow rate for the user.",
    },
  },
});

app.openapi(route, async (c) => {
  const { account, chain, token } = c.req.valid("query");
  const network = findNetwork(chain);

  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,HEAD,POST,OPTIONS",
    "Access-Control-Max-Age": "86400",
  };

  if (!network) {
    throw new Error("How to better handle this?");
    // return c.text("Network not found");
  }

  const subgraphClient = getBuiltGraphSDK({
    url: `https://${network.metadata.name}.subgraph.x.superfluid.dev`,
  });

  const [{ poolMembers }, { token: superToken }] = await Promise.all([
    subgraphClient.GetPoolsThatCouldHaveClaimableBalance({
      account: account.toLowerCase(),
      token: token.toLowerCase(),
    }),
    subgraphClient.GetToken({
      token: token.toLowerCase(),
    })
  ]);

  if (!superToken || !superToken.isSuperToken) {
    throw new Error("Token not found");
  }

  const poolIds = [...new Set(poolMembers.map((x) => x.pool.id as Address))];

  if (poolIds.length === 2000) {
    throw new Error("Too many pools");
  }

  const publicClient = createPublicClient({
    chain: network.chain,
    transport: http(`https://${network.metadata.name}.rpc.x.superfluid.dev`),
    batch: {
      multicall: true,
    },
  });

  const chainId = network.chain.id;
  const isGDAsupported = gdaAddress[chainId as keyof typeof gdaAddress];

  const [realtimeBalanceOfNow, cfaFlowRate, underlyingTokenBalance, gdaFlowRate, ...claimableNows] =
    await Promise.all([
      publicClient.readContract({
        abi: superTokenAbi,
        address: token,
        functionName: "realtimeBalanceOfNow",
        args: [account],
      }),
      publicClient.readContract({
        abi: cfaAbi,
        address: cfaAddress[chainId as keyof typeof cfaAddress],
        functionName: "getNetFlow",
        args: [token, account],
      }),
      superToken.underlyingToken ?
        publicClient.readContract({
          abi: erc20Abi,
          address: superToken.underlyingToken.id as Address,
          functionName: "balanceOf",
          args: [account],
        }) : Promise.resolve(null),
      isGDAsupported
        ? publicClient.readContract({
          abi: gdaAbi,
          address: gdaAddress[chainId as keyof typeof gdaAddress],
          functionName: "getNetFlow",
          args: [token, account],
        })
        : Promise.resolve(null),
      ...(isGDAsupported
        ? poolIds.map((poolId) =>
          publicClient.readContract({
            abi: superfluidPoolAbi,
            address: poolId,
            functionName: "getClaimableNow",
            args: [account],
          })
        )
        : []),
    ]);

  const connectedNetFlow = cfaFlowRate + (gdaFlowRate ?? 0n);

  const [connectedBalance, _deposit, _owedDeposit, timestamp] =
    realtimeBalanceOfNow;

  let maybeCriticalAt = null;
  if (connectedNetFlow < 0n) {
    if (connectedBalance >= 0n) {
      const hasRemainder =
        connectedBalance % connectedNetFlow === 0n ? false : true;
      const timeToCritical =
        connectedBalance / -connectedNetFlow + (hasRemainder ? 1n : 0n);
      maybeCriticalAt = timestamp + timeToCritical;
    } else {
      maybeCriticalAt = timestamp;
    }
  }

  const unconnectedBalance = claimableNows.reduce((acc, curr) => {
    return acc + curr[0];
  }, 0n);

  const response = ResponseSchema.parse({
    chain,
    token,
    account,
    connectedNetFlow,
    connectedBalance,
    unconnectedBalance,
    timestamp,
    maybeCriticalAt,
    underlyingToken: superToken.underlyingToken ? {
      address: superToken.underlyingToken.id as Address,
      balance: underlyingTokenBalance,
      decimals: superToken.underlyingToken.decimals
    } : null
  });

  return c.json(response, 200, corsHeaders);
});

app.doc31("/api/doc", {
  openapi: "3.1.0",
  info: {
    version: "1.0.0",
    title: "My unofficial Superfluid API",
  },
});

app.get("/", swaggerUI({ url: "/api/doc" }));

export default app;
