/* =========================================================
   parse.js · 一句话记账解析器
   目标：把「午饭25」「打车 38 昨天」「+8000 工资 11/1」这类
   自然输入直接变成结构化流水，把录入成本压到 3 秒内。
   ========================================================= */
(function (w) {
  "use strict";

  const INCOME_WORDS = ["工资", "薪水", "月薪", "发薪", "工资入账", "兼职", "外快", "报销", "退款", "返现",
    "收到", "入账", "红包", "奖金", "绩效", "年终奖", "利息", "分红", "卖", "中奖", "退税"];

  /* 关键词 -> 分类名（分类改名后仍能命中） */
  const KEYWORD_TO_CAT = {
    "午饭": "餐饮", "晚餐": "餐饮", "早饭": "餐饮", "早餐": "餐饮", "外卖": "餐饮", "吃饭": "餐饮",
    "食堂": "餐饮", "餐厅": "餐饮", "咖啡": "餐饮", "奶茶": "餐饮", "水果": "餐饮", "零食": "餐饮",
    "地铁": "交通", "公交": "交通", "打车": "交通", "滴滴": "交通", "出租": "交通", "加油": "交通",
    "停车": "交通", "高铁": "交通", "火车": "交通", "机票": "交通", "单车": "交通", "油费": "交通",
    "房租": "居住", "租房": "居住", "物业": "居住", "水费": "居住", "电费": "居住", "燃气": "居住",
    "宽带": "居住", "房贷": "居住",
    "话费": "通讯", "流量": "通讯", "手机": "通讯",
    "会员": "订阅", "订阅": "订阅", "视频会员": "订阅", "音乐": "订阅", "iCloud": "订阅", "chatgpt": "订阅",
    "电影": "娱乐", "游戏": "娱乐", "ktv": "娱乐", "演出": "娱乐", "门票": "娱乐", "按摩": "娱乐",
    "卫生纸": "日用", "洗发水": "日用", "牙膏": "日用", "超市": "日用", "便利店": "日用", "买菜": "日用",
    "药": "医疗", "医院": "医疗", "门诊": "医疗", "牙": "医疗", "体检": "医疗",
    "书": "学习", "课程": "学习", "网课": "学习", "考试": "学习", "培训": "学习",
    "礼物": "人情", "随礼": "人情", "请客": "人情", "红包给出": "人情",
    "衣服": "服饰", "鞋": "服饰", "化妆": "服饰", "护肤": "服饰", "理发": "服饰",
    "猫": "宠物", "狗": "宠物", "宠物": "宠物",
    "储蓄": "储蓄", "定存": "储蓄", "转入": "储蓄", "还信用卡": "还款", "信用卡": "还款", "还款": "还款", "花呗": "还款", "借呗": "还款"
  };

  const WD_MAP = { "一": 1, "二": 2, "三": 3, "四": 4, "五": 5, "六": 6, "日": 0, "天": 0, "1": 1, "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 0, "0": 0 };

  /* ---------- 日期抽取 ---------- */
  function pullDate(s) {
    const t = U.today();
    let date = null, hit = null;

    let m = s.match(/(20\d{2}|\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})/);
    if (m) { date = m[1] + "-" + U.PAD(+m[2]) + "-" + U.PAD(+m[3]); hit = m[0]; }

    if (!date) {
      m = s.match(/(\d{1,2})\s*月\s*(\d{1,2})\s*[日号]?/);
      if (m && +m[1] <= 12 && +m[2] <= 31) {
        let y = new Date().getFullYear();
        const cand = y + "-" + U.PAD(+m[1]) + "-" + U.PAD(+m[2]);
        /* 若该日期已晚于今天两个月以上，多半是去年的 */
        if (U.diffDays(t, cand) > 60) y -= 1;
        date = y + "-" + U.PAD(+m[1]) + "-" + U.PAD(+m[2]);
        hit = m[0];
      }
    }
    if (!date) {
      m = s.match(/(^|[^\d.])(\d{1,2})\s*[-\/]\s*(\d{1,2})(?![\d])/);
      if (m && +m[2] <= 12 && +m[3] <= 31) {
        let y = new Date().getFullYear();
        const cand = y + "-" + U.PAD(+m[2]) + "-" + U.PAD(+m[3]);
        if (U.diffDays(t, cand) > 60) y -= 1;
        date = y + "-" + U.PAD(+m[2]) + "-" + U.PAD(+m[3]);
        hit = m[0];
      }
    }
    if (!date) {
      const words = [
        [/大前天/, -3], [/前天/, -2], [/昨天|昨日/, -1], [/今天|今日/, 0], [/明天|明日/, 1]
      ];
      for (const pair of words) {
        m = s.match(pair[0]);
        if (m) { date = U.addDays(t, pair[1]); hit = m[0]; break; }
      }
    }
    if (!date) {
      m = s.match(/(\d+)\s*天(?:前|之前|以前)/);
      if (m) { date = U.addDays(t, -Math.min(3650, +m[1])); hit = m[0]; }
    }
    if (!date) {
      m = s.match(/(上上|上|本|这)?\s*(?:周|星期|礼拜)([一二三四五六日天0-7])/);
      if (m) {
        const w2 = WD_MAP[m[2]];
        if (w2 != null) {
          const back = { "上上": -14, "上": -7, "本": 0, "这": 0, undefined: 0 }[m[1]];
          const cur = U.fromYmd(t).getDay();
          const delta = (cur - w2 + 7) % 7;
          date = U.addDays(t, -delta + (back || 0));
          hit = m[0];
        }
      }
    }
    return { date, hit };
  }

  /* ---------- 分类匹配 ---------- */
  function matchCat(text, cats) {
    const low = text.toLowerCase();
    let best = null;
    for (const c of cats) {
      const names = [c.name].concat(c.alias || []);
      for (const n of names) {
        if (!n) continue;
        const idx = low.indexOf(String(n).toLowerCase());
        if (idx >= 0 && (!best || String(n).length > best.len)) best = { cat: c, len: String(n).length, matched: n };
      }
    }
    if (best) return { cat: best.cat, matched: best.matched, via: "name" };

    for (const k in KEYWORD_TO_CAT) {
      if (low.indexOf(k.toLowerCase()) >= 0) {
        const c = cats.find(x => x.name === KEYWORD_TO_CAT[k]);
        if (c) return { cat: c, matched: k, via: "keyword" };
      }
    }
    return null;
  }

  /* ---------- 主解析：一行 -> 一条草稿 ---------- */
  function line(raw, cats, defaultFlow) {
    let s = String(raw || "").trim();
    if (!s) return null;
    if (!cats) cats = [];

    const d = pullDate(s);
    if (d.hit) s = (s.slice(0, s.indexOf(d.hit)) + " " + s.slice(s.indexOf(d.hit) + d.hit.length));

    /* 带符号金额优先（+8000 / -35） */
    let flow = defaultFlow || "out";
    let amount = NaN, amountHit = null, signSeen = null;
    let m = s.match(/([+-])\s*(\d+(?:\.\d{1,2})?)\s*(k|w|万|千)?/i);
    if (m) {
      signSeen = m[1];
      amount = U.toAmount(m[2] + (m[3] || ""));
      amountHit = m[0];
    } else {
      m = s.match(/(\d+(?:\.\d{1,2})?)\s*(k|w|万|千)?\s*(?:元|块|r|￥|¥)?/i);
      if (m) { amount = U.toAmount(m[1] + (m[2] || "")); amountHit = m[0]; }
    }
    if (!isFinite(amount) || amount <= 0) {
      /* 只有中文数字或漏了金额 */
      const cn = s.match(/^(?:花|买|付|用了|支出|收入)?\s*([一二两三四五六七八九十百千万零]+)\s*[元块]?/);
      if (cn) amount = NaN;
    }

    const hit = matchCat(s, cats);

    /* 收入判定 */
    let incomeByWord = false;
    const low = s.toLowerCase();
    for (const k of INCOME_WORDS) if (low.indexOf(k) >= 0) { incomeByWord = true; break; }
    if (signSeen === "+") flow = "in";
    else if (signSeen === "-") flow = "out";
    else if (hit && hit.cat.flow) flow = hit.cat.flow;
    else if (incomeByWord) flow = "in";

    if (hit && hit.cat.flow && hit.cat.flow !== flow && !signSeen) flow = hit.cat.flow;

    /* 备注 = 原文去掉金额、日期、分类词 */
    let note = s;
    if (amountHit) note = note.replace(amountHit, " ");
    note = note.replace(/[，,、;；.。]/g, " ").replace(/\s+/g, " ").trim();
    if (hit && hit.via === "name") note = note.replace(new RegExp(String(hit.matched).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"), " ").replace(/\s+/g, " ").trim();
    note = note.replace(/^(?:花|买|付了|付|用了|给|收入)\s*/, "").trim();

    const sure = !!(hit && amount > 0);
    return {
      flow,
      amount: isFinite(amount) ? U.round2(amount) : null,
      needAmount: !(amount > 0),
      catId: hit ? hit.cat.id : null,
      catName: hit ? hit.cat.name : "待分类",
      catEmoji: hit ? hit.cat.emoji : "❔",
      catVia: hit ? hit.via : null,
      date: d.date || U.today(),
      note: note,
      raw: String(raw || "").trim(),
      sure
    };
  }

  /* ---------- 多笔：换行 / 分号，或整串都是「东西+钱」时用逗号拆 ---------- */
  function multi(text, cats) {
    let parts = String(text || "").split(/[\n；;]+/).map(x => x.trim()).filter(Boolean);
    if (parts.length === 1) {
      const sub = parts[0].split(/[，,]+/).map(x => x.trim()).filter(Boolean);
      if (sub.length > 1 && sub.every(x => /\d/.test(x))) parts = sub;
    }
    return parts.map(p => line(p, cats)).filter(Boolean);
  }

  w.Parse = { line, multi, matchCat, INCOME_WORDS, KEYWORD_TO_CAT };
})(window);
