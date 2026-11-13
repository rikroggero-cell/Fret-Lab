/* Galleria delle forme disegnate (shape / find): miniature, gruppi, ricerca, filtro «entrano in questa scala». */
(() => {
const $ = id => document.getElementById(id);
const btn = $('btnShapes'); if (!btn || !window.FE) return;
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
const css = document.createElement('style');
css.textContent = `#shMod{display:none;position:fixed;inset:0;background:rgba(0,0,0,.78);z-index:55;align-items:center;justify-content:center}
#shMod .box{background:var(--panel,#1e1812);border:1px solid var(--line);border-radius:14px;width:min(980px,94vw);max-height:88vh;display:flex;flex-direction:column;padding:16px}
#shMod .bar{display:flex;flex-wrap:wrap;gap:12px;align-items:center;margin:8px 0 12px}
#shMod .body{overflow:auto}
#shMod h3{margin:14px 0 8px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--accent)}
#shMod .grid2{display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:10px}
#shMod .sc{border:1px solid var(--line);border-radius:10px;padding:10px;cursor:pointer;display:flex;flex-direction:column;gap:6px;color:var(--text)}
#shMod .sc:hover{border-color:var(--accent);background:rgba(232,163,61,.1)}
#shMod .sc.on{border-color:var(--accent);box-shadow:0 0 0 2px var(--accent) inset}
#shMod .sc.no{opacity:.45}
#shMod .th{min-height:56px;display:flex;align-items:center;justify-content:center}
#shMod .nm{font-weight:600;font-size:13px}#shMod .ct{font-size:11.5px;opacity:.7}`;
document.head.appendChild(css);
const mod = document.createElement('div'); mod.id = 'shMod';
mod.innerHTML = `<div class="box"><div style="display:flex;justify-content:space-between;align-items:center"><h2 style="margin:0">Libreria di forme</h2><button id="shClose" class="primary">Chiudi</button></div>
<div class="bar"><input type="text" id="shQ" placeholder="Cerca per nome o gruppo…" style="flex:1 1 220px"><label class="check"><input type="checkbox" id="shFit" checked> Solo le forme che entrano in questa scala</label></div>
<div class="body" id="shBody"></div></div>`;
document.body.appendChild(mod);
function ctxNow(){
  const st = FretLab.getState();
  const s = FE.finalizeStructure(FE.parseStructure(st.degrees).degrees);
  const rec = FE.recognize(s); if (rec.exact && rec.exact[0]){ s.kind = rec.exact[0].item.kind; s.name = rec.exact[0].item.name; }
  return {st, ctx: FE.buildContext(st.tuning, st.root, s)};
}
function render(){
  let st, ctx; try { ({st, ctx} = ctxNow()); } catch(e){ $('shBody').textContent = 'Scala non valida.'; return; }
  const q = $('shQ').value.trim().toLowerCase(), fit = $('shFit').checked, groups = new Map();
  let total = 0, hidden = 0;
  for (const a of FE.allAlgos()){
    const sp = a.spec; if (!sp || (sp.type !== 'find' && sp.type !== 'shape')) continue;
    total++;
    const gname = sp.group || 'Senza gruppo';
    if (q && !(a.name + ' ' + gname + ' ' + (a.description || '')).toLowerCase().includes(q)) continue;
    let ok = true, n = 0;
    try { ok = a.appliesTo(ctx); if (ok){ const r = FE.runAlgorithm(ctx, a, {}).result; n = r.groups.length; } } catch(e){ ok = false; }
    const fits = ok && n > 0;
    if (fit && !fits){ hidden++; continue; }
    if (!groups.has(gname)) groups.set(gname, []);
    groups.get(gname).push({a, n, ok, fits});
  }
  let h = '';
  for (const [g, list] of [...groups].sort((x, y) => x[0].localeCompare(y[0]))){
    h += `<h3>${esc(g)}</h3><div class="grid2">` + list.map(({a, n, ok, fits}) =>
      `<div class="sc${a.id === st.algo ? ' on' : ''}${fits ? '' : ' no'}" data-id="${esc(a.id)}" title="${esc(a.description || '')}"><div class="th">${FE.shapeThumb(a.spec, 80)}</div><div class="nm">${esc(a.name)}</div><div class="ct">${!ok ? 'non applicabile a questa struttura' : fits ? n + ' posizion' + (n === 1 ? 'e' : 'i') + ' in questa scala' : 'non entra in questa scala'}</div></div>`).join('') + '</div>';
  }
  const note = `<p class="help" style="margin:0 0 8px">Forme presenti in questo stock: <b>${total}</b>${hidden ? ` · nascoste dal filtro «entrano in questa scala»: <b>${hidden}</b>` : ''}</p>`;
  $('shBody').innerHTML = note + (h || `<p class="help">${total ? 'Nessuna forma corrisponde. Togli il filtro «Solo le forme che entrano in questa scala» o cambia la ricerca.' : 'Non ci sono ancora forme: creale dall\'editor (tipo «Ricerca forma» o «Forma disegnata»).'}</p>`);
}
btn.addEventListener('click', () => { render(); mod.style.display = 'flex'; });
$('shClose').addEventListener('click', () => { mod.style.display = 'none'; });
mod.addEventListener('click', e => { if (e.target === mod) mod.style.display = 'none'; });
$('shQ').addEventListener('input', render); $('shFit').addEventListener('change', render);
$('shBody').addEventListener('click', e => { const c = e.target.closest('.sc'); if (!c) return; FretLab.setState({algo: c.dataset.id}); mod.style.display = 'none'; if (window.AlgoPicker) AlgoPicker.sync(); });
})();
