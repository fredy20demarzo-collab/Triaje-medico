// public/js/login.js
console.log('[login.js] cargado');

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('loginForm');
  const inputEmail = document.getElementById('username');
  const inputPass  = document.getElementById('password');

  if (!form) {
    console.warn('[login.js] No se encontró #loginForm');
    return;
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const email = (inputEmail?.value || '').trim();
    const password = (inputPass?.value || '').trim();

    if (!email || !password) {
      alert('Completa usuario y contraseña');
      return;
    }

    // UX: deshabilitar mientras envía
    const submitBtn = form.querySelector('button[type="submit"]');
    const prevText = submitBtn ? submitBtn.innerHTML : null;
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = 'Ingresando…';
    }

    try {
      // Tu backend usa /api/auth/login y devuelve { token, user }
      const data = await window.apiFetch('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password })
      });

      if (!data || !data.token) {
        throw new Error('Respuesta inválida: falta token');
      }

      // Unificar: siempre usamos saludia_token
      //window.Auth.setToken(data.token);
      Auth.setToken(data.token);

      // Guardar opcionalmente el usuario para pintarlo rápido
      if (data.user) {
        try { localStorage.setItem('saludia_user', JSON.stringify(data.user)); } catch {}
      }

      // Ir a la página principal protegida
      location.href = 'classify.html';
    } catch (err) {
      console.error('[login.js] error en login:', err);
      alert('No se pudo iniciar sesión: ' + (err?.message || 'Error desconocido'));
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = prevText || 'Iniciar Sesión';
      }
    }
  });
});
