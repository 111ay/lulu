/* =========================================================
   store.js · 唯一数据源
   所有数据只待在 localStorage，本文件不出现任何网络调用。
   ========================================================= */
(function (w) {
  "use strict";

  const KEY = "mmj.db.v1";
  const LIMIT = 60;
  const LOG_LIMIT = 200;

  /* ---------- 默认分类 ----------
     tag: fixed 刚性 / need 必要浮动 / want 想要 / move 资金转移(储蓄·还款) / income 收入 */
  const DEFAULT_CATS = [
    { name: "居住", emoji: "🏠", flow: "out", tag: "fixed", alias: ["房租", "租房", "物业", "水电", "燃气", "房贷"] },
    { name: "通讯", emoji: "📶", flow: "out", tag: "fixed", alias: ["话费", "流量", "宽带"] },
    { name: "订阅", emoji: "🔁", flow: "out", tag: "fixed", alias: ["会员", "订阅", "自动续费"] },
    { name: "餐饮", emoji: "🍜", flow: "out", tag: "need", alias: ["午饭", "晚饭", "早饭", "早餐", "午餐", "晚餐", "外卖", "吃饭", "食堂", "咖啡", "奶茶"] },
    { name: "交通", emoji: "🚇", flow: "out", tag: "need", alias: ["地铁", "公交", "打车", "滴滴", "加油", "停车", "高铁", "机票"] },
    { name: "日用", emoji: "🧻", flow: "out", tag: "need", alias: ["超市", "便利店", "买菜", "洗漱", "纸巾"] },
    { name: "医疗", emoji: "🩺", flow: "out", tag: "need", alias: ["药", "医院", "门诊", "体检", "牙"] },
    { name: "学习", emoji: "📚", flow: "out", tag: "want", alias: ["书", "课程", "网课", "考试", "培训"] },
    { name: "娱乐", emoji: "🎬", flow: "out", tag: "want", alias: ["电影", "游戏", "演出", "门票", "KTV"] },
    { name: "服饰", emoji: "👕", flow: "out", tag: "want", alias: ["衣服", "鞋", "化妆", "护肤", "理发"] },
    { name: "人情", emoji: "🎁", flow: "out", tag: "want", alias: ["礼物", "随礼", "请客", "红包"] },
    { name: "宠物", emoji: "🐾", flow: "out", tag: "need", alias: ["猫", "狗", "猫粮"] },
    { name: "储蓄", emoji: "🐷", flow: "out", tag: "move", alias: ["存钱", "定存", "转入"] },
    { name: "还款", emoji: "💳", flow: "out", tag: "move", alias: ["还信用卡", "信用卡", "花呗", "借呗", "分期", "还款"] },
    { name: "其他", emoji: "❔", flow: "out", tag: "need", alias: ["其它"] },
    { name: "工资", emoji: "💼", flow: "in", tag: "income", alias: ["薪水", "月薪", "发薪", "薪资"] },
    { name: "兼职", emoji: "🧩", flow: "in", tag: "income", alias: ["外快", "接单", "私活"] },
    { name: "报销", emoji: "🧾", flow: "in", tag: "income", alias: ["退款", "返现", "退钱"] },
    { name: "利滚利", emoji: "📈", flow: "in", tag: "income", alias: ["利息", "分红", "收益"] },
    { name: "其他收入", emoji: "🎉", flow: "in", tag: "income", alias: ["中奖", "礼金"] }
  ];

  const TAG_META = {
    fixed: { label: "刚性", desc: "每月几乎不动的开销", color: "var(--cool)" },
    need: { label: "必要", desc: "要活着但金额会浮动", color: "var(--primary)" },
    want: { label: "想要", desc: "可以商量的一笔", color: "var(--warm)" },
    move: { label: "转移", desc: "存起来或还掉，不算花掉", color: "var(--text-3)" },
    income: { label: "收入", desc: "进来的钱", color: "var(--pos)" }
  };

  function blankCats() {
    return DEFAULT_CATS.map(c => ({
      id: U.uid("c"), name: c.name, emoji: c.emoji, flow: c.flow, tag: c.tag,
      alias: c.alias.slice(), builtin: true
    }));
  }

  /* ---------- 提醒相关的一次性状态 ----------
     notify.log 只记录「发过什么」，不参与撤销快照：
     提醒日志不该把记账的撤销记录挤出 LIMIT。 */
  function blankNotify() {
    return {
      enabled: false,
      timezone: "",              /* 空 = 跟着设备走，取不到则 Asia/Shanghai */
      dailyAt: "20:30",          /* 每天求值的时刻，按上面的时区 */
      channels: { system: true, inApp: true, email: false, phone: false },
      rules: {},                 /* ruleKey -> true/false，未设 = 用规则默认 */
      /* 手机推送：本地版没有服务端环境变量，这几个字段就是等价位置。
         留空的一律回落到 index.html 里的 window.APP_CONFIG。 */
      push: { userId: "", channel: "", ntfyBase: "", ntfyTopic: "", poToken: "", poUser: "" },
      /* 日常轻提醒：今日支出 ÷ 今日预算 到这些百分比时各推一次。
         thresholds 空 = 跟着配置的 BUDGET_ALERT_THRESHOLDS 走（默认 80,100）。 */
      budgetPush: { enabled: true, thresholds: [] },
      state: { lastDay: null, lastMonth: null, nextAt: 0, banners: [] },
      log: [],
      pending: []                /* 发送失败待重试：{ key, tries, nextAt, ... } */
    };
  }

  function blank() {
    const cats = blankCats();
    const book = { id: U.uid("b"), name: "日常", emoji: "📔", createdAt: U.today() };
    return {
      v: 2,
      createdAt: new Date().toISOString(),
      settings: {
        monthlyIncome: 0,
        emergencyMonths: 6,
        theme: "light",
        name: "",
        onboarded: false,
        lastMonth: U.monthKey(U.today())
      },
      books: [book],
      activeBookId: book.id,
      cats,
      txns: [],
      goals: [],
      recs: [],
      budgets: {},
      notify: blankNotify(),
      lastGen: null
    };
  }

  /* ---------- 读写 ---------- */
  let db = null;
  let memoryOnly = false;
  let saveTimer = null;
  const history = [];
  const listeners = [];

  function persist() {
    if (memoryOnly) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try { localStorage.setItem(KEY, JSON.stringify(db)); }
      catch (e) { memoryOnly = true; }
    }, 60);
  }

  /* 阈值可能来自配置字符串「80,100」、表单输入或旧数据，脏值在这儿一次拦掉。
     空数组是有意义的：表示「没在页面上改过」，由 Notify 回落到配置里的默认值。 */
  function cleanThresholds(raw) {
    const arr = (Array.isArray(raw) ? raw : String(raw == null ? "" : raw).split(/[,，;；\s]+/))
      .map(x => Math.round(+x)).filter(x => x >= 1 && x <= 300);
    return U.dedupe(arr).sort((a, b) => a - b);
  }

  function normalize(d) {
    const b = blank();
    d = d && typeof d === "object" ? d : {};
    const nb = blankNotify();
    const n = d.notify && typeof d.notify === "object" ? d.notify : {};
    const out = {
      v: 2,
      createdAt: d.createdAt || b.createdAt,
      settings: Object.assign({}, b.settings, d.settings || {}),
      books: (Array.isArray(d.books) && d.books.length) ? d.books : b.books,
      activeBookId: d.activeBookId,
      cats: (Array.isArray(d.cats) && d.cats.length) ? d.cats : b.cats,
      txns: Array.isArray(d.txns) ? d.txns : [],
      goals: Array.isArray(d.goals) ? d.goals : [],
      recs: Array.isArray(d.recs) ? d.recs : [],
      budgets: d.budgets && typeof d.budgets === "object" ? d.budgets : {},
      /* v1 的数据没有 notify 这一节，缺什么补什么，不动用户已有的设置 */
      notify: {
        enabled: n.enabled === true,
        timezone: typeof n.timezone === "string" ? n.timezone : nb.timezone,
        dailyAt: /^\d{2}:\d{2}$/.test(n.dailyAt || "") ? n.dailyAt : nb.dailyAt,
        channels: Object.assign(nb.channels, n.channels || {}),
        rules: n.rules && typeof n.rules === "object" ? n.rules : {},
        state: Object.assign(nb.state, n.state || {}),
        log: Array.isArray(n.log) ? n.log.slice(-LOG_LIMIT) : [],
        pending: Array.isArray(n.pending) ? n.pending : [],
        push: Object.assign(nb.push, n.push && typeof n.push === "object" ? n.push : {}),
        budgetPush: {
          enabled: n.budgetPush && n.budgetPush.enabled === false ? false : nb.budgetPush.enabled,
          thresholds: cleanThresholds(n.budgetPush && n.budgetPush.thresholds)
        }
      },
      lastGen: d.lastGen || null
    };
    if (!out.books.some(x => x.id === out.activeBookId)) out.activeBookId = out.books[0].id;
    out.txns = out.txns.filter(t => t && t.id && isFinite(+t.amount)).map(t => ({
      id: t.id, bookId: out.books.some(b2 => b2.id === t.bookId) ? t.bookId : out.activeBookId,
      flow: t.flow === "in" ? "in" : "out",
      amount: U.round2(Math.abs(+t.amount)),
      catId: t.catId || null,
      note: String(t.note || "").slice(0, 120),
      date: /^\d{4}-\d{2}-\d{2}$/.test(t.date) ? t.date : U.today(),
      createdAt: t.createdAt || new Date().toISOString(),
      recId: t.recId || null,
      goalId: t.goalId || null
    }));
    out.cats.forEach(c => { if (!Array.isArray(c.alias)) c.alias = []; });
    return out;
  }

  function load() {
    let raw = null;
    try { raw = localStorage.getItem(KEY); } catch (e) { memoryOnly = true; }
    db = raw ? normalize(JSON.parse(raw || "null")) : blank();
    if (db.settings.theme === "dark") w.document.documentElement.setAttribute("data-theme", "dark");
    return db;
  }

  /* ---------- 变更通知 + 快照 ---------- */
  function emit() { listeners.forEach(f => { try { f(); } catch (e) { console.error(e); } }); }
  function commit(silent) { persist(); if (!silent) emit(); }
  function snapshot() { history.push(JSON.stringify(db)); if (history.length > LIMIT) history.shift(); }
  function canUndo() { return history.length > 0; }
  function undo() {
    if (!history.length) return false;
    db = JSON.parse(history.pop());
    commit();
    return true;
  }
  function mutate(fn) { snapshot(); const r = fn(db); commit(); return r; }

  /* ---------- 查询 ---------- */
  function catById(id) { return db.cats.find(c => c.id === id) || null; }
  function catOf(id) { return catById(id) || { id: null, name: "待分类", emoji: "❔", flow: "out", tag: "need" }; }
  function catsOf(flow) { return db.cats.filter(c => c.flow === flow); }
  function bookById(id) { return db.books.find(b => b.id === (id || db.activeBookId)) || db.books[0]; }

  function txns(q) {
    q = q || {};
    let a = db.txns;
    if (q.allBooks !== true) {
      const bk = q.bookId || db.activeBookId;
      a = a.filter(t => t.bookId === bk);
    } else if (q.bookId) a = a.filter(t => t.bookId === q.bookId);
    if (q.flow) a = a.filter(t => t.flow === q.flow);
    if (q.catId) a = a.filter(t => t.catId === q.catId);
    if (q.month) a = a.filter(t => U.monthKey(t.date) === q.month);
    if (q.from) a = a.filter(t => t.date >= q.from);
    if (q.to) a = a.filter(t => t.date <= q.to);
    if (q.q) {
      const s = q.q.toLowerCase();
      a = a.filter(t => (t.note || "").toLowerCase().indexOf(s) >= 0 ||
        (catOf(t.catId).name || "").toLowerCase().indexOf(s) >= 0 ||
        String(t.amount).indexOf(s) >= 0);
    }
    return a;
  }

  /* ---------- 写入 ---------- */
  function addTxn(t) {
    const rec = {
      id: U.uid("t"),
      bookId: t.bookId || db.activeBookId,
      flow: t.flow === "in" ? "in" : "out",
      amount: U.round2(Math.abs(+t.amount || 0)),
      catId: t.catId || null,
      note: String(t.note || "").slice(0, 120),
      date: t.date || U.today(),
      createdAt: new Date().toISOString(),
      recId: t.recId || null
    };
    if (!(rec.amount > 0)) return null;
    return mutate(() => { db.txns.push(rec); return rec; });
  }
  function addMany(list) {
    const recs = list.map(t => ({
      id: U.uid("t"), bookId: t.bookId || db.activeBookId, flow: t.flow === "in" ? "in" : "out",
      amount: U.round2(Math.abs(+t.amount || 0)), catId: t.catId || null,
      note: String(t.note || "").slice(0, 120), date: t.date || U.today(),
      createdAt: new Date().toISOString(), recId: t.recId || null
    })).filter(t => t.amount > 0);
    if (!recs.length) return [];
    mutate(() => { recs.forEach(r => db.txns.push(r)); });
    return recs;
  }
  function updateTxn(id, patch) {
    mutate(() => {
      const t = db.txns.find(x => x.id === id);
      if (t) {
        Object.assign(t, patch);
        if (patch.amount != null) t.amount = U.round2(Math.abs(+patch.amount));
      }
    });
  }
  function removeTxn(id) { mutate(() => { db.txns = db.txns.filter(t => t.id !== id); }); }
  function restoreTxns(list) { mutate(() => { list.forEach(t => { if (!db.txns.some(x => x.id === t.id)) db.txns.push(t); }); }); }

  function setSetting(k, v) { snapshot(); db.settings[k] = v; commit(); }
  function setTheme(t) {
    db.settings.theme = t;
    w.document.documentElement.setAttribute("data-theme", t === "dark" ? "dark" : "light");
    commit();
  }
  function setBudget(catId, amt) {
    snapshot();
    amt = U.round2(+amt || 0);
    if (amt > 0) db.budgets[catId] = amt; else delete db.budgets[catId];
    commit();
  }

  function addBook(name, emoji) {
    const b = { id: U.uid("b"), name: name || "新账本", emoji: emoji || "📗", createdAt: U.today() };
    mutate(() => { db.books.push(b); db.activeBookId = b.id; });
    return b;
  }
  function renameBook(id, name, emoji) { mutate(() => { const b = bookById(id); if (b) { b.name = name; if (emoji) b.emoji = emoji; } }); }
  function removeBook(id) {
    mutate(() => {
      db.txns = db.txns.filter(t => t.bookId !== id);
      db.recs = db.recs.filter(r => r.bookId !== id);
      db.books = db.books.filter(b => b.id !== id);
      if (!db.books.length) db.books.push({ id: U.uid("b"), name: "日常", emoji: "📔", createdAt: U.today() });
      if (!db.books.some(b => b.id === db.activeBookId)) db.activeBookId = db.books[0].id;
    });
  }
  function useBook(id) { if (db.books.some(b => b.id === id)) { db.activeBookId = id; commit(); } }

  function addCat(c) {
    const cat = { id: U.uid("c"), name: c.name, emoji: c.emoji || "🏷️", flow: c.flow || "out", tag: c.tag || "need", alias: c.alias || [], builtin: false };
    mutate(() => { db.cats.push(cat); });
    return cat;
  }
  function updateCat(id, patch) { mutate(() => { const c = catById(id); if (c) Object.assign(c, patch); }); }
  function removeCat(id) {
    mutate(() => {
      db.cats = db.cats.filter(c => c.id !== id);
      db.txns.forEach(t => { if (t.catId === id) t.catId = null; });
      delete db.budgets[id];
    });
  }

  function addGoal(g) {
    const goal = {
      id: U.uid("g"), name: g.name || "存钱目标", target: U.round2(+g.target || 0),
      saved: U.round2(+g.saved || 0), deadline: g.deadline || U.addDays(U.today(), 365),
      createdAt: U.today(), note: g.note || "", linkCatId: g.linkCatId || null
    };
    mutate(() => { db.goals.push(goal); });
    return goal;
  }
  function updateGoal(id, patch) { mutate(() => { const g = db.goals.find(x => x.id === id); if (g) Object.assign(g, patch); }); }
  function removeGoal(id) { mutate(() => { db.goals = db.goals.filter(g => g.id !== id); }); }
  function contributeGoal(id, amt, date) {
    const g = db.goals.find(x => x.id === id);
    if (!g) return;
    amt = U.round2(Math.abs(+amt || 0));
    if (!(amt > 0)) return;
    const saveCat = db.cats.find(c => c.name === "储蓄" && c.flow === "out");
    mutate(() => {
      g.saved = U.round2(g.saved + amt);
      db.txns.push({
        id: U.uid("t"), bookId: db.activeBookId, flow: "out", amount: amt, catId: saveCat ? saveCat.id : null,
        note: "存入 · " + g.name, date: date || U.today(), createdAt: new Date().toISOString(), recId: null, goalId: g.id
      });
    });
  }

  function addRec(r) {
    const rec = {
      id: U.uid("r"), bookId: r.bookId || db.activeBookId, name: r.name || "周期账单",
      catId: r.catId || null, flow: r.flow || "out", amount: U.round2(+r.amount || 0),
      day: U.clamp(+r.day || 1, 1, 28), active: r.active !== false, from: r.from || U.monthKey(U.today())
    };
    mutate(() => { db.recs.push(rec); });
    return rec;
  }
  function updateRec(id, patch) { mutate(() => { const r = db.recs.find(x => x.id === id); if (r) Object.assign(r, patch); }); }
  function removeRec(id) { mutate(() => { db.recs = db.recs.filter(r => r.id !== id); }); }

  /* ---------- 周期账单自动入账 ---------- */
  function generateRecurring() {
    const today = U.today();
    const curM = U.monthKey(today);
    const start = db.settings.firstMonth || curM;
    let months = [];
    let k = start > curM ? curM : start;
    let guard = 0;
    while (k <= curM && guard++ < 30) { months.push(k); k = U.shiftMonth(k, 1); }
    const add = [];
    const already = (r, m) => db.txns.some(t => {
      if (U.monthKey(t.date) !== m || t.flow !== r.flow) return false;
      if (t.recId === r.id) return true;
      /* 这一期你自己已经手动记过了，别再补一遍 */
      return t.catId === r.catId && Math.abs(t.amount - r.amount) <= Math.max(1, r.amount * 0.02);
    });
    db.recs.filter(r => r.active).forEach(r => {
      months.forEach(m => {
        if (m < r.from) return;
        const date = m + "-" + U.PAD(Math.min(r.day, U.daysInMonth(m)));
        if (date > today) return;
        if (!already(r, m)) add.push({ bookId: r.bookId, flow: r.flow, amount: r.amount, catId: r.catId, note: r.name, date, recId: r.id });
      });
    });
    if (add.length) {
      db.settings.firstMonth = curM;
      addMany(add);
    }
    db.settings.firstMonth = curM;
    return add.length;
  }

  /* ---------- 提醒：状态、去重键、发送日志 ----------
     这里的写入一律不快照：提醒日志把记账的撤销记录挤出 LIMIT 是没道理的。 */
  function patchNotify(fn) {
    if (typeof fn === "function") fn(db.notify);
    persist();
    return db.notify;
  }
  function setNotify(patch) { return patchNotify(n => { Object.assign(n, patch); }); }
  function setNotifyChannel(id, on) { return patchNotify(n => { n.channels[id] = !!on; }); }
  function setNotifyRule(key, on) { return patchNotify(n => { n.rules[key] = !!on; }); }
  /* 只有发成功过才算「这个周期已经提醒过了」 */
  function notifySent(key) { return !!key && db.notify.log.some(x => x.key === key && x.ok); }
  /* 跳过也要留痕，但同一条原因一天只留一次，不然日志会被它刷满 */
  function notifyLogged(key) { return !!key && db.notify.log.some(x => x.key === key); }
  function setNotifyPush(patch) { return patchNotify(n => { Object.assign(n.push, patch); }); }
  function setBudgetPush(patch) {
    return patchNotify(n => {
      Object.assign(n.budgetPush, patch);
      if (patch.thresholds !== undefined) n.budgetPush.thresholds = cleanThresholds(patch.thresholds);
      if (patch.enabled !== undefined) n.budgetPush.enabled = !!patch.enabled;
    });
  }
  function logNotify(entry) {
    return patchNotify(n => {
      n.log.push(Object.assign({ at: new Date().toISOString() }, entry));
      if (n.log.length > LOG_LIMIT) n.log = n.log.slice(-LOG_LIMIT);
    });
  }
  function setNotifyPending(list) { return patchNotify(n => { n.pending = list; }); }
  function setNotifyState(patch) { return patchNotify(n => { Object.assign(n.state, patch); }); }
  function clearNotifyLog() { return patchNotify(n => { n.log = []; n.pending = []; }); }

  /* ---------- 导入导出 ---------- */
  function exportJSON() {
    return JSON.stringify({ app: "慢慢记", version: 1, exportedAt: new Date().toISOString(), data: db }, null, 2);
  }
  function parseImport(text) {
    const obj = JSON.parse(text);
    const d = obj && obj.data ? obj.data : obj;
    if (!d || !Array.isArray(d.txns)) throw new Error("这个文件看起来不是慢慢记的备份");
    return normalize(d);
  }
  function importJSON(text, mode) {
    const next = parseImport(text);
    snapshot();
    if (mode === "merge") {
      const have = new Set(db.txns.map(t => t.id));
      next.txns.forEach(t => { if (!have.has(t.id)) db.txns.push(t); });
      const haveG = new Set(db.goals.map(g => g.id));
      next.goals.forEach(g => { if (!haveG.has(g.id)) db.goals.push(g); });
    } else {
      db = next;
      if (db.settings.theme === "dark") w.document.documentElement.setAttribute("data-theme", "dark");
      else w.document.documentElement.setAttribute("data-theme", "light");
    }
    commit();
    return db.txns.length;
  }
  function download(name, text, mime) {
    const blob = new Blob([String.fromCharCode(0xFEFF) + text], { type: (mime || "text/plain") + ";charset=utf-8" });

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 300);
  }
  function exportCSV(rows, name) {
    const esc = v => {
      const s = String(v == null ? "" : v);
      return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const body = rows.map(r => r.map(esc).join(",")).join("\r\n");
    download(name || ("慢慢记_" + U.today() + ".csv"), body, "text/csv");
  }
  function txnRows(q) {
    const head = ["日期", "账本", "分类", "性质", "方向", "金额", "备注"];
    const body = U.sortBy(txns(q), t => t.date, true).map(t => {
      const c = catOf(t.catId);
      const meta = TAG_META[c.tag] || TAG_META.need;
      return [t.date, bookById(t.bookId).name, c.name, meta.label,
      c.tag === "move" ? "转移" : (t.flow === "in" ? "收入" : "支出"),
      U.money(t.amount, { dec: 2 }), t.note || ""];
    });
    return [head].concat(body);
  }

  /* ---------- 示例数据 ---------- */
  function loadDemo() {
    snapshot();
    const fresh = blank();
    fresh.settings = db.settings;
    fresh.notify = db.notify;      /* 示例数据不该顺手把你的提醒开关和日志清掉 */
    fresh.settings.onboarded = true;
    fresh.settings.monthlyIncome = 12000;
    const cats = fresh.cats;
    const byName = n => cats.find(c => c.name === n);
    fresh.activeBookId = fresh.books[0].id;
    const bk = fresh.activeBookId;
    const cid = n => { const c = byName(n); return c ? c.id : null; };
    const today = U.today();
    const months = [U.shiftMonth(U.monthKey(today), -2), U.shiftMonth(U.monthKey(today), -1), U.monthKey(today)];

    fresh.recs = [
      { id: U.uid("r"), bookId: bk, name: "房租", catId: cid("居住"), flow: "out", amount: 3200, day: 5, active: true, from: months[0] },
      { id: U.uid("r"), bookId: bk, name: "话费", catId: cid("通讯"), flow: "out", amount: 59, day: 12, active: true, from: months[0] },
      { id: U.uid("r"), bookId: bk, name: "各类会员", catId: cid("订阅"), flow: "out", amount: 68, day: 1, active: true, from: months[0] }
    ];
    fresh.budgets[cid("餐饮")] = 1500;
    fresh.budgets[cid("交通")] = 300;
    fresh.budgets[cid("娱乐")] = 400;

    const plan = [
      ["餐饮", 28, 46], ["餐饮", 15, 32], ["交通", 5, 12], ["日用", 20, 90],
      ["娱乐", 35, 180], ["服饰", 60, 320], ["人情", 50, 400], ["学习", 30, 150], ["医疗", 40, 260]
    ];
    months.forEach((m, mi) => {
      const dim = U.daysInMonth(m);
      const last = mi === months.length - 1 ? Math.min(dim, +today.slice(8)) : dim;
      fresh.txns.push({
        id: U.uid("t"), bookId: bk, flow: "in", amount: 12000, catId: cid("工资"),
        note: "工资", date: m + "-10" > m + "-" + U.PAD(last) ? m + "-" + U.PAD(last) : m + "-10", createdAt: new Date().toISOString(), recId: null
      });
      fresh.txns.push({
        id: U.uid("t"), bookId: bk, flow: "out", amount: mi === 2 ? 2000 : 1500, catId: cid("储蓄"),
        note: "自动转入", date: m + "-11", createdAt: new Date().toISOString(), recId: null
      });
      let seed = mi * 7 + 3;
      const rnd = mod => { seed = (seed * 9301 + 49297) % 233280; return Math.floor((seed / 233280) * mod); };
      for (let d = 1; d <= last; d++) {
        const n = 1 + rnd(3);
        for (let i = 0; i < n; i++) {
          const p = plan[rnd(plan.length)];
          const amt = U.round2(p[1] + (p[2] - p[1]) * (rnd(100) / 100));
          if (rnd(100) > 62) continue;
          fresh.txns.push({
            id: U.uid("t"), bookId: bk, flow: "out", amount: amt, catId: cid(p[0]),
            note: "", date: m + "-" + U.PAD(d), createdAt: new Date().toISOString(), recId: null
          });
        }
      }
    });
    fresh.goals = [
      { id: U.uid("g"), name: "换台新电脑", target: 12000, saved: 3600, deadline: U.addDays(today, 150), createdAt: U.today(), note: "", linkCatId: null },
      { id: U.uid("g"), name: "过年回家 + 一趟旅行", target: 20000, saved: 5200, deadline: U.addDays(today, 260), createdAt: U.today(), note: "", linkCatId: null }
    ];
    fresh.settings.firstMonth = months[0];
    db = fresh;
    generateRecurringInto(db);
    commit();
  }
  function generateRecurringInto(d) {
    const today = U.today();
    const curM = U.monthKey(today);
    let k = d.settings.firstMonth || curM;
    let guard = 0;
    while (k <= curM && guard++ < 30) {
      d.recs.filter(r => r.active).forEach(r => {
        if (k < r.from) return;
        const date = k + "-" + U.PAD(Math.min(r.day, U.daysInMonth(k)));
        if (date > today) return;
        if (d.txns.some(t => t.recId === r.id && U.monthKey(t.date) === k)) return;
        d.txns.push({ id: U.uid("t"), bookId: r.bookId, flow: r.flow, amount: r.amount, catId: r.catId, note: r.name, date, createdAt: new Date().toISOString(), recId: r.id });
      });
      k = U.shiftMonth(k, 1);
    }
  }
  function wipe() { snapshot(); db = blank(); w.document.documentElement.setAttribute("data-theme", "light"); commit(); }

  /* ---------- 启动 ---------- */
  load();
  db.recs = db.recs || [];
  db.goals = db.goals || [];
  db.notify = Object.assign(blankNotify(), db.notify || {});
  if (!db.settings.firstMonth) db.settings.firstMonth = U.monthKey(U.today());
  generateRecurring();
  db.settings.lastMonth = U.monthKey(U.today());
  persist();

  w.Store = {
    KEY, TAG_META, DEFAULT_CATS, LOG_LIMIT,
    get data() { return db; },
    get s() { return db.settings; },
    get notify() { return db.notify; },
    get memoryOnly() { return memoryOnly; },
    load, commit, persist, mutate, snapshot, undo, canUndo, emit,
    on(f) { listeners.push(f); return () => { const i = listeners.indexOf(f); if (i >= 0) listeners.splice(i, 1); }; },
    catById, catOf, catsOf, bookById, txns,
    addTxn, addMany, updateTxn, removeTxn, restoreTxns,
    setSetting, setTheme, setBudget,
    addBook, renameBook, removeBook, useBook,
    addCat, updateCat, removeCat,
    addGoal, updateGoal, removeGoal, contributeGoal,
    addRec, updateRec, removeRec, generateRecurring,
    setNotify, setNotifyChannel, setNotifyRule, setNotifyState, setNotifyPending,
    setNotifyPush, setBudgetPush, notifySent, notifyLogged, logNotify, clearNotifyLog,
    exportJSON, parseImport, importJSON, download, exportCSV, txnRows,
    loadDemo, wipe
  };
})(window);
