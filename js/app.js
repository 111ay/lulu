/* =========================================================
   app.js · 路由、事件分发、首屏引导
   ========================================================= */
(function (w) {
  "use strict";

  const NAV = [
    { k: "today", l: "今天", i: "🏠" },
    { k: "plan", l: "计划", i: "🧭" },
    { k: "trend", l: "走势", i: "📈" },
    { k: "books", l: "明细", i: "🗂️" },
    { k: "data", l: "数据", i: "💾" }
  ];

  const state = {
    route: "today",
    entryText: "",
    entryPh: "午饭25 · 打车38 昨天 · +8000 工资",
    trendMonth: null,
    f: {},
    page: 1
  };

  let viewEl, railEl, tabEl, bookNameEl;
  let phTimer = null;

  function navHtml() {
    /* 「无联网」这句得跟着手机推送的实际状态走，不能一直挂着说 */
    const net = Store.notify.enabled && Store.notify.channels.phone && Notify.pushCfg().ready
      ? "仅提醒出网" : "无联网";
    return NAV.map(n =>
      `<button class="nav-item${n.k === state.route ? " is-on" : ""}" data-nav="${n.k}" type="button" aria-current="${n.k === state.route}">
        <span class="ico">${n.i}</span><span>${n.l}</span>
      </button>`).join("") +
      `<div class="rail-foot">数据只存在这台设备<br>无广告 · 无内购 · ${net}</div>`;
  }

  function saveFocusKey(el) {
    if (!el || el === document.body) return null;
    if (el.dataset && el.dataset.actInput) return "[data-act-input=\"" + el.dataset.actInput + "\"]";
    if (el.id) return "[id=\"" + el.id + "\"]";
    if (el.dataset && el.dataset.actChange) return "[data-act-change=\"" + el.dataset.actChange + "\"]";
    return null;
  }

  function render(opt) {
    opt = opt || {};
    const view = w.Views[state.route];
    if (!view) return;
    const key = opt.keepFocus || saveFocusKey(document.activeElement);
    let sel = null;
    const ae = document.activeElement;
    if (key && ae && typeof ae.selectionStart === "number") {
      try { sel = [ae.selectionStart, ae.selectionEnd]; } catch (e) { sel = null; }
    }
    const scroll = opt.keepScroll === false ? 0 : (w.document.querySelector(".stage") || {}).scrollTop || 0;

    viewEl.innerHTML = view.render(state);
    railEl.innerHTML = navHtml();
    tabEl.innerHTML = NAV.map(n =>
      `<button class="nav-item${n.k === state.route ? " is-on" : ""}" data-nav="${n.k}" type="button">
        <span class="ico">${n.i}</span><span>${n.l}</span></button>`).join("");
    if (bookNameEl) bookNameEl.textContent = Store.bookById().name;

    const fab = U.$(".fab");
    if (fab) fab.classList.toggle("hide", state.route === "today");

    if (key) {
      const el = viewEl.querySelector(key) || U.$(key);
      if (el && el.focus) {
        el.focus({ preventScroll: true });
        if (sel && el.setSelectionRange && typeof el.value === "string" && sel[0] != null) {
          try { el.setSelectionRange(sel[0], sel[1]); } catch (e) { }
        }
      }
    }
    const stage = w.document.querySelector(".stage");
    if (stage && opt.keepScroll !== false) stage.scrollTop = scroll;
  }

  function go(route) {
    if (!w.Views[route]) route = "today";
    state.route = route;
    state.page = 1;
    if (route !== "trend") state.trendMonth = null;
    render({ keepScroll: false });
    const stage = w.document.querySelector(".stage");
    if (stage) stage.scrollTop = 0;
  }

  /* ---------- 事件分发 ---------- */
  function dispatch(name, el, ev) {
    const fn = w.Act[name];
    if (!fn) {
      if (name === "toggleTheme") { Store.setTheme(Store.s.theme === "dark" ? "light" : "dark"); return true; }
      if (name === "goEntry") { go("today"); const q = U.$("#quickInput"); if (q) q.focus(); return true; }
      if (name === "toggleBookPicker") { bookPicker(); return true; }
      return false;
    }
    fn(state, el, ev);
    return true;
  }

  async function bookPicker() {
    const opts = Store.data.books.map(b => ({
      v: b.id, label: b.emoji + " " + b.name, hint: Store.txns({ bookId: b.id }).length + " 笔"
    }));
    const pick = await UI.picker({ title: "切到账本", options: opts, value: Store.data.activeBookId, lead: "账本之间互不影响：各自的流水、周期账单和每天额度。" });
    if (pick) { Store.useBook(pick.v); UI.toast("已切到「" + Store.bookById().name + "」"); }
  }

  w.document.addEventListener("click", function (ev) {
    const nav = ev.target.closest("[data-nav]");
    if (nav) { go(nav.dataset.nav); return; }
    const el = ev.target.closest("[data-act]");
    if (!el) return;
    if (el.tagName === "A") ev.preventDefault();
    dispatch(el.dataset.act, el, ev);
  });

  w.document.addEventListener("keydown", function (ev) {
    if (ev.key !== "Enter") return;
    const el = ev.target;
    if (!el || el.id !== "quickInput") return;
    if (ev.isComposing || el.dataset.im === "1") return;
    ev.preventDefault();
    dispatch("submitEntry", el, ev);
  });

  /* 输入时只刷新预览，不做整页重绘，避免光标乱跳 */
  w.document.addEventListener("input", function (ev) {
    const el = ev.target;
    if (el.id === "quickInput") {
      state.entryText = el.value;
      const pv = U.$("#entryPreview");
      if (pv) pv.innerHTML = w.Views.today.preview ? w.Views.today.preview(state) : "";
      return;
    }
    if (el.dataset && el.dataset.actInput) {
      const key = el.dataset.actInput;
      const val = el.value;
      clearTimeout(phTimer);
      phTimer = setTimeout(function () {
        if (key === "setQ") { state.f = state.f || {}; state.f.q = val; state.page = 1; render(); }
      }, 260);
    }
  });

  w.document.addEventListener("change", function (ev) {
    const el = ev.target;
    const name = el.dataset && el.dataset.actChange;
    if (!name) return;
    const fn = w.Act[name];
    if (fn) fn(state, el, ev);
  });

  /* ---------- 首屏引导 ---------- */
  function onboard() {
    if (Store.s.onboarded) return;
    const host = UI.openSheet({
      title: "慢慢记",
      noFocus: true,
      body: `<p class="tiny muted" style="line-height:1.9">
          这个工具只回答一个问题：<b style="color:var(--text)">今天还可以花多少。</b><br>
          记一笔只需要一句话 —— 「午饭25」「打车38 昨天」「+8000 工资」。<br>
          它不联网、不授权、不推荐你买任何东西，也永远没有付费墙。
        </p>
        <div class="stack g10 mt14">
          <div class="field"><div class="label">先说个大概：你每月到手多少（可跳过）</div>
            <div class="input-money"><input class="input" type="text" inputmode="decimal" id="onInc" placeholder="12000"></div></div>
        </div>
        <div class="callout soft-b mt14"><span class="ci">💡</span>
          <div>不想现在填也行。没记够一个月之前，「计划」页的推导会用你已记入的收入来算。</div></div>`,
      footer: `<div class="stack g8">
          <button class="btn primary block" data-act="finishOnboard" type="button">我自己开始记</button>
          <button class="btn block" data-act="finishOnboardDemo" type="button">先看看示例数据长什么样</button>
        </div>`
    });
    host.addEventListener("click", function (ev) {
      const b = ev.target.closest("[data-act]");
      if (!b) return;
      const inc = U.toAmount((U.$("#onInc") || {}).value);
      if (inc > 0) Store.setSetting("monthlyIncome", inc);
      Store.setSetting("onboarded", true);
      UI.closeSheet(true);
      if (b.dataset.act === "finishOnboardDemo") { Store.loadDemo(); Store.setSetting("onboarded", true); go("plan"); }
      else { go("today"); const q = U.$("#quickInput"); if (q) q.focus(); }
    });
  }

  /* ---------- 启动 ---------- */
  w.App = { state, go, render, dispatch, NAV };

  w.document.addEventListener("DOMContentLoaded", function () {
    viewEl = U.$("#view");
    railEl = U.$("#rail");
    tabEl = U.$("#tabbar");
    bookNameEl = U.$("#bookBtn [data-bind=activeBookName]");

    const sub = document.createElement("button");
    sub.className = "fab hide";
    sub.dataset.act = "goEntry";
    sub.title = "记一笔";
    sub.setAttribute("aria-label", "记一笔");
    sub.textContent = "＋";
    U.$(".app").appendChild(sub);

    Store.on(function () { render({ keepScroll: true }); });

    render({ keepScroll: false });
    onboard();

    /* 提醒：先补算错过的周期，再挂一个到点检查；判据全在 localStorage 里 */
    if (w.Notify) Notify.start();

    if (Store.memoryOnly) UI.toast("这个浏览器不让写本地存储，记录关掉就没了，记得随时导出", { ms: 8000 });
  });
})(window);
