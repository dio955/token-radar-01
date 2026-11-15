// Token Radar dashboard — reads window.RADAR (written by main.ts) and renders
// the board, the live-token set, the model and calibration panels, and a
// detail drawer per protocol. No network: every figure comes from the data
// file beside this page. The detail view recomputes each row from the
// snapshot figures with the same function main.ts used, and the farm plan
// is generated here from the same derivation as lib/model.ts.

(function () {
  var R = window.RADAR;
  var M = R.model;
  var rows = R.rows;
  var live = R.live;
  var maxImplied = rows.length ? rows[0].implied_value_usd : 1;

  var state = { q: "", category: "all", tab: "pre", sortKey: "implied", sortDir: -1 };

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }

  function fmtMoney(v) {
    if (v >= 1e9) return "$" + (v / 1e9).toFixed(2) + "B";
    if (v >= 1e6) return "$" + (v / 1e6).toFixed(1) + "M";
    if (v >= 1e3) return "$" + Math.round(v / 1e3) + "K";
    return "$" + v;
  }
  function fmtFull(v) { return "$" + v.toLocaleString("en-US"); }
  function fmtChange(v) {
    if (v === null || v === undefined) return '<span class="na">n/a</span>';
    var cls = v > 0 ? "pos" : v < 0 ? "neg" : "na";
    var sign = v > 0 ? "+" : "";
    return '<span class="' + cls + '">' + sign + v.toFixed(2) + "%</span>";
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return "unknown";
    if (days >= 365) return (days / 365).toFixed(1) + "y";
    return days + "d";
  }
  function fmtMultiple(v) { return v.toFixed(3) + "x"; }

  // ---- the model, restated here so the page can recompute every row ----
  function growthMultiplier(change7d) {
    var g = clamp(change7d === null || change7d === undefined ? 0 : change7d, M.growth_floor_pct, M.growth_cap_pct);
    return 1 + (g / 100) * M.growth_weight;
  }
  function maturityMultiplier(ageDays) {
    var age = ageDays === null || ageDays === undefined ? M.age_default_days : ageDays;
    return M.maturity_base + (Math.min(Math.max(age, 0), M.maturity_days) / M.maturity_days) * M.maturity_span;
  }
  function recompute(row) {
    var value = Math.max(1, Math.round(
      row.tvl_usd * row.category_multiple * growthMultiplier(row.change_7d) * maturityMultiplier(row.age_days)
    ));
    return { value: value, growth: growthMultiplier(row.change_7d), maturity: maturityMultiplier(row.age_days) };
  }

  // ---- the farm plan, the same derivation as lib/model.ts ----
  function capitalFor(tvl) {
    if (tvl >= 5000000000) return 250;
    if (tvl >= 1000000000) return 150;
    if (tvl >= 100000000) return 100;
    return 50;
  }
  function categoryAction(row, capital) {
    var category = (row.category || "").toLowerCase();
    var chain = row.chains[0] || "its main chain";
    var name = row.name;
    if (category.indexOf("lend") !== -1 || category.indexOf("cdp") !== -1 || category.indexOf("collateral") !== -1)
      return "Supply $" + capital + " of USDC to " + name + " on " + chain + " and keep the position open.";
    if (category.indexOf("dex") !== -1 || category.indexOf("yield") !== -1 || category.indexOf("leveraged farm") !== -1)
      return "Provide $" + capital + " of liquidity to " + name + "'s main pool on " + chain + " and keep the position open.";
    if (category.indexOf("bridge") !== -1)
      return "Bridge $" + capital + " of USDC to " + chain + " through " + name + " and use the bridged funds in its app.";
    if (category.indexOf("staking") !== -1 || category.indexOf("restak") !== -1)
      return "Stake $" + capital + " of the chain's staking asset through " + name + " and keep the receipt.";
    if (category.indexOf("perpetual") !== -1 || category.indexOf("derivative") !== -1)
      return "Deposit $" + capital + " of USDC as margin on " + name + " and open one small hedge.";
    if (category.indexOf("prediction") !== -1)
      return "Fund $" + capital + " and place one market position on " + name + ".";
    if (category.indexOf("curator") !== -1 || category.indexOf("allocator") !== -1)
      return "Deposit $" + capital + " into a " + name + " vault on " + chain + " and keep the shares.";
    if (category.indexOf("stable") !== -1)
      return "Mint or deposit $" + capital + " of the stable asset through " + name + " on " + chain + ".";
    if (category.indexOf("rwa") !== -1)
      return "Mint $" + capital + " of the protocol's yield asset on " + chain + " and hold it.";
    if (category.indexOf("insurance") !== -1)
      return "Buy $" + capital + " of cover from " + name + " on " + chain + " and keep the policy.";
    return "Deposit $" + capital + " of USDC into " + name + " on " + chain + " and keep the position open.";
  }
  function farmSteps(row) {
    var capital = capitalFor(row.tvl_usd);
    var gas = capital < 150 ? 4 : 8;
    var age = row.age_days;
    var hold = age === null || age === undefined ? 30 : age < 180 ? 60 : age < 365 ? 45 : 30;
    return [
      "Create a fresh wallet for " + row.name + " only, write its seed phrase on paper and store it offline. Cost: under $3 of gas. Time: 5 minutes.",
      categoryAction(row, capital) + " Cost: $" + capital + " of capital and about $" + gas + " of gas. Time: 15 minutes.",
      "Do one qualifying action each week on " + row.name + ": deposit, borrow, swap or vote, so the activity is steady rather than a single burst. Cost: about $2 of gas a week. Time: 10 minutes a week.",
      "Hold the position for at least " + hold + " days before touching it, so the activity reads as real use and not a flash farm. Cost: the $" + capital + " stays in the position. Time: " + hold + " days.",
      "Before withdrawing, check " + row.name + "'s own points or rewards page and claim only from the link that page itself publishes. Cost: no fee to check, and never pay to claim. Time: 10 minutes.",
      "Write the wallet, the dates and every transaction in a farm log, so the position can be audited later. Cost: nothing but the log. Time: 5 minutes."
    ];
  }

  // ---- header, lede, facts ----
  $("meta").innerHTML =
    "<span>Snapshot " + esc(R.as_of) + "</span><span>DefiLlama protocol index</span><span>" + esc(R.model_version) + " model</span>";
  $("lede-title").textContent = R.watchlist_size + " watchlist protocols, ranked by implied value";
  $("lede-text").textContent =
    "The watchlist is the floor: " + R.watchlist_size + " protocols with at least " + fmtMoney(R.floor_usd) +
    " of TVL and no token on record. The early radar adds " + R.early_size +
    " more below that floor, found by the same rule, so the board ranks " + R.board_size +
    " pre-token protocols in all. Each row's implied value comes from its TVL, its seven-day growth and how long it has run with no token.";
  $("facts").innerHTML =
    "<dt>Watchlist covered</dt><dd>" + R.watchlist_size + " / " + R.watchlist_size + "</dd>" +
    "<dt>Pre-token rows scored</dt><dd>" + R.board_size + "</dd>" +
    "<dt>Early rows below the floor</dt><dd>" + R.early_size + "</dd>" +
    "<dt>Live-token protocols set aside</dt><dd>" + R.live_size + "</dd>";
  $("foot").textContent =
    "Snapshot " + R.as_of + " from the DefiLlama protocol index. Implied values are this entry's own model, not a promise and not DefiLlama's.";

  // ---- model + calibration panels ----
  var dex = null, lending = null, fallbackCount = 0;
  R.category_multiples.forEach(function (c) {
    if (c.category === "Dexs") dex = c.multiple;
    if (c.category === "Lending") lending = c.multiple;
    if (c.fallback) fallbackCount++;
  });
  $("model-text").textContent =
    "The category multiple is the median mcap/TVL of the live-token protocols in that category, read from this snapshot at run time — " +
    "never a hardcoded list. Categories with fewer than " + M.min_category_sample + " live-token protocols take the overall median, " +
    R.overall_multiple.toFixed(4) + "x. A DEX is priced near " + (dex !== null ? dex.toFixed(2) : "?") + "x TVL and lending near " +
    (lending !== null ? lending.toFixed(2) : "?") + "x because that is what the market pays for those categories today. " +
    "Age is the time since DefiLlama first listed the protocol. Bridges, liquid staking and wrapped products are left out, as the watchlist leaves them out.";
  var calibrated = R.category_multiples.filter(function (c) { return !c.fallback; });
  $("calibration-body").innerHTML = calibrated.map(function (c) {
    return "<tr><td>" + esc(c.category) + "</td><td class=\"num\">" + c.multiple.toFixed(4) + "x</td><td class=\"num\">" +
      c.sample + "</td><td>median of " + c.sample + " live-token protocols</td></tr>";
  }).join("");
  $("calibration-text").textContent =
    "The other " + fallbackCount + " categor" + (fallbackCount === 1 ? "y" : "ies") +
    " with live-token protocols take the overall median, " + R.overall_multiple.toFixed(4) + "x, for want of a sample of five.";

  // ---- controls ----
  var categories = [];
  rows.forEach(function (r) { if (r.category && categories.indexOf(r.category) === -1) categories.push(r.category); });
  categories.sort();
  $("category").innerHTML = '<option value="all">All categories</option>' +
    categories.map(function (c) { return '<option value="' + esc(c) + '">' + esc(c) + "</option>"; }).join("");

  function readHash() {
    var params = new URLSearchParams(location.hash.slice(1));
    state.q = params.get("q") || "";
    state.category = params.get("category") || "all";
    if (params.get("p")) openDetail(params.get("p"), true);
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set("q", state.q);
    if (state.category !== "all") params.set("category", state.category);
    var open = $("detail").open ? $("detail").dataset.slug : "";
    if (open) params.set("p", open);
    var hash = params.toString();
    history.replaceState(null, "", hash ? "#" + hash : location.pathname + location.search);
  }

  function sortValue(row, key) {
    if (key === "rank") return row.rank;
    if (key === "name") return row.name.toLowerCase();
    if (key === "tvl") return row.tvl_usd;
    if (key === "growth") return row.change_7d === null ? -1e9 : row.change_7d;
    if (key === "age") return row.age_days === null ? -1 : row.age_days;
    if (key === "multiple") return row.category_multiple;
    return row.implied_value_usd;
  }
  function filteredRows() {
    var q = state.q.trim().toLowerCase();
    var list = rows.filter(function (r) {
      if (state.category !== "all" && r.category !== state.category) return false;
      if (!q) return true;
      var hay = (r.name + " " + (r.category || "") + " " + r.chains.join(" ")).toLowerCase();
      return hay.indexOf(q) !== -1;
    });
    list.sort(function (a, b) {
      var av = sortValue(a, state.sortKey), bv = sortValue(b, state.sortKey);
      if (av < bv) return -1 * state.sortDir;
      if (av > bv) return 1 * state.sortDir;
      return (a.slug < b.slug ? -1 : 1);
    });
    return list;
  }

  function renderBoard() {
    var list = filteredRows();
    $("board-body").innerHTML = list.map(function (r) {
      var pct = Math.max(2, (r.implied_value_usd / maxImplied) * 100);
      var chains = r.chains.slice(0, 2).join(", ");
      return '<tr tabindex="0" data-slug="' + esc(r.slug) + '">' +
        '<td class="rank">' + r.rank + "</td>" +
        '<td><div class="name">' + esc(r.name) + '</div><div class="sub">' + esc(r.category || "Uncategorized") + " on " + esc(chains) + "</div></td>" +
        '<td class="num">' + fmtMoney(r.tvl_usd) + "</td>" +
        "<td class=\"num\">" + fmtChange(r.change_7d) + "</td>" +
        '<td class="num">' + fmtAge(r.age_days) + "</td>" +
        '<td class="num">' + fmtMultiple(r.category_multiple) + "</td>" +
        '<td class="num"><span class="bar-wrap"><span class="bar" style="width:' + pct.toFixed(1) + '%"></span>' + fmtMoney(r.implied_value_usd) + "</span></td>" +
        '<td><span class="tag">no token</span></td></tr>';
    }).join("");
    $("empty").hidden = list.length > 0;
    $("count").textContent = list.length + " of " + rows.length + " protocols";
    document.querySelectorAll("#board-table th[data-sort]").forEach(function (th) {
      if (!th.dataset.label) th.dataset.label = th.textContent;
      var sorted = th.dataset.sort === state.sortKey;
      th.classList.toggle("sorted", sorted);
      th.setAttribute("aria-sort", sorted ? (state.sortDir === 1 ? "ascending" : "descending") : "none");
      th.textContent = th.dataset.label + (sorted ? (state.sortDir === 1 ? " ▲" : " ▼") : "");
    });
  }

  function renderLive() {
    $("live-body").innerHTML = live.map(function (p) {
      var chains = p.chains.slice(0, 2).join(", ");
      return "<tr><td><span class=\"tag live\">live</span></td>" +
        '<td><div class="name">' + esc(p.name) + '</div><div class="sub">' + esc(p.category || "Uncategorized") + " on " + esc(chains) + "</div></td>" +
        '<td class="num">' + fmtMoney(p.tvl_usd) + "</td>" +
        "<td class=\"num\">" + fmtChange(p.change_7d) + "</td>" +
        '<td class="num">' + fmtFull(p.mcap_usd) + "</td>" +
        "<td>already trades</td></tr>";
    }).join("");
  }

  function setTab(tab) {
    state.tab = tab;
    $("tab-pre").setAttribute("aria-selected", tab === "pre" ? "true" : "false");
    $("tab-live").setAttribute("aria-selected", tab === "live" ? "true" : "false");
    $("pre-panel").hidden = tab !== "pre";
    $("live-panel").hidden = tab !== "live";
    $("count").textContent = tab === "pre"
      ? filteredRows().length + " of " + rows.length + " protocols"
      : live.length + " live-token protocols";
  }

  // ---- detail drawer ----
  function openDetail(slug, fromHash) {
    var row = null;
    rows.forEach(function (r) { if (r.slug === slug) row = r; });
    if (!row) return;
    var dlg = $("detail");
    dlg.dataset.slug = slug;
    $("detail-rank").textContent = "Rank " + row.rank + " of " + rows.length;
    $("detail-name").textContent = row.name;
    $("detail-sub").textContent = (row.category || "Uncategorized") + " on " + row.chains.join(", ");
    var re = recompute(row);
    $("equation").innerHTML =
      "<dt>TVL</dt><dd>" + fmtFull(row.tvl_usd) + "</dd>" +
      "<dt>Category multiple (" + esc(row.category || "Uncategorized") + ")</dt><dd>" + row.category_multiple.toFixed(4) + "x</dd>" +
      "<dt>Seven-day growth</dt><dd>" + (row.change_7d === null ? "n/a" : (row.change_7d > 0 ? "+" : "") + row.change_7d.toFixed(2) + "%") + "</dd>" +
      "<dt>Age with no token</dt><dd>" + fmtAge(row.age_days) + "</dd>" +
      "<dt>Growth multiplier</dt><dd>" + re.growth.toFixed(4) + "</dd>" +
      "<dt>Maturity multiplier</dt><dd>" + re.maturity.toFixed(4) + "</dd>" +
      '<dt>Implied value</dt><dd class="total">' + fmtFull(row.implied_value_usd) + "</dd>";
    var note = $("recompute");
    if (re.value === row.implied_value_usd) {
      note.textContent = "Model radar-2: the same function scores every protocol. The page recomputes this row as " +
        fmtFull(re.value) + ", the same number board.json carries.";
      note.classList.remove("stale");
    } else {
      note.textContent = "Model radar-2: the page recomputes this row as " + fmtFull(re.value) +
        ", which differs from the " + fmtFull(row.implied_value_usd) + " board.json carries — the data would be stale.";
      note.classList.add("stale");
    }
    $("farm").innerHTML = farmSteps(row).map(function (step) {
      var cut = step.indexOf(" Cost: ");
      var action = cut === -1 ? step : step.slice(0, cut);
      var tail = cut === -1 ? "" : step.slice(cut + 1);
      return "<li><strong>" + esc(action) + '</strong><span class="tail">' + esc(tail) + "</span></li>";
    }).join("");
    if (!dlg.open) dlg.showModal();
    if (!fromHash) writeHash();
  }
  function closeDetail() {
    var dlg = $("detail");
    if (dlg.open) dlg.close();
    delete dlg.dataset.slug;
    writeHash();
  }

  // ---- wiring ----
  $("search").addEventListener("input", function (e) { state.q = e.target.value; renderBoard(); writeHash(); });
  $("category").addEventListener("change", function (e) { state.category = e.target.value; renderBoard(); writeHash(); });
  $("clear-filters").addEventListener("click", function () {
    state.q = ""; state.category = "all";
    $("search").value = ""; $("category").value = "all";
    renderBoard(); writeHash();
  });
  $("tab-pre").addEventListener("click", function () { setTab("pre"); });
  $("tab-live").addEventListener("click", function () { setTab("live"); });
  document.querySelectorAll("#board-table th[data-sort]").forEach(function (th) {
    th.addEventListener("click", function () {
      var key = th.dataset.sort;
      if (state.sortKey === key) state.sortDir *= -1;
      else { state.sortKey = key; state.sortDir = key === "name" || key === "rank" ? 1 : -1; }
      renderBoard();
    });
  });
  $("board-body").addEventListener("click", function (e) {
    var tr = e.target.closest("tr[data-slug]");
    if (tr) openDetail(tr.dataset.slug);
  });
  $("board-body").addEventListener("keydown", function (e) {
    if (e.key !== "Enter" && e.key !== " ") return;
    var tr = e.target.closest("tr[data-slug]");
    if (tr) { e.preventDefault(); openDetail(tr.dataset.slug); }
  });
  $("detail-close").addEventListener("click", closeDetail);
  $("detail").addEventListener("close", function () { delete $("detail").dataset.slug; writeHash(); });

  // ---- initial state ----
  $("search").value = "";
  renderBoard();
  renderLive();
  setTab("pre");
  readHash();
  if (state.q) $("search").value = state.q;
  if (state.category !== "all") $("category").value = state.category;
  renderBoard();
})();
