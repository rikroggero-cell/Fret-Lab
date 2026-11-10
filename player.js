(() => {
'use strict';
const {parseStructure, finalizeStructure, recognize, buildContext, getAlgo, esc, rootLabel} = FE;
const $ = id => document.getElementById(id);
const PKEY = 'fretlab.player.v1';

/* ---------- figure ritmiche: note per battito ---------- */
const FIGS = [
  {id:'q',   label:'Semiminime (1/4)',            npb:1,   nv:'Quarter', tup:null},
  {id:'e',   label:'Crome (1/8)',                 npb:2,   nv:'Eighth',  tup:null},
  {id:'s',   label:'Semicrome (1/16)',            npb:4,   nv:'16th',    tup:null},
  {id:'t',   label:'Biscrome (1/32)',             npb:8,   nv:'32nd',    tup:null},
  {id:'qt',  label:'Terzine di semiminime',       npb:1.5, nv:'Quarter', tup:[3,2]},
  {id:'et',  label:'Terzine di crome',            npb:3,   nv:'Eighth',  tup:[3,2]},
  {id:'st',  label:'Terzine di semicrome',        npb:6,   nv:'16th',    tup:[3,2]},
  {id:'e5',  label:'Quintine di crome (5 in 2 battiti)', npb:2.5, nv:'Eighth', tup:[5,4]},
  {id:'s5',  label:'Quintine di semicrome (5 per battito)', npb:5, nv:'16th', tup:[5,4]}
];

/* ---------- stato ---------- */
const PDEF = {bpm:80, fig:'e', volM:70, volN:80, sub:false, count:true, loop:true, mode:'asc', start:'auto', n:6, dir:'asc', order:'1 2 3 2 3 4', move:'none', fv:null, fgi:0, title:''};
let P = Object.assign({}, PDEF);
try { Object.assign(P, JSON.parse(localStorage.getItem(PKEY) || '{}')); } catch(e){}
const saveP = () => { try { localStorage.setItem(PKEY, JSON.stringify(P)); } catch(e){} };
let S = null;

/* ---------- dati ---------- */
let patterns = [], ctx = null, struct = null, scaleName = '', F = [], FI = 0, selId = null, SEQ = {events:[], msg:''};

let bound = false;
function show(){
  const FL = window.FretLab; S = Object.assign({root:'C', degrees:'F 2 3 4 5 6 7', tuning:[40,45,50,55,59,64], label:'degree', notation:'en', rootSym:'F', color:'root', ghost:true, path:false, wood:'rosewood', algo:'caged', params:{}, flipStrings:false, flipFrets:false}, JSON.parse(JSON.stringify(FL.getState())));
  patterns = FL.getPatterns();
  FE.settings.notation = S.notation; FE.settings.rootSym = S.rootSym;
  if (!bound){ bind(); bound = true; }
  init(); recompute(true);
}
const noteLabel = (n) => {
  const d = ctx.structure.sorted[n.deg];
  return d ? FE.noteName(ctx.root, d, S.notation) : FE.midiName(n.midi, S.notation);
};
const strNo = s => ctx.n - s;      // corde contate dalla più acuta

/* ---------- diteggiature ---------- */
function sortNotes(notes){
  return notes.map(x => { const b = ctx.board[x.s][x.f]; return {s:x.s, f:x.f, midi:b.pitch, deg:b.deg}; })
    .sort((a, b) => a.midi - b.midi || a.s - b.s);
}
function computeFingerings(){
  F = []; selId = null;
  const algo = getAlgo(S.algo) || getAlgo('all');
  let defs = []; try { defs = algo.params(ctx) || []; } catch(e){}
  const params = {}; defs.forEach(d => { params[d.id] = (S.params && S.params[algo.id] && S.params[algo.id][d.id] !== undefined) ? S.params[algo.id][d.id] : (d.default !== undefined ? d.default : (d.options && d.options[0].value)); });
  const sel = defs.find(d => d.id === 'form' && d.type === 'select') || defs.find(d => d.id === 'start' && d.type === 'select');
  selId = sel ? sel.id : null;
  const hasForm = !!(sel && sel.id === 'form');
  const vals = sel ? sel.options.map(o => ({v:String(o.value), label:o.label})) : [{v:null, label:''}];
  const seen = new Set();
  for (const o of vals){
    const p = Object.assign({}, params, {octave:'all'}); if (sel) p[sel.id] = o.v;
    const run = FE.runAlgorithm(ctx, algo, p); if (run.error) continue;
    run.result.groups.forEach((g, gi) => {
      if (!g.notes.length) return;
      const notes = sortNotes(g.notes), key = notes.map(x => x.s + ':' + x.f).join(',');
      if (seen.has(key)) return; seen.add(key);
      const fr = notes.map(x => x.f), lo = Math.min(...fr), hi = Math.max(...fr);
      F.push({v:o.v, gi, formLabel:o.label.trim(), notes, group:g, lo, hi, low:notes[0].midi, lowStr:notes[0].s, hasForm});
    });
  }
  F.sort((a, b) => a.low - b.low || a.hi - b.hi);
  return {algo, hasSel: !!sel};
}
const fingLabel = f => (f.formLabel ? f.formLabel + ' · ' : '') + 'tasti ' + f.lo + '–' + f.hi;

/* ---------- generazione della sequenza ---------- */
function parseOrder(txt, N){
  const toks = txt.split(/[\s,;-]+/).filter(Boolean), out = [];
  for (const t of toks){ const k = Number(t); if (!Number.isInteger(k) || k < 1 || k > N) return {err: `Il numero "${t}" non è tra 1 e ${N}.`}; out.push(k); }
  if (!out.length) return {err: 'Scrivi almeno un numero.'};
  return {out};
}
function mkEv(fi, n){ return {fi, s:n.s, f:n.f, midi:n.midi, deg:n.deg}; }
function buildSequence(){
  const ev = []; let msg = '';
  if (!F.length) return {events:[], msg:'Nessuna diteggiatura disponibile per questa scala/algoritmo.'};
  const cur = F[FI], notes = cur.notes;
  const asc = notes.map(n => mkEv(FI, n)), desc = asc.slice().reverse();
  if (P.mode === 'asc') ev.push(...asc);
  else if (P.mode === 'desc') ev.push(...desc);
  else if (P.mode === 'ascdesc') ev.push(...asc, ...desc.slice(1));
  else if (P.mode === 'descasc') ev.push(...desc, ...asc.slice(1));
  else {
    const N = Math.max(2, Math.min(24, parseInt(P.n, 10) || 2));
    const po = parseOrder(P.order, N);
    if (po.err) return {events:[], msg:po.err, bad:true};
    const dirAsc = P.dir !== 'desc';
    let fi = FI, idx;
    const startIdx = (arr) => P.start === 'auto' || !(+P.start >= 0 && +P.start < arr.length) ? (dirAsc ? 0 : arr.length - 1) : +P.start;
    idx = startIdx(notes);
    const ordOf = (arr, i) => arr.slice(0, i).filter(x => x.s === arr[i].s).length;
    let s0 = notes[idx].s, ord0 = ordOf(notes, idx);
    for (let it = 0; it < 80; it++){
      const arr = F[fi].notes;
      if (dirAsc ? idx + N > arr.length : idx - N + 1 < 0){
        if (it === 0) msg = `Dalla nota di partenza scelta non ci sono ${N} note disponibili nella diteggiatura.`;
        break;
      }
      for (const k of po.out) ev.push(mkEv(fi, arr[dirAsc ? idx + k - 1 : idx - k + 1]));
      if (P.move === 'none') break;
      let ns = arr[idx].s, nf = fi;
      if (/^(below|above)/.test(P.move)){
        const k = +P.move.slice(-1); ns = s0 + (P.move.startsWith('above') ? k : -k);
      } else {
        const hasForm = F[fi].hasForm;
        const cand = F.map((f, j) => j).filter(j => hasForm || F[j].lowStr === F[FI].lowStr);
        const pos = cand.indexOf(fi); const nj = cand[pos + (P.move === 'next' ? 1 : -1)];
        if (nj === undefined) break;
        nf = nj; ns = s0;
        // le diteggiature candidate devono salire/scendere davvero
        if (P.move === 'next' ? F[nf].low <= F[fi].low : F[nf].low >= F[fi].low) break;
      }
      const narr = F[nf].notes, onS = narr.map((x, j) => j).filter(j => narr[j].s === ns);
      if (!onS.length) break;
      idx = onS[Math.min(ord0, onS.length - 1)]; fi = nf; s0 = ns;
    }
    if (!ev.length && !msg) msg = 'Nessuna nota generata.';
  }
  return {events: ev, msg};
}

/* ---------- audio ---------- */
let ac = null, gM = null, gN = null, clickBuf = {}, pluckCache = new Map();
function b64buf(b64){ const bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u.buffer; }
async function ensureAudio(){
  if (!ac){
    ac = new (window.AudioContext || window.webkitAudioContext)({latencyHint:'interactive'});
    gM = ac.createGain(); gN = ac.createGain();
    const comp = ac.createDynamicsCompressor(); comp.threshold.value = -10; comp.ratio.value = 6;
    gM.connect(comp); gN.connect(comp); comp.connect(ac.destination);
    applyVol();
    for (const k of ['accent', 'tick', 'sub']){
      try { clickBuf[k] = await ac.decodeAudioData(b64buf(window.FL_CLICKS[k])); } catch(e){ clickBuf[k] = synthClick(k); }
    }
  }
  if (ac.state === 'suspended') await ac.resume();
}
function synthClick(k){
  const sr = ac.sampleRate, len = Math.floor(sr * 0.06), b = ac.createBuffer(1, len, sr), d = b.getChannelData(0);
  const f = k === 'accent' ? 1700 : k === 'tick' ? 1150 : 800;
  for (let i = 0; i < len; i++) d[i] = Math.sin(2 * Math.PI * f * i / sr) * Math.exp(-i / (sr * 0.012));
  return b;
}
const applyVol = () => { if (!ac) return; gM.gain.value = Math.pow(P.volM / 100, 1.6) * 1.3; gN.gain.value = Math.pow(P.volN / 100, 1.6) * 1.0; };
function pluck(m){
  if (pluckCache.has(m)) return pluckCache.get(m);
  const sr = ac.sampleRate, f = 440 * Math.pow(2, (m - 69) / 12), N = Math.max(2, Math.round(sr / f)), len = Math.floor(sr * 1.5);
  const buf = ac.createBuffer(1, len, sr), d = buf.getChannelData(0), ring = new Float32Array(N);
  let seed = 1234567 + m * 7919; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296 * 2 - 1; };
  for (let i = 0; i < N; i++) ring[i] = rnd();
  for (let pass = 0; pass < 2; pass++) for (let i = 1; i < N; i++) ring[i] = 0.5 * (ring[i] + ring[i - 1]);   // timbro meno aspro
  const decay = Math.pow(0.5, 1 / (f * 1.1));
  let idx = 0, pk = 0;
  for (let n = 0; n < len; n++){
    const nx = idx + 1 === N ? 0 : idx + 1;
    d[n] = ring[idx]; pk = Math.max(pk, Math.abs(d[n]));
    ring[idx] = 0.5 * (ring[idx] + ring[nx]) * decay * 1.0005; idx = nx;
  }
  const g = pk ? 0.7 / pk : 1; for (let n = 0; n < len; n++) d[n] *= g;
  pluckCache.set(m, buf); return buf;
}
const live = new Set();
function playNote(m, t, tEnd){
  const src = ac.createBufferSource(); src.buffer = pluck(m);
  const g = ac.createGain(); const end = Math.min(tEnd, t + 1.4);
  g.gain.setValueAtTime(1, t); g.gain.setValueAtTime(1, Math.max(t, end - 0.008)); g.gain.linearRampToValueAtTime(0, end);
  src.connect(g); g.connect(gN); src.start(t); src.stop(end + 0.02);
  live.add(src); src.onended = () => live.delete(src);
}
function playClick(k, t){
  const src = ac.createBufferSource(); src.buffer = clickBuf[k];
  if (k === 'sub'){ const g = ac.createGain(); g.gain.value = 0.9; src.connect(g); g.connect(gM); } else src.connect(gM);
  src.start(t); live.add(src); src.onended = () => live.delete(src);
}

/* ---------- scheduler ---------- */
let run = null, timer = 0, raf = 0;
const figOf = () => FIGS.find(f => f.id === P.fig) || FIGS[1];
const beatDur = () => 60 / P.bpm;
function slotInfo(){ const fg = figOf(), spb = Math.round(4 * fg.npb), bars = Math.max(1, Math.ceil(SEQ.events.length / spb)); return {fg, spb, bars, total: bars * spb}; }
const timeOf = b => run.aT + (b - run.aB) * beatDur();
async function play(){
  if (!SEQ.events.length) return;
  await ensureAudio(); applyVol();
  const si = slotInfo(), off = P.count ? 4 : 0;
  run = {si, off, ev: SEQ.events, aT: ac.currentTime + 0.15, aB: 0, nb: 0, ns: 0, q: [], lastIdx: -1};
  timer = setInterval(tick, 25); raf = requestAnimationFrame(frame);
  $('btnPlay').textContent = '■ Stop'; $('btnPlay').classList.add('on');
}
function stop(){
  clearInterval(timer); cancelAnimationFrame(raf); timer = 0;
  live.forEach(s => { try { s.stop(); } catch(e){} }); live.clear();
  run = null; $('btnPlay').textContent = '▶ Play'; $('btnPlay').classList.remove('on');
  $('progress').textContent = ''; setCurrent(null);
}
function tick(){
  if (!run) return;
  const hz = ac.currentTime + 0.22, r = run, si = r.si, bpb = 4;
  const beatsTotal = r.off + si.bars * bpb;
  for (;;){
    const t = timeOf(r.nb);
    if (t > hz || (!P.loop && r.nb >= beatsTotal)) break;
    if (t >= ac.currentTime - 0.01) playClick(r.nb % bpb === 0 ? 'accent' : 'tick', Math.max(t, ac.currentTime));
    r.nb++;
  }
  for (;;){
    const b = r.off + r.ns / si.fg.npb, t = timeOf(b);
    if (t > hz || (!P.loop && r.ns >= si.total)) break;
    const k = r.ns % si.total, e = r.ev[k];
    if (P.sub && Math.abs(b - Math.round(b)) > 1e-6) playClick('sub', Math.max(t, ac.currentTime));
    if (e){ playNote(e.midi, Math.max(t, ac.currentTime), timeOf(r.off + (r.ns + 1) / si.fg.npb)); }
    r.q.push({t, k, ns: r.ns, e});
    r.ns++;
  }
  if (!P.loop && r.ns >= si.total && r.nb >= beatsTotal && ac.currentTime > timeOf(beatsTotal) + 0.25) stop();
}
function frame(){
  if (!run) return;
  const now = ac.currentTime - (ac.outputLatency || ac.baseLatency || 0);
  let last = null;
  while (run.q.length && run.q[0].t <= now) last = run.q.shift();
  if (last){ setCurrent(last.e || null, last.k); const bar = Math.floor(last.ns / run.si.spb) + 1; $('progress').textContent = `battuta ${(bar - 1) % run.si.bars + 1}/${run.si.bars}`; }
  else if (!run.q.length && run.nb < run.off) { /* battuta di attacco */ }
  raf = requestAnimationFrame(frame);
}
function changeBpm(v){
  v = Math.max(30, Math.min(260, Math.round(+v) || P.bpm));
  if (run){ const now = ac.currentTime, b = run.aB + (now - run.aT) / beatDur(); run.aT = now; run.aB = b; }
  P.bpm = v; $('rngBpm').value = v; $('inpBpm').value = v; saveP();
}

/* ---------- manico ---------- */
let shownFi = -1;
function drawFing(fi){
  shownFi = fi;
  const f = F[fi]; if (!f) return;
  const opt = Object.assign({}, S, {overlay:null, extras:[]});
  FE.drawBoard($('pBoard'), ctx, {groups:[f.group]}, opt);
  const svg = $('pBoard'), box = $('pBoard').parentNode;
  if (svg._geom){ const px = svg._fretPos(f.lo) * svg.clientWidth / svg._geom.W; box.scrollLeft = Math.max(0, px - 90); }
}
function setCurrent(e, k){
  const svg = $('pBoard');
  const old = svg.querySelector('#hl'); if (old) old.remove();
  document.querySelectorAll('#seqLine span.cur').forEach(x => x.classList.remove('cur'));
  if (!e){ if (!run && SEQ.events.length && shownFi !== SEQ.events[0].fi) drawFing(SEQ.events[0].fi); return; }
  if (e.fi !== shownFi) drawFing(e.fi);
  const g = svg._geom; if (!g) return;
  const x = svg._fretPos(e.f), y = g.Y(e.s);
  const ns = 'http://www.w3.org/2000/svg', grp = document.createElementNS(ns, 'g'); grp.id = 'hl';
  for (const [r, w, c, o] of [[21, 7, '#e8a33d', .35], [18, 3.2, '#ffffff', 1]]){
    const ci = document.createElementNS(ns, 'circle'); ci.setAttribute('cx', x); ci.setAttribute('cy', y); ci.setAttribute('r', r);
    ci.setAttribute('fill', 'none'); ci.setAttribute('stroke', c); ci.setAttribute('stroke-width', w); ci.setAttribute('stroke-opacity', o); grp.appendChild(ci);
  }
  svg.appendChild(grp);
  const sp = document.querySelector(`#seqLine span[data-k="${k}"]`); if (sp) sp.classList.add('cur');
  const box = $('pBoard').parentNode, px = x * svg.clientWidth / g.W;
  if (px < box.scrollLeft + 60 || px > box.scrollLeft + box.clientWidth - 60) box.scrollTo({left: Math.max(0, px - box.clientWidth / 2), behavior: 'smooth'});
}

/* ---------- interfaccia ---------- */
function init(){
  $('selFig').innerHTML = FIGS.map(f => `<option value="${f.id}">${esc(f.label)}</option>`).join('');
  $('selFig').value = P.fig; $('selMode').value = P.mode; $('selDir').value = P.dir; $('selMove').value = P.move;
  $('inpN').value = P.n; $('inpOrder').value = P.order; $('chkSub').checked = P.sub; $('chkCount').checked = P.count; $('chkLoop').checked = P.loop;
  $('volM').value = P.volM; $('volN').value = P.volN; $('inpTitle').value = P.title || '';
  $('rngBpm').value = P.bpm; $('inpBpm').value = P.bpm; volTxt();
}
const volTxt = () => { $('volMv').textContent = P.volM + '%'; $('volNv').textContent = P.volN + '%'; };
function recompute(first){
  const parsed = parseStructure(S.degrees);
  struct = parsed.degrees.length ? finalizeStructure(parsed.degrees) : null;
  const st = $('pStatus');
  if (!struct){ st.innerHTML = '<span class="warn">Nella pagina principale scegli prima una scala o un arpeggio.</span>'; return; }
  const rec = recognize(struct); scaleName = rec.exact.length ? rec.exact[0].item.name : '';
  ctx = buildContext(S.tuning, S.root, struct);
  const {algo} = computeFingerings();
  $('scaleInfo').innerHTML = `<strong style="color:var(--text)">${esc(rootLabel(S.root, S.notation))} ${esc(scaleName || 'struttura personalizzata')}</strong> · ${esc(algo.name)} · ${S.tuning.length} corde`;
  // diteggiatura iniziale
  let want = F.findIndex(f => f.v === (P.fv === null ? null : String(P.fv)) && f.gi === P.fgi);
  if (want < 0){ const cp = S.params && S.params[algo.id]; const v = cp && selId ? String(cp[selId]) : null; want = Math.max(0, F.findIndex(f => f.v === v)); }
  FI = want;
  $('selFing').innerHTML = F.map((f, i) => `<option value="${i}">${esc(fingLabel(f))}</option>`).join('');
  $('selFing').value = FI;
  fillPresets(); fillStart(); rebuild(); drawFing(SEQ.events.length ? SEQ.events[0].fi : FI);
}
function fillStart(){
  if (!F[FI]) return;
  const arr = F[FI].notes;
  const prev = P.start;
  $('selStart').innerHTML = '<option value="auto">Automatica (la più grave / la più acuta)</option>' + arr.map((n, i) => `<option value="${i}">${strNo(n.s)}ª corda · tasto ${n.f} · ${esc(noteLabel(n))}</option>`).join('');
  $('selStart').value = (prev !== 'auto' && +prev < arr.length) ? String(prev) : 'auto'; if ($('selStart').value !== String(prev)) P.start = 'auto';
}
function fillPresets(){
  const mine = patterns.filter(p => !p.scales || !p.scales.length || p.scales.includes('*') || p.scales.some(n => String(n).toLowerCase() === scaleName.toLowerCase()));
  $('selPreset').innerHTML = '<option value="">— a mano —</option>' + mine.map((p, i) => `<option value="${patterns.indexOf(p)}">${esc(p.name || 'Pattern ' + (i + 1))}</option>`).join('');
  $('fPreset').style.display = mine.length ? '' : 'none';
}
function applyPreset(p){
  P.mode = 'user';
  if (p.notes) P.n = p.notes; if (p.order) P.order = String(p.order); if (p.move) P.move = p.move; if (p.dir) P.dir = p.dir; P.start = p.start !== undefined ? p.start : 'auto';
  if (p.figure && FIGS.some(f => f.id === p.figure)) P.fig = p.figure;
  if (p.bpm) P.bpm = p.bpm;
  init(); fillStart(); rebuild();
}
function rebuild(){
  SEQ = buildSequence();
  $('userBox').style.display = P.mode === 'user' ? '' : 'none';
  $('inpOrder').classList.toggle('bad', !!SEQ.bad);
  const si = slotInfo(), nev = SEQ.events.length;
  $('seqMsg').className = 'msg' + (SEQ.msg ? ' bad' : '');
  $('seqMsg').textContent = SEQ.msg || (nev ? `${nev} note · ${si.bars} battut${si.bars === 1 ? 'a' : 'e'} in 4/4 (${figOf().label.toLowerCase()})` : '');
  $('seqLine').innerHTML = SEQ.events.slice(0, 240).map((e, k) => `<span data-k="${k}" title="${strNo(e.s)}ª corda, tasto ${e.f}">${e.f}</span>`).join('') + (nev > 240 ? '<span>…</span>' : '');
  const f = F[FI];
  $('pStatus').innerHTML = f ? `<span><strong>${esc(fingLabel(f))}</strong></span><span>${F[FI].notes.length} note</span>` : '';
  if (!run && SEQ.events.length && shownFi !== SEQ.events[0].fi) drawFing(SEQ.events[0].fi);
}
function restartIfPlaying(){ if (run){ stop(); play(); } }
function bind(){
  $('btnPlay').addEventListener('click', () => run ? stop() : play());
  document.addEventListener('keydown', e => { if (e.code === 'Space' && !/INPUT|SELECT|TEXTAREA|BUTTON/.test(document.activeElement.tagName)){ e.preventDefault(); run ? stop() : play(); } });
  $('rngBpm').addEventListener('input', e => changeBpm(e.target.value));
  $('inpBpm').addEventListener('change', e => changeBpm(e.target.value));
  $('chkCount').addEventListener('change', e => { P.count = e.target.checked; saveP(); });
  $('chkLoop').addEventListener('change', e => { P.loop = e.target.checked; saveP(); });
  $('chkSub').addEventListener('change', e => { P.sub = e.target.checked; saveP(); });
  $('selFig').addEventListener('change', e => { P.fig = e.target.value; saveP(); rebuild(); restartIfPlaying(); });
  $('volM').addEventListener('input', e => { P.volM = +e.target.value; volTxt(); applyVol(); saveP(); });
  $('volN').addEventListener('input', e => { P.volN = +e.target.value; volTxt(); applyVol(); saveP(); });
  $('selFing').addEventListener('change', e => { FI = +e.target.value; P.fv = F[FI].v; P.fgi = F[FI].gi; P.start = 'auto'; saveP(); fillStart(); rebuild(); restartIfPlaying(); });
  const upd = () => { saveP(); rebuild(); restartIfPlaying(); };
  $('selMode').addEventListener('change', e => { P.mode = e.target.value; upd(); });
  $('selDir').addEventListener('change', e => { P.dir = e.target.value; upd(); });
  $('selMove').addEventListener('change', e => { P.move = e.target.value; upd(); });
  $('selStart').addEventListener('change', e => { P.start = e.target.value; upd(); });
  $('inpN').addEventListener('input', e => { P.n = parseInt(e.target.value, 10) || 2; upd(); });
  $('inpOrder').addEventListener('input', e => { P.order = e.target.value; upd(); });
  $('inpTitle').addEventListener('input', e => { P.title = e.target.value; saveP(); });
  $('selPreset').addEventListener('change', e => { if (e.target.value !== '') applyPreset(patterns[+e.target.value]); });
  $('btnGp').addEventListener('click', exportGp);
  $('btnPdfScore').addEventListener('click', exportScorePdf);
}

/* ---------- Guitar Pro (.gp) ---------- */
const crcT = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++){ let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = u => { let c = 0xFFFFFFFF; for (let i = 0; i < u.length; i++) c = crcT[(c ^ u[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
function zipStore(files){   // files: [{name, data:Uint8Array}]
  const enc = new TextEncoder(), parts = [], cen = []; let off = 0;
  const u16 = v => [v & 255, v >> 8 & 255], u32 = v => [v & 255, v >> 8 & 255, v >> 16 & 255, v >>> 24 & 255];
  for (const f of files){
    const nm = enc.encode(f.name), crc = crc32(f.data), sz = f.data.length;
    const lh = Uint8Array.from([0x50, 0x4b, 3, 4, ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0x21), ...u32(crc), ...u32(sz), ...u32(sz), ...u16(nm.length), ...u16(0)]);
    parts.push(lh, nm, f.data);
    cen.push(Uint8Array.from([0x50, 0x4b, 1, 2, ...u16(20), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0x21), ...u32(crc), ...u32(sz), ...u32(sz), ...u16(nm.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(off)]), nm);
    off += lh.length + nm.length + sz;
  }
  const cLen = cen.reduce((a, b) => a + b.length, 0);
  const end = Uint8Array.from([0x50, 0x4b, 5, 6, 0, 0, 0, 0, ...u16(files.length), ...u16(files.length), ...u32(cLen), ...u32(off), 0, 0]);
  return new Blob([...parts, ...cen, end], {type:'application/octet-stream'});
}
const STEPS = [['C',''],['C','#'],['D',''],['D','#'],['E',''],['F',''],['F','#'],['G',''],['G','#'],['A',''],['A','#'],['B','']];
function gpif(events, title){
  const fg = figOf(), spb = Math.round(4 * fg.npb), bars = Math.max(1, Math.ceil(events.length / spb));
  const head = window.GP_ASSETS.head
    .replace('{{PITCHES}}', S.tuning.join(' ')).replace('{{BITSET}}', '0'.repeat(S.tuning.length))
    .replace('{{TEMPO}}', String(P.bpm)).replace('{{TITLE}}', title.replace(/\]\]>/g, ''));
  let masters = '', barsX = '', voices = '', beats = '', notes = '', bid = 0, nid = 0;
  const rhy = `<Rhythm id="0">\n<NoteValue>${fg.nv}</NoteValue>${fg.tup ? `\n<PrimaryTuplet num="${fg.tup[0]}" den="${fg.tup[1]}" />` : ''}\n</Rhythm>`;
  for (let b = 0; b < bars; b++){
    masters += `<MasterBar>\n<Key>\n<AccidentalCount>0</AccidentalCount>\n<Mode>Major</Mode>\n<TransposeAs>Sharps</TransposeAs>\n</Key>\n<Time>4/4</Time>\n<Bars>${b}</Bars>\n</MasterBar>\n`;
    barsX += `<Bar id="${b}">\n<Clef>G2</Clef>\n<Voices>${b} -1 -1 -1</Voices>\n</Bar>\n`;
    const ids = [];
    for (let k = 0; k < spb; k++){
      const e = events[b * spb + k], id = bid++; ids.push(id);
      let nref = '';
      if (e){
        const m = e.midi, st = STEPS[m % 12], oct = Math.floor(m / 12), nId = nid++;
        nref = `<Notes>${nId}</Notes>\n`;
        notes += `<Note id="${nId}">\n<InstrumentArticulation>0</InstrumentArticulation>\n<Properties>\n<Property name="ConcertPitch">\n<Pitch><Step>${st[0]}</Step><Accidental>${st[1]}</Accidental><Octave>${oct}</Octave></Pitch></Property><Property name="Fret">\n<Fret>${e.f}</Fret>\n</Property>\n<Property name="Midi">\n<Number>${m}</Number>\n</Property>\n<Property name="String">\n<String>${e.s}</String>\n</Property>\n<Property name="TransposedPitch">\n<Pitch><Step>${st[0]}</Step><Accidental>${st[1]}</Accidental><Octave>${oct + 1}</Octave></Pitch></Property></Properties>\n</Note>\n`;
      }
      beats += `<Beat id="${id}">\n<Dynamic>MF</Dynamic>\n<Rhythm ref="0" />\n<TransposedPitchStemOrientation>Upward</TransposedPitchStemOrientation>\n<ConcertPitchStemOrientation>Undefined</ConcertPitchStemOrientation>\n${nref}</Beat>\n`;
    }
    voices += `<Voice id="${b}">\n<Beats>${ids.join(' ')}</Beats>\n</Voice>\n`;
  }
  return head + `<MasterBars>\n<!-- order is important here -->\n${masters}</MasterBars>\n<Bars>\n${barsX}</Bars>\n<Voices>\n${voices}</Voices>\n<Beats>\n${beats}</Beats>\n<Notes>\n${notes}</Notes>\n<Rhythms>\n${rhy}\n</Rhythms>\n<ScoreViews>\n<ScoreView id="0"/>\n</ScoreViews>\n</GPIF>\n`;
}
function exportGp(){
  const msg = $('gpMsg');
  if (!SEQ.events.length){ msg.className = 'msg bad'; msg.textContent = 'Non c\'è nessun esercizio da esportare.'; return; }
  const A = window.GP_ASSETS.files, bin = k => Uint8Array.from(atob(A[k]), c => c.charCodeAt(0));
  const modeName = {asc:'ascendente', desc:'discendente', ascdesc:'asc-desc', descasc:'desc-asc', user:'pattern ' + P.order}[P.mode];
  const title = (P.title || `${rootLabel(S.root, S.notation)} ${scaleName || 'scala'} – ${modeName}`).trim();
  const xml = new TextEncoder().encode(gpif(SEQ.events, title));
  const files = [
    {name:'VERSION', data:bin('VERSION')}, {name:'meta.json', data:bin('meta.json')},
    {name:'Content/BinaryStylesheet', data:bin('Content/BinaryStylesheet')}, {name:'Content/LayoutConfiguration', data:bin('Content/LayoutConfiguration')},
    {name:'Content/PartConfiguration', data:bin('Content/PartConfiguration')}, {name:'Content/Preferences.json', data:bin('Content/Preferences.json')},
    {name:'Content/ScoreViews/0.gpsv', data:bin('Content/ScoreViews/0.gpsv')},
    {name:'Content/Stylesheets/score.gpss', data:bin('Content/Stylesheets/score.gpss')}, {name:'Content/Stylesheets/scoreview0.gpss', data:bin('Content/Stylesheets/scoreview0.gpss')},
    {name:'Content/Stylesheets/scoreview1.gpss', data:bin('Content/Stylesheets/scoreview1.gpss')},
    {name:'Content/score.gpif', data:xml}
  ];
  const blob = zipStore(files), a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = title.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-') + '.gp';
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  msg.className = 'msg ok'; msg.textContent = `Esportato «${a.download}» (${SEQ.events.length} note, ${P.bpm} bpm).`;
}

function exportScorePdf(){
  const msg = $('gpMsg');
  if (!SEQ.events.length){ msg.className = 'msg bad'; msg.textContent = 'Non c\'è nessun esercizio da esportare.'; return; }
  const std = S.tuning.join() === '40,45,50,55,59,64';
  const modeName = {asc:'ascendente', desc:'discendente', ascdesc:'asc-desc', descasc:'desc-asc', user:'pattern ' + P.order}[P.mode];
  const title = (P.title || `${rootLabel(S.root, S.notation)} ${scaleName || 'scala'} – ${modeName}`).trim();
  const cvs = window.ScoreRender.render({events: SEQ.events, fig: figOf(), bpm: P.bpm, tuning: S.tuning, title,
    tuningLabel: std ? 'Standard tuning' : 'Accordatura: ' + S.tuning.map(window.ScoreRender.midiTxt).join(' ')});
  const T = window.FretLab.pdfTools;
  T.saveBlob(T.buildPdf(cvs.map(cv => Object.assign(T.canvasJpeg(cv), {pw: 595, ph: 842}))), title.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-') + '.pdf');
  msg.className = 'msg ok'; msg.textContent = `PDF creato (${cvs.length} pagin${cvs.length === 1 ? 'a' : 'e'}).`;
}
window.Player = {_cv: () => window.ScoreRender, exportScorePdf, show, hide: () => { if (run) stop(); }, get P(){ return P; }, get SEQ(){ return SEQ; }, get F(){ return F; }, setP: p => { Object.assign(P, p); init(); fillStart(); rebuild(); }, gpif: () => gpif(SEQ.events, 'test'), _slot: slotInfo, play, stop, isPlaying: () => !!run};
})();
