/* Lezioni: raccolta di esercizi del Player, condivisibili come file, link o QR code. */
(() => {
'use strict';
const $ = id => document.getElementById(id);
const KEY = 'fretlab.lesson.v1', MAX = 12, FORMAT = 'fretlab-lesson/1';
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));

let L = {name: '', msg: '', ex: [], student: false};
try { const r = JSON.parse(localStorage.getItem(KEY) || 'null'); if (r && Array.isArray(r.ex)) L = Object.assign(L, r); } catch(e){}
let teacher = !L.student, current = null;
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(L)); } catch(e){} };
const FL = () => window.FretLab, PL = () => window.Player;

/* ---------- descrizioni ---------- */
function lickText(p){
  const bits = [];
  if (p.mode === 'user') bits.push('lick ' + String(p.order).trim());
  else bits.push({asc: 'su', desc: 'giù', ascdesc: 'su e giù', descasc: 'giù e su'}[p.mode] || p.mode);
  if (p.hMove === 'next') bits.push('box verso l\'acuto' + (p.hBoxes && p.hBoxes !== 'oct' ? ' (' + p.hBoxes + ' box)' : ' (un\'ottava)'));
  if (p.hMove === 'prev') bits.push('box verso il grave' + (p.hBoxes && p.hBoxes !== 'oct' ? ' (' + p.hBoxes + ' box)' : ' (un\'ottava)'));
  if (/^down/.test(p.vMove || '')) bits.push('poi ' + p.vMove.slice(-1) + ' cord' + (p.vMove.endsWith('1') ? 'a' : 'e') + ' verso il grave');
  if (/^up/.test(p.vMove || '')) bits.push('poi ' + p.vMove.slice(-1) + ' cord' + (p.vMove.endsWith('1') ? 'a' : 'e') + ' verso l\'acuto');
  if (p.bounce && p.hMove !== 'none' && p.vMove !== 'none') bits.push('andata e ritorno prima di cambiare');
  return bits.join(' · ');
}
function descOf(ex){
  const d = ex.d || {};
  return [d.scale, d.algo, d.fing, lickText(Object.assign({}, PL() ? PL().PDEF : {}, ex.p)), (ex.p.bpm || 80) + ' bpm', d.fig].filter(Boolean).join(' · ');
}

/* ---------- cattura dell'esercizio corrente ---------- */
function capture(){
  const st = FL().getState(), p = PL().getP(), c = PL().cur();
  if (!c) return null;
  const algo = FE.getAlgo(st.algo);
  const s = {root: st.root, degrees: st.degrees, tuning: st.tuning.slice(), algo: st.algo, notation: st.notation, label: st.label, rootSym: st.rootSym, extras: (st.extras || []).slice(),
    params: st.params && st.params[st.algo] ? {[st.algo]: JSON.parse(JSON.stringify(st.params[st.algo]))} : {}};
  const D = PL().PDEF, diff = {};
  for (const k of Object.keys(p)) if (!['fv', 'fgi', 'start', 'title', 'sLo', 'sHi'].includes(k) && JSON.stringify(p[k]) !== JSON.stringify(D[k])) diff[k] = p[k];
  if (p.sLo != null) diff.sLo = p.sLo; if (p.sHi != null) diff.sHi = p.sHi;
  diff.bpm = p.bpm; diff.fig = p.fig; diff.mode = p.mode;
  const ex = {t: (p.title || '').trim(), n: '', s, p: diff, b: {fv: c.fv, fgi: c.fgi, start: p.start}, d: {scale: c.scale, algo: c.algo, fing: c.label, fig: c.fig}};
  if (algo && algo.source && (algo.spec || algo.base)) ex.a = {id: st.algo, spec: algo.spec || algo.base};   // algoritmo dell'utente: lo porto con me
  if (!ex.t) ex.t = c.scale + ' · ' + lickText(Object.assign({}, D, diff));
  return ex;
}

/* ---------- apertura (modalità semplice) ---------- */
function open(i){
  const ex = L.ex[i]; if (!ex) return;
  if (ex.a && !FE.getAlgo(ex.a.id)){ try { FE.registerAlgorithm(FE.buildAlgoFromSpec(ex.a.spec, ex.a.id, true), true); } catch(e){ console.warn(e); } }
  const st = FL().getState();
  FL().setState(Object.assign({}, ex.s, {params: Object.assign({}, st.params, ex.s.params)}));
  PL().queue(ex.p, ex.b);
  current = i; window.__simple = true; FL().showView('player');
  fillBar();
}
function fillBar(){
  const bar = $('simpleBar'); if (current === null || !L.ex[current]){ bar.style.display = 'none'; return; }
  const ex = L.ex[current]; bar.style.display = '';
  $('sbTitle').textContent = ex.t; $('sbPos').textContent = (current + 1) + ' / ' + L.ex.length;
  $('sbDesc').textContent = descOf(ex); $('sbNote').textContent = ex.n || '';
  $('sbPrev').disabled = current <= 0; $('sbNext').disabled = current >= L.ex.length - 1;
  $('sbFull').textContent = document.body.classList.contains('simple') ? 'Impostazioni complete' : 'Vista semplice';
}

/* ---------- pagina lezione ---------- */
function render(){
  $('lessonCount').textContent = L.ex.length ? '(' + L.ex.length + ')' : '';
  $('lsName').value = L.name || ''; $('lsMsg').value = L.msg || '';
  $('lsName').disabled = $('lsMsg').disabled = !teacher;
  $('lsHelp').textContent = teacher
    ? (L.ex.length ? `${L.ex.length} esercizi su ${MAX} possibili. Per aggiungerne altri imposta un esercizio nel Player e premi «＋ Aggiungi alla lezione».` : 'La lezione è vuota. Imposta un esercizio nel Player e premi «＋ Aggiungi alla lezione» (fino a ' + MAX + ' esercizi).')
    : 'Lezione ricevuta. Premi ▶ Apri su un esercizio, poi Play.';
  $('lsList').innerHTML = L.ex.map((ex, i) => `<div class="lescard" data-i="${i}">
    <span class="num">${i + 1}</span>
    <div class="txt">${teacher ? `<input type="text" class="lt" value="${esc(ex.t)}" placeholder="Titolo">` : `<strong>${esc(ex.t)}</strong>`}
      <div class="help">${esc(descOf(ex))}</div>
      ${teacher ? `<input type="text" class="ln" value="${esc(ex.n)}" placeholder="Nota per l'allievo (facoltativa)" style="margin-top:4px">` : (ex.n ? `<div>${esc(ex.n)}</div>` : '')}
    </div>
    <button class="primary lo">▶ Apri</button>
    ${teacher ? '<button class="mini lu" title="Su">↑</button><button class="mini ld" title="Giù">↓</button><button class="mini lx" title="Rimuovi">✕</button>' : ''}
  </div>`).join('');
  for (const id of ['lsImport', 'lsClear']) $(id).style.display = teacher ? '' : 'none';
  $('lsEdit').style.display = L.student ? '' : 'none'; $('lsEdit').textContent = teacher ? 'Nascondi modifica' : 'Modalità insegnante';
  ['lsLink', 'lsQr', 'lsExport'].forEach(id => $(id).disabled = !L.ex.length);
  $('btnAddLesson').textContent = '＋ Aggiungi alla lezione' + (L.ex.length ? ` (${L.ex.length}/${MAX})` : '');
}
function toast(t){
  let d = $('flToast'); if (!d){ d = document.createElement('div'); d.id = 'flToast'; d.style.cssText = 'position:fixed;left:50%;bottom:28px;transform:translateX(-50%);background:#e8a33d;color:#111;padding:12px 20px;border-radius:10px;font-weight:600;z-index:60;box-shadow:0 6px 24px rgba(0,0,0,.5)'; document.body.appendChild(d); }
  d.textContent = t; d.style.display = ''; clearTimeout(d._t); d._t = setTimeout(() => { d.style.display = 'none'; }, 2600);
}
const info = (t, bad) => { const m = $('lsInfo'); m.className = 'msg' + (bad ? ' bad' : ' ok'); m.textContent = t; };

/* ---------- codifica per link ---------- */
const b64u = u8 => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
const unb64u = t => { t = t.replace(/-/g, '+').replace(/_/g, '/'); while (t.length % 4) t += '='; const s = atob(t), u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; };
async function encode(obj){
  const bytes = new TextEncoder().encode(JSON.stringify(obj));
  if (window.CompressionStream){
    const buf = await new Response(new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer();
    return 'z' + b64u(new Uint8Array(buf));
  }
  return 'j' + b64u(bytes);
}
async function decode(code){
  const bytes = unb64u(code.slice(1));
  let out = bytes;
  if (code[0] === 'z'){
    if (!window.DecompressionStream) throw new Error('Il browser non supporta la decompressione: usa un browser più recente.');
    out = new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());
  }
  return JSON.parse(new TextDecoder().decode(out));
}
const pack = () => ({f: FORMAT, name: L.name || '', msg: L.msg || '', ex: L.ex});
function sanitize(o){
  if (!o || !Array.isArray(o.ex)) throw new Error('Non è un file di lezione valido.');
  const ex = o.ex.slice(0, MAX).filter(e => e && e.s && e.p && e.b).map(e => ({t: String(e.t || 'Esercizio'), n: String(e.n || ''), s: e.s, p: e.p, b: e.b, d: e.d || {}, a: e.a}));
  if (!ex.length) throw new Error('La lezione non contiene esercizi.');
  return {name: String(o.name || ''), msg: String(o.msg || ''), ex};
}
async function linkUrl(){ return location.href.split('#')[0] + '#lez=' + await encode(pack()); }

/* ---------- QR ---------- */
async function showQr(){
  const url = await linkUrl();
  if (url.length > 2800){ info(`Il link è troppo lungo per un QR code (${url.length} caratteri, massimo circa 2800). Togli qualche esercizio, oppure invia il link o il file.`, true); return; }
  const q = qrcode(0, 'L'); q.addData(url, 'Byte'); q.make();
  const n = q.getModuleCount(), sc = Math.max(3, Math.floor(560 / (n + 8))), cv = $('qrCv'), pad = 4 * sc;
  cv.width = cv.height = n * sc + pad * 2;
  const g = cv.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height); g.fillStyle = '#000';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) g.fillRect(pad + c * sc, pad + r * sc, sc, sc);
  $('qrTitle').textContent = L.name || 'Lezione';
  $('qrHint').textContent = 'Inquadra il codice con la fotocamera: si apre la lezione con tutti gli esercizi (' + L.ex.length + ').';
  $('qrModal').style.display = 'flex';
}

/* ---------- eventi ---------- */
function bind(){
  $('btnAddLesson').addEventListener('click', () => {
    if (L.ex.length >= MAX){ alert('La lezione ha già ' + MAX + ' esercizi: rimuovine uno dalla pagina Lezione.'); return; }
    const ex = capture(); if (!ex){ toast('Nessuna diteggiatura disponibile da salvare.'); return; }
    L.ex.push(ex); L.student = false; teacher = true; save(); render(); toast('✓ Esercizio ' + L.ex.length + ' aggiunto alla lezione');
    const b = $('btnAddLesson'), t = b.textContent; b.textContent = '✓ Aggiunto (' + L.ex.length + '/' + MAX + ')'; setTimeout(() => { b.textContent = t.replace(/ \(\d+\/\d+\)$/, '') + ` (${L.ex.length}/${MAX})`; }, 1400);
  });
  $('lsName').addEventListener('input', e => { L.name = e.target.value; save(); });
  $('lsMsg').addEventListener('input', e => { L.msg = e.target.value; save(); });
  $('lsList').addEventListener('input', e => {
    const c = e.target.closest('.lescard'); if (!c) return; const ex = L.ex[+c.dataset.i];
    if (e.target.classList.contains('lt')) ex.t = e.target.value; if (e.target.classList.contains('ln')) ex.n = e.target.value; save();
  });
  $('lsList').addEventListener('click', e => {
    const c = e.target.closest('.lescard'); if (!c) return; const i = +c.dataset.i, b = e.target.closest('button'); if (!b) return;
    if (b.classList.contains('lo')) return open(i);
    if (b.classList.contains('lx')){ L.ex.splice(i, 1); }
    else if (b.classList.contains('lu') && i > 0){ [L.ex[i - 1], L.ex[i]] = [L.ex[i], L.ex[i - 1]]; }
    else if (b.classList.contains('ld') && i < L.ex.length - 1){ [L.ex[i + 1], L.ex[i]] = [L.ex[i], L.ex[i + 1]]; }
    save(); render();
  });
  $('lsLink').addEventListener('click', async () => {
    const url = await linkUrl();
    try { await navigator.clipboard.writeText(url); info('Link copiato negli appunti (' + url.length + ' caratteri). Incollalo in un messaggio.'); }
    catch(e){ window.prompt('Copia il link:', url); }
  });
  $('lsQr').addEventListener('click', showQr);
  $('qrClose').addEventListener('click', () => { $('qrModal').style.display = 'none'; });
  $('qrPng').addEventListener('click', () => { const a = document.createElement('a'); a.href = $('qrCv').toDataURL('image/png'); a.download = ((L.name || 'lezione').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-') || 'lezione') + '-qr.png'; a.click(); });
  $('lsExport').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(pack(), null, 1)], {type: 'application/json'}), a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = ((L.name || 'lezione').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-') || 'lezione') + '.json'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  });
  $('lsImport').addEventListener('click', () => $('lsFile').click());
  $('lsFile').addEventListener('change', async e => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    try {
      const o = sanitize(JSON.parse(await f.text()));
      if (L.ex.length && !confirm('Sostituire la lezione attuale (' + L.ex.length + ' esercizi) con quella del file?')) return;
      L = Object.assign({student: false}, o); teacher = true; save(); render(); info('Lezione importata: ' + o.ex.length + ' esercizi.');
    } catch(err){ info('File non valido: ' + err.message, true); }
  });
  $('lsClear').addEventListener('click', () => { if (L.ex.length && !confirm('Svuotare la lezione?')) return; L = {name: '', msg: '', ex: [], student: false}; teacher = true; current = null; save(); render(); });
  $('lsEdit').addEventListener('click', () => { teacher = !teacher; render(); });
  // barra della modalità semplice
  $('sbBack').addEventListener('click', () => { PL().stop(); window.__simple = false; FL().showView('lesson'); });
  $('sbPrev').addEventListener('click', () => { PL().stop(); open(current - 1); });
  $('sbNext').addEventListener('click', () => { PL().stop(); open(current + 1); });
  $('sbFull').addEventListener('click', () => { window.__simple = !document.body.classList.contains('simple'); document.body.classList.toggle('simple', window.__simple); fillBar(); });
  document.addEventListener('fl-view', e => {
    if (e.detail === 'lesson') render();
    if (e.detail !== 'player'){ $('simpleBar').style.display = 'none'; if (e.detail === 'main') current = null; }
    else fillBar();
  });
}

/* ---------- ricezione da link ---------- */
async function fromHash(){
  const m = /^#lez=([zj][\w-]+)$/.exec(location.hash); if (!m) return;
  try {
    const o = sanitize(await decode(m[1]));
    L = Object.assign({student: true}, o); teacher = false; current = null; save(); history.replaceState(null, '', location.pathname + location.search);
    render(); FL().showView('lesson');
    if (L.msg) info(L.msg);
  } catch(err){ render(); FL().showView('lesson'); info('Link non valido o incompleto: ' + err.message, true); }
}

bind(); render();
let tries = 0;
const wait = setInterval(() => {
  if (window.FretLab && window.FE && FE.STRUCTS.length && window.Player){ clearInterval(wait); fromHash(); }
  else if (++tries > 150) clearInterval(wait);
}, 100);
window.Lesson = {get L(){ return L; }, capture, open, encode, decode, linkUrl};
})();
