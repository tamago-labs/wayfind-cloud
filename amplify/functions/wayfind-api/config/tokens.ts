import rwaList from "../data/rwa-v1-list.json";

export interface TokenMeta {
  symbol: string;
  name: string;
  stockSymbol?: string;
  stockName?: string;
  slug: string;
  crypto_id?: number;
  type: "tokenized" | "base";
  sector?: string;
  industry?: string;
  description?: string;
  website?: string;
  exchange?: string;
  tags?: string[];
  issuer_name?: string;
  issuer_id?: string;
  volume_24h?: number;
  market_cap?: number;
}

interface IssuerRisk {
  level: "Low" | "Low-Moderate" | "Moderate" | "Moderate-High" | "High";
  custody: string;
  description: string;
}

const ISSUER_RISK_TABLE: Record<string, IssuerRisk> = {
  "Backed Assets": {
    level: "Low",
    custody: "Custodied (regulated, segregated)",
    description:
      "Backed Assets (JE) Limited issues xStocks as tracker certificates under a Liechtenstein FMA-approved prospectus. Assets are held 1:1 in segregated accounts with regulated custodians (Alpaca + Swiss banks), with an independent Security Agent and bankruptcy-remote SPV structure.",
  },
  "Ondo Assets": {
    level: "Low",
    custody: "Custodied (regulated + overcollateralized)",
    description:
      "Ondo Global Markets (BVI) Limited issues structured notes fully backed 1:1 (plus buffer) by underlying securities held at regulated US broker-dealers. Features bankruptcy-remote SPV, independent Security Agent (Ankura), and daily attestations.",
  },
  "Robinhood": {
    level: "Low-Moderate",
    custody: "Custodied (regulated broker)",
    description:
      "Robinhood Assets (Jersey) Limited issues tokenized debt securities backed 1:1 by underlying equities held with a US licensed custodian. Independent security agent is appointed for insolvency scenarios. Parent is a regulated broker, but the issuer itself operates with limited supervision.",
  },
  "Backpack": {
    level: "Moderate",
    custody: "Custodied (hybrid / broker-dealer)",
    description:
      "Backpack offers a hybrid model combining traditional brokerage holdings with on-chain tokens. Some products allow redemption into real securities entitlements; overall structure is less mature and more platform-dependent than pure SPV issuers.",
  },
  "Hyperliquid Assets": {
    level: "Moderate",
    custody: "Custodied (exchange / platform)",
    description:
      "Tokens issued or distributed via Hyperliquid infrastructure. Custody and legal structure are platform-dependent and generally carry higher exchange/counterparty risk than dedicated regulated SPVs.",
  },
  "bStocks": {
    level: "Moderate",
    custody: "Custodied (exchange-affiliated)",
    description:
      "Issued by BTech Holdings Limited (Binance group affiliate) under an ADGM-approved prospectus. Backed 1:1 by shares held with a regulated custodian and features daily Proof of Collateral. Carries exchange-group counterparty and regulatory risk.",
  },
  "Reality": {
    level: "Moderate",
    custody: "Custodied (broker-dealer)",
    description:
      "Reality (Bitget-related) tokens are backed 1:1 by shares held with a FINRA-registered, SIPC-protected US broker-dealer. Provides economic exposure with independent proof-of-asset reporting, but remains platform-dependent.",
  },
  "PreStocks Assets": {
    level: "Moderate-High",
    custody: "Attested / SPV (pre-IPO)",
    description:
      "PreStocks tokens provide economic exposure to private/pre-IPO companies via SPV structures. Carry elevated risks from limited liquidity, valuation uncertainty, lock-up periods, and lack of public-market transparency.",
  },
  "Tessera Assets": {
    level: "Moderate",
    custody: "Custodied (platform)",
    description:
      "Tessera Assets issues tokenized stocks through its platform. Structure is less transparent than major regulated SPV issuers and carries standard platform and custody counterparty risk.",
  },
  "Republic": {
    level: "Moderate",
    custody: "Custodied (regulated crowdfunding)",
    description:
      "Republic issues tokenized securities primarily for private/pre-IPO companies through its regulated crowdfunding platform. Suitable for private-market exposure but subject to higher illiquidity and valuation risk.",
  },
};

export function getIssuerRisk(issuerName?: string): IssuerRisk | null {
  if (!issuerName) return null;
  return ISSUER_RISK_TABLE[issuerName] ?? BASE_ISSUER_RISK[issuerName] ?? null;
}

const tokenIndex = new Map<string, TokenMeta>();

for (const asset of (rwaList as any).assets ?? []) {
  for (const token of asset.tokens ?? []) {
    if (token.symbol && !tokenIndex.has(token.symbol.toUpperCase())) {
      const meta: TokenMeta = {
        symbol: token.symbol,
        name: token.name ?? asset.name,
        stockSymbol: asset.symbol,
        stockName: asset.name,
        slug: asset.slug ?? "",
        crypto_id: token.crypto_id,
        type: "tokenized",
        sector: asset.industry,
        industry: asset.industry,
        description: token.description ?? asset.description,
        website: token.website ?? asset.website,
        exchange: asset.exchange,
        tags: token.tags ?? asset.tags,
        issuer_name: token.issuer_name ?? asset.issuer_name,
        issuer_id: token.issuer_id ?? asset.issuer_id,
        volume_24h: token.volume_24h,
        market_cap: token.market_cap,
      };
      tokenIndex.set(token.symbol.toUpperCase(), meta);
    }
  }
}

interface BaseTokenMeta {
  symbol: string;
  name: string;
  slug: string;
  issuer_name: string;
  volume_24h: number;
  market_cap: number;
}

const BASE_TOKEN_OVERRIDES: BaseTokenMeta[] = [
  { symbol: "USDT", name: "Tether", slug: "tether", issuer_name: "Tether", volume_24h: 60000000000, market_cap: 165000000000 },
  { symbol: "USDC", name: "USDC", slug: "usd-coin", issuer_name: "Circle", volume_24h: 8000000000, market_cap: 65000000000 },
  { symbol: "ETH", name: "Ethereum", slug: "ethereum", issuer_name: "Ethereum Foundation", volume_24h: 15000000000, market_cap: 400000000000 },
  { symbol: "SOL", name: "Solana", slug: "solana", issuer_name: "Solana Foundation", volume_24h: 3000000000, market_cap: 80000000000 },
  { symbol: "USDG", name: "Global Dollar", slug: "global-dollar", issuer_name: "Global Dollar", volume_24h: 500000000, market_cap: 1000000000 },
  { symbol: "OKB", name: "OKB", slug: "okb", issuer_name: "OKX", volume_24h: 200000000, market_cap: 6000000000 },
];

const BASE_ISSUER_RISK: Record<string, IssuerRisk> = {
  "Tether": {
    level: "Moderate",
    custody: "Fiat-backed (commercial paper + reserves)",
    description: "Tether Limited issues USDT backed by reserves including cash, cash equivalents, and other assets. Reserves composition and transparency have historically been subject to scrutiny. Large market presence and deep liquidity offset some counterparty concerns.",
  },
  "Circle": {
    level: "Low",
    custody: "Fiat-backed (regulated, fully reserved)",
    description: "Circle issues USDC as a fully reserved stablecoin regulated under US money transmitter laws. Reserves held in cash and short-duration US Treasuries at regulated institutions with monthly attestations by major accounting firms.",
  },
  "Ethereum Foundation": {
    level: "Low",
    custody: "Decentralized (protocol-native)",
    description: "ETH is the native asset of Ethereum, a decentralized smart contract platform. No single issuer counterparty risk. Value derives from network utility, staking economics, and market demand.",
  },
  "Solana Foundation": {
    level: "Low-Moderate",
    custody: "Decentralized (protocol-native)",
    description: "SOL is the native asset of Solana, a high-performance blockchain. Network has experienced occasional outages, introducing additional protocol risk compared to Ethereum.",
  },
  "Global Dollar": {
    level: "Moderate",
    custody: "Fiat-backed (emerging, less transparent)",
    description: "USDG is a newer stablecoin with emerging market presence. Reserve composition and regulatory standing are less established than major stablecoins.",
  },
  "OKX": {
    level: "Moderate",
    custody: "Exchange-issued utility token",
    description: "OKB is the utility token of OKX exchange. Value is tied to exchange platform health, buyback/burn mechanics, and regulatory standing of the parent company.",
  },
};

for (const bt of BASE_TOKEN_OVERRIDES) {
  const meta: TokenMeta = {
    symbol: bt.symbol,
    name: bt.name,
    slug: bt.slug,
    type: "base" as const,
    issuer_name: bt.issuer_name,
    volume_24h: bt.volume_24h,
    market_cap: bt.market_cap,
  };
  tokenIndex.set(bt.symbol.toUpperCase(), meta);
}

export function getBaseTokenMeta(symbol: string): TokenMeta | undefined {
  return tokenIndex.get(symbol.toUpperCase());
}

export function getTokenMeta(symbol: string): TokenMeta | undefined {
  return tokenIndex.get(symbol.toUpperCase());
}
