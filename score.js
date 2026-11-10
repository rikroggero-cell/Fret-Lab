/* Rendering di pentagramma + tab su canvas (A4 verticale, 1654x2339) */
(() => {
'use strict';
const CLEF = new Path2D("M434 2Q464 -103 464 -170Q464 -223 427.0 -257.0Q390 -291 337 -291Q287 -291 250.0 -261.5Q213 -232 213 -190Q213 -160 233.5 -133.5Q254 -107 283.5 -107.0Q313 -107 331.5 -128.5Q350 -150 350 -178Q350 -240 280 -240Q298 -268 338 -268Q353 -268 368.5 -263.5Q384 -259 401.0 -248.0Q418 -237 428.5 -213.5Q439 -190 439 -157Q439 -136 411 -6Q389 -12 356 -12Q259 -12 189.5 60.0Q120 132 120 232Q120 267 131.5 303.0Q143 339 157.5 366.5Q172 394 200.5 428.5Q229 463 248.5 483.5Q268 504 303 539Q280 621 280 689Q280 779 313.0 839.5Q346 900 379 900Q389 900 401.5 887.0Q414 874 426.0 851.0Q438 828 446.5 790.5Q455 753 455 710Q455 551 342 447L368 329Q384 332 397 332Q458 332 500.0 282.5Q542 233 542 162Q542 44 434 2ZM426 746Q426 801 394 801Q358 801 333.0 748.0Q308 695 308 630Q308 588 321 557Q359 580 392.5 639.5Q426 699 426 746ZM498 128Q498 183 466.0 216.0Q434 249 383 249L428 23Q498 52 498 128ZM407 17 361 247Q334 241 311.5 214.0Q289 187 289 158Q289 143 295.0 128.5Q301 114 309.5 104.0Q318 94 327.0 86.0Q336 78 342.0 74.5Q348 71 348 71L340 66Q307 75 277.5 106.0Q248 137 248 184Q248 231 277.5 270.5Q307 310 343 323L325 430Q168 299 168 177Q168 104 223.0 55.0Q278 6 348 6Q365 6 407 17Z");
const W = 1654, H = 2339, ML = 110, MR = 110;
const STEP = [[0,0],[0,1],[1,0],[1,1],[2,0],[3,0],[3,1],[4,0],[4,1],[5,0],[5,1],[6,0]];  // [passo diatonico, diesis]
const NAMES = ['C','D','E','F','G','A','B'];
const BEAMS = {Quarter:0, Eighth:1, '16th':2, '32nd':3};
const SP = 12.5, HW = 9.2;                       // spazio del pentagramma, semi-larghezza della testa
const midiTxt = m => NAMES[STEP[m % 12][0]] + (STEP[m % 12][1] ? '#' : '') + (Math.floor(m / 12) - 1);

function render(o){
  const ev = o.events, fg = o.fig, tuning = o.tuning, nStr = tuning.length;
  const spb = Math.round(4 * fg.npb), bars = Math.max(1, Math.ceil(ev.length / spb));
  const nb = BEAMS[fg.nv], gs = nb ? (fg.npb === 2.5 ? 5 : Math.round(fg.npb)) : 0, tg = fg.tup ? fg.tup[0] : 0;
  const tabSp = 15, tabH = (nStr - 1) * tabSp, stH = 4 * SP;
  const noteSp = Math.max(22, Math.min(60, 150 / fg.npb)), minBar = spb * noteSp + 40, lead = 96;
  const sysH = 70 + stH + 92 + tabH + 46;
  // distribuzione delle battute nei sistemi
  const avail = W - ML - MR - lead, systems = []; let cur = [], used = 0;
  for (let b = 0; b < bars; b++){
    if (cur.length && used + minBar > avail){ systems.push(cur); cur = []; used = 0; }
    cur.push(b); used += minBar;
  }
  systems.push(cur);
  // pagine
  const pages = []; let y = 330, page = null;
  const newPage = first => { const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const c = cv.getContext('2d'); c.fillStyle = '#fff'; c.fillRect(0, 0, W, H); page = {cv, c}; pages.push(page); y = first ? 330 : 130; };
  newPage(true);
  systems.forEach((sys, si) => {
    if (y + sysH > H - 130){ newPage(false); }
    drawSystem(page.c, sys, y, si === systems.length - 1);
    y += sysH;
  });
  // intestazione e piè di pagina
  const c0 = pages[0].c; c0.fillStyle = '#000'; c0.textAlign = 'center'; c0.textBaseline = 'alphabetic';
  c0.font = '58px "Times New Roman", Times, serif'; c0.fillText(o.title || '', W / 2, 150, W - 2 * ML);
  c0.textAlign = 'left'; c0.font = '19px "Times New Roman", Times, serif'; c0.fillText(o.tuningLabel || '', ML, 232);
  quarter(c0, ML + 6, 288); c0.font = 'bold 26px "Times New Roman", Times, serif'; c0.fillText('= ' + o.bpm, ML + 26, 286);
  pages.forEach((p, i) => { p.c.fillStyle = '#000'; p.c.textAlign = 'right'; p.c.font = '18px "Times New Roman", Times, serif'; p.c.fillText((i + 1) + '/' + pages.length, W - ML + 40, H - 70); });
  return pages.map(p => p.cv);

  function quarter(c, x, y){ c.save(); c.fillStyle = '#000'; c.beginPath(); c.ellipse(x, y, 7.5, 5.4, -0.35, 0, 7); c.fill(); c.fillRect(x + 6.2, y - 30, 2.2, 30); c.restore(); }

  function drawSystem(c, sys, y0, last){
    const sTop = y0 + 70, tTop = sTop + stH + 92;
    const nat = sys.map(b => spb * noteSp + 40);
    let tot = nat.reduce((a, b) => a + b, 0), k = avail / tot; if (last) k = Math.min(k, 1.5);
    const widths = nat.map(w => w * k), x0 = ML + lead;
    c.save(); c.strokeStyle = '#000'; c.fillStyle = '#000'; c.lineWidth = 1.9;
    const xEnd = x0 + widths.reduce((a, b) => a + b, 0);
    for (let i = 0; i < 5; i++){ const yy = sTop + i * SP; c.beginPath(); c.moveTo(ML, yy); c.lineTo(xEnd, yy); c.stroke(); }
    for (let s = 0; s < nStr; s++){ const yy = tTop + s * tabSp; c.beginPath(); c.moveTo(ML, yy); c.lineTo(xEnd, yy); c.stroke(); }
    // chiave e TAB
    c.save(); const cs = 7.9 * SP / 1191 * 1.0; c.translate(ML + 34, sTop + 3 * SP); c.scale(cs * 1.0, -cs * 1.0); c.fill(CLEF); c.restore();
    c.font = 'bold 30px "Times New Roman", Times, serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    const mid = tTop + tabH / 2, step = Math.min(34, Math.max(24, tabH / 3.2));
    ['T', 'A', 'B'].forEach((ch, i) => c.fillText(ch, ML + 34, mid + (i - 1) * step));
    // barre iniziale
    const bl = (x, thick) => { c.lineWidth = thick || 2; c.beginPath(); c.moveTo(x, sTop); c.lineTo(x, sTop + stH); c.moveTo(x, tTop); c.lineTo(x, tTop + tabH); c.stroke(); };
    bl(ML + 0.7); let xb = x0;
    sys.forEach((b, bi) => {
      const w = widths[bi];
      c.font = '15px "Times New Roman", Times, serif'; c.textAlign = 'left'; c.textBaseline = 'alphabetic'; c.fillStyle = '#000'; c.fillText(String(b + 1), xb + 4, sTop - 44);
      drawBar(c, b, xb, w, sTop, tTop);
      const lastBar = b === bars - 1;
      bl(xb + w - (lastBar ? 5 : 0.7)); if (lastBar){ bl(xb + w, 4); }
      xb += w;
    });
    c.restore();
  }

  function drawBar(c, b, xb, w, sTop, tTop){
    const bottom = sTop + 4 * SP, gap = (w - 40) / spb;
    const notes = new Array(spb).fill(null), accState = {};
    for (let k = 0; k < spb; k++){
      const e = ev[b * spb + k]; if (!e) continue;
      const wm = e.midi + 12, st = STEP[wm % 12], oct = Math.floor(wm / 12) - 1, idx = oct * 7 + st[0];
      const key = idx, prev = accState[key] || 0; let acc = 0;
      if (st[1] && prev !== 1){ acc = 1; accState[key] = 1; } else if (!st[1] && prev === 1){ acc = -1; accState[key] = 0; }
      notes[k] = {k, e, x: xb + 20 + gap * k + gap / 2, y: bottom - (idx - 30) * SP / 2, idx, acc, tip: 0, d: 0};
    }
    // note, tagli addizionali, alterazioni
    c.fillStyle = '#000'; c.strokeStyle = '#000'; c.lineWidth = 1.9;
    for (const n of notes){ if (!n) continue;
      c.beginPath(); c.ellipse(n.x, n.y, HW, 6.4, -0.35, 0, 7); c.fill();
      c.lineWidth = 1.9;
      const led = yy => { c.beginPath(); c.moveTo(n.x - HW - 5, yy); c.lineTo(n.x + HW + 5, yy); c.stroke(); };
      for (let i = 28; i >= n.idx; i -= 2) if (i % 2 === 0 && i <= 28) led(bottom - (i - 30) * SP / 2);
      for (let i = 40; i <= n.idx; i += 2) led(bottom - (i - 30) * SP / 2);
      if (n.acc) accidental(c, n.x - HW - 11, n.y, n.acc);
      // numero sul tab
      const ty = tTop + (nStr - 1 - n.e.s) * tabSp, t = String(n.e.f);
      c.font = '18px Arial, Helvetica, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
      const tw = c.measureText(t).width + 4; c.fillStyle = '#fff'; c.fillRect(n.x - tw / 2, ty - 9, tw, 18); c.fillStyle = '#000'; c.fillText(t, n.x, ty + 0.5);
    }
    if (!nb && !tg && fg.nv !== 'Quarter') return;
    // gruppi di travatura (o gambi singoli per le semiminime)
    const groups = [];
    if (nb){
      for (let s0 = 0; s0 < spb; s0 += gs){ const g = notes.slice(s0, s0 + gs).filter(Boolean); if (g.length) groups.push(splitRuns(notes, s0, gs)); }
    } else { notes.forEach(n => { if (n) groups.push([[n]]); }); }
    const L = 3.4 * SP, Lmin = 2.7 * SP;
    for (const runs of groups) for (const run of runs){
      const mean = run.reduce((a, n) => a + n.idx, 0) / run.length, d = mean < 34 ? -1 : 1 * (-1) * -1;   // -1 su, +1 giù
      const dir = mean < 34 ? -1 : 1;
      const sx = n => n.x + (dir < 0 ? HW - 0.8 : -HW + 0.8);
      run.forEach(n => n.d = dir);
      if (run.length === 1 || !nb){
        const n = run[0]; n.tip = n.y + dir * L; stem(c, sx(n), n.y, n.tip);
        if (nb){ for (let j = 0; j < nb; j++){ c.lineWidth = 3.2; c.beginPath(); c.moveTo(sx(n), n.tip - dir * j * 8); c.lineTo(sx(n) + 12, n.tip - dir * (j * 8) + dir * 10); c.stroke(); } }
        if (!nb) run.forEach(m => { m.tip = m.y + dir * L; });
        continue;
      }
      const f = run[0], l = run[run.length - 1];
      let slope = (l.y - f.y) / (sx(l) - sx(f)); slope = Math.max(-0.3, Math.min(0.3, slope * 0.55));
      let by0 = f.y + dir * L;
      let shift = 0; for (const n of run){ const by = by0 + slope * (sx(n) - sx(f)); shift = Math.max(shift, Lmin - dir * (by - n.y)); }
      by0 += dir * shift;
      const beamY = n => by0 + slope * (sx(n) - sx(f));
      run.forEach(n => { n.tip = beamY(n); stem(c, sx(n), n.y, n.tip); });
      c.fillStyle = '#000';
      for (let j = 0; j < nb; j++){
        const off = -dir * j * 8.5;
        c.beginPath(); c.moveTo(sx(f) - 0.7, beamY(f) + off); c.lineTo(sx(l) + 0.7, beamY(l) + off); c.lineTo(sx(l) + 0.7, beamY(l) + off + dir * -1 * -5 * -1); c.lineTo(sx(f) - 0.7, beamY(f) + off + dir * -1 * -5 * -1); c.closePath(); c.fill();
      }
    }
    // parentesi delle terzine / quintine
    if (tg){
      for (let s0 = 0; s0 + tg <= spb; s0 += tg){
        const g = notes.slice(s0, s0 + tg); if (g.some(n => !n)) continue;
        const dir = g[Math.floor(tg / 2)].d || -1, ext = dir < 0 ? Math.min(...g.map(n => n.tip)) : Math.max(...g.map(n => n.tip));
        const yb = ext + dir * 15, xa = g[0].x - 2, xz = g[g.length - 1].x + HW, xm = (xa + xz) / 2;
        c.lineWidth = 1.3; c.strokeStyle = '#000';
        c.beginPath(); c.moveTo(xa, yb - dir * -7 * -1 * 1); c.lineTo(xa, yb); c.lineTo(xm - 11, yb); c.moveTo(xm + 11, yb); c.lineTo(xz, yb); c.lineTo(xz, yb - dir * -7 * -1 * 1); c.stroke();
        c.fillStyle = '#000'; c.font = 'italic bold 17px "Times New Roman", Times, serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(String(tg), xm, yb + 1);
      }
    }
  }
  function splitRuns(notes, s0, n){ const runs = []; let run = []; for (let k = s0; k < Math.min(notes.length, s0 + n); k++){ if (notes[k]) run.push(notes[k]); else if (run.length){ runs.push(run); run = []; } } if (run.length) runs.push(run); return runs; }
  function stem(c, x, y0, y1){ c.lineWidth = 2.6; c.beginPath(); c.moveTo(x, y0); c.lineTo(x, y1); c.stroke(); }
  function accidental(c, x, y, a){
    c.save(); c.strokeStyle = '#000'; c.lineWidth = 1.4;
    if (a > 0){ c.beginPath(); c.moveTo(x - 2.6, y - 10); c.lineTo(x - 2.6, y + 10); c.moveTo(x + 2.6, y - 11); c.lineTo(x + 2.6, y + 9); c.stroke(); c.lineWidth = 3; c.beginPath(); c.moveTo(x - 6, y - 2.6); c.lineTo(x + 6, y - 5.4); c.moveTo(x - 6, y + 5.2); c.lineTo(x + 6, y + 2.4); c.stroke(); }
    else { c.beginPath(); c.moveTo(x - 3.5, y - 10); c.lineTo(x - 3.5, y + 5); c.lineTo(x + 4, y + 3); c.moveTo(x + 4, y - 5); c.lineTo(x + 4, y + 10); c.moveTo(x - 3.5, y - 4); c.lineTo(x + 4, y - 6); c.stroke(); }
    c.restore();
  }
}
window.ScoreRender = {render, midiTxt};
})();
