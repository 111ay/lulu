/* =========================================================
   view-trend.js · 走势：图表只是体检报告，不是判决书
   ========================================================= */
(function (w) {
  "use strict";
  const Act = (w.Act = w.Act || {});

  function monthBar(mk) {
    const first = Store.s.firstMonth || Engine.CUR();
    return `<div class="row between" style="gap:10px">
      <button class="btn sm" data-act="trendMonth" data-d="-1" type="button">‹ 上月</button>
      <div style="text-align:center">
        <div style="font-weight:700;font-size:16px">${U.esc(U.monthLabel(mk))}</div>
        <div class="micro">${mk === Engine.CUR() ? "进行中" : "已归档"}</div>
      </div>
      <button class="btn sm" data-act="trendMonth" data-d="1" ${mk >= Engine.CUR() ? "disabled" : ""} type="button">下月 ›</button>
    </div>
    ${mk <= first ? `<div class="micro center mt6">再往前就没有记录了</div>` : ""}`;
  }

  function overviewHtml(s, st) {
    const cards = [
      ["收入", st.income, ""],
      ["消费", st.consume, ""],
      ["存下 / 还掉", st.moved, ""],
      ["剩下", st.net, st.net >= 0 ? "pos" : "neg"]
    ];
    return `<div class="stat-grid">` + cards.map(c =>
      `<div class="stat"><div class="stat-l">${c[0]}</div>
        <div class="v ${c[2]}">${c[1] < 0 ? "−¥" : "¥"}${U.money(Math.abs(c[1]))}</div></div>`).join("") + `</div>
      <div class="row between mt14">
        <span class="tiny muted">结余率 <b>${U.pct(st.rate)}</b> · 记录 <b>${st.count}</b> 笔 · 记了 <b>${Object.keys(st.days).length}</b> 天</span>
        ${s.daysLeft > 0 ? `<span class="pill g">每天额度 ¥${U.money(Math.max(0, s.daily))}</span>` : `<span class="pill b">本月已结束</span>`}
      </div>`;
  }

  function curveHtml(mk, st, s) {
    const dim = U.daysInMonth(mk);
    const limit = mk === Engine.CUR() ? +U.today().slice(8) : dim;
    const curve = [];
    let acc = 0;
    for (let d = 1; d <= limit; d++) {
      acc = U.round2(acc + (st.dayConsume[mk + "-" + U.PAD(d)] || 0));
      curve.push(acc);
    }
    const labels = curve.map((_, i) => (i + 1) + "日");
    const plan = U.round2(Math.max(0, s.income - s.fixedLeft - s.goalLeft));
    return `<div class="chart">${Charts.cumulative(curve.length ? curve : [0, 0], { labels, total: plan, height: 210 })}</div>
      <div class="legend">
        <span><i style="background:var(--primary)"></i>累计花掉 ¥${U.money(curve[curve.length - 1] || 0)}</span>
        <span><i style="background:var(--warm)"></i>按推导，这个月最多能花 ¥${U.money(plan)}</span>
      </div>
      ${plan > 0 && (curve[curve.length - 1] || 0) > plan ? `<p class="tiny mt6" style="color:var(--neg)">这条线已经穿过虚线了：本月剩下的每天都需要靠下个月的收入来垫。</p>` : ""}`;
  }

  function barsHtml() {
    const ms = Engine.monthsBack(6);
    const rows = ms.map(m => {
      const st = Engine.monthStat(m);
      return { label: U.monthShort(m), income: st.income, expense: st.consume };
    });
    return `<div class="chart">${Charts.groupedBars(rows, { height: 240 })}</div>
      <div class="legend">
        <span><i style="background:var(--primary)"></i>收入</span>
        <span><i style="background:var(--warm)"></i>消费（不含储蓄 / 还款）</span>
        <span class="micro">近 6 个月</span>
      </div>`;
  }

  function donutHtml(bd) {
    if (!bd.rows.length) return `<div class="empty"><span class="em">🍩</span><p>这个月还没有消费记录。</p></div>`;
    const top = bd.rows.slice(0, 7);
    const rest = bd.rows.slice(7);
    const items = top.map(r => ({ label: r.cat.name, value: r.amount, color: Charts.catColor(r.cat.id) }));
    if (rest.length) {
      items.push({ label: "其余 " + rest.length + " 类", value: U.sum(rest, r => r.amount), color: "var(--surface-3)" });
    }
    return `<div class="row gap16 wrap" style="align-items:center;justify-content:center">
        <div style="width:180px;flex:0 0 auto">${Charts.donut(items, { size: 180, centerTop: "¥" + Charts.fmtY(bd.total), centerSub: "本月消费" })}</div>
        <ul class="legend" style="flex:1 1 190px;flex-direction:column;gap:7px;margin:0">
          ${items.map((it, i) => `<li><span><i style="background:${it.color}"></i>${U.esc(it.label)} · ${U.pct(it.value / (bd.total || 1) * 100, 1)}</span></li>`).join("")}
        </ul>
      </div>`;
  }

  function rankHtml(bd) {
    if (!bd.rows.length) return "";
    return `<ul class="list">` + bd.rows.slice(0, 10).map(r => {
      const c = r.cat;
      const over = r.budget > 0 && r.amount > r.budget;
      const delta = r.avg > 0 ? U.round2(r.amount - r.avg) : null;
      return `<li>
        <span class="ico-box">${c.emoji}</span>
        <span class="li-main">
          <span class="li-t">${U.esc(c.name)} ${over ? `<span class="pill r">超预算</span>` : ""}</span>
          <span class="li-s">${Store.TAG_META[c.tag].label} · 占 ${(r.share).toFixed(0)}%${r.budget ? " · 上限 ¥" + U.money(r.budget) : ""}</span>
          ${r.budget ? `<span class="bar thin"><i class="${over ? "rose" : ""}" style="width:${U.clamp(r.amount / r.budget * 100, 0, 100)}%"></i></span>` : ""}
        </span>
        <span style="text-align:right;flex:0 0 auto">
          <span class="li-a">¥${U.money(r.amount)}</span>
          ${delta != null ? `<span class="micro" style="display:block;color:${delta > 0 ? "var(--neg)" : "var(--pos)"}">${delta > 0 ? "比均值 +" : "比均值 −"}${U.money(Math.abs(delta))}</span>` : ""}
        </span>
        <span class="li-side"><button class="mini-x" data-act="filterCat" data-cat="${c.id}" title="看这个分类" type="button">›</button></span>
      </li>`;
    }).join("") + `</ul>`;
  }

  function tagHtml(ts) {
    const rows = ts.rows.filter(r => r.amount > 0);
    if (!rows.length) return `<p class="tiny muted">还没有可拆分的消费。</p>`;
    return `<div class="stack g14">` + rows.map(r =>
      `<div><div class="row between"><span class="tiny"><b>${r.label}</b> · ${r.desc}</span>
        <span class="tiny num">¥${U.money(r.amount)} · ${U.pct(r.share)}</span></div>
        <span class="bar thin mt6"><i class="${r.key === "want" ? "warm" : r.key === "fixed" ? "cool" : ""}" style="width:${r.share.toFixed(1)}%"></i></span></div>`).join("") + `
        <p class="tiny muted">「刚性 + 必要」占 ${(ts.rows[0].share + ts.rows[1].share).toFixed(0)}%。
        只有「想要」这一栏是真正可以调的 —— 前两栏砍不动，不是你不自律。</p></div>`;
  }

  function bigOnes(mk) {
    const list = U.sortBy(Store.txns({ month: mk, flow: "out" }), t => t.amount, true).slice(0, 5);
    if (!list.length) return "";
    return `<ul class="list tight">` + list.map(t => {
      const c = Store.catOf(t.catId);
      return `<li><span class="ico-box">${c.emoji}</span>
        <span class="li-main"><span class="li-t">¥${U.money(t.amount)}</span>
        <span class="li-s">${U.esc(U.niceDate(t.date))} · ${U.esc(t.note || c.name)}</span></span>
        <span class="li-a">${U.pct(t.amount / (Engine.monthStat(mk).consume || 1) * 100, 1)}</span>
        <span class="li-side"><button class="mini-x" data-act="editTxn" data-id="${t.id}" type="button" title="改">✎</button></span></li>`;
    }).join("") + `</ul>`;
  }

  function render(state) {
    const mk = state.trendMonth || Engine.CUR();
    const st = Engine.monthStat(mk);
    const s = Engine.safeToSpend(mk);
    const bd = Engine.breakdown(mk);
    const ts = Engine.tagSplit(mk);
    const uncat = Store.txns({ month: mk }).filter(t => !t.catId).length;

    return `<div class="view">
      <div class="sec-hd"><div><div class="sec-title">走势</div>
        <div class="sec-sub">图表只能告诉你钱去了哪，「计划」页才告诉你接下来怎么花。</div></div></div>

      <div class="grid two">
        <div class="card">${monthBar(mk)}<div class="mt14">${overviewHtml(s, st)}</div></div>
        <div class="card"><div class="card-hd"><div class="card-title"><span class="ti">📈</span>这个月钱是逐日花掉的</div></div>
          ${curveHtml(mk, st, s)}</div>
      </div>

      <div class="card mt14"><div class="card-hd"><div class="card-title"><span class="ti">📊</span>近半年收支</div></div>
        ${barsHtml()}</div>

      <div class="grid two mt14">
        <div class="card"><div class="card-hd"><div class="card-title"><span class="ti">🍩</span>钱去哪了</div>
          ${uncat ? `<button class="link-btn" data-act="goUncat" type="button">${uncat} 笔待分类 ›</button>` : ""}</div>
          ${donutHtml(bd)}</div>
        <div class="card"><div class="card-hd"><div class="card-title"><span class="ti">🧩</span>刚性 / 必要 / 想要</div></div>
          ${tagHtml(ts)}</div>
      </div>

      <div class="card mt14"><div class="card-hd"><div class="card-title"><span class="ti">🏷️</span>分类排行</div>
        <button class="link-btn" data-act="goBooks" type="button">看明细 ›</button></div>
        ${rankHtml(bd)}</div>

      <div class="card mt14"><div class="card-hd"><div class="card-title"><span class="ti">🐘</span>这个月最大的五笔</div></div>
        ${bigOnes(mk)}</div>
    </div>`;
  }

  /* ---------- 行为 ---------- */
  Act.trendMonth = function (state, el) {
    const cur = state.trendMonth || Engine.CUR();
    const next = U.shiftMonth(cur, +el.dataset.d);
    if (next > Engine.CUR()) return;
    state.trendMonth = next;
    App.render();
  };
  Act.goUncat = function (state) {
    state.filterCat = "__none";
    App.go("books");
  };
  Act.filterCat = function (state, el) {
    state.filterCat = el.dataset.cat || "__none";
    App.go("books");
  };

  w.Views = w.Views || {};
  w.Views.trend = { render };
})(window);
