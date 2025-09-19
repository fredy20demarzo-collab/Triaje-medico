// public/js/auth.js
const Auth = (function(){
  function getToken(){ try { return localStorage.getItem('saludia_token') || ''; } catch { return ''; } }
  function setToken(t){ localStorage.setItem('saludia_token', t || ''); }
  function logout(ev){ if(ev) ev.preventDefault(); localStorage.removeItem('saludia_token'); location.href = 'login.html'; }
  function requireAuth(){ if (!getToken()) location.href='login.html'; }
  function decodeJwtPayload(t){
    try { return JSON.parse(atob(t.split('.')[1] || '')); } catch { return {}; }
  }
  function paintUser(container){
    if (!container) return;
    const t = getToken();
    if (!t) { container.textContent=''; return; }
    const p = decodeJwtPayload(t);
    const name = p.full_name || p.name || p.email || 'Usuario';
    const role = (p.role || p.role_name || 'Usuario');
    container.innerHTML = `<span class="badge info">${name}</span> <span class="badge muted">${role}</span>`;
  }
  return { getToken, setToken, logout, requireAuth, paintUser };
})();
