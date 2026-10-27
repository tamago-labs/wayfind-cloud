import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from "aws-lambda";
import { Amplify } from "aws-amplify";
import { generateClient } from "aws-amplify/data";
import { getAmplifyDataClientConfig } from "@aws-amplify/backend/function/runtime";
import { env } from "$amplify/env/wayfind-api";
import type { Schema } from "../../data/resource";
import listData from "./data/rwa-v1-list.json";
import baseTokens from "./data/base-tokens.json";
import crypto from "crypto";
import { getTokenMeta, getIssuerRisk } from "./config/tokens";
import { PROVIDER_MODEL, PROVIDER_BASE_URL } from "./config/provider";

const { resourceConfig, libraryOptions } = await getAmplifyDataClientConfig(env as any);
Amplify.configure(resourceConfig, libraryOptions);
const dataClient = generateClient<Schema>();



interface ConfigToken {
  symbol: string;
  name: string;
  crypto_id: number;
  issuer_name: string;
  logo: string | null;
  addresses: { solana?: string; ethereum?: string; arbitrum?: string; bnb?: string; xlayer?: string; [key: string]: string | undefined };
}

const assets = (listData as any).assets;

function getTokensByTicker(ticker: string): ConfigToken[] {
  const upper = ticker.toUpperCase();
  for (const asset of assets) {
    if (asset.symbol.toUpperCase() === upper) return asset.tokens;
  }
  return [];
}

function getAllTokens(chain?: string): ConfigToken[] {
  const tokens: ConfigToken[] = [];
  for (const asset of assets) tokens.push(...asset.tokens);
  if (!chain) return tokens;
  return tokens.filter((t) => t.addresses?.[chain.toLowerCase()]);
}

function mergeSnapshot(ct: ConfigToken, snapshot: any) {
  if (!snapshot) return null;
  return {
    token_symbol: snapshot.token_symbol,
    symbol: snapshot.symbol,
    price: snapshot.price,
    market_cap: snapshot.market_cap,
    volume_24h: snapshot.volume_24h,
    percent_1h: snapshot.percent_1h,
    percent_24h: snapshot.percent_24h,
    percent_7d: snapshot.percent_7d,
    percent_30d: snapshot.percent_30d,
    name: ct.name,
    logo: ct.logo,
    issuer_name: ct.issuer_name,
    crypto_id: ct.crypto_id,
    addresses: ct.addresses,
  };
}

function resolveSolanaAddress(symbol: string): string | null {
  const upper = symbol.toUpperCase();

  const base = (baseTokens as any[]).find((t) => t.symbol.toUpperCase() === upper);
  if (base?.addresses?.solana) return base.addresses.solana;

  for (const asset of assets) {
    for (const token of asset.tokens) {
      if (token.symbol?.toUpperCase() === upper) {
        if (token.addresses?.solana) return token.addresses.solana;
      }
    }
  }

  for (const asset of assets) {
    if (asset.symbol.toUpperCase() === upper) {
      const withSolana = asset.tokens.filter((t: any) => t.addresses?.solana);
      if (withSolana.length === 0) return null;
      withSolana.sort((a: any, b: any) => (b.market_cap ?? 0) - (a.market_cap ?? 0));
      return withSolana[0].addresses.solana;
    }
  }

  return null;
}

function json(statusCode: number, body: any): APIGatewayProxyStructuredResultV2 {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  };
}

async function validateApiKey(apiKey: string): Promise<{ valid: boolean; profileId?: string; error?: string }> {
  if (!apiKey) return { valid: false, error: "API key required" };
  try {
    const { data: profile } = await dataClient.models.UserProfile.get({ id: apiKey });
    if (!profile) return { valid: false, error: "Invalid API key" };
    if (profile.apiKeyActive === false) return { valid: false, error: "API key deactivated" };
    return { valid: true, profileId: profile.id };
  } catch {
    return { valid: false, error: "Invalid API key" };
  }
}


export const handler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyStructuredResultV2> => {
  if (event.requestContext.http.method === "OPTIONS") return json(200, {});

  const apiKey = event.headers["x-api-key"] || event.queryStringParameters?.apiKey;
  const auth = await validateApiKey(apiKey ?? "");
  if (!auth.valid) return json(401, { error: auth.error });

  const profileId = auth.profileId!;
  const path = event.rawPath || event.requestContext.http.path;
  const qs = event.queryStringParameters || {};

  try {
    // GET /api/v1/tokens
    if (path.endsWith("/tokens") || path.endsWith("/tokens/")) {
      const configTokens = getAllTokens(qs.chain);
      const results = [];
      for (const ct of configTokens) {
        try {
          const { data } = await dataClient.models.PriceSnapshot.byTokenSymbol({ token_symbol: ct.symbol });
          const latest = data?.slice().sort((a: any, b: any) => (b.createdAt ?? "") > (a.createdAt ?? "") ? 1 : -1)[0];
          const merged = mergeSnapshot(ct, latest);
          if (merged) results.push(merged);
        } catch {}
      }
      return json(200, { data: results });
    }

    // GET /api/v1/tokens/:ticker
    const tokensMatch = path.match(/\/tokens\/(.+)$/);
    if (tokensMatch) {
      const ticker = decodeURIComponent(tokensMatch[1]);
      const configTokens = getTokensByTicker(ticker);
      const results = [];
      for (const ct of configTokens) {
        try {
          const { data } = await dataClient.models.PriceSnapshot.byTokenSymbol({ token_symbol: ct.symbol });
          const latest = data?.slice().sort((a: any, b: any) => (b.createdAt ?? "") > (a.createdAt ?? "") ? 1 : -1)[0];
          const merged = mergeSnapshot(ct, latest);
          if (merged) results.push(merged);
        } catch {}
      }
      return json(200, { data: results });
    }

    // GET /api/v1/risk-profile
    if (path.endsWith("/risk-profile")) {
      const { data: profile } = await dataClient.models.UserProfile.get({ id: profileId });
      if (!profile) return json(404, { error: "Profile not found" });
      const defaultReviewId = profile.defaultReviewId;
      if (!defaultReviewId) return json(404, { error: "No default risk profile set" });
      const { data: review } = await dataClient.models.SavedReview.get({ id: defaultReviewId });
      if (!review) return json(404, { error: "Risk profile not found" });
      const r = review as any;
      const report = JSON.parse(r.report as string);
      const answers = JSON.parse(r.answers as string);
      return json(200, { data: { overallScore: report.overallScore, overallLabel: report.overallLabel, answers } });
    }

    // GET /api/v1/market-overview
    if (path.endsWith("/market-overview")) {
      const { data: snapshots } = await dataClient.models.PriceSnapshot.list({ limit: 1000 });
      if (!snapshots) return json(200, { data: { error: "No data" } });
      const latestByToken = new Map<string, any>();
      for (const s of snapshots) {
        const existing = latestByToken.get(s.token_symbol);
        if (!existing || (s.createdAt ?? "") > (existing.createdAt ?? "")) latestByToken.set(s.token_symbol, s);
      }
      const tokens = Array.from(latestByToken.values());
      const totalMcap = tokens.reduce((sum: number, t: any) => sum + (t.market_cap ?? 0), 0);
      const totalVolume = tokens.reduce((sum: number, t: any) => sum + (t.volume_24h ?? 0), 0);
      const sortedByChange = [...tokens].sort((a: any, b: any) => (b.percent_24h ?? 0) - (a.percent_24h ?? 0));
      const sortedByVolume = [...tokens].sort((a: any, b: any) => (b.volume_24h ?? 0) - (a.volume_24h ?? 0));
      return json(200, { data: { totalMarketCap: totalMcap, totalVolume24h: totalVolume, tokenCount: tokens.length, gainers: sortedByChange.slice(0, 5), losers: sortedByChange.slice(-5).reverse(), trending: sortedByVolume.slice(0, 10) } });
    }

    // GET /api/v1/swap-quote
    if (path.endsWith("/swap-quote")) {
      const OKX_API_KEY = env.OKX_API_KEY;
      const OKX_SECRET_KEY = env.OKX_SECRET_KEY;
      const OKX_PASSPHRASE = env.OKX_PASSPHRASE;

      const fromTokenAddress = qs.fromTokenAddress ?? (qs.fromSymbol ? resolveSolanaAddress(qs.fromSymbol) : null);
      const toTokenAddress = qs.toTokenAddress ?? (qs.toSymbol ? resolveSolanaAddress(qs.toSymbol) : null);
      const amount = qs.amount;

      if (!fromTokenAddress || !toTokenAddress || !amount) {
        return json(400, { error: "Missing required parameters: fromTokenAddress/fromSymbol, toTokenAddress/toSymbol, amount" });
      }

      const url = new URL("https://web3.okx.com/api/v6/dex/aggregator/quote");
      url.searchParams.set("chainIndex", "501");
      url.searchParams.set("amount", amount);
      url.searchParams.set("fromTokenAddress", fromTokenAddress);
      url.searchParams.set("toTokenAddress", toTokenAddress);

      const path = url.pathname + url.search;
      const timestamp = new Date().toISOString();
      const signature = crypto.createHmac("sha256", OKX_SECRET_KEY).update(timestamp + "GET" + path).digest("base64");

      const res = await fetch(url.toString(), {
        headers: {
          Accept: "application/json",
          "OK-ACCESS-KEY": OKX_API_KEY,
          "OK-ACCESS-SIGN": signature,
          "OK-ACCESS-PASSPHRASE": OKX_PASSPHRASE,
          "OK-ACCESS-TIMESTAMP": timestamp,
        },
      });

      if (!res.ok) return json(res.status, { error: `OKX API HTTP ${res.status}` });

      const data = await res.json();
      if (data.code !== "0") return json(400, { error: data.msg || "OKX API error" });

      const quote = data.data?.[0];
      if (!quote) return json(404, { error: "No quote available" });

      return json(200, { data: quote });
    }

    // GET /api/v1/swap-instruction
    if (path.endsWith("/swap-instruction")) {
      const OKX_API_KEY = env.OKX_API_KEY;
      const OKX_SECRET_KEY = env.OKX_SECRET_KEY;
      const OKX_PASSPHRASE = env.OKX_PASSPHRASE;

      const fromTokenAddress = qs.fromTokenAddress ?? (qs.fromSymbol ? resolveSolanaAddress(qs.fromSymbol) : null);
      const toTokenAddress = qs.toTokenAddress ?? (qs.toSymbol ? resolveSolanaAddress(qs.toSymbol) : null);
      const amount = qs.amount;
      const userWalletAddress = qs.userWalletAddress;
      const slippagePercent = qs.slippagePercent ?? "0.5";

      if (!fromTokenAddress || !toTokenAddress || !amount || !userWalletAddress) {
        return json(400, { error: "Missing required parameters: fromTokenAddress/fromSymbol, toTokenAddress/toSymbol, amount, userWalletAddress" });
      }

      const url = new URL("https://web3.okx.com/api/v6/dex/aggregator/swap");
      url.searchParams.set("chainIndex", "501");
      url.searchParams.set("amount", amount);
      url.searchParams.set("fromTokenAddress", fromTokenAddress);
      url.searchParams.set("toTokenAddress", toTokenAddress);
      url.searchParams.set("userWalletAddress", userWalletAddress);
      url.searchParams.set("slippagePercent", slippagePercent);
      url.searchParams.set("autoSlippage", "true");

      const path = url.pathname + url.search;
      const timestamp = new Date().toISOString();
      const signature = crypto.createHmac("sha256", OKX_SECRET_KEY).update(timestamp + "GET" + path).digest("base64");

      const res = await fetch(url.toString(), {
        headers: {
          Accept: "application/json",
          "OK-ACCESS-KEY": OKX_API_KEY,
          "OK-ACCESS-SIGN": signature,
          "OK-ACCESS-PASSPHRASE": OKX_PASSPHRASE,
          "OK-ACCESS-TIMESTAMP": timestamp,
        },
      });

      if (!res.ok) return json(res.status, { error: `OKX API HTTP ${res.status}` });

      const data = await res.json();
      if (data.code !== "0") return json(400, { error: data.msg || "OKX API error" });

      const swapData = data.data?.[0];
      if (!swapData) return json(404, { error: "No swap data available" });

    return json(200, {
      data: {
        base58Transaction: swapData.tx?.data ?? "",
        routerResult: swapData.routerResult,
        minReceiveAmount: swapData.tx?.minReceiveAmount ?? "0",
      },
    });
    }

    // POST /api/v1/risk-review
    if (path.endsWith("/risk-review") && event.requestContext.http.method === "POST") {
      let body: any = {};
      try { body = JSON.parse(event.body || "{}"); } catch {}

      const { action = "generateQuestions", userProfileId, prompt: rawPrompt, holdings: rawHoldings, answers: rawAnswers } = body;

      const prompt = typeof rawPrompt === "string" ? rawPrompt : "";
      const holdings = typeof rawHoldings === "string" ? JSON.parse(rawHoldings) : (rawHoldings ?? []);
      const answers: Record<string, { q: string; a: string }> = typeof rawAnswers === "string" ? JSON.parse(rawAnswers) : (rawAnswers ?? {});

      if (!userProfileId || !Array.isArray(holdings) || holdings.length === 0) {
        return json(400, { error: "Missing required parameters: userProfileId, holdings" });
      }

      const CREDIT_RATE = 0.05;

      interface Holding { symbol: string; name?: string; balance: number; price: number; }
      interface EnrichedHolding { symbol: string; name: string; stockSymbol: string; stockName: string; balance: number; price: number; value: number; valuePct: number; type: string; industry: string; issuer: string; issuerRiskLevel: string; liquidityTier: string; exchange: string; }

      function enrichHoldings(holdings: Holding[]) {
        const withMeta = holdings.filter((h) => h.balance > 0 && h.price > 0).map((h) => {
          const meta = getTokenMeta(h.symbol);
          const issuerRisk = getIssuerRisk(meta?.issuer_name);
          const volume24h = meta?.volume_24h ?? 0;
          const liquidityTier = volume24h > 5000000 ? "High" : volume24h > 500000 ? "Moderate" : "Low";
          const value = h.balance * h.price;
          return { symbol: h.symbol, name: h.name ?? meta?.name ?? h.symbol, stockSymbol: meta?.stockSymbol ?? "", stockName: meta?.stockName ?? "", balance: h.balance, price: h.price, value, valuePct: 0, type: meta?.type ?? "base", industry: meta?.industry ?? (meta ? "Unknown" : "Crypto"), issuer: meta?.issuer_name ?? "Unknown", issuerRiskLevel: issuerRisk?.level ?? "Unknown", liquidityTier, exchange: meta?.exchange ?? "" };
        }).sort((a, b) => b.value - a.value).slice(0, 20);
        const totalValue = withMeta.reduce((sum, h) => sum + h.value, 0);
        if (totalValue > 0) for (const h of withMeta) h.valuePct = (h.value / totalValue) * 100;
        return { enriched: withMeta, totalValue };
      }

      function clampScore(v: number) { return Math.max(0, Math.min(100, Math.round(v))); }

      function computeDeterministicFactors(enriched: EnrichedHolding[]) {
        const sorted = [...enriched].sort((a, b) => b.valuePct - a.valuePct);
        const largestPct = sorted[0]?.valuePct ?? 0;
        const top3Pct = sorted.slice(0, 3).reduce((sum, h) => sum + h.valuePct, 0);
        const hhi = enriched.reduce((sum, h) => sum + Math.pow(h.valuePct / 100, 2), 0);
        const concentrationScore = clampScore(largestPct * 0.4 + top3Pct * 0.3 + hhi * 100 * 0.3);
        const sectorMap = new Map<string, number>();
        for (const h of enriched) { if (h.industry && h.industry !== "Unknown") sectorMap.set(h.industry, (sectorMap.get(h.industry) ?? 0) + h.valuePct); }
        const sectors = Array.from(sectorMap.entries()).map(([sector, pct]) => ({ sector, pct })).sort((a, b) => b.pct - a.pct);
        const topSectorPct = sectors[0]?.pct ?? 0;
        const sectorHhi = sectors.reduce((sum, s) => sum + Math.pow(s.pct / 100, 2), 0);
        const marketExposureScore = clampScore(topSectorPct * 0.6 + sectorHhi * 100 * 0.4);
        const tierScore: Record<string, number> = { High: 20, Moderate: 55, Low: 85 };
        const totalPct = enriched.reduce((sum, h) => sum + h.valuePct, 0) || 1;
        const liquidityScore = clampScore(enriched.reduce((sum, h) => sum + (tierScore[h.liquidityTier] ?? 60) * (h.valuePct / totalPct), 0));
        const issuerScoreMap: Record<string, number> = { Low: 15, "Low-Moderate": 35, Moderate: 55, "Moderate-High": 75, High: 90, Unknown: 60 };
        const issuerScore = clampScore(enriched.reduce((sum, h) => sum + (issuerScoreMap[h.issuerRiskLevel] ?? 60) * (h.valuePct / totalPct), 0));
        return { concentrationScore, marketExposureScore, liquidityScore, issuerScore, stats: { largestPct, top3Pct, hhi, topSectors: sectors.slice(0, 5) } };
      }

      function formatHolding(h: EnrichedHolding) {
        return "- " + h.symbol + (h.stockSymbol ? " (" + h.stockSymbol + " — " + h.stockName + (h.exchange ? ", " + h.exchange : "") + ")" : "") + ': value=$' + h.value.toFixed(2) + " (" + h.valuePct.toFixed(1) + '% of portfolio), industry="' + h.industry + '", issuer="' + h.issuer + '", issuerRisk="' + h.issuerRiskLevel + '", liquidityTier="' + h.liquidityTier + '"';
      }

      function buildQuestionsPrompt(p: string, enriched: EnrichedHolding[], totalValue: number, stats: { largestPosition: { symbol: string; pct: number } | null; top2Pct: number; topSectors: Array<{ sector: string; pct: number }> }) {
        const formatSector = (s: { sector: string; pct: number }) => "- " + s.sector + ": " + s.pct.toFixed(1) + "%";
        return `The user wants a portfolio risk review and asked: "${p}"\n\nPORTFOLIO STATS (pre-computed, use these exact values, do NOT recalculate):\n- Total value: $${totalValue.toFixed(2)}\n- Largest position: ${stats.largestPosition ? stats.largestPosition.symbol + " at " + stats.largestPosition.pct.toFixed(1) + "%" : "N/A"}\n- Top 2 positions combined: ${stats.top2Pct.toFixed(1)}%\n- Sector exposure:\n${stats.topSectors.map(formatSector).join("\n") || "N/A"}\n\nHOLDINGS:\n${enriched.map(formatHolding).join("\n") || "None"}\n\nGenerate 3-5 clarifying questions to personalize the risk analysis for this portfolio.`;
      }

      function buildAnalysisPrompt(p: string, enriched: EnrichedHolding[], totalValue: number, factors: ReturnType<typeof computeDeterministicFactors>, answers: Record<string, { q: string; a: string }>) {
        const formatSector = (s: { sector: string; pct: number }) => "- " + s.sector + ": " + s.pct.toFixed(1) + "%";
        const answerLines = Object.values(answers).map((qa) => "- " + (qa.q || "Question") + " → " + qa.a).join("\n");
        return `The user asked: "${p}"\n\nPORTFOLIO STATS (pre-computed):\n- Total value: $${totalValue.toFixed(2)}\n- Largest position: ${factors.stats.largestPct.toFixed(1)}%\n- Top 3 positions combined: ${factors.stats.top3Pct.toFixed(1)}%\n- Sector exposure:\n${factors.stats.topSectors.map(formatSector).join("\n") || "N/A"}\n\nPRE-COMPUTED FACTOR SCORES (use these EXACT values, do NOT recalculate):\n- Concentration: ${factors.concentrationScore}/100\n- Market Exposure: ${factors.marketExposureScore}/100\n- Liquidity: ${factors.liquidityScore}/100\n- Issuer: ${factors.issuerScore}/100\n\nHOLDINGS:\n${enriched.map(formatHolding).join("\n") || "None"}\n\nUSER QUESTIONNAIRE ANSWERS (personalization context):\n${answerLines || "None"}\n\nNow assess Company Fundamentals and On-chain Factors, synthesize the overall score, and produce the risk breakdown.`;
      }

      async function deductCredits(profileId: string, inputText: string, outputObj: unknown) {
        try {
          const { data: profile } = await dataClient.models.UserProfile.get({ id: profileId });
          if (profile) {
            const inputTokens = Math.ceil(inputText.length / 4);
            const outputTokens = Math.ceil(JSON.stringify(outputObj ?? {}).length / 4);
            const creditsUsed = (inputTokens + outputTokens) * CREDIT_RATE;
            const newCredits = Math.max(0, (profile.credits ?? 0) - creditsUsed);
            await dataClient.models.UserProfile.update({ id: profile.id, credits: newCredits });
          }
        } catch (err) { console.error("[risk-review] credits deduction failed:", err); }
      }

      const { enriched, totalValue } = enrichHoldings(holdings);
      if (enriched.length === 0) return json(400, { error: "No valid holdings" });

      const OpenAI = (await import("openai")).default;
      const openaiClient = new OpenAI({ apiKey: env.OPENAI_API_KEY, baseURL: PROVIDER_BASE_URL });
      const { setDefaultOpenAIClient, setTracingDisabled } = await import("@openai/agents");
      setDefaultOpenAIClient(openaiClient);
      setTracingDisabled(true);

      if (action === "runAnalysis") {
        if (!prompt || Object.keys(answers).length === 0) return json(400, { error: "Missing prompt or answers" });

        const factors = computeDeterministicFactors(enriched);
        const userPrompt = buildAnalysisPrompt(prompt, enriched, totalValue, factors, answers);

        const { Agent, run } = await import("@openai/agents");
        const { z } = await import("zod");
        const analysisSchema = z.object({
          fundamentalsScore: z.number().min(0).max(100),
          fundamentalsExplanation: z.string(),
          onchainScore: z.number().min(0).max(100),
          onchainExplanation: z.string(),
          overallScore: z.number().min(0).max(100),
          overallLabel: z.enum(["Low", "Moderate", "High", "Very High"]),
          overallSummary: z.string(),
          factorExplanations: z.object({ concentration: z.string(), marketExposure: z.string(), liquidity: z.string(), issuer: z.string() }),
          personalizationNote: z.string(),
          hiddenRisks: z.array(z.string()).min(2).max(4),
        });

        const agent = new Agent({ name: "Risk Analyzer", model: PROVIDER_MODEL, instructions: "You are Wayfind's portfolio risk analysis engine. You produce a multi-factor risk score for tokenized equity portfolios. Score range: 0-30 Low, 31-60 Moderate, 61-80 High, 81-100 Very High. You MUST respond with ONLY valid JSON matching the requested schema. No markdown, no extra text.", outputType: analysisSchema });
        const result = await run(agent, [{ role: "user", content: userPrompt }], { maxTurns: 10 });
        const output = result.finalOutput as any;

        await deductCredits(userProfileId, userPrompt, output);

        return json(200, { data: { ...output, deterministicFactors: { concentration: factors.concentrationScore, marketExposure: factors.marketExposureScore, liquidity: factors.liquidityScore, issuer: factors.issuerScore }, portfolioStats: { totalValue, largestPct: factors.stats.largestPct, top3Pct: factors.stats.top3Pct, topSectors: factors.stats.topSectors } } });
      }

      // Default: generateQuestions
      if (!prompt) return json(400, { error: "Missing prompt" });

      const sorted = [...enriched].sort((a, b) => b.value - a.value);
      const largestPosition = sorted[0] ? { symbol: sorted[0].symbol, pct: sorted[0].valuePct } : null;
      const top2Pct = sorted.slice(0, 2).reduce((sum, h) => sum + h.valuePct, 0);
      const sectorMap = new Map<string, number>();
      for (const h of enriched) { if (h.industry && h.industry !== "Unknown") sectorMap.set(h.industry, (sectorMap.get(h.industry) ?? 0) + h.valuePct); }
      const topSectors = Array.from(sectorMap.entries()).map(([sector, pct]) => ({ sector, pct })).sort((a, b) => b.pct - a.pct).slice(0, 5);

      const userPrompt = buildQuestionsPrompt(prompt, enriched, totalValue, { largestPosition, top2Pct, topSectors });

      const { Agent, run } = await import("@openai/agents");
      const { z } = await import("zod");
      const questionsSchema = z.object({
        questions: z.array(z.object({ id: z.string(), question: z.string(), options: z.array(z.object({ label: z.string(), value: z.string() })) })).min(3).max(5),
      });

      const agent = new Agent({ name: "Risk Intake", model: PROVIDER_MODEL, instructions: "You are Wayfind's portfolio risk intake assistant. Generate exactly 3-5 clarifying questions with 2-4 multiple-choice options each. You MUST respond with ONLY valid JSON matching the requested schema. No markdown, no extra text.", outputType: questionsSchema });
      const result = await run(agent, [{ role: "user", content: userPrompt }], { maxTurns: 10 });
      const output = result.finalOutput as any;

      await deductCredits(userProfileId, userPrompt, output);

      return json(200, { data: output });
    }

    return json(404, { error: "Not found" });
  } catch (err) {
    console.error("[wayfind-api] error:", err);
    return json(500, { error: "Internal server error" });
  }
};
