// public/js/consultas.js (robusto y con PATCH correcto a /estado)
(function(){
  Auth.requireAuth();

  const el = {
    q: document.getElementById('q'),
    f_estado: document.getElementById('f_estado'),
    f_urgencia: document.getElementById('f_urgencia'),
    count: document.getElementById('count'),
    tbody: document.getElementById('tbody')
  };

  const state = { timer: null, fetching: false };

  function debounce(fn, ms=350) {
    let t; return (...a) => { clearTimeout(t); t = setTimeout(()=>fn(...a), ms); };
  }

  function urgBadge(v) {
    const vv = String(v||'').toLowerCase();
    const label = vv.includes('alta') ? 'Alta' : vv.includes('baja') ? 'Baja' : 'Media';
    const c = label==='Alta' ? 'urg-alta' : label==='Baja' ? 'urg-baja' : 'urg-media';
    return `<span class="urgencia-badge ${c}">${label}</span>`;
  }

  function estadoBadgeTxt(v) {
    const val = (String(v||'').toLowerCase().includes('atendido')) ? 'Atendido' : 'Pendiente';
    const txt = val==='Atendido' ? 'Ya se atendió' : 'Pendiente de atender';
    const c = val==='Atendido' ? 'estado-atendido' : 'estado-pendiente';
    return `<span class="estado-badge ${c}">${txt}</span>`;
  }

  function fmt(dt) {
    if (!dt) return '';
    const d = new Date(dt);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleString('es-GT',{hour12:false});
  }

  // Normaliza una fila del backend (distintas variantes)
  function normalizeRow(r) {
    const estadoRaw = r.estado ?? r.status ?? '';
    const estado = String(estadoRaw).toLowerCase().includes('atendido') ? 'Atendido' : 'Pendiente';
    const urgRaw = r.urgencia ?? r.nivel_urgencia ?? r.urgency ?? '';

    function normUrg(u){
      const s = String(u||'').toLowerCase();
      if (s.includes('alta')) return 'Alta';
      if (s.includes('baja')) return 'Baja';
      return 'Media';
    }

    return {
      id: r.id ?? r.consulta_id ?? r.ID ?? r.Id,
      created_at: r.created_at ?? r.fecha_creacion ?? r.createdAt ?? r.CreatedAt,
      paciente: r.paciente ?? r.nombre ?? r.patient_name ?? r.Patient ?? '',
      telefono: r.telefono ?? r.phone ?? r.telefono_paciente ?? '',
      sintomas: r.sintomas ?? r.symptoms ?? '',
      comentario_ia: r.comentario_ia ?? r.comentarios_ia ?? r.ia_comment ?? r.comentario ?? '',
      urgencia: normUrg(urgRaw),
      estado,
      attended_at: r.attended_at ?? r.atendido_at ?? r.fecha_atendido ?? r.atendidoAt ?? r.attendedAt ?? null
    };
  }

  async function fetchList(params) {
    // 1) ruta primaria
    const url1 = `/api/consultas?${params.toString()}`;
    // 2) posibles rutas antiguas
    const url2 = `/api/consultas/list?${params.toString()}`;
    const url3 = `/api/consultas/all?${params.toString()}`;

    try {
      return await apiFetch(url1);
    } catch (e1) {
      try { return await apiFetch(url2); }
      catch (e2) {
        return await apiFetch(url3);
      }
    }
  }

  async function load() {
    if (state.fetching) return;
    state.fetching = true;
    try {
      const params = new URLSearchParams();
      const q = el.q?.value?.trim();
      if (q) params.set('q', q);

      if (el.f_estado?.value) {
        const es = String(el.f_estado.value).toLowerCase();
        if (es==='pendiente' || es==='atendido') params.set('estado', es);
      }
      if (el.f_urgencia?.value) {
        const u = String(el.f_urgencia.value).toLowerCase();
        if (['alta','media','baja'].includes(u)) params.set('urgencia', u[0].toUpperCase()+u.slice(1));
      }
      params.set('limit','200');

      let data = await fetchList(params);
      if (!Array.isArray(data) && data?.data && Array.isArray(data.data)) data = data.data;
      if (!Array.isArray(data)) data = [];

      const rows = data.map(normalizeRow);
      if (el.count) el.count.textContent = `${rows.length} registro(s)`;

      el.tbody.innerHTML = rows.map(r => `
        <tr data-id="${r.id}">
          <td>${fmt(r.created_at)}</td>
          <td>${r.paciente}</td>
          <td>${r.telefono ? `<a href="tel:${r.telefono}">${r.telefono}</a>` : ''}</td>
          <td>${(r.comentario_ia || '').replace(/\n/g,' ')}</td>
          <td>${urgBadge(r.urgencia)}</td>
          <td>${(r.sintomas || '').replace(/\n/g,' ')}</td>
          <td>${estadoBadgeTxt(r.estado)}</td>
          <td>${fmt(r.attended_at)}</td>
          <td>
            <button class="btn-action ${r.estado==='Atendido'?'btn-danger':'btn-success'}" data-action="toggle">
              ${r.estado==='Atendido'?'Pendiente':'Ya se atendió'}
            </button>
          </td>
        </tr>
      `).join('');
    } catch (err) {
      console.error('Error cargando consultas:', err);
      apiToast(err.message || 'No se pudo cargar las consultas.', 'error');
      if (el.count) el.count.textContent = '0 registro(s)';
      el.tbody.innerHTML = '';
    } finally {
      state.fetching = false;
    }
  }

  // ✅ Ahora sí usa la ruta correcta del backend: /api/consultas/:id/estado
  async function toggleEstado(id, actual) {
    try {
      const nextPretty = actual==='Atendido' ? 'Pendiente' : 'Atendido';
      const payload = { estado: nextPretty.toLowerCase() }; // el back lo pasa a lower-case igualmente
      await apiFetch(`/api/consultas/${id}/estado`, {
        method: 'PATCH',
        body: JSON.stringify(payload)
      });
      // refresco inmediato (y además todos lo verán por el polling)
      load();
    } catch (e) {
      console.error('Error actualizando estado:', e);
      apiToast('No se pudo actualizar el estado.', 'error');
    }
  }

  el.tbody.addEventListener('click', (ev) => {
    const btn = ev.target.closest('button[data-action="toggle"]');
    if (!btn) return;
    const tr = btn.closest('tr');
    const id = tr?.dataset?.id;
    const isAtendido = tr?.querySelector('td:nth-child(7) .estado-badge')?.textContent.includes('Ya se atendió');
    const estadoActual = isAtendido ? 'Atendido' : 'Pendiente';
    if (id) toggleEstado(id, estadoActual);
  });

  const refilter = debounce(load, 350);
  el.q?.addEventListener('input', refilter);
  el.f_estado?.addEventListener('change', load);
  el.f_urgencia?.addEventListener('change', load);

  function startPolling(){
    stopPolling();
    state.timer = setInterval(()=>{ if(document.visibilityState==='visible') load(); }, 5000);
  }
  function stopPolling(){ if(state.timer) clearInterval(state.timer); }

  document.addEventListener('visibilitychange', ()=>{ if(document.visibilityState==='visible') load(); });

  load();
  startPolling();
})();
