"use strict";
// Content is prepared offline. Browsing and vocabulary lookup require no translation API.
var studyYears = Object.create(null), studyYearLoads = Object.create(null);
var studySentences = Object.create(null), studyPapers = Object.create(null);
var studyIndex = null, studyIndexLoad = null, studyDictLoad = null;
var studyLookupSerial = 0, studyViewSerial = 0, studyLastLookup = null;
var studySuggestionCache = new Map(), studyLengthBuckets = Object.create(null);
var studyMigrationPending = new Set();

function studyPlain(s){ return String(s || "").replace(/\*\*/g, ""); }
function studyNormalize(s){ return studyPlain(s).toLowerCase().replace(/[’‘]/g, "'").replace(/\s+/g, " ").trim(); }
function studyKey(s){ return studyNormalize(s).replace(/[^a-z0-9]+/g, " ").trim(); }
function studyPause(){ return new Promise(function(resolve){ setTimeout(resolve, 0); }); }
function studyAsset(path){ return path + "?v=" + encodeURIComponent(SITE_MANIFEST.version); }
async function studyFetch(path){
  var controller = typeof AbortController === "function" ? new AbortController() : null;
  var timer;
  try {
    return await Promise.race([
      fetch(studyAsset(path), controller ? {signal:controller.signal} : {}).then(function(r){
        if(!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      }),
      new Promise(function(_, reject){ timer = setTimeout(function(){ if(controller) controller.abort(); reject(new Error("加载超时")); }, 15000); })
    ]);
  } finally { clearTimeout(timer); }
}
function studyRegister(value, year, type){
  if(!value || typeof value !== "object") return;
  if(Array.isArray(value)){ value.forEach(function(v){ studyRegister(v, year, type); }); return; }
  ["sentences", "directionSentences"].forEach(function(k){
    (value[k] || []).forEach(function(s){
      if(!s.id || studySentences[s.id]) return;
      var ctx = Object.assign({}, s, {year:year, type:type, sent:studyPlain(s.en), sentZh:studyPlain(s.zh)});
      studySentences[s.id] = ctx;
      (studyPapers[year + ":" + type] || (studyPapers[year + ":" + type] = [])).push(ctx);
    });
  });
  Object.keys(value).forEach(function(k){ if(k !== "sentences" && k !== "directionSentences") studyRegister(value[k], year, type); });
}
function studyLoadYear(year){
  year = Number(year);
  if(!SITE_MANIFEST.years[year]) return Promise.reject(new Error("未收录该年份"));
  if(studyYears[year]) return Promise.resolve(DB[year]);
  if(studyYearLoads[year]) return studyYearLoads[year];
  studyYearLoads[year] = studyFetch("data/" + year + ".json").then(function(parts){
    if(!Array.isArray(parts) || parts.length !== SITE_MANIFEST.years[year].length) throw new Error("年份数据不完整");
    parts.forEach(function(p){ DB[year][p.type] = p.data; studyRegister(p.data, year, p.type); });
    studyYears[year] = true;
    return DB[year];
  }).catch(function(e){ delete studyYearLoads[year]; throw e; });
  return studyYearLoads[year];
}
function studyLoadIndex(){
  if(studyIndex) return Promise.resolve(studyIndex);
  if(!studyIndexLoad) studyIndexLoad = studyFetch("data/lookup-index.json").then(function(data){ studyIndex = data; return data; }).catch(function(e){ studyIndexLoad = null; throw e; });
  return studyIndexLoad;
}
function studyLoadDictionary(){
  if(DICT) return Promise.resolve();
  if(studyDictLoad) return studyDictLoad;
  studyDictLoad = studyFetch("data/dictionary.json").then(async function(raw){
    if(!raw || !Array.isArray(raw.entries)) throw new Error("词库格式错误");
    var map = Object.create(null);
    for(var i = 0; i < raw.entries.length; i++){
      var line = raw.entries[i], p1 = line.indexOf("|"), p2 = line.indexOf("|", p1 + 1);
      if(p1 >= 0 && p2 >= 0){
        var w = line.slice(0, p1).toLowerCase();
        if(!map[w]) map[w] = {ph:line.slice(p1 + 1, p2), tr:line.slice(p2 + 1)};
      }
      if(i && i % 750 === 0) await studyPause();
    }
    DICT_FORMS = raw.forms || Object.create(null);
    DICT_KEYS = Object.keys(map);
    DICT_KEYS.forEach(function(k){ (studyLengthBuckets[k.length] || (studyLengthBuckets[k.length] = [])).push(k); });
    DICT = map;
  }).catch(function(e){ studyDictLoad = null; throw e; });
  return studyDictLoad;
}
function studyEntry(w){
  var rel = DICT_FORMS && DICT_FORMS[w], base = rel ? rel.split("|")[0].toLowerCase() : null;
  if(DICT && DICT[w] && (!base || /^(?:n|v|vi|vt|a|adj|adv|ad|prep|conj|pron)\.\s/i.test(DICT[w].tr))) return {base:w, entry:DICT[w], rel:null};
  base = base || (DICT ? ruleLemmatize(w) : null);
  if(base && DICT[base]) return {base:base, entry:DICT[base], rel:rel ? rel.split("|")[1] : "变形"};
  return null;
}
function studyWordSet(ctx){
  if(ctx.wordSet && ctx.wordSetWithDict === !!DICT) return ctx.wordSet;
  var set = new Set((studyNormalize(ctx.sent).match(/[a-z]+(?:['-][a-z]+)*/g) || []));
  Array.from(set).forEach(function(w){ var f = DICT_FORMS && DICT_FORMS[w]; if(f) set.add(f.split("|")[0].toLowerCase()); });
  Object.keys(ctx.glossary || {}).forEach(function(w){ set.add(w); });
  ctx.wordSet = set; ctx.wordSetWithDict = !!DICT;
  return set;
}
function studyHasWord(ctx, w){
  if(!ctx) return false;
  var words = studyWordSet(ctx), entry = studyEntry(w);
  if(words.has(w) || (entry && words.has(entry.base))) return true;
  if(w.includes(" ")) return (" " + studyKey(ctx.sent) + " ").includes(" " + studyKey(w) + " ");
  return false;
}
function studySense(w, ctx){
  if(!ctx || !studyHasWord(ctx,w)) return "";
  var gl = ctx.glossary || {}, entry = studyEntry(w);
  return gl[w] || (entry && gl[entry.base]) || "";
}
// A literal dictionary/translation match is useful evidence, but is not a reviewed gloss.
function studyReference(w, ctx){
  if(!ctx || !studyHasWord(ctx,w))return "";
  var entry=studyEntry(w);if(!entry)return "";
  var candidates=Array.from(new Set((entry.entry.tr.match(/[\u3400-\u9fff]{2,}/g)||[]).map(function(s){return s.length>2?s.replace(/[的地]$/,""):s;})));
  var found=candidates.filter(function(s){return s.length>=2 && ctx.sentZh.includes(s);});
  found=found.filter(function(s){return !found.some(function(other){return other!==s && other.includes(s);});});
  return found.length===1 ? found[0] : "";
}
function studyMeaningLabel(kind){return kind==='translation-match'?'译文对应义（参考）':'本句义';}
async function studyFindContext(w, explicit){
  if(explicit && studyHasWord(explicit,w)) return explicit;
  if($("view-paper").classList.contains("active")){
    var current = (studyPapers[curYear + ":" + curType] || []).filter(function(s){ return studyHasWord(s,w); });
    if(current.length) return current.find(function(s){ return studySense(w,s); }) || current[0];
  }
  var index = await studyLoadIndex(), entry = studyEntry(w);
  var locations = index[w] || (entry && index[entry.base]) || [];
  if(!locations.length) return null;
  var loc = locations[0]; await studyLoadYear(loc[0]);
  return studyHasWord(studySentences[loc[2]],w) ? studySentences[loc[2]] : null;
}
function studySentenceHtml(s){
  var attrs = s.id ? ' data-sentence="' + esc(s.id) + '"' : "";
  return '<div class="biline"' + attrs + '><div class="en" lang="en">' + fmt(s.en) + '</div><div class="zh" lang="zh-CN">' + fmt(s.zh) + '</div>' +
    (s.note ? '<div class="source-note">' + esc(s.note) + '</div>' : '') + '</div>';
}
function studyPairHtml(p){
  return '<div class="sentence-group">' + ((p[2] && p[2].sentences) || [{en:p[0],zh:p[1]}]).map(studySentenceHtml).join("") + '</div>';
}
function studyContextHtml(w,ctx){
  if(!ctx) return '<div class="dict-tip">未定位到包含该词的原句。以下为通用词典义。</div>';
  var sense = studySense(w,ctx), reference = sense ? "" : studyReference(w,ctx);
  var name = (TYPES.find(function(t){ return t.id === ctx.type; }) || {}).name || "";
  return '<div class="d-context">' +
    (sense || reference ? '<div class="d-context-label">' + studyMeaningLabel(sense?'reviewed':'translation-match') + '</div><div class="d-context-sense">' + esc(sense || reference) + '</div>' : '<div class="dict-tip">结合下方原句理解；通用词典义见下方。</div>') +
    '<div class="d-context-source">' + esc(ctx.year) + ' 年 · ' + esc(name) + '</div>' +
    '<div class="d-context-en" lang="en">' + esc(ctx.sent) + '</div><div class="zh d-context-zh">' + esc(ctx.sentZh) + '</div>' +
    '<button class="dict-chip" data-open-source="' + esc(ctx.id) + '">回到原文</button></div>';
}
function studyLookupError(w){
  $("dict-result").innerHTML = '<div class="dict-card"><div class="dict-err">词库暂时加载失败，请检查网络后重试。</div><button class="dict-chip" data-w="' + esc(w) + '">重试查询</button></div>';
}
function studyLookupFromElement(w, element){
  var host = element.closest("[data-sentence]");
  var context = host && studySentences[host.dataset.sentence];
  $("dict-input").value = studyPlain(w);
  var lookup=dictLookup(w,context || null);
  if(window.innerWidth <= 900){ $("sidebar").classList.add("open"); $("sidebar-mask").classList.add("show"); }
  var reveal=function(){ $("sidebar").scrollTop += $("dict-box").getBoundingClientRect().top - $("sidebar").getBoundingClientRect().top - 38; };
  reveal();
  lookup.then(function(){if(studyLastLookup && studyLastLookup.word===studyNormalize(w))reveal();});
}
async function studyOpenSource(id){
  var ctx = studySentences[id]; if(!ctx) return;
  await openPaper(ctx.year,ctx.type);
  if(curYear !== ctx.year || curType !== ctx.type || !$("view-paper").classList.contains("active")) return;
  var el = Array.from(document.querySelectorAll("#paper-body [data-sentence]")).find(function(e){return e.dataset.sentence===id;});
  if(el){ el.scrollIntoView({block:"center",behavior:"auto"}); el.classList.add("sentence-focus"); setTimeout(function(){el.classList.remove("sentence-focus");},2500); }
}
function studySavedItem(word){
  if(!studyLastLookup || studyLastLookup.word !== word) return null;
  var ctx=studyLastLookup.context, found=studyLastLookup.entry;
  var reviewed=studySense(word,ctx), sense=reviewed || studyReference(word,ctx), general=found ? found.entry.tr : "";
  if(!sense && !general) return null;
  return {w:word,base:found ? found.base : word,ph:found ? found.entry.ph : "",tr:sense || general,generalTr:general,contextTr:sense,contextKind:reviewed?'reviewed':sense?'translation-match':'',
    year:ctx ? ctx.year : null,type:ctx ? ctx.type : null,sentenceId:ctx ? ctx.id : null,sent:ctx ? ctx.sent : "",sentZh:ctx ? ctx.sentZh : "",ts:Date.now(),contentVersion:SITE_MANIFEST.version};
}
async function studyRefreshSaved(items){
  var pending=items.filter(function(it){return it.year && it.sent && it.contentVersion !== SITE_MANIFEST.version && !studyMigrationPending.has(it.w);});
  if(!pending.length) return;
  pending.forEach(function(it){studyMigrationPending.add(it.w);});
  try{
    await studyLoadDictionary();
    await Promise.all(Array.from(new Set(pending.map(function(it){return it.year;}))).map(studyLoadYear));
    var changed=false, all=wbAll();
    pending.forEach(function(old){
      var it=all.find(function(x){return x.w===old.w;}); if(!it || it.sent!==old.sent) return;
      var oldKey=studyKey(it.sent);
      var candidates=Object.values(studySentences).filter(function(s){return s.year===Number(it.year) && studyHasWord(s,studyNormalize(it.w)) && (studyKey(s.sent)===oldKey || oldKey.includes(studyKey(s.sent)));});
      var ctx=candidates.find(function(s){return studySense(studyNormalize(it.w),s);}) || candidates[0];
      if(!ctx) return;
      var reviewed=studySense(studyNormalize(it.w),ctx),sense=reviewed || studyReference(studyNormalize(it.w),ctx);
      var currentEntry=studyEntry(studyNormalize(it.w));
      if(sense){it.generalTr=currentEntry ? currentEntry.entry.tr : it.generalTr || it.tr;it.contextTr=sense;it.tr=sense;it.contextKind=reviewed?'reviewed':'translation-match';}
      it.sent=ctx.sent;it.sentZh=ctx.sentZh;it.sentenceId=ctx.id;it.type=ctx.type;it.contentVersion=SITE_MANIFEST.version;changed=true;
    });
    if(changed && store("ky_wordbook",all)!==null && $("view-wordbook").classList.contains("active")) renderWordbook();
  }catch(e){ /* Saved entries remain readable if a content file cannot be fetched. */ }
  finally {pending.forEach(function(it){studyMigrationPending.delete(it.w);});}
}
