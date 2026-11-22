/* =========================================================
   charts.js · 手写 SVG 图表（零依赖，file:// 直接可用）
   ========================================================= */
(function (w) {
  "use strict";

  const PALETTE = ["#3FA48A", "#DB9455", "#6F93B8", "#C87F8B", "#8FB573", "#B79AD1",
    "#E0B45C", "#5FA8A0", "#CE8FA5", "#94A3B8", "#C0A06A", "#7FB3D5"];

  function colorFor(i) { return PALETTE[i % PALETTE.length]; }

  function catColor(catId) {
    const cats = Store.data.cats;
    const i = cats.findIndex(c => c.id === catId);
    return colorFor(i < 0 ? 11 : i);
  }

  const fmtY = v => {
    if (Math.abs(v) >= 10000) return (v / 10000).toFixed(Math.abs(v) >= 100000 ? 0 : 1) + "万";
    if (Math.abs(v) >= 1000) return Math.round(v / 1000) + "k";
    return String(Math.round(v));
  };

  function svgWrap(wv, hv, inner, extra) {
    return '<svg viewBox="0 0 ' + wv + " " + hv + '" preserveAspectRatio="xMidYMid meet" role="img" ' +
      (extra || "") + ' xmlns="http://www.w3.org/2000/svg">' + inner + "</svg>";
  }

  /* ---------- 环形图 ---------- */
  function donut(items, opt) {
    opt = opt || {};
    const size = opt.size || 190;
    const th = opt.thickness || 22;
    const r = (size - th) / 2 - 2;
    const c = size / 2;
    const C = 2 * Math.PI * r;
    const total = U.sum(items, i => i.value);
    let off = 0;
    let seg = "";
    if (total <= 0) {
      seg = '<circle cx="' + c + '" cy="' + c + '" r="' + r + '" fill="none" stroke="var(--surface-3)" stroke-width="' + th + '"/>';
    } else {
      items.filter(i => i.value > 0).forEach((it, k) => {
        const len = it.value / total * C;
        seg += '<circle cx="' + c + '" cy="' + c + '" r="' + r + '" fill="none" ' +
          'stroke="' + (it.color || colorFor(k)) + '" stroke-width="' + th + '" ' +
          'stroke-dasharray="' + Math.max(0.5, len - 1.6).toFixed(2) + " " + (C - len + 1.6).toFixed(2) + '" ' +
          'stroke-dashoffset="' + (-off).toFixed(2) + '" transform="rotate(-90 ' + c + " " + c + ')"></circle>';
        off += len;
      });
    }
    let mid = "";
    if (opt.centerTop) {
      mid += '<text x="' + c + '" y="' + (c - 4) + '" text-anchor="middle" font-size="' + (opt.centerSize || 25) +
        '" font-weight="700" fill="var(--text)" style="letter-spacing:-.5px">' + U.esc(opt.centerTop) + "</text>";
    }
    if (opt.centerSub) {
      mid += '<text x="' + c + '" y="' + (c + 16) + '" text-anchor="middle" font-size="11.5" fill="var(--text-3)">' + U.esc(opt.centerSub) + "</text>";
    }
    return svgWrap(size, size, seg + mid);
  }

  /* ---------- 收支柱状 ---------- */
  function groupedBars(rows, opt) {
    opt = opt || {};
    const W = 640, H = opt.height || 230;
    const pad = { t: 16, r: 10, b: 30, l: 10 };
    const iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
    if (!rows.length) return '<div class="empty"><span class="em">📊</span><p>还没有可对比的月份</p></div>';
    const max = Math.max(1, ...rows.map(r => Math.max(r.income || 0, r.expense || 0)));
    const step = iw / rows.length;
    const bw = Math.min(20, step * 0.28);
    let g = "";

    for (let i = 0; i <= 2; i++) {
      const y = pad.t + ih * (i / 2);
      const v = max * (1 - i / 2);
      g += '<line x1="' + pad.l + '" y1="' + y.toFixed(1) + '" x2="' + (W - pad.r) + '" y2="' + y.toFixed(1) +
        '" stroke="var(--line)" stroke-width="1" ' + (i === 2 ? "" : 'stroke-dasharray="3 4"') + "/>";
      g += '<text x="' + (pad.l + 2) + '" y="' + (y - 5).toFixed(1) + '" font-size="10" fill="var(--text-3)">' + fmtY(v) + "</text>";
    }

    rows.forEach((r, i) => {
      const cx = pad.l + step * i + step / 2;
      const pairs = [["income", r.income, "var(--primary)"], ["expense", r.expense, "var(--warm)"]];
      pairs.forEach((p, k) => {
        const v = Math.max(0, +p[1] || 0);
        const h = ih * (v / max);
        const x = cx + (k === 0 ? -bw - 2 : 2);
        const y = pad.t + ih - h;
        g += '<rect x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' +
          Math.max(h, v > 0 ? 2 : 0).toFixed(1) + '" rx="4" fill="' + p[2] + '" opacity="' + (r.dim ? .45 : .92) + '"><title>' +
          U.esc(r.label + " " + (p[0] === "income" ? "收入" : "支出") + " ¥" + U.money(v)) + "</title></rect>";
      });
      g += '<text x="' + cx + '" y="' + (H - 10) + '" text-anchor="middle" font-size="11" fill="var(--text-2)">' + U.esc(r.label) + "</text>";
    });
    return svgWrap(W, H, g);
  }

  /* ---------- 累计曲线（含「本该花到哪」参考线） ---------- */
  function cumulative(curve, opt) {
    opt = opt || {};
    const W = 640, H = opt.height || 200;
    const pad = { t: 14, r: 12, b: 24, l: 12 };
    const iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
    const n = curve.length;
    if (n < 2) return '<div class="empty"><span class="em">〰️</span><p>再多记几天，这条线就有意义了</p></div>';
    const total = opt.total || Math.max(1, ...curve);
    const max = Math.max(total, ...curve) * 1.06;
    const X = i => pad.l + iw * (i / (n - 1));
    const Y = v => pad.t + ih - ih * (v / max);

    let d = "", area = "";
    curve.forEach((v, i) => { d += (i ? "L" : "M") + X(i).toFixed(1) + " " + Y(v).toFixed(1) + " "; });
    area = d + "L" + X(n - 1).toFixed(1) + " " + Y(0).toFixed(1) + " L" + X(0).toFixed(1) + " " + Y(0).toFixed(1) + " Z";

    let g = '<defs><linearGradient id="cg" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0%" stop-color="var(--primary)" stop-opacity=".22"/>' +
      '<stop offset="100%" stop-color="var(--primary)" stop-opacity="0"/></linearGradient></defs>';
    g += '<line x1="' + pad.l + '" y1="' + Y(total).toFixed(1) + '" x2="' + (W - pad.r) + '" y2="' + Y(total).toFixed(1) +
      '" stroke="var(--warm)" stroke-width="1.4" stroke-dasharray="5 5"/>';
    g += '<path d="' + area + '" fill="url(#cg)"/>';
    g += '<path d="' + d + '" fill="none" stroke="var(--primary)" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/>';
    g += '<circle cx="' + X(n - 1).toFixed(1) + '" cy="' + Y(curve[n - 1]).toFixed(1) + '" r="4" fill="var(--primary)" stroke="var(--surface)" stroke-width="2"/>';
    if (opt.labels) {
      [0, Math.floor((n - 1) / 2), n - 1].forEach(i => {
        g += '<text x="' + X(i).toFixed(1) + '" y="' + (H - 7) + '" text-anchor="' + (i === 0 ? "start" : i === n - 1 ? "end" : "middle") +
          '" font-size="10.5" fill="var(--text-3)">' + U.esc(opt.labels[i]) + "</text>";
      });
    }
    return svgWrap(W, H, g);
  }

  /* ---------- 迷你走势（列表右侧用） ---------- */
  function spark(values, opt) {
    opt = opt || {};
    const W = opt.width || 90, H = opt.height || 26;
    const n = values.length;
    if (n < 2) return "";
    const max = Math.max(...values, 1), min = Math.min(...values, 0);
    const rng = max - min || 1;
    let d = "";
    values.forEach((v, i) => {
      d += (i ? "L" : "M") + (W * i / (n - 1)).toFixed(1) + " " + (H - 2 - (H - 4) * ((v - min) / rng)).toFixed(1) + " ";
    });
    return '<svg viewBox="0 0 ' + W + " " + H + '" width="' + W + '" height="' + H + '" xmlns="http://www.w3.org/2000/svg">' +
      '<path d="' + d + '" fill="none" stroke="' + (opt.color || "var(--primary)") + '" stroke-width="1.8" stroke-linecap="round"/></svg>';
  }

  w.Charts = { PALETTE, colorFor, catColor, donut, groupedBars, cumulative, spark, fmtY };
})(window);
