/* Menu dell'algoritmo con miniatura per le forme disegnate (shape / find). */
(() => {
const sel = document.getElementById('selAlgo'); if (!sel || !window.FE) return;
const css = document.createElement('style');
css.textContent = `.apk{position:relative}.apk>button{width:100%;display:flex;align-items:center;gap:10px;text-align:left;min-height:38px}
.apk .th:empty{display:none}.apk .th{display:inline-flex;align-items:center;justify-content:center;min-width:46px;color:var(--text)}
.apk .lst{position:absolute;z-index:40;left:0;right:0;top:100%;margin-top:4px;max-height:360px;overflow:auto;background:var(--panel,#1e1812);border:1px solid var(--line);border-radius:10px;box-shadow:0 10px 30px rgba(0,0,0,.5)}
.apk .it{display:flex;align-items:center;gap:10px;padding:7px 10px;cursor:pointer;min-height:34px}.apk .it:hover,.apk .it.on{background:rgba(232,163,61,.16)}
.apk .car{margin-left:auto;opacity:.6}`;
document.head.appendChild(css);
const wrap = document.createElement('div'); wrap.className = 'apk';
sel.parentNode.insertBefore(wrap, sel.nextSibling);
const btn = document.createElement('button'); btn.type = 'button'; const lst = document.createElement('div'); lst.className = 'lst'; lst.style.display = 'none';
wrap.append(btn, lst); sel.style.display = 'none';
const thumbOf = id => { try { const a = FE.getAlgo(id), s = a && a.spec; return s && (s.type === 'shape' || s.type === 'find') ? (FE.shapeThumb(s, 44) || '') : ''; } catch(e){ return ''; } };
let sig = '';
function sync(){
  const o = sel.options[sel.selectedIndex];
  const s = [...sel.options].map(x => x.value + x.text).join('|') + '#' + sel.value;
  if (s === sig) return; sig = s;
  btn.innerHTML = `<span class="th">${o ? thumbOf(o.value) : ''}</span><span>${o ? o.text : ''}</span><span class="car">▾</span>`;
  lst.innerHTML = [...sel.options].map(x => `<div class="it${x.value === sel.value ? ' on' : ''}" data-v="${x.value.replace(/"/g, '&quot;')}"><span class="th">${thumbOf(x.value)}</span><span>${x.text}</span></div>`).join('');
}
btn.addEventListener('click', e => { e.stopPropagation(); sync(); lst.style.display = lst.style.display === 'none' ? '' : 'none'; });
lst.addEventListener('click', e => { const it = e.target.closest('.it'); if (!it) return; sel.value = it.dataset.v; lst.style.display = 'none'; sel.dispatchEvent(new Event('change', {bubbles: true})); sig = ''; sync(); });
document.addEventListener('click', () => { lst.style.display = 'none'; });
setInterval(sync, 400); sync();
window.AlgoPicker = {sync: () => { sig = ''; sync(); }};
})();
