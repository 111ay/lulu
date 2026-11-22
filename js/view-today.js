/* =========================================================
   view-today.js · 今天：一个数字 + 一个输入框
   解决「坚持门槛高」：录入 3 秒、点一下就记、断了不惩罚。
   ========================================================= */
(function (w) {
  "use strict";
  const Act = (w.Act = w.Act || {});

  function heatHtml(rows) {
    const today = U.today();
    return `<div class="heat">` + rows.map(r => {
      const lvl = r.n === 0 ? "" : r.n >= 6 ? "l4" : r.n >= 4 ? "l3" : r.n >= 2 ? "l2" : "l1";
      return `<i class="${lvl}${r.date === today ? " today" : ""}" title="${r.date} · ${r.n ? r.n + " 笔" : "没记"}"></i>`;
    }).join("") + `</div>`;
  }

  function heroHtml(s) {
    if (s.incomeElsewhere) {
      return `<div class="hero">
        <div class="hero-label">这个账本没记进账</div>
        <div class="hero-num" style="font-size:23px;letter-spacing:0">每天额度只在记工资的账本里算</div>
        <p class="hero-sub">月收入、预算、目标都是全局的数，它们跟着「${U.esc(s.incomeBookName)}」走。
          硬套到这个账本上，只会给你一个对不上现实的额度。这个账本本月已经花掉 ${U.yuan(s.consume)}，要控它，给它自己记一笔收入或设个上限更管用。</p>
        <div class="row mt14" style="gap:8px">
          <button class="btn sm primary" data-act="goIncomeBook" data-id="${U.esc(s.incomeBookId)}" type="button">去「${U.esc(s.incomeBookName)}」看额度</button>
        </div>
      </div>`;
    }
    if (s.noIncome) {
      return `<div class="hero">
        <div class="hero-label">还差一个数</div>
        <div class="hero-num" style="font-size:25px;letter-spacing:0">你每月到手大概多少？</div>
        <p class="hero-sub">有了这个数，我才能告诉你「今天还能花多少」。填个大概就行，随时能改；不填就按你记进来的收入算。</p>
        <div class="row mt14" style="gap:8px;max-width:290px">
          <div class="input-money grow"><input class="input" type="text" inputmode="decimal" id="incQuick" placeholder="12000"></div>
          <button class="btn primary" data-act="saveIncomeQuick" type="button">就这样</button>
        </div>
      </div>`;
    }
    const over = s.available < 0;
    const used = s.income > 0 ? U.clamp((s.stat.consume + s.stat.moved) / s.income * 100, 0, 100) : 0;
    const foot = [
      ["已花掉", U.yuan(s.consume)],
      ["已存下 / 还掉", U.yuan(s.moved)],
      ["刚性还没付", U.yuan(s.fixedLeft)],
      ["目标还差", U.yuan(s.goalLeft)]
    ];
    return `<div class="hero">
      <div class="hero-label">${over ? "今天先停一停" : "今天还可以花"}</div>
      <div class="hero-num"><small>¥</small>${over ? "0" : U.money(s.daily)}</div>
      <p class="hero-sub">${over
        ? `按现在记下来的账，这个月剩下的钱已经提前花掉了 ${U.yuan(-s.available)}。多半是收入还没记进来 —— 补上一笔，这个数马上就正回来。`
        : `本月还剩 <b>${s.daysLeft}</b> 天。按这个数花到月底，刚好把该留的留下。`}</p>
      <div class="bar mt10" style="height:6px"><i class="${over ? "rose" : ""}" style="width:${used.toFixed(1)}%"></i></div>
      <div class="hero-foot">${foot.map(f => `<span>${f[0]} <b>${f[1]}</b></span>`).join("")}</div>
      ${s.noBudgets ? `<p class="micro mt10">还没给任何分类设预算，这个数偏乐观：房租之类的刚性支出只能按你已记进来的算。去「计划」页设三个上限就会准很多。</p>` : ""}
    </div>`;
  }

  function draftsHtml(list, opt) {
    opt = opt || {};
    return list.map((d, i) => {
      if (!(d.amount > 0)) {
        const inner = `${U.esc(d.catEmoji)} ${U.esc(d.catName)} · ${U.esc(U.niceDate(d.date))}`;
        return opt.editable
          ? `<span class="pv is-unsure" data-act="fillAmount" data-i="${i}">${inner} <b style="text-decoration:underline">补个金额</b></span>`
          : `<span class="pv is-unsure">${inner} <b>缺金额，会被跳过</b></span>`;
      }
      return `<span class="pv${d.flow === "in" ? " is-in" : ""}${d.sure ? "" : " is-unsure"}">
        ${U.esc(d.catEmoji)} ${U.esc(d.catName)}
        <span class="amt">${d.flow === "in" ? "+" : "−"}¥${U.money(d.amount)}</span>
        ${U.esc(U.niceDate(d.date))}${d.note ? ` · ${U.esc(d.note)}` : ""}
      </span>`;
    }).join("");
  }

  function previewHtml(state) {
    const txt = (state.entryText || "").trim();
    if (!txt) return `<span class="pv-hint">不用选分类、不用点日期，写完按回车就行。</span>`;
    return draftsHtml(Parse.multi(txt, Store.data.cats), { editable: true });
  }

  function entryHtml(state) {
    return `<div class="entry">
      <div class="entry-input">
        <input id="quickInput" autocomplete="off" enterkeyhint="done"
          placeholder="${U.esc(state.entryPh || "午饭25 · 打车38 昨天 · +8000 工资")}"
          value="${U.esc(state.entryText || "")}">
        <button class="entry-go" data-act="submitEntry" title="记下" type="button">↵</button>
      </div>
      <div class="preview" id="entryPreview">${previewHtml(state)}</div>
    </div>`;
  }

  function chipsHtml() {
    const chips = Engine.quickChips(8);
    let html = chips.map(c => `<button class="chip" data-act="quickAdd" data-cat="${c.catId}" data-amt="${c.amount}" type="button">
        <span>${c.emoji}</span>${U.esc(c.name)}<span class="c-amt">¥${U.money(c.amount)}</span>
        <span class="c-amt" data-act="quickEdit" data-cat="${c.catId}" data-amt="${c.amount}" title="改个数再记">✎</span>
      </button>`).join("");
    html += `<button class="chip" data-act="addIncome" type="button"><span>💰</span>记一笔收入</button>`;
    if (!chips.length) html += `<button class="chip" data-act="addManual" type="button"><span>✍️</span>手动记一笔</button>`;
    return `<div class="chips">${html}</div>`;
  }

  function listHtml(items, opt) {
    opt = opt || {};
    if (!items.length) {
      return `<div class="empty"><span class="em">${opt.ico || "🪶"}</span><p>${opt.text || "这里空着。<br>空着不是问题，现在记一笔就满了。"}</p></div>`;
    }
    const groups = U.groupBy(items, t => t.date);
    return Array.from(groups.keys()).sort().reverse().map(d => {
      const arr = groups.get(d);
      const out = U.sum(arr.filter(t => t.flow === "out" && Store.catOf(t.catId).tag !== "move"), t => t.amount);
      const inc = U.sum(arr.filter(t => t.flow === "in"), t => t.amount);
      return `<div class="daygroup">
        <div class="daygroup-hd">
          <span class="d">${U.esc(U.niceDate(d))} · ${U.weekday(d)}</span>
          <span class="t">${inc > 0 ? "+" + U.money(inc) + " " : ""}${out > 0 ? "−" + U.money(out) : ""}</span>
        </div>
        <ul class="list tight">` + arr.map(t => {
          const c = Store.catOf(t.catId);
          return `<li>
            <span class="ico-box">${c.emoji}</span>
            <span class="li-main">
              <span class="li-t">${U.esc(t.note || c.name)}</span>
              <span class="li-s">${U.esc(c.name)}${c.tag === "move" ? " · 转移" : ""}${t.recId ? " · 自动补的" : ""}</span>
            </span>
            <span class="li-a${t.flow === "in" ? " in" : ""}">${t.flow === "in" ? "+" : "−"}¥${U.money(t.amount)}</span>
            <span class="li-side">
              <button class="mini-x" data-act="editTxn" data-id="${t.id}" type="button" title="改">✎</button>
              <button class="mini-x" data-act="delTxn" data-id="${t.id}" type="button" title="删">×</button>
            </span>
          </li>`;
        }).join("") + `</ul></div>`;
    }).join("");
  }

  function habitLine(h) {
    if (!h.totalDays) return "还没有记录。现在记第一笔，就算开始了。";
    if (h.sinceLast === 0) return "今天已经记过了。中间断了也没关系 —— 这里不清零、不打分、不提醒你落后。";
    if (h.sinceLast === 1) return "昨天记过，今天补一笔就行，晚点记上也一样算。";
    return `上次记录是 ${h.sinceLast} 天前。隔几天很正常，接着记就好，不用从头开始。`;
  }

  function forecastMini() {
    const f = Engine.forecast();
    if (f.months < 1) {
      return `<div class="card flat">
        <div class="card-title"><span class="ti">🔮</span>照这个节奏</div>
        <p class="tiny muted mt10">再记满一个月，这里会告诉你：按现在的开销习惯，半年后你大概能攒下多少。纯算术，不推荐你买任何东西。</p>
      </div>`;
    }
    return `<div class="card flat">
      <div class="card-hd"><div class="card-title"><span class="ti">🔮</span>照这个节奏</div>
        <button class="link-btn" data-act="goPlan" type="button">看推导 ›</button></div>
      <div class="stat-grid">
        <div class="stat"><div class="stat-l">月均结余</div><div class="v ${f.netAvg >= 0 ? "pos" : "neg"}">${f.netAvg >= 0 ? "¥" : "−¥"}${U.money(Math.abs(f.netAvg))}</div></div>
        <div class="stat"><div class="stat-l">月均消费</div><div class="v">¥${U.money(f.consumeAvg)}</div></div>
        <div class="stat"><div class="stat-l">结余率</div><div class="v">${U.pct(f.rateAvg)}</div></div>
      </div>
      <p class="tiny muted mt10">用最近 ${f.months} 个月的平均算的。维持下去，半年后大约多 <b>${U.yuan(f.half)}</b>。</p>
    </div>`;
  }

  function bannerHtml() {
    const list = Store.notify.state.banners || [];
    if (!list.length) return "";
    return `<div class="stack g8 mt14">` + list.slice(-3).reverse().map(b => `<div class="callout soft-b">
      <span class="ci">🔔</span>
      <div><b>${U.esc(b.title)}</b><br>${U.esc(b.body)}</div>
      <button class="mini-x" data-act="dismissBanner" type="button" title="知道了" aria-label="知道了">×</button>
    </div>`).join("") + `</div>`;
  }

  function render(state) {
    const s = Engine.safeToSpend(Engine.CUR());
    const h = Engine.habit();
    const ins = Engine.insights();
    const recent = Store.txns({ from: U.addDays(U.today(), -6) });

    return `<div class="view">
      ${heroHtml(s)}
      ${bannerHtml()}

      ${ins.length ? `<div class="stack g8 mt14">` + ins.slice(0, 3).map(i =>
        `<div class="callout ${i.kind === "good" ? "soft-g" : i.kind === "warn" ? "soft-w" : ""}">
           <span class="ci">${i.kind === "good" ? "✅" : i.kind === "warn" ? "🧮" : "👀"}</span><div>${i.text}</div>
         </div>`).join("") + `</div>` : ""}

      <div class="card mt14">
        <div class="card-hd"><div class="card-title"><span class="ti">⚡</span>点一下就记</div>
          <div class="row gap10"><span class="card-note">用「；」隔开可一次记多笔</span>
            <button class="link-btn" data-act="bulkEntry" type="button">一次补几笔 ›</button></div></div>
        ${chipsHtml()}
      </div>

      <div class="grid two mt14">
        <div class="card">
          <div class="card-hd"><div class="card-title"><span class="ti">🧾</span>最近几笔</div>
            <button class="link-btn" data-act="goBooks" type="button">全部 ›</button></div>
          ${listHtml(recent)}
        </div>
        <div class="stack g14">
          <div class="card">
            <div class="card-hd"><div class="card-title"><span class="ti">🌱</span>记了多少</div></div>
            <div class="stat-grid">
              <div class="stat"><div class="stat-l">一共记了</div><div class="v">${h.totalDays} 天</div></div>
              <div class="stat"><div class="stat-l">这个月</div><div class="v">${h.monthDays} / ${h.monthDim}</div></div>
              <div class="stat"><div class="stat-l">总笔数</div><div class="v">${h.totalTxns}</div></div>
            </div>
            <p class="tiny muted mt14">${habitLine(h)}</p>
            <div class="mt10">${heatHtml(h.heat)}</div>
          </div>
          ${forecastMini()}
        </div>
      </div>

      ${entryHtml(state)}
    </div>`;
  }

  /* ---------- 行为 ---------- */
  function reRender() { if (w.App) App.render({ keepFocus: "#quickInput" }); }

  Act.saveIncomeQuick = function () {
    const el = U.$("#incQuick");
    const v = U.toAmount(el && el.value);
    if (!(v > 0)) return UI.toast("填个大于 0 的数");
    Store.setSetting("monthlyIncome", v);
    UI.toast("好，按每月 " + U.yuan(v) + " 算");
  };

  Act.submitEntry = function (state) {
    const txt = (state.entryText || "").trim();
    if (!txt) return UI.toast("先写点什么，比如「午饭25」");
    const list = Parse.multi(txt, Store.data.cats);
    const ready = list.filter(d => d.amount > 0);
    const missing = list.filter(d => !(d.amount > 0));
    if (!ready.length) {
      state.entryText = "";
      reRender();
      if (missing.length) {
        const d = missing[0];
        return UI.txnForm(null, { catId: d.catId, date: d.date, note: d.note, flow: d.flow });
      }
      return UI.toast("没认出金额，试试「午饭25」这样的写法");
    }
    state.entryText = "";
    const recs = Store.addMany(ready.map(d => ({ flow: d.flow, amount: d.amount, catId: d.catId, date: d.date, note: d.note })));
    if (!recs.length) return UI.toast("没能记下任何一笔，检查一下金额");
    UI.toast((recs.length > 1 ? "记下 " + recs.length + " 笔：" : "记下 ") + U.yuan(recs[0].amount), {
      action: "撤销", onAction: () => Store.undo()
    });
    if (missing.length) UI.toast("还有 " + missing.length + " 笔没认出金额，点它补一下");
  };

  Act.fillAmount = function (state, el) {
    const d = Parse.multi(state.entryText, Store.data.cats)[+el.dataset.i];
    if (!d) return;
    state.entryText = "";
    reRender();
    UI.txnForm(null, { catId: d.catId, date: d.date, note: d.note, flow: d.flow });
  };

  Act.quickAdd = function (state, el) {
    const rec = Store.addTxn({ flow: "out", catId: el.dataset.cat, amount: +el.dataset.amt, date: U.today(), note: "" });
    if (!rec) return;
    UI.toast("记了 " + Store.catOf(rec.catId).name + " " + U.yuan(rec.amount), {
      action: "撤销", onAction: () => Store.removeTxn(rec.id)
    });
  };
  Act.quickEdit = function (state, el) {
    UI.txnForm(null, { catId: el.dataset.cat, amount: el.dataset.amt, date: U.today() });
  };
  Act.addIncome = function () { UI.txnForm(null, { flow: "in" }); };

  Act.bulkEntry = function () {
    const host = UI.openSheet({
      title: "一次补几笔",
      body: `<p class="tiny muted">一行一笔，写法跟平时一样。补昨天、补一周都在这儿，比一笔一笔点快得多。</p>
        <textarea class="textarea mt10" id="bulkText" placeholder="奶茶 18&#10;打车 32 昨天&#10;房租 3000 11/5&#10;+8000 工资 11/10"></textarea>
        <div class="preview" id="bulkPv"></div>`,
      footer: `<div class="row" style="gap:10px">
          <button class="btn grow" data-sheet-close type="button">算了</button>
          <button class="btn grow primary" data-bulk-ok type="button">全记下</button>
        </div>`
    });
    const ta = host.querySelector("#bulkText");
    const pv = host.querySelector("#bulkPv");
    const upd = () => { pv.innerHTML = draftsHtml(Parse.multi(ta.value, Store.data.cats)); };
    ta.addEventListener("input", upd);
    ta.focus();
    host.querySelector("[data-bulk-ok]").addEventListener("click", function () {
      const list = Parse.multi(ta.value, Store.data.cats);
      const ready = list.filter(d => d.amount > 0);
      if (!ready.length) return UI.toast("一行一个金额，比如「奶茶 18」");
      UI.closeSheet(true);
      Store.addMany(ready.map(d => ({ flow: d.flow, amount: d.amount, catId: d.catId, date: d.date, note: d.note })));
      UI.toast("记下 " + ready.length + " 笔" + (ready.length < list.length ? "（" + (list.length - ready.length) + " 笔缺金额被跳过）" : ""),
        { action: "撤销", onAction: () => Store.undo() });
    });
  };
  Act.addManual = function () { UI.txnForm(null); };
  Act.editTxn = function (state, el) {
    const t = Store.data.txns.find(x => x.id === el.dataset.id);
    if (t) UI.txnForm(t);
  };
  Act.delTxn = function (state, el) {
    const t = Store.data.txns.find(x => x.id === el.dataset.id);
    if (!t) return;
    Store.removeTxn(t.id);
    UI.toast("删掉了 " + Store.catOf(t.catId).name + " " + U.yuan(t.amount), {
      action: "撤销", onAction: () => Store.restoreTxns([t])
    });
  };
  Act.goBooks = function () { if (w.App) App.go("books"); };
  Act.goPlan = function () { if (w.App) App.go("plan"); };
  Act.dismissBanner = function () { Notify.dismissBanner(); App.render({ keepScroll: true }); };
  Act.goIncomeBook = function (state, el) {
    Store.useBook(el.dataset.id);
    if (w.App) App.go("today");
  };

  w.Views = w.Views || {};
  w.Views.today = { render, preview: previewHtml, title: "今天", icon: "🏠" };
})(window);
