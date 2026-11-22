/* =========================================================
   util.js · 日期 / 金额 / DOM 基础工具（无依赖）
   ========================================================= */
(function (w) {
  "use strict";

  const PAD = n => (n < 10 ? "0" + n : "" + n);

  /* ---------- 日期：一律用本地日期的 YYYY-MM-DD 字符串 ---------- */
  function ymd(d) {
    return d.getFullYear() + "-" + PAD(d.getMonth() + 1) + "-" + PAD(d.getDate());
  }
  function today() { return ymd(new Date()); }
  function fromYmd(s) {
    const p = String(s || "").split("-");
    return new Date(+p[0], +p[1] - 1, +p[2] || 1);
  }
  function addDays(s, n) {
    const d = fromYmd(typeof s === "string" ? s : ymd(s));
    d.setDate(d.getDate() + n);
    return ymd(d);
  }
  function diffDays(a, b) {
    const x = fromYmd(a), y = fromYmd(b);
    return Math.round((y - x) / 86400000);
  }
  function monthKey(s) { return String(s).slice(0, 7); }           /* 2026-11 */
  function monthStart(k) { return k + "-01"; }
  function daysInMonth(k) {
    const p = k.split("-");
    return new Date(+p[0], +p[1], 0).getDate();
  }
  function lastDayOfMonth(k) { return k + "-" + PAD(daysInMonth(k)); }
  function shiftMonth(k, n) {
    const p = k.split("-");
    const d = new Date(+p[0], +p[1] - 1 + n, 1);
    return d.getFullYear() + "-" + PAD(d.getMonth() + 1);
  }
  function monthLabel(k) {
    const p = k.split("-");
    return +p[0] + "年" + (+p[1]) + "月";
  }
  function monthShort(k) {
    const p = k.split("-");
    return (+p[0] === new Date().getFullYear() ? "" : p[0].slice(2) + "/") + (+p[1]) + "月";
  }
  function lastNDays(n) {
    /* 返回截至今天的 n 个 YYYY-MM-DD */
    const out = [];
    for (let i = n - 1; i >= 0; i--) out.push(addDays(today(), -i));
    return out;
  }

  const WD = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
  function weekday(s) { return WD[fromYmd(s).getDay()]; }

  function niceDate(s) {
    if (s === today()) return "今天";
    if (s === addDays(today(), -1)) return "昨天";
    if (s === addDays(today(), 1)) return "明天";
    const d = fromYmd(s);
    const sameYear = d.getFullYear() === new Date().getFullYear();
    return (sameYear ? "" : d.getFullYear() + "年") + (d.getMonth() + 1) + "月" + d.getDate() + "日";
  }
  function dateFull(s) {
    const d = fromYmd(s);
    return (d.getMonth() + 1) + "月" + d.getDate() + "日 " + WD[d.getDay()];
  }

  /* ---------- 金额 ---------- */
  function round2(n) { return Math.round((+n + Number.EPSILON) * 100) / 100; }
  function sum(arr, f) {
    let t = 0;
    for (let i = 0; i < arr.length; i++) t += f ? (+f(arr[i]) || 0) : (+arr[i] || 0);
    return round2(t);
  }
  function money(n, opt) {
    opt = opt || {};
    const v = round2(n || 0);
    const abs = Math.abs(v);
    const dec = opt.dec != null ? opt.dec : (Number.isInteger(v) ? 0 : 2);
    let s = abs.toFixed(dec).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return (v < 0 ? "-" : opt.sign && v > 0 ? "+" : "") + s;
  }
  function yuan(n, opt) { return "¥" + money(n, opt); }
  function pct(n, dec) { return (round2(n) || 0).toFixed(dec == null ? 0 : dec) + "%"; }
  function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }
  function signed(n) { return (n > 0 ? "+" : "") + money(n); }

  /* 把 "3.5k" "1.2万" 这类也认掉 */
  function toAmount(x) {
    if (typeof x === "number") return round2(x);
    let s = String(x == null ? "" : x).replace(/[,\s¥￥元块]/g, "");
    let m = s.match(/^(-?\d+(?:\.\d+)?)(k|w|万|千)?$/i);
    if (!m) return NaN;
    let v = parseFloat(m[1]);
    const u = (m[2] || "").toLowerCase();
    if (u === "k" || u === "千") v *= 1000;
    if (u === "w" || u === "万") v *= 10000;
    return round2(v);
  }

  /* ---------- DOM ---------- */
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.prototype.slice.call((root || document).querySelectorAll(sel));

  function frag(html) {
    const t = document.createElement("template");
    t.innerHTML = html.trim();
    return t.content;
  }

  /* ---------- 杂项 ---------- */
  let seq = 0;
  function uid(p) {
    seq++;
    return (p || "id") + "_" + Date.now().toString(36) + seq.toString(36) + Math.random().toString(36).slice(2, 6);
  }
  function groupBy(arr, f) {
    const m = new Map();
    arr.forEach(x => {
      const k = f(x);
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(x);
    });
    return m;
  }
  function sortBy(arr, f, desc) {
    return arr.slice().sort((a, b) => {
      const x = f(a), y = f(b);
      if (x === y) return 0;
      return (x > y ? 1 : -1) * (desc ? -1 : 1);
    });
  }
  function dedupe(arr) { return Array.from(new Set(arr)); }
  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
  function hash(s) {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return Math.abs(h);
  }

  w.U = {
    PAD, ymd, today, fromYmd, addDays, diffDays, monthKey, monthStart, daysInMonth, lastDayOfMonth,
    shiftMonth, monthLabel, monthShort, lastNDays, weekday, niceDate, dateFull,
    round2, sum, money, yuan, pct, clamp, signed, toAmount,
    esc, $, $$, frag, uid, groupBy, sortBy, dedupe, sleep, hash
  };
})(window);
