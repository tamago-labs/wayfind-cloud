import type { EventBridgeHandler } from "aws-lambda";
import type { Schema } from "../../data/resource";
import { Amplify } from "aws-amplify";
import { generateClient } from "aws-amplify/data";
import { getAmplifyDataClientConfig } from "@aws-amplify/backend/function/runtime";
import { env } from "$amplify/env/price-tracker";
import listData from "./rwa-v1-list.json";

const COINGECKO_API_KEY = env.COINGECKO_API_KEY;
const BASE_URL = "https://api.coingecko.com/api/v3";
const BATCH_SIZE = 100;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Token {
  symbol: string;
  name: string;
  price: number | null;
  crypto_id: string;
  coingecko_id: string | null;
  issuer_id: string;
  issuer_name: string;
  market_cap: number | null;
  volume_24h: number | null;
}

interface ActiveAsset {
  symbol: string;
  name: string;
  slug: string;
  rwa_id: number;
  rwa_rank: number;
  tokens: Token[];
  website: string | null;
  industry: string | null;
  founded: string | null;
  employees: number | null;
  exchange: string | null;
  description: string | null;
}

async function fetchCryptoMarkets(coinIds: string[]): Promise<any[]> {
  const url = new URL(`${BASE_URL}/coins/markets`);
  url.searchParams.set("vs_currency", "usd");
  url.searchParams.set("ids", coinIds.join(","));
  url.searchParams.set("price_change_percentage", "1h,24h,7d,30d");
  url.searchParams.set("per_page", "250");

  const headers: Record<string, string> = { Accept: "application/json" };
  if (COINGECKO_API_KEY) {
    headers["x-cg-demo-api-key"] = COINGECKO_API_KEY;
  }

  const res = await fetch(url.toString(), { headers });

  if (!res.ok) {
    console.error(`HTTP ${res.status}: ${await res.text()}`);
    return [];
  }

  return await res.json();
}

export const handler: EventBridgeHandler<"Scheduled Event", null, void> = async (event) => {
  console.log("Price tracker started:", JSON.stringify(event.time));

  const { resourceConfig, libraryOptions } = await getAmplifyDataClientConfig(env);
  Amplify.configure(resourceConfig, libraryOptions);

  const client = generateClient<Schema>();

  const { assets } = listData as unknown as { assets: ActiveAsset[] };

  const allTokens: { token: Token; rwa_id: number }[] = [];
  for (const asset of assets) {
    for (const token of asset.tokens) {
      if (token.coingecko_id) {
        allTokens.push({ token, rwa_id: asset.rwa_id });
      }
    }
  }

  console.log(`Tracking ${allTokens.length} tokens across ${assets.length} stocks...`);

  let saved = 0;
  const errors: string[] = [];

  for (let i = 0; i < allTokens.length; i += BATCH_SIZE) {
    const batch = allTokens.slice(i, i + BATCH_SIZE);
    const progress = Math.min(i + BATCH_SIZE, allTokens.length);
    console.log(`  ${progress}/${allTokens.length}`);

    try {
      const ids = batch.map((b) => b.token.coingecko_id!);
      const markets = await fetchCryptoMarkets(ids);
      const marketMap = new Map<string, any>();
      for (const m of markets) {
        marketMap.set(m.id, m);
      }

      for (const { token, rwa_id } of batch) {
        const market = marketMap.get(token.coingecko_id!);
        if (!market) {
          errors.push(token.symbol);
          continue;
        }

        try {
          await client.models.PriceSnapshot.create({
            symbol: assets.find((a) => a.rwa_id === rwa_id)?.symbol ?? "",
            rwa_id,
            token_symbol: token.symbol,
            crypto_id: Number(token.crypto_id),
            price: market.current_price ?? null,
            market_cap: market.market_cap ?? null,
            volume_24h: market.total_volume ?? null,
            percent_1h: market.price_change_percentage_1h_in_currency ?? null,
            percent_24h: market.price_change_percentage_24h_in_currency ?? null,
            percent_7d: market.price_change_percentage_7d_in_currency ?? null,
            percent_30d: market.price_change_percentage_30d_in_currency ?? null,
            circulating_supply: market.circulating_supply ?? null,
            total_supply: market.total_supply ?? null,
          });
          saved++;
        } catch (err) {
          console.error(`Error saving ${token.symbol}: ${err}`);
          errors.push(token.symbol);
        }
      }
    } catch (err) {
      console.error(`Batch error: ${err}`);
    }

    if (i + BATCH_SIZE < allTokens.length) {
      await sleep(2000);
    }
  }

  console.log(`Done. Saved: ${saved}, Errors: ${errors.length}`);
  if (errors.length > 0) {
    console.log(`Failed: ${errors.join(", ")}`);
  }
};
