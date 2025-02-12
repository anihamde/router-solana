import { Connection, PublicKey, TransactionInstruction } from "@solana/web3.js";
import DLMM, { SwapQuote } from '@meteora-ag/dlmm';
import BN from 'bn.js';

import { Market, Quote } from "../types";
import { isOneUndefined } from "../utils";
import data from "./meteoraPoolsFiltered.json";

export class MeteoraDlmmMarket implements Market {
    public name: string;
    public connection: Connection | undefined;
    public clients: Map<[PublicKey, PublicKey, PublicKey], DLMM>;

    constructor() {
        this.name = "MeteoraDLMM";
        this.clients = new Map();
    }

    async init(url: URL): Promise<void> {
        this.connection = new Connection(url.toString());
    }

    private async getDlmm(tokenIn: PublicKey, tokenOut: PublicKey, pool: PublicKey): Promise<DLMM> {
        if (this.connection === undefined) {
            throw new Error("Solana connection not initialized");
        }

        const key: [PublicKey, PublicKey, PublicKey] = [tokenIn, tokenOut, pool];
        let dlmm: DLMM;
        if (this.clients.has(key)) {
            dlmm = this.clients.get(key) as DLMM;
        } else {
            dlmm = await DLMM.create(this.connection, pool);
            this.clients.set(key, dlmm);
        }

        return dlmm;
    }

    private getSwapYToX(dlmm: DLMM, tokenIn: PublicKey): boolean {
        if (dlmm.tokenX.publicKey.equals(tokenIn)) {
            return false;
        }
        return true;
    }

    async getPools(tokenIn: PublicKey, tokenOut: PublicKey): Promise<PublicKey[]> {
        // TODO: this doesn't work probably bc of bandwith limits? Figure out how to best get all pools
        // const data: MeteoraPool[] = await fetch("https://dlmm-api.meteora.ag/pair/all", {
        //     method: "GET",
        //     headers: {
        //         "Content-Type": "application/json",
        //     },
        // }).then((res) => res.json());
        const allPools = data.filter((pool) => {
            return (
                (tokenIn.equals(new PublicKey(pool.mint_x)) && tokenOut.equals(new PublicKey(pool.mint_y)))
                ||
                (tokenIn.equals(new PublicKey(pool.mint_y)) && tokenOut.equals(new PublicKey(pool.mint_x)))
            );
        }).sort((a, b) => {return parseFloat(a.liquidity) - parseFloat(b.liquidity);}).map((pool) => new PublicKey(pool.address));

        // TODO: filtering rn bc of rate limits on public API--remove later
        // TODO: may need to still filter (more intelligently) to reduce latency
        return allPools.slice(-1);
    }

    async quote(
        tokenIn: PublicKey,
        tokenOut: PublicKey,
        pool: PublicKey,
        amountIn?: number,
        amountOut?: number
    ): Promise<Quote> {
        if (this.connection === undefined) {
            throw new Error("Solana connection not initialized");
        }

        isOneUndefined(amountIn, amountOut);
        
        const dlmm = await this.getDlmm(tokenIn, tokenOut, pool);

        if (amountIn === undefined) {
            throw new Error("Not implemented");
        }

        const swapYtoX = this.getSwapYToX(dlmm, tokenIn);
        const binArrays = await dlmm.getBinArrayForSwap(swapYtoX);
        const swapQuote = await dlmm.swapQuote(
          new BN(amountIn),
          swapYtoX,
          new BN(10),
          binArrays,
          false
        );

        return {
            market: this,
            tokenIn: tokenIn,
            tokenOut: tokenOut,
            pool: pool,
            dataQuoteOut: {
                amountFixed: amountIn,
                amountQuote: swapQuote.outAmount.toNumber()
            },
            additionalData: swapQuote,
        };
    }

    async constructSwapIx(
        user: PublicKey,
        tokenIn: PublicKey,
        tokenOut: PublicKey,
        pool: PublicKey,
        amountIn?: number,
        amountOut?: number,
        slippage?: number,
        quote?: Quote,
    ): Promise<TransactionInstruction[]> {
        if (this.connection === undefined) {
            throw new Error("Solana connection not initialized");
        }

        isOneUndefined(amountIn, amountOut);

        const dlmm = await this.getDlmm(tokenIn, tokenOut, pool);

        if (amountIn === undefined) {
            throw new Error("Not implemented");
        }

        if (quote === undefined) {
            throw new Error("Quote must be specified");
        }
        const swapQuote = quote.additionalData as SwapQuote;

        let swapTransaction = await dlmm.swap({
            inToken: tokenIn,
            outToken: tokenOut,
            inAmount: new BN(amountIn),
            minOutAmount: swapQuote.minOutAmount,
            lbPair: pool,
            user: user,
            binArraysPubkey: swapQuote.binArraysPubkey,
        });

        return swapTransaction.instructions;
    }
}

interface MeteoraPool {
    address: string;
    mint_x: string;
    mint_y: string;
    liquidity: string;
}