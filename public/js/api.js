// public/js/api.js
const API_BASE = '';

function getToken() {
  try { return localStorage.getItem('saludia_token') || ''; } catch { return ''; }
}

async function apiFetch(path, opts = {}) {
  const headers = Object.assign(
    { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    opts.headers || {}
  );
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, Object.assign({}, opts, { headers }));
  if (res.status === 401) {
    apiToast('Sesión vencida. Vuelve a iniciar sesión.', 'warn');
    setTimeout(() => location.href = 'login.html', 800);
    throw new Error('No autorizado');
  }
  if (!res.ok) {
    let msg = 'Error de servidor';
    try { const j = await res.json(); msg = j.error || msg; } catch {}
    throw new Error(msg);
  }
  const ct = res.headers.get('content-type') || '';
  return ct.includes('application/json') ? res.json() : res.text();
}

// Toasts minimalistas
(function(){
  const style = document.createElement('style');
  style.textContent = `
    .toast { position: fixed; right: 12px; bottom: 12px; padding: 10px 14px; border-radius: 10px; color: #fff; z-index: 9999; box-shadow: 0 6px 16px rgba(0,0,0,.2); }
    .toast.ok{ background:#16a34a } .toast.warn{ background:#f59e0b } .toast.error{ background:#ef4444 }
  `;
  document.head.appendChild(style);
})();
function apiToast(msg, type='ok') {
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(()=>{ t.remove(); }, 3000);
}
