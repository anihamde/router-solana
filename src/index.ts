import yargs from "yargs";
import { hideBin } from "yargs/helpers";

import { PublicKey } from "@solana/web3.js";
import { Router } from "./router";
import { StopRoot } from "./types";
import { isOneUndefined } from "./utils";
import { INTER_TOKENS } from "./const";


const argv = yargs(hideBin(process.argv))
  .option("endpointSolana", {
    description: "Solana RPC endpoint.",
    type: "string",
    demandOption: true,
  })
  .option("user", {
    description: "Public key of the user looking to swap.",
    type: "string",
    demandOption: true,
  })
  .option("token-in", {
    description: "Input token to convert.",
    type: "string",
    demandOption: true,
  })
  .option("token-out", {
    description: "Output token to convert to.",
    type: "string",
    demandOption: true,
  })
  .option("amount-in", {
    description: "Amount of input token to convert. If this is specified, amount-out must not be specified.",
    type: "number",
  })
  .option("amount-out", {
    description: "Amount of output token to convert to. If this is specified, amount-in must not be specified.",
    type: "number",
  })
  .option("maxHops", {
    description:
      "Max number of swaps to get to output token. Default is 2.",
    type: "number",
    default: 3,
  })
  .help()
  .alias("help", "h")
  .parseSync();

async function run() {
    const router = new Router(INTER_TOKENS, argv.maxHops, new URL(argv.endpointSolana));

    const user = new PublicKey(argv.user);
    const tokenIn = new PublicKey(argv.tokenIn);
    const tokenOut = new PublicKey(argv.tokenOut);

    const amountIn = argv.amountIn;
    const amountOut = argv.amountOut;

    isOneUndefined(amountIn, amountOut);

    const parent: StopRoot = {
        name: 'ROOT',
        tokenIn: tokenIn,
        tokenOut: tokenOut,
        amountIn: amountIn,
        amountOut: amountOut,
        tokensUsed: [tokenIn],
        level: 0,
    };

    await router.initMarkets();
    // sleep
    await new Promise(resolve => setTimeout(resolve, 5000));
    const graph = await router.route(
        user,
        0,
        parent,
        tokenIn,
        tokenOut,
        amountIn,
        amountOut,
    );
    // graph.forEach((node) => {console.log(node.level, node.tokenIn.toString(), node.tokenOut.toString(), node.amountIn, node.amountOut, node.tokensUsed.map((token) => token.toString()) )});

    const bestRoute = router.findBestRoute(graph, tokenIn, tokenOut, true);
    console.log('Best route:', bestRoute);
    console.log('\nTransaction: ');
    bestRoute.forEach((node) => {console.log(node.instructions)});
}

run();