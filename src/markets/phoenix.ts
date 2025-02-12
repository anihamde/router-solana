import { Connection, PublicKey, TransactionInstruction } from "@solana/web3.js";
import * as Phoenix from "@ellipsis-labs/phoenix-sdk";

import { Market, Quote } from "../types";
import { isOneUndefined } from "../utils";

export class PhoenixMarket implements Market {
    public name: string;
    public connection: Connection | undefined;
    public client: Phoenix.Client | undefined;

    constructor() {
        this.name = "Phoenix";
    }

    async init(url: URL): Promise<void> {
        this.connection = new Connection(url.toString());
        this.client = await Phoenix.Client.create(this.connection);
    }

    private poolMatchTokens(config: Phoenix.MarketConfig, tokenIn: PublicKey, tokenOut: PublicKey): boolean {
        return (
            (
                tokenIn.equals(new PublicKey(config.baseToken.mint)) 
                && 
                tokenOut.equals(new PublicKey(config.quoteToken.mint))
            ) || (
                tokenOut.equals(new PublicKey(config.baseToken.mint))
                && 
                tokenIn.equals(new PublicKey(config.quoteToken.mint))
            )
        );
    }

    async getPools(tokenIn: PublicKey, tokenOut: PublicKey): Promise<PublicKey[]> {
        if (this.client === undefined) {
            throw new Error("Phoenix client not initialized");
        }

        return Array.from(this.client.marketConfigs.values()).filter((config) => this.poolMatchTokens(config, tokenIn, tokenOut)).map((config) => new PublicKey(config.marketId));
    }

    async quote(
        tokenIn: PublicKey,
        tokenOut: PublicKey,
        pool: PublicKey,
        amountIn?: number,
        amountOut?: number
    ): Promise<Quote> {
        if (this.connection === undefined || this.client === undefined) {
            throw new Error("Solana connection or Phoenix client not initialized");
        }

        isOneUndefined(amountIn, amountOut);

        const marketState = this.client.marketStates.get(pool.toString());

        const slot = await this.connection.getSlot();
        const unixTimestamp = await this.connection.getBlockTime(slot);
        if (unixTimestamp === null) {
            throw new Error("unixTimestamp is null");
        }
        if (amountOut !== undefined) {
            const amountQuote = marketState?.getRequiredInAmount({side: Phoenix.Side.Ask, outAmount: amountOut, slot, unixTimestamp});

            if (amountQuote === undefined) {
                throw new Error("amountQuote is undefined");
            }

            return {
                market: this,
                tokenIn: tokenIn,
                tokenOut: tokenOut,
                pool: pool,
                dataQuoteIn: {
                    amountFixed: amountOut,
                    amountQuote: amountQuote
                }
            };
        } else {
            if (amountIn === undefined) {
                throw new Error("amountIn must be specified");
            }
            const amountQuote = marketState?.getExpectedOutAmount({side: Phoenix.Side.Bid, inAmount: amountIn, slot, unixTimestamp});

            if (amountQuote === undefined) {
                throw new Error("amountQuote is undefined");
            }

            return {
                market: this,
                tokenIn: tokenIn,
                tokenOut: tokenOut,
                pool: pool,
                dataQuoteOut: {
                    amountFixed: amountIn,
                    amountQuote: amountQuote
                }
            };
        }
    }

    async constructSwapIx(
        user: PublicKey,
        tokenIn: PublicKey,
        tokenOut: PublicKey,
        pool: PublicKey,
        amountIn?: number,
        amountOut?: number,
        slippage?: number
    ): Promise<TransactionInstruction[]> {
        if (this.connection === undefined || this.client === undefined) {
            throw new Error("Solana connection or Phoenix client not initialized");
        }

        isOneUndefined(amountIn, amountOut);

        const marketState = this.client.marketStates.get(pool.toString());
        if (marketState === undefined) {
            throw new Error("marketState is undefined");
        }
        let orderPacket: Phoenix.OrderPacket;

        if (amountOut !== undefined) {
            throw new Error("Not implemented");
        } else {
            if (amountIn === undefined) {
                throw new Error("amountIn must be specified");
            }
            orderPacket = marketState.getSwapOrderPacket({side: Phoenix.Side.Bid, inAmount: amountIn, slippage: slippage ? slippage : 0.005});
        }
        
        if (orderPacket === undefined) {
            throw new Error("orderPacket is undefined");
        }
        const ixSwap = marketState?.createSwapInstruction(orderPacket, user);

        if (ixSwap === undefined) {
            throw new Error("ixSwap is undefined");
        }

        return [ixSwap];
    }
}