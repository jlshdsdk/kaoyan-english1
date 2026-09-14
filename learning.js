"use strict";
// These records belong to individual major questions, not the daily task schedule.
function learningKeyValid(key){
  var match=/^(\d{4}):(reading|cloze|newtype|translate|writing):([1-9]\d*)$/.exec(key);
  return !!(match && SITE_MANIFEST.years[match[1]] && SITE_MANIFEST.years[match[1]].includes(match[2]) && Number(match[3])<=20);
}
function learningDateValid(value){
  if(typeof value!=="string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.slice(0,4)==='0000')return false;
  var parsed=new Date(value+'T12:00:00Z');
  return !isNaN(parsed.getTime()) && parsed.toISOString().slice(0,10)===value;
}
function learningValidate(records){
  if(!records || typeof records!=="object" || Array.isArray(records))throw new Error('学习标记格式不正确');
  var clean=Object.create(null);
  Object.keys(records).forEach(function(key){
    var item=records[key];
    if(!learningKeyValid(key) || !item || typeof item.studied!=="boolean" ||
      !Number.isFinite(item.updatedAt) || item.updatedAt<0 ||
      (item.studied ? !learningDateValid(item.date) : item.date!==null))throw new Error('学习标记或日期格式不正确');
    clean[key]={studied:item.studied,date:item.date,updatedAt:item.updatedAt};
  });
  return clean;
}
function learningMarks(){
  var records=store('ky_study_marks');
  return learningValidate(records || {});
}
function learningMerge(local,incoming){
  var merged=learningValidate(local), received=learningValidate(incoming);
  Object.keys(received).forEach(function(key){
    if(!merged[key] || received[key].updatedAt>merged[key].updatedAt)merged[key]=received[key];
  });
  return merged;
}
function learningControl(key,title){
  var dateId='learning-date-'+key.replace(/:/g,'-');
  return '<div class="learning-record" data-learning-key="'+esc(key)+'">' +
    '<button type="button" class="pbtn learning-toggle" data-learning-toggle aria-pressed="false" title="标记'+esc(title)+'的学习状态">未学习</button>' +
    '<div class="learning-date-row"><label for="'+dateId+'">学习日期</label>' +
    '<input type="date" id="'+dateId+'" data-learning-date aria-label="'+esc(title)+'的学习日期" title="学习日期，修改后自动保存" disabled>' +
    '<span class="learning-save-note">尚未记录</span></div></div>';
}
function learningRefresh(){
  var records=learningMarks();
  document.querySelectorAll('[data-learning-key]').forEach(function(host){
    var record=records[host.dataset.learningKey],studied=!!(record && record.studied);
    var button=host.querySelector('[data-learning-toggle]'),input=host.querySelector('[data-learning-date]');
    button.textContent=studied?'✓ 已学习':'未学习';button.classList.toggle('on',studied);button.setAttribute('aria-pressed',String(studied));
    input.disabled=!studied;input.value=studied?record.date:'';
    host.querySelector('.learning-save-note').textContent=studied?'修改后自动保存':'尚未记录';
  });
}
function learningSave(key,studied,date){
  if(!learningKeyValid(key))return false;
  if(studied && !learningDateValid(date)){
    toast('请选择有效的学习日期');learningRefresh();return false;
  }
  var all=learningMarks(),old=all[key];
  all[key]={studied:studied,date:studied?date:null,updatedAt:Math.max(Date.now(),old?old.updatedAt+1:0)};
  if(store('ky_study_marks',all)===null){learningRefresh();return false;}
  learningRefresh();return true;
}
function learningBind(){
  $('view-paper').addEventListener('click',function(e){
    var button=e.target.closest('[data-learning-toggle]');if(!button)return;
    var host=button.closest('[data-learning-key]'),key=host.dataset.learningKey,old=learningMarks()[key];
    var studied=!(old && old.studied);
    if(learningSave(key,studied,studied?todayStr():null))toast(studied?'已标记为已学习，日期已保存':'已标记为未学习');
  });
  $('view-paper').addEventListener('change',function(e){
    var input=e.target.closest('[data-learning-date]');if(!input || input.disabled)return;
    var key=input.closest('[data-learning-key]').dataset.learningKey;
    if(learningSave(key,true,input.value))toast('学习日期已保存');
  });
  window.addEventListener('storage',function(e){
    if(e.key==='ky_study_marks' || e.key===null)learningRefresh();
  });
}
