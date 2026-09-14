const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {JSDOM,VirtualConsole}=require('jsdom');
const root=path.join(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const json=p=>JSON.parse(read(p));
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn){for(let i=0;i<200;i++){if(fn())return;await pause(10);}assert.fail('Timed out waiting for application state');}
function setup(t,{fetcher,stored={}}={}){
 const errors=[],requests=[];
 const vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));
 const dom=new JSDOM(read('index.html').replace(/<script\b[\s\S]*?<\/script>/g,''),{url:'https://example.test/kaoyan-english1/',runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:vc});
 const w=dom.window;w.scrollTo=()=>{};w.HTMLElement.prototype.scrollIntoView=function(){};w.matchMedia=()=>({matches:false});w.AbortController=AbortController;
 const local=async url=>({ok:true,json:async()=>json(new URL(url,w.location.href).pathname.replace('/kaoyan-english1/',''))});
 w.fetch=async(url,options)=>{requests.push([url,options]);return fetcher?fetcher(url,options,local):local(url);};
 for(const [k,v]of Object.entries(stored))w.localStorage.setItem(k,JSON.stringify(v));
 for(const name of ['manifest.js','study.js','app.js']){const script=w.document.createElement('script');script.textContent=read(name);w.document.body.appendChild(script);}
 t.after(()=>{dom.window.close();assert.deepEqual(errors,[],'No uncaught runtime errors');});
 return {w,requests,dom};
}
function shape(v){
 if(Array.isArray(v)){
  if(v.length>=2&&typeof v[0]==='string'&&typeof v[1]==='string')return [v[0]];
  return v.map(shape);
 }
 if(v&&typeof v==='object')return Object.fromEntries(Object.entries(v).filter(([k])=>!['zh','directions_zh','image_desc','sentences','directionSentences'].includes(k)).map(([k,x])=>[k,shape(x)]));
 return v;
}
test('All source English, module structures and answers are preserved; every translation is paired',()=>{
 const baseline=json('tests/content-baseline.json');let pairs=0,modules=0;const ids=new Set();
 function inspect(v){
  if(!v||typeof v!=='object')return;
  for(const k of ['sentences','directionSentences'])if(v[k]){
   const source=k==='directionSentences'?v.directions_en:v.en;
   assert.equal(v[k].map(s=>s.en).join(' ').replace(/\s+/g,' ').trim(),source.replace(/\s+/g,' ').trim());
   for(const s of v[k]){assert.ok(s.zh.trim()&&s.en.trim(),s.id);assert.ok(!ids.has(s.id),s.id);ids.add(s.id);pairs++;}
  }
  if(Array.isArray(v)&&typeof v[0]==='string'&&v[2]?.sentences){inspect({en:v[0],sentences:v[2].sentences});return;}
  Object.entries(v).forEach(([k,x])=>{if(!['sentences','directionSentences'].includes(k))inspect(x);});
 }
 for(let y=1998;y<=2025;y++){
  const parts=json('data/'+y+'.json');modules+=parts.length;
  assert.equal(crypto.createHash('sha256').update(JSON.stringify(shape(parts))).digest('hex'),baseline.years[y],'Source preserved for '+y);inspect(parts);
 }
 assert.equal(modules,133);assert.ok(pairs>9700);
 for(const [y,i,text]of baseline.images)assert.equal(json('data/'+y+'.json').find(x=>x.type==='writing').data[i].image_desc,text);
 assert.match(json('data/1998.json').find(x=>x.type==='writing').data[0].image_desc,/漫画内容/);
});
test('Homepage is lazy; all 133 modules render and one year fetch is reused',async t=>{
 const {w,requests}=setup(t);assert.equal(requests.length,0);assert.equal(w.DICT,null);assert.equal(w.$('stat-papers').textContent,'133');
 let count=0;
 for(const y of w.YEARS)for(const type of w.SITE_MANIFEST.years[y]){
  await w.openPaper(y,type);assert.match(w.$('view-paper').textContent,new RegExp(y+' 年'));assert.ok(w.$('paper-body').querySelector('.biline'),y+':'+type);count++;
 }
 assert.equal(count,133);assert.equal(requests.length,28);assert.equal(w.DICT,null);
});
test('Navigation races, leaving a loading page and failed-year retry',async t=>{
 let release,fail=true;
 const {w,requests}=setup(t,{fetcher:async(url,opts,local)=>{
  if(url.includes('2024'))await new Promise(r=>release=r);
  if(url.includes('2023')&&fail){fail=false;throw Error('offline');}return local(url);
 }});
 const old=w.openPaper(2024,'reading');await w.openPaper(2025,'reading');release();await old;
 assert.match(w.$('view-paper').textContent,/2025 年/);
 await w.openPaper(2023,'reading');assert.ok(w.$('retry-paper'));w.$('retry-paper').click();await until(()=>w.$('paper-body'));assert.match(w.$('view-paper').textContent,/2023 年/);
 assert.equal(requests.filter(x=>x[0].includes('2023')).length,2);
 const pending=w.openPaper(2022,'reading');w.switchView('home');await pending;assert.ok(w.$('view-home').classList.contains('active'));
});
test('Source-specific lookup, inflections, phrases, current paper priority and saved senses',async t=>{
 const {w,requests}=setup(t);await w.openPaper(2025,'reading');
 const taught=Object.values(w.studySentences).find(s=>s.sent.startsWith('Employers surveyed'));
 await Promise.all([w.studyLoadDictionary(),w.studyLoadDictionary()]);assert.equal(requests.filter(x=>x[0].includes('dictionary')).length,1);
 for(const [word,expected]of [['covet',/最看重/],['argue',/论证/],['hires',/新雇用/],['new hires',/新员工/],['which',/技术知识/]]){
  await w.dictLookup(word,taught);assert.equal(w.studyLastLookup.context.id,taught.id);assert.match(w.$('dict-result').textContent,expected);
 }
 await w.dictLookup('argue');assert.equal(w.studyLastLookup.context.id,taught.id);w.addToWordbook('argue');
 let saved=w.wbFind('argue');assert.match(saved.contextTr,/论证/);assert.equal(saved.sent,taught.sent);assert.equal(saved.sentZh,taught.sentZh);
 await w.dictLookup('covet',taught);w.addToWordbook('covet');assert.equal(w.wbCount(),2);
 const phrase=Object.values(w.studySentences).find(s=>s.glossary?.['switch off']);await w.dictLookup('switch off',phrase);assert.ok(w.studySense('switch off',phrase));w.addToWordbook('switch off');assert.equal(w.wbCount(),3);
 assert.equal(w.studyEntry('children').base,'child');assert.ok(w.studyEntry('running'));
 await w.studyLoadYear(2003);await w.studyLoadYear(2007);
 const senses=Object.values(w.studySentences).filter(s=>s.glossary?.security);
 assert.ok(senses.length>=2);assert.ok(new Set(senses.map(s=>s.glossary.security)).size>=2);
 for(const s of senses){await w.dictLookup('security',s);assert.equal(w.studyLastLookup.context.id,s.id);w.addToWordbook('security');assert.equal(w.wbFind('security').sent,s.sent);}
 const battery=Object.values(w.studySentences).find(s=>s.sent.startsWith('An electric car battery'));
 await w.dictLookup('battery',battery);assert.match(w.$('dict-result').textContent,/译文对应义（参考）/);assert.equal(w.studyReference('battery',battery),'电池');w.addToWordbook('battery');assert.equal(w.wbFind('battery').contextKind,'translation-match');
 w.switchView('home');await w.dictLookup('covet');assert.ok(w.studyLastLookup.context);assert.ok(w.studyIndex);
});
test('Sector uses the actual industry or public-sector context and upgrades old saved definitions',async t=>{
 const old={w:'sector',tr:'n. 扇形, 部门, 部分',generalTr:'n. 扇形, 部门, 部分',year:2025,type:'reading',sentenceId:'128.data.0.lines.10#0',sent:'Critics also overlook the economic value of the arts sector itself.',sentZh:'批评者还忽视了艺术产业本身的经济价值。',contentVersion:'20260914-context-v1',ts:1};
 const {w}=setup(t,{stored:{ky_wordbook:[old]}});
 await w.openPaper(2025,'reading');await w.dictLookup('sector');
 assert.equal(w.studyLastLookup.context.id,old.sentenceId);assert.match(w.$('dict-result').querySelector('.d-context-sense').textContent,/行业、产业/);
 assert.match(w.DICT.sector.tr,/行业, 产业/);
 w.switchView('wordbook');w.renderWordbook();await until(()=>w.wbFind('sector').contentVersion===w.SITE_MANIFEST.version);
 const saved=w.wbFind('sector');assert.equal(saved.sent,old.sent);assert.equal(saved.ts,old.ts);assert.equal(w.wbCount(),1);assert.match(saved.contextTr,/艺术行业/);assert.match(saved.generalTr,/行业, 产业/);assert.equal(saved.contextKind,'reviewed');
 await w.studyLoadYear(2012);
 const publicContext=w.studySentences['63.data.3.lines.0#3'];await w.dictLookup('sector',publicContext);assert.equal(w.studyLastLookup.context.id,publicContext.id);assert.match(w.$('dict-result').querySelector('.d-context-sense').textContent,/公共部门/);
 const plural=w.studySentences['128.data.1.questions.3.options.3#0'];await w.dictLookup('sectors',plural);assert.equal(w.studyLastLookup.context.id,plural.id);assert.match(w.$('dict-result').querySelector('.d-context-sense').textContent,/行业/);
 for(const year of [2000,2010,2017,2020])await w.studyLoadYear(year);
 const contexts=Object.values(w.studySentences).filter(s=>/\bsectors?\b/i.test(s.en));assert.equal(contexts.length,29);
 for(const s of contexts)assert.ok(w.studySense('sector',s),s.id);
 assert.equal(w.WB_PAGE_SIZE,20);
});
test('Lookup failures can retry and stale suggestions cannot replace the newest query',async t=>{
 let fail=true;
 const {w}=setup(t,{fetcher:async(url,opts,local)=>{if(url.includes('dictionary.json')&&fail){fail=false;throw Error('offline');}return local(url);}});
 await w.dictLookup('covet');assert.match(w.$('dict-result').textContent,/加载失败/);
 await w.dictLookup('covet');assert.match(w.$('dict-result').textContent,/最看重/);
 const old=w.dictLookup('recieve');const latest=w.dictLookup('argue');await Promise.all([old,latest]);assert.equal(w.studyLastLookup.word,'argue');assert.equal(w.$('dict-result').querySelector('.d-word').textContent,'argue');
 const suggestions=await w.dictSuggest('recieve');assert.ok(suggestions.includes('receive'));
 await w.dictLookup('<img src=x onerror=alert(1)>');assert.equal(w.$('dict-result').querySelector('img'),null);
});
test('Options reveal correct answers; vocabulary clicks do not answer questions',async t=>{
 const {w}=setup(t);await w.openPaper(2025,'reading');
 const q=w.$('paper-body').querySelector('.q-block'),opt=q.querySelector('.opt');
 const kw=w.document.createElement('span');kw.dataset.lookup='covet';kw.textContent='covet';opt.appendChild(kw);kw.click();assert.equal(q.classList.contains('revealed'),false);
 opt.click();assert.ok(q.classList.contains('revealed'));assert.equal(q.querySelector('.correct').dataset.k,q.dataset.answer);
 const second=w.$('paper-body').querySelectorAll('.q-block')[1].querySelector('.opt');second.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Enter',bubbles:true}));assert.ok(second.closest('.q-block').classList.contains('revealed'));
 await until(()=>w.studyLastLookup);
});
test('Favorites, daily check-in, calendar and preferences persist',async t=>{
 const {w}=setup(t);await w.openPaper(2025,'reading');w.$('paper-fav').click();assert.ok(w.isFav(2025,'reading'));assert.match(w.$('fav-list').textContent,/2025/);
 for(const type of w.TYPES)w.markDone(2025,type.id);assert.equal(w.doneStore()[w.todayStr()].length,5);assert.equal(w.store('ky_checkins')[w.todayStr()],1);assert.match(w.$('tp-text').textContent,/5\/5/);
 w.toggleTheme();w.changeFont(1);w.toggleZh();assert.equal(w.store('ky_theme'),'dark');assert.equal(w.localStorage.getItem('ky_font'),'17');assert.equal(w.store('ky_zh_hidden'),true);
 const old=w.$('cal-title').textContent;w.calMove(-1);assert.notEqual(w.$('cal-title').textContent,old);
 const restored=setup(t,{stored:{ky_theme:'dark',ky_font:17,ky_zh_hidden:true,ky_favs:['2025:reading']}}).w;
 assert.equal(restored.document.documentElement.dataset.theme,'dark');assert.equal(restored.document.documentElement.style.fontSize,'17px');assert.ok(restored.document.body.classList.contains('zh-hidden'));assert.ok(restored.isFav(2025,'reading'));
});
test('Old saved vocabulary migrates to sentence context; pagination keeps 20 entries per page',async t=>{
 const parts=json('data/2025.json'),p=parts.find(x=>x.type==='reading').data[0].lines.find(x=>x[0].includes('Employers surveyed'));
 const {w}=setup(t,{stored:{ky_wordbook:[{w:'covet',ph:'',tr:'vt. 贪求',year:2025,sent:p[0].replace(/\*\*/g,''),sentZh:'旧译文',ts:1}]}});
 w.switchView('wordbook');w.renderWordbook();await until(()=>w.wbFind('covet').contentVersion);assert.match(w.wbFind('covet').tr,/最看重/);assert.notEqual(w.wbFind('covet').sentZh,'旧译文');
 const visibleWords=()=>Array.from(w.$('wb-list').querySelectorAll('.wb-item'),item=>item.dataset.item);
 for(const count of [20,21,41]){
  const list=Array.from({length:count},(_,i)=>({w:'test'+i,tr:'测试',ts:i}));w.store('ky_wordbook',list);w.wbGoPage(1);
  const total=Math.ceil(count/20);assert.equal(w.wbTotalPages(),total);assert.equal(Boolean(w.$('wb-list').querySelector('.wb-pager')),total>1);
  for(let page=1;page<=total;page++){
   assert.deepEqual(visibleWords(),list.slice((page-1)*20,page*20).map(item=>item.w),count+' words, page '+page);
   assert.ok(w.$('wb-head-meta').textContent.includes('第 '+page+'/'+total+' 页'));
   if(page<total)w.$('wb-list').querySelector('.wb-pager button:last-child').click();
  }
  assert.equal(w.wbCount(),count,'Pagination retains every saved entry');
 }
 w.$('wb-list').querySelector('[data-del="test40"]').click();
 assert.equal(w.wbCount(),40);assert.equal(w.wbTotalPages(),2);
 assert.deepEqual(visibleWords(),Array.from({length:20},(_,i)=>'test'+(i+20)));
 assert.ok(w.$('wb-head-meta').textContent.includes('第 2/2 页'));assert.equal(w.$('wb-list').querySelector('.wb-pager .cur').dataset.page,'2');
});
test('JSON backup round-trip restores study state and merges contextual vocabulary',async t=>{
 const {w}=setup(t);await w.openPaper(2025,'reading');await w.dictLookup('argue');w.addToWordbook('argue');w.toggleFav(2025,'reading');w.markDone(2025,'reading');
 const data=w.collectData();w.store('ky_wordbook',[]);w.store('ky_favs',[]);w.store('ky_done',{});
 const input={files:[new w.File([JSON.stringify(data)],'backup.json',{type:'application/json'})],value:'backup.json'};w.importJSON(input);await until(()=>w.wbCount()===1);
 assert.equal(w.wbFind('argue').contextTr,data.wordbook[0].contextTr);assert.ok(w.isFav(2025,'reading'));assert.ok(w.isDoneToday('reading'));
 const before=w.collectData();w.importJSON({files:[new w.File(['{"done":[],"wordbook":{}}'],'bad.json')],value:'bad.json'});await until(()=>w.$('toast').textContent.includes('导入失败'));assert.equal(JSON.stringify(w.collectData().wordbook),JSON.stringify(before.wordbook));
});
test('Optional online/audio failures leave local study usable; sync uses only explicit calls',async t=>{
 const {w,requests}=setup(t,{fetcher:async(url,opts,local)=>{
  if(url.startsWith('https://api.dictionaryapi'))throw Error('offline');
  if(url.startsWith('https://sync.example.test'))return {ok:true,json:async()=>[{k:'favs',v:['2025:reading']}]};return local(url);
 }});
 await w.dictLookup('covet');const body=w.$('dict-online-body');w.dictOnlineLookup('covet',body,false);await until(()=>body.textContent.includes('暂时不可用'));assert.match(w.$('dict-result').textContent,/最看重/);
 let spoken=0;w.Audio=function(){this.play=()=>Promise.reject(Error('offline'));};w.SpeechSynthesisUtterance=function(){};w.speechSynthesis={getVoices:()=>[],speak:()=>spoken++};w.dictSpeak('covet','us');await until(()=>spoken>0);
 assert.equal(requests.filter(x=>x[0].includes('sync.example')).length,0);w.sbSave('https://sync.example.test','test-key');w.supabasePush();await until(()=>w.$('sync-status').textContent.includes('上传成功'));w.supabasePull();await until(()=>w.$('sync-status').textContent.includes('合并成功'));assert.ok(w.isFav(2025,'reading'));
});
