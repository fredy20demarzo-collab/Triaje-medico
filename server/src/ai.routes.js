
// server/src/ai.routes.js
const express = require('express');
const router = express.Router();

const HF_MODEL = process.env.HF_MODEL || 'MoritzLaurer/mDeBERTa-v3-base-mnli-xnli';
const HF_TOKEN = process.env.HF_TOKEN || '';
const HF_SPECIALTIES = (process.env.HF_SPECIALTIES || '').split(',').map(s => s.trim()).filter(Boolean);
const HF_CONDITIONS  = (process.env.HF_CONDITIONS  || '').split(',').map(s => s.trim()).filter(Boolean);

// fetch para Node < 18
const fetch = global.fetch || ((...a) => import('node-fetch').then(({ default: f }) => f(...a)));

// ---------- Auth simple (usa el tuyo si ya tienes) ----------
function authRequired(req, res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'No autorizado' });
  next();
}

/* =========================
 * Fallbacks (sin HuggingFace)
 * ========================= */
function fallbackUrgency(text) {
  const t = (text || '').toLowerCase();
  const alta = [
    'dificultad para respirar','falta de aire','ahogo','dolor de pecho','pecho','torácic',
    'desmayo','convuls','sangrado','parálisis','inconsciente','fuerte dolor'
  ];
  const media = [
    'fiebre','temperatura','cefalea','dolor de cabeza','vómito','vomito','diarrea','mareo','tos','faringitis'
  ];
  let urgencia = 'Baja';
  if (alta.some(k => t.includes(k))) urgencia = 'Alta';
  else if (media.some(k => t.includes(k))) urgencia = 'Media';

  const comentarioIA = {
    Alta:  'Priorizar evaluación médica inmediata.',
    Media: 'Recomendar observación, analgésico y líquidos si procede.',
    Baja:  'Orientar autocuidado y seguimiento si los síntomas persisten.'
  }[urgencia];

  return { urgencia, score: 0.5, comentarioIA, source: 'fallback' };
}

function fallbackSpecialist(text, urgencia) {
  const t = (text || '').toLowerCase();
  if (urgencia === 'Alta') return 'Médico de emergencias';

  const rules = [
    { sp: 'Cardiólogo',         kw: ['dolor de pecho','pecho','palpit','taquic','hipertens','presión alta'] },
    { sp: 'Neumólogo',          kw: ['dificultad para respirar','falta de aire','asma','sibil','neumon','tos persistente'] },
    { sp: 'Gastroenterólogo',   kw: ['dolor abdominal','vómito','vomito','diarrea','acidez','reflujo','heces'] },
    { sp: 'Neurólogo',          kw: ['convuls','desmayo','pérdida de conciencia','parálisis','debilidad','migraña','cefalea intensa'] },
    { sp: 'Otorrinolaringólogo',kw: ['dolor de garganta','oído','otitis','sinus','nasal','amigdal'] },
    { sp: 'Dermatólogo',        kw: ['erupción','sarpullido','piel','dermat','mancha','comezón','prurito'] },
    { sp: 'Traumatólogo/Ortopedista', kw: ['fractura','golpe','esguince','torcedura','rodilla','hombro','columna','hueso'] },
    { sp: 'Ginecólogo/Obstetra',kw: ['embarazo','sangrado vaginal','pélvic','ginec','menstruación','parto'] },
    { sp: 'Urólogo',            kw: ['orinar','ardor al orinar','cólico renal','cálcul','riñón','próstata'] },
    { sp: 'Endocrinólogo',      kw: ['glucosa','azúcar','tiroid','hipo','hiper','diabet'] },
    { sp: 'Reumatólogo',        kw: ['artritis','articul','reuma','inflamación crónica','dolor articular'] },
    { sp: 'Nefrólogo',          kw: ['riñón','insuficiencia renal','proteinuria','edema','dialisis','creatinina'] },
    { sp: 'Hematólogo',         kw: ['anemia','plaquetas','coagulación','sangrado frecuente','hemat'] },
    { sp: 'Oncólogo',           kw: ['tumor','cáncer','masa','nódulo','onc'] },
    { sp: 'Infectólogo',        kw: ['infección persistente','fiebre prolongada','vih','tuberc'] },
    { sp: 'Alergólogo/Inmunólogo', kw: ['alergia','rinitis','asma alérgica','urticaria','inmuno'] },
    { sp: 'Oftalmólogo',        kw: ['ojo','visión','conjuntivitis','dolor ocular','fotofobia'] },
    { sp: 'Odontólogo',         kw: ['diente','muela','encía','caries','odont'] },
    { sp: 'Nutriólogo(a)',      kw: ['nutrición','peso','dieta','alimentación','obesid','sobrepeso'] },
    { sp: 'Fisioterapeuta',     kw: ['rehabilitación','fisioterap','kinesi','dolor múscul','contractura'] },
    { sp: 'Médico del deporte', kw: ['deporte','lesión deportiva','alto rendimiento'] },
    { sp: 'Psiquiatra',         kw: ['depresión','psicosis','manía','alucinación','suicida','ansiedad grave'] },
    { sp: 'Psicólogo(a) clínico(a)', kw: ['ansiedad','estrés','duelo','terapia psicol'] },
    { sp: 'Geriatra',           kw: ['adulto mayor','geriatr','caídas frecuentes','demencia'] },
    { sp: 'Pediatra',           kw: ['niño','bebé','lactante','pediatr'] },
    { sp: 'Médico internista',  kw: ['enfermedad crónica múltiple','control integral','comorbilidades'] },
  ];

  const hit = rules.find(r => r.kw.some(k => t.includes(k)));
  // ✅ FIX: nada de r.hit; devolvemos el especialista o 'Médico general'
  return hit ? hit.sp : 'Médico general';
}

function fallbackCondition(text, urgencia) {
  const t = (text || '').toLowerCase();
  if (urgencia === 'Alta') {
    if (t.includes('pecho') || t.includes('respirar') || t.includes('ahogo')) {
      return 'evento cardiopulmonar agudo (orientativo)';
    }
  }
  const rules = [
    { dx: 'gastroenteritis', kw: ['diarrea','vómito','vomito','dolor abdominal','náusea','nausea'] },
    { dx: 'faringitis/amigdalitis', kw: ['dolor de garganta','amigdal','faring'] },
    { dx: 'infección respiratoria', kw: ['tos','congestión','mocos','resfriado','gripa'] },
    { dx: 'influenza', kw: ['fiebre alta','dolor muscular','malestar general','escalofríos'] },
    { dx: 'migraña', kw: ['migraña','cefalea intensa','fotofobia','náusea','aura'] },
    { dx: 'sinusitis', kw: ['dolor facial','presión facial','secreción nasal espesa'] },
    { dx: 'bronquitis', kw: ['tos productiva','dolor torácico al toser'] },
    { dx: 'asma exacerbada', kw: ['sibil','silbido','opresión torácica','asma'] },
    { dx: 'infección urinaria', kw: ['ardor al orinar','disuria','orina con mal olor','cistitis'] },
    { dx: 'dermatitis alérgica', kw: ['erupción','sarpullido','comezón','prurito','urticaria'] },
    { dx: 'ansiedad', kw: ['nervios','palpit','ansiedad','ataque de pánico'] },
    { dx: 'deshidratación', kw: ['sed intensa','labios secos','orina oscura'] },
    { dx: 'gastritis/reflujo', kw: ['acidez','reflujo','ardor estomacal','pirosis'] },
  ];
  const hit = rules.find(r => r.kw.some(k => t.includes(k)));
  return hit ? hit.dx : 'no determinado';
}

/* ============== HuggingFace: URGENCIA ============== */
async function hfZeroShotUrgency(text) {
  if (!HF_TOKEN) return fallbackUrgency(text);

  const url = `https://api-inference.huggingface.co/models/${encodeURIComponent(HF_MODEL)}?wait_for_model=true`;
  const payload = {
    inputs: text,
    parameters: {
      candidate_labels: ['urgencia alta', 'urgencia media', 'urgencia baja'],
      multi_label: false,
      hypothesis_template: 'El nivel de urgencia del paciente es {}.'
    }
  };
  const headers = { Authorization: `Bearer ${HF_TOKEN}`, 'Content-Type': 'application/json' };

  const maxRetries = 3;
  for (let i = 0; i < maxRetries; i++) {
    try {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), 20000);
      const resp = await fetch(url, { method: 'POST', headers, body: JSON.stringify(payload), signal: controller.signal });
      clearTimeout(id);

      if (resp.status === 401 || resp.status === 403) return fallbackUrgency(text);
      if (resp.status === 503) { await new Promise(r => setTimeout(r, 800*(i+1))); continue; }
      if (!resp.ok) return fallbackUrgency(text);

      const data = await resp.json();
      const labels = data.labels || data[0]?.labels || [];
      const scores = data.scores || data[0]?.scores || [];

      let best = { label: 'urgencia media', score: 0.5 };
      if (labels.length && scores.length) {
        const idx = scores.indexOf(Math.max(...scores));
        best = { label: labels[idx], score: scores[idx] };
      }
      const lab = (best.label || '').toLowerCase();
      const urgencia = lab.includes('alta') ? 'Alta' : lab.includes('baja') ? 'Baja' : 'Media';

      const comentarioIA = {
        Alta:  'Priorizar evaluación médica inmediata.',
        Media: 'Recomendar observación, analgésico y líquidos si procede.',
        Baja:  'Orientar autocuidado y seguimiento si los síntomas persisten.'
      }[urgencia];

      return { urgencia, score: best.score, comentarioIA, raw: data, source: 'huggingface' };
    } catch (e) {
      if (i === maxRetries - 1) return fallbackUrgency(text);
      await new Promise(r => setTimeout(r, 300));
    }
  }
  return fallbackUrgency(text);
}

/* ============== HuggingFace: ESPECIALIDAD ============== */
function buildSpecialtyCandidates() {
  const base = [
    'medicina de emergencias','medicina general','medicina interna','cardiología','neumología','gastroenterología',
    'neurología','traumatología y ortopedia','otorrinolaringología','dermatología','urología','ginecología y obstetricia',
    'pediatría','geriatría','psiquiatría','psicología clínica','endocrinología','reumatología','nefrología','hematología',
    'oncología','infectología','alergología e inmunología','alergología','inmunología clínica','oftalmología','odontología',
    'nutrición clínica','nutriología','fisioterapia','medicina física y rehabilitación','fisiatría y rehabilitación',
    'terapia ocupacional','terapia del habla y lenguaje','radiología','anestesiología','medicina del dolor','cuidados paliativos',
    'medicina del deporte'
  ];
  return Array.from(new Set(base.concat(HF_SPECIALTIES)));
}
function normalizeSpecialty(label) {
  const s = (label || '').toLowerCase();
  if (s.includes('emerg')) return 'Médico de emergencias';
  if (s.includes('general')) return 'Médico general';
  if (s.includes('interna')) return 'Médico internista';
  if (s.includes('card')) return 'Cardiólogo';
  if (s.includes('neum')) return 'Neumólogo';
  if (s.includes('gastro')) return 'Gastroenterólogo';
  if (s.includes('neuro')) return 'Neurólogo';
  if (s.includes('trauma') || s.includes('ortoped')) return 'Traumatólogo/Ortopedista';
  if (s.includes('otorr')) return 'Otorrinolaringólogo';
  if (s.includes('dermat')) return 'Dermatólogo';
  if (s.includes('uro')) return 'Urólogo';
  if (s.includes('ginec') || s.includes('obst')) return 'Ginecólogo/Obstetra';
  if (s.includes('pedi')) return 'Pediatra';
  if (s.includes('geri')) return 'Geriatra';
  if (s.includes('psiqui')) return 'Psiquiatra';
  if (s.includes('psicol')) return 'Psicólogo(a) clínico(a)';
  if (s.includes('endo')) return 'Endocrinólogo';
  if (s.includes('reuma')) return 'Reumatólogo';
  if (s.includes('nefr')) return 'Nefrólogo';
  if (s.includes('hemat')) return 'Hematólogo';
  if (s.includes('onco')) return 'Oncólogo';
  if (s.includes('infect')) return 'Infectólogo';
  if (s.includes('alerg') || s.includes('inmuno')) return 'Alergólogo/Inmunólogo';
  if (s.includes('oftal')) return 'Oftalmólogo';
  if (s.includes('odont')) return 'Odontólogo';
  if (s.includes('nutri')) return 'Nutriólogo(a)';
  if (s.includes('fisioter')) return 'Fisioterapeuta';
  if (s.includes('fisiatr') || s.includes('rehabil')) return 'Fisiatra / Rehabilitación';
  if (s.includes('ocupac')) return 'Terapeuta ocupacional';
  if (s.includes('habla') || s.includes('lenguaje') || s.includes('fono')) return 'Fonoaudiólogo(a)';
  if (s.includes('radiol')) return 'Radiólogo';
  if (s.includes('anest')) return 'Anestesiólogo';
  if (s.includes('dolor') || s.includes('paliat')) return 'Especialista en dolor / Cuidados paliativos';
  if (s.includes('deporte')) return 'Médico del deporte';
  return label ? label.charAt(0).toUpperCase() + label.slice(1) : 'Médico general';
}
async function hfZeroShotSpecialty(text, urgencia) {
  if (urgencia === 'Alta') return 'Médico de emergencias';
  if (!HF_TOKEN) return fallbackSpecialist(text, urgencia);

  const candidates = buildSpecialtyCandidates();
  const url = `https://api-inference.huggingface.co/models/${encodeURIComponent(HF_MODEL)}?wait_for_model=true`;
  const payload = {
    inputs: text,
    parameters: {
      candidate_labels: candidates,
      multi_label: false,
      hypothesis_template: 'La especialidad médica adecuada para este paciente es {}.'
    }
  };
  const headers = { Authorization: `Bearer ${HF_TOKEN}`, 'Content-Type': 'application/json' };

  const maxRetries = 3;
  for (let i = 0; i < maxRetries; i++) {
    try {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), 20000);
      const resp = await fetch(url, { method: 'POST', headers, body: JSON.stringify(payload), signal: controller.signal });
      clearTimeout(id);

      if (resp.status === 401 || resp.status === 403) return fallbackSpecialist(text, urgencia);
      if (resp.status === 503) { await new Promise(r => setTimeout(r, 800*(i+1))); continue; }
      if (!resp.ok) return fallbackSpecialist(text, urgencia);

      const data = await resp.json();
      const labels = data.labels || data[0]?.labels || [];
      const scores = data.scores || data[0]?.scores || [];
      let bestLabel = 'medicina general';
      if (labels.length && scores.length) {
        const idx = scores.indexOf(Math.max(...scores));
        bestLabel = labels[idx] || bestLabel;
      }
      return normalizeSpecialty(bestLabel);
    } catch (e) {
      if (i === maxRetries - 1) return fallbackSpecialist(text, urgencia);
      await new Promise(r => setTimeout(r, 300));
    }
  }
  return fallbackSpecialist(text, urgencia);
}

/* ============== HuggingFace: PADECIMIENTO ============== */
function buildConditionCandidates() {
  const base = [
    'gastroenteritis','faringitis','amigdalitis','infección respiratoria','resfriado común','influenza',
    'migraña','sinusitis','bronquitis','asma exacerbada','neumonía','covid-19',
    'infección urinaria','cistitis','pielonefritis',
    'dermatitis alérgica','urticaria','eccema',
    'gastritis','reflujo gastroesofágico',
    'deshidratación','ansiedad',
    'hipertensión','hipotensión','hipoglucemia'
  ];
  return Array.from(new Set(base.concat(HF_CONDITIONS)));
}
function normalizeCondition(label) {
  if (!label) return 'no determinado';
  const l = label.toLowerCase();
  const map = {
    'covid': 'COVID-19',
    'cistitis': 'infección urinaria (cistitis)',
    'pielonefritis': 'infección urinaria (pielonefritis)',
    'reflujo': 'reflujo gastroesofágico',
  };
  for (const k of Object.keys(map)) if (l.includes(k)) return map[k];
  return label.charAt(0).toUpperCase() + label.slice(1);
}
async function hfZeroShotCondition(text, urgencia) {
  if (!HF_TOKEN) return fallbackCondition(text, urgencia);

  const candidates = buildConditionCandidates();
  const url = `https://api-inference.huggingface.co/models/${encodeURIComponent(HF_MODEL)}?wait_for_model=true`;
  const payload = {
    inputs: text,
    parameters: {
      candidate_labels: candidates,
      multi_label: false,
      hypothesis_template: 'El padecimiento probable del paciente es {}.'
    }
  };
  const headers = { Authorization: `Bearer ${HF_TOKEN}`, 'Content-Type': 'application/json' };

  const maxRetries = 3;
  for (let i = 0; i < maxRetries; i++) {
    try {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), 20000);
      const resp = await fetch(url, { method: 'POST', headers, body: JSON.stringify(payload), signal: controller.signal });
      clearTimeout(id);

      if (resp.status === 401 || resp.status === 403) return fallbackCondition(text, urgencia);
      if (resp.status === 503) { await new Promise(r => setTimeout(r, 800*(i+1))); continue; }
      if (!resp.ok) return fallbackCondition(text, urgencia);

      const data = await resp.json();
      const labels = data.labels || data[0]?.labels || [];
      const scores = data.scores || data[0]?.scores || [];
      let best = 'no determinado';
      if (labels.length && scores.length) {
        const idx = scores.indexOf(Math.max(...scores));
        best = labels[idx] || best;
      }
      return normalizeCondition(best);
    } catch (e) {
      if (i === maxRetries - 1) return fallbackCondition(text, urgencia);
      await new Promise(r => setTimeout(r, 300));
    }
  }
  return fallbackCondition(text, urgencia);
}

/* ======================
 * Ruta pública de IA
 * ====================== */
router.post('/ai/triage', authRequired, async (req, res) => {
  try {
    const { sintomas } = req.body || {};
    if (!sintomas || !sintomas.trim()) {
      return res.status(400).json({ error: 'El campo "sintomas" es obligatorio.' });
    }

    const u   = await hfZeroShotUrgency(sintomas.trim());
    const esp = await hfZeroShotSpecialty(sintomas.trim(), u.urgencia);
    const dx  = await hfZeroShotCondition(sintomas.trim(), u.urgencia);

    res.json({
      urgencia: u.urgencia,
      score: u.score,
      comentarioIA: u.comentarioIA,
      especialista: esp,
      padecimiento: dx,
      source: u.source
    });
  } catch (e) {
    // Última red de seguridad: evitamos que un error en fallback vuelva a romper
    try {
      const fb = fallbackUrgency(req.body?.sintomas);
      let esp = 'Médico general';
      try { esp = fallbackSpecialist(req.body?.sintomas, fb.urgencia); } catch {}
      let dx = 'no determinado';
      try { dx = fallbackCondition(req.body?.sintomas, fb.urgencia); } catch {}
      return res.json({
        urgencia: fb.urgencia,
        score: fb.score,
        comentarioIA: fb.comentarioIA,
        especialista: esp,
        padecimiento: dx,
        source: 'fallback'
      });
    } catch {
      return res.json({
        urgencia: 'Media',
        score: 0.5,
        comentarioIA: 'Recomendar observación y seguimiento.',
        especialista: 'Médico general',
        padecimiento: 'no determinado',
        source: 'failsafe'
      });
    }
  }
});

router.get('/ai/status', authRequired, (req, res) => {
  res.json({
    model: HF_MODEL,
    hasToken: Boolean(HF_TOKEN),
    tokenPrefix: HF_TOKEN ? HF_TOKEN.slice(0, 6) + '…' : null,
    specialtiesCount: buildSpecialtyCandidates().length,
    conditionsCount: buildConditionCandidates().length
  });
});

module.exports = router;
