# Wayfind

**AI Agent Infrastructure for Tokenized Stocks on Solana & Across Web3**

## Product Overview

Grok Bot can do a lot, but managing tokenized stocks requires more than the ability to trade. Wayfind provides a one-click template that equips Grok Bot with the market data, personalized risk intelligence, and trading tools needed to navigate fragmented stock tokens on Solana. Users can monitor their holdings and rebalance portfolios based on their risk profiles, with swaps routed through the OKX DEX Swap Aggregator. Agents get everything they need to evaluate risk, generate trade quotes, and execute swaps — all from within Grok Bot.

## Quick Links

| Resource | Link |
|----------|------|
| Video Demo (5 mins.) | https://www.youtube.com/watch?v=NG1Jbp9PFlo |
| Twitter / X | https://x.com/WayfindZZZ |
| Grok Bot Template | https://x.ai/bot/EpQzEq9pQvX_utfgsxzbj |

## Background

Tokenized equities are becoming a growing part of the real-world asset market. CoinGecko reported approximately $0.5B in tokenized equity market capitalization by Q1 2026, alongside $15.1B in spot trading volume during the quarter.

Simply putting stocks onchain isn't enough. The real unlock comes when AI agents can understand what they're holding, evaluate risk in context, and act on it. Wayfind gives Grok Bot the data layer and trading integrations to do exactly that — turning tokenized equities into something agents can actually trade.

### The Problem

**AI agents can't trade what they don't understand.**

A tokenized stock isn't just a ticker symbol onchain — it represents exposure to a real company with revenue, earnings, business fundamentals, and issuer risk. One company like Tesla can have multiple onchain versions (TSLAx, TSLAon, rTSLA) with different prices, liquidity, and issuers.

Without market data, risk context, and trading integrations, agents are flying blind. Wayfind gives them the intelligence to evaluate what they hold, assess portfolio risk, and act on it.

## System Overview

Wayfind is **a tokenized stock toolkit built for Grok Bot**. It gives your bot the market context, the risk awareness and the trading rails to manage a tokenized stock portfolio on Solana.

The system comprises the following components:

| Component | Repository | Description |
|-----------|-----------|-------------|
| **Platform** | [wayfind](https://github.com/tamago-labs/wayfind) | Next.js dashboard + AWS Amplify backend (Lambda, DynamoDB, scheduled trackers). Handles portfolio tracking, AI risk analysis, and market data ingestion. |
| **MCP Server** | [wayfind-mcp](https://github.com/tamago-labs/wayfind-mcp) | MCP tools: wallet balances, swap quotes, tokenized stock data, risk profiles, agentic wallet. Published as `@tamago-labs/wayfind-mcp` on npm. |
| **Agent Skills** | [wayfind-skills](https://github.com/tamago-labs/wayfind-skills) | Grok Bot plugin + skill definitions. Provides intent routing, setup guides, and tool references for AI agents. |

The platform is the data backbone — ingesting market data, running AI risk analysis, and persisting results. The MCP server reads on-chain wallet balances, SPL token holdings, and transaction history directly from Solana RPC. Swaps are executed through OKX DEX Router, signing and sending transactions from the Grok Bot's container.

## User Flow

### 1. Build Your Risk Profile
* Answer a short AI questionnaire about your goals, time horizon, and risk tolerance
* Wayfind uses your answers to understand what risk means for you

### 2. Get Your API Key
* Your API key links your risk profile to every bot you create
* One setup, all your bots trade with your risk context

### 3. Set Up Your Bot
* Import a Grok Bot template from the Wayfind landing page
* Set your API key and create an agentic wallet on the bot's computer
* Then ask your agent anything

### 4. Schedule Rebalancing Jobs
* Your bot monitors your portfolio and prepares swap quotes through OKX DEX when positions drift
* You review and approve each trade before it executes

## On-Chain Transactions

Wayfind has already executed real swaps on Solana mainnet through the OKX DEX Router from Grok Bot:

* **SpaceX xStock (SPCXx)** — [view on Solscan](https://solscan.io/tx/C66pxEPJgdKkGWtqDpUBLJZxJX3hYa5XiZx4uXa4qXxcbtVof81P3pbFrVzEPBd5ymJKPQgHydkxPj1QqivqHuH)
* **Anduril via PreStocks (pre-IPO)** — [view on Solscan](https://solscan.io/tx/4gVjrdLeB7MmnWSvPM3a43GdVMdma3LWan3J4Sccf73ADnHu8GqbGn4G8GbTzWhE9KGhdFhVtDGie82V4EdAAfoH)

## Backend

Wayfind's backend uses **AWS Amplify Gen 2** with serverless functions, DynamoDB tables, and scheduled data ingestion.

### Data Models

| Model | Purpose |
|-------|---------|
| **PriceSnapshot** | Stores CoinMarketCap market data per tokenized stock (price, market_cap, volume_24h, percent changes, supply). Updated hourly by scheduled tracker. |
| **PreStock** | Tracks pre-IPO token valuations (markPrice, tokenPrice, markValuation, impliedValuation, supply). Updated hourly from PreStocks API. |
| **UserProfile** | User profiles with wallet address, profile name, AI credits, experience level, writing style, sources, API key status, and linked registries/portfolios/reviews. |
| **UserTokenRegistry** | Tracks token addresses per user (symbol, name, decimals, chain) for wallet discovery and balance resolution. |
| **Portfolio** | User-created portfolios (real or simulated). Each portfolio contains portfolio token allocations. |
| **PortfolioToken** | Individual token entry in a portfolio with symbol, name, and custom value allocation. |
| **SavedReview** | Persists AI-generated risk reviews per portfolio, including prompt, holdings, questionnaire answers, full report, risk score/label, and chat history. |

### Scheduled Trackers

| Function | Purpose | Frequency |
|----------|---------|-----------|
| **price-tracker** | Fetches market data from CoinMarketCap Pro for all configured tokenized stocks. Stores price, market cap, volume, and percentage changes. | Hourly |
| **prestock-tracker** | Pulls latest valuations from PreStocks API for pre-IPO tokens. Updates markPrice, tokenPrice, and valuations. | Hourly |
| **ohlcv-fetcher** | Retrieves historical OHLCV data from CoinMarketCap for price charts and trend analysis. | On demand |

### Lambda Functions

| Function | Purpose |
|----------|---------|
| **risk-review** | Main entry point for the AI Risk Engine. Runs the two-turn risk analysis pipeline (questionnaire → risk evaluation). Returns comprehensive portfolio risk scores with factor breakdown. |
| **chat-further** | SSE streaming Lambda for post-review AI chat. Triage agent hands off to specialist agents (market research, news intelligence, pre-IPO markets). Powered by OpenAI Agents SDK. |
| **ohlcv-fetcher** | Retrieves historical price data from CoinMarketCap for chart rendering. |

## Getting Started

1. Install packages. This project requires Node.js >= 18.0.0.

```bash
npm install
```

2. Add `.env.local` file with required environment variables:

```bash
# OKX DEX Router
OKX_API_KEY=your_okx_api_key
OKX_SECRET_KEY=your_okx_secret_key
OKX_PASSPHRASE=your_okx_passphrase

# AI Provider (OpenAI-compatible)
OPENAI_API_KEY=your_openai_api_key

# Solana
NEXT_PUBLIC_SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
```

3. Deploy Amplify backend:

```bash
npx ampx sandbox
```

4. Start development server:

```bash
npm run dev
```

### For AI Agents

**Grok Bot:** Download a template from [wayfind.click](https://wayfind.click/) — Grok Bot will guide you through setup.

**Other agents (Claude Code, Cursor, OpenCode):**

1. Install the MCP server:

```bash
npm install -g @tamago-labs/wayfind-mcp
```

2. Get your API key from [wayfind.click](https://wayfind.click/) dashboard.

3. Configure for your agent:

```json
{
  "mcpServers": {
    "wayfind-solana": {
      "command": "npx",
      "args": ["-y", "@tamago-labs/wayfind-mcp"],
      "env": { "WAYFIND_API_KEY": "your_key_here" }
    }
  }
}
```

## Project Structure

```
app/
  dashboard/
    portfolio/      # Portfolio Overview
    explore/        # Explore Tokenized Stocks
    pre-ipo/        # Pre-IPO Markets
    strategies/     # Rule-Based Strategies
    new-chat/       # New Portfolio Review
    review/         # AI Risk Review Wizard
    chats/[id]/     # Chat Further (post-review discussion)
    token/[slug]/[crypto_id]/  # Token Detail
  api/
    crypto-prices/  # Price proxy route
    swap-instruction/ # OKX DEX swap
components/
  dashboard/        # Dashboard-specific components
  landing/          # Landing page components
amplify/
  functions/
    price-tracker/  # Scheduled price fetcher
    ohlcv-fetcher/  # Historical data fetcher
    risk-review/    # AI Risk Engine Lambda
    chat-further/   # Post-review chat Lambda
  data/             # Data models and schema
scripts/
  fetch-all.ts      # Fetch all stock RWAs
  rwa-filter.ts     # Filter active stocks by price
  rwa-info-final.ts # Fetch RWA metadata
lib/
  data/
    rwa-v1-list.json  # Generated token registry (534 tokens)
```

## AI Credits

Wayfind uses an AI credits system to power on-demand analysis. Each user can claim **1,000 free AI credits** to get started — no purchase required. Credits are consumed when running AI-powered operations: risk evaluations consume based on input/output token usage across the analysis pipeline, and each chat message in the multi-agent system consumes based on model token usage.

Wayfind is currently free for all users. As we scale, usage-based pricing will be introduced so you only pay for the AI analysis you actually use. All AI operations deduct credits at a fixed rate of **$0.01 per token** (input + output).

## Tech Stack

- **Frontend:** Next.js 15 (App Router), Tailwind CSS, Framer Motion
- **Backend:** AWS Amplify Gen 2, AWS Lambda, DynamoDB
- **AI:** OpenAI Agents SDK, multi-agent architecture with session memory, Frontier AI (GPT-6 Astra)
- **Agent Infrastructure:** MCP Server (`@tamago-labs/wayfind-mcp`), Agent Skills (`wayfind-skills`) for Grok Bot, Claude Code, Cursor
- **Blockchain:** Solana Web3.js, OKX DEX Router, multi-chain wallet support
- **Data:** CoinGecko (RWA + crypto endpoints), PreStocks API

## License

MIT
