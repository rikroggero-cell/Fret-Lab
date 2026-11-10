/* Blocco con password (lato browser). Se window.FL_AUTH è null non fa nulla. */
(() => {
  const A = window.FL_AUTH; if (!A || !A.hash) return;
  const KEY = 'fretlab.auth.' + A.hash.slice(0, 12);
  const sha = async s => { const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(A.salt + '|' + s)); return Array.from(new Uint8Array(b)).map(x => x.toString(16).padStart(2, '0')).join(''); };
  try { if (localStorage.getItem(KEY) === A.hash || sessionStorage.getItem(KEY) === A.hash) return; } catch(e){}
  const st = document.createElement('style'); st.textContent = '.app{display:none!important}';
  document.head.appendChild(st);
  const box = document.createElement('div');
  box.style.cssText = 'position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:#15110e;color:#efe6d8;font:16px system-ui,sans-serif;z-index:99999;padding:16px';
  box.innerHTML = '<form style="background:#1f1914;border:1px solid #3a2e25;border-radius:14px;padding:22px;max-width:340px;width:100%"><h2 style="margin:0 0 4px;font-size:20px">🎸 Fretboard Lab</h2><p style="margin:0 0 14px;color:#a39685;font-size:14px">Inserisci la password per entrare.</p><input type="password" autofocus autocomplete="current-password" placeholder="Password" style="width:100%;padding:10px;border-radius:8px;border:1px solid #3a2e25;background:#120e0b;color:#efe6d8;font:inherit;box-sizing:border-box"><label style="display:flex;gap:8px;align-items:center;margin:10px 0;font-size:14px"><input type="checkbox" checked> Ricordami su questo dispositivo</label><button style="width:100%;padding:10px;border:0;border-radius:8px;background:#e8a33d;color:#1b1208;font:inherit;font-weight:700;cursor:pointer">Entra</button><div id="authErr" style="color:#ff7a7a;font-size:13px;margin-top:8px;min-height:18px"></div></form>';
  const mount = () => { document.body.appendChild(box); const f = box.querySelector('form'), inp = f.querySelector('input[type=password]'); inp.focus();
    f.addEventListener('submit', async e => { e.preventDefault();
      if (!window.crypto || !crypto.subtle){ box.querySelector('#authErr').textContent = 'Il browser non supporta il controllo della password in questa modalità (serve https).'; return; }
      if (await sha(inp.value) === A.hash){ try { (f.querySelector('input[type=checkbox]').checked ? localStorage : sessionStorage).setItem(KEY, A.hash); } catch(x){} st.remove(); box.remove(); }
      else { box.querySelector('#authErr').textContent = 'Password errata.'; inp.select(); } }); };
  if (document.body) mount(); else document.addEventListener('DOMContentLoaded', mount);
})();
