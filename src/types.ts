import { PublicKey, TransactionInstruction } from "@solana/web3.js";

export interface Market {
    name: string;
    init(url: URL): Promise<void>;

    getPools: (
        tokenIn: PublicKey,
        tokenOut: PublicKey,
    ) => Promise<PublicKey[]>;

    quote: (
        tokenIn: PublicKey,
        tokenOut: PublicKey,
        pool: PublicKey,
        amountIn?: number,
        amountOut?: number
    ) => Promise<Quote>;

    constructSwapIx: (
        user: PublicKey,
        tokenIn: PublicKey,
        tokenOut: PublicKey,
        pool: PublicKey,
        amountIn?: number,
        amountOut?: number,
        slippage?: number,
        quote?: Quote,
    ) => Promise<TransactionInstruction[]>;
}

export type QuoteData = {
    amountFixed: number;
    amountQuote: number;
}

export type Quote = {
    market: Market;
    tokenIn: PublicKey;
    tokenOut: PublicKey;
    pool: PublicKey;
    dataQuoteIn?: QuoteData;
    dataQuoteOut?: QuoteData;
    additionalData?: any;
}

export type Graph = StopMarket[];

export type Stop = StopRoot | StopMarket;

export type StopRoot = {
    name: 'ROOT';
    tokenIn: PublicKey;
    tokenOut: PublicKey;
    amountIn?: number;
    amountOut?: number;
    tokensUsed: PublicKey[];
    level: 0;
}

export type StopMarket = {
    name: string;
    pool: PublicKey;
    tokenIn: PublicKey;
    tokenOut: PublicKey;
    amountIn: number;
    amountOut: number;
    instructions: TransactionInstruction[];
    tokensUsed: PublicKey[];
    parent: Stop;
    level: number;
}

export type SpecifyInputs = {
    tokenIn: PublicKey;
    amountIn: number;
}

export type SpecifyOutputs = {
    tokenOut: PublicKey;
    amountOut: number;
}