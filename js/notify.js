/* =========================================================
   notify.js · 提醒：条件判断集中在这里，通道只认一个接口
   系统通知走设备的 Notification API；「手机推送」这条通道默认关着，
   你自己在「数据」页填了 ntfy / Pushover 才会真的出网，而且只发提醒那一句话，
   不发流水、不发分类。除此之外本文件不发任何网络请求。
   ========================================================= */
(function (w) {
  "use strict";

  const DEFAULT_ZONE = "Asia/Shanghai";   /* 相当于后端的 APP_TIMEZONE */
  const MAX_TRIES = 3;
  const RETRY_MS = 5 * 60 * 1000;
  const PREVIEW = 3;                        /* 周期账单提前几天提醒 */
  const PER_ROUND = 3;                      /* 一轮最多发几条，剩下的下一轮再说 */
  const BANNER_MAX = 3;                     /* 站内横幅最多堆几条 */
  const THRESHOLDS_DEF = [80, 100];         /* 相当于 BUDGET_ALERT_THRESHOLDS */
  const NTFY_BASE_DEF = "https://ntfy.sh";  /* 相当于 NTFY_BASE_URL */

  /* ---------- 时区：所有「今天 / 本月 / 到点没有」都按这里算 ----------
     记账日期仍按设备本地（U.today），只有提醒求值跟着配置时区走。 */
  function validZone(z) {
    if (!z) return false;
    try { new Intl.DateTimeFormat("en", { timeZone: z }); return true; }
    catch (e) { return false; }
  }
  function zone() {
    /* 优先级：index.html 里的 window.APP_TIMEZONE > 用户在「数据」页选的 > 设备时区 > 兜底 */
    const z = w.APP_TIMEZONE || Store.notify.timezone;
    if (validZone(z)) return z;
    try {
      const dev = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (validZone(dev)) return dev;
    } catch (e) { /* 老浏览器没有 Intl */ }
    return DEFAULT_ZONE;
  }

  let _fmt = null, _fmtZone = null;
  function znow(at) {
    const d = at ? new Date(at) : new Date();
    const z = zone();
    if (!_fmt || _fmtZone !== z) {
      _fmtZone = z;
      _fmt = new Intl.DateTimeFormat("en-GB", {
        timeZone: z, year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit", hour12: false
      });
    }
    const p = {};
    _fmt.formatToParts(d).forEach(x => { p[x.type] = x.value; });
    const hh = (+p.hour) % 24, mm = +p.minute;
    return {
      date: p.year + "-" + p.month + "-" + p.day,
      mk: p.year + "-" + p.month,
      hh, mm, minute: hh * 60 + mm,
      clock: U.PAD(hh) + ":" + U.PAD(mm)
    };
  }
  function toMinute(hhmm) {
    const m = /^(\d{1,2}):(\d{2})$/.test(hhmm || "") ? hhmm.match(/^(\d{1,2}):(\d{2})$/) : null;
    if (!m) return 20 * 60 + 30;
    return U.clamp(+m[1], 0, 23) * 60 + U.clamp(+m[2], 0, 59);
  }
  function zoneList() {
    const base = ["Asia/Shanghai", "Asia/Urumqi", "Asia/Tokyo", "Asia/Singapore", "Asia/Bangkok",
      "Asia/Kolkata", "Asia/Dubai", "Europe/Moscow", "Europe/Berlin", "Europe/London",
      "America/New_York", "America/Los_Angeles", "America/Sao_Paulo", "Australia/Sydney", "Pacific/Auckland"];
    const dev = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch (e) { return ""; } })();
    const all = U.dedupe((dev ? [dev] : []).concat(base)).filter(validZone);
    return all;
  }

  /* ---------- 手机推送的配置：环境变量在这一版里的等价位置 ----------
     每一项都是「数据页里填的 > index.html 里的 window.APP_CONFIG > 内置默认」，
     代码里没有任何写死的 token / topic / user key。 */
  function cfgOf(key) {
    const c = w.APP_CONFIG || {};
    const v = c[key];
    return v === undefined || v === null ? "" : String(v).trim();
  }
  function truthy(v) { return /^(1|true|on|yes)$/i.test(v); }
  function pushCfg() {
    const p = Store.notify.push || {};
    const clean = v => String(v == null ? "" : v).trim();
    /* 页面里没选就用 PUSH_CHANNEL；两边都没填 = 这条通道没配，什么也不会出网 */
    const prov = (clean(p.channel) || cfgOf("PUSH_CHANNEL")).toLowerCase();
    const out = {
      provider: prov === "pushover" ? "pushover" : prov === "ntfy" ? "ntfy" : "",
      userId: clean(p.userId),
      base: clean(p.ntfyBase) || cfgOf("NTFY_BASE_URL") || NTFY_BASE_DEF,
      topic: clean(p.ntfyTopic) || cfgOf("NTFY_TOPIC"),
      token: clean(p.poToken) || cfgOf("PUSHOVER_TOKEN"),
      userKey: clean(p.poUser) || cfgOf("PUSHOVER_USER_KEY")
    };
    out.missing = out.provider === "ntfy" && !out.topic ? "ntfy 的 topic 还没填"
      : out.provider === "pushover" && !(out.token && out.userKey) ? "Pushover 的 token 或 user key 还没填"
      : !out.provider ? "没选推送方式（ntfy / Pushover 二选一）" : "";
    out.ready = !out.missing;
    return out;
  }
  /* 后端版这里是你库里的主键；本地版没有用户表，第一次要推之前给自己发一个稳定 id 存下来，
     去重和日志都挂在它上面，除非换设备或清了浏览器数据，否则不会变。 */
  function pushUser() {
    const cur = Store.notify.push && Store.notify.push.userId;
    if (cur) return cur;
    const id = U.uid("u");
    Store.setNotifyPush({ userId: id });
    return id;
  }

  /* ---------- NotificationService.sendSystemPush(userId, title, body, priority) ----------
     所有出网都收在这一个函数里：换推送服务只动这里，规则和视图谁都不用改。
     priority 用 ntfy 的 1..5，Pushover 那边折算成 0 / 1。 */
  async function sendSystemPush(userId, title, body, priority) {
    const cfg = pushCfg();
    if (!cfg.ready) return fail("推送通道没配好：" + cfg.missing);
    if (!w.fetch) return fail("这台设备的浏览器没有 fetch，推不出去");
    const p = U.clamp(Math.round(+priority || 3), 1, 5);
    const head = title || "慢慢记";
    const text = String(body || "").slice(0, 3800);   /* ntfy 免费档单条 4096 字节，留点余量 */
    try {
      if (cfg.provider === "ntfy") {
        /* 自定义头会触发一次 OPTIONS 预检，ntfy 自己处理，浏览器直连没问题 */
        const r = await w.fetch(cfg.base.replace(/\/+$/, "") + "/" + encodeURIComponent(cfg.topic), {
          method: "POST", headers: { Title: head, Priority: String(p) }, body: text
        });
        if (!r.ok) return fail("ntfy 回了 " + r.status + (r.status === 403 ? "（这个 topic 可能被人占了，换一个）" : ""));
      } else {
        const form = new URLSearchParams({
          token: cfg.token, user: cfg.userKey, title: head, message: text, priority: p >= 4 ? "1" : "0"
        });
        const r = await w.fetch("https://api.pushover.net/1/messages.json", {
          method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: form.toString()
        });
        if (!r.ok) return fail("Pushover 回了 " + r.status);
      }
      return { ok: true, provider: cfg.provider };
    } catch (e) {
      /* Pushover 没给浏览器开 CORS，本地版这一步常常只能报这一句：请求可能已经发出去了 */
      return fail((e && e.message ? e.message : String(e)) + "（浏览器拦住了这个跨源请求，ntfy 不受这条限制）");
    }
  }

  /* ---------- 通道：统一 send(job) -> { ok, error? } ----------
     返回 Promise 也行，调用方一律 await；换成 SMTP 时只改这里。 */
  const channels = {
    system: {
      id: "system", label: "系统通知",
      hint: "走设备的通知中心，权限在浏览器站点设置里改",
      ready() { return "Notification" in w; },
      permission() { return this.ready() ? w.Notification.permission : "unsupported"; },
      ask() {
        if (!this.ready()) return Promise.resolve("unsupported");
        try { return w.Notification.requestPermission().catch(() => "denied"); }
        catch (e) { return Promise.resolve("denied"); }
      },
      send(job) {
        if (!this.ready()) return fail("这台设备没有系统通知能力");
        if (w.Notification.permission !== "granted") return fail("通知权限还没给");
        try {
          const n = new w.Notification(job.title, { body: job.body, tag: job.key });
          n.onclick = function () { try { w.focus(); } catch (e) { /* 忽略 */ } };
          return { ok: true };
        } catch (e) { return fail("系统通知被拦了：" + (e.message || e)); }
      }
    },
    phone: {
      id: "phone", label: "手机推送",
      hint: "唯一会出网的一条：按你填的 ntfy 或 Pushover 把这一句话推到手机。不开它就一条请求都不会发。",
      ready() { return pushCfg().ready; },
      send(job) { return sendSystemPush(job.userId || pushUser(), job.title, job.body, job.priority); }
    },
    inApp: {
      id: "inApp", label: "站内横幅",
      hint: "下次打开时在今天页顶部给你留几句话，不弹窗、不响",
      ready() { return true; },
      send(job) {
        const st = Store.notify.state;
        const list = (st.banners || []).filter(b => b.key !== job.key);
        list.push({ title: job.title, body: job.body, at: new Date().toISOString(), key: job.key });
        Store.setNotifyState({ banners: list.slice(-BANNER_MAX) });
        return { ok: true };
      }
    },
    email: {
      id: "email", label: "邮件",
      hint: "本地版没有发信通道：浏览器不能直连 SMTP，也不该把授权码放进浏览器。接口已按 NotificationService 的形状留好。",
      ready() { return false; },
      send() { return fail("本地版没有邮件通道（无服务端、无 SMTP）"); }
    }
  };
  function fail(error) { return { ok: false, error: String(error || "未知错误") }; }

  /* ---------- 规则：触发条件全部聚合在这里 ---------- */
  const RULES = [
    {
      key: "dailyBudget", label: "今日预算到线", period: "day", defOn: true,
      desc: "今天花掉的钱达到今日预算的 80% / 100% 时各推一次，同一天同一档不再重复",
      check(c) {
        if (!budgetOn(c)) return null;
        const jobs = [];
        thresholdList().forEach(t => {
          if (c.daySpent * 100 < c.dayBudget * t) return;
          const over = t >= 100;
          jobs.push({
            sub: t, phone: true, priority: over ? 4 : 3,
            title: over ? "今日预算超支" : "今日预算提醒",
            body: over
              ? "今日预算超支：今日支出 ¥" + U.money(c.daySpent) + "，已超过今日预算 ¥" + U.money(c.dayBudget) + "。"
              : "今日预算提醒：今日支出 ¥" + U.money(c.daySpent) + "，已用今日预算的 " + t + "%。"
          });
        });
        return jobs.length ? jobs : null;
      }
    },
    {
      key: "noRecordToday", label: "今天还没记", period: "day", defOn: true,
      desc: "每天只在设定时刻之后提一次，记了一笔就不再提",
      check(c) {
        if (!Store.s.onboarded) return null;
        if (c.recordedToday) return null;
        const s = c.s;
        return {
          title: "今天还没记一笔",
          body: "一句话就行：「午饭25」。" + (s.daysLeft > 0 && s.daily > 0
            ? "今天还能花 " + U.yuan(s.daily) + "。" : "")
        };
      }
    },
    {
      key: "lowDaily", label: "每天额度见底", period: "day", defOn: true,
      desc: "剩余天数摊下来已经不够花，或已经提前花完",
      check(c) {
        const s = c.s;
        if (s.incomeElsewhere || !(s.daysLeft > 0)) return null;
        if (s.available < 0) {
          return { title: "这个月已经提前花完了", body: "按现在记下来的账还差 " + U.yuan(-s.available) + "，多半是收入还没记进来。" };
        }
        if (!(s.daily > 0) || s.daily > 50) return null;
        return {
          title: "今天还能花的只剩 " + U.yuan(s.daily),
          body: "还剩 " + s.daysLeft + " 天，可自由支配 " + U.yuan(s.available) + "。想让它回到正常，这几天挑一笔不算必要的先别记。"
        };
      }
    },
    {
      key: "overspend", label: "某个分类超出预算", period: "day", defOn: true,
      desc: "超出预算只翻译成每天额度的变化，不打分",
      check(c) {
        return c.ov.map(o => ({
          sub: o.cat.id,
          title: o.cat.name + " 超出 " + U.yuan(o.over),
          body: o.after <= 0
            ? "摊到本月剩下 " + o.daysLeft + " 天，每天的额度已经被这 " + U.yuan(o.over) + " 吃光了。"
            : "摊到本月剩下 " + o.daysLeft + " 天，每天额度从 " + U.yuan(o.before) + " 降到 " + U.yuan(o.after) + "。"
        }));
      }
    },
    {
      key: "recSoon", label: "周期账单要扣了", period: "month", defOn: true,
      desc: "提前 " + PREVIEW + " 天说一声，钱要走之前心里有数",
      check(c) {
        return c.recs.map(r => ({
          sub: r.rec.id,
          title: r.rec.name + " " + U.niceDate(r.date) + "要扣 " + U.yuan(r.rec.amount),
          body: "还有 " + r.inDays + " 天。这个月到目前为止已经花掉 " + U.yuan(c.stat.consume) + "。"
        }));
      }
    },
    {
      key: "goalBehind", label: "目标过了期限", period: "month", defOn: true,
      desc: "只报还差多少，改期限还是改目标都由你定",
      check(c) {
        return c.gp.late.map(g => ({
          sub: g.id,
          title: "「" + g.name + "」到了期限，还差 " + U.yuan(g.left),
          body: "原定 " + U.niceDate(g.deadline) + "。已经攒到 " + U.yuan(g.saved) + " / " + U.yuan(g.target) + "，放宽期限或换个数字都行。"
        }));
      }
    },
    {
      key: "monthRollover", label: "上月结算", period: "month", defOn: true,
      desc: "跨月后第一次打开时，把上个月的算术结果告诉你",
      check(c) {
        const p = c.prev;
        if (!(p.count > 0)) return null;
        return {
          title: U.monthLabel(c.prevMk) + " 留下 " + U.yuan(p.net),
          body: "进账 " + U.yuan(p.income) + " · 消费 " + U.yuan(p.consume) + " · 结余率 " + U.pct(p.rate) + "。这个月的每天额度已经按新账重算。"
        };
      }
    }
  ];

  function ruleOn(key) {
    const r = RULES.find(x => x.key === key);
    const v = Store.notify.rules[key];
    return v === undefined ? !!(r && r.defOn) : !!v;
  }
  /* 日志里可能只有规则键（重试条目、更早写下的记录），显示时翻成中文 */
  function ruleLabel(key) {
    const r = RULES.find(x => x.key === key);
    return r ? r.label : key === "test" ? "手动测试" : key;
  }

  /* ---------- 日常轻提醒的判据都收在下面 budgetScan 那一段 ----------
     这里只留「规则开没开」这一层，阈值、预算、通道是否配好由那一层判断。 */

  /* ---------- 一次求值，所有规则共用同一份上下文 ---------- */
  function context() {
    const z = znow();
    const mk = Engine.CUR();
    const stat = Engine.monthStat(mk);
    return {
      today: z.date, mk, minute: z.minute, clock: z.clock,
      z,
      s: Engine.safeToSpend(mk),
      stat,
      daySpent: stat.dayConsume[z.date] || 0,
      dayBudget: dayBudgetOf(mk),
      prevMk: U.shiftMonth(mk, -1),
      prev: Engine.monthStat(U.shiftMonth(mk, -1)),
      gp: Engine.goalPlan(),
      ov: Engine.overspendImpact(),
      recs: Engine.recUpcoming(PREVIEW, z.date),
      recordedToday: Store.txns({ allBooks: true, from: z.date, to: z.date }).length > 0
    };
  }

  /* 返回这一轮该发的任务；视图不参与任何条件判断 */
  function evaluate(c) {
    c = c || context();
    const jobs = [];
    RULES.forEach(r => {
      if (!ruleOn(r.key)) return;
      let out;
      try { out = r.check(c); }
      catch (e) { console.error("[notify] 规则求值失败", r.key, e); return; }
      if (!out) return;
      (Array.isArray(out) ? out : [out]).forEach(j => {
        if (!j) return;
        jobs.push({
          rule: r.key, ruleLabel: r.label, period: r.period, sub: j.sub || null,
          bookId: Store.data.activeBookId,
          key: [r.key, Store.data.activeBookId, r.period === "month" ? c.mk : c.today, j.sub || ""].join("|"),
          title: j.title, body: j.body,
          /* phone=true 表示这条只走手机推送，不堆进横幅、不弹系统通知 */
          phone: !!j.phone, priority: j.priority || null
        });
      });
    });
    return jobs;
  }

  /* ---------- 发送：幂等去重 + 日志 + 有限重试 ---------- */
  function enabledChannels() {
    const ch = Store.notify.channels;
    return Object.keys(channels).filter(id => ch[id]);
  }
  /* 点名要推到手机的，就只走手机；其余的只走不碰网络的那几条。
     不然一笔记下同时弹横幅 + 系统通知 + 推送，阈值提醒就变成了打扰。 */
  function channelsFor(job) {
    return enabledChannels().filter(id => (id === "phone") === !!(job && job.phone));
  }

  async function deliver(job, tries, ids) {
    const done = [], bad = [];
    for (const id of (ids || channelsFor(job))) {
      const ch = channels[id];
      let r;
      try { r = await ch.send(job); }
      catch (e) { r = fail(e && e.message || e); }
      r = r || fail("通道没有返回");
      Store.logNotify({
        key: job.key, rule: job.rule, label: job.ruleLabel || job.label || job.rule,
        period: job.period, channel: id, title: job.title,
        ok: !!r.ok, error: r.ok ? null : r.error, tries: tries || 1
      });
      (r.ok ? done : bad).push({ channel: id, error: r.error });
    }
    return { done, bad };
  }

  function queueRetry(job, bad) {
    const list = Store.notify.pending.filter(p => p.key !== job.key);
    list.push({
      key: job.key, rule: job.rule, label: job.ruleLabel || job.rule, period: job.period, sub: job.sub, bookId: job.bookId,
      title: job.title, body: job.body, channels: bad.map(b => b.channel),
      phone: !!job.phone, priority: job.priority || null,
      tries: 1, nextAt: Date.now() + RETRY_MS, lastError: bad[0] && bad[0].error
    });
    Store.setNotifyPending(list.slice(-50));
  }

  async function fire(job) {
    if (Store.notifySent(job.key)) return { skipped: "dup", job };
    const r = await deliver(job, 1);
    if (r.bad.length) queueRetry(job, r.bad);
    return { job, sent: r.done.length, failed: r.bad.length };
  }

  async function pump() {
    const n = Store.notify;
    const now = Date.now();
    const due = n.pending.filter(p => p.nextAt <= now);
    if (!due.length) return 0;
    let handled = 0;
    for (const p of due) {
      if (Store.notifySent(p.key)) { drop(p.key); continue; }
      const tries = (+p.tries || 1) + 1;
      const r = await deliver(p, tries, p.channels && p.channels.length ? p.channels : enabledChannels());
      if (r.done.length) drop(p.key);
      else if (tries >= MAX_TRIES) {
        Store.logNotify({ key: p.key, rule: p.rule, label: p.label || p.rule, period: p.period, channel: r.bad.map(b => b.channel).join(","), title: p.title, ok: false, error: "重试 " + tries + " 次仍未送达，已放弃：" + (r.bad[0] && r.bad[0].error), tries });
        drop(p.key);
      } else {
        const list = Store.notify.pending.map(x => x.key === p.key ? Object.assign(x, { tries, nextAt: Date.now() + RETRY_MS * tries }) : x);
        Store.setNotifyPending(list);
      }
      handled++;
    }
    return handled;
  }
  function drop(key) {
    Store.setNotifyPending(Store.notify.pending.filter(p => p.key !== key));
  }

  /* ---------- 定时：状态持久化，重启后照样生效 ----------
     这里的 setInterval 只负责「页面开着时到点求值」；
     真正的判据是 notify.state.lastDay / lastMonth + 时刻比较，
     所以关掉再开、隔几天再开，都不会漏也不会重。 */
  let timer = null;

  function due(c) {
    const n = Store.notify;
    if (!n.enabled) return null;
    const afterAt = c.minute >= toMinute(n.dailyAt);
    return {
      day: afterAt && n.state.lastDay !== c.today,
      month: n.state.lastMonth !== c.mk
    };
  }

  async function run(opt) {
    opt = opt || {};
    const n = Store.notify;
    if (!n.enabled && !opt.force) return { skipped: "off" };
    const c = context();
    const d = due(c);
    const allowDay = opt.force ? true : !!(d && d.day);
    const allowMonth = opt.force ? true : !!(d && d.month);
    if (!allowDay && !allowMonth) return { skipped: "not-due" };

    let jobs = evaluate(c);
    if (!opt.force) jobs = jobs.filter(j => (j.period === "month" ? allowMonth : allowDay));
    /* 已经发过的先剔掉，否则它们会占掉这一轮的名额，剩下的永远排不上 */
    jobs = jobs.filter(j => !Store.notifySent(j.key));
    const cap = opt.limit || PER_ROUND;
    const deferred = Math.max(0, jobs.length - cap);
    jobs = jobs.slice(0, cap);

    const out = [];
    for (const j of jobs) out.push(await fire(j));

    /* 一轮没发完就先不盖章：剩下的下一轮补，去重键保证不会重发 */
    if (!opt.force && !deferred) {
      const patch = {};
      if (allowDay) patch.lastDay = c.today;
      if (allowMonth) patch.lastMonth = c.mk;
      if (Object.keys(patch).length) Store.setNotifyState(patch);
    }
    return {
      ctx: c, fired: out.length, deferred,
      sent: out.filter(x => x.sent).length,
      dup: out.filter(x => x.skipped).length
    };
  }

  /* ---------- 日常轻提醒的求值：今天到底该不该推 ----------
     今日预算 = 已设预算的分类合计 ÷ 当月天数。
     不用「还能花的每天额度」当分母：那个数会随你花钱一起变小，
     比值自己往上爬，80% 和 100% 会在同一笔账上同时成立，去重就说不清了。 */
  function dayBudgetOf(mk) {
    const total = U.sum(Store.data.cats.filter(c => c.flow === "out"), c => +Store.data.budgets[c.id] || 0);
    return total > 0 ? U.round2(total / U.daysInMonth(mk)) : 0;
  }
  function thresholdList() {
    /* 页面上填过就用页面上的，否则用配置里的 BUDGET_ALERT_THRESHOLDS，再否则 80,100 */
    const saved = (Store.notify.budgetPush || {}).thresholds;
    if (Array.isArray(saved) && saved.length) return saved;
    const raw = cfgOf("BUDGET_ALERT_THRESHOLDS") || THRESHOLDS_DEF.join(",");
    const arr = U.dedupe(String(raw).split(/[,，;；\s]+/).map(x => Math.round(+x))
      .filter(x => x >= 1 && x <= 300)).sort((a, b) => a - b);
    return arr.length ? arr : THRESHOLDS_DEF.slice();
  }
  /* 返回「为什么现在不会推」，空串 = 条件齐了。跳过是正常状态，不是错误，
     所以每种原因一天只留一条痕（见 logSkip），而且只在用户动过这条通道时才留。 */
  function budgetBlock(c) {
    if (!Store.notify.enabled) return "「开启提醒」的总开关是关的";
    if (!Store.notify.channels.phone) return "手机推送这条通道没开";
    const m = pushCfg().missing;
    if (m) return "推送通道还差参数：" + m;
    /* ENABLE_DAILY_BUDGET_PUSH 填了值才算数，填 false 是部署级的硬关 */
    const sw = cfgOf("ENABLE_DAILY_BUDGET_PUSH");
    if (sw && !truthy(sw)) return "配置里 ENABLE_DAILY_BUDGET_PUSH 是关的";
    if (!(c.dayBudget > 0)) return "还没给任何分类设月预算，没有「今日预算」可比";
    if (Store.notify.budgetPush.enabled === false) return "「花到这些线上就推」那个开关是关的";
    return "";
  }
  function budgetOn(c) {
    return ruleOn("dailyBudget") && !budgetBlock(c);
  }
  /* 跳过也要留痕，一天每种原因只留一条，不然日志会被同一句话刷满 */
  /* 只有你动过这条通道（开了手机推送、或选了推送方式）才值得记一行「为什么没推」。
     压根不打算用推送的人，日志里不该冒出这种条目 —— 跳过本来就不是错误。 */
  function wantsPush() { return !!(Store.notify.channels.phone || pushCfg().provider); }
  function logSkip(c, reason) {
    if (!wantsPush()) return;
    const key = ["dailyBudget", Store.data.activeBookId, c.today, "skip", reason].join("|");
    if (Store.notifyLogged(key)) return;
    Store.logNotify({
      key, rule: "dailyBudget", label: ruleLabel("dailyBudget"), period: "day",
      channel: "phone", ok: false, skip: reason
    });
  }
  /* 单独求值这一条规则：记完账、打开页面、想看结果的时候都走这里。
     它不动 notify.state.lastDay，也不占定时那一轮的额度 —— 两套路互不干扰。 */
  async function budgetScan() {
    const c = context();
    if (!ruleOn("dailyBudget")) return { skipped: "规则没开", ctx: c };
    const why = budgetBlock(c);
    if (why) { logSkip(c, why); return { skipped: why, ctx: c }; }
    /* 去重只看这个 key：dailyBudget|账本|日期|阈值。金额涨跌不改 key，所以当天不会推第二遍 */
    const jobs = evaluate(c).filter(j => j.rule === "dailyBudget" && !Store.notifySent(j.key));
    if (!jobs.length) return { ctx: c, fired: 0 };
    const out = [];
    for (const j of jobs) out.push(await fire(j));
    return { ctx: c, fired: out.length, sent: U.sum(out, x => x.sent || 0), failed: U.sum(out, x => x.failed || 0) };
  }
  /* 新增 / 修改 / 删除之后重新聚合：挂在 Store 的变更回调上，
     所以批量补记、撤销、周期账单自动补的那几笔不用各调一遍。
     写库那一边不等它，异常也在这儿吞掉 —— 推送再慢再坏，账已经记下了。 */
  let budgetTimer = null;
  function budgetSoon() {
    /* BUDGET_PUSH_ON_WRITE=false：只在打开页面和到点时算，记完账不算 */
    const sw = cfgOf("BUDGET_PUSH_ON_WRITE");
    if (sw && !truthy(sw)) return;
    if (budgetTimer) clearTimeout(budgetTimer);
    budgetTimer = setTimeout(() => {
      budgetTimer = null;
      budgetScan().catch(e => console.error("[notify] 预算提醒出错", e));
    }, 400);
  }
  Store.on(budgetSoon);

  async function tick() {
    try {
      await pump();
      await run();
    } catch (e) {
      /* 提醒失败不能影响记账主流程 */
      console.error("[notify] 定时求值出错", e);
    }
  }

  function start() {
    tick();
    if (timer) clearInterval(timer);
    timer = setInterval(tick, 60000);
    w.document.addEventListener("visibilitychange", function () {
      if (!w.document.hidden) tick();
    });
  }

  /* ---------- 给设置页用的只读快照 ---------- */
  function status() {
    const c = context();
    const n = Store.notify;
    const d = due(c) || { day: false, month: false };
    const th = thresholdList();
    /* pushed 走去重键、hit 走金额比较：到线但没推（通道没开、被硬关、发失败）要能看得出来 */
    const line = th.map(t => {
      const need = U.round2(c.dayBudget * t / 100);
      return { at: t, need, hit: c.daySpent >= need, pushed: Store.notifySent(["dailyBudget", Store.data.activeBookId, c.today, t].join("|")) };
    });
    return {
      ctx: c, zone: zone(), next: d,
      pending: n.pending.length,
      /* 「没推：原因」那类留痕不是失败，别把它算进失败的数字里 */
      failed24h: n.log.filter(x => !x.ok && !x.skip && Date.now() - new Date(x.at).getTime() < 86400000).length,
      permission: channels.system.permission(),
      budget: {
        on: budgetOn(c), block: ruleOn("dailyBudget") ? budgetBlock(c) : "这条规则在「提什么」里被关掉了",
        day: c.dayBudget, spent: c.daySpent, thresholds: th, line,
        cfg: pushCfg(), switchOn: n.budgetPush.enabled !== false,
        pushedToday: line.filter(x => x.pushed).length
      },
      preview: evaluate(c)
    };
  }

  async function test() {
    const job = {
      rule: "test", ruleLabel: "手动测试", period: "once", sub: String(Date.now()),
      bookId: Store.data.activeBookId,
      key: "test|" + Store.data.activeBookId + "|" + Date.now(),
      title: "这是一条测试提醒",
      body: "能看到这条，说明通道是通的。真正的提醒只在「" + Store.notify.dailyAt + "」之后发。"
    };
    /* 测试按「开了哪几条」全走一遍，包括手机推送 —— 不然验不出 topic 填错这种事 */
    const r = await deliver(job, 1, enabledChannels());
    return { sent: r.done.map(x => x.channel), failed: r.bad };
  }

  w.Notify = {
    DEFAULT_ZONE, MAX_TRIES, PREVIEW, THRESHOLDS_DEF, RULES, channels,
    zone, znow, zoneList, toMinute,
    context, evaluate, ruleOn, ruleLabel, enabledChannels, channelsFor,
    pushCfg, pushUser, sendSystemPush, dayBudgetOf, thresholdList, budgetOn, budgetBlock,
    fire, pump, run, tick, start, status, test, budgetScan,
    requestPermission: () => channels.system.ask(),
    dismissBanner() { Store.setNotifyState({ banners: [] }); }
  };
})(window);
