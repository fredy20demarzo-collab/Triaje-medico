// public/js/classify.js
(function () {
  Auth.requireAuth();

  const el = {
    paciente: document.getElementById('paciente'),
    telefono: document.getElementById('telefono'),
    sintomas: document.getElementById('sintomas'),
    urgencia: document.getElementById('urgencia'),
    recomendaciones: document.getElementById('recomendaciones'),
    btnClasificar: document.getElementById('btnClasificar'),
    btnGuardar: document.getElementById('btnGuardar'),
    msg: document.getElementById('msgArea'),
    historialBody: document.getElementById('historialBody')
  };

  function setMsg(t) { el.msg.textContent = t || ''; }
  function fmt(dt) {
    try { return new Date(dt).toLocaleString('es-GT', { hour12: false }); } catch { return dt || ''; }
  }

  // ===== Clasificar con IA =====
  el.btnClasificar.addEventListener('click', async () => {
    setMsg('');
    const sintomas = (el.sintomas.value || '').trim();
    if (!sintomas) { setMsg('Escribe los síntomas antes de clasificar.'); el.sintomas.focus(); return; }

    try {
      const r = await apiFetch('/api/ai/triage', {
        method: 'POST',
        body: JSON.stringify({ sintomas })
      });

      if (r.urgencia) el.urgencia.value = r.urgencia;

      const base = r.comentarioIA || 'Recomendación general.';
      const esp  = r.especialista ? ` Especialista sugerido: ${r.especialista}.` : '';
      const dx   = r.padecimiento && r.padecimiento !== 'no determinado'
        ? ` Posible padecimiento: ${r.padecimiento} (orientativo).` : '';

      el.recomendaciones.value = base + esp + dx;

      setMsg(`IA: ${r.urgencia} (confianza ${(r.score*100|0)}%).`);
    } catch (e) {
      setMsg('No se pudo clasificar con IA. Intenta de nuevo.');
    }
  });

  // ===== Guardar =====
  el.btnGuardar.addEventListener('click', async () => {
    setMsg('');
    const payload = {
      paciente: (el.paciente.value || '').trim(),
      telefono: (el.telefono.value || '').trim(),
      sintomas: (el.sintomas.value || '').trim(),
      urgencia: el.urgencia.value || '',
      comentario_ia: (el.recomendaciones.value || '').trim()
    };
    if (!payload.paciente || !payload.sintomas || !payload.urgencia) {
      setMsg('Paciente, síntomas y urgencia son obligatorios.'); return;
    }
    try {
      const r = await apiFetch('/api/consultas', { method: 'POST', body: JSON.stringify(payload) });
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${fmt(r.created_at || new Date())}</td>
        <td>${payload.paciente}</td>
        <td>${payload.urgencia}</td>
        <td>${payload.sintomas}</td>
        <td>${payload.comentario_ia}</td>
      `;
      el.historialBody.prepend(tr);
      setMsg('Caso guardado.');
      el.paciente.value=''; el.telefono.value=''; el.sintomas.value=''; el.sintomas.focus();
    } catch (e) {
      setMsg('Error al guardar la información.');
    }
  });

  // ===== Historial =====
  async function loadRecent() {
    try {
      const data = await apiFetch('/api/consultas?limit=5&sort=desc');
      el.historialBody.innerHTML = (data || []).map(r => `
        <tr>
          <td>${fmt(r.created_at)}</td>
          <td>${r.paciente || ''}</td>
          <td>${r.urgencia || ''}</td>
          <td>${(r.sintomas || '').replace(/\n/g,' ')}</td>
          <td>${(r.comentario_ia || '').replace(/\n/g,' ')}</td>
        </tr>
      `).join('');
    } catch {}
  }
  loadRecent();
})();
