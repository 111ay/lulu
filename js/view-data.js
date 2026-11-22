/* =========================================================
   view-data.js · 数据与设置：把「隐私」和「成本」摊开说
   ========================================================= */
(function (w) {
  "use strict";
  const Act = (w.Act = w.Act || {});

  function sizeOf() {
    let bytes = 0;
    try { const s = JSON.stringify(Store.data); bytes = new Blob([s]).size; } catch (e) { bytes = 0; }
    return bytes > 1024 ? (bytes / 1024).toFixed(1) + " KB" : bytes + " B";
  }

  const PERM_PILL = {
    granted: ["g", "已允许"], denied: ["r", "被拒绝"],
    unsupported: ["", "这台设备没有"], default: ["w", "还没问过"]
  };

  /* 日志里存的是通道 id，显示成人话；重试到放弃那种条目只有 id，没有别的名字可用 */
  function chLabel(id) {
    return String(id || "").split(",").map(x => (Notify.channels[x] || { label: x }).label).join("、");
  }

  /* 日志时间用提醒那个时区显示，跟「今天 / 到点」的判据对得上 */
  function stampOf(at) {
    const z = Notify.znow(at);
    return z.date.slice(5) + " " + z.clock;
  }

  /* ---------- 日常轻提醒：阈值判断全在 notify.js，这里只填参数和看结果 ---------- */
  function pushHtml(st) {
    const n = Store.notify;
    const b = st.budget, cfg = b.cfg;
    const field = (pk, label, val, opt) => `<div class="field${opt && opt.full ? " full" : ""}">
        <div class="label">${label}</div>
        <input class="input" type="${opt && opt.pw ? "password" : "text"}" data-act-change="setPushField" data-pk="${pk}"
          value="${U.esc(val || "")}" placeholder="${U.esc((opt && opt.ph) || "")}" autocomplete="off"${opt && opt.pw ? ' spellcheck="false"' : ""}>
      </div>`;
    const prov = cfg.provider;
    const line = b.line.map(x => `<span class="pill${x.hit ? " r" : ""}">${x.at}% ${x.hit ? "已推" : "¥" + U.money(x.need)}</span>`).join(" ");
    const pct = b.day > 0 ? U.clamp(b.spent / b.day * 100, 0, 999) : 0;
    return `<div class="label mt14">手机推送 · 日常轻提醒</div>
      <div class="chips wrapx" role="radiogroup" aria-label="推送方式">
        ${[["", "不推"], ["ntfy", "ntfy"], ["pushover", "Pushover"]].map(o => `<label class="chip${prov === o[0] ? " on" : ""}">
            <input type="radio" name="pushChannel" data-act-change="setPushChannel" value="${o[0]}"${prov === o[0] ? " checked" : ""}><span>${o[1]}</span>
          </label>`).join("")}
      </div>
      <div class="form-grid mt10">
        ${prov === "ntfy" ? [
          field("ntfyTopic", "topic 名字（必填，像网址里那截路径）", cfg.topic, { full: true, ph: "随便起一个别人猜不到的，比如 x7k2-mijing" }),
          field("ntfyBase", "服务器地址（自建才要填）", n.push.ntfyBase, { full: true, ph: "留空 = https://ntfy.sh" })
        ].join("") : ""}
        ${prov === "pushover" ? [
          field("poToken", "PUSHOVER_TOKEN", n.push.poToken, { pw: true, ph: "应用 token" }),
          field("poUser", "PUSHOVER_USER_KEY", n.push.poUser, { pw: true, ph: "你的 user key" })
        ].join("") : ""}
        ${field("thresholds", "阈值（留空 = 配置里的 80,100）", n.budgetPush.thresholds.join(","), { full: true, ph: "80,100" })}
      </div>
      <label class="switch mt10" style="justify-content:space-between">
        <span>花到这些线上就推<span class="micro" style="display:block">同一天同一档只推一次；往下调、删掉几笔也不会再推第二遍</span></span>
        <input type="checkbox" data-act-change="setBudgetPushOn"${b.switchOn ? " checked" : ""}>
      </label>
      <div class="callout ${b.block ? "soft-w" : "soft-b"} mt10"><span class="ci">${b.block ? "🧷" : "📱"}</span>
        <div>${b.block ? "现在不会推：" + U.esc(b.block) + "。"
          : `今日预算 <b>¥${U.money(b.day)}</b>（分类月预算之和 ÷ ${U.daysInMonth(st.ctx.mk)} 天）· 今日已花 <b>¥${U.money(b.spent)}</b> = ${U.pct(pct)}。`}
          <span class="row wrap gap10 mt10">${line}</span>
          ${b.pushedToday ? `<span class="micro" style="display:block;margin-top:6px">今天已经推过 ${b.pushedToday} 档，同一档不再推。</span>` : ""}</div></div>
      ${prov === "pushover" ? `<p class="micro mt10">Pushover 的接口没有给浏览器放开跨源，本地版这一条常常只会留下一行失败日志（请求可能已经发出去了）。要真用它，得有个自己的后端。</p>` : ""}
      ${prov === "ntfy" ? `<p class="micro mt10">topic 是公开路由：知道名字的人都能收到，所以推的只有「今日支出多少、用了几成」这一句，不含分类、备注和任何一笔流水。</p>` : ""}
      ${prov ? `<div class="row wrap gap10 mt10"><button class="btn sm" data-act="testPush" type="button">发一条到手机试试</button></div>` : ""}
      <p class="micro mt10">设备编号 <code>${U.esc(cfg.userId || "第一次真要推的时候生成")}</code>：本地版没有账号，去重和日志按它分人，后端版这里换成用户 id。</p>`;
  }

  function notifyHtml(st) {
    const n = Store.notify;
    const p = PERM_PILL[st.permission] || PERM_PILL.default;
    const log = n.log.slice().reverse().slice(0, 12);
    const chRow = id => {
      const ch = Notify.channels[id];
      const ready = ch.ready();
      return `<label class="switch" style="justify-content:space-between;align-items:flex-start">
        <span><b style="color:var(--text)">${ch.label}</b>${ready ? "" : " <span class=\"micro\">（本机不可用）</span>"}
          <span class="micro" style="display:block">${U.esc(ch.hint)}</span></span>
        <input type="checkbox" data-act-change="setNotifyChannel" data-ch="${id}"${n.channels[id] ? " checked" : ""}>
      </label>`;
    };
    const ruleRow = r => `<label class="switch" style="justify-content:space-between">
        <span>${U.esc(r.label)}<span class="micro" style="display:block">${U.esc(r.desc)}</span></span>
        <input type="checkbox" data-act-change="setNotifyRule" data-rule="${r.key}"${Notify.ruleOn(r.key) ? " checked" : ""}>
      </label>`;

    return `<div class="card mt14">
      <div class="card-hd"><div class="card-title"><span class="ti">🔔</span>提醒</div>
        <span class="pill ${n.enabled ? "g" : ""}">${n.enabled ? "已开启" : "已关闭"}</span></div>

      <label class="switch" style="justify-content:space-between">
        <span>要提醒<span class="micro" style="display:block">条件判断集中在 js/notify.js，页面只负责显示结果</span></span>
        <input type="checkbox" data-act-change="setRemindersOn"${n.enabled ? " checked" : ""}>
      </label>

      <div class="form-grid mt14">
        <div class="field full"><div class="label">时区</div>
          <select class="select" data-act-change="setNotifyZone">
            <option value="">跟着设备走（当前 ${U.esc(st.zone)}）</option>
            ${Notify.zoneList().map(z => `<option value="${U.esc(z)}"${n.timezone === z ? " selected" : ""}>${U.esc(z)}</option>`).join("")}
          </select></div>
        <div class="field"><div class="label">每天几点之后开始提</div>
          <input class="input" type="time" data-act-change="setNotifyAt" value="${U.esc(n.dailyAt)}"></div>
      </div>
      <p class="micro">「今天 / 本月 / 到点没有」一律按上面这个时区算；记账日期本身仍跟着设备日历走。</p>

      <div class="label mt14">通道</div>
      <div class="stack g10">${Object.keys(Notify.channels).map(chRow).join("")}</div>
      <div class="row between mt10" style="gap:10px;flex-wrap:wrap">
        <span class="tiny muted">系统通知权限：<span class="pill ${p[0]}">${p[1]}</span></span>
        ${st.permission === "default" ? `<button class="btn xs" data-act="askNotifyPerm" type="button">现在去要</button>` : ""}
      </div>

      ${pushHtml(st)}

      <div class="label mt14">提什么</div>
      <div class="stack g10">${Notify.RULES.map(ruleRow).join("")}</div>

      <div class="row between mt14" style="gap:10px">
        <div class="label" style="margin:0">发送日志</div>
        <span class="card-note">共 ${n.log.length} 条（留最近 ${Store.LOG_LIMIT} 条）· 待重试 ${n.pending.length}</span>
      </div>
      ${n.pending.length ? `<div class="callout soft-w mt10"><span class="ci">⏳</span>
        <div>有 ${n.pending.length} 条没发出去。每条最多试 ${Notify.MAX_TRIES} 次，间隔递增；失败只记日志，不影响你记账。</div></div>` : ""}
      ${log.length ? `<ul class="list tight mt10">` + log.map(x => {
        const rt = x.title || Notify.ruleLabel(x.rule), lb = x.label || Notify.ruleLabel(x.rule);
        return `<li>
          <span class="ico-box" style="background:${x.ok ? "var(--primary-soft)" : x.skip ? "var(--bg)" : "var(--rose-soft)"};color:${x.ok ? "var(--primary-deep)" : x.skip ? "var(--muted)" : "var(--rose)"}">${x.ok ? "✓" : x.skip ? "—" : "!"}</span>
          <span class="li-main">
            <span class="li-t">${U.esc(rt)}</span>
            <span class="li-s">${U.esc(chLabel(x.channel))}${lb === rt ? "" : " · " + U.esc(lb)} · ${U.esc(stampOf(x.at))}${x.tries > 1 ? " · 第 " + x.tries + " 次" : ""}</span>
            ${x.skip ? `<span class="li-s" style="white-space:normal">原因：${U.esc(x.skip)}</span>` : ""}
            ${x.ok || x.skip ? "" : `<span class="li-s" style="color:var(--neg);white-space:normal">${U.esc(x.error || "失败")}</span>`}
          </span>
          ${x.ok ? `<span class="li-s" style="flex:0 0 auto">已送达</span>` : x.skip ? `<span class="li-s" style="flex:0 0 auto">已跳过</span>` : ""}
        </li>`; }).join("") + `</ul>` : `<p class="tiny muted mt10">还没有发过任何一条。开着的话，今天 ${U.esc(n.dailyAt)} 之后第一次检查。</p>`}
      <div class="row wrap gap10 mt14">
        <button class="btn sm" data-act="testNotify" type="button">发一条测试</button>
        <button class="btn sm" data-act="runNotifyNow" type="button">现在就算一遍</button>
        ${n.log.length ? `<button class="btn sm" data-act="clearNotifyLog" type="button">清空日志</button>` : ""}
      </div>

      <div class="callout mt14"><span class="ci">🧱</span><div><b>本地版的硬限制，说清楚：</b>
        没有服务端，就没有凌晨三点的定时任务，也没有「你不打开页面也能收到」的预算提醒：
        求值只发生在「这个页面开着」（记完账立刻算一遍）或「你刚把它打开」（补上该提的）的时候 ——
        但判据（上次提过哪天、哪条已经发过、哪条待重试）全部持久化在本地数据里，重启后照样生效，不会重复推送。
        日志和去重记录也跟着 .json 备份一起走。</div></div>
      <p class="micro mt10">邮件这一栏现在是空的：浏览器不能直连 SMTP，把授权码写进本地文件也不是好主意。通道接口按统一形状留着，接上后端时只改 js/notify.js 里那一个 send()。
        上面那个「设备编号」是本地版用来代替「用户 id」的：没有账号体系，去重和日志就按它分人。</p>
    </div>`;
  }

  function render(state) {
    const d = Store.data;
    const days = U.dedupe(d.txns.map(t => t.date)).length;
    /* 这句「有没有出网」要说得准，就得看手机推送那条通道是不是真的配好了 */
    const pushLive = !!(Store.notify.enabled && Store.notify.channels.phone && Notify.pushCfg().ready);
    const stats = [
      ["流水", d.txns.length + " 笔"],
      ["记了", days + " 天"],
      ["账本", d.books.length + " 个"],
      ["分类", d.cats.length + " 个"],
      ["目标", d.goals.length + " 个"],
      ["周期账单", d.recs.length + " 条"],
      ["提醒规则", Notify.RULES.filter(r => Notify.ruleOn(r.key)).length + " / " + Notify.RULES.length + " 开"],
      ["占用空间", sizeOf()],
      ["网络请求", pushLive ? "只有预算提醒" : "0 次"]
    ];

    return `<div class="view">
      <div class="sec-hd"><div><div class="sec-title">数据与设置</div>
        <div class="sec-sub">你的账本就是这个浏览器里的一小段文本。它哪儿也没去。</div></div></div>

      <div class="grid two">
        <div class="card">
          <div class="card-hd"><div class="card-title"><span class="ti">🧭</span>基本设定</div></div>
          <div class="form-grid">
            <div class="field"><div class="label">每月到手（用来算每天能花多少）</div>
              <div class="input-money"><input class="input" type="text" inputmode="decimal"
                data-act-change="setIncome" value="${U.esc(U.money(Store.s.monthlyIncome || 0))}"></div></div>
            <div class="field"><div class="label">想留几个月必要支出做应急金</div>
              <input class="input" type="number" min="1" max="24" data-act-change="setEmergencyMonths" value="${Store.s.emergencyMonths || 6}"></div>
            <div class="field"><div class="label">已有存款起始数（可选）</div>
              <div class="input-money"><input class="input" type="text" inputmode="decimal"
                data-act-change="setEmergencyStart" value="${U.esc(U.money(Store.s.emergencyStart || 0))}"></div></div>
            <div class="field"><div class="label">从哪个月开始算</div>
              <input class="input" type="text" placeholder="2026-11"
                data-act-change="setFirstMonth" value="${U.esc(Store.s.firstMonth || Engine.CUR())}"></div>
          </div>
          <p class="micro mt10">「从哪个月开始算」影响周期账单的补记范围，也影响图表默认起点。</p>
        </div>

        <div class="card">
          <div class="card-hd"><div class="card-title"><span class="ti">📦</span>账本清单</div></div>
          <div class="stat-grid">${stats.map(s =>
            `<div class="stat"><div class="stat-l">${s[0]}</div><div class="v" style="font-size:17px">${s[1]}</div></div>`).join("")}</div>
          ${Store.memoryOnly ? `<div class="callout soft-w mt14"><span class="ci">⚠️</span>
            <div>这个浏览器不允许页面写本地存储（无痕模式或站点设置拦了）。现在记的东西只在本次打开期间存在，<b>关掉就没了</b>，请导出备份。</div></div>` : ""}
        </div>
      </div>

      ${notifyHtml(Notify.status())}

      <div class="card mt14">
        <div class="card-hd"><div class="card-title"><span class="ti">💾</span>备份与迁移</div>
          <span class="card-note">换设备、换浏览器都靠这一步</span></div>
        <div class="row wrap gap10">
          <button class="btn" data-act="exportJson" type="button">导出完整备份 .json</button>
          <button class="btn" data-act="exportCsv" type="button">导出流水 .csv（Excel 能开）</button>
          <button class="btn" data-act="pickImport" type="button">从备份恢复</button>
          <input type="file" accept="application/json,.json" id="impFile" class="hide">
        </div>
        <p class="tiny muted mt10">.json 是原样备份，含目标、周期账单、预算，可继续编辑；.csv 是给人看的流水表，导入不回来（要导回来请用 .json）。</p>
      </div>

      <div class="card mt14">
        <div class="card-hd"><div class="card-title"><span class="ti">🔒</span>关于隐私，说清楚</div></div>
        <ul class="stack" style="gap:9px;font-size:13.5px;line-height:1.8;color:var(--text-2)">
          <li>· <b style="color:var(--text)">不做自动同步。</b>正因为如此，也就不需要你授权任何支付渠道、任何交易数据 —— 这条路上的隐私风险是 0，不是因为保护好，是因为根本没发生。</li>
          <li>· <b style="color:var(--text)">没有服务器。</b>整个工具就是这台机器上的 <code>index.html</code> 加 <code>js/</code> 里几个文件，不引 CDN，不用 <code>XMLHttpRequest</code>、<code>WebSocket</code>。代码里只有一处 <code>fetch</code>，就是上面那条「手机推送」，它默认关着${pushLive ? "，而现在<b>是开着的</b>" : "，所以现在一次出网都没有"}。</li>
          ${pushLive ? `<li>· <b style="color:var(--text)">开着手机推送时出去的是什么：</b>一句「今日支出 ¥xx，已用今日预算的 80%」。不含分类、备注、任何一笔流水，也不含你的月收入。topic 相当于收件地址，知道它的人都能订阅这个频道，所以别把它当密码用。</li>` : ""}
          <li>· <b style="color:var(--text)">唯一的「自动」</b>是你自己设的周期账单，在你打开页面时按日期往本地补一条流水。</li>
          <li>· <b style="color:var(--text)">代价</b>是多设备不同步，得手动导出导入。这是刻意的取舍：把选择权留在你手里。</li>
        </ul>
      </div>

      <div class="card mt14">
        <div class="card-hd"><div class="card-title"><span class="ti">🧪</span>试用与重置</div></div>
        <div class="row wrap gap10">
          <button class="btn" data-act="loadDemo" type="button">载入 3 个月示例数据</button>
          <button class="btn danger" data-act="wipeAll" type="button">清空全部数据</button>
        </div>
        <p class="tiny muted mt10">示例数据会覆盖当前账本（会先做一次快照，删错可以马上退回来）。想认真开始的话，清空后从今天的午饭记起就行。</p>
      </div>
    </div>`;
  }

  /* ---------- 行为 ---------- */
  Act.setIncome = function (state, el) {
    const v = U.toAmount(el.value) || 0;
    Store.setSetting("monthlyIncome", v);
  };
  Act.setFirstMonth = function (state, el) {
    const v = String(el.value || "").trim();
    if (/^\d{4}-\d{2}$/.test(v)) { Store.setSetting("firstMonth", v); }
    else UI.toast("格式像 2026-11 这样");
  };
  Act.exportJson = function () {
    Store.download("慢慢记_备份_" + U.today() + ".json", Store.exportJSON(), "application/json");
    UI.toast("备份已导出，收好这个文件");
  };
  Act.exportCsv = function () {
    const rows = Store.txnRows({ allBooks: true });
    if (rows.length < 2) return UI.toast("还没有可导出的流水");
    Store.exportCSV(rows, "慢慢记_流水_" + U.today() + ".csv");
    UI.toast("导出 " + (rows.length - 1) + " 笔");
  };
  Act.pickImport = function () {
    const el = U.$("#impFile");
    if (!el) return;
    el.onchange = function () {
      const f = el.files && el.files[0];
      if (!f) return;
      const fr = new FileReader();
      fr.onload = async function () {
        let n = 0;
        try { n = Store.parseImport(String(fr.result)).txns.length; }
        catch (e) { return UI.toast("读不出来：" + e.message); }
        const ok = await UI.confirm({
          title: "导入这份备份",
          text: `文件里有 <b>${n}</b> 笔流水。<br><br>「覆盖」= 用它替掉现在的全部数据（会先存快照，可撤销）；<br>「合并」= 只把里面没有的流水和目标加进来。`,
          ok: "覆盖导入"
        });
        if (!ok) return;
        Store.importJSON(String(fr.result), "replace");
        UI.toast("导入了 " + n + " 笔", { action: "撤销", onAction: () => Store.undo() });
        App.render();
      };
      fr.readAsText(f, "utf-8");
      el.value = "";
    };
    el.click();
  };
  Act.loadDemo = async function () {
    const ok = await UI.confirm({
      title: "载入示例数据",
      text: "会用一份 3 个月的假账覆盖当前数据（包含周期账单、目标、超支）。想真用的话之后点「清空全部数据」就行。<br><br>这一步可以撤销。",
      ok: "载入看看"
    });
    if (!ok) return;
    Store.loadDemo();
    Store.setSetting("onboarded", true);
    UI.toast("示例已载入", { action: "撤销", onAction: () => Store.undo() });
    App.go("plan");
  };
  Act.wipeAll = async function () {
    const ok = await UI.confirm({
      title: "清空全部数据",
      text: "流水、目标、周期账单、预算都会删掉。<b>建议先导出 .json 备份。</b><br><br>5 秒内可以点撤销，之后就只能靠备份文件了。",
      ok: "我备份了，清空", danger: true
    });
    if (!ok) return;
    Store.wipe();
    UI.toast("已清空", { action: "撤销", onAction: () => Store.undo(), ms: 8000 });
  };

  /* ---------- 提醒：所有开关都只写状态，判断一律在 notify.js ---------- */
  function rerender() { if (w.App) App.render({ keepScroll: true }); }

  Act.setRemindersOn = function (state, el) {
    Store.setNotify({ enabled: !!el.checked });
    if (el.checked && Notify.channels.system.ready() && Notify.channels.system.permission() === "default") {
      Notify.requestPermission().then(p => {
        UI.toast(p === "granted" ? "系统通知可以用了" : "没给权限，那就只走站内横幅");
        rerender();
      });
    } else UI.toast(el.checked ? "提醒已开启" : "提醒已关闭");
    rerender();
  };
  Act.setNotifyZone = function (state, el) {
    Store.setNotify({ timezone: el.value || "" });
    UI.toast("「今天 / 本月 / 到点没有」改按 " + Notify.zone() + " 算");
    rerender();
  };
  Act.setNotifyAt = function (state, el) {
    if (!/^\d{2}:\d{2}$/.test(el.value || "")) { el.value = Store.notify.dailyAt; return UI.toast("时刻没认出来"); }
    Store.setNotify({ dailyAt: el.value });
    UI.toast("每天 " + el.value + " 之后开始提");
    rerender();
  };
  Act.setNotifyChannel = function (state, el) {
    Store.setNotifyChannel(el.dataset.ch, !!el.checked);
    if (el.checked && el.dataset.ch === "email") UI.toast("邮件通道现在是空的：没有服务端可发信");
    if (el.checked && el.dataset.ch === "phone") UI.toast("手机推送开了，但要先把下面的 topic 或密钥填上");
    rerender();
  };
  /* 推送这几个框：改一个存一个，不整屏重画 —— 否则输入到一半就被冲掉 */
  Act.setPushChannel = function (state, el) {
    Store.setNotifyPush({ channel: el.value || "" });
    if (el.value && !Store.notify.channels.phone) Store.setNotifyChannel("phone", true);
    if (el.value) UI.toast(el.value === "ntfy" ? "选的是 ntfy：填个 topic 就能推" : "选的是 Pushover：本地版常常会被浏览器拦下");
    rerender();
  };
  Act.setPushField = function (state, el) {
    const key = el.dataset.pk;
    const v = String(el.value || "").trim();
    if (key === "thresholds") Store.setBudgetPush({ thresholds: v });
    else Store.setNotifyPush({ [key]: v });
  };
  Act.setBudgetPushOn = function (state, el) {
    Store.setBudgetPush({ enabled: !!el.checked });
    UI.toast(el.checked ? "到线会推" : "日常轻提醒已关掉，别的提醒不受影响");
    rerender();
  };
  Act.testPush = async function () {
    const r = await Notify.channels.phone.send({ title: "慢慢记 · 测试", body: "看到这条，说明这台设备能推到你手机。", key: "test", userId: Notify.pushUser() });
    UI.toast(r.ok ? "已经发出去了，看手机" : "没发出去：" + r.error);
    rerender();
  };
  Act.setNotifyRule = function (state, el) {
    Store.setNotifyRule(el.dataset.rule, !!el.checked);
    rerender();
  };
  Act.askNotifyPerm = async function () {
    const p = await Notify.requestPermission();
    UI.toast(p === "granted" ? "已允许" : "结果是「" + p + "」—— 被拒过就只能去浏览器的站点设置里改");
    rerender();
  };
  Act.testNotify = async function () {
    const r = await Notify.test();
    UI.toast(r.sent.length ? "已发到：" + r.sent.join("、") : "没发出去：" + (r.failed[0] ? r.failed[0].error : "没有启用任何通道"));
    rerender();
  };
  Act.runNotifyNow = async function () {
    const r = await Notify.run({ force: true, limit: 3 });
    UI.toast(r.fired ? "这一轮 " + r.fired + " 条，发出 " + r.sent + " 条" + (r.dup ? "，重复拦下 " + r.dup + " 条" : "") + (r.deferred ? "，还有 " + r.deferred + " 条排到下一轮" : "")
      : (r.skipped === "off" ? "提醒总开关没开" : "现在没有该提的事"));
    rerender();
  };
  Act.clearNotifyLog = function () {
    Store.clearNotifyLog();
    UI.toast("日志和待重试已清空。去重记录也一起没了 —— 本周期内同一条会再提一次");
    rerender();
  };

  w.Views = w.Views || {};
  w.Views.data = { render };
})(window);
