/* =========================================================
   engine.js · 行动方案引擎
   这一层只干一件事：把你已经记下的数字，翻译成
   「今天可以花多少」「这个月要存多少」「照这个节奏会怎样」。
   不推荐任何产品，不外链，不带货 —— 只算你自己的数。
   ========================================================= */
(function (w) {
  "use strict";

  const CUR = () => U.monthKey(U.today());

  function monthsBack(n, end) {
    const e = end || CUR();
    const out = [];
    for (let i = n - 1; i >= 0; i--) out.push(U.shiftMonth(e, -i));
    return out;
  }

  /* ---------- 单月统计（带缓存，Store 变更后自动失效） ---------- */
  let _statCache = null;
  function monthStat(mk, bookId) {
    const key = mk + "|" + (bookId || Store.data.activeBookId);
    _statCache = _statCache || new Map();
    if (_statCache.has(key)) return _statCache.get(key);
    if (_statCache.size > 120) _statCache.clear();
    const s = _computeStat(mk, bookId);
    _statCache.set(key, s);
    return s;
  }
  function invalidate() { _statCache = null; }

  function _computeStat(mk, bookId) {
    const list = Store.txns({ month: mk, bookId });
    const s = {
      mk, income: 0, expense: 0, consume: 0, moved: 0,
      byCat: {}, byTag: { fixed: 0, need: 0, want: 0, move: 0 },
      days: {}, dayConsume: {}
    , count: list.length };
    list.forEach(t => {
      const c = Store.catOf(t.catId);
      if (t.flow === "in") { s.income = U.round2(s.income + t.amount); return; }
      s.expense = U.round2(s.expense + t.amount);
      s.byCat[t.catId || "_"] = U.round2((s.byCat[t.catId || "_"] || 0) + t.amount);
      const tag = c.tag === "move" ? "move" : (c.tag === "fixed" ? "fixed" : (c.tag === "want" ? "want" : "need"));
      s.byTag[tag] = U.round2((s.byTag[tag] || 0) + t.amount);
      if (tag === "move") s.moved = U.round2(s.moved + t.amount);
      else {
        s.consume = U.round2(s.consume + t.amount);
        s.dayConsume[t.date] = U.round2((s.dayConsume[t.date] || 0) + t.amount);
      }
      s.days[t.date] = (s.days[t.date] || 0) + 1;
    });
    s.net = U.round2(s.income - s.expense);
    s.rate = s.income > 0 ? U.clamp((s.net / s.income) * 100, -999, 100) : 0;
    return s;
  }

  function avgOf(mks, pick) {
    const vals = mks.map(pick).filter(v => v > 0);
    if (!vals.length) return 0;
    return U.round2(vals.reduce((a, b) => a + b, 0) / vals.length);
  }

  /* 某个分类「预计要花多少」：预算 > 周期账单 > 近三个月均值 */
  function expect(catId, mk) {
    const b = +Store.data.budgets[catId] || 0;
    const rec = U.sum(Store.data.recs.filter(r => r.active && r.catId === catId && r.flow === "out"), r => r.amount);
    const hist = avgOf(monthsBack(3, U.shiftMonth(mk, -1)), m => monthStat(m).byCat[catId] || 0);
    return U.round2(Math.max(b, rec, hist));
  }

  /* ---------- 储蓄目标：每月要存多少 ---------- */
  function goalPerMonth(g) {
    const left = U.round2((+g.target || 0) - (+g.saved || 0));
    if (left <= 0) return { left: 0, perMonth: 0, months: 0, done: true, late: false };
    const d = U.diffDays(U.today(), g.deadline);
    const months = Math.max(1, Math.round(d / 30.44));
    return {
      left, months, perMonth: U.round2(left / months),
      done: false, late: d < 0,
      dueDate: g.deadline
    };
  }
  function goalPlan() {
    const rows = Store.data.goals.map(g => Object.assign({}, g, goalPerMonth(g)));
    const need = U.round2(U.sum(rows.filter(r => !r.done), r => r.perMonth));
    const done = rows.filter(r => r.done);
    const late = rows.filter(r => r.late);
    return { rows, need, done, late, count: rows.length };
  }

  /* ---------- 核心：今天还可以花多少 ---------- */
  function safeToSpend(mk, bookId) {
    mk = mk || CUR();
    const cur = mk === CUR();
    const future = mk > CUR();
    const dim = U.daysInMonth(mk);
    const dayNow = +U.today().slice(8);
    const daysPassed = cur ? dayNow : (future ? 0 : dim);
    const daysLeft = cur ? (dim - dayNow + 1) : (future ? dim : 0);

    const stat = monthStat(mk, bookId);
    const cats = Store.data.cats;
    const incCats = cats.filter(c => c.flow === "in");

    let incPlan = +Store.s.monthlyIncome || 0;
    if (!(incPlan > 0)) {
      incPlan = Math.max(stat.income, avgOf(monthsBack(3, U.shiftMonth(mk, -1)), m => monthStat(m).income));
    }
    /* 全局那个「月收入」只属于真正记进账的账本，别让它跑到旅行账本上充数 */
    const bid = bookId || Store.data.activeBookId;
    const incInMk = Store.txns({ allBooks: true, flow: "in", month: mk });
    const incomeElsewhere = stat.income <= 0 && incInMk.length > 0;
    const incomeBookId = incomeElsewhere ? incInMk[0].bookId : bid;
    const income = U.round2(incomeElsewhere ? 0 : Math.max(incPlan, stat.income));

    const fixedRows = cats.filter(c => c.flow === "out" && c.tag === "fixed").map(c => {
      const exp = expect(c.id, mk);
      const spent = U.round2(stat.byCat[c.id] || 0);
      return { cat: c, exp, spent, left: U.round2(Math.max(0, exp - spent)) };
    }).filter(r => r.exp > 0 || r.spent > 0);
    const fixedExp = U.round2(U.sum(fixedRows, r => r.exp));
    const fixedLeft = U.round2(U.sum(fixedRows, r => r.left));

    const gp = goalPlan();
    const moved = stat.moved;                                     // 已转入储蓄 / 已还掉的
    const consume = stat.consume;                                 // 已花掉的消费（含刚性已付部分）
    const goalLeft = U.round2(Math.max(0, gp.need - moved));

    const noBudgets = Object.keys(Store.data.budgets).filter(k => +Store.data.budgets[k] > 0).length === 0;
    const bookName = Store.bookById(incomeBookId).name;

    if (incomeElsewhere) {
      return {
        mk, cur, future, dim, daysPassed, daysLeft, stat,
        income: 0, incPlan: 0, incomeElsewhere: true, incomeBookId, incomeBookName: bookName,
        fixedRows: [], fixedExp: 0, fixedLeft: 0,
        goalNeed: 0, savedAlready: moved, goalLeft: 0,
        consume, moved, available: 0, daily: null, idealDaily: null,
        noIncome: false, noBudgets, overspent: false
      };
    }

    const available = U.round2(income - consume - moved - fixedLeft - goalLeft);
    const idealDaily = daysLeft > 0 ? U.round2((income - fixedLeft - goalLeft) / daysLeft) : null;
    const daily = daysLeft > 0 ? U.round2(available / daysLeft) : null;

    return {
      mk, cur, future, dim, daysPassed, daysLeft,
      stat, income, incPlan: U.round2(incPlan),
      incomeElsewhere: false, incomeBookId: bid, incomeBookName: Store.bookById(bid).name,
      fixedRows, fixedExp, fixedLeft,
      goalNeed: gp.need, savedAlready: moved, goalLeft,
      consume, moved, available, daily, idealDaily,
      noIncome: income <= 0,
      noBudgets,
      overspent: available < 0
    };
  }

  /* ---------- 应急金 ---------- */
  /* 存下来的钱是跨账本的：工资账本存的，旅行账本不该当它不存在 */
  function moveSum(mk) {
    const q = { allBooks: true, flow: "out" };
    if (mk) q.month = mk;
    return U.round2(U.sum(Store.txns(q).filter(t => Store.catOf(t.catId).tag === "move"), t => t.amount));
  }
  function emergency() {
    const months = U.clamp(+Store.s.emergencyMonths || 6, 1, 24);
    const hist = monthsBack(4, U.shiftMonth(CUR(), -1)).filter(m => m >= (Store.s.firstMonth || m));
    const stats = hist.map(m => monthStat(m));
    const withData = stats.filter(s => s.consume > 0);
    const essentialMonthly = withData.length
      ? U.round2(U.sum(withData, s => s.byTag.fixed + s.byTag.need) / withData.length)
      : U.round2(U.sum(Store.data.cats.filter(c => c.flow === "out" && (c.tag === "fixed" || c.tag === "need")), c => expect(c.id, CUR())));
    const target = U.round2(essentialMonthly * months);
    const current = U.round2((+Store.s.emergencyStart || 0) + moveSum());
    const perMonth = avgOf(monthsBack(3), m => moveSum(m));
    const gap = U.round2(Math.max(0, target - current));
    return {
      months, essentialMonthly, target, current, gap, perMonth,
      share: target > 0 ? U.clamp(current / target * 100, 0, 100) : 0,
      monthsToGo: gap > 0 && perMonth > 0 ? Math.ceil(gap / perMonth) : null
    };
  }

  /* ---------- 照这个节奏会怎样 ---------- */
  function forecast() {
    const ms = monthsBack(4, U.shiftMonth(CUR(), -1)).map(m => monthStat(m)).filter(s => s.income > 0 || s.expense > 0);
    const thisM = monthStat(CUR());
    if (thisM.income > 0 || thisM.expense > 0) ms.push(thisM);
    const recent = ms.slice(-3);
    const netAvg = recent.length ? U.round2(U.sum(recent, s => s.net) / recent.length) : 0;
    const rateAvg = recent.length ? U.round2(U.sum(recent, s => s.rate) / recent.length) : 0;
    const consumeAvg = recent.length ? U.round2(U.sum(recent, s => s.consume) / recent.length) : 0;
    return {
      months: recent.length, netAvg, rateAvg, consumeAvg,
      half: U.round2(netAvg * 6),
      nextMonth: netAvg,
      healthy: netAvg > 0 && rateAvg >= 10
    };
  }

  /* ---------- 坚持这件事（不惩罚版） ---------- */
  function habit() {
    const all = Store.txns({ allBooks: true });
    const dates = U.dedupe(all.map(t => t.date)).sort();
    const curM = CUR();
    const monthDates = U.dedupe(all.filter(t => U.monthKey(t.date) === curM).map(t => t.date));
    const last = dates.length ? dates[dates.length - 1] : null;
    const sinceLast = last ? U.diffDays(last, U.today()) : null;

    /* 连续天数（只用于展示「已经连着记了 N 天」，断了不清零也不提示失败） */
    let streak = 0;
    if (last) {
      let d = last;
      if (sinceLast > 1) streak = 1;
      else { while (dates.indexOf(d) >= 0) { streak++; d = U.addDays(d, -1); } }
    }
    const dim = U.daysInMonth(curM);
    const counts = {};
    all.forEach(t => { counts[t.date] = (counts[t.date] || 0) + 1; });
    const heat = U.lastNDays(Math.min(126, dim + 28)).map(d => ({ date: d, n: counts[d] || 0 }));
    return {
      totalDays: dates.length, totalTxns: all.length,
      monthDays: monthDates.length, monthDim: dim,
      last, sinceLast, streak, heat,
      firstDate: dates[0] || null
    };
  }

  /* ---------- 分类拆解 ---------- */
  function breakdown(mk, bookId) {
    mk = mk || CUR();
    const stat = monthStat(mk, bookId);
    const rows = Object.keys(stat.byCat).map(k => {
      const c = k === "_" ? { id: null, name: "待分类", emoji: "❔", tag: "need", flow: "out" } : Store.catOf(k);
      const amt = stat.byCat[k];
      return {
        cat: c, amount: amt,
        share: stat.consume > 0 ? amt / stat.consume * 100 : 0,
        budget: +Store.data.budgets[k] || 0,
        avg: avgOf(monthsBack(3, U.shiftMonth(mk, -1)), m => monthStat(m).byCat[k] || 0)
      };
    });
    rows.sort((a, b) => b.amount - a.amount);
    const total = stat.consume || 1;
    rows.forEach(r => { r.share = r.amount / total * 100; });
    return { mk, stat, rows, total: stat.consume };
  }

  function tagSplit(mk, bookId) {
    const stat = monthStat(mk, bookId);
    const t = stat.byTag;
    const base = (t.fixed + t.need + t.want) || 1;
    return {
      rows: [
        { key: "fixed", label: "刚性", desc: "房租、话费、会员这类不动的", amount: t.fixed, share: t.fixed / base * 100 },
        { key: "need", label: "必要", desc: "要活着，但金额能谈", amount: t.need, share: t.need / base * 100 },
        { key: "want", label: "想要", desc: "这一栏才是真正能调的", amount: t.want, share: t.want / base * 100 }
      ],
      moved: t.move, total: base
    };
  }

  /* ---------- 超支 → 翻译成每天的动作 ---------- */
  function overspendImpact() {
    const s = safeToSpend(CUR());
    if (!(s.daysLeft > 0)) return [];
    const out = [];
    breakdown(CUR()).rows.forEach(r => {
      if (!r.budget || r.amount <= r.budget) return;
      const over = U.round2(r.amount - r.budget);
      out.push({
        cat: r.cat, over,
        before: s.daily, after: U.round2(Math.max(-9999, s.daily - over / s.daysLeft)),
        daysLeft: s.daysLeft
      });
    });
    return out;
  }

  /* ---------- 未来 N 天要扣的周期账单 ---------- */
  /* 提醒用的聚合口：视图和 notify 都不自己翻 db.recs */
  function recUpcoming(daysAhead, today) {
    daysAhead = daysAhead || 3;
    today = today || U.today();
    const until = U.addDays(today, daysAhead);
    const out = [];
    Store.data.recs.filter(r => r.active && r.flow === "out").forEach(r => {
      for (let m = U.monthKey(today); m <= U.monthKey(until); m = U.shiftMonth(m, 1)) {
        if (m < r.from) continue;
        const date = m + "-" + U.PAD(Math.min(r.day, U.daysInMonth(m)));
        if (date <= today || date > until) continue;
        out.push({ rec: r, date, inDays: U.diffDays(today, date) });
      }
    });
    return U.sortBy(out, x => x.date);
  }

  /* ---------- 一键复记的候选 ---------- */
  function quickChips(limit) {
    const since = U.addDays(U.today(), -75);
    const list = Store.txns({ from: since }).filter(t => t.flow === "out" && Store.catOf(t.catId).tag !== "move");
    const g = {};
    list.forEach(t => {
      const k = t.catId || "_";
      (g[k] = g[k] || { catId: t.catId, amounts: [], last: "", note: "" });
      g[k].amounts.push(t.amount);
      if (t.date >= g[k].last) { g[k].last = t.date; g[k].note = t.note || g[k].note; }
    });
    const rows = Object.keys(g).map(k => {
      const it = g[k];
      const a = it.amounts.slice().sort((x, y) => x - y);
      const median = a[Math.floor(a.length / 2)];
      const mean = U.round2(U.sum(a) / a.length);
      return {
        cat: Store.catOf(it.catId), count: it.amounts.length,
        amount: U.round2(median * 0.98 >= mean * 0.6 ? median : mean), mean, last: it.last
      };
    }).filter(r => r.count >= 2 || r.cat.tag !== "need").sort((a, b) => b.count - a.count).slice(0, limit || 8);
    return rows.map(r => ({
      catId: r.cat.id, name: r.cat.name, emoji: r.cat.emoji,
      amount: r.amount, count: r.count, last: r.last, recId: null
    }));
  }

  /* ---------- 几条基于算术的观察 ---------- */
  function insights(mk) {
    mk = mk || CUR();
    const s = monthStat(mk);
    const prev = monthStat(U.shiftMonth(mk, -1));
    const bd = breakdown(mk);
    const out = [];
    if (s.income > 0) {
      out.push({
        kind: s.net >= 0 ? "good" : "warn",
        text: s.net >= 0
          ? "本月到目前为止留下 " + U.yuan(s.net) + "，结余率 " + U.pct(s.rate) + "。"
          : "本月支出已超过本月收入 " + U.yuan(-s.net) + "，先看看「计划」页里每天还能花多少。"
      });
    }
    if (bd.rows[0] && bd.rows[0].amount > 0) {
      const r = bd.rows[0];
      out.push({ kind: "info", text: "钱花得最多的是「" + r.cat.name + "」" + U.yuan(r.amount) + "，占本月消费的 " + U.pct(r.share) + "。" });
      if (r.avg > 0 && r.amount > r.avg * 1.35) {
        out.push({ kind: "warn", text: "「" + r.cat.name + "」比过去三个月的平均 " + U.yuan(r.avg) + " 高出 " + U.yuan(U.round2(r.amount - r.avg)) + "。" });
      }
    }
    if (prev.consume > 0 && s.mk === CUR()) {
      const delta = U.round2(s.consume - prev.consume * (s.days ? (U.diffDays(U.monthStart(mk), U.today()) + 1) / U.daysInMonth(U.shiftMonth(mk, -1)) : 1));
      if (Math.abs(delta) > 200) {
        out.push({
          kind: delta < 0 ? "good" : "info",
          text: delta < 0 ? "按同样的日历进度，你比上月同期少花了 " + U.yuan(Math.abs(delta)) + "。"
            : "按同样的日历进度，你比上月同期多花了 " + U.yuan(delta) + "。"
        });
      }
    }
    const ov = overspendImpact();
    if (ov.length) {
      const t = ov.reduce((a, b) => a + b.over, 0);
      out.push({ kind: "warn", text: "有 " + ov.length + " 个分类超出预算共 " + U.yuan(U.round2(t)) + "，这会让本月剩余每天可花降到 " + U.yuan(ov[0] ? Math.max(0, safeToSpend(mk).daily) : 0) + "。" });
    }
    const f = forecast();
    if (f.months >= 2) {
      out.push({
        kind: f.netAvg > 0 ? "good" : "warn",
        text: f.netAvg > 0
          ? "最近 " + f.months + " 个月平均每月留下 " + U.yuan(f.netAvg) + "，照这个节奏半年后大约多 " + U.yuan(f.half) + "。"
          : "最近 " + f.months + " 个月平均每月是 " + U.yuan(f.netAvg) + "，先别谈存钱，把每天额度定下来更实际。"
      });
    }
    return out.slice(0, 5);
  }

  Store.on(invalidate);

  w.Engine = {
    CUR, monthsBack, monthStat, invalidate, avgOf, expect, goalPerMonth, goalPlan,
    safeToSpend, emergency, forecast, habit, breakdown, tagSplit,
    overspendImpact, recUpcoming, quickChips, insights
  };
})(window);
