// ---- Robuster Start ----
(function init(){
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setup, { once: true });
  } else {
    setup();
  }
})();

function setup(){

/* ---------- Speicher ---------- */
function makeSafeStorage(key){
  let memory = {};
  try {
    localStorage.setItem("__test__", "1");
    localStorage.removeItem("__test__");
    return {
      load(){ try { return JSON.parse(localStorage.getItem(key) || "{}"); } catch { return {}; } },
      save(obj){ try { localStorage.setItem(key, JSON.stringify(obj)); } catch {} }
    };
  } catch {
    return {
      load(){ return memory[key] ? JSON.parse(memory[key]) : {}; },
      save(obj){ memory[key] = JSON.stringify(obj); }
    };
  }
}
const storage = makeSafeStorage("stoch_state");

/* ---------- App-State ---------- */
let app = (() => {
  const d = storage.load();
  return {
    exercises: Array.isArray(d.exercises) ? d.exercises : [],
    work: Array.isArray(d.work) ? d.work : [20,30,40,45,60],
    rest: Array.isArray(d.rest) ? d.rest : [10,15,20,30],
    mode: d.mode || "rounds",
    modeValue: Number.isFinite(d.modeValue) ? d.modeValue : 20,
    noRepeat: d.noRepeat || "both",
    prep: (d.prep ?? true),
    ttsEnabled: d.ttsEnabled ?? true,
    ttsVoice: d.ttsVoice || "",
    ttsRate: Number.isFinite(d.ttsRate) ? d.ttsRate : 1.0
  };
})();
function save(){ storage.save(app); }

/* ---------- DOM ---------- */
const els = {
  // Einstellungen
  exerciseInput: document.getElementById("exerciseInput"),
  addExercise: document.getElementById("addExercise"),
  exerciseList: document.getElementById("exerciseList"),
  workOptions: document.getElementById("workOptions"),
  restOptions: document.getElementById("restOptions"),
  mode: document.getElementById("mode"),
  modeLabel: document.getElementById("modeLabel"),
  modeValue: document.getElementById("modeValue"),
  noRepeat: document.getElementById("noRepeat"),
  prep: document.getElementById("prep"),
  saveSettings: document.getElementById("saveSettings"),
  exportBtn: document.getElementById("exportBtn"),
  importBtn: document.getElementById("importBtn"),
  importFile: document.getElementById("importFile"),
  clearBtn: document.getElementById("clearBtn"),
  // TTS
  ttsToggle: document.getElementById("ttsToggle"),
  voiceSelect: document.getElementById("voiceSelect"),
  ttsRate: document.getElementById("ttsRate"),
  ttsTestBtn: document.getElementById("ttsTestBtn"),
  // Training
  startBtn: document.getElementById("startBtn"),
  pauseBtn: document.getElementById("pauseBtn"),
  skipBtn: document.getElementById("skipBtn"),
  stopBtn: document.getElementById("stopBtn"),
  state: document.getElementById("state"),
  timeLeft: document.getElementById("timeLeft"),
  exerciseNow: document.getElementById("exerciseNow"),
  progress: document.getElementById("progress"),
  roundInfo: document.getElementById("roundInfo"),
  // Views / Tabs / Fullscreen
  tabSettings: document.getElementById("tabSettings"),
  tabRun: document.getElementById("tabRun"),
  viewSettings: document.getElementById("view-settings"),
  viewRun: document.getElementById("view-run"),
  btnFullscreen: document.getElementById("btnFullscreen")
};

/* ---------- Helpers ---------- */
function toNumList(str){ return (str||"").split(/[,;\s]+/).map(s=>s.trim()).filter(Boolean).map(Number).filter(n=>Number.isFinite(n)&&n>0); }
function fmtMMSS(sec){ const m=Math.floor(sec/60),s=sec%60;return `${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`; }
function normalizeLists(){
  app.work=[...new Set(app.work.map(n=>Math.max(1,Math.round(n))))].sort((a,b)=>a-b);
  app.rest=[...new Set(app.rest.map(n=>Math.max(1,Math.round(n))))].sort((a,b)=>a-b);
}
function flash(btn){ if(!btn)return; const t=btn.textContent; btn.textContent="Gespeichert ✓"; setTimeout(()=>btn.textContent=t,1000); }

/* ---------- View Handling ---------- */
function showView(which){
  const isSettings = which === "settings";
  els.viewSettings.classList.toggle("active", isSettings);
  els.viewRun.classList.toggle("active", !isSettings);
  els.tabSettings.classList.toggle("active", isSettings);
  els.tabRun.classList.toggle("active", !isSettings);
  try{ localStorage.setItem("stoch_view", which); }catch{}
}
try{
  const last = localStorage.getItem("stoch_view");
  showView(last === "run" ? "run" : "settings");
}catch{ showView("settings"); }

async function toggleFullscreen(){
  const el = document.documentElement;
  const isFs = !!(document.fullscreenElement || document.webkitFullscreenElement);
  try{
    if(!isFs){
      if(el.requestFullscreen) await el.requestFullscreen();
      else if(el.webkitRequestFullscreen) await el.webkitRequestFullscreen();
    }else{
      if(document.exitFullscreen) await document.exitFullscreen();
      else if(document.webkitExitFullscreen) await document.webkitExitFullscreen();
    }
  }catch(e){}
}

/* ---------- Sprachansage ---------- */
let voices=[]; 
const hasTTS=("speechSynthesis"in window)&&("SpeechSynthesisUtterance"in window);
let ttsPrimed = false;

function loadVoices(){
  if(!hasTTS||!els.voiceSelect)return;
  voices=speechSynthesis.getVoices()||([]);
  voices.sort((a,b)=>{
    const ad=(a.lang||"").toLowerCase().startsWith("de")?0:1;
    const bd=(b.lang||"").toLowerCase().startsWith("de")?0:1;
    if(ad!==bd)return ad-bd;
    return (a.name||"").localeCompare(b.name||"");
  });
  els.voiceSelect.innerHTML="";
  const opt=document.createElement("option");
  opt.value=""; opt.textContent="(Standardstimme)";
  els.voiceSelect.appendChild(opt);
  voices.forEach(v=>{
    const o=document.createElement("option");
    o.value=v.name; o.textContent=`${v.name} — ${v.lang}`;
    els.voiceSelect.appendChild(o);
  });
  if(app.ttsVoice){ els.voiceSelect.value=app.ttsVoice; }
}
if(hasTTS){
  if(speechSynthesis.getVoices().length===0){ speechSynthesis.onvoiceschanged=loadVoices; }
  else { loadVoices(); }
}

function ttsPrime(){
  if(!hasTTS || ttsPrimed) return;
  try{
    speechSynthesis.cancel(); speechSynthesis.resume();
    const u = new SpeechSynthesisUtterance(".");
    u.lang="de-DE"; u.volume=0; u.rate=1;
    speechSynthesis.speak(u);
    ttsPrimed = true;
  }catch{}
}

function speak(text){
  if(!hasTTS||!app.ttsEnabled)return;
  try{
    speechSynthesis.cancel(); speechSynthesis.resume();
    const u=new SpeechSynthesisUtterance(text);
    u.lang="de-DE"; 
    u.rate=Math.min(2,Math.max(0.5, app.ttsRate||1));
    if(app.ttsVoice){ const v=voices.find(v=>v.name===app.ttsVoice); if(v)u.voice=v; }
    setTimeout(()=>{ try{ speechSynthesis.resume(); }catch{} speechSynthesis.speak(u); },250);
  }catch(e){}
}

/* ---------- Audio (mit iOS Unlock) ---------- */
function makeBeep(){
  let ctx = null;

  function ensure(){
    if(!ctx){
      const AC = window.AudioContext || window.webkitAudioContext;
      if(!AC) return null;
      ctx = new AC();
    }
    if (ctx && ctx.state === "suspended") { ctx.resume(); }
    return ctx;
  }

  function unlock(){
    const c = ensure(); if(!c) return;
    const o = c.createOscillator(), g = c.createGain();
    o.type = "sine"; o.frequency.value = 440;
    o.connect(g); g.connect(c.destination);
    const now = c.currentTime;
    g.gain.setValueAtTime(0.00001, now);
    o.start(now); o.stop(now + 0.02);
  }

  function tone(freq,dur){
    const c=ensure(); if(!c)return;
    const o=c.createOscillator(), g=c.createGain();
    o.type="sine"; o.frequency.value=freq; o.connect(g); g.connect(c.destination);
    const now=c.currentTime;
    g.gain.setValueAtTime(0.001,now);
    g.gain.exponentialRampToValueAtTime(0.22,now+0.02);
    g.gain.exponentialRampToValueAtTime(0.001,now+dur/1000);
    o.start(); o.stop(now+dur/1000+0.02);
  }

  const api = (kind)=>{
    if(kind==="beep") tone(880,120);
    else if(kind==="long") tone(880,400);
    else if(kind==="bell") tone(440,220);
    else tone(660,100);
  };
  api.unlock = unlock;
  return api;
}
const buzzer = makeBeep();

/* ---------- Rendering ---------- */
function renderExercises(){
  els.exerciseList.innerHTML="";
  if(app.exercises.length===0){
    const li=document.createElement("li");
    li.innerHTML='<span style="color:#9aa0a6">Noch keine Übungen. Tippe oben etwas ein und drücke „Hinzufügen“.</span>';
    els.exerciseList.appendChild(li); return;
  }
  app.exercises.forEach((name,i)=>{
    const li=document.createElement("li");
    const left=document.createElement("div"); left.className="flex";
    const pill=document.createElement("span"); pill.className="pill"; pill.textContent=`#${i+1}`;
    const span=document.createElement("span"); span.textContent=name;
    left.append(pill,span);
    const del=document.createElement("button"); del.textContent="Löschen"; del.className="ghost";
    del.onclick=()=>{app.exercises.splice(i,1);renderExercises();save();};
    li.append(left,del); els.exerciseList.appendChild(li);
  });
}
function renderSettings(){
  els.workOptions.value=app.work.join(",");
  els.restOptions.value=app.rest.join(",");
  els.mode.value=app.mode;
  els.modeValue.value=app.modeValue;
  els.noRepeat.value=app.noRepeat;
  els.prep.value=String(app.prep);
  els.modeLabel.textContent=app.mode==="rounds"?"Runden":"Minuten";
  els.ttsToggle.value=String(app.ttsEnabled);
  els.ttsRate.value=String(app.ttsRate);
}

/* ---------- Events ---------- */
function onAddExercise(){
  const v=(els.exerciseInput.value||"").trim();
  if(!v)return;
  app.exercises.push(v);
  els.exerciseInput.value="";
  renderExercises(); save();
}
els.addExercise.onclick=onAddExercise;
els.exerciseInput.addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();onAddExercise();}});

els.workOptions.oninput=e=>app.work=toNumList(e.target.value);
els.restOptions.oninput=e=>app.rest=toNumList(e.target.value);
els.mode.onchange=e=>{app.mode=e.target.value; els.modeLabel.textContent=app.mode==="rounds"?"Runden":"Minuten";};
els.modeValue.oninput=e=>{const n=+e.target.value;if(n>0)app.modeValue=n;};
els.noRepeat.onchange=e=>app.noRepeat=e.target.value;
els.prep.onchange=e=>app.prep=e.target.value==="true";
els.saveSettings.onclick=()=>{normalizeLists();save();flash(els.saveSettings);};
els.ttsToggle.onchange=e=>{app.ttsEnabled=e.target.value==="true";save();};
els.voiceSelect.onchange=e=>{app.ttsVoice=e.target.value;save();};
els.ttsRate.oninput=e=>{app.ttsRate=+e.target.value;save();};
if(els.ttsTestBtn) els.ttsTestBtn.onclick=()=>{ buzzer.unlock(); ttsPrime(); speak("Test der Sprachansage. Nächste Übung: Sprawls. 30 Sekunden."); };

// Tabs + Fullscreen
els.tabSettings.onclick = ()=> showView("settings");
els.tabRun.onclick = ()=> showView("run");
if(els.btnFullscreen) els.btnFullscreen.onclick = toggleFullscreen;

/* ---------- Timer / Session ---------- */
let session=null;

function startSession(){
  if(app.exercises.length===0||app.work.length===0||app.rest.length===0){
    alert("Bitte Übungen sowie Belastungs- und Pausenwerte definieren."); return;
  }
  buzzer.unlock(); ttsPrime();
  showView("run");

  normalizeLists(); save();
  const totalByRounds = app.mode==="rounds" ? app.modeValue : Infinity;
  const totalByMinutes = app.mode==="minutes" ? app.modeValue*60*1000 : Infinity;
  const sessionEndByMinutes = Date.now() + totalByMinutes;

  session={
    round:0,
    phase:"prep",
    stop:false,
    paused:false,
    endHard:sessionEndByMinutes,
    lastEx:null,lastW:null,lastR:null,
    _nextExercise:null,_nextWork:null,
    targetTime:0,
    pauseStarted:null
  };

  if(app.prep){ prepPhase(()=>startWork()); } else { startWork(); }

  function prepPhase(cb){
    els.state.textContent="Vorbereitung";
    els.state.className="pill state-pill";
    els.exerciseNow.textContent="3-2-1";
    countdownGeneric(3, ()=>{ buzzer("bell"); cb(); });
  }

  function nextPhase(){
    if (session.stop) return;

    if (session.phase === "work") {
      // Nach der Belastung im Rundenmodus ggf. beenden
      if (app.mode === "rounds") {
        const totalByRounds = app.modeValue;
        if (session.round >= totalByRounds) {
          stopSession(true);
          return;
        }
      }
      startRest();
    }
    else if (session.phase === "rest") {
      if (app.mode === "minutes" && Date.now() >= session.endHard) {
        stopSession(true);
        return;
      }
      startWork();
    }
  }

  function pick(list,last){
    if(list.length===1) return list[0];
    let v, tries=0;
    do{ v=list[Math.floor(Math.random()*list.length)]; tries++; if(tries>50)break; } while(app.noRepeat!=="off" && v===last);
    return v;
  }

  function setUI(kind,title,subtitle){
    els.state.textContent = title;
    els.state.className = "pill state-pill " + (kind==="work"?"state-work":"state-rest");
    els.exerciseNow.textContent = subtitle || "–";
    els.roundInfo.textContent = app.mode==="rounds" ? `Runde ${session.round}/${app.modeValue}` : `Runde ${session.round}`;
    buzzer("bell");
  }

  function startWork(){
    session.phase="work"; session.round++;
    let exercise, work;
    if(session._nextExercise && session._nextWork){
      exercise=session._nextExercise; work=session._nextWork;
      session._nextExercise=null; session._nextWork=null;
    } else {
      exercise=pick(app.exercises, app.noRepeat!=="off"?session.lastEx:null);
      work=pick(app.work, (app.noRepeat==="both"?session.lastW:null));
    }
    session.lastEx=exercise; session.lastW=work;
    setUI("work","Belastung",exercise);
    countdown(work, ()=> nextPhase());
  }

  function startRest(){
    session.phase="rest";
    const rest=pick(app.rest,(app.noRepeat==="both"?session.lastR:null));
    session.lastR=rest;
    setUI("rest","Pause","Atmen / lockern");

    const nextExercise=pick(app.exercises, app.noRepeat!=="off"?session.lastEx:null);
    const nextWork=pick(app.work,(app.noRepeat==="both"?session.lastW:null));
    session._nextExercise=nextExercise; session._nextWork=nextWork;

    setTimeout(()=>speak(`Nächste Übung: ${nextExercise}. ${nextWork} Sekunden.`),300);

    countdown(rest, ()=> startWork());
  }

  function countdown(seconds, done){
    const durMs = seconds * 1000;
    const start = Date.now();
    session.targetTime = start + durMs;
    let lastSecond = null;

    (function tick(){
      if(!session || session.stop) return;
      if(session.paused){ requestAnimationFrame(tick); return; }

      const remaining = Math.max(0, session.targetTime - Date.now());
      const secLeft = Math.ceil(remaining / 1000);
      const pct = Math.min(100, (1 - remaining/durMs) * 100);
      els.progress.style.width = pct.toFixed(1) + "%";
      els.timeLeft.textContent = fmtMMSS(secLeft);

      if (session.phase === "work") {
        if (secLeft <= 5 && secLeft > 0 && secLeft !== lastSecond) buzzer("beep");
        if (secLeft === 0 && lastSecond !== 0) buzzer("long");
      } else {
        if (secLeft <= 3 && secLeft > 0 && secLeft !== lastSecond) buzzer("beep");
      }

      lastSecond = secLeft;

      if (remaining <= 0) { 
        buzzer("bell");
        done(); 
        return; 
      }
      requestAnimationFrame(tick);
    })();
  }

  function countdownGeneric(seconds, done){
    const durMs = seconds * 1000;
    const start = Date.now();
    session.targetTime = start + durMs;
    (function tick(){
      if(!session || session.stop) return;
      if(session.paused){ requestAnimationFrame(tick); return; }
      const remaining = Math.max(0, session.targetTime - Date.now());
      const secLeft = Math.ceil(remaining/1000);
      els.progress.style.width = ((1 - remaining/durMs) * 100).toFixed(1) + "%";
      els.timeLeft.textContent = fmtMMSS(secLeft);
      if(secLeft <= 3 && secLeft > 0) buzzer("beep");
      if(remaining <= 0){ done(); return; }
      requestAnimationFrame(tick);
    })();
  }
}

function stopSession(completed=false){
  if(!session) return;
  session.stop = true;
  session.pauseStarted = null;
  session = null;
  els.state.textContent = completed ? "fertig" : "gestoppt";
  els.state.className = "pill state-pill";
  els.exerciseNow.textContent = "–";
  els.timeLeft.textContent = "00:00";
  els.progress.style.width = "0%";
  els.roundInfo.textContent = completed ? "Gute Arbeit!" : "—";
}

function togglePauseOrStart(){
  if(!session){ 
    buzzer.unlock(); ttsPrime(); 
    startSession(); 
    return; 
  }

  session.paused = !session.paused;

  if(session.paused){
    session.pauseStarted = Date.now();
  } else {
    const now = Date.now();
    const pausedMs = Math.max(0, now - (session.pauseStarted || now));
    session.pauseStarted = null;
    session.targetTime += pausedMs;
    if (app.mode === "minutes" && Number.isFinite((session?.endHard))) {
      session.endHard += pausedMs;
    }
  }

  if(els.pauseBtn) els.pauseBtn.textContent = session.paused ? "Weiter" : "Pause";
}

function skip(){
  if(session && !session.stop){
    session.targetTime = Date.now();
  }
}

/* ---------- Shortcuts ---------- */
document.addEventListener("keydown", (e)=>{
  const tag = (e.target.tagName || "").toLowerCase();
  const isTyping = tag === "input" || tag === "textarea" || e.target.isContentEditable;
  if(isTyping) return;

  if(e.code==="Space"){ e.preventDefault(); togglePauseOrStart(); }
  else if(e.key && e.key.toLowerCase()==="s"){ e.preventDefault(); skip(); }
  else if(e.key==="Escape"){ stopSession(); }
});

/* ---------- Buttons ---------- */
els.startBtn.onclick = () => { buzzer.unlock(); ttsPrime(); startSession(); };
els.pauseBtn.onclick = togglePauseOrStart;
els.skipBtn.onclick  = skip;
els.stopBtn.onclick  = stopSession;

renderExercises();
renderSettings();
loadVoices();
}
