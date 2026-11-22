/* =========================================================
   ui.js · Toast / 底部抽屉 / 通用表单（视图共用）
   ========================================================= */
(function (w) {
  "use strict";

  const $ = U.$;

  /* ---------- Toast（带撤销） ---------- */
  function toast(msg, opt) {
    opt = opt || {};
    const layer = $("#toastLayer");
    if (!layer) return;
    const el = document.createElement("div");
    el.className = "toast";
    el.innerHTML = '<span class="t-msg">' + U.esc(msg) + "</span>" +
      (opt.action ? '<button class="t-act" type="button">' + U.esc(opt.action) + "</button>" : "");
    layer.appendChild(el);
    let killed = false;
    const kill = () => {
      if (killed) return; killed = true;
      el.classList.add("out");
      setTimeout(() => el.remove(), 240);
    };
    if (opt.action) {
      el.querySelector(".t-act").addEventListener("click", () => { kill(); opt.onAction && opt.onAction(); });
    }
    setTimeout(kill, opt.ms || (opt.action ? 6500 : 2600));
    while (layer.children.length > 3) layer.firstChild.remove();
    return kill;
  }

  /* ---------- 抽屉 / 弹窗 ---------- */
  function openSheet(cfg) {
    const layer = $("#modalLayer");
    layer.innerHTML = "";
    layer.classList.add("on");
    const host = document.createElement("div");
    host.className = "sheet-host";
    host.innerHTML =
      '<div class="scrim" data-sheet-close></div>' +
      '<div class="sheet" role="dialog" aria-modal="true" aria-label="' + U.esc(cfg.title || "") + '">' +
      '<div class="sheet-hd"><div class="sheet-t">' + U.esc(cfg.title || "") + "</div>" +
      '<button class="sheet-x" type="button" data-sheet-close aria-label="关闭">×</button></div>' +
      '<div class="sheet-body">' + (cfg.body || "") + "</div>" +
      (cfg.footer ? '<div class="sheet-ft mt14">' + cfg.footer + "</div>" : "") +
      "</div>";
    layer.appendChild(host);
    layer._onClose = cfg.onClose || null;
    const first = host.querySelector("input,select,textarea,button:not([data-sheet-close])");
    if (first && !cfg.noFocus) setTimeout(() => first.focus(), 90);
    return host;
  }
  function closeSheet(skipCb) {
    const layer = $("#modalLayer");
    if (!layer.classList.contains("on")) return;
    layer.classList.remove("on");
    layer.innerHTML = "";
    const cb = layer._onClose; layer._onClose = null;
    if (!skipCb && cb) cb();
  }
  w.document.addEventListener("click", e => {
    if (e.target.closest("[data-sheet-close]")) closeSheet();
  });
  w.document.addEventListener("keydown", e => {
    if (e.key === "Escape" && $("#modalLayer").classList.contains("on")) closeSheet();
  });

  /* ---------- 确认框 ---------- */
  function confirm(cfg) {
    return new Promise(res => {
      const host = openSheet({
        title: cfg.title || "确认一下",
        body: '<div class="callout ' + (cfg.danger ? "" : "soft-b") + '" style="' +
          (cfg.danger ? "background:var(--rose-soft);color:var(--neg)" : "") + '"><span class="ci">' +
          (cfg.danger ? "⚠️" : "❓") + '</span><div>' + cfg.text + "</div></div>",
        footer: '<div class="row" style="gap:10px"><button class="btn grow" data-sheet-close type="button">取消</button>' +
          '<button class="btn grow ' + (cfg.danger ? "danger" : "primary") + '" data-ok type="button">' +
          U.esc(cfg.ok || "确定") + "</button></div>",
        onClose: () => res(false)
      });
      host.querySelector("[data-ok]").addEventListener("click", () => { closeSheet(true); res(true); });
    });
  }

  /* ---------- 选择器（列表式，比 select 好点） ---------- */
  function picker(cfg) {
    return new Promise(res => {
      const items = cfg.options.map((o, i) =>
        '<li><button class="chip" style="width:100%;justify-content:flex-start" data-i="' + i + '" type="button">' +
        (o.emoji ? '<span>' + U.esc(o.emoji) + "</span>" : "") +
        '<span class="row grow">' + U.esc(o.label) + "</span>" +
        (o.hint ? '<span class="c-amt">' + U.esc(o.hint) + "</span>" : "") +
        (o.v === cfg.value ? '<span style="color:var(--primary)">✓</span>' : "") +
        "</button></li>").join("");
      const host = openSheet({
        title: cfg.title || "选一个",
        body: (cfg.lead ? '<p class="tiny muted mb14">' + U.esc(cfg.lead) + "</p>" : "") +
          '<ul class="list stack chips wrapx" style="gap:8px">' + items + "</ul>",
        onClose: () => res(null)
      });
      host.addEventListener("click", e => {
        const b = e.target.closest("[data-i]");
        if (!b) return;
        closeSheet(true);
        res(cfg.options[+b.dataset.i]);
      });
    });
  }

  /* ---------- 通用表单 ---------- */
  function fieldHtml(f, val) {
    const v = val == null ? (f.value == null ? "" : f.value) : val;
    const lab = f.label ? '<div class="label">' + U.esc(f.label) + (f.required ? ' <span style="color:var(--neg)">*</span>' : "") + "</div>" : "";
    const hint = f.hint ? '<div class="micro">' + f.hint + "</div>" : "";
    let inner = "";
    switch (f.type) {
      case "money":
        inner = '<div class="input-money"><input class="input" type="text" inputmode="decimal" data-f="' + f.name + '" value="' + U.esc(v === "" ? "" : U.money(v, { dec: 2 })) + '" placeholder="' + U.esc(f.placeholder || "0.00") + '"></div>';
        break;
      case "date":
        inner = '<input class="input" type="date" data-f="' + f.name + '" value="' + U.esc(v) + '">';
        break;
      case "select":
        inner = '<select class="select" data-f="' + f.name + '">' + (f.options || []).map(o =>
          '<option value="' + U.esc(o.v) + '"' + (String(o.v) === String(v) ? " selected" : "") + ">" + U.esc(o.l) + "</option>").join("") + "</select>";
        break;
      case "seg":
        inner = '<div class="chips wrapx" data-seg="' + f.name + '">' + (f.options || []).map(o =>
          '<button type="button" class="chip' + (String(o.v) === String(v) ? " on" : "") + '" data-seg-v="' + U.esc(o.v) + '">' + U.esc(o.l) + "</button>").join("") + "</div>" +
          '<input type="hidden" data-f="' + f.name + '" value="' + U.esc(v) + '">';
        break;
      case "textarea":
        inner = '<textarea class="textarea" data-f="' + f.name + '" placeholder="' + U.esc(f.placeholder || "") + '">' + U.esc(v) + "</textarea>";
        break;
      case "switch":
        return '<label class="switch" style="justify-content:space-between">' +
          '<span>' + U.esc(f.label || "") + (f.hint ? '<span class="micro"> · ' + f.hint + "</span>" : "") +
          '</span><input type="checkbox" data-f="' + f.name + '"' + (v ? " checked" : "") + "></label>";
      case "note":
        return '<div class="callout ' + (f.tone || "soft-b") + '"><span class="ci">' + (f.ico || "💡") + "</span><div>" + f.text + "</div></div>";
      case "day":
        inner = '<input class="input" type="number" min="1" max="28" data-f="' + f.name + '" value="' + U.esc(v || 1) + '">';
        break;
      case "int":
        inner = '<input class="input" type="number" min="' + (f.min || 0) + '" max="' + (f.max || 999999) + '" step="' + (f.step || 1) + '" data-f="' + f.name + '" value="' + U.esc(v) + '">';
        break;
      case "text":
      default:
        inner = '<input class="input" type="text" data-f="' + f.name + '" value="' + U.esc(v) + '" placeholder="' + U.esc(f.placeholder || "") + '">';
    }
    return '<div class="field' + (f.full ? " full" : "") + '" data-fname="' + f.name + '">' + lab + inner + hint + "</div>";
  }

  function readForm(root, fields) {
    const out = {};
    fields.forEach(f => {
      if (f.type === "note") return;
      const el = root.querySelector('[data-f="' + f.name + '"]');
      if (!el) return;
      let v = el.type === "checkbox" ? el.checked : el.value;
      if (f.type === "money") v = U.toAmount(v);
      if (f.type === "int" || f.type === "day") v = parseInt(v, 10);
      out[f.name] = v;
    });
    return out;
  }

  function form(cfg) {
    return new Promise(res => {
      const vals = cfg.values || {};
      const body = '<div class="form-grid">' + cfg.fields.map(f => fieldHtml(f, vals[f.name])).join("") + "</div>";
      const host = openSheet({
        title: cfg.title,
        body,
        footer: '<div class="row" style="gap:10px">' +
          (cfg.extraLeft || "") +
          '<button class="btn grow" data-sheet-close type="button">取消</button>' +
          '<button class="btn grow primary" data-submit type="button">' + U.esc(cfg.ok || "保存") + "</button></div>",
        onClose: () => res(null)
      });
      host.addEventListener("click", e => {
        const seg = e.target.closest("[data-seg-v]");
        if (seg) {
          const wrap = seg.closest("[data-seg]");
          wrap.querySelectorAll("[data-seg-v]").forEach(x => x.classList.remove("on"));
          seg.classList.add("on");
          const hid = host.querySelector('[data-f="' + wrap.dataset.seg + '"]');
          if (hid) {
            hid.value = seg.dataset.segV;
            if (cfg.onChange) cfg.onChange(readForm(host, cfg.fields), host, cfg.fields);
          }
        }
        const sub = e.target.closest("[data-submit]");
        if (!sub) return;
        const v = readForm(host, cfg.fields);
        const err = cfg.validate ? cfg.validate(v) : null;
        if (err) { toast(err); return; }
        closeSheet(true);
        res(v);
      });
      host.addEventListener("change", e => {
        if (e.target.closest("[data-f]") && cfg.onChange) cfg.onChange(readForm(host, cfg.fields), host, cfg.fields);
      });
      if (cfg.onMount) cfg.onMount(host);
    });
  }

  /* ---------- 选项数据源 ---------- */
  function catOptions(flow, extraFirst) {
    const list = Store.catsOf(flow || "out");
    const opts = list.map(c => ({ v: c.id, l: c.emoji + " " + c.name + (c.tag === "move" ? "（转移）" : "") }));
    if (extraFirst) opts.unshift({ v: "", l: extraFirst });
    return opts;
  }
  function bookOptions() {
    return Store.data.books.map(b => ({ v: b.id, l: b.emoji + " " + b.name }));
  }
  const FLOW_OPT = [{ v: "out", l: "支出" }, { v: "in", l: "收入" }];
  const TAG_OPT = [
    { v: "fixed", l: "刚性 · 每月不动" }, { v: "need", l: "必要 · 金额会浮动" },
    { v: "want", l: "想要 · 可以商量" }, { v: "move", l: "转移 · 存钱或还款" }, { v: "income", l: "收入" }
  ];

  /* ---------- 业务表单 ---------- */
  async function txnForm(txn, preset) {
    preset = preset || {};
    const isEdit = !!(txn && txn.id);
    const base = txn || Object.assign({
      flow: "out", amount: "", catId: preset.catId || Store.catsOf("out")[0].id,
      date: preset.date || U.today(), note: "", bookId: Store.data.activeBookId
    }, preset.flow ? { flow: preset.flow, catId: preset.catId || Store.catsOf(preset.flow)[0].id } : {});

    const fields = [
      { name: "flow", label: "方向", type: "seg", options: FLOW_OPT },
      { name: "amount", label: "金额", type: "money", required: true, placeholder: "0.00" },
      { name: "catId", label: "分类", type: "select", options: catOptions(base.flow), full: true },
      { name: "date", label: "日期", type: "date" },
      { name: "bookId", label: "账本", type: "select", options: bookOptions() },
      { name: "note", label: "备注", type: "text", full: true, placeholder: "跟朋友吃了那家新开的…" },
      { type: "note", name: "_n", ico: "🔒", text: "这条只会写进你浏览器里的本地存储。" }
    ];
    const v = await form({
      title: isEdit ? "编辑这笔" : "记一笔",
      fields, ok: isEdit ? "保存修改" : "记下",
      values: base,
      validate: x => (x.amount > 0 ? null : "金额得是个大于 0 的数"),
      onChange: (x, host) => {
        const sel = host.querySelector('[data-f="catId"]');
        if (!sel) return;
        const want = Store.catsOf(x.flow).map(c => c.id);
        if (!want.includes(sel.value)) sel.innerHTML = catOptions(x.flow).map(o =>
          '<option value="' + o.v + '">' + U.esc(o.l) + "</option>").join("");
      }
    });
    if (!v) return null;
    const rec = { flow: v.flow, amount: v.amount, catId: v.catId || null, date: v.date || U.today(), note: v.note, bookId: v.bookId };
    if (isEdit) Store.updateTxn(txn.id, rec); else Store.addTxn(rec);
    return rec;
  }

  function goalForm(goal) {
    const isEdit = !!(goal && goal.id);
    const base = goal || { name: "", target: "", saved: 0, deadline: U.addDays(U.today(), 180) };
    return form({
      title: isEdit ? "编辑目标" : "新建一个存钱目标",
      ok: isEdit ? "保存" : "建好",
      values: base,
      fields: [
        { name: "name", label: "这笔钱是为了什么", type: "text", full: true, placeholder: "换电脑 / 春天去一次云南" },
        { name: "target", label: "需要多少", type: "money", required: true },
        { name: "deadline", label: "希望在什么时候", type: "date" },
        { name: "saved", label: "现在已经有了", type: "money" },
        { type: "note", name: "_n", ico: "🧮", text: "我会拿「还差多少 ÷ 还剩几个月」算出每月要存多少，然后从今天可花的钱里先扣掉它。目标能不能实现，只看你这个月真实记下来的数。" }
      ],
      validate: x => (x.target > 0 ? null : "先告诉我要存多少")
    }).then(v => {
      if (!v) return null;
      const rec = { name: v.name || "存钱目标", target: v.target, saved: v.saved || 0, deadline: v.deadline };
      if (isEdit) Store.updateGoal(goal.id, rec); else Store.addGoal(rec);
      return rec;
    });
  }

  function recForm(rec) {
    const isEdit = !!(rec && rec.id);
    const base = rec || { name: "", flow: "out", amount: "", catId: Store.catsOf("out")[0].id, day: 1, active: true, from: U.monthKey(U.today()), bookId: Store.data.activeBookId };
    return form({
      title: isEdit ? "编辑周期账单" : "添加周期账单",
      ok: isEdit ? "保存" : "添加",
      values: base,
      fields: [
        { name: "name", label: "名字", type: "text", full: true, placeholder: "房租 / 视频会员 / 房贷" },
        { name: "amount", label: "每期金额", type: "money", required: true },
        { name: "day", label: "每月几号", type: "day" },
        { name: "flow", label: "方向", type: "seg", options: FLOW_OPT },
        { name: "catId", label: "分类", type: "select", options: catOptions(base.flow) },
        { name: "from", label: "从哪个月开始", type: "text", placeholder: "2026-11" },
        { name: "active", label: "启用", type: "switch", hint: "到了那天自动记上，不用你想着" },
        { type: "note", name: "_n", ico: "🔁", text: "这是本项目里唯一的「自动」。它只在你打开这个页面时，按你设的日期往本地补一条流水——不联网、不读你的银行卡、不需要任何授权。" }
      ],
      validate: x => (x.amount > 0 ? null : "填个金额")
    }).then(v => {
      if (!v) return null;
      const rec2 = { name: v.name || "周期账单", amount: v.amount, day: v.day || 1, flow: v.flow, catId: v.catId, from: /^\d{4}-\d{2}$/.test(v.from) ? v.from : U.monthKey(U.today()), active: !!v.active, bookId: Store.data.activeBookId };
      if (isEdit) Store.updateRec(rec.id, rec2); else Store.addRec(rec2);
      Store.generateRecurring();
      return rec2;
    });
  }

  function catForm(cat) {
    const isEdit = !!(cat && cat.id);
    const base = cat || { name: "", emoji: "🏷️", flow: "out", tag: "need", alias: [] };
    return form({
      title: isEdit ? "编辑分类" : "新建分类",
      values: Object.assign({}, base, { alias: (base.alias || []).join(" ") }),
      fields: [
        { name: "name", label: "名字", type: "text", placeholder: "露营" },
        { name: "emoji", label: "图标", type: "text", placeholder: "⛺" },
        { name: "flow", label: "方向", type: "seg", options: FLOW_OPT },
        { name: "tag", label: "性质", type: "select", options: TAG_OPT },
        { name: "alias", label: "别名（空格隔开，一句话记账会认它）", type: "text", full: true, placeholder: "露营 装备 帐篷" },
        { name: "budget", label: "每月预算（可选）", type: "money", full: true }
      ],
      validate: x => (x.name ? null : "总得给个名字")
    }).then(v => {
      if (!v) return null;
      const rec = { name: v.name, emoji: v.emoji || "🏷️", flow: v.flow, tag: v.tag, alias: String(v.alias || "").split(/[\s,，、]+/).filter(Boolean) };
      if (isEdit) Store.updateCat(cat.id, rec); else { const c = Store.addCat(rec); rec.id = c.id; }
      if (v.budget != null && isFinite(v.budget)) Store.setBudget(rec.id || cat.id, v.budget);
      return rec;
    });
  }

  w.UI = {
    toast, openSheet, closeSheet, confirm, picker, form, fieldHtml, readForm,
    catOptions, bookOptions, FLOW_OPT, TAG_OPT,
    txnForm, goalForm, recForm, catForm
  };
})(window);
