
"use strict";
/* ============================================================
   全局状态与工具
   ============================================================ */
var TYPES = [
  {id:"reading",   name:"阅读理解", icon:"📖"},
  {id:"cloze",     name:"完形填空", icon:"✏️"},
  {id:"newtype",   name:"新题型",   icon:"🧩"},
  {id:"translate", name:"翻译",     icon:"🔁"},
  {id:"writing",   name:"写作",     icon:"✍️"}
];
var EXAM_TARGET = new Date(2027, 11, 18, 8, 30, 0); // 2027考研：12月18日

function $(id){ return document.getElementById(id); }
function esc(s){
  return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
}
/** 将 **word** 渲染为核心词高亮 */
function fmt(s){
  return esc(s).replace(/\*\*(.+?)\*\*/g, function(_,word){
    return /^[a-zA-Z][a-zA-Z &;#0-9'’.-]*$/.test(word)
      ? '<span class="kw" role="button" tabindex="0" data-lookup="' + word + '" title="查看本句词义">' + word + '</span>'
      : '<span class="kw">' + word + '</span>';
  });
}
function store(key, val){
  try{
    if(val === undefined) { var v = localStorage.getItem(key); return v ? JSON.parse(v) : null; }
    localStorage.setItem(key, JSON.stringify(val));
    return val;
  }catch(e){
    console.warn("localStorage 不可用", e);
    if(val !== undefined) toast("⚠️ 数据保存失败（浏览器存储不可用）");
    return null;
  }
}
function todayStr(d){
  d = d || new Date();
  return d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,"0") + "-" + String(d.getDate()).padStart(2,"0");
}
function toast(msg){
  var t = $("toast"); t.textContent = msg; t.classList.add("show");
  clearTimeout(t._timer); t._timer = setTimeout(function(){ t.classList.remove("show"); }, 1800);
}

/* ============================================================
   数据装配：把 EXAM_DATA_PARTS 按 年份→题型 组织
   每个部分 = { year, type, data }，data 结构见各模块渲染函数
   ============================================================ */
var DB = {};       // DB[year][type] = data
var YEARS = [];    // 已收录年份（降序）
(function assemble(){
  Object.keys(SITE_MANIFEST.years).forEach(function(y){
    DB[y] = {};
    SITE_MANIFEST.years[y].forEach(function(type){ DB[y][type] = true; });
  });
  YEARS = Object.keys(DB).map(Number).sort(function(a,b){return b-a;});
})();

/* ============================================================
   倒计时（每秒刷新，导航栏 + 首页两处显示）
   ============================================================ */
function tickCountdown(){
  var diff = Math.max(0, EXAM_TARGET - Date.now());
  var d = Math.floor(diff/864e5), h = Math.floor(diff%864e5/36e5),
      m = Math.floor(diff%36e5/6e4), s = Math.floor(diff%6e4/1e3);
  var txt = d + " 天 " + h + " 时 " + m + " 分 " + s + " 秒";
  var a = $("cd-text"), b = $("cd-text-big");
  if(a) a.textContent = txt;
  if(b) b.textContent = "⏳ 距离 2027 考研还有 " + txt;
}
setInterval(tickCountdown, 1000); tickCountdown();

/* ============================================================
   主题 / 字体 / 翻译显示 —— 均持久化
   ============================================================ */
function applyTheme(t){
  document.documentElement.setAttribute("data-theme", t);
  $("theme-btn").textContent = t === "dark" ? "☀️" : "🌙";
  store("ky_theme", t);
}
function toggleTheme(){ applyTheme(document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark"); }
function changeFont(dir){
  var size = Math.min(22, Math.max(13, (parseInt(localStorage.getItem("ky_font")) || 16) + dir));
  localStorage.setItem("ky_font", size);
  document.documentElement.style.fontSize = size + "px";
}
function toggleZh(){
  document.body.classList.toggle("zh-hidden");
  var hidden = document.body.classList.contains("zh-hidden");
  store("ky_zh_hidden", hidden);
  $("zh-toggle").classList.toggle("on", hidden);
}

/* ============================================================
   收藏系统：ky_favs = ["2025:reading", ...]
   ============================================================ */
function favKey(){ return "ky_favs"; }
function getFavs(){ return store(favKey()) || []; }
function isFav(year, type){ return getFavs().indexOf(year + ":" + type) >= 0; }
function toggleFav(year, type){
  var favs = getFavs(), k = year + ":" + type, i = favs.indexOf(k);
  if(i >= 0){ favs.splice(i,1); toast("已取消收藏"); } else { favs.push(k); toast("已收藏 ⭐"); }
  store(favKey(), favs); renderFavs();
  // 同步内容页星标与收藏按钮状态
  document.querySelectorAll('[data-fav="' + k + '"],[data-fav2="' + k + '"]').forEach(function(el){
    if(el.id === "paper-fav") el.textContent = isFav(year, type) ? "★ 已收藏" : "☆ 收藏本题";
    el.classList.toggle("on", isFav(year, type));
    if(el.classList.contains("fav-star")) el.textContent = isFav(year, type) ? "★" : "☆";
  });
}
function renderFavs(){
  var box = $("fav-list"), favs = getFavs();
  if(!favs.length){ box.innerHTML = '<div class="empty-tip" style="padding:12px 0;font-size:.8rem">暂无收藏</div>'; return; }
  box.innerHTML = "";
  favs.forEach(function(k){
    var parts = k.split(":"), year = parts[0], type = parts[1];
    var t = TYPES.filter(function(t){ return t.id === type; })[0];
    if(!t) return; // 过滤无效收藏项
    var tName = t.name;
    var div = document.createElement("div");
    div.className = "fav-item";
    div.innerHTML = '<span>' + esc(year) + ' ' + esc(tName) + '</span><span class="del" title="删除">✕</span>';
    div.querySelector("span").onclick = function(){ openPaper(year, type); };
    div.querySelector(".del").onclick = function(e){ e.stopPropagation(); toggleFav(year, type); };
    box.appendChild(div);
  });
}

/* ============================================================
   每日任务系统
   规则：阅读1 + 完形1 + 新题型1 + 翻译1 + 写作1
   按日期确定性分配：seed = 日期天数 → 依次从收录年份中取模，
   保证同一天所有人看到同一套任务，且每天不同。
   ============================================================ */
function dailyPlan(){
  var now = new Date();
  var day = Math.floor(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / 864e5);
  return TYPES.map(function(t, i){
    // 只从收录了该题型的年份中轮换，避免分配到"暂无数据"的任务
    var pool = YEARS.filter(function(y){ return DB[y] && DB[y][t.id]; });
    var year = pool.length ? pool[(day + i * 3) % pool.length] : null;
    return { type: t.id, name: t.name, icon: t.icon, year: year };
  });
}
function doneStore(){ return store("ky_done") || {}; }          // {"2026-09-06": ["reading",...]}
function markDone(year, type){
  var all = doneStore(), td = todayStr();
  var arr = all[td] = all[td] || [];
  if(arr.indexOf(type) < 0) arr.push(type);
  store("ky_done", all);
  // 5 项全完成 → 自动打卡
  if(arr.length >= 5){
    var ck = store("ky_checkins") || {};
    if(!ck[td]){ ck[td] = 1; store("ky_checkins", ck); toast("🎉 今日 5 项全部完成，打卡成功！"); }
  } else {
    toast("✓ 已记录完成（" + arr.length + "/5）");
  }
  renderHome(); renderTodayBtnState();
}
function isDoneToday(type){ return (doneStore()[todayStr()] || []).indexOf(type) >= 0; }

/* ============================================================
   首页渲染：今日任务 + 进度条 + 打卡日历 + 总体进度
   ============================================================ */
function renderHome(){
  $("today-date").textContent = todayStr();
  // 今日任务
  var plan = dailyPlan(), box = $("today-tasks");
  box.innerHTML = "";
  plan.forEach(function(t){
    var done = isDoneToday(t.type);
    var div = document.createElement("div");
    div.className = "task-item" + (done ? " done" : "");
    div.innerHTML = '<div class="t-name">' + t.icon + " " + t.name + '</div>' +
      '<div class="t-detail">' + (t.year ? t.year + " 年英语一真题" : "暂无数据") + '</div>' +
      '<div class="t-go">' + (done ? "查看内容 →" : "开始学习 →") + '</div>';
    div.onclick = function(){ if(t.year) openPaper(t.year, t.type); else toast("该模块暂未收录"); };
    box.appendChild(div);
  });
  // 进度条
  var n = (doneStore()[todayStr()] || []).length;
  $("tp-bar").style.width = (n / 5 * 100) + "%";
  $("tp-text").textContent = "今日进度 " + n + "/5" + (n >= 5 ? " · 已打卡 ✅" : "");
  renderCalendar(); renderStats();
}
function renderTodayBtnState(){ renderHome(); }

/* ---- 打卡月历 ---- */
var calY = new Date().getFullYear(), calM = new Date().getMonth();
function calMove(d){ calM += d; if(calM < 0){ calM = 11; calY--; } if(calM > 11){ calM = 0; calY++; } renderCalendar(); }
function renderCalendar(){
  $("cal-title").textContent = calY + " 年 " + (calM + 1) + " 月";
  var first = new Date(calY, calM, 1), startWd = first.getDay();
  var days = new Date(calY, calM + 1, 0).getDate();
  var ck = store("ky_checkins") || {};
  var wds = ["日","一","二","三","四","五","六"], html = wds.map(function(w){ return '<div class="cal-wd">' + w + '</div>'; }).join("");
  for(var i = 0; i < startWd; i++) html += '<div class="cal-day"></div>';
  for(var d = 1; d <= days; d++){
    var ds = calY + "-" + String(calM+1).padStart(2,"0") + "-" + String(d).padStart(2,"0");
    var cls = "cal-day";
    if(ds === todayStr()) cls += " today";
    if(ck[ds]) cls += " checked";
    html += '<div class="' + cls + '">' + d + '</div>';
  }
  $("calendar").innerHTML = html;
  var total = Object.keys(ck).length;
  $("stat-line").innerHTML = "累计打卡 <b>" + total + "</b> 天 · 今日任务完成 <b>" +
    (doneStore()[todayStr()] || []).length + "</b>/5";
}

/* ---- 总体进度统计 ---- */
function renderStats(){
  var total = 0;
  YEARS.forEach(function(y){ TYPES.forEach(function(t){ if(DB[y][t.id]) total++; }); });
  $("stat-papers").textContent = total;
  var html = '<div style="display:flex;flex-wrap:wrap;gap:8px">';
  YEARS.forEach(function(y){
    var done = TYPES.filter(function(t){ return DB[y][t.id]; }).length;
    html += '<span class="key-chip">' + y + ' 年：' + done + '/5 模块</span>';
  });
  $("stat-overall").innerHTML = html + "</div>";
}

/* ============================================================
   侧边栏：年份 + 题型筛选
   ============================================================ */
var curYear = null, curType = null;
function renderSidebar(){
  var yg = $("year-grid"); yg.innerHTML = "";
  YEARS.forEach(function(y){
    var b = document.createElement("button");
    b.className = "year-btn" + (y === curYear ? " active" : "");
    b.textContent = y;
    b.onclick = function(){ curYear = y; renderSidebar(); renderTypeList(); openPaper(curYear, curType || "reading"); };
    yg.appendChild(b);
  });
  renderTypeList();
}
function renderTypeList(){
  var tl = $("type-list"); tl.innerHTML = "";
  TYPES.forEach(function(t){
    var has = curYear && DB[curYear] && DB[curYear][t.id];
    var b = document.createElement("button");
    b.className = "type-btn" + (t.id === curType ? " active" : "");
    b.innerHTML = '<span>' + t.icon + " " + t.name + '</span><span class="badge">' + (has ? "有" : "—") + '</span>';
    b.onclick = function(){
      if(!has){ toast("暂无 " + curYear + " 年该模块数据"); return; }
      curType = t.id; renderTypeList(); openPaper(curYear, t.id);
    };
    tl.appendChild(b);
  });
}

/* ============================================================
   视图切换 & 内容页
   ============================================================ */
function switchView(v){
  studyViewSerial++;
  document.querySelectorAll(".view").forEach(function(el){ el.classList.remove("active"); });
  $("view-" + v).classList.add("active");
  window.scrollTo(0, 0);
  closeSidebar();
}
async function openPaper(year, type){
  year = Number(year);
  if(!DB[year] || !TYPES.some(function(t){return t.id===type;})) return;
  curYear = year; curType = type;
  dictContext = null;
  renderSidebar();
  var tName = TYPES.find(function(t){return t.id===type;}).name;
  switchView("paper");
  var serial = studyViewSerial;
  $("view-paper").innerHTML = '<div class="empty-tip" id="loading-tip" role="status">⏳ 正在加载 ' + year + ' 年真题……</div>';
  try {
    await studyLoadYear(year);
    if(serial !== studyViewSerial || year !== curYear || type !== curType) return;
    renderPaperBody(year,type,tName);
  } catch(e) {
    if(serial !== studyViewSerial) return;
    $("view-paper").innerHTML = '<div class="empty-tip" role="status">暂时无法加载这一年的内容，请检查网络。<br><button class="pbtn" id="retry-paper">重新加载</button></div>';
    $("retry-paper").onclick = function(){openPaper(year,type);};
  }
}
function renderPaperBody(year, type, tName){
  var data = DB[year] && DB[year][type];
  var html = '';
  html += '<div class="paper-head">' +
    '<h1>' + curYear + ' 年 英语一 · ' + tName + '</h1>' +
    '<div class="meta">一句英文对应一句译文 · 点击高亮词查看本句义 · 点击选项查看答案</div>' +
    '<div class="paper-actions">' +
      '<button class="pbtn" data-fav="' + curYear + ':' + type + '" id="paper-fav">☆ 收藏本题</button>' +
      '<button class="pbtn" id="paper-done">' + (isDoneToday(type) ? "✓ 已完成今日任务" : "标记完成今日任务") + '</button>' +
    '</div></div>';
  html += '<div id="paper-body">';
  if(!data){ html += '<div class="empty-tip">该模块数据待收录，敬请期待</div>'; }
  else {
    if(type === "reading") html += renderReading(data);
    else if(type === "cloze") html += renderCloze(data);
    else if(type === "newtype") html += renderNewtype(data);
    else if(type === "translate") html += renderTranslate(data);
    else if(type === "writing") html += renderWriting(data);
  }
  html += '</div>';
  $("view-paper").innerHTML = html;
  bindPaperEvents(curYear, type, data);
  learningRefresh();
  switchView("paper");
}
function bindPaperEvents(year, type, data){
  // 收藏星标状态
  var favBtn = $("paper-fav");
  var sync = function(){ var on = isFav(year, type); favBtn.textContent = on ? "★ 已收藏" : "☆ 收藏本题"; favBtn.classList.toggle("on", on); };
  favBtn.onclick = function(){ toggleFav(year, type); sync(); }; sync();
  // 完成任务按钮
  $("paper-done").onclick = function(){
    if(!isDoneToday(type)){
      markDone(year, type);
      this.textContent = "✓ 已完成今日任务";
      this.classList.add("on");
    } else toast("今日该模块已完成");
  };
  // 选项点击 → 揭晓答案
  document.querySelectorAll("#paper-body .q-block").forEach(function(qb){
    var ans = qb.getAttribute("data-answer");
    qb.querySelectorAll(".opt").forEach(function(opt){
      opt.onclick = function(e){
        if(e && e.target.closest('[data-lookup]')) return;
        if(qb.classList.contains("revealed")) return;
        qb.classList.add("revealed");
        if(opt.getAttribute("data-k") === ans) opt.classList.add("correct");
        else { opt.classList.add("wrong"); qb.querySelectorAll('.opt[data-k="' + ans + '"]').forEach(function(o){ o.classList.add("correct"); }); }
      };
    });
  });
  // 迷你星标（每个 passage 标题上的收藏）
  document.querySelectorAll("#paper-body .fav-star").forEach(function(st){
    var k = st.getAttribute("data-fav2");
    if(isFav(k.split(":")[0], k.split(":")[1])) st.classList.add("on");
    st.onclick = function(){ toggleFav(k.split(":")[0], k.split(":")[1]); };
  });
}

/* ---- 双语行渲染器 ---- */
function bilines(lines){ return (lines || []).map(studyPairHtml).join(""); }
function dirBox(en, zh, sentences){
  return (en || zh) ? '<div class="dir-box"><b>Directions：</b>' +
    (sentences || [{en:en || "",zh:zh || ""}]).map(studySentenceHtml).join("") + '</div>' : "";
}
function passageBox(title, inner, favK, learningK){
  var star = favK ? '<button class="fav-star" data-fav2="' + favK + '" title="收藏">☆</button>' : "";
  return '<div class="passage"><div class="passage-header"><h3><span class="passage-title" title="'+esc(title)+'">' + esc(title) + '</span>' + star + '</h3>' + (learningK?learningControl(learningK,title):'') + '</div>' + inner + '</div>';
}
function answerKeyChips(list){
  return '<details class="answer-key"><summary>📋 查看本篇答案</summary><div class="keys">' +
    list.map(function(k){ return '<span class="key-chip">' + esc(k[0]) + '：' + esc(k[1]) + '</span>'; }).join("") +
    '</div></details>';
}

/* ---- 阅读理解 ---- */
function renderReading(passages){
  return passages.map(function(t, ti){
    var qHtml = (t.questions || []).map(function(q){
      return qBlockHtml(q);
    }).join("");
    var keys = t.questions.map(function(q){ return [q.num, q.answer]; });
    return passageBox(t.title, bilines(t.lines) + '<div class="q-blocks">' + qHtml + '</div>' + answerKeyChips(keys),
      curYear + ":reading", curYear + ':reading:' + (ti+1));
  }).join("");
}
/* ---- 题目块（阅读/完形共用）---- */
function qBlockHtml(q){
  var opts = (q.options || []).map(function(o){
    var k = o[0].match(/^\[(.)\]/);
    return '<div class="opt" role="button" tabindex="0" data-k="' + (k ? k[1] : "?") + '">' + studyPairHtml(o) + '</div>';
  }).join("");
  var title = (q.sentences || [{en:q.en || ("第 " + q.num + " 题"),zh:q.zh || ""}]).map(studySentenceHtml).join("");
  return '<div class="q-block" data-answer="' + esc(q.answer || "") + '"><div class="q-title">' + title + '</div>' + opts +
    '<div class="q-explain">💡 ' + fmt(q.explain || "") + '</div></div>';
}

/* ---- 完形填空 ---- */
function renderCloze(d){
  var qHtml = (d.questions || []).map(qBlockHtml).join("");
  var keys = (d.questions || []).map(function(q){ return [q.num, q.answer]; });
  return passageBox("Use of English（完形填空）",
    dirBox(d.directions_en, d.directions_zh, d.directionSentences) + bilines(d.lines) +
    '<div class="q-blocks">' + qHtml + '</div>' + answerKeyChips(keys), null, curYear+':cloze:1');
}
/* ---- 新题型 ---- */
function renderNewtype(d){
  var keys = (d.answers || []).map(function(a){return [a[0],a[1]];});
  return passageBox("Part B（新题型）",dirBox(d.directions_en,d.directions_zh,d.directionSentences) + bilines(d.lines) +
    '<div style="margin:12px 0 6px;font-weight:600;color:var(--pri)">备选选项：</div>' + bilines(d.options) + answerKeyChips(keys), null, curYear+':newtype:1');
}

/* ---- 翻译 ---- */
function renderTranslate(d){
  var items = (d.items || []).map(function(it){
    return '<div class="q-block"><div class="s-label">' + esc(it.num) + '. 参考译文</div>' +
      (it.sentences || [{en:it.en,zh:it.zh}]).map(studySentenceHtml).join("") + '</div>';
  }).join("");
  return passageBox("Part C（翻译）",dirBox(d.directions_en,d.directions_zh,d.directionSentences) + bilines(d.lines) + items, null, curYear+':translate:1');
}

/* ---- 写作 ---- */
function renderWriting(parts){
  return parts.map(function(w, wi){
    var inner = dirBox(w.directions_en, w.directions_zh, w.directionSentences) +
      (w.image_desc ? '<div class="dir-box">🖼️ ' + fmt(w.image_desc) + '</div>' : "") +
      '<div class="sample-box"><div class="s-label">✨ 参考范文（逐句对照）</div>' + bilines(w.sample) + '</div>';
    return passageBox(w.part + (w.title ? " · " + w.title : ""), inner, null, curYear+':writing:'+(wi+1));
  }).join("");
}

/* ============================================================
   生词库：查词时一键收藏，附真题年份 + 真题原句
   存储：ky_wordbook = [{w, ph, tr, year, sent, sentZh, ts}]（按加入时间倒序）
   原句来源：① 阅读区双击查词时自动捕获所在句 ② 加入时全库检索真题例句
   ============================================================ */
var dictContext = null; // 双击查词时捕获 {year, sent, sentZh}
function wbAll(){ return store("ky_wordbook") || []; }
function wbFind(w){ return wbAll().filter(function(x){ return x.w === w; })[0] || null; }
function wbCount(){ return wbAll().length; }
function wbSyncSide(){
  var n = wbCount(), el = $("wb-count");
  if(el) el.textContent = n ? n + " 词" : "";
  var tip = $("wb-side-tip");
  if(tip && !n){ tip.textContent = "查词后点击「加入生词库」，自动附真题年份与原句"; tip.style.display = ""; }
  else if(tip){ tip.style.display = "none"; }
}
/** 全库检索真题例句：返回第一条包含该词（含常见词形）的双语句。
    优先级：阅读正文 > 翻译正文 > 新题型/完形 > 写作范文（正文句最典型） */
function wbFindSentence(word){
  return Object.values(studySentences).find(function(s){return studyHasWord(s,studyNormalize(word));}) || null;
}
function addToWordbook(word){
  var item = studySavedItem(word);
  if(!item){toast("请先查询到词义，再加入生词库");return;}
  var all = wbAll(), existing = all.findIndex(function(x){return x.w === word;});
  if(existing >= 0) all.splice(existing,1);
  all.unshift(item);
  if(store("ky_wordbook",all) === null) return;
  toast(existing >= 0 ? "已更新为本句词义与例句" : "✅ 已加入生词库");
  wbSyncSide();
  var btn = document.querySelector("#dict-result .wb-add");
  if(btn){btn.textContent="✓ 已保存本次查询";btn.disabled=true;}
}
function wbDel(w){
  var all = wbAll().filter(function(x){ return x.w !== w; });
  store("ky_wordbook", all);
  renderWordbook(); wbSyncSide(); toast("已删除「" + w + "」");
}
function wbClear(){
  if(!wbCount()){ toast("生词库已是空的"); return; }
  if(!confirm("确定清空生词库（" + wbCount() + " 词）？此操作不可恢复")) return;
  store("ky_wordbook", []);
  renderWordbook(); wbSyncSide(); toast("生词库已清空");
}
var WB_PAGE_SIZE = 20;
/** 从释义文本提取词性缩写（n. / vt. / adj. …），供折叠头部显示；pl. 等非词性标记过滤 */
function wbPosTags(tr){
  var MAP = { "a": "adj.", "ad": "adv.", "adv": "adv.", "adj": "adj." };
  var SKIP = { "pl": 1 };
  var tags = [];
  String(tr || "").split(/[；;]/).forEach(function(seg){
    var m = seg.trim().match(/^([a-zA-Z]{1,5})\.\s/);
    if(!m) return;
    var key = m[1].toLowerCase();
    if(SKIP[key]) return;
    var tag = MAP[key] || (m[1] + ".");
    if(tags.indexOf(tag) < 0) tags.push(tag);
  });
  return tags.slice(0, 4).join(" ");
}
function wbCurPage(){ return Math.max(1, parseInt(store("ky_wb_page")) || 1); }
function wbTotalPages(){ return Math.max(1, Math.ceil(wbCount() / WB_PAGE_SIZE)); }
function wbGoPage(p){
  var total = wbTotalPages();
  store("ky_wb_page", Math.min(Math.max(1, p), total));
  renderWordbook();
}
function renderWordbook(){
  var all = wbAll(), list = $("wb-list");
  var total = wbTotalPages();
  var page = Math.min(wbCurPage(), total); // 删除后页码超界自动回落
  var slice = all.slice((page - 1) * WB_PAGE_SIZE, page * WB_PAGE_SIZE);
  studyRefreshSaved(slice);
  $("wb-head-meta").textContent = all.length + " 词 · 每页 " + WB_PAGE_SIZE + " 词 · 第 " + page + "/" + total + " 页 · 点击词条展开详情 · 数据保存在本机";
  if(!all.length){
    list.innerHTML = '<div class="empty-tip">生词库是空的——去侧边栏查词，点击「加入生词库」开始积累吧</div>';
    return;
  }
  list.innerHTML = slice.map(function(it){
    return '<div class="wb-item" data-item="' + esc(it.w) + '">' +
      '<div class="wb-head" data-open="1">' +
        '<span class="wb-arrow">▶</span>' +
        '<span class="wb-word">' + esc(it.w) + '</span>' +
        (function(){ var p = wbPosTags(it.tr); return p ? '<span class="wb-pos">' + esc(p) + '</span>' : ""; })() +
        (it.year ? '<span class="wb-year">' + esc(it.year) + ' 真题</span>' : '<span class="wb-year none">未定位年份</span>') +
        '<button class="wb-del" data-del="' + esc(it.w) + '" title="删除">✕</button>' +
      '</div>' +
      '<div class="wb-body">' +
        (it.ph ? '<div class="wb-phon">/' + esc(it.ph) + '/</div>' : "") +
        '<div class="wb-tr">' + (it.contextTr ? '<div class="d-context-label">' + studyMeaningLabel(it.contextKind) + '</div>' : '') + String(it.tr || "").split("；").map(function(s){ return "<div>" + esc(s) + "</div>"; }).join("") + '</div>' +
        (it.generalTr && it.generalTr !== it.tr ? '<details class="wb-general"><summary>通用词典义</summary><div>' + esc(it.generalTr) + '</div></details>' : '') +
        '<div class="wb-speak">' +
          '<button data-speak="' + esc(it.w) + '" data-accent="us">🔊 美音</button>' +
          '<button data-speak="' + esc(it.w) + '" data-accent="uk">🔊 英音</button>' +
        '</div>' +
        (it.sent
          ? '<div class="wb-sent"><div class="s-label">📖 ' + (it.year ? esc(it.year) + " 年真题原句" : "真题原句") + '</div>' +
            '<div class="s-en">' + esc(it.sent) + '</div>' +
            (it.sentZh ? '<div class="s-zh">' + esc(it.sentZh) + '</div>' : "") + '</div>'
          : '<div class="wb-sent"><div class="s-label">📖 真题原句</div><div class="s-en" style="color:var(--fg2)">尚未保存该词的原句；查询时可从当前文章重新定位</div></div>') +
      '</div>' +
    '</div>';
  }).join("");
  // 分页条
  if(total > 1){
    var btns = '<button ' + (page <= 1 ? "disabled" : "") + ' data-page="' + (page - 1) + '">‹ 上一页</button>';
    var pages = [];
    for(var p = 1; p <= total; p++){
      if(p === 1 || p === total || Math.abs(p - page) <= 2) pages.push(p);
      else if(pages[pages.length - 1] !== "…") pages.push("…");
    }
    pages.forEach(function(p){
      btns += (p === "…")
        ? '<span style="color:var(--fg2)">…</span>'
        : '<button class="' + (p === page ? "cur" : "") + '" data-page="' + p + '">' + p + '</button>';
    });
    btns += '<button ' + (page >= total ? "disabled" : "") + ' data-page="' + (page + 1) + '">下一页 ›</button>';
    list.innerHTML += '<div class="wb-pager">' + btns + '</div>';
  }
}
(function bindWordbook(){
  var list = $("wb-list");
  if(!list) return;
  list.addEventListener("click", function(e){
    var del = e.target.closest ? e.target.closest("[data-del]") : null;
    if(del){ e.stopPropagation(); wbDel(del.dataset.del); return; }
    var pg = e.target.closest ? e.target.closest("[data-page]") : null;
    if(pg){ wbGoPage(parseInt(pg.dataset.page)); return; }
    var sp = e.target.closest ? e.target.closest("[data-speak]") : null;
    if(sp){ dictSpeak(sp.dataset.speak, sp.dataset.accent); return; }
    var head = e.target.closest ? e.target.closest("[data-open]") : null;
    if(head){
      // 手风琴：同时只展开一个词条
      var item = head.parentElement, wasOpen = item.classList.contains("open");
      list.querySelectorAll(".wb-item.open").forEach(function(x){ x.classList.remove("open"); });
      if(!wasOpen) item.classList.add("open");
    }
  });
})();

/* ============================================================
   数据导入导出 & Supabase 同步（可选）
   Supabase 建表 SQL：
   create table kaoyan_sync (k text primary key, v jsonb, updated_at timestamptz default now());
   ============================================================ */
function collectData(){
  return { checkins: store("ky_checkins") || {}, done: store("ky_done") || {},
           favs: getFavs(), wordbook: wbAll(), studyMarks:learningMarks(),
           settings: { theme: store("ky_theme"), font: parseInt(localStorage.getItem("ky_font")) || 16, zhHidden:!!store("ky_zh_hidden") },
           exported_at: new Date().toISOString() };
}
function exportJSON(){
  var blob = new Blob([JSON.stringify(collectData(), null, 2)], { type: "application/json" });
  var a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "kaoyan_english_progress_" + todayStr() + ".json";
  a.click(); URL.revokeObjectURL(a.href);
  toast("已导出学习数据");
}
function importJSON(input){
  var f = input.files[0]; if(!f) return;
  var rd = new FileReader();
  rd.onload = function(){
    try{
      var d = JSON.parse(rd.result);
      if(!d || typeof d!=="object" || Array.isArray(d))throw new Error("数据格式错误");
      ["checkins","done"].forEach(function(k){if(d[k] && (typeof d[k]!=="object" || Array.isArray(d[k])))throw new Error("进度格式错误");});
      if(d.favs && (!Array.isArray(d.favs) || d.favs.some(function(x){return typeof x!=="string";})))throw new Error("收藏格式错误");
      if(d.wordbook && (!Array.isArray(d.wordbook) || d.wordbook.some(function(x){return !x || typeof x.w!=="string";})))throw new Error("生词库格式错误");
      var mergedMarks=d.studyMarks===undefined?null:learningMerge(learningMarks(),d.studyMarks);
      if(mergedMarks && store('ky_study_marks',mergedMarks)===null){toast('导入未完成：学习标记保存失败');return;}
      if(d.checkins) store("ky_checkins", d.checkins);
      if(d.done) store("ky_done", d.done);
      if(d.favs) store("ky_favs", d.favs);
      if(d.wordbook){
        // 合并导入（按词头去重，保留较新条目）
        var cur = Object.create(null); wbAll().forEach(function(x){ cur[x.w] = x; });
        (d.wordbook || []).forEach(function(x){ if(!x || !x.w) return; if(!cur[x.w] || (x.ts || 0) > (cur[x.w].ts || 0)) cur[x.w] = x; });
        store("ky_wordbook", Object.keys(cur).map(function(k){ return cur[k]; }));
        wbSyncSide();
      }
      if(d.settings){
        if(d.settings.theme==='dark'||d.settings.theme==='light')applyTheme(d.settings.theme);
        if(Number.isFinite(d.settings.font)){
          var font=Math.max(13,Math.min(22,d.settings.font));localStorage.setItem('ky_font',font);document.documentElement.style.fontSize=font+'px';
        }
        if(typeof d.settings.zhHidden==='boolean'){
          store('ky_zh_hidden',d.settings.zhHidden);document.body.classList.toggle('zh-hidden',d.settings.zhHidden);$('zh-toggle').classList.toggle('on',d.settings.zhHidden);
        }
      }
      if($('view-wordbook').classList.contains('active'))renderWordbook();
      learningRefresh();
      toast("✅ 导入成功"); renderHome(); renderFavs();
    }catch(e){ toast("导入失败：文件格式不正确"); }
  };
  rd.readAsText(f); input.value = "";
}
function sbConfig(){ return store("ky_supabase") || {}; }
function sbSave(url, key){
  store("ky_supabase", { url: url.replace(/\/+$/, ""), key: key });
  toast("Supabase 配置已保存");
}
function syncSettings(){
  var c = sbConfig();
  var url = prompt("Supabase 项目地址（如 https://xxxx.supabase.co）：" , c.url || "");
  if(url === null) return;
  var key = prompt("Supabase anon key（公开密钥，仅用于读写打卡表）:", c.key || "");
  if(key === null) return;
  sbSave(url, key);
}
function sbTable(){
  var c = sbConfig();
  if(!c.url || !c.key){ toast("请先在「Supabase 同步设置」中配置地址与 anon key"); return null; }
  return c;
}
function supabasePush(){
  var c = sbTable(); if(!c) return;
  var d = collectData();
  var rows = ["checkins", "done", "favs", "study_marks"].map(function(k){
    return { k: k, v: k==='study_marks'?d.studyMarks:d[k], updated_at: new Date().toISOString() };
  });
  var st = $("sync-status");
  st.textContent = "⏳ 正在上传…";
  fetch(c.url + "/rest/v1/kaoyan_sync", {
    method: "POST",
    headers: { "apikey": c.key, "Authorization": "Bearer " + c.key,
               "Content-Type": "application/json", "Prefer": "resolution=merge-duplicates" },
    body: JSON.stringify(rows)
  }).then(function(r){ st.textContent = r.ok ? "✅ 上传成功 " + new Date().toLocaleTimeString() : "❌ 上传失败 HTTP " + r.status + "（请检查是否已建表 kaoyan_sync）"; })
    .catch(function(e){ st.textContent = "❌ 网络错误：" + e; });
}
function supabasePull(){
  var c = sbTable(); if(!c) return;
  var st = $("sync-status");
  st.textContent = "⏳ 正在拉取…";
  fetch(c.url + "/rest/v1/kaoyan_sync?select=k,v", {
    headers: { "apikey": c.key, "Authorization": "Bearer " + c.key }
  }).then(function(r){ return r.ok ? r.json() : Promise.reject(new Error("HTTP " + r.status)); })
    .then(function(rows){
      var incomingMarks=rows.filter(function(row){return row.k==='study_marks';}).reduce(function(all,row){return learningMerge(all,row.v);},{});
      if(Object.keys(incomingMarks).length && store('ky_study_marks',learningMerge(learningMarks(),incomingMarks))===null)throw new Error('学习标记保存失败');
      var merged = 0;
      rows.forEach(function(row){
        var local = store("ky_" + (row.k === "favs" ? "favs" : row.k));
        if(row.k === 'study_marks'){
          merged++;
        } else if(row.k === "favs"){
          var a = local || [], b = row.v || [];
          var set = {}; a.concat(b).forEach(function(x){ set[x] = 1; });
          store("ky_favs", Object.keys(set)); merged++;
        } else if(row.k === "checkins" || row.k === "done"){
          var m = local || {};
          Object.keys(row.v || {}).forEach(function(d){ m[d] = m[d] || row.v[d]; });
          store("ky_" + row.k, m); merged++;
        }
      });
      st.textContent = "✅ 拉取并合并成功（" + merged + " 项）";
      renderHome(); renderFavs();
      learningRefresh();
    })
    .catch(function(e){ st.textContent = "❌ 拉取失败：" + e.message; });
}

/* ============================================================
   单词查询系统
   词库：ECDICT (MIT) 过滤版内置词库（考试词表+高频词，2.1 万词条）
   链路：本地精确 → 屈折还原(不规则表+规则) → 在线补充(dictionaryapi.dev)
   朗读：有道真人发音(dictvoice) → 浏览器 Web Speech 兜底
   ============================================================ */
var DICT = null, DICT_FORMS = null, DICT_KEYS = [];
// Dictionary loading is deferred until the first lookup or saved-vocabulary review.

function ruleLemmatize(w){
  // 规则屈折还原（配合不规则表 DICT_FORMS）
  var m;
  if((m = w.match(/(.+)ies$/)) && m[1].length > 1) return m[1] + "y";      // studies→study
  if((m = w.match(/(.+)(es)$/)) && /(?:s|x|z|ch|sh)$/.test(m[1])) return m[1]; // boxes→box
  if((m = w.match(/(.+)s$/)) && !/ss$/.test(w)) return m[1];               // cats→cat
  if((m = w.match(/(.+)ied$/)) && m[1].length > 1) return m[1] + "y";      // carried→carry
  if((m = w.match(/(.+)ing$/)) ){
    var b = m[1];
    if(DICT[b]) return b;
    if(DICT[b + "e"]) return b + "e";                                      // hoping→hope
    if(/(..)(.)\2$/.test(b) && DICT[b.slice(0, -1)]) return b.slice(0, -1); // running→run
    return b;
  }
  if((m = w.match(/(.+)ed$/)) ){
    var b2 = m[1];
    if(DICT[b2]) return b2;
    if(DICT[b2 + "e"]) return b2 + "e";                                    // hoped→hope
    if(DICT[b2 + "d"]) return b2 + "d";                                    // added→add? b2="ad"→"add"
    if(/(..)(.)\2$/.test(b2) && DICT[b2.slice(0, -1)]) return b2.slice(0, -1);
    return b2;
  }
  if((m = w.match(/(.+)(er|est)$/)) && DICT[m[1]]) return m[1];            // faster→fast
  return null;
}
function dictHistory(){ return store("ky_dict_history") || []; }
function dictSpeak(word, accent){
  var url = "https://dict.youdao.com/dictvoice?audio=" + encodeURIComponent(word) + "&type=" + (accent === "uk" ? 1 : 2);
  try{
    var au = new Audio();
    au.onerror = function(){ dictSpeakTTS(word); };
    au.src = url;
    var p = au.play();
    if(p && p.catch) p.catch(function(){ dictSpeakTTS(word); }); // 自动播放被拦截等异步失败 → TTS 兜底
  }catch(e){ dictSpeakTTS(word); }
}
function dictSpeakTTS(text){
  try{
    var u = new SpeechSynthesisUtterance(text);
    u.lang = "en-US"; u.rate = 0.9;
    var vs = speechSynthesis.getVoices().filter(function(v){ return /^en(-|_)/i.test(v.lang); });
    if(vs.length) u.voice = vs[0];
    speechSynthesis.speak(u);
  }catch(e){ toast("当前设备不支持语音朗读"); }
}
function dictEditDist(a, b, max){
  // Damerau-Levenshtein（相邻换位计 1 步，teh→the / recieve→receive 均为 1），带剪枝
  var la = a.length, lb = b.length;
  if(Math.abs(la - lb) > max) return max + 1;
  var d = [], i, j;
  for(i = 0; i <= la; i++) d[i] = [i];
  for(j = 0; j <= lb; j++) d[0][j] = j;
  for(i = 1; i <= la; i++){
    var rowMin = d[i][0] = i;
    for(j = 1; j <= lb; j++){
      var cost = a[i-1] === b[j-1] ? 0 : 1;
      var v = Math.min(d[i-1][j] + 1, d[i][j-1] + 1, d[i-1][j-1] + cost);
      if(i > 1 && j > 1 && a[i-1] === b[j-2] && a[i-2] === b[j-1]){
        v = Math.min(v, d[i-2][j-2] + 1); // 相邻换位
      }
      d[i][j] = v;
      rowMin = Math.min(rowMin, v);
    }
    if(rowMin > max) return max + 1;
  }
  return d[la][lb];
}
async function dictSuggest(w){
  if(studySuggestionCache.has(w)) return studySuggestionCache.get(w);
  var candidates = [], res = [], serial=studyLookupSerial;
  for(var n=Math.max(1,w.length-2);n<=w.length+2;n++) candidates=candidates.concat(studyLengthBuckets[n] || []);
  for(var i=0;i<candidates.length;i++){
    var d=dictEditDist(w,candidates[i],2);if(d<=2)res.push([d,candidates[i]]);
    if(i && i%250===0){await studyPause();if(serial!==studyLookupSerial)return [];}
  }
  res.sort(function(a,b){return a[0]-b[0] || a[1].localeCompare(b[1]);});
  var result=res.slice(0,8).map(function(x){return x[1];});
  studySuggestionCache.set(w,result);
  if(studySuggestionCache.size>40)studySuggestionCache.delete(studySuggestionCache.keys().next().value);
  return result;
}
function dictRenderLocal(word, base, extraTr, rel){
  var e=DICT[base] || {ph:"",tr:""}, ctx=studyLastLookup.context, sense=studySense(word,ctx);
  if(rel==='第三人称单数' && /^n\./.test(sense))rel='复数（本句用作名词）';
  var saved=wbFind(word), same=saved && saved.sentenceId===(ctx && ctx.id) && saved.contentVersion===SITE_MANIFEST.version;
  var html='<div class="dict-card"><span class="d-word">' + esc(word) + '</span>' +
    (word!==base ? '<span class="d-base">' + esc(base) + (rel ? ' 的'+esc(rel) : ' 的变形') + '</span>' : '') +
    (e.ph ? '<div class="d-phon">/'+esc(e.ph)+'/</div>' : '') + studyContextHtml(word,ctx) +
    (e.tr ? '<details class="dict-general"' + (!sense ? ' open' : '') + '><summary>通用词典义</summary><div class="d-senses">' + e.tr.split('；').map(function(t){return '<div>'+esc(t)+'</div>';}).join('') + '</div></details>' : '') +
    '<div class="dict-speak"><button class="sp" data-speak="'+esc(base)+'" data-accent="us">🔊 美音</button>' +
    '<button class="sp" data-speak="'+esc(base)+'" data-accent="uk">🔊 英音</button>' +
    '<button class="wb-add" data-add="'+esc(word)+'"'+(same?' disabled':'')+'>'+(same?'✓ 已在生词库':saved?'更新为本句':'➕ 加入生词库')+'</button></div>' +
    '<details class="dict-online" id="dict-online"><summary>在线补充（英文释义/音频）</summary><div id="dict-online-body"></div></details></div>';
  $("dict-result").innerHTML=html;
  var det=$("dict-online"),body=$("dict-online-body");
  det.addEventListener("toggle",function(){if(det.open&&!body.dataset.loaded)dictOnlineLookup(base,body,false);});
}
function fetchWithTimeout(url, ms){
  // 带超时的 fetch（Promise.race 方式，不依赖 AbortController 兼容性）
  return new Promise(function(resolve, reject){
    var timer = setTimeout(function(){
      var e = new Error("timeout"); e.name = "AbortError"; reject(e);
    }, ms);
    fetch(url).then(function(r){
      clearTimeout(timer); resolve(r);
    }, function(e){
      clearTimeout(timer); reject(e);
    });
  });
}
function dictOnlineLookup(word, body, isNotFound){
  // 在线英文释义补充（dictionaryapi.dev，CORS 开放；当前网络不可达时 10 秒内降级）
  body.dataset.loaded = "1";
  body.textContent = "⏳ 在线查询中…（约10秒内响应）";
  fetchWithTimeout("https://api.dictionaryapi.dev/api/v2/entries/en/" + encodeURIComponent(word), 10000)
    .then(function(r){ return r.ok ? r.json() : Promise.reject(new Error("HTTP " + r.status)); })
    .then(function(data){
      var en = data[0], html = "";
      if(en.phonetic) html += '<div class="d-phon">EN /' + esc(en.phonetic.replace(/^\/|\/$/g, "")) + '/</div>';
      (en.phonetics || []).forEach(function(p){
        if(p.audio) html += '<div><button class="dict-chip" data-audio="' + esc(p.audio) + '">▶ 真人音频' + (p.text ? " " + esc(p.text) : "") + '</button></div>';
      });
      var maxMean = isNotFound ? 4 : 3;
      (en.meanings || []).slice(0, maxMean).forEach(function(m){
        html += '<div class="o-def"><b>' + esc(m.partOfSpeech) + '</b> ' +
          (m.definitions || []).slice(0, 2).map(function(d){ return esc(d.definition); }).join("；") + '</div>';
      });
      body.innerHTML = html || (isNotFound ? "在线也未找到该词" : "在线无补充数据");
    })
    .catch(function(e){
      body.textContent = (e && (e.name === "AbortError" || e.message === "timeout"))
        ? "在线查询超时；已显示的本地词义和原句仍可使用。"
        : "在线补充服务暂时不可用；已显示的本地词义和原句仍可使用。";
    });
}
function dictFetchOnline(word){
  dictOnlineLookup(word, $("dict-online-body"), false);
}
function dictPlayAudio(btn){
  try{
    var p = new Audio(btn.dataset.audio).play();
    if(p && p.catch) p.catch(function(){ toast("音频播放失败"); });
  }
  catch(e){ toast("音频播放失败"); }
}
async function dictRenderNotFound(w){
  var serial=studyLookupSerial, ctx=studyLastLookup.context;
  $("dict-result").innerHTML='<div class="dict-card"><div class="dict-err">本地词库未收录「'+esc(w)+'」</div>'+studyContextHtml(w,ctx)+'<div class="dict-tip">正在查找拼写相近的词……</div></div>';
  var sug=w.length<=32 ? await dictSuggest(w) : [];
  if(serial!==studyLookupSerial)return;
  $("dict-result").innerHTML='<div class="dict-card"><div class="dict-err">本地词库未收录「'+esc(w)+'」</div>'+studyContextHtml(w,ctx)+
    '<div class="dict-tip">请检查拼写；以下是拼写相近的词：</div><div class="dict-chips">'+
    (sug.length?sug.map(function(x){return '<span class="dict-chip" data-w="'+esc(x)+'">'+esc(x)+'</span>';}).join(''):'<span class="dict-tip">无相近词</span>')+
    '</div><details class="dict-online"><summary>尝试在线查询英文释义</summary><div id="dict-online-body"></div></details></div>';
  var det=document.querySelector('#dict-result details'),body=$('dict-online-body');
  det.addEventListener('toggle',function(){if(det.open&&!body.dataset.loaded)dictOnlineLookup(w,body,true);});
}
function dictSaveHistory(w){
  var h = dictHistory().filter(function(x){ return x !== w; });
  h.unshift(w);
  store("ky_dict_history", h.slice(0, 12));
}
function dictClearHistory(){ store("ky_dict_history", []); dictRenderHistory(); }
function dictRenderHistory(){
  var h = dictHistory();
  var old = document.getElementById("dict-history-chips");
  if(old) old.remove(); // 仅移除历史容器（不能误删建议词容器）
  if(!h.length){ return; }
  var el = document.createElement("div");
  el.className = "dict-chips";
  el.id = "dict-history-chips";
  el.innerHTML = h.map(function(x){ return '<span class="dict-chip" data-w="' + esc(x) + '">' + esc(x) + '</span>'; }).join("") +
    '<span class="dict-chip" title="清空历史" id="dict-hist-clear">✕</span>';
  $("dict-result").appendChild(el);
}
async function dictLookup(raw, explicit){
  var serial=++studyLookupSerial, box=$("dict-result");
  var w=studyNormalize(raw).replace(/^[^a-z']+|[^a-z']+$/g,'');
  dictContext=null;studyLastLookup=null;
  if(!w || w.length>80 || !/^[a-z]+(?:['-][a-z]+)*(?: [a-z]+(?:['-][a-z]+)*)*$/.test(w)){
    box.innerHTML='<div class="dict-tip">请输入英文单词或短语（最多80个字符）</div>';return;
  }
  $("dict-input").value=w;
  box.innerHTML='<div class="dict-tip" role="status">⏳ 正在查询词义与原句……</div>';
  try{await studyLoadDictionary();}catch(e){if(serial===studyLookupSerial)studyLookupError(w);return;}
  if(serial!==studyLookupSerial)return;
  var ctx=null;
  try{ctx=await studyFindContext(w,explicit);}catch(e){ /* Local definitions remain available. */ }
  if(serial!==studyLookupSerial)return;
  var entry=studyEntry(w);
  dictContext=ctx;studyLastLookup={word:w,entry:entry,context:ctx};dictSaveHistory(w);
  if(entry || studySense(w,ctx))dictRenderLocal(w,entry?entry.base:w,null,entry?entry.rel:null);
  else await dictRenderNotFound(w);
  if(serial===studyLookupSerial)dictRenderHistory();
}
(function bindDictUI(){
  var input=$("dict-input");if(!input)return;
  input.addEventListener("keydown",function(e){if(e.key==="Enter"){e.preventDefault();dictLookup(input.value,null);}});
  $("dict-go").addEventListener("click",function(){dictLookup(input.value,null);});
  $("dict-result").addEventListener("click",function(e){
    var t=e.target;
    if(t.id==='dict-hist-clear'){dictClearHistory();return;}
    var source=t.closest('[data-open-source]');if(source){studyOpenSource(source.dataset.openSource);return;}
    var au=t.closest('[data-audio]');if(au){dictPlayAudio(au);return;}
    var add=t.closest('[data-add]');if(add){addToWordbook(add.dataset.add);return;}
    t=t.closest('[data-w]') || t.closest('[data-speak]');if(!t)return;
    if(t.dataset.speak)dictSpeak(t.dataset.speak,t.dataset.accent);else dictLookup(t.dataset.w,null);
  });
  var main=$("main");
  main.addEventListener("click",function(e){var kw=e.target.closest('[data-lookup]');if(kw){e.stopPropagation();studyLookupFromElement(kw.dataset.lookup,kw);}});
  main.addEventListener("keydown",function(e){
    if(e.key!=='Enter'&&e.key!==' ')return;
    var kw=e.target.closest('[data-lookup]');if(kw){e.preventDefault();studyLookupFromElement(kw.dataset.lookup,kw);return;}
    var opt=e.target.closest('.opt');if(opt){e.preventDefault();opt.click();}
  });
  main.addEventListener("dblclick",function(e){
    if(e.target.closest('[data-lookup]'))return;
    var selection=window.getSelection(),word=selection?selection.toString().trim():'';
    var node=selection&&selection.anchorNode;
    var host=node&&(node.nodeType===1?node:node.parentElement);
    if(host&&host.closest('.en')&&/^[a-zA-Z]+(?:['’-][a-zA-Z]+)*$/.test(word))studyLookupFromElement(word,host);
  });
})();

/* ============================================================
   移动端侧边栏抽屉 & 回到顶部
   ============================================================ */
function closeSidebar(){ $("sidebar").classList.remove("open"); $("sidebar-mask").classList.remove("show"); }
$("hamburger").onclick = function(){
  $("sidebar").classList.toggle("open");
  $("sidebar-mask").classList.toggle("show");
};
window.addEventListener("scroll", function(){
  $("back-top").style.display = window.scrollY > 400 ? "block" : "none";
});

/* ============================================================
   启动：恢复偏好 → 渲染
   ============================================================ */
(function init(){
  var t = store("ky_theme");
  applyTheme(t || (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"));
  document.documentElement.style.fontSize = (parseInt(localStorage.getItem("ky_font")) || 16) + "px";
  if(store("ky_zh_hidden")) { document.body.classList.add("zh-hidden"); $("zh-toggle").classList.add("on"); }
  if(YEARS.length){ curYear = YEARS[0]; curType = "reading"; }
  renderSidebar(); renderHome(); renderFavs(); wbSyncSide();
  learningBind();
})();
