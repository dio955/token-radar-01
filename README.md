[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/dio955/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard)
[![reward](https://make.fun/badge/token-radar-01/dio955/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01)

Built for [make.fun's Token Radar bounty](https://make.fun/bounty/token-radar-01).

# Token Radar — radar-2

A dashboard that ranks pre-token DeFi protocols by what their launch would
be worth, and shows how to farm each one.

## The model (radar-2)

Each protocol's implied token value follows from the sealed snapshot's own
figures only: its TVL, its seven-day growth, and how long it has run with no
token recorded. No protocol name is special-cased.

- **Category multiple, calibrated at run time.** For each category, the
  multiple is the median mcap/TVL of that category's live-token protocols
  in the snapshot (at least five of them), otherwise the overall median
  (0.2227x here). A DEX is priced near 0.34x TVL and lending near 0.13x
  because that is what the market pays.
- **Implied value.** `round(tvl x category_multiple x (1 + clamp(change_7d,
  -60, 120)/100 x 0.5) x (0.6 + min(age_days, 1095)/1095 x 0.4))`.
  Age is the time since DefiLlama first listed the protocol; a protocol
  with no listing date is treated as one year old.
- **The board.** The 40-protocol watchlist is the floor; the early radar
  adds up to 160 pre-token protocols below the $50M floor that pass the
  watchlist's own exclusion rule (no bridges, liquid staking, wrapped or
  exchange-branded products, no versioned names). This snapshot scores 178
  rows: Steakhouse Financial first at about $484M implied.
- **Farm plan.** Six steps per protocol, each with its cost and time,
  derived from the protocol's own category, chains, TVL and age.
- **Live tokens set aside.** The top 24 live-token protocols by market cap
  are shown separately for calibration; their market cap is a fact, not a
  model.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json>
```

`main.ts` (Node 22, standard library only) writes `board.json`,
`data.js`, copies `dashboard/` and `screenshots/` into the output, and
writes `dossier.json` last with `buildDossier` from
`vendor/makefun-board.ts`. It runs twice and writes identical bytes.

## The dashboard

A static page (`dashboard/index.html`, `app.css`, `app.js`) that reads
`data.js` with no network: a sortable, filterable board, a live-token tab,
the model and calibration panels, and a detail drawer per protocol that
recomputes the row from the snapshot figures and shows its farm plan.
