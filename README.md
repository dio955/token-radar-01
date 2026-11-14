# Token Radar — model radar-2

A dashboard that ranks pre-token DeFi protocols by implied value, from a sealed
DefiLlama snapshot. make.fun competition `token-radar-01`.

## The model (radar-2)

The starter's radar-1 priced every protocol with one flat multiple (0.25x TVL).
The market does not price every category the same, so radar-2 calibrates the
base multiple per category at run time, from the snapshot itself: for each
category, the median market-cap-to-TVL ratio of the live-token protocols in
that category (at least five of them); a category with too few takes the
overall median across all live-token protocols.

```
multiple   = median mcap/TVL of live-token protocols in the category
             (n >= 5), else the overall median mcap/TVL
base       = tvl_usd x multiple
growth     = clamp(change_7d, -60, 120) per cent
growthMult = 1 + (growth / 100) x 0.5
maturity   = 0.6 + min(age_days, 1095) / 1095 x 0.4   (age unknown: 365 days)
implied    = max(1, round(base x growthMult x maturity))
```

No protocol name is special-cased: the same function scores every row.

The board covers the whole watchlist (40 protocols, the floor) and adds 138
early rows: pre-token protocols below the watchlist floor, by TVL, applying
the watchlist's own exclusion rule (no bridges, liquid staking/restaking,
wrapped or staked products, versioned names, or exchanges). 178 rows in all.

## The dashboard

A static page (no framework, no network): a sortable, filterable board with
a per-protocol detail drawer showing the model's own inputs and a farm plan,
a live-token view set aside from the ranking, and the calibration table that
shows every category multiple with its sample size. Dark navy + amber theme.

## Run

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json>
```

Node 22, standard library only. `vendor/makefun-board.ts` is make.fun's
vendored dossier library, copied unchanged from the kit.
