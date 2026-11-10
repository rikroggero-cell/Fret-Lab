/* engine.js - Fretboard Lab: motore condiviso tra index.html ed editor.html.
   Teoria musicale, solutore degli algoritmi, disegno del manico, caricamento di stock.json e pacchetti. */
(() => {
'use strict';
const settings = {notation:'en', rootSym:'F'};
const FRETS = 24;
const MARKERS = {5:1, 7:1, 9:1, 12:2, 15:1, 17:1, 19:1, 21:1, 24:2};
const LETTERS = ['C','D','E','F','G','A','B'];
const LETTER_PC = [0,2,4,5,7,9,11];
const MAJOR = [0,2,4,5,7,9,11];
const IT = {C:'DO',D:'RE',E:'MI',F:'FA',G:'SOL',A:'LA',B:'SI'};
const SHARP_NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
const ROOTS = ['C','C#','Db','D','D#','Eb','E','F','F#','Gb','G','G#','Ab','A','A#','Bb','B'];
const mod = (n, m) => ((n % m) + m) % m;
const accStr = n => n === 0 ? '' : n > 0 ? '#'.repeat(n) : 'b'.repeat(-n);
const esc = s => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

function parseRoot(name){
  const m = /^([A-G])(##|bb|#|b)?$/.exec(name);
  const li = LETTERS.indexOf(m[1]);
  const acc = !m[2] ? 0 : m[2][0] === '#' ? m[2].length : -m[2].length;
  return {name, letter:m[1], li, acc, pc: mod(LETTER_PC[li] + acc, 12)};
}
function fmtNote(letter, acc, notation){ return (notation === 'it' ? IT[letter] : letter) + accStr(acc); }
function rootLabel(name, notation){ const r = parseRoot(name); return fmtNote(r.letter, r.acc, notation); }

/** Grado: "F","1","R","b3","#4","9","bb7"… */
function parseDegree(tok){
  let t = String(tok).trim().replace(/♭/g,'b').replace(/♯/g,'#');
  if (/^[FfRr]$/.test(t)) t = '1';
  const m = /^(bb|b|##|#)?(\d{1,2})$/.exec(t);
  if (!m) return null;
  const num = +m[2]; if (num < 1 || num > 15) return null;
  const acc = !m[1] ? 0 : m[1][0] === '#' ? m[1].length : -m[1].length;
  const semi = mod(MAJOR[(num-1) % 7] + acc, 12);
  return {token: String(tok), label: (m[1] || '') + num, num, acc, semi, isRoot: semi === 0};
}
/** Nome della nota per un grado, con grafia corretta rispetto alla radice. */
function noteName(root, d, notation){
  const li = mod(root.li + d.num - 1, 7);
  const target = mod(root.pc + d.semi, 12);
  const diff = mod(target - LETTER_PC[li] + 6, 12) - 6;
  return fmtNote(LETTERS[li], diff, notation);
}

function parseStructure(text){
  const toks = text.split(/[\s,;]+/).filter(Boolean);
  const errors = [], degrees = [], seen = new Set();
  for (const t of toks){
    const d = parseDegree(t);
    if (!d){ errors.push(t); continue; }
    if (seen.has(d.semi)) continue;
    seen.add(d.semi); degrees.push(d);
  }
  let addedRoot = false;
  if (degrees.length && !seen.has(0)){ degrees.unshift(parseDegree('1')); addedRoot = true; }
  return {degrees, errors, addedRoot};
}
/** Ordina per altezza e assegna l'indice .i (0 = radice). `degrees` mantiene l'ordine d'inserimento. */
function finalizeStructure(degrees){
  const sorted = [...degrees].sort((a,b) => a.semi - b.semi);
  sorted.forEach((d,i) => d.i = i);
  const semis = sorted.map(d => d.semi);
  return {degrees, sorted, size: sorted.length, semis, key: semis.join(','),
          spell: sorted.map(d => d.isRoot ? '1' : d.label).join(' '), kind: 'custom', name: ''};
}

/* =====================================================================
   1. LIBRERIA DI SCALE E ARPEGGI
   ===================================================================== */
const STRUCTS = [];  // {id,kind,name,degrees,group,user,semisKey,spell,semiSet}
function addStructure(kind, group, name, degrees, opts){
  const parsed = parseStructure(degrees);
  if (!parsed.degrees.length || parsed.errors.length) throw new Error(`Gradi non validi in "${name}": ${degrees}`);
  const st = finalizeStructure(parsed.degrees);
  const item = Object.assign({id: (opts && opts.idPrefix || 'b') + ':' + kind + ':' + STRUCTS.length, kind, name, degrees, group, semisKey: st.key, spell: st.spell, semiSet: new Set(st.semis), user: !!(opts && opts.user), extras: !!(opts && opts.extras)}, {});
  STRUCTS.push(item); return item;
}
function recognize(st){
  const exact = STRUCTS.filter(it => it.semisKey === st.key)
    .map(it => ({item: it, same: it.spell === st.spell}))
    .sort((a,b) => (b.same - a.same) || (a.item.kind === 'scale' ? -1 : 1));
  const exactIds = new Set(exact.map(e => e.item.id));
  const contained = STRUCTS.filter(it => it.kind === 'scale' && !exactIds.has(it.id) && it.semiSet.size > st.size && st.semis.every(s => it.semiSet.has(s))).slice(0, 10);
  return {exact, contained};
}

/* =====================================================================
   2. ACCORDATURE
   ===================================================================== */
const PRESETS = [];
const USER_PRESETS = [];
const allPresets = () => PRESETS.concat(USER_PRESETS);
function genericTuning(n){
  const top = [64,59,55,50,45,40,35,30,25,20,15,10];
  return top.slice(0, n).reverse();
}
function defaultTuningFor(n){ const p = allPresets().find(p => p.n === n); return p ? p.m.slice() : genericTuning(n); }

function parseNoteTok(tok){
  const m = /^(sol|si|do|re|mi|fa|la|[a-g])(#|b|♯|♭)?(-?\d)?$/i.exec(tok.trim());
  if (!m) return null;
  const nm = m[1].toLowerCase();
  const map = {do:0,re:2,mi:4,fa:5,sol:7,la:9,si:11,c:0,d:2,e:4,f:5,g:7,a:9,b:11};
  const acc = !m[2] ? 0 : (m[2] === '#' || m[2] === '♯') ? 1 : -1;
  return {pc: mod(map[nm] + acc, 12), oct: m[3] === undefined ? null : +m[3]};
}
function parseTuning(text){
  const toks = text.split(/[\s,;]+/).filter(Boolean);
  if (!toks.length) return {error:'Inserisci almeno una nota.'};
  if (toks.length > 12) return {error:'Massimo 12 corde.'};
  const out = [];
  for (let i = 0; i < toks.length; i++){
    const p = parseNoteTok(toks[i]);
    if (!p) return {error:`Nota non riconosciuta: "${toks[i]}"`};
    let midi;
    if (p.oct !== null) midi = 12 * (p.oct + 1) + p.pc;
    else if (i === 0) midi = 12 * 3 + p.pc;
    else { midi = out[i-1] + 1; while (mod(midi,12) !== p.pc) midi++; }
    out.push(midi);
  }
  return {midis: out};
}
const midiName = (m, notation) => { const n = SHARP_NAMES[mod(m,12)]; return fmtNote(n[0], n[1] ? 1 : 0, notation) + (Math.floor(m/12) - 1); };
const midiNameEn = m => midiName(m, 'en');

/* =====================================================================
   3. CONTESTO (la "tastiera" vista dagli algoritmi)
   ===================================================================== */
function buildContext(tuning, rootName, struct){
  const root = parseRoot(rootName);
  const n = tuning.length;
  const idxBySemi = new Array(12).fill(-1);
  struct.sorted.forEach(d => idxBySemi[d.semi] = d.i);
  const degOfPitch = p => idxBySemi[mod(p - root.pc, 12)];
  const board = tuning.map(open => {
    const row = [];
    for (let f = 0; f <= FRETS; f++){ const pitch = open + f; row.push({pitch, pc: mod(pitch,12), deg: degOfPitch(pitch)}); }
    return row;
  });
  const ctx = {n, frets: FRETS, tuning, root, structure: struct, board, degOfPitch,
    nextPitch(p){ let q = p + 1; while (degOfPitch(q) < 0) q++; return q; },
    /** Indice (0 = più grave) di una corda: numero (1 = la più ACUTA, come dicono i chitarristi) oppure nome nota ("E","A","Bb"). */
    stringIndex(spec){
      if (typeof spec === 'number' || /^\d+$/.test(String(spec))){ const k = +spec; return k >= 1 && k <= n ? n - k : -1; }
      const m = /^([A-Ga-g])(#|b)?$/.exec(String(spec).trim());
      if (!m) return -1;
      const L = m[1].toUpperCase();
      const pc = mod(LETTER_PC[LETTERS.indexOf(L)] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0), 12);
      const i = tuning.findIndex(p => mod(p,12) === pc);
      if (i >= 0) return i;
      const top = {E:6, A:5, D:4, G:3, B:2}[L];       // ripiego: stessa corda di una 6 corde standard
      return top && n - top >= 0 ? n - top : -1;
    },
    /** Tutte le note della struttura tra due tasti (inclusi). */
    window(lo, hi){
      const out = [];
      for (let s = 0; s < n; s++) for (let f = Math.max(0,lo); f <= Math.min(FRETS,hi); f++) if (board[s][f].deg >= 0) out.push({s,f});
      return out;
    },
    chain(counts, startDeg, oct){ return chainForScripts(ctx, counts, startDeg, oct); }
  };
  return ctx;
}

/* =====================================================================
   4. ALGORITMI
   ---------------------------------------------------------------------
   Un algoritmo è un oggetto:
   { id, name, description,
     appliesTo(ctx) -> bool,
     params(ctx)    -> [{id,label,type:'select'|'number'|'text', options:[{value,label}], default, min, max}],
     generate(ctx, p) -> { groups:[{name, notes:[{s,f}], ordered?}], info?, message? } }
   s = indice corda (0 = più grave), f = tasto (0 = corda a vuoto).
   Gli algoritmi nascono da "specifiche" JSON (tipi: path, window, shape, script).
   ===================================================================== */
const STOCK_ALGOS = new Map();   // da stock.json
const USER_ALGOS = new Map();    // da pacchetti dell'utente
function registerAlgorithm(def, user){
  if (!def || !def.id || typeof def.generate !== 'function') throw new Error('Algoritmo non valido (servono id e generate)');
  def.appliesTo = def.appliesTo || (() => true);
  def.params = def.params || (() => []);
  (user ? USER_ALGOS : STOCK_ALGOS).set(def.id, def);
  return def;
}
const allAlgos = () => [...STOCK_ALGOS.values(), ...USER_ALGOS.values()];
const getAlgo = id => STOCK_ALGOS.get(id) || USER_ALGOS.get(id);

function makeApplies(a){
  if (!a) return () => true;
  return ctx => {
    const st = ctx.structure;
    if (a.kinds && a.kinds.length && st.kind !== 'custom' && !a.kinds.includes(st.kind)) return false;
    if (a.minNotes && st.size < a.minNotes) return false;
    if (a.maxNotes && st.size > a.maxNotes) return false;
    if (a.exactNotes && st.size !== a.exactNotes) return false;
    return true;
  };
}
const plural = (n, one, many) => n === 1 ? `1 ${one}` : `${n} ${many}`;
const degText = (ctx, d) => { const lab = d.isRoot ? settings.rootSym : d.label; return `${lab} (${noteName(ctx.root, d, settings.notation)})`; };
const stringLabel = (ctx, i) => `${ctx.n - i}ª corda (${midiName(ctx.tuning[i], settings.notation)})`;

const OCT_OPTIONS = [{value:'all', label:'Tutte'}, {value:'low', label:'Più grave'}, {value:'high', label:'Più acuta'}];
const OCT_PARAM = {id:'octave', label:'Ottava sul manico', type:'select', default:'all', options:OCT_OPTIONS};
function pickOctave(items, sel){
  items.sort((a, b) => a.key - b.key);
  if (sel === 'low') return items.slice(0, 1);
  if (sel === 'high') return items.slice(-1);
  return items;
}

/* ---------------------------------------------------------------------
   4a. Tipo "path": percorso ascendente di note successive, una "corda" alla volta
   ---------------------------------------------------------------------
   Una diteggiatura è una sequenza di note di altezza crescente; ogni corda usata
   ne prende alcune consecutive. Il solutore prova tutte le possibilità e tiene
   quelle che rispettano i vincoli della specifica.
   Ogni campo marcato {"$param": ...} diventa un controllo per l'utente nell'app. */
const getIn = (o, path) => path.split('.').reduce((a, k) => a == null ? undefined : a[k], o);
const isParam = v => v !== null && typeof v === 'object' && !Array.isArray(v) && '$param' in v;
const PATH_PARAMS = [   // ordine con cui compaiono i controlli
  {path:'sequence.start', id:'start',  kind:'seqstart'},
  {path:'strings.step',   id:'step',   kind:'step'},
  {path:'strings.start',  id:'sstart', kind:'string'},
  {path:'sequence.link',  id:'link',   kind:'link'},
  {path:'notesPerString', id:'counts', kind:'counts'},
  {path:'limits.maxSpan', id:'span',   kind:'number'},
  {path:'octave',         id:'octave', kind:'octave'}
];
/** "3" | "2 3 2" | "2-3 2" | [2,3] | 3  ->  [{min,max},...] */
function parseCountSpec(v){
  const toks = Array.isArray(v) ? v.map(String) : String(v).split(/[\s,;]+/).filter(Boolean);
  const out = [];
  for (const t of toks){
    const m = /^(\d+)(?:-(\d+))?$/.exec(t); if (!m) continue;
    const a = +m[1], b = m[2] ? +m[2] : a;
    if (a >= 1 && b >= a && b <= 12) out.push({min:a, max:b});
  }
  return out.length ? out : [{min:3, max:3}];
}
const countsText = v => Array.isArray(v) ? v.join(' ') : String(v);

function pathParamDefs(spec, ctx){
  const defs = [], order = (spec.sequence && spec.sequence.order) || 'pitch';
  for (const f of PATH_PARAMS){
    const v = getIn(spec, f.path);
    if (!isParam(v)) continue;
    const c = (v.$param && typeof v.$param === 'object') ? v.$param : {};
    const id = c.id || f.id; let d;
    if (f.kind === 'seqstart'){
      const st = ctx.structure;
      const opts = order === 'stacked'
        ? st.degrees.map((g, i) => ({value:String(i), label:`${i === 0 ? 'Stato fondamentale' : i + '° rivolto'} · basso = ${degText(ctx, g)}`}))
        : st.sorted.map((g, i) => ({value:String(i), label:`Pos. ${i + 1} · parte da ${degText(ctx, g)}`}));
      if (c.allowAll) opts.unshift({value:'all', label:'Tutte'});
      d = {id, type:'select', label: c.label || (order === 'stacked' ? "Rivolto (si segue l'ordine in cui sono scritti i gradi)" : 'Posizione (grado di partenza)'),
           options: opts, default: c.default === 'all' ? 'all' : String(Math.max(1, +c.default || 1) - 1)};
    } else if (f.kind === 'string'){
      const opts = Array.from({length: ctx.n}, (_, i) => ({value:String(i), label:stringLabel(ctx, i)}));
      if (c.allowAll !== false) opts.unshift({value:'all', label:'Tutte'});
      const dv = c.default === undefined ? (c.allowAll !== false ? 'all' : 1) : c.default;
      d = {id, type:'select', label: c.label || 'Corda di partenza (nota più grave)', options: opts,
           default: dv === 'all' ? 'all' : String((dv === 'lowest' ? 1 : +dv || 1) - 1)};
    } else if (f.kind === 'step'){
      d = {id, type:'select', label: c.label || 'Corde saltate tra una nota e la successiva', default: String(c.default || 1),
           options:[{value:'1', label:'Nessuna (corde adiacenti)'}, {value:'2', label:'1 corda'}, {value:'3', label:'2 corde'}]};
    } else if (f.kind === 'link'){
      d = {id, type:'select', label: c.label || 'Nota successiva', default: c.default || 'closest',
           options:[{value:'closest', label:'La più vicina sopra'}, {value:'any', label:'In qualunque ottava sopra'}]};
    } else if (f.kind === 'counts'){
      d = {id, type:'text', label: c.label || 'Note per corda (dalla più grave, ciclico; "2-3" = tra 2 e 3)', default: countsText(c.default !== undefined ? c.default : 3)};
    } else if (f.kind === 'number'){
      d = {id, type:'number', label: c.label || 'Ampiezza massima (tasti)', default: c.default !== undefined ? c.default : 7, min: c.min !== undefined ? c.min : 3, max: c.max !== undefined ? c.max : 24};
    } else {
      d = {id, type:'select', label: c.label || 'Ottava sul manico', default: c.default || 'all', options: OCT_OPTIONS};
    }
    d._path = f.path; defs.push(d);
  }
  return defs;
}
/** Risolve i valori effettivi dei vincoli (fissi nella specifica oppure scelti dall'utente). */
function pathResolve(spec, ctx, params){
  const defs = pathParamDefs(spec, ctx), byPath = {};
  defs.forEach(d => byPath[d._path] = d);
  const get = (path, dflt) => {
    const v = getIn(spec, path);
    if (isParam(v)){ const d = byPath[path]; const raw = params && params[d.id] !== undefined ? params[d.id] : d.default; return {raw, param:true}; }
    return {raw: v === undefined ? dflt : v, param:false};
  };
  const idx = (g, base) => { if (g.raw === 'all') return 'all'; return g.param ? +g.raw : Math.max(1, +g.raw || 1) - 1; };
  const ss = get('strings.start', 'lowest'), sq = get('sequence.start', 1), mp = get('limits.maxSpan', null);
  return {
    order: (spec.sequence && spec.sequence.order) || 'pitch',
    seqStart: idx(sq),
    stringStart: ss.raw === 'all' ? 'all' : ss.param ? +ss.raw : (ss.raw === 'lowest' ? 0 : Math.max(1, +ss.raw || 1) - 1),
    step: Math.max(1, +get('strings.step', 1).raw || 1),
    link: get('sequence.link', 'closest').raw === 'any' ? 'any' : 'closest',
    counts: parseCountSpec(get('notesPerString', 3).raw),
    length: spec.length === 'cycle' ? 'cycle' : (Number.isInteger(spec.length) ? spec.length : 'strings'),
    maxSpan: mp.raw === null || mp.raw === '' || mp.raw === undefined ? null : +mp.raw,
    minKept: Math.min(1, Math.max(0.05, getIn(spec, 'limits.minKept') === undefined ? 1 : +getIn(spec, 'limits.minKept'))),
    maxSol: Math.max(1, +getIn(spec, 'limits.maxSolutions') || 80),
    octave: get('octave', 'all').raw
  };
}
function solvePath(ctx, R){
  const n = ctx.n, st = ctx.structure, size = st.size, open = ctx.tuning;
  const partial = R.minKept < 1, vlo = partial ? -12 : 0, vhi = partial ? FRETS + 12 : FRETS;
  const degAt = (q, p) => R.order === 'stacked' ? st.degrees[(q + p) % size].i : st.sorted[(q + p) % size].i;
  const starts = R.seqStart === 'all' ? Array.from({length: size}, (_, i) => i) : [Math.min(R.seqStart, size - 1)];
  const s0s = R.stringStart === 'all' ? Array.from({length: n}, (_, i) => i) : [Math.min(R.stringStart, n - 1)];
  const L = R.length === 'cycle' ? size : (typeof R.length === 'number' ? R.length : Infinity);
  const out = [], seen = new Set();
  let budget = 400000, truncated = false;
  for (const s0 of s0s) for (const q of starts){
    const U = []; for (let s = s0; s < n; s += R.step) U.push(s);
    const found = [], placed = [];
    const cands = (p, s, prev) => {
      const deg = degAt(q, p), res = [];
      if (prev === -Infinity || R.link === 'any'){
        for (let f = vlo; f <= vhi; f++){ const pitch = open[s] + f; if (pitch > prev && ctx.degOfPitch(pitch) === deg) res.push(pitch); }
      } else {
        let pitch = prev + 1; while (ctx.degOfPitch(pitch) !== deg) pitch++;
        res.push(pitch);
      }
      return res;
    };
    const finish = () => {
      const kept = placed.filter(x => x.kept);
      if (!kept.length) return;
      if (partial){
        if (kept.length < R.minKept * placed.length - 1e-9) return;
        const used = new Set(placed.map(x => x.s)), keptS = new Set(kept.map(x => x.s));
        for (const s of used) if (!keptS.has(s)) return;
      }
      found.push({key: placed[0].pitch, notes: kept.map(x => ({s: x.s, f: x.f}))});
    };
    let enter;
    const rec = (k, j, tgt, p, prev, lo, hi) => {
      if (budget-- <= 0){ truncated = true; return; }
      if (p === L) return finish();
      if (j === tgt){
        if (k + 1 >= U.length){ if (L === Infinity) finish(); return; }
        return enter(k + 1, p, prev, lo, hi);
      }
      const s = U[k];
      for (const pitch of cands(p, s, prev)){
        const f = pitch - open[s], kept = f >= 0 && f <= FRETS;
        if (!kept && !partial) continue;
        let nlo = lo, nhi = hi;
        if (kept){ nlo = Math.min(lo, f); nhi = Math.max(hi, f); if (R.maxSpan != null && nhi - nlo > R.maxSpan) continue; }
        placed.push({s, f, kept, pitch});
        rec(k, j + 1, tgt, p + 1, pitch, nlo, nhi);
        placed.pop();
      }
    };
    enter = (k, p, prev, lo, hi) => {
      const cs = R.counts[k % R.counts.length], tried = new Set();
      for (let c = cs.min; c <= cs.max; c++){
        const cc = Math.min(c, L - p);
        if (cc < 1 || tried.has(cc)) continue;
        tried.add(cc);
        rec(k, 0, cc, p, prev, lo, hi);
      }
    };
    if (U.length) enter(0, 0, -Infinity, 99, -99);
    for (const g of pickOctave(found.map(f => ({key: f.key, notes: f.notes})), R.octave)){
      const sig = g.notes.map(x => x.s + ':' + x.f).sort().join('|');
      if (seen.has(sig)) continue; seen.add(sig);
      const fr = g.notes.map(x => x.f);
      out.push({name: `tasti ${Math.min(...fr)}–${Math.max(...fr)}`, notes: g.notes, ordered: true});
      if (out.length >= R.maxSol) return {groups: out, truncated: true};
    }
  }
  return {groups: out, truncated};
}
function pathAlgo(spec){
  if (spec.notesPerString === undefined) throw new Error('manca notesPerString');
  return {
    id: spec.id, name: spec.name, description: spec.description || '', user: spec.user,
    appliesTo: makeApplies(spec.appliesTo),
    params: ctx => pathParamDefs(spec, ctx),
    generate: (ctx, params) => {
      const R = pathResolve(spec, ctx, params);
      const {groups, truncated} = solvePath(ctx, R);
      const pat = R.counts.map(c => c.min === c.max ? c.min : c.min + '-' + c.max).join(' ');
      let info = `${pat} note per corda · ${plural(groups.length, 'diteggiatura', 'diteggiature')}`;
      if (truncated) info += ' (ricerca limitata: troppe combinazioni)';
      let message = '';
      if (!groups.length){
        if (R.length !== 'strings'){
          const L = R.length === 'cycle' ? ctx.structure.size : R.length;
          const maxPer = Math.max(...R.counts.map(c => c.max));
          const need = (Math.ceil(L / maxPer) - 1) * R.step + 1;
          message = need > ctx.n
            ? `Servono almeno ${need} corde per ${L} note con questo salto: riduci il salto o cambia struttura.`
            : 'Nessuna diteggiatura entro questi vincoli: aumenta i tasti massimi, riduci il salto o cambia corda di partenza.';
        } else message = 'Nessuna diteggiatura entro questi vincoli.';
      }
      return {groups, info: groups.length ? info : '', message};
    }
  };
}
/** Compatibilità con i vecchi pacchetti: "chain" = path con nota più vicina, tutte le corde, ritaglio ai bordi. */
function chainToPath(it){
  const counts = it.notesPerString;
  return Object.assign({}, it, {
    type: 'path', strings: {start: 'lowest', step: 1},
    sequence: {order: 'pitch', link: 'closest', start: {$param: {label: 'Posizione (grado di partenza sulla corda più grave)'}}},
    notesPerString: it.editableCounts !== false ? {$param: {default: counts, label: 'Note per corda (dalla più grave, ciclico)'}} : counts,
    length: 'strings', limits: {minKept: 0.8}, octave: {$param: true}
  });
}

/* ---- 4b. Tipo "window": finestra di tasti ancorata alla radice (CAGED) ---- */
/** Se la struttura è un modo (rotazione) della scala di riferimento del suo gruppo (la prima del gruppo),
 *  restituisce il contesto della scala madre: le forme si calcolano lì, sulla fondamentale madre. */
function modeParent(ctx, minNotes){
  const st = ctx.structure;
  if (st.kind === 'arpeggio' || st.size < (minNotes === undefined ? 6 : minNotes)) return null;
  const refs = [], seen = new Set();
  for (const it of STRUCTS){ if (it.kind !== 'scale' || seen.has(it.group)) continue; seen.add(it.group); refs.push(it); }
  if (refs.some(it => it.semisKey === st.key)) return null;
  for (const it of refs){
    if (it.semiSet.size !== st.size) continue;
    const R = [...it.semiSet].sort((a, b) => a - b);
    for (let k = 1; k < R.length; k++){
      const rot = R.map(x => mod(x - R[k], 12)).sort((a, b) => a - b).join(',');
      if (rot !== st.key) continue;
      const refSt = finalizeStructure(parseStructure(it.degrees).degrees);
      refSt.kind = 'scale'; refSt.name = it.name;
      return {ctx: buildContext(ctx.tuning, SHARP_NAMES[mod(ctx.root.pc - R[k], 12)], refSt), name: it.name, degree: k + 1};
    }
  }
  return null;
}

function windowAlgo(spec){
  const forms = spec.forms;
  const ex = Object.assign({octave:true, width:true, stretch:true}, spec.expose || {});
  return {
    id: spec.id, name: spec.name, description: spec.description || '', user: spec.user,
    appliesTo: makeApplies(spec.appliesTo),
    params: () => {
      const ps = [{id:'form', label:'Forma', type:'select', default:'0', options: forms.map((f, i) => ({value:String(i), label:f.name || ('Forma ' + (i + 1))}))}];
      if (ex.octave) ps.push(OCT_PARAM);
      if (ex.width) ps.push({id:'width', label:'Ampiezza della finestra (tasti)', advanced:true, type:'number', default: spec.width || 4, min:2, max:12});
      if (ex.stretch) ps.push({id:'stretch', label:'Estensione oltre la finestra, se inevitabile (tasti)', advanced:true, type:'number', default: spec.stretch !== undefined ? spec.stretch : 1, min:0, max:3});
      return ps;
    },
    generate: (ctx0, p) => {
      const mp = spec.useParent === false ? null : modeParent(ctx0, spec.parentMinNotes);
      const ctx = mp ? mp.ctx : ctx0;
      const parentName = mp ? mp.name : (ctx0.structure.name || '');
      const form = forms[+p.form || 0] || forms[0];
      const width = Math.max(2, +p.width || spec.width || 4);
      const stretch = p.stretch === undefined || p.stretch === '' ? (spec.stretch !== undefined ? spec.stretch : 1) : Math.max(0, +p.stretch);
      const s = ctx.stringIndex(form.string);
      if (s < 0) return {groups: [], message: `Corda di riferimento "${form.string}" non trovata nell'accordatura.`};
      let anchor = 0;
      if (form.degree){
        const d = parseDegree(form.degree), found = d && ctx.structure.sorted.find(x => x.semi === d.semi);
        if (!found) return {groups: [], message: `Il grado ${form.degree} non fa parte di questa struttura.`};
        anchor = found.i;
      }
      // Regole della forma: [{string, exclude:"7", only:"F 3", from:-1, to:3}]; from/to = tasti relativi alla radice
      const rules = (form.rules || []).filter(r => !r.scale || r.scale === parentName).map(r => {
        const si = ctx.stringIndex(r.string);
        const semis = k => r[k] === undefined || r[k] === '' ? null : String(r[k]).split(/[\s,]+/).filter(Boolean).map(x => { const d = parseDegree(x); return d ? mod(d.semi, 12) : null; }).filter(x => x !== null);
        return {si, only: semis('only'), exclude: semis('exclude'), add: semis('add'), from: r.from === undefined || r.from === null || r.from === '' ? null : +r.from, to: r.to === undefined || r.to === null || r.to === '' ? null : +r.to};
      }).filter(r => r.si >= 0);
      const ruleOk = (st, ff, rootFret) => {
        const semi = mod(ctx.structure.sorted[ctx.board[st][ff].deg].semi, 12);
        for (const r of rules){
          if (r.si !== st || r.add) continue;
          if (r.only && r.only.length && !r.only.includes(semi)) return false;
          if (r.exclude && r.exclude.includes(semi)) return false;
          if (r.from !== null && ff - rootFret < r.from) return false;
          if (r.to !== null && ff - rootFret > r.to) return false;
        }
        return true;
      };
      const items = [];
      for (let f = 0; f <= FRETS; f++){
        if (ctx.board[s][f].deg !== anchor) continue;
        const start = f - (form.fret || 0), lo = Math.max(0, start), hi = Math.min(FRETS, start + width);
        if (hi - lo < 3) continue;
        // Finestra di base [lo,hi]; oltre hi si va (fino a `stretch` tasti) SOLO per le corde che
        // altrimenti avrebbero meno di `need` note: l'estensione è un ripiego, non la regola.
        const need = spec.minPerString !== undefined && spec.minPerString !== null ? spec.minPerString : (ctx.structure.size >= 5 && ctx.structure.kind !== 'arpeggio' ? 2 : 1);
        const notes = [];
        let stretched = 0;
        const ok = (st, ff) => ctx.board[st][ff].deg >= 0 && ruleOk(st, ff, f);
        for (let st = 0; st < ctx.n; st++){
          const row = [];
          for (let ff = lo; ff <= hi; ff++) if (ok(st, ff)) row.push({s: st, f: ff});
          for (let ff = hi + 1; ff <= Math.min(FRETS, hi + stretch) && row.length < need; ff++)
            if (ok(st, ff)){ row.push({s: st, f: ff}); stretched++; }
          // eccezioni "aggiungi": note volute anche fuori finestra (di default fino a 2 tasti oltre i bordi)
          for (const r of rules){
            if (r.si !== st || !r.add || !r.add.length) continue;
            const a0 = r.from !== null ? f + r.from : lo - 2, a1 = r.to !== null ? f + r.to : hi + 2;
            for (let ff = Math.max(0, a0); ff <= Math.min(FRETS, a1); ff++){
              const c = ctx.board[st][ff];
              if (c.deg >= 0 && r.add.includes(mod(ctx.structure.sorted[c.deg].semi, 12)) && !row.some(x => x.f === ff)) row.push({s: st, f: ff});
            }
          }
          notes.push(...row);
        }
        items.push({key: start, group: {name: `tasti ${lo}–${hi}${stretched ? ' (+' + stretched + ' est.)' : ''}`, notes, range: [Math.max(0, lo), Math.min(FRETS, hi)]}});
      }
      const groups = pickOctave(items, p.octave).map(i => i.group);
      return {groups, info: `${form.name || 'Forma'}${mp ? ` (della ${mp.name}, dal ${mp.degree}° grado)` : ''} · fondamentale sulla corda ${ctx.n - s}ª · ${groups.map(g => g.name).join(' · ')}`};
    }
  };
}

/* =====================================================================
   4x. SOVRAPPOSIZIONE DI ACCORDI (forme CAGED dell'accordo sopra la scala/arpeggio)
   ===================================================================== */
const FORM_COLORS = ['#2fd6e6', '#ffb020', '#45d483', '#4aa8ff', '#c98bff', '#ff8fd1', '#c8e06a'];
const ROLE_LABELS = [
  {0:'F'},
  {1:'b2', 2:'2', 3:'b3', 4:'3', 5:'4'},
  {6:'b5', 7:'5', 8:'#5', 5:'4'},
  {9:'bb7', 10:'b7', 11:'7', 8:'b6'},
  {1:'b9', 2:'9', 3:'#9', 4:'3'}
];
/** Accordo che armonizza il grado `degIdx` (0 = primo) della struttura: per terze sovrapposte. */
function harmonize(ctx, degIdx, extent){
  const S = ctx.structure.sorted, n = S.length;
  if (extent === 'triad' && n < 7){
    // scale corte (pentatoniche, esatonali…): triade con la terza e la quinta più vicine presenti nella scala stessa
    const rel = new Set(S.map(d => mod(d.semi - S[degIdx].semi, 12)));
    const third = rel.has(3) ? 3 : rel.has(4) ? 4 : null, fifth = rel.has(7) ? 7 : rel.has(6) ? 6 : rel.has(8) ? 8 : null;
    if (third !== null && fifth !== null){
      const toks = ['F', third === 3 ? 'b3' : '3', fifth === 7 ? '5' : fifth === 6 ? 'b5' : '#5'];
      const st0 = finalizeStructure(parseStructure(toks.join(' ')).degrees), rec0 = recognize(st0);
      st0.kind = 'arpeggio'; st0.name = rec0.exact.length ? rec0.exact[0].item.name : '';
      return {root: noteName(ctx.root, S[degIdx], 'en'), structure: st0};
    }
  }
  const steps = extent === 'triad' ? [0, 2, 4] : extent === 'ninth' ? [0, 2, 4, 6, 8] : [0, 2, 4, 6];
  const rs = S[degIdx].semi, toks = [], used = new Set();
  steps.forEach((k, role) => {
    const sem = mod(S[(degIdx + k) % n].semi - rs, 12);
    if (used.has(sem)) return; used.add(sem);
    toks.push((ROLE_LABELS[role] || {})[sem] || ROLE_LABELS[1][sem] || ROLE_LABELS[3][sem] || ROLE_LABELS[2][sem] || '1');
  });
  const st = finalizeStructure(parseStructure(toks.join(' ')).degrees);
  const rec = recognize(st);
  st.kind = 'arpeggio'; st.name = rec.exact.length ? rec.exact[0].item.name : '';
  return {root: noteName(ctx.root, S[degIdx], 'en'), structure: st};
}
/** cfg: {source:'self'|'degree', degree:1, extent:'triad|seventh|ninth', selection:'touched|cover|same', minShared:1, algo:'caged'}
 *  base: {result, params} */
function overlayLayers(ctx, base, cfg){
  cfg = cfg || {};
  let chordRoot, chordSt, label;
  if (cfg.source === 'self' || (!cfg.source && ctx.structure.kind === 'arpeggio')){
    chordRoot = ctx.root.name; chordSt = finalizeStructure(ctx.structure.sorted.slice(0, 3).map(d => Object.assign({}, d)));
    { const rec0 = recognize(chordSt); chordSt.name = rec0.exact.length ? rec0.exact[0].item.name : ''; }
    chordSt.kind = 'arpeggio'; label = rootLabel(ctx.root.name, settings.notation) + ' ' + (chordSt.name || ''); label = label.trim();
  } else {
    const di = Math.min(Math.max(0, (+cfg.degree || 1) - 1), ctx.structure.size - 1);
    const h = harmonize(ctx, di, 'triad');
    chordRoot = h.root; chordSt = h.structure; label = `${fmtNote(h.root[0], h.root.length > 1 ? (h.root[1] === '#' ? h.root.length - 1 : -(h.root.length - 1)) : 0, settings.notation)}${chordSt.name ? ' ' + chordSt.name : ' (' + chordSt.spell + ')'}`;
  }
  let cctx;
  try { cctx = buildContext(ctx.tuning, chordRoot, chordSt); } catch(e){ return {layers: [], message: 'Accordo non costruibile: ' + e.message}; }
  const algo = getAlgo(cfg.algo || 'caged');
  if (!algo) return {layers: [], message: 'Algoritmo di sovrapposizione non trovato.'};
  const fp = (algo.params(cctx) || []).find(x => x.id === 'form');
  if (!fp) return {layers: [], message: "L'algoritmo di sovrapposizione non ha forme."};
  const B = new Set(); base.result.groups.forEach(g => g.notes.forEach(n => B.add(n.s + ':' + n.f)));
  const cands = [];
  fp.options.forEach((o, fi) => {
    let r; try { r = algo.generate(cctx, {form: o.value, octave: 'all'}); } catch(e){ return; }
    (r.groups || []).forEach(g => {
      const keys = g.notes.map(n => n.s + ':' + n.f), shared = keys.filter(k => B.has(k)).length;
      if (shared) cands.push({idx: fi, name: o.label, notes: g.notes, keys, shared, win: g.name});
    });
  });
  let pick;
  const sel = cfg.selection || 'touched';
  if (sel === 'cover'){
    const unc = new Set([...B].filter(k => cands.some(c => c.keys.includes(k)))); pick = [];
    while (unc.size){
      let best = null, bg = 0;
      for (const c of cands){ if (pick.includes(c)) continue; const g = c.keys.filter(k => unc.has(k)).length; if (g > bg || (g === bg && best && g > 0 && c.shared > best.shared)){ best = c; bg = g; } }
      if (!best) break; pick.push(best); best.keys.forEach(k => unc.delete(k));
    }
  } else if (sel === 'same' && base.params && base.params.form !== undefined){
    pick = cands.filter(c => String(c.idx) === String(base.params.form));
  } else pick = cands.filter(c => c.shared >= Math.max(1, +cfg.minShared || 1));
  pick.sort((a, b) => a.idx - b.idx || a.shared - b.shared);
  const layers = pick.map(c => ({form: c.name, idx: c.idx, color: FORM_COLORS[c.idx % FORM_COLORS.length], notes: c.notes, shared: c.shared, win: c.win}));
  const names = [...new Set(layers.map(l => l.form))];
  return {layers, ctx: cctx, chord: label, ringsOnly: !!cfg.ringsOnly, info: `Accordo ${label} · ${names.length ? names.join(' · ') : 'nessuna forma tocca le note mostrate'}`};
}

/* =====================================================================
   4y. GRADI AGGIUNTI (note fuori scala, di un altro colore, solo nei tasti della forma mostrata)
   ===================================================================== */
const EXTRA_LABELS = {1:'b2', 2:'2', 3:'b3', 4:'3', 5:'4', 6:'b5', 7:'5', 8:'b6', 9:'6', 10:'b7', 11:'7'};
function extraNotes(ctx, result, semis){
  const out = [], want = new Set((semis || []).map(x => mod(+x, 12))), inScale = new Set(ctx.structure.semis.map(x => mod(x, 12)));
  const seen = new Set();
  if (!want.size) return out;
  for (const g of result.groups || []){
    if (!g.notes.length) continue;
    let lo, hi;
    if (g.range){ lo = g.range[0]; hi = g.range[1]; }
    else { const fr = g.notes.map(n => n.f); lo = Math.min(...fr); hi = Math.max(...fr); }
    for (let s = 0; s < ctx.n; s++) for (let f = lo; f <= hi; f++){
      const rel = mod(ctx.board[s][f].pitch - ctx.root.pc, 12);
      if (!want.has(rel) || inScale.has(rel)) continue;
      const key = s + ':' + f; if (seen.has(key)) continue; seen.add(key);
      out.push({s, f, semi: rel, label: EXTRA_LABELS[rel]});
    }
  }
  return out;
}

/* ---- 4c. Tipo "shape": forma fissa traslabile ---- */
function shapeAlgo(spec){
  return {
    id: spec.id, name: spec.name, description: spec.description || '', user: spec.user,
    appliesTo: makeApplies(spec.appliesTo),
    params: () => [OCT_PARAM],
    generate: (ctx, p) => {
      const a = spec.anchor || {};
      const s = ctx.stringIndex(a.string === undefined ? ctx.n : a.string);
      if (s < 0) return {groups: [], message: 'Corda di ancoraggio non trovata.'};
      let anchor = 0;
      if (a.degree){
        const d = parseDegree(a.degree), found = d && ctx.structure.sorted.find(x => x.semi === d.semi);
        if (!found) return {groups: [], message: `Il grado ${a.degree} non fa parte di questa struttura.`};
        anchor = found.i;
      }
      const items = [];
      for (let f = 0; f <= FRETS; f++){
        if (ctx.board[s][f].deg !== anchor) continue;
        const notes = [];
        (spec.frets || []).forEach((arr, si) => {
          if (si >= ctx.n) return;
          [].concat(arr).forEach(r => {
            const ff = f + r;
            if (ff < 0 || ff > FRETS) return;
            if (spec.onlyInStructure !== false && ctx.board[si][ff].deg < 0) return;
            notes.push({s: si, f: ff});
          });
        });
        items.push({key: f, group: {name: `fondamentale al tasto ${f}`, notes}});
      }
      const groups = pickOctave(items, p.octave).map(i => i.group);
      return {groups, info: groups.map(g => g.name).join(' · ')};
    }
  };
}

/* ---- 4d. Tipo "script" ---- */
const srcOf = v => Array.isArray(v) ? v.join('\n') : String(v);
function makeH(ctx){
  return {
    notation: settings.notation, rootSym: settings.rootSym, mod, parseDegree, plural,
    degText: d => degText(ctx, d),
    noteName: d => noteName(ctx.root, d, settings.notation),
    midiName: m => midiName(m, settings.notation)
  };
}
function scriptAlgo(spec){
  const fn = new Function('ctx', 'params', 'H', srcOf(spec.code));
  const pfn = spec.paramsCode ? new Function('ctx', 'H', srcOf(spec.paramsCode)) : null;
  return {
    id: spec.id, name: spec.name, description: spec.description || 'Algoritmo script.', user: spec.user,
    appliesTo: makeApplies(spec.appliesTo),
    params: ctx => pfn ? (pfn(ctx, makeH(ctx)) || []) : (Array.isArray(spec.params) ? spec.params : []),
    generate: (ctx, p) => {
      const r = fn(ctx, p, makeH(ctx));
      if (Array.isArray(r)) return {groups: [{notes: r}]};
      return r || {groups: []};
    }
  };
}

/** Costruisce un algoritmo da una specifica JSON. Lancia un errore leggibile se è incompleta. */
function buildAlgoFromSpec(it, id, user){
  if (!it || typeof it !== 'object' || Array.isArray(it)) throw new Error('la specifica deve essere un oggetto JSON');
  const spec = Object.assign({}, it, {id, name: it.name || it.id || 'Algoritmo', user: !!user});
  let def;
  if (it.type === 'path') def = pathAlgo(spec);
  else if (it.type === 'chain'){ if (!it.notesPerString) throw new Error('manca notesPerString'); def = pathAlgo(chainToPath(spec)); }
  else if (it.type === 'window'){ if (!Array.isArray(it.forms) || !it.forms.length) throw new Error('manca la lista forms'); def = windowAlgo(spec); }
  else if (it.type === 'shape'){ if (!Array.isArray(it.frets)) throw new Error('manca la lista frets'); def = shapeAlgo(spec); }
  else if (it.type === 'script'){ if (it.code === undefined) throw new Error('manca code'); def = scriptAlgo(spec); }
  else throw new Error(`type "${it.type}" sconosciuto (usa path, window, shape o script)`);
  def.spec = it;
  return def;
}

/** Il motore dei percorsi, utilizzabile dagli script: ctx.chain("3", posizione, "all"). */
function chainForScripts(ctx, counts, startDeg, oct){
  const R = {order:'pitch', seqStart: startDeg || 0, stringStart: 0, step: 1, link:'closest', counts: parseCountSpec(counts),
             length:'strings', maxSpan:null, minKept:0.8, maxSol:80, octave: oct || 'all'};
  return solvePath(ctx, R).groups;
}

/* =====================================================================
   5. DISEGNO
   ===================================================================== */
const WOODS = {
  rosewood: {top:'#573220', bot:'#3b2014', grain:'30,12,6',   ga:1.7, go:-0.62, inlay:'#f1e8d2', inlayStroke:'rgba(0,0,0,.35)'},
  maple:    {top:'#ebcf94', bot:'#d9b378', grain:'128,76,22', ga:1.5, go:-0.66, inlay:'#3a2a1d', inlayStroke:'rgba(0,0,0,.25)'},
  ebony:    {top:'#26201c', bot:'#151110', grain:'255,255,255', ga:0.5, go:-0.18, inlay:'#e9e1cf', inlayStroke:'rgba(0,0,0,.5)'}
};
const PALETTE12 = ['#e5484d','#8e5bd6','#3a86d9','#1fa39a','#2fa05a','#e58a2b','#b43f8f','#2d63d6','#7a8794','#d9a21b','#6d44b8','#139aa8'];
function textOn(hex){
  const n = parseInt(hex.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  return (0.299*r + 0.587*g + 0.114*b) > 165 ? '#1a1410' : '#ffffff';
}
function dotColors(d, opt){
  if (opt.color === 'degree'){ const f = PALETTE12[d.semi]; return {fill: f, text: textOn(f), stroke: '#fff'}; }
  if (opt.color === 'func'){
    const k = ((d.num - 1) % 7) + 1;
    const f = d.isRoot ? '#e5484d' : k === 3 ? '#2fa05a' : k === 5 ? '#2f6fdc' : k === 7 ? '#8a4fd3' : '#e7a33a';
    return {fill: f, text: textOn(f), stroke: '#fff'};
  }
  return d.isRoot ? {fill:'#e5484d', text:'#fff', stroke:'#fff'} : {fill:'#f6f1e4', text:'#2b1a10', stroke:'#2b1a10'};
}
const degLabelShown = (d, opt) => d.isRoot ? opt.rootSym : d.label;

function drawBoard(svg, ctx, result, opt){
  const n = ctx.n, W = 1500, wood = WOODS[opt.wood] || WOODS.rosewood, plain = opt.style === 'plain';
  const gap = n <= 6 ? 38 : n <= 8 ? 34 : 30, pad = gap * 0.8;
  const T = 14, boardH = gap * (n - 1) + 2 * pad;
  const L = 104, EXT = 16, Bw = W - L - 24 - EXT;
  const fx = k => L + Bw * (1 - Math.pow(2, -k/12)) / 0.75;     // rapporto 2^(1/12): il tasto 24 sta a 3/4 della scala
  const X = x => opt.flipFrets ? W - x : x;
  const Y = s => T + pad + (opt.flipStrings ? s : n - 1 - s) * gap;
  const H = T + boardH + 56;
  const mid = k => (fx(k-1) + fx(k)) / 2;
  const f1 = v => v.toFixed(1);
  const endX = fx(FRETS) + EXT;
  let o = `<defs>
    <linearGradient id="wg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${wood.top}"/><stop offset=".5" stop-color="${wood.bot}"/><stop offset="1" stop-color="${wood.top}"/></linearGradient>
    <filter id="grain" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.0045 0.20" numOctaves="4" seed="11"/>
      <feColorMatrix type="matrix" values="0 0 0 0 ${(wood.grain.split(',')[0]/255).toFixed(3)}  0 0 0 0 ${(wood.grain.split(',')[1]/255).toFixed(3)}  0 0 0 0 ${(wood.grain.split(',')[2]/255).toFixed(3)}  0 0 0 ${wood.ga} ${wood.go}"/></filter>
    <linearGradient id="fg" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#8d949a"/><stop offset=".45" stop-color="#f1f3f4"/><stop offset="1" stop-color="#9aa0a6"/></linearGradient>
    <linearGradient id="shade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity=".38"/><stop offset=".18" stop-color="#000" stop-opacity="0"/><stop offset=".82" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".38"/></linearGradient>
  </defs>`;
  const rx = Math.min(X(L), X(endX)), rw = endX - L;
  const yTop = Y(opt.flipStrings ? 0 : n - 1), yBot = Y(opt.flipStrings ? n - 1 : 0);
  if (plain) o += `<rect x="${f1(rx)}" y="${T}" width="${f1(rw)}" height="${f1(boardH)}" fill="#fff"/>`;
  else {
    o += `<rect x="${f1(rx)}" y="${T}" width="${f1(rw)}" height="${f1(boardH)}" rx="5" fill="url(#wg)"/>`;
    o += `<rect x="${f1(rx)}" y="${T}" width="${f1(rw)}" height="${f1(boardH)}" rx="5" filter="url(#grain)"/>`;
    o += `<rect x="${f1(rx)}" y="${T}" width="${f1(rw)}" height="${f1(boardH)}" rx="5" fill="url(#shade)"/>`;
  }

  // segnatasti (intarsi)
  for (const [ks, kind] of Object.entries(MARKERS)){
    const k = +ks, cx = X(mid(k)), wk = fx(k) - fx(k-1);
    const r = Math.min(gap * (kind === 2 ? 0.40 : 0.36), wk * 0.30);
    const ys = kind === 2 ? [T + boardH * 0.27, T + boardH * 0.73] : [T + boardH / 2];
    for (const y of ys) o += `<circle cx="${f1(cx)}" cy="${f1(y)}" r="${f1(r)}" fill="${plain ? '#dcdcdc' : wood.inlay}" stroke="${plain ? 'none' : wood.inlayStroke}" stroke-width="1.5" opacity=".92"/>`;
  }
  // tasti
  for (let k = 1; k <= FRETS; k++){
    const x = X(fx(k));
    if (plain){ o += `<line x1="${f1(x)}" y1="${f1(yTop)}" x2="${f1(x)}" y2="${f1(yBot)}" stroke="#1a1a1a" stroke-width="1.8"/>`; continue; }
    o += `<line x1="${f1(x+1.6)}" y1="${T+1}" x2="${f1(x+1.6)}" y2="${T+boardH-1}" stroke="rgba(0,0,0,.4)" stroke-width="3"/>`;
    o += `<line x1="${f1(x)}" y1="${T+1}" x2="${f1(x)}" y2="${T+boardH-1}" stroke="url(#fg)" stroke-width="2.6"/>`;
  }
  // capotasto
  o += plain ? `<rect x="${f1(X(L)-4)}" y="${f1(yTop)}" width="8" height="${f1(yBot - yTop)}" fill="#1a1a1a"/>` : `<rect x="${f1(X(L)-5)}" y="${T-2}" width="10" height="${f1(boardH+4)}" rx="2" fill="#efe6cf" stroke="rgba(0,0,0,.5)"/>`;
  // corde
  const mn = Math.min(...ctx.tuning), mx = Math.max(...ctx.tuning);
  for (let s = 0; s < n; s++){
    const t = mx === mn ? 0.5 : (mx - ctx.tuning[s]) / (mx - mn);
    const w = 1 + 2.6 * t, y = Y(s), wound = w > 1.9;
    const x1 = X(L - 8), x2 = X(endX - 3);
    if (plain){
      o += `<line x1="${f1(x1)}" y1="${f1(y)}" x2="${f1(x2)}" y2="${f1(y)}" stroke="#1a1a1a" stroke-width="${f1(0.8 + 1.4 * t)}"/>`;
      const lx0 = X(18), an0 = opt.flipFrets ? 'end' : 'start';
      o += `<text x="${f1(lx0)}" y="${f1(y)}" dy=".35em" text-anchor="${an0}" font-size="13" fill="#444">${esc(midiName(ctx.tuning[s], opt.notation))}</text>`;
      continue;
    }
    o += `<line x1="${f1(x1)}" y1="${f1(y+1.8)}" x2="${f1(x2)}" y2="${f1(y+1.8)}" stroke="rgba(0,0,0,.35)" stroke-width="${f1(w)}"/>`;
    o += `<line x1="${f1(x1)}" y1="${f1(y)}" x2="${f1(x2)}" y2="${f1(y)}" stroke="${wound ? '#c4a165' : '#d7dbde'}" stroke-width="${f1(w)}"${wound ? ' stroke-dasharray="2.2 .8"' : ''}/>`;
    o += `<line x1="${f1(x1)}" y1="${f1(y-w*0.18)}" x2="${f1(x2)}" y2="${f1(y-w*0.18)}" stroke="rgba(255,255,255,.55)" stroke-width="${f1(Math.max(.5,w*0.25))}"/>`;
    // nome della corda
    const lx = X(18), anchor = opt.flipFrets ? 'end' : 'start';
    o += `<text x="${f1(lx)}" y="${f1(y)}" dy=".35em" text-anchor="${anchor}" font-size="13" fill="#a39685">${esc(midiName(ctx.tuning[s], opt.notation))}</text>`;
  }
  const st = ctx.structure;
  // note "ombra"
  if (opt.ghost){
    for (let s = 0; s < n; s++) for (let f = 0; f <= FRETS; f++){
      if (ctx.board[s][f].deg < 0) continue;
      const cx = f === 0 ? X(L - 30) : X(mid(f));
      o += `<circle cx="${f1(cx)}" cy="${f1(Y(s))}" r="4.6" fill="${plain ? '#000' : '#fff'}" opacity="${plain ? '.16' : '.26'}"/>`;
    }
  }
  // percorsi
  const groups = result.groups || [];
  const pos = (s, f) => ({x: f === 0 ? X(L - 30) : X(mid(f)), y: Y(s)});
  if (opt.path){
    for (const g of groups){
      if (!g.ordered || g.notes.length < 2) continue;
      const pts = g.notes.map(nn => { const p = pos(nn.s, nn.f); return f1(p.x) + ',' + f1(p.y); }).join(' ');
      o += `<polyline points="${pts}" fill="none" stroke="#ffd166" stroke-width="2.4" stroke-linejoin="round" opacity=".85"/>`;
    }
  }
  // sovrapposizione: aloni morbidi dietro i pallini (niente etichette)
  if (opt.overlay && opt.overlay.layers && opt.overlay.layers.length){
    const cc = opt.overlay.ctx;
    o += `<defs><filter id="halo" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="5.5"/></filter></defs>`;
    for (const l of opt.overlay.layers) for (const nn of l.notes){
      const c = cc.board[nn.s][nn.f]; if (!c || c.deg < 0) continue;
      const p = pos(nn.s, nn.f), wk = nn.f === 0 ? 99 : fx(nn.f) - fx(nn.f - 1), r = Math.min(15.5, wk * 0.45, gap * 0.46);
      o += `<circle cx="${f1(p.x)}" cy="${f1(p.y)}" r="${f1(r + 7)}" fill="${l.color}" opacity=".42" filter="url(#halo)"/>`;
      o += `<circle cx="${f1(p.x)}" cy="${f1(p.y)}" r="${f1(r + 3)}" fill="none" stroke="${l.color}" stroke-width="1.2" opacity=".35"/>`;
    }
  }
  // pallini
  const seen = new Set();
  for (const g of groups) for (const nn of g.notes){
    const key = nn.s + ':' + nn.f; if (seen.has(key)) continue; seen.add(key);
    const c = ctx.board[nn.s][nn.f]; if (!c || c.deg < 0) continue;
    const d = st.sorted[c.deg], col = dotColors(d, opt), p = pos(nn.s, nn.f);
    if (plain && col.stroke === '#fff') col.stroke = '#1a1a1a';
    const wk = nn.f === 0 ? 99 : fx(nn.f) - fx(nn.f - 1);
    const r = Math.min(15.5, wk * 0.45, gap * 0.46);
    let txt = '';
    if (opt.label === 'degree') txt = degLabelShown(d, opt);
    else if (opt.label === 'note') txt = noteName(ctx.root, d, opt.notation);
    else if (opt.label === 'fret') txt = String(nn.f);
    const fs = txt.length <= 2 ? r * 1.0 : txt.length === 3 ? r * 0.82 : r * 0.66;
    if (!plain) o += `<circle cx="${f1(p.x+1.2)}" cy="${f1(p.y+2)}" r="${f1(r)}" fill="rgba(0,0,0,.45)"/>`;
    o += `<circle cx="${f1(p.x)}" cy="${f1(p.y)}" r="${f1(r)}" fill="${col.fill}" stroke="${col.stroke}" stroke-width="${plain ? 2 : 1.6}"/>`;
    if (txt) o += `<text x="${f1(p.x)}" y="${f1(p.y)}" dy=".35em" text-anchor="middle" font-size="${f1(fs)}" font-weight="700" fill="${col.text}">${esc(txt)}</text>`;
  }
  // gradi aggiunti
  if (opt.extras && opt.extras.length){
    for (const nn of opt.extras){
      const p = pos(nn.s, nn.f), wk = nn.f === 0 ? 99 : fx(nn.f) - fx(nn.f - 1), r = Math.min(15.5, wk * 0.45, gap * 0.46);
      const dg = parseDegree(nn.label);
      let txt = opt.label === 'note' ? (dg ? noteName(ctx.root, dg, opt.notation) : '') : opt.label === 'fret' ? String(nn.f) : nn.label;
      const fs = txt.length <= 2 ? r * 1.0 : txt.length === 3 ? r * 0.82 : r * 0.66;
      if (!plain) o += `<circle cx="${f1(p.x+1.2)}" cy="${f1(p.y+2)}" r="${f1(r)}" fill="rgba(0,0,0,.45)"/>`;
      o += `<circle cx="${f1(p.x)}" cy="${f1(p.y)}" r="${f1(r)}" fill="#17c3b2" stroke="${plain ? '#1a1a1a' : '#0b6e63'}" stroke-width="${plain ? 2 : 1.6}"/>`;
      if (txt) o += `<text x="${f1(p.x)}" y="${f1(p.y)}" dy=".35em" text-anchor="middle" font-size="${f1(fs)}" font-weight="700" fill="#06231f">${esc(txt)}</text>`;
    }
  }
  // numeri dei tasti
  const ny = T + boardH + 26;
  for (let k = 1; k <= FRETS; k++){
    const m = MARKERS[k], cx = X(mid(k));
    o += `<text x="${f1(cx)}" y="${ny}" text-anchor="middle" font-size="${m ? 15 : 12}" font-weight="${m ? 700 : 400}" fill="${plain ? (m ? '#111' : '#777') : (m ? '#e8a33d' : '#8c7f70')}">${k}</text>`;
    if (m){
      const offs = m === 2 ? [-5, 5] : [0];
      for (const dx of offs) o += `<circle cx="${f1(cx+dx)}" cy="${f1(T+boardH+10)}" r="${m === 2 ? 3.2 : 3.6}" fill="${plain ? '#111' : '#e8a33d'}"/>`;
    }
  }
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.innerHTML = o;
  svg._fretPos = f => X(mid(f)); svg._W = W;
  svg._geom = {W, H, X, fx, L, Y, n, FRETS, yTop, yBot, flip: !!opt.flipFrets, names: ctx.tuning.map(m => midiName(m, opt.notation)), labelX: X(18)};
}


/* =====================================================================
   6. STOCK E PACCHETTI
   ---------------------------------------------------------------------
   stock.json e i pacchetti dell'utente hanno lo stesso formato:
   { name, scales:[{group,name,degrees}], arpeggios:[...], tunings:[{id,name,notes}], algorithms:[spec,...] }
   ===================================================================== */
let structSeq = 0;
function addStructureTracked(kind, group, name, degrees, o){
  const it = addStructure(kind, group, name, degrees, o);
  return it;
}
function removeBy(arr, flag){ for (let i = arr.length - 1; i >= 0; i--) if (!!arr[i].user === flag) arr.splice(i, 1); }

/** Applica un pacchetto. o = {user, idx, overrides}. Restituisce {count, warnings}. */
function applyPack(pack, o){
  if (!pack || typeof pack !== 'object' || Array.isArray(pack)) throw new Error('Il pacchetto deve essere un oggetto JSON.');
  const label = pack.name || (o.user ? 'Pacchetto ' + ((o.idx || 0) + 1) : 'Di serie'), warnings = [];
  const prefix = o.user ? 'u' + o.idx : 'b';
  let count = 0;
  const each = (arr, what, fn) => {
    if (arr === undefined) return;
    if (!Array.isArray(arr)){ warnings.push(`"${what}" deve essere una lista.`); return; }
    arr.forEach((it, i) => { try { fn(it, i); count++; } catch(e){ warnings.push(`${what}[${i}]: ${e.message}`); } });
  };
  each(pack.scales, 'scales', it => addStructure('scale', it.group || label, it.name || 'Scala', it.degrees, {user: o.user, idPrefix: prefix, extras: it.extras}));
  each(pack.arpeggios, 'arpeggios', it => addStructure('arpeggio', it.group || label, it.name || 'Arpeggio', it.degrees, {user: o.user, idPrefix: prefix}));
  each(pack.tunings, 'tunings', it => {
    const r = parseTuning(it.notes || '');
    if (r.error) throw new Error(r.error);
    const list = o.user ? USER_PRESETS : PRESETS;
    list.push({id: prefix + ':' + (it.id || list.length), n: r.midis.length, name: it.name || 'Accordatura', m: r.midis, user: !!o.user});
  });
  each(pack.algorithms, 'algorithms', (it, i) => {
    if (!it || typeof it !== 'object') throw new Error('voce non valida');
    if (!o.user && !it.id) throw new Error('manca id');
    const id = o.user ? `u${o.idx}:${it.id || it.name || USER_ALGOS.size}` : it.id;
    const over = !o.user && o.overrides && o.overrides[it.id];
    let def;
    try { def = buildAlgoFromSpec(over || it, id, o.user); }
    catch(e){
      if (!over) throw e;
      warnings.push(`${it.id}: la tua modifica locale non è valida (${e.message}), uso l'originale`);
      def = buildAlgoFromSpec(it, id, false); delete o.overrides[it.id];
    }
    def.stock = !o.user; def.base = it; def.modified = !!over && def.spec === over;
    if (o.user) def.source = {pack: o.idx, index: i};
    registerAlgorithm(def, o.user);
  });
  if (!count && !warnings.length) throw new Error('Il pacchetto non contiene scales, arpeggios, tunings o algorithms.');
  return {warnings, count};
}
/** (Ri)carica gli elementi di serie. `overrides` = modifiche locali per id di algoritmo. */
function loadStock(obj, overrides){
  removeBy(STRUCTS, false); PRESETS.length = 0; STOCK_ALGOS.clear();
  return applyPack(obj, {user: false, overrides: overrides || {}});
}
/** (Ri)carica i pacchetti dell'utente: restituisce un report per pacchetto. */
function loadUser(packs){
  removeBy(STRUCTS, true); USER_PRESETS.length = 0; USER_ALGOS.clear();
  return packs.map((p, i) => { try { return applyPack(p, {user: true, idx: i}); } catch(e){ return {error: e.message, warnings: []}; } });
}
/** Esegue un algoritmo catturando gli errori. */
function runAlgorithm(ctx, algo, params){
  try {
    let r = algo.generate(ctx, params) || {groups: []};
    if (Array.isArray(r)) r = {groups: [{notes: r}]};
    r.groups = r.groups || [];
    return {result: r, error: ''};
  } catch(e){ return {result: {groups: [], message: "Errore nell'algoritmo: " + e.message}, error: e.message}; }
}

/* =====================================================================
   7. CONTROLLI DEI PARAMETRI (condivisi tra app ed editor)
   ===================================================================== */
function ensureParams(store, algoId, defs){
  if (!store[algoId] || typeof store[algoId] !== 'object') store[algoId] = {};
  const cur = store[algoId];
  for (const d of defs){
    const hasOpt = d.type === 'select' && d.options.some(o => String(o.value) === String(cur[d.id]));
    if (cur[d.id] === undefined || (d.type === 'select' && !hasOpt)) cur[d.id] = d.default !== undefined ? d.default : (d.options && d.options[0].value);
  }
  return cur;
}
/** Ricostruisce i controlli solo se l'insieme di parametri è cambiato (così non si perde il focus). */
function buildParamControls(container, algoId, defs, store, onChange){
  const sig = algoId + '|' + JSON.stringify(defs);
  if (container._sig === sig) return;
  container._sig = sig; container.innerHTML = '';
  const cur = store[algoId];
  let adv = null;
  for (const d of defs){
    const lab = document.createElement('label'); lab.className = 'field';
    const sp = document.createElement('span'); sp.textContent = d.label; lab.appendChild(sp);
    let inp;
    if (d.type === 'select'){
      inp = document.createElement('select');
      d.options.forEach(o => { const op = document.createElement('option'); op.value = o.value; op.textContent = o.label; inp.appendChild(op); });
    } else {
      inp = document.createElement('input'); inp.type = d.type === 'number' ? 'number' : 'text';
      if (d.min !== undefined) inp.min = d.min; if (d.max !== undefined) inp.max = d.max;
    }
    inp.value = cur[d.id];
    inp.addEventListener(d.type === 'select' ? 'change' : 'input', () => { store[algoId][d.id] = inp.value; onChange(); });
    lab.appendChild(inp);
    if (d.advanced){
      if (!adv){ adv = document.createElement('details'); adv.className = 'inner'; const sm = document.createElement('summary'); sm.textContent = 'Opzioni avanzate'; adv.appendChild(sm); container.appendChild(adv); }
      adv.appendChild(lab);
    } else container.appendChild(lab);
  }
}

window.FE = {
  FRETS, MARKERS, ROOTS, LETTERS, settings, mod, esc, fmtNote, rootLabel, parseRoot, parseDegree, noteName,
  parseStructure, finalizeStructure, STRUCTS, addStructure, recognize,
  PRESETS, USER_PRESETS, allPresets, defaultTuningFor, parseTuning, midiName,
  buildContext, allAlgos, getAlgo, buildAlgoFromSpec, loadStock, loadUser, runAlgorithm, plural, degText,
  drawBoard, overlayLayers, extraNotes, EXTRA_LABELS, harmonize, FORM_COLORS, modeParent, dotColors, degLabelShown, WOODS, ensureParams, buildParamControls, parseCountSpec, pathParamDefs
};
})();
