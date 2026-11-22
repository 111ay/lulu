/* =========================================================
   view-plan.js · 行动方案：把账本翻译成每月/每天的动作
   只输出算术结论，不出现任何产品、任何外链。
   ========================================================= */
(function (w) {
  "use strict";
  const Act = (w.Act = w.Act || {});
  const Y = v => U.yuan(v);

  function wfRow(op, k, v, note, cls) {
    return `<div class="wf-row ${cls || ""}">
      <div class="wf-k"><span class="op">${op}</span>${k}</div>
      <div class="wf-v">${v}</div>
      ${note ? `<div class="wf-note">${note}</div>` : ""}
    </div>`;
  }

  function waterfall(s) {
    if (s.incomeElsewhere) {
      return `<div class="empty"><span class="em">🧭</span>
        <p>这个账本本月没有进账，进账记在「${U.esc(s.incomeBookName)}」。<br>
        把全局的月收入、预算、目标套到它头上，只会算出一个好看的假额度 —— 所以这里不算。</p>
        <div class="row mt14" style="gap:8px;max-width:320px;margin-inline:auto">
          <button class="btn primary" data-act="goIncomeBook" data-id="${U.esc(s.incomeBookId)}" type="button">去「${U.esc(s.incomeBookName)}」看</button>
        </div></div>`;
    }
    if (s.noIncome) {
      return `<div class="empty"><span class="em">🧮</span>
        <p>还没告诉我你的月收入，这条推导链起不来。<br>填一个大概的数就行，随时可以改。</p>
        <div class="row mt14" style="gap:8px;max-width:270px;margin-inline:auto">
          <div class="input-money grow"><input class="input" type="text" inputmode="decimal" id="incQuick" placeholder="12000"></div>
          <button class="btn primary" data-act="saveIncomeQuick" type="button">保存</button>
        </div></div>`;
    }
    const st = s.stat;

    const tail = s.daysLeft > 0
      ? `<div class="wf-row result">
           <div class="wf-k"><span class="op">÷</span>本月还剩 ${s.daysLeft} 天</div>
           <div class="wf-v">${s.available < 0 ? "¥0" : "¥" + U.money(s.daily)} / 天</div>
           <div class="wf-note">${s.available < 0
            ? "先别急着记新的支出，把漏记的收入补进来再看这个数"
            : "这个数每天自己动：花多了它降，记上一笔收入它升。它就是你这几天唯一的行动指令。"}</div>
         </div>`
      : `<div class="wf-row result">
           <div class="wf-k"><span class="op">✓</span>这个月已经过完</div>
           <div class="wf-v">${Y(st.net)}</div>
           <div class="wf-note">本月最终留下的钱</div>
         </div>`;

    return `<div class="wf">
      ${wfRow("≡", "本月进账", Y(s.income), `${s.incPlan >= s.stat.income ? "按你设定的月收入 " + Y(s.incPlan) : "按已记入收入 " + Y(s.stat.income)}，取较大的那个`, "plus")}
      ${wfRow("−", "本月已经花掉", Y(s.consume), `刚性 ${Y(s.stat.byTag.fixed)} · 必要 ${Y(s.stat.byTag.need)} · 想要 ${Y(s.stat.byTag.want)}`, "minus")}
      ${wfRow("−", "已经存下 / 还掉", Y(s.moved), "记在「储蓄」「还款」这类转移性质下的钱 —— 不是花掉了，但确实从可花的钱里拿走了", "minus")}
      ${wfRow("−", "刚性支出还没付", Y(s.fixedLeft), s.fixedLeft > 0 ? s.fixedRows.filter(r => r.left > 0).map(r => `${r.cat.emoji} ${r.cat.name} ${Y(r.left)}`).join(" · ")
        : (s.noBudgets ? "没设任何预算，这一格只能按已记入的算 —— 建议去下面给房租这类设上限" : "这个月的刚性支出已经付清了"), "minus")}
      ${wfRow("−", "目标还差的储蓄", Y(s.goalLeft), s.goalNeed > 0
        ? `目标合计每月要存 ${Y(s.goalNeed)}${s.moved > 0 ? `，本月已转入 ${Y(s.moved)}，还差这些` : ""}`
        : "还没设储蓄目标 —— 存钱这件事不会自己发生", "minus")}
      ${wfRow("=", "还能自由支配", Y(s.available), s.available < 0
        ? "负数说明这个月已经提前花完了，通常是有收入没记进来"
        : "从现在到月底，你还能动用的全部", "eq")}
      ${tail}
    </div>`;
  }

  function goalsHtml(gp) {
    if (!gp.rows.length) {
      return `<div class="empty"><span class="em">🎯</span>
        <p>还没有目标。<br>「换台电脑」「春天去一趟云南」这种具体的事，比「我要存钱」有用得多。</p></div>`;
    }
    return `<ul class="list">` + gp.rows.map(g => {
      const share = g.target > 0 ? U.clamp(g.saved / g.target * 100, 0, 100) : 0;
      const tone = g.done ? "g" : g.late ? "r" : g.perMonth > 2000 ? "w" : "b";
      const when = g.done ? "已经攒够啦"
        : g.late ? `原定 ${U.niceDate(g.deadline)}，晚了 ${U.diffDays(g.deadline, U.today())} 天`
          : `还有 ${g.months} 个月`;
      return `<li style="align-items:flex-start;flex-wrap:wrap">
        <span class="ico-box">${g.done ? "🎉" : "🎯"}</span>
        <span class="li-main">
          <span class="li-t">${U.esc(g.name)}</span>
          <span class="li-s">还差 ${Y(g.left)} · ${when}</span>
          <span class="bar thin mt6"><i class="${g.done ? "" : "cool"}" style="width:${share.toFixed(1)}%"></i></span>
        </span>
        <span style="text-align:right;flex:0 0 auto">
          <span class="pill ${tone}">${g.done ? "已完成" : "每月 " + Y(g.perMonth)}</span>
          <span class="li-s" style="display:block">${U.money(g.saved)} / ${U.money(g.target)}</span>
        </span>
        <span class="li-side">
          <button class="mini-x" data-act="goalContribute" data-id="${g.id}" title="存一笔" type="button">＋</button>
          <button class="mini-x" data-act="editGoal" data-id="${g.id}" title="改" type="button">✎</button>
          <button class="mini-x" data-act="delGoal" data-id="${g.id}" title="删" type="button">×</button>
        </span>
      </li>`;
    }).join("") + `</ul>`;
  }

  function emergencyHtml(e) {
    return `<div class="grid two">
      <div>
        <div class="row between">
          <div><div class="stat-l">已经攒到</div><div class="bignum"><span class="cur">¥</span>${U.money(e.current)}</div></div>
          <div style="text-align:right"><div class="stat-l">目标</div><div class="bignum" style="font-size:22px;color:var(--text-2)">¥${U.money(e.target)}</div></div>
        </div>
        <div class="bar mt10"><i style="width:${e.share.toFixed(1)}%"></i></div>
        <p class="tiny muted mt10">你的必要支出（刚性 + 必要）月均 <b>${Y(e.essentialMonthly)}</b> × ${e.months} 个月 = ${Y(e.target)}。
        ${e.monthsToGo ? `按目前每月转入 ${Y(e.perMonth)} 的速度，大约还要 <b>${e.monthsToGo} 个月</b>。` : "先记几个月，我才能算出速度。"}
        ${e.gap > 0 ? "还差 " + Y(e.gap) + "。" : "已经达标，这笔钱别再动它。"}</p>
      </div>
      <div class="stack g10">
        <div class="field"><div class="label">想留几个月的必要支出</div>
          <div class="row"><input class="input" type="number" min="1" max="24" data-act-change="setEmergencyMonths" value="${e.months}"><span class="tiny muted">个月</span></div></div>
        <div class="field"><div class="label">开始记账之前已经有的存款（可选）</div>
          <div class="input-money"><input class="input" type="text" inputmode="decimal" data-act-change="setEmergencyStart" value="${U.esc(U.money(Store.s.emergencyStart || 0))}"></div></div>
        <p class="micro">「已经攒到」= 上面这个起始数 + 你记进「储蓄 / 还款」分类的全部金额。它只是你手上的一个刻度，不是资产证明。</p>
      </div>
    </div>`;
  }

  function overspendHtml() {
    const ov = Engine.overspendImpact();
    if (!ov.length) {
      return `<div class="callout soft-g"><span class="ci">🟢</span>
        <div>目前没有超出预算的分类。要么你的预算和实际花销对得上，要么 —— 还没设预算。</div></div>`;
    }
    return `<ul class="list">` + ov.map(o => `<li>
        <span class="ico-box" style="background:var(--warm-soft)">!</span>
        <span class="li-main">
          <span class="li-t">${o.cat.emoji} ${U.esc(o.cat.name)} 超出 ${Y(o.over)}</span>
          <span class="li-s">分摊到本月剩下的 ${o.daysLeft} 天</span>
        </span>
        <span class="li-a" style="color:var(--neg)">¥${U.money(o.before)} → ¥${U.money(Math.max(0, o.after))}</span>
        <span class="li-side"><button class="mini-x" data-act="editCat" data-id="${o.cat.id}" title="调整这个分类" type="button">✎</button></span>
      </li>`).join("") + `</ul>
      <p class="tiny muted mt10">超出预算不是错，是预算设得不像真的。按你过去三个月的均值改一下，这个数才可用的下去。</p>`;
  }

  function budgetHtml() {
    const cats = Store.data.cats.filter(c => c.flow === "out" && c.tag !== "move");
    const st = Engine.monthStat(Engine.CUR());
    if (!cats.length) return `<div class="empty"><p>没有可设预算的分类。</p></div>`;
    return `<div class="stack" style="gap:14px">` + cats.map(c => {
      const spent = U.round2(st.byCat[c.id] || 0);
      const b = +Store.data.budgets[c.id] || 0;
      const avg = Engine.avgOf(Engine.monthsBack(3, U.shiftMonth(Engine.CUR(), -1)), m => Engine.monthStat(m).byCat[c.id] || 0);
      const share = b > 0 ? U.clamp(spent / b * 100, 0, 100) : 0;
      return `<div class="row" style="gap:12px;align-items:flex-start">
        <span class="ico-box" style="width:32px;height:32px;border-radius:10px;font-size:15px">${c.emoji}</span>
        <div class="grow stack" style="gap:5px;min-width:0">
          <div class="row between"><span class="li-t">${U.esc(c.name)}</span>
            <span class="micro">${Store.TAG_META[c.tag].label}${avg > 0 ? " · 三月均值 ¥" + U.money(avg) : ""}</span></div>
          ${b > 0 ? `<span class="bar thin"><i class="${spent > b ? "rose" : ""}" style="width:${share}%"></i></span>` : ""}
          <span class="micro">${b > 0 ? "已用 ¥" + U.money(spent) + " / " + U.money(b) + (spent > b ? " · 超 ¥" + U.money(spent - b) : "") : "未设预算"}</span>
        </div>
        <div class="input-money" style="width:100px;flex:0 0 auto">
          <input class="input sm" type="text" inputmode="decimal" data-act-change="setBudget" data-cat="${c.id}" value="${b ? U.money(b) : ""}" placeholder="—">
        </div>
        ${avg > 0 && Math.abs(avg - b) > 1 ? `<button class="btn xs" data-act="useAvg" data-cat="${c.id}" data-v="${avg}" type="button" title="用过去三个月的均值">用 ${U.money(avg)}</button>` : ""}
      </div>`;
    }).join("") + `</div>`;
  }

  function forecastHtml(f) {
    if (f.months < 1) {
      return `<div class="empty"><span class="em">🕒</span><p>至少要有一个完整月的记录，这里才有东西可推。</p></div>`;
    }
    return `<div class="stat-grid">
        <div class="stat"><div class="stat-l">月均结余</div><div class="v ${f.netAvg >= 0 ? "pos" : "neg"}">${f.netAvg >= 0 ? "¥" : "−¥"}${U.money(Math.abs(f.netAvg))}</div></div>
        <div class="stat"><div class="stat-l">月均消费</div><div class="v">¥${U.money(f.consumeAvg)}</div></div>
        <div class="stat"><div class="stat-l">结余率</div><div class="v">${U.pct(f.rateAvg)}</div></div>
        <div class="stat"><div class="stat-l">6 个月后</div><div class="v ${f.half >= 0 ? "pos" : "neg"}">${f.half >= 0 ? "+" : "−"}${Y(Math.abs(f.half))}</div></div>
      </div>
      <p class="tiny muted mt10">取最近 ${f.months} 个有记录月份的算术平均 × 6。它不含加薪，不含意外支出，也不含任何收益 —— 因为这里没有收益，只有你自己的钱。</p>`;
  }

  function render() {
    const s = Engine.safeToSpend(Engine.CUR());
    const gp = Engine.goalPlan();
    const e = Engine.emergency();
    const f = Engine.forecast();

    return `<div class="view">
      <div class="sec-hd">
        <div><div class="sec-title">行动方案</div>
          <div class="sec-sub">下面每一个结论都能展开成一条你可以自己核对的算式。</div></div>
        <button class="btn sm" data-act="addGoal" type="button">＋ 新目标</button>
      </div>

      <div class="card">
        <div class="card-hd">
          <div class="card-title"><span class="ti">🧮</span>「今天可以花多少」是怎么算出来的</div>
          <span class="pill g">本月还剩 ${s.daysLeft} 天</span>
        </div>
        ${waterfall(s)}
      </div>

      <div class="grid two mt14">
        <div class="card">
          <div class="card-hd"><div class="card-title"><span class="ti">🎯</span>储蓄目标 → 每月要存多少</div>
            ${gp.rows.length ? `<button class="link-btn" data-act="addGoal" type="button">＋</button>` : ""}</div>
          ${goalsHtml(gp)}
          ${gp.rows.length ? `<div class="callout mt14"><span class="ci">📌</span><div>这些目标加起来，每月要从你手里拿走 <b>${Y(gp.need)}</b>。${gp.need > 0 && s.income > 0 && gp.need > s.income * 0.35
            ? "这已经超过月收入的 35% —— 要么放宽期限，要么先只留一个。数字对不齐时，改目标比改生活容易。"
            : "这个数已经扣进上面那条推导里了，不用你再操心一遍。"}</div></div>` : ""}
        </div>
        <div class="card">
          <div class="card-hd"><div class="card-title"><span class="ti">🛟</span>应急金进度</div></div>
          ${emergencyHtml(e)}
        </div>
      </div>

      <div class="card mt14">
        <div class="card-hd"><div class="card-title"><span class="ti">⚖️</span>超支不是罚单，是每天额度的变化</div></div>
        ${overspendHtml()}
      </div>

      <div class="card mt14">
        <div class="card-hd"><div class="card-title"><span class="ti">📐</span>给分类设个上限</div><span class="card-note">留空 = 不设限</span></div>
        ${budgetHtml()}
      </div>

      <div class="card mt14">
        <div class="card-hd"><div class="card-title"><span class="ti">🔭</span>照这个节奏，半年后</div></div>
        ${forecastHtml(f)}
      </div>

      <div class="privacy-band">
        <span>🚫 无广告</span><span>🚫 不推荐任何金融产品</span><span>🚫 无外链带货</span>
        <span>🧮 结论都能还原成算式</span><span>🔒 数据不出这台设备</span>
      </div>
    </div>`;
  }

  /* ---------- 行为 ---------- */
  Act.addGoal = function () { UI.goalForm(null); };
  Act.editGoal = function (st, el) {
    const g = Store.data.goals.find(x => x.id === el.dataset.id);
    if (g) UI.goalForm(g);
  };
  Act.delGoal = async function (st, el) {
    const g = Store.data.goals.find(x => x.id === el.dataset.id);
    if (!g) return;
    const ok = await UI.confirm({ title: "删除目标", text: `「${U.esc(g.name)}」会被删掉，已经记进账本的转账不动。`, ok: "删除", danger: true });
    if (ok) Store.removeGoal(g.id);
  };
  Act.goalContribute = function (st, el) {
    const g = Store.data.goals.find(x => x.id === el.dataset.id);
    if (!g) return;
    UI.form({
      title: `往「${g.name}」存一笔`, ok: "存进去",
      values: { amount: g.perMonth || "", date: U.today() },
      fields: [
        { name: "amount", label: "金额", type: "money", required: true },
        { name: "date", label: "日期", type: "date" },
        { type: "note", name: "_n", ico: "🐷", text: "这个动作会同时在账本里记一笔「储蓄」，性质是转移 —— 它不算你花掉了，但确实从可花的钱里拿走了。" }
      ],
      validate: x => (x.amount > 0 ? null : "填个大于 0 的数")
    }).then(v => {
      if (!v) return;
      Store.contributeGoal(g.id, v.amount, v.date);
      UI.toast(`存了 ${U.yuan(v.amount)} 到「${g.name}」`, { action: "撤销", onAction: () => Store.undo() });
    });
  };
  Act.setEmergencyMonths = function (st, el) {
    Store.setSetting("emergencyMonths", U.clamp(parseInt(el.value, 10) || 6, 1, 24));
  };
  Act.setEmergencyStart = function (st, el) {
    Store.setSetting("emergencyStart", U.toAmount(el.value) || 0);
  };
  Act.setBudget = function (st, el) {
    const v = U.toAmount(el.value);
    Store.setBudget(el.dataset.cat, isFinite(v) ? v : 0);
  };
  Act.useAvg = function (st, el) {
    Store.setBudget(el.dataset.cat, +el.dataset.v);
    UI.toast("预算改成 " + U.yuan(+el.dataset.v));
  };
  Act.editCat = function (st, el) {
    const c = Store.catById(el.dataset.id);
    if (c) UI.catForm(c);
  };

  w.Views = w.Views || {};
  w.Views.plan = { render };
})(window);
