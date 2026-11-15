// Token Radar — model radar-2.
//
// Ranks pre-token DeFi protocols by an implied token value derived only
// from the sealed snapshot's own figures: a protocol's TVL, its seven-day
// growth, and how long it has run with no token recorded. The category
// multiple is calibrated at run time from the snapshot itself: the median
// mcap/TVL of the live-token protocols in each category (when at least five
// of them exist), else the overall median. No protocol name is special-cased.

export interface Protocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: Protocol[];
  watchlist: string[];
}

export interface CategoryMultiple {
  category: string;
  multiple: number;
  sample: number;
  fallback: boolean;
}

export interface RowModel {
  category_multiple: number;
  growth_pct: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  age_days: number | null;
}

export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  model: RowModel;
  farm_steps: string[];
}

export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number;
}

export interface Radar {
  rows: BoardRow[];
  live: LiveRow[];
  category_multiples: CategoryMultiple[];
  overall_multiple: number;
  watchlist_size: number;
  early_size: number;
  live_size: number;
}

// The model constants, kept in one place so the dashboard can restate them.
export const MODEL = {
  version: "radar-2",
  growth_floor_pct: -60,
  growth_cap_pct: 120,
  growth_weight: 0.5,
  maturity_base: 0.6,
  maturity_span: 0.4,
  maturity_days: 1095,
  age_default_days: 365,
  min_category_sample: 5,
  early_cap: 160,
  live_shown: 24,
};

const EXCLUDED_CATEGORIES = new Set([
  "Bridge",
  "Canonical Bridge",
  "Liquid Staking",
  "Liquid Restaking",
  "Restaked BTC",
  "CEX",
]);

const EXCHANGE_NAMES =
  /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/;

const VERSION_SUFFIX = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;

export function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

export function isPreToken(p: Protocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

export function isLiveToken(p: Protocol): boolean {
  return (
    p.mcap_usd !== null &&
    p.mcap_usd > 0 &&
    p.gecko_id !== null &&
    p.symbol !== null &&
    p.tvl_usd > 0
  );
}

export function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

export function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}

/** Whole days from a protocol's first listing to the snapshot date. */
export function ageDays(p: Protocol, asOf: string): number | null {
  if (!p.listed_at) return null;
  const listed = new Date(`${p.listed_at}T00:00:00Z`).getTime();
  const snapshot = new Date(`${asOf}T00:00:00Z`).getTime();
  if (Number.isNaN(listed) || Number.isNaN(snapshot)) return null;
  return Math.max(0, Math.floor((snapshot - listed) / 86400000));
}

/** The median mcap/TVL multiple for every category, calibrated at run time. */
export function computeMultiples(
  protocols: Protocol[],
): { multiples: Map<string, number>; overall: number; table: CategoryMultiple[] } {
  const live = protocols.filter(isLiveToken);
  const overall = median(live.map((p) => (p.mcap_usd as number) / p.tvl_usd));
  const byCategory = new Map<string, number[]>();
  for (const p of live) {
    const key = p.category ?? "Uncategorized";
    const list = byCategory.get(key) ?? [];
    list.push((p.mcap_usd as number) / p.tvl_usd);
    byCategory.set(key, list);
  }
  const multiples = new Map<string, number>();
  const table: CategoryMultiple[] = [];
  for (const category of [...byCategory.keys()].sort()) {
    const ratios = byCategory.get(category) as number[];
    const fallback = ratios.length < MODEL.min_category_sample;
    const multiple = fallback ? overall : median(ratios);
    multiples.set(category, multiple);
    table.push({
      category,
      multiple: round4(multiple),
      sample: ratios.length,
      fallback,
    });
  }
  return { multiples, overall, table };
}

/** The implied token value of one protocol, in whole dollars. */
export function impliedValue(
  p: Protocol,
  categoryMultiple: number,
  age: number | null,
): { value: number; model: RowModel } {
  const growthPct = clamp(p.change_7d ?? 0, MODEL.growth_floor_pct, MODEL.growth_cap_pct);
  const growthMultiplier = 1 + (growthPct / 100) * MODEL.growth_weight;
  const ageForModel = age ?? MODEL.age_default_days;
  const maturityMultiplier =
    MODEL.maturity_base +
    (Math.min(Math.max(ageForModel, 0), MODEL.maturity_days) / MODEL.maturity_days) *
      MODEL.maturity_span;
  const value = Math.max(
    1,
    Math.round(p.tvl_usd * categoryMultiple * growthMultiplier * maturityMultiplier),
  );
  return {
    value,
    model: {
      category_multiple: categoryMultiple,
      growth_pct: growthPct,
      growth_multiplier: round4(growthMultiplier),
      maturity_multiplier: round4(maturityMultiplier),
      age_days: age,
    },
  };
}

/**
 * The watchlist's own exclusion rule, applied to below-the-floor protocols:
 * no bridged, liquid-staking or exchange product, no versioned name, no
 * wrapped or staked product, no exchange-branded name.
 */
export function isRankable(p: Protocol): boolean {
  if (!isPreToken(p)) return false;
  if (p.category !== null && EXCLUDED_CATEGORIES.has(p.category)) return false;
  if (VERSION_SUFFIX.test(p.name)) return false;
  if (WRAPPED_WORD.test(p.name)) return false;
  if (EXCHANGE_NAMES.test(p.name)) return false;
  return true;
}

function capitalFor(tvlUsd: number): number {
  if (tvlUsd >= 5_000_000_000) return 250;
  if (tvlUsd >= 1_000_000_000) return 150;
  if (tvlUsd >= 100_000_000) return 100;
  return 50;
}

function categoryAction(p: Protocol, capital: number): string {
  const category = (p.category ?? "").toLowerCase();
  const chain = p.chains[0] ?? "its main chain";
  const name = p.name;
  if (
    category.includes("lend") ||
    category.includes("cdp") ||
    category.includes("collateral")
  ) {
    return `Supply $${capital} of USDC to ${name} on ${chain} and keep the position open.`;
  }
  if (
    category.includes("dex") ||
    category.includes("yield") ||
    category.includes("leveraged farm")
  ) {
    return `Provide $${capital} of liquidity to ${name}'s main pool on ${chain} and keep the position open.`;
  }
  if (category.includes("bridge")) {
    return `Bridge $${capital} of USDC to ${chain} through ${name} and use the bridged funds in its app.`;
  }
  if (category.includes("staking") || category.includes("restak")) {
    return `Stake $${capital} of the chain's staking asset through ${name} and keep the receipt.`;
  }
  if (category.includes("perpetual") || category.includes("derivative")) {
    return `Deposit $${capital} of USDC as margin on ${name} and open one small hedge.`;
  }
  if (category.includes("prediction")) {
    return `Fund $${capital} and place one market position on ${name}.`;
  }
  if (category.includes("curator") || category.includes("allocator")) {
    return `Deposit $${capital} into a ${name} vault on ${chain} and keep the shares.`;
  }
  if (category.includes("stable")) {
    return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain}.`;
  }
  if (category.includes("rwa")) {
    return `Mint $${capital} of the protocol's yield asset on ${chain} and hold it.`;
  }
  if (category.includes("insurance")) {
    return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy.`;
  }
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

/** Six concrete farm steps, each carrying its cost and its time. */
export function farmSteps(p: Protocol, age: number | null): string[] {
  const capital = capitalFor(p.tvl_usd);
  const gas = capital < 150 ? 4 : 8;
  const holdDays = age === null ? 30 : age < 180 ? 60 : age < 365 ? 45 : 30;
  return [
    `Create a fresh wallet for ${p.name} only, write its seed phrase on paper and store it offline. Cost: under $3 of gas. Time: 5 minutes.`,
    `${categoryAction(p, capital)} Cost: $${capital} of capital and about $${gas} of gas. Time: 15 minutes.`,
    `Do one qualifying action each week on ${p.name}: deposit, borrow, swap or vote, so the activity is steady rather than a single burst. Cost: about $2 of gas a week. Time: 10 minutes a week.`,
    `Hold the position for at least ${holdDays} days before touching it, so the activity reads as real use and not a flash farm. Cost: the $${capital} stays in the position. Time: ${holdDays} days.`,
    `Before withdrawing, check ${p.name}'s own points or rewards page and claim only from the link that page itself publishes. Cost: no fee to check, and never pay to claim. Time: 10 minutes.`,
    `Write the wallet, the dates and every transaction in a farm log, so the position can be audited later. Cost: nothing but the log. Time: 5 minutes.`,
  ];
}

/** The top live-token protocols by market cap, set aside, never ranked. */
export function liveRows(protocols: Protocol[]): LiveRow[] {
  return protocols
    .filter((p) => isLiveToken(p) && p.category !== "CEX")
    .sort((a, b) => (b.mcap_usd as number) - (a.mcap_usd as number))
    .slice(0, MODEL.live_shown)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      change_7d: p.change_7d,
      mcap_usd: p.mcap_usd as number,
    }));
}

/** Build the whole radar: the ranked board, the live set, the calibration. */
export function buildRadar(snapshot: Snapshot): Radar {
  const { multiples, overall, table } = computeMultiples(snapshot.protocols);
  const bySlug = new Map(snapshot.protocols.map((p) => [p.slug, p]));
  const chosen = new Set<string>(snapshot.watchlist);
  const early = snapshot.protocols
    .filter((p) => isPreToken(p) && p.tvl_usd < snapshot.floor_usd && isRankable(p))
    .sort((a, b) => b.tvl_usd - a.tvl_usd)
    .slice(0, MODEL.early_cap);
  for (const p of early) chosen.add(p.slug);

  const rows: BoardRow[] = [...chosen]
    .map((slug) => bySlug.get(slug) as Protocol)
    .filter((p) => p !== undefined)
    .map((p) => {
      const multiple = multiples.get(p.category ?? "Uncategorized") ?? overall;
      const age = ageDays(p, snapshot.as_of);
      const { value, model } = impliedValue(p, multiple, age);
      return {
        rank: 0,
        slug: p.slug,
        name: p.name,
        category: p.category,
        chains: p.chains,
        tvl_usd: p.tvl_usd,
        change_7d: p.change_7d,
        mcap_usd: p.mcap_usd,
        listed_at: p.listed_at,
        age_days: age,
        implied_value_usd: value,
        model,
        farm_steps: farmSteps(p, age),
      };
    })
    .sort((a, b) => b.implied_value_usd - a.implied_value_usd || (a.slug < b.slug ? -1 : 1));
  rows.forEach((row, index) => {
    row.rank = index + 1;
  });

  const live = liveRows(snapshot.protocols);
  return {
    rows,
    live,
    category_multiples: table,
    overall_multiple: round4(overall),
    watchlist_size: snapshot.watchlist.length,
    early_size: early.length,
    live_size: live.length,
  };
}

/** Refuse a board that breaks the gate's shape; returns the reason or null. */
export function boardIssue(rows: BoardRow[], watchlist: string[]): string | null {
  const slugs = new Set(rows.map((r) => r.slug));
  for (const slug of watchlist) {
    if (!slugs.has(slug)) return `watchlist slug missing from board: ${slug}`;
  }
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].rank !== i + 1) return `ranks are not exactly 1..N (row ${i} has rank ${rows[i].rank})`;
    if (i > 0 && rows[i].implied_value_usd > rows[i - 1].implied_value_usd) {
      return `implied value rises with rank at ${rows[i].slug}`;
    }
  }
  if (rows.length > 1 && rows.every((r) => r.implied_value_usd === rows[0].implied_value_usd)) {
    return "all rows share one implied value";
  }
  for (const row of rows) {
    if (!Number.isInteger(row.implied_value_usd) || row.implied_value_usd <= 0) {
      return `non-positive or non-integer implied value at ${row.slug}`;
    }
    if (row.farm_steps.length < 3 || row.farm_steps.length > 12) {
      return `farm_steps count out of range at ${row.slug}`;
    }
    for (const step of row.farm_steps) {
      const trimmed = step.trim();
      if (trimmed.length < 20 || trimmed.length > 600) {
        return `farm step length out of range at ${row.slug}`;
      }
    }
  }
  return null;
}
