/* =========================================================
   view-books.js · 明细：多账本、筛选、周期账单、分类管理
   这些在别家要付费的能力，这里默认全开。
   ========================================================= */
(function (w) {
  "use strict";
  const Act = (w.Act = w.Act || {});

  const PAGE = 260;

  function booksBar(state) {
    return `<div class="chips">` + Store.data.books.map(b => {
      const n = Store.txns({ bookId: b.id }).length;
      return `<button class="chip${b.id === Store.data.activeBookId ? " on" : ""}" data-act="useBook" data-id="${b.id}" type="button">
        <span>${b.emoji}</span>${U.esc(b.name)}<span class="c-amt">${n}</span></button>`;
    }).join("") + `<button class="chip" data-act="addBook" type="button"><span>＋</span>新账本</button></div>`;
  }

  function filtersBar(state) {
    const f = state.f || {};
    const opts = [{ v: "", l: "全部分类" }].concat(Store.data.cats.map(c => ({ v: c.id, l: c.emoji + " " + c.name })));
    opts.push({ v: "__none", l: "❔ 待分类" });
    return `<div class="stack g10">
      <input class="input" type="search" placeholder="搜备注、分类或金额，比如 打车 / 35"
        value="${U.esc(f.q || "")}" data-act-input="setQ">
      <div class="row wrap gap6">
        <select class="select sm" data-act-change="setFilterCat" style="flex:1 1 130px">
          ${opts.map(o => `<option value="${U.esc(o.v)}"${o.v === (f.cat || "") ? " selected" : ""}>${U.esc(o.l)}</option>`).join("")}
        </select>
        ${[["", "不限方向"], ["out", "只看支出"], ["in", "只看收入"], ["move", "只看储蓄/还款"]].map(p =>
          `<button class="chip mini${(f.flow || "") === p[0] ? " on" : ""}" data-act="setFlow" data-v="${p[0]}" type="button">${p[1]}</button>`).join("")}
        ${(f.q || f.cat || f.flow) ? `<button class="link-btn" data-act="clearFilter" type="button">清除</button>` : ""}
      </div>
    </div>`;
  }

  function rows(list, state) {
    const per = PAGE * (state.page || 1);
    const shown = list.slice(0, per);
    const byMonth = U.groupBy(shown, t => U.monthKey(t.date));
    const months = Array.from(byMonth.keys()).sort().reverse();
    let html = "";
    months.forEach(m => {
      const ms = list.filter(t => U.monthKey(t.date) === m);
      const inc = U.sum(ms.filter(t => t.flow === "in"), t => t.amount);
      const exp = U.sum(ms.filter(t => t.flow === "out" && Store.catOf(t.catId).tag !== "move"), t => t.amount);
      html += `<div class="monthsep"><span>${U.esc(U.monthLabel(m))}</span>
        <span class="micro">收 ${U.money(inc)} · 支 ${U.money(exp)} · ${ms.length} 笔</span></div>`;
      const groups = U.groupBy(byMonth.get(m), t => t.date);
      Array.from(groups.keys()).sort().reverse().forEach(d => {
        html += `<ul class="list tight">` + groups.get(d).map(t => {
          const c = Store.catOf(t.catId);
          return `<li>
            <span class="ico-box">${c.emoji}</span>
            <span class="li-main">
              <span class="li-t">${U.esc(t.note || c.name)}</span>
              <span class="li-s">${U.niceDate(t.date)} · ${U.esc(c.name)}${c.tag === "move" ? " · 转移" : ""}${t.recId ? " · 自动" : ""}</span>
            </span>
            <span class="li-a${t.flow === "in" ? " in" : ""}">${t.flow === "in" ? "+" : "−"}¥${U.money(t.amount)}</span>
            <span class="li-side">
              <button class="mini-x" data-act="copyTxn" data-id="${t.id}" type="button" title="再记一笔">↻</button>
              <button class="mini-x" data-act="editTxn" data-id="${t.id}" type="button" title="改">✎</button>
              <button class="mini-x" data-act="delTxn" data-id="${t.id}" type="button" title="删">×</button>
            </span></li>`;
        }).join("") + `</ul>`;
      });
    });
    const left = list.length - per;
    if (left > 0) {
      html += `<div class="center mt14"><button class="btn sm" data-act="moreRows" type="button">再显示 ${Math.min(PAGE, left)} 笔（共 ${list.length}）</button></div>`;
    }
    return html;
  }

  function recsHtml() {
    const rs = Store.data.recs;
    if (!rs.length) {
      return `<div class="empty"><span class="em">🔁</span><p>没有周期账单。<br>房租、话费、会员这类每月都来的，设一次以后就不用管了。</p></div>`;
    }
    return `<ul class="list">` + rs.map(r => {
      const c = Store.catOf(r.catId);
      const date = U.monthKey(U.today()) + "-" + U.PAD(r.day);
      return `<li>
        <span class="ico-box">${c.emoji}</span>
        <span class="li-main"><span class="li-t">${U.esc(r.name)} ${r.active ? "" : `<span class="pill">已停用</span>`}</span>
        <span class="li-s">每月 ${r.day} 号 · ${U.esc(c.name)} · 下次 ${date > U.today() ? U.niceDate(date) : "打开时自动补"}</span></span>
        <span class="li-a">${r.flow === "in" ? "+" : "−"}¥${U.money(r.amount)}</span>
        <span class="li-side">
          <button class="mini-x" data-act="toggleRec" data-id="${r.id}" type="button" title="${r.active ? "停用" : "启用"}">${r.active ? "⏸" : "▶"}</button>
          <button class="mini-x" data-act="editRec" data-id="${r.id}" type="button" title="改">✎</button>
          <button class="mini-x" data-act="delRec" data-id="${r.id}" type="button" title="删">×</button>
        </span></li>`;
    }).join("") + `</ul>`;
  }

  function catsHtml() {
    const st = Engine.monthStat(Engine.CUR());
    return `<div class="chips wrapx">` + Store.data.cats.map(c => {
      const amt = U.round2(st.byCat[c.id] || 0);
      const b = +Store.data.budgets[c.id] || 0;
      return `<button class="chip" data-act="editCat" data-id="${c.id}" type="button" title="性质：${Store.TAG_META[c.tag].label}${b ? " · 预算 ¥" + U.money(b) : ""}">
        <span>${c.emoji}</span>${U.esc(c.name)}
        <span class="c-amt">${amt ? "¥" + Charts.fmtY(amt) : Store.TAG_META[c.tag].label}</span></button>`;
    }).join("") + `<button class="chip" data-act="addCat" type="button"><span>＋</span>新分类</button></div>`;
  }

  function render(state) {
    const f = state.f || {};
    let list;
    if (f.cat === "__none") {
      list = Store.txns({ q: f.q, flow: f.flow === "in" ? "in" : f.flow === "out" ? "out" : null })
        .filter(t => !t.catId);
    } else {
      list = Store.txns({ q: f.q, catId: f.cat || null, flow: f.flow === "move" ? "out" : (f.flow || null) });
      if (f.flow === "move") list = list.filter(t => Store.catOf(t.catId).tag === "move");
    }
    list = U.sortBy(list, t => t.date + (t.createdAt || ""), true);
    const inc = U.sum(list.filter(t => t.flow === "in"), t => t.amount);
    const exp = U.sum(list.filter(t => t.flow === "out"), t => t.amount);

    return `<div class="view">
      <div class="sec-hd"><div><div class="sec-title">明细</div>
        <div class="sec-sub">多账本、导出、全部筛选 —— 这里没有一项要付费。</div></div>
        <button class="btn sm primary" data-act="addManual" type="button">＋ 记一笔</button></div>

      <div class="card">${booksBar(state)}</div>

      <div class="card mt14">
        <div class="card-hd"><div class="card-title"><span class="ti">🔎</span>筛选</div>
          <span class="card-note">${list.length} 笔 · 进 ${U.yuan(inc)} · 出 ${U.yuan(exp)}</span></div>
        ${filtersBar(state)}
      </div>

      <div class="card mt14">
        ${list.length ? rows(list, state)
        : `<div class="empty"><span class="em">🗂️</span><p>${Store.data.txns.length ? "这个筛选下没有记录。" : "还没有任何流水。<br>回「今天」页写一句「午饭25」试试。"}</p></div>`}
      </div>

      <div class="grid two mt14">
        <div class="card">
          <div class="card-hd"><div class="card-title"><span class="ti">🔁</span>周期账单</div>
            <button class="link-btn" data-act="addRec" type="button">＋ 添加</button></div>
          ${recsHtml()}
        </div>
        <div class="card">
          <div class="card-hd"><div class="card-title"><span class="ti">🏷️</span>分类</div>
            <span class="card-note">点一下就能改名、换性质</span></div>
          ${catsHtml()}
          <p class="micro mt10">「刚性 / 必要 / 想要」这个标签决定了「今天可以花多少」怎么算 —— 分错了，那条推导就歪了。</p>
        </div>
      </div>
    </div>`;
  }

  /* ---------- 行为 ---------- */
  Act.useBook = function (state, el) { Store.useBook(el.dataset.id); };
  Act.addBook = function (state) {
    UI.form({
      title: "新账本", ok: "建好", values: { emoji: "📗", name: "" },
      fields: [
        { name: "name", label: "叫什么", type: "text", placeholder: "旅行 / 和家庭一起的" },
        { name: "emoji", label: "图标", type: "text", placeholder: "✈️" },
        { type: "note", name: "_n", ico: "📚", text: "账本之间互相独立：各自的流水、各自的周期账单，各自的「今天可以花多少」。" }
      ],
      validate: x => (x.name ? null : "起个名字")
    }).then(v => { if (v) Store.addBook(v.name, v.emoji); });
  };
  Act.setFilterCat = function (state, el) {
    state.f = state.f || {};
    state.f.cat = el.value;
    App.render();
  };
  Act.setFlow = function (state, el) {
    state.f = state.f || {};
    state.f.flow = el.dataset.v;
    App.render();
  };
  Act.clearFilter = function (state) { state.f = {}; App.render(); };
  Act.moreRows = function (state) { state.page = (state.page || 1) + 1; App.render(); };
  Act.copyTxn = function (state, el) {
    const t = Store.data.txns.find(x => x.id === el.dataset.id);
    if (!t) return;
    UI.txnForm(null, { flow: t.flow, amount: t.amount, catId: t.catId, note: t.note, date: U.today() });
  };
  Act.addRec = function () { UI.recForm(null); };
  Act.editRec = function (state, el) {
    const r = Store.data.recs.find(x => x.id === el.dataset.id);
    if (r) UI.recForm(r);
  };
  Act.toggleRec = function (state, el) {
    const r = Store.data.recs.find(x => x.id === el.dataset.id);
    if (r) Store.updateRec(r.id, { active: !r.active });
  };
  Act.delRec = async function (state, el) {
    const r = Store.data.recs.find(x => x.id === el.dataset.id);
    if (!r) return;
    const ok = await UI.confirm({ title: "删除周期账单", text: `「${U.esc(r.name)}」以后不会再自动记，已经记进账本的流水保留。`, ok: "删除", danger: true });
    if (ok) Store.removeRec(r.id);
  };
  Act.addCat = function () { UI.catForm(null); };

  w.Views = w.Views || {};
  w.Views.books = { render };
})(window);
