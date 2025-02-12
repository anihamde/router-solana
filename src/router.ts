import { PublicKey } from "@solana/web3.js";

import { Market, Quote, Stop, StopMarket, Graph, SpecifyInputs, SpecifyOutputs } from "./types";
import { isOneUndefined } from "./utils";
import { PhoenixMarket } from "./markets/phoenix";
import { MeteoraDlmmMarket } from "./markets/meteoraDlmm";

export class Router {
    private interTokenList: PublicKey[];
    private markets: Market[];
    private maxHops: number;
    private endpointSolana: URL;
    constructor(
        interTokenList: PublicKey[],
        maxHops: number,
        endpointSolana: URL,
    ) {
        this.interTokenList = interTokenList;
        this.maxHops = maxHops;
        this.endpointSolana = endpointSolana;

        const phoenix = new PhoenixMarket();
        const meteoraDlmm = new MeteoraDlmmMarket();
        this.markets = [
            phoenix, 
            // meteoraDlmm,
        ];
    }

    public async initMarkets(): Promise<void> {
        await Promise.all(this.markets.map(async (market) => {market.init(this.endpointSolana)}));
    }

    public async route(
        user: PublicKey,
        hop: number,
        parent: Stop,
        tokenIn: PublicKey, 
        tokenOut: PublicKey,
        amountIn?: number, 
        amountOut?: number,
    ): Promise<Graph> {
        isOneUndefined(amountIn, amountOut);

        if (amountIn === undefined) {
            throw new Error('Not implemented');
        }

        let graph: Graph = [];

        if (hop < this.maxHops-1) {
            let currGraph = await this.getChildren(user, parent, tokenOut, {tokenIn, amountIn}, undefined);

            let postGraph: Graph = [];
            for (const stopRel of currGraph) {
                postGraph = postGraph.concat(await this.route(user, hop+1, stopRel, stopRel.tokenOut, tokenOut, stopRel.amountOut, undefined));
            }

            graph = graph.concat([...currGraph, ...postGraph]);
        }

        const bestQuote = await this.getBestQuote(tokenIn, tokenOut, amountIn, amountOut);
        if (bestQuote !== undefined) {
            const stop = await this.createStopMarket(bestQuote, user, parent.tokensUsed, parent);
            if (stop === undefined) {
                throw new Error('Unable to create stop to end token');
            }
            graph.push(stop);
        }

        return graph;
    }

    private async getChildren(
        user: PublicKey,
        parent: Stop,
        tokenEnd: PublicKey,
        inputs?: SpecifyInputs,
        outputs?: SpecifyOutputs,
    ): Promise<Graph> {
        isOneUndefined(inputs, outputs);

        let bestQuotes: (Quote | undefined)[] = this.interTokenList.map(() => undefined);
        let subgraph: Graph = [];
        
        if (inputs !== undefined) {
            for (let i = 0; i < this.interTokenList.length; i++) {
                let tokenInter = this.interTokenList[i];
                if (parent.tokensUsed.some((token) => token.equals(tokenInter)) || tokenInter.equals(tokenEnd)) {
                    continue;
                }

                bestQuotes[i] = await this.getBestQuote(inputs.tokenIn, tokenInter, inputs.amountIn, undefined);
            }
        } else {
            throw new Error('Not implemented');
        }

        for (const bestQuote of bestQuotes) {
            if (bestQuote === undefined) {
                continue;
            }
            const bestStop = await this.createStopMarket(bestQuote, user, parent.tokensUsed, parent);

            if (bestStop === undefined) {
                throw new Error('Unable to create stop');
            }

            subgraph.push(bestStop);
        }

        return subgraph;
    }

    private async getBestQuote(
        tokenIn: PublicKey,
        tokenOut: PublicKey,
        amountIn?: number,
        amountOut?: number,
    ): Promise<Quote | undefined> {
        const inUndefined = isOneUndefined(amountIn, amountOut);

        let bestQuote: Quote | undefined = undefined;

        for (const market of this.markets) {
            const pools = await market.getPools(tokenIn, tokenOut); 

            for (const pool of pools) {
                const quote = await market.quote(tokenIn, tokenOut, pool, amountIn, amountOut);
                if (bestQuote === undefined) {
                    bestQuote = quote;
                } else {
                    if (inUndefined) {
                        let amountBestQuoteIn = bestQuote.dataQuoteIn?.amountQuote;
                        let amountQuoteIn = quote.dataQuoteIn?.amountQuote;

                        if ((amountBestQuoteIn === undefined) || (amountQuoteIn === undefined)) {
                            throw new Error('Quote in should be defined for both');
                        }

                        if (amountQuoteIn < amountBestQuoteIn) {
                            bestQuote = quote;
                        }

                    } else {
                        let amountBestQuoteOut = bestQuote.dataQuoteOut?.amountQuote;
                        let amountQuoteOut = quote.dataQuoteOut?.amountQuote;

                        if ((amountBestQuoteOut === undefined) || (amountQuoteOut === undefined)) {
                            throw new Error('Quote out should be defined for both');
                        }

                        if (amountQuoteOut > amountBestQuoteOut) {
                            bestQuote = quote;
                        }
                    }
                }
            }
        }
        
        return bestQuote;
    }

    private async createStopMarket(
        quote: Quote,
        user: PublicKey,
        tokensUsed: PublicKey[],
        parent: Stop,
    ): Promise<StopMarket | undefined> {
        const inUndefined = isOneUndefined(quote.dataQuoteOut, quote.dataQuoteIn);

        let amountInBestQuote: number;
        let amountOutBestQuote: number;

        if (inUndefined) {
            if (quote.dataQuoteIn?.amountQuote === undefined || quote.dataQuoteIn?.amountFixed === undefined) {
                return undefined;
            }
            amountInBestQuote = quote?.dataQuoteIn?.amountQuote;
            amountOutBestQuote = quote?.dataQuoteIn?.amountFixed;
        } else {
            if (quote.dataQuoteOut?.amountQuote === undefined || quote.dataQuoteOut?.amountFixed === undefined) {
                return undefined;
            }
            amountInBestQuote = quote?.dataQuoteOut?.amountFixed;
            amountOutBestQuote = quote?.dataQuoteOut?.amountQuote;
        }

        if (quote.dataQuoteOut?.amountQuote !== undefined) {
            return {
                name: quote.market.name,
                pool: quote.pool,
                tokenIn: quote.tokenIn,
                tokenOut: quote.tokenOut,
                amountIn: amountInBestQuote,
                amountOut: amountOutBestQuote,
                instructions: await quote.market.constructSwapIx(
                    user, 
                    quote.tokenIn, 
                    quote.tokenOut, 
                    quote.pool, 
                    inUndefined ? undefined : amountInBestQuote, 
                    inUndefined ? amountOutBestQuote : undefined,
                    undefined,
                    quote
                ),
                tokensUsed: tokensUsed.concat(quote.tokenOut),
                parent: parent,
                level: parent.level + 1
            };    
        }
    }

    private findBestEndState(
        graph: Graph,
        tokenIn?: PublicKey,
        tokenOut?: PublicKey,
    ): StopMarket {
        isOneUndefined(tokenIn, tokenOut);

        if (tokenOut === undefined) {
            throw new Error('Not implemented');
        }

        let bestEndState: StopMarket | undefined = undefined;
        for (const stop of graph) {
            if (stop.tokenOut.equals(tokenOut)) {
                if (bestEndState === undefined) {
                    bestEndState = stop;
                } else {
                    if (stop.amountOut > bestEndState.amountOut) {
                        bestEndState = stop;
                    }
                }
            }
        }

        if (bestEndState === undefined) {
            throw new Error('No end state found');
        }

        return bestEndState;
    }

    public findBestRoute(
        graph: Graph,
        tokenIn: PublicKey,
        tokenOut: PublicKey,
        maximizeOutput: boolean
    ): Graph {
        let bestEndState: StopMarket;
        if (maximizeOutput) {
            bestEndState = this.findBestEndState(graph, undefined, tokenOut);
        } else {
            bestEndState = this.findBestEndState(graph, tokenIn, undefined);
        }

        let bestRoute = [bestEndState];
        let curr = bestEndState;
        while (curr.level > 0) {
            curr = curr.parent as StopMarket;
            bestRoute.push(curr);
        }

        return bestRoute;
    }
}