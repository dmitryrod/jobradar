import { clampLeftEdge } from './score-tooltip-clamp.js';

const listEl = document.getElementById('list');
const tpl = document.getElementById('card-tpl');

const vacancyTabsEl = document.querySelector('.vacancy-tabs');
const harvestPanelEl = document.getElementById('harvest-panel');
const reviewPendingPanelEl = document.getElementById('review-pending-panel');

/** Запомненный выбор HH_REMOTE_TYPE на вкладке «Сбор вакансий». */
const LS_HH_REMOTE_TYPE = 'hhRuHarvestRemoteType';
/** Запомненное состояние подробного лога harvest (кнопка Debug в «Настройки»), если в .env сервера не задано HH_HARVEST_DEBUG. */
const LS_HH_HARVEST_DEBUG = 'hhRuHarvestDebug';

/** @type {'queue' | 'collect'} */
let viewMode = 'queue';
let currentStatus = 'pending';

/** Нормализованные веса semantic-LLM score (как в lib/scoring-blend.mjs) */
let llmAxisWeights = { vacancy: 0.35, cvMatch: 0.65 };
let overallScoreShares = { llm: 0.65, profile: 0.35 };

/** Итог обхода карточки (`url_outcome` в логе harvest) → колонка «Действие». */
const HARVEST_OUTCOME_LABELS = {
  skipped_filter: 'Отфильтровано (жёсткий фильтр)',
  duplicate: 'Уже в очереди',
  pending: 'На проверке',
  pending_draft: 'На проверке (черновик письма)',
  rejected_auto: 'Отклонённые (авто по score)',
  rejected_profile: 'Отклонённые (ban в профиле)',
  review_automation_error: 'Ошибка автоматизации',
  unknown: '—',
};

function normalizeSemanticScoreWeights(raw) {
  let vacancy = Number(raw?.vacancy);
  let cvMatch = Number(raw?.cvMatch);
  if (!Number.isFinite(vacancy)) vacancy = 0.35;
  if (!Number.isFinite(cvMatch)) cvMatch = 0.65;
  const sum = vacancy + cvMatch;
  if (sum <= 0) return { vacancy: 0.35, cvMatch: 0.65 };
  return { vacancy: vacancy / sum, cvMatch: cvMatch / sum };
}

function normalizeOverallScoreShares(raw) {
  let llm = Number(raw?.llm);
  let profile = Number(raw?.profile);
  if (!Number.isFinite(llm)) llm = 0.65;
  if (!Number.isFinite(profile)) profile = 0.35;
  const sum = llm + profile;
  if (sum <= 0) return { llm: 0.65, profile: 0.35 };
  return { llm: llm / sum, profile: profile / sum };
}

function finiteScoreOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function deriveCardLlmScore(item) {
  const stored = finiteScoreOrNull(item.scoreLlm);
  if (stored != null) return stored;
  const sv = finiteScoreOrNull(item.scoreVacancy);
  const scm = finiteScoreOrNull(item.scoreCvMatch);
  if (sv == null || scm == null) return null;
  return Math.round(
    sv * llmAxisWeights.vacancy + scm * llmAxisWeights.cvMatch
  );
}

function deriveCardProfileScore(item) {
  return finiteScoreOrNull(item.scoreProfile);
}

function formatHarvestOutcomeAt(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'medium' });
}

function harvestOutcomeActionText(row) {
  const base = HARVEST_OUTCOME_LABELS[row.outcome] || row.outcome;
  if (row.detail) return `${base} · ${row.detail}`;
  return base;
}

/** @type {{ id: string, variants: string[], selectedIndex: number } | null} */
let draftModalState = null;

/** @type {ReturnType<typeof setInterval> | null} */
let applyLogRefreshTimer = null;

document.addEventListener('click', () => {
  document.querySelectorAll('.model-info-panel').forEach((p) => {
    p.hidden = true;
  });
});

function showToast(message, variant = 'neutral') {
  let host = document.getElementById('toast-host');
  if (!host) {
    host = document.createElement('div');
    host.id = 'toast-host';
    host.className = 'toast-host';
    document.body.appendChild(host);
  }
  const t = document.createElement('div');
  t.className = `toast toast--${variant}`;
  t.setAttribute('role', 'status');
  t.textContent = message;
  host.appendChild(t);
  requestAnimationFrame(() => t.classList.add('toast--visible'));
  const hide = () => {
    t.classList.remove('toast--visible');
    setTimeout(() => t.remove(), 280);
  };
  setTimeout(hide, 2600);
}

async function api(path, opts = {}) {
  const url =
    typeof path === 'string' && path.startsWith('/')
      ? new URL(path, window.location.origin).toString()
      : path;
  let r;
  try {
    r = await fetch(url, {
      headers: { 'Content-Type': 'application/json', ...opts.headers },
      ...opts,
    });
  } catch (e) {
    const msg =
      e instanceof TypeError
        ? 'Нет ответа от дашборда (процесс node мог упасть или порт занят). Перезапустите: npm run dashboard'
        : String(e?.message || e);
    const err = new Error(msg);
    err.cause = e;
    throw err;
  }
  const text = await r.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    const looksHtml = /^\s*</.test(text);
    const hint =
      r.status === 404 && (text.trim() === 'Not found' || looksHtml)
        ? 'Ответ не JSON (часто 404 у статики). Запустите дашборд: npm run dashboard и откройте http://127.0.0.1:3849'
        : text.slice(0, 400) || r.statusText;
    const err = new Error(hint);
    err.status = r.status;
    throw err;
  }
  if (!r.ok) {
    const err = new Error(data.error || r.statusText);
    err.status = r.status;
    err.payload = data;
    throw err;
  }
  return data;
}

async function requestCoverLetterGenerate(id, force = false) {
  return api('/api/cover-letter/generate', {
    method: 'POST',
    body: JSON.stringify({ id, force }),
  });
}

function closeDraftModal() {
  const modal = document.getElementById('draft-modal');
  if (!modal) return;
  modal.hidden = true;
  draftModalState = null;
  document.removeEventListener('keydown', onDraftModalEscape);
  stopDragDraftModal();
}

/** Drag state for draft modal */
let draftModalDragState = {
  isDragging: false,
  startX: 0,
  startY: 0,
  initialLeft: 0,
  initialTop: 0,
  dialogEl: null,
  headEl: null,
};

function resetDraftModalPosition() {
  const dialog = document.querySelector('#draft-modal .modal-dialog');
  if (!dialog) return;
  dialog.classList.remove('is-dragging');
  dialog.style.left = '';
  dialog.style.top = '';
  dialog.style.transform = '';
}

function startDragDraftModal(e) {
  const head = e.currentTarget;
  const dialog = head.closest('.modal-dialog');
  if (!dialog) return;

  // Don't drag if clicking the close button
  if (e.target.closest('.modal-close')) return;

  e.preventDefault();

  const rect = dialog.getBoundingClientRect();
  draftModalDragState = {
    isDragging: true,
    startX: e.clientX,
    startY: e.clientY,
    initialLeft: rect.left,
    initialTop: rect.top,
    dialogEl: dialog,
    headEl: head,
  };

  dialog.classList.add('is-dragging');
  dialog.style.left = `${rect.left}px`;
  dialog.style.top = `${rect.top}px`;
  dialog.style.transform = 'none';

  document.addEventListener('mousemove', onDragDraftModalMove);
  document.addEventListener('mouseup', stopDragDraftModal);
  document.addEventListener('mouseleave', stopDragDraftModal);
}

function onDragDraftModalMove(e) {
  if (!draftModalDragState.isDragging || !draftModalDragState.dialogEl) return;

  const deltaX = e.clientX - draftModalDragState.startX;
  const deltaY = e.clientY - draftModalDragState.startY;

  let newLeft = draftModalDragState.initialLeft + deltaX;
  let newTop = draftModalDragState.initialTop + deltaY;

  // Clamp to viewport bounds
  const dialog = draftModalDragState.dialogEl;
  const rect = dialog.getBoundingClientRect();
  const margin = 8;

  const minLeft = margin;
  const maxLeft = window.innerWidth - rect.width - margin;
  const minTop = margin;
  const maxTop = window.innerHeight - rect.height - margin;

  newLeft = Math.max(minLeft, Math.min(newLeft, maxLeft));
  newTop = Math.max(minTop, Math.min(newTop, maxTop));

  dialog.style.left = `${newLeft}px`;
  dialog.style.top = `${newTop}px`;
}

function stopDragDraftModal() {
  if (!draftModalDragState.isDragging) return;
  draftModalDragState.isDragging = false;
  document.removeEventListener('mousemove', onDragDraftModalMove);
  document.removeEventListener('mouseup', stopDragDraftModal);
  document.removeEventListener('mouseleave', stopDragDraftModal);
}

function initDraftModalDrag() {
  const head = document.querySelector('#draft-modal .modal-head');
  if (!head) return;
  head.addEventListener('mousedown', startDragDraftModal);
}

function onDraftModalEscape(e) {
  if (e.key === 'Escape') closeDraftModal();
}

function closeApprovedLetterModal() {
  const modal = document.getElementById('approved-letter-modal');
  if (!modal) return;
  modal.hidden = true;
  document.removeEventListener('keydown', onApprovedModalEscape);
}

function closeApplyLogModal() {
  if (applyLogRefreshTimer != null) {
    clearInterval(applyLogRefreshTimer);
    applyLogRefreshTimer = null;
  }
  const modal = document.getElementById('apply-log-modal');
  if (!modal) return;
  modal.hidden = true;
  document.removeEventListener('keydown', onApplyLogModalEscape);
}

function onApplyLogModalEscape(e) {
  if (e.key === 'Escape') closeApplyLogModal();
}

async function refreshApplyLogModal() {
  const modal = document.getElementById('apply-log-modal');
  if (!modal) return;
  const pre = modal.querySelector('.apply-log-pre');
  const pathEl = modal.querySelector('.apply-log-path');
  pathEl.textContent = 'data/hh-apply-chat.log';
  pre.textContent = 'Загрузка…';
  try {
    const data = await api('/api/hh-apply-chat-log?lines=120');
    const rel = data.relativePath || data.path || 'data/hh-apply-chat.log';
    pathEl.textContent = rel && rel !== '.' ? rel : 'data/hh-apply-chat.log';
    if (!data.exists) {
      pre.textContent =
        'Файла лога ещё нет. Нажмите «Отклик в браузере» на карточке с утверждённым письмом — тогда появится Chromium и запись в лог.';
      return;
    }
    pre.textContent = data.text || '(пусто)';
  } catch (e) {
    pre.textContent = `Ошибка: ${e.message}`;
  }
}

function openApplyLogModal() {
  const modal = document.getElementById('apply-log-modal');
  if (!modal) return;
  if (applyLogRefreshTimer != null) {
    clearInterval(applyLogRefreshTimer);
    applyLogRefreshTimer = null;
  }
  modal.hidden = false;
  document.addEventListener('keydown', onApplyLogModalEscape);
  refreshApplyLogModal();
  applyLogRefreshTimer = setInterval(() => refreshApplyLogModal(), 2500);
}

function onApprovedModalEscape(e) {
  if (e.key === 'Escape') closeApprovedLetterModal();
}

function openApprovedLetterModal(item) {
  const modal = document.getElementById('approved-letter-modal');
  if (!modal) return;
  const text = String(item.coverLetter?.approvedText || '').trim();
  modal.querySelector('.modal-vacancy-approved').textContent = item.title || item.url || '';
  modal.querySelector('.modal-approved-text').textContent = text;
  modal.hidden = false;
  document.addEventListener('keydown', onApprovedModalEscape);
}

function openDraftModal(item) {
  const modal = document.getElementById('draft-modal');
  if (!modal) return;

  // Reset position to center when opening
  resetDraftModalPosition();

  const body = modal.querySelector('.modal-draft-body');
  const vacEl = modal.querySelector('.modal-vacancy');
  vacEl.textContent = item.title || item.url || '';
  body.innerHTML = '';

  const raw = item.coverLetter?.variants || [];
  const variants = raw.length ? raw.map((s) => String(s)) : [];
  if (!variants.length) {
    const p = document.createElement('p');
    p.className = 'modal-empty';
    p.textContent = 'Нет вариантов.';
    body.appendChild(p);
    modal.hidden = false;
    document.addEventListener('keydown', onDraftModalEscape);
    draftModalState = null;
    return;
  }

  const name = `draft-v-${item.id}`;
  let selectedIndex = 0;

  const fieldset = document.createElement('fieldset');
  fieldset.className = 'modal-draft-fieldset';
  const legend = document.createElement('legend');
  legend.textContent = 'Вариант';
  fieldset.appendChild(legend);

  variants.forEach((_, i) => {
    const row = document.createElement('div');
    row.className = 'modal-draft-variant-row';
    const input = document.createElement('input');
    input.type = 'radio';
    input.name = name;
    input.id = `${name}-${i}`;
    input.value = String(i);
    if (i === 0) input.checked = true;
    const label = document.createElement('label');
    label.htmlFor = `${name}-${i}`;
    label.textContent = `Вариант ${i + 1}`;
    row.appendChild(input);
    row.appendChild(label);
    fieldset.appendChild(row);
  });

  const lbl = document.createElement('label');
  lbl.className = 'modal-letter-label';
  lbl.htmlFor = `${name}-edit`;
  lbl.textContent = 'Текст (правки сохраняются и учитываются при следующей генерации)';

  const ta = document.createElement('textarea');
  ta.className = 'modal-letter-edit';
  ta.id = `${name}-edit`;
  ta.rows = 12;
  ta.value = variants[0] || '';

  const actions = document.createElement('div');
  actions.className = 'modal-draft-actions';

  const btnSave = document.createElement('button');
  btnSave.type = 'button';
  btnSave.className = 'btn';
  btnSave.textContent = 'Сохранить правки';

  const btnApprove = document.createElement('button');
  btnApprove.type = 'button';
  btnApprove.className = 'btn ok';
  btnApprove.textContent = 'Подходит';

  const btnDecline = document.createElement('button');
  btnDecline.type = 'button';
  btnDecline.className = 'btn bad';
  btnDecline.textContent = 'Отклонить';

  actions.appendChild(btnSave);
  actions.appendChild(btnApprove);
  actions.appendChild(btnDecline);

  body.appendChild(fieldset);
  body.appendChild(lbl);
  body.appendChild(ta);
  body.appendChild(actions);

  draftModalState = { id: item.id, variants, selectedIndex: 0 };

  function syncTextareaToVariant() {
    if (!draftModalState) return;
    draftModalState.variants[draftModalState.selectedIndex] = ta.value;
  }

  fieldset.addEventListener('change', (ev) => {
    const t = ev.target;
    if (t.name !== name || t.type !== 'radio') return;
    syncTextareaToVariant();
    const idx = Number(t.value);
    if (!Number.isFinite(idx) || idx < 0 || idx >= draftModalState.variants.length) return;
    draftModalState.selectedIndex = idx;
    ta.value = draftModalState.variants[idx] ?? '';
  });

  btnSave.addEventListener('click', async () => {
    syncTextareaToVariant();
    btnSave.disabled = btnApprove.disabled = btnDecline.disabled = true;
    try {
      await api('/api/cover-letter/save-draft', {
        method: 'POST',
        body: JSON.stringify({ id: item.id, variants: draftModalState.variants }),
      });
      showToast('Правки сохранены', 'good');
      await load();
    } catch (e) {
      alert(e.message);
    } finally {
      btnSave.disabled = btnApprove.disabled = btnDecline.disabled = false;
    }
  });

  btnApprove.addEventListener('click', async () => {
    syncTextareaToVariant();
    const text = ta.value.trim();
    if (!text) {
      alert('Введите или выберите текст письма.');
      return;
    }
    btnSave.disabled = btnApprove.disabled = btnDecline.disabled = true;
    try {
      await api('/api/cover-letter/action', {
        method: 'POST',
        body: JSON.stringify({ id: item.id, action: 'approve', text }),
      });
      await api('/api/action', {
        method: 'POST',
        body: JSON.stringify({ id: item.id, action: 'approve', reason: '' }),
      });
      showToast('Сохранено: подходит', 'good');
      closeDraftModal();
      await load();
    } catch (e) {
      alert(e.message);
      btnSave.disabled = btnApprove.disabled = btnDecline.disabled = false;
    }
  });

  btnDecline.addEventListener('click', async () => {
    if (!confirm('Отклонить черновик?')) return;
    btnSave.disabled = btnApprove.disabled = btnDecline.disabled = true;
    try {
      await api('/api/cover-letter/action', {
        method: 'POST',
        body: JSON.stringify({ id: item.id, action: 'decline' }),
      });
      showToast('Черновик отклонён', 'neutral');
      closeDraftModal();
      await load();
    } catch (e) {
      alert(e.message);
      btnSave.disabled = btnApprove.disabled = btnDecline.disabled = false;
    }
  });

  modal.hidden = false;
  document.addEventListener('keydown', onDraftModalEscape);
}

const draftModalEl = document.getElementById('draft-modal');
draftModalEl?.querySelector('[data-close-modal]')?.addEventListener('click', closeDraftModal);
draftModalEl?.querySelector('.modal-close')?.addEventListener('click', closeDraftModal);

const approvedModalEl = document.getElementById('approved-letter-modal');
approvedModalEl?.querySelector('[data-close-approved-modal]')?.addEventListener('click', closeApprovedLetterModal);
approvedModalEl?.querySelector('.modal-close--approved')?.addEventListener('click', closeApprovedLetterModal);
document.querySelector('.btn-log-apply')?.addEventListener('click', () => openApplyLogModal());

const settingsPanelEl = document.getElementById('settings-panel');
const settingsBackdropEl = document.getElementById('settings-backdrop');

function onSettingsEscape(e) {
  if (e.key === 'Escape') closeSettingsPanel();
}

function closeSettingsPanel() {
  if (settingsPanelEl) settingsPanelEl.hidden = true;
  if (settingsBackdropEl) {
    settingsBackdropEl.hidden = true;
    settingsBackdropEl.setAttribute('aria-hidden', 'true');
  }
  document.removeEventListener('keydown', onSettingsEscape);
}

function openSettingsPanel() {
  if (settingsPanelEl) settingsPanelEl.hidden = false;
  if (settingsBackdropEl) {
    settingsBackdropEl.hidden = false;
    settingsBackdropEl.setAttribute('aria-hidden', 'false');
  }
  document.addEventListener('keydown', onSettingsEscape);
}

document.querySelector('.btn-settings')?.addEventListener('click', () => openSettingsPanel());
settingsBackdropEl?.addEventListener('click', () => closeSettingsPanel());
settingsPanelEl?.querySelector('.btn-settings-close')?.addEventListener('click', () => closeSettingsPanel());
settingsPanelEl?.querySelector('.btn-clear-db')?.addEventListener('click', async () => {
  if (
    !confirm(
      'Полностью очистить очередь вакансий (все статусы) и обнулить историю: логи отклика и harvest, фидбек, пропуски, правки писем? Действие необратимо. Файл config/preferences.json не изменится. Продолжить?',
    )
  ) {
    return;
  }
  const btn = settingsPanelEl?.querySelector('.btn-clear-db');
  if (btn) btn.disabled = true;
  try {
    await api('/api/data/reset', { method: 'POST', body: '{}' });
    closeSettingsPanel();
    await load();
    await refreshVacancyCounts();
    await refreshHarvestStats();
    showToast('База данных очищена', 'good');
  } catch (e) {
    alert(e.message || String(e));
  } finally {
    if (btn) btn.disabled = false;
  }
});

const profilePanelEl = document.getElementById('profile-panel');
const profileBackdropEl = document.getElementById('profile-backdrop');

function onProfileEscape(e) {
  if (e.key === 'Escape') closeProfilePanel();
}

function closeProfilePanel() {
  if (profilePanelEl) profilePanelEl.hidden = true;
  if (profileBackdropEl) {
    profileBackdropEl.hidden = true;
    profileBackdropEl.setAttribute('aria-hidden', 'true');
  }
  document.removeEventListener('keydown', onProfileEscape);
}

function openProfilePanel() {
  if (profilePanelEl) profilePanelEl.hidden = false;
  if (profileBackdropEl) {
    profileBackdropEl.hidden = false;
    profileBackdropEl.setAttribute('aria-hidden', 'false');
  }
  document.addEventListener('keydown', onProfileEscape);
  refreshProfilePanel();
}

function escapeProfileHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function profileSignSelectHtml(cur) {
  const c = cur === '-' || cur === '+-' ? cur : '+';
  const opts = [
    ['+', '+'],
    ['-', '−'],
    ['+-', '±'],
  ];
  return `<select class="pc-sign" aria-label="Знак балла">${opts
    .map(
      ([v, lab]) =>
        `<option value="${v}"${v === c ? ' selected' : ''}>${lab}</option>`,
    )
    .join('')}</select>`;
}

function profileBanSelectHtml(cur) {
  const v =
    cur === 'ban_if_matches' || cur === 'ban_if_not_matches' ? cur : 'off';
  const items = [
    ['off', 'off'],
    ['ban_if_matches', 'ban если да'],
    ['ban_if_not_matches', 'ban если нет'],
  ];
  return `<select class="pc-ban" aria-label="Ban">${items
    .map(
      ([val, lab]) =>
        `<option value="${val}"${val === v ? ' selected' : ''}>${escapeProfileHtml(
          lab,
        )}</option>`,
    )
    .join('')}</select>`;
}

function bindProfileRowEvents() {
  const tbody = document.getElementById('profile-criteria-tbody');
  if (!tbody) return;
  tbody.querySelectorAll('tr').forEach((tr) => {
    tr.querySelector('.pc-en')?.addEventListener('change', () => {
      const on = tr.querySelector('.pc-en')?.checked;
      tr.classList.toggle('profile-row-disabled', !on);
      updateProfileSum();
    });
    tr.querySelector('.pc-w')?.addEventListener('input', updateProfileSum);
  });
}

function updateProfileSum() {
  const tbody = document.getElementById('profile-criteria-tbody');
  const el = document.querySelector('.profile-sum-value');
  if (!tbody || !el) return;
  let sum = 0;
  tbody.querySelectorAll('tr').forEach((tr) => {
    const on = tr.querySelector('.pc-en')?.checked;
    const w = Number(tr.querySelector('.pc-w')?.value) || 0;
    if (on) sum += Math.max(0, Math.floor(w));
  });
  el.textContent = String(sum);
}

/**
 * Колонка «Значение»: либо поля из preferences.json (зарплата / гео), либо CSV для белого/чёрного списка.
 * @param {{ id: string }} m — элемент манифеста
 * @param {object} preferences — ответ GET /api/preferences
 * @param {object} r — строка profileCriteria.rows по id
 */
function profileCriteriaValueCellHtml(m, preferences, r) {
  if (m.id === 'salary_meets_min') {
    const v = Number(preferences.minMonthlyUsd);
    const n = Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0;
    return `<td class="profile-col-value"><input type="number" class="pc-pref-min-monthly-usd" min="0" step="1" value="${n}" aria-label="Минимум зарплаты USD/мес (minMonthlyUsd)" title="Сохраняется в preferences.json → minMonthlyUsd" /></td>`;
  }
  if (m.id === 'geo_base_city') {
    const city = preferences.scoringGeo?.baseCity ?? '';
    return `<td class="profile-col-value"><input type="text" class="pc-pref-base-city pc-pref-text" spellcheck="false" value="${escapeProfileHtml(
      String(city),
    )}" aria-label="Базовый город (scoringGeo.baseCity)" title="Сохраняется в preferences.json → scoringGeo.baseCity" /></td>`;
  }
  if (m.id === 'geo_acceptable_city') {
    const cities = Array.isArray(preferences.scoringGeo?.acceptableCities)
      ? preferences.scoringGeo.acceptableCities.join(', ')
      : '';
    return `<td class="profile-col-value"><input type="text" class="pc-pref-acceptable-cities pc-pref-text" spellcheck="false" value="${escapeProfileHtml(
      cities,
    )}" aria-label="Города через запятую (scoringGeo.acceptableCities)" placeholder="через запятую" title="Сохраняется в preferences.json → scoringGeo.acceptableCities" /></td>`;
  }
  if (m.id === 'text_whitelist' || m.id === 'text_blacklist') {
    return `<td class="profile-col-value"><input type="text" class="pc-value" spellcheck="false" value="${escapeProfileHtml(
      String(r.value ?? ''),
    )}" aria-label="Значение: слова через запятую" placeholder="через запятую" /></td>`;
  }
  return '<td class="muted">—</td>';
}

function collectProfilePanelPreferencesPatchFromDom() {
  const tbody = document.getElementById('profile-criteria-tbody');
  if (!tbody) return {};
  const minInp = tbody.querySelector('tr[data-criterion-id="salary_meets_min"] .pc-pref-min-monthly-usd');
  const baseInp = tbody.querySelector('tr[data-criterion-id="geo_base_city"] .pc-pref-base-city');
  const accInp = tbody.querySelector('tr[data-criterion-id="geo_acceptable_city"] .pc-pref-acceptable-cities');
  const patch = {};
  if (minInp) {
    const n = Number(String(minInp.value).trim());
    patch.minMonthlyUsd = Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
  }
  if (baseInp || accInp) {
    patch.scoringGeo = {};
    if (baseInp) patch.scoringGeo.baseCity = String(baseInp.value ?? '').trim();
    if (accInp) {
      patch.scoringGeo.acceptableCities = String(accInp.value ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    }
  }
  return patch;
}

async function refreshProfilePanel() {
  const tbody = document.getElementById('profile-criteria-tbody');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="7" class="muted">Загрузка…</td></tr>';
  try {
    const [{ manifest }, { preferences }] = await Promise.all([
      api('/api/profile-criteria-manifest'),
      api('/api/preferences'),
    ]);
    const rows = preferences.profileCriteria?.rows || [];
    const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
    tbody.innerHTML = '';
    for (const m of manifest) {
      const r = byId[m.id] || {
        id: m.id,
        enabled: true,
        weight: 0,
        signMode: '+',
        ban: 'off',
        value: '',
      };
      const tr = document.createElement('tr');
      tr.dataset.criterionId = m.id;
      if (r.enabled === false) tr.classList.add('profile-row-disabled');
      const enChecked = r.enabled !== false ? ' checked' : '';
      const valueCell = profileCriteriaValueCellHtml(m, preferences, r);
      tr.innerHTML = `<td><input type="checkbox" class="pc-en"${enChecked} aria-label="Вкл" /></td>
        <td class="profile-col-logic" title="${escapeProfileHtml(m.logicRef)}">${escapeProfileHtml(
          m.logicRef,
        )}</td>
        <td title="${escapeProfileHtml(m.description)}">${escapeProfileHtml(m.label)}</td>
        ${valueCell}
        <td><input type="number" class="pc-w" min="0" max="1000" step="1" value="${Math.max(
          0,
          Math.floor(Number(r.weight) || 0),
        )}" aria-label="Балл" /></td>
        <td>${profileSignSelectHtml(r.signMode)}</td>
        <td>${profileBanSelectHtml(r.ban)}</td>`;
      tbody.appendChild(tr);
    }
    bindProfileRowEvents();
    updateProfileSum();
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="7" class="muted">Ошибка: ${escapeProfileHtml(
      e.message || String(e),
    )}</td></tr>`;
  }
}

function collectProfileRowsFromDom() {
  const tbody = document.getElementById('profile-criteria-tbody');
  if (!tbody) throw new Error('Нет таблицы профиля');
  const out = [];
  tbody.querySelectorAll('tr').forEach((tr) => {
    const id = tr.dataset.criterionId;
    if (!id) return;
    const row = {
      id,
      enabled: !!tr.querySelector('.pc-en')?.checked,
      weight: Math.max(0, Math.floor(Number(tr.querySelector('.pc-w')?.value) || 0)),
      signMode: tr.querySelector('.pc-sign')?.value || '+',
      ban: tr.querySelector('.pc-ban')?.value || 'off',
    };
    const valInp = tr.querySelector('.pc-value');
    if (valInp) row.value = valInp.value;
    out.push(row);
  });
  return out;
}

document.querySelector('.btn-profile')?.addEventListener('click', () => openProfilePanel());
profileBackdropEl?.addEventListener('click', () => closeProfilePanel());
profilePanelEl?.querySelector('.btn-profile-close')?.addEventListener('click', () => closeProfilePanel());
profilePanelEl?.querySelector('.btn-profile-save')?.addEventListener('click', async () => {
  const btn = profilePanelEl?.querySelector('.btn-profile-save');
  if (btn) btn.disabled = true;
  try {
    const rows = collectProfileRowsFromDom();
    const prefPatch = collectProfilePanelPreferencesPatchFromDom();
    await api('/api/preferences', {
      method: 'POST',
      body: JSON.stringify({
        profileCriteria: { version: 1, rows },
        ...prefPatch,
      }),
    });
    showToast('Профиль сохранён в preferences.json', 'good');
    closeProfilePanel();
  } catch (e) {
    showToast(e.message || String(e), 'bad');
  } finally {
    if (btn) btn.disabled = false;
  }
});

const applyLogModalEl = document.getElementById('apply-log-modal');
applyLogModalEl?.querySelector('[data-close-apply-log]')?.addEventListener('click', closeApplyLogModal);
applyLogModalEl?.querySelector('.modal-close--apply-log')?.addEventListener('click', closeApplyLogModal);
applyLogModalEl?.querySelector('.btn-refresh-apply-log')?.addEventListener('click', () => refreshApplyLogModal());

approvedModalEl?.querySelector('.btn-copy-approved')?.addEventListener('click', async () => {
  const pre = approvedModalEl.querySelector('.modal-approved-text');
  const t = pre?.textContent || '';
  try {
    await navigator.clipboard.writeText(t);
    showToast('Скопировано в буфер', 'good');
  } catch {
    showToast('Не удалось скопировать', 'bad');
  }
});

/**
 * Фиксированная позиция относительно вьюпорта — надёжнее, чем absolute + translate при скролле/вложенности.
 * @param {HTMLElement} wrap — .score-hover-wrap
 * @param {HTMLElement} tooltip
 */
function positionScoreTooltip(wrap, tooltip) {
  const margin = 8;
  const gap = 8;
  const scoreEl = wrap.querySelector('.score');
  const anchor = scoreEl ? scoreEl.getBoundingClientRect() : wrap.getBoundingClientRect();

  const tw = tooltip.offsetWidth;
  const th = tooltip.offsetHeight;
  if (tw < 1 || th < 1) return;

  let left = anchor.left + anchor.width / 2 - tw / 2;
  left = clampLeftEdge(left, tw, window.innerWidth, margin);

  let top = anchor.top - th - gap;
  if (top < margin) {
    top = anchor.bottom + gap;
  }
  const maxTop = window.innerHeight - margin - th;
  if (top > maxTop) top = Math.max(margin, maxTop);

  tooltip.style.position = 'fixed';
  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${top}px`;
  tooltip.style.right = 'auto';
  tooltip.style.bottom = 'auto';
  tooltip.style.transform = 'none';
  tooltip.style.zIndex = '10000';
}

/**
 * @param {HTMLElement} wrap — .score-hover-wrap
 */
function bindScoreTooltipPosition(wrap) {
  const tooltip = wrap.querySelector('.score-tooltip');
  if (!tooltip) return;

  const onScrollOrResize = () => positionScoreTooltip(wrap, tooltip);

  let scrollAttached = false;

  function isTooltipShown() {
    return wrap.matches(':hover') || wrap.matches(':focus-within');
  }

  function attachScroll() {
    if (scrollAttached) return;
    scrollAttached = true;
    window.addEventListener('scroll', onScrollOrResize, true);
    window.addEventListener('resize', onScrollOrResize);
  }

  function detachScroll() {
    if (!scrollAttached) return;
    scrollAttached = false;
    window.removeEventListener('scroll', onScrollOrResize, true);
    window.removeEventListener('resize', onScrollOrResize);
  }

  const onShow = () => {
    attachScroll();
    requestAnimationFrame(() => {
      positionScoreTooltip(wrap, tooltip);
      requestAnimationFrame(() => positionScoreTooltip(wrap, tooltip));
    });
  };

  const onHide = () => {
    requestAnimationFrame(() => {
      if (isTooltipShown()) return;
      detachScroll();
      [
        'position',
        'left',
        'top',
        'right',
        'bottom',
        'transform',
        'zIndex',
      ].forEach((p) => tooltip.style.removeProperty(p));
    });
  };

  wrap.addEventListener('mouseenter', onShow);
  wrap.addEventListener('mouseleave', onHide);
  wrap.addEventListener('focusin', onShow);
  wrap.addEventListener('focusout', onHide);
}

function bindDismiss(node, item) {
  const dismissBtn = node.querySelector('.card-dismiss');
  if (!dismissBtn) return;
  dismissBtn.addEventListener('click', async () => {
    if (!confirm('Удалить эту запись из очереди? (без «подходит / не подходит»)')) return;
    dismissBtn.disabled = true;
    try {
      await api('/api/dismiss', {
        method: 'POST',
        body: JSON.stringify({ id: item.id }),
      });
      showToast('Запись удалена из очереди', 'neutral');
      await load();
    } catch (e) {
      alert(e.message);
      dismissBtn.disabled = false;
    }
  });
}

function renderCard(item) {
  const node = tpl.content.firstElementChild.cloneNode(true);

  bindDismiss(node, item);

  const scoreEl = node.querySelector('.score');
  const scorePartsEl = node.querySelector('.score-parts');
  const overall = item.scoreOverall ?? item.geminiScore;
  const displayOverall = overall != null && overall !== '' ? String(overall) : '—';
  scoreEl.textContent = displayOverall;
  scoreEl.setAttribute(
    'aria-label',
    displayOverall === '—'
      ? 'Нет скора'
      : `Итоговый балл ${displayOverall}, наведи для расшифровки`
  );

  const tooltip = node.querySelector('.score-tooltip');
  const wv = llmAxisWeights.vacancy;
  const wc = llmAxisWeights.cvMatch;
  const shareLlm = finiteScoreOrNull(item.scoreLlmWeight) ?? overallScoreShares.llm;
  const shareProfile =
    finiteScoreOrNull(item.scoreProfileWeight) ?? overallScoreShares.profile;
  const sv = finiteScoreOrNull(item.scoreVacancy);
  const scm = finiteScoreOrNull(item.scoreCvMatch);
  const swf = finiteScoreOrNull(item.scoreWorkFormat);
  const sloc = finiteScoreOrNull(item.scoreLocation);
  const sllm = deriveCardLlmScore(item);
  const sprofile = deriveCardProfileScore(item);
  const so = finiteScoreOrNull(item.scoreOverall ?? item.geminiScore);
  if (scorePartsEl) {
    scorePartsEl.textContent = `LLM ${sllm ?? '—'} · Профиль ${sprofile ?? '—'} · Итог ${so ?? '—'}`;
  }
  if (sllm != null || sprofile != null || sv != null || scm != null) {
    const lines = [];
    if (sv != null) {
      lines.push('<strong>Вакансия</strong> (модель): ', String(sv));
    }
    if (scm != null) {
      lines.push('<br><strong>CV</strong>: ', String(scm));
    }
    if (sllm != null) {
      lines.push('<br><strong>LLM</strong>: ', String(sllm));
    }
    if (sprofile != null) {
      lines.push('<br><strong>Профиль</strong>: ', String(sprofile));
    }
    if (swf != null) {
      lines.push('<br><strong>Формат работы</strong>: ', String(swf));
    }
    if (sloc != null) {
      lines.push('<br><strong>Локация</strong>: ', String(sloc));
    }
    lines.push(
      '<br><strong>Итог</strong>: ',
      so != null ? String(so) : '—',
      '<br><br><strong>Формула</strong>: ',
      `<code>round(LLM × ${shareLlm.toFixed(2)} + Профиль × ${shareProfile.toFixed(2)})</code>`,
    );
    if (sv != null && scm != null) {
      lines.push(
        '<br><small>LLM = ',
        `<code>${wv.toFixed(2)}×</code>scoreVacancy + <code>${wc.toFixed(2)}×</code>scoreCvMatch.`,
        '</small>'
      );
    }
    const rd = Number(item.scoreRuleDelta);
    const sd = Number(item.scoreSalaryDelta);
    const spd = Number(item.scorePublicationDelta);
    const ppd = Number(item.scoreProfileCriteriaDelta);
    if (
      (Number.isFinite(rd) && rd !== 0) ||
      (Number.isFinite(sd) && sd !== 0) ||
      (Number.isFinite(spd) && spd !== 0) ||
      (Number.isFinite(ppd) && ppd !== 0)
    ) {
      lines.push(
        '<br><small>Debug-only deltas: правила ',
        String(Number.isFinite(rd) ? rd : 0),
        ', зарплата ',
        String(Number.isFinite(sd) ? sd : 0),
        ', публикация ',
        String(Number.isFinite(spd) ? spd : 0),
        ', raw profile ',
        String(Number.isFinite(ppd) ? ppd : 0),
        '. В формуле выше не участвуют.',
        '</small>'
      );
    }
    tooltip.innerHTML = lines.join('');
  } else {
    tooltip.textContent =
      'Нет разбивки по компонентам. Добавь записи через npm run harvest с включённым LLM (без --skip-llm).';
  }

  const scoreHoverWrap = node.querySelector('.score-hover-wrap');
  if (scoreHoverWrap) bindScoreTooltipPosition(scoreHoverWrap);

  const modelBtn = node.querySelector('.model-info-btn');
  const modelPanel = node.querySelector('.model-info-panel');
  const modelName = item.openRouterModel ? String(item.openRouterModel).trim() : '';
  if (modelName) {
    modelBtn.hidden = false;
    modelPanel.textContent = `Модель OpenRouter: ${modelName}`;
    modelPanel.addEventListener('click', (e) => e.stopPropagation());
    modelBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const open = modelPanel.hidden;
      document.querySelectorAll('.model-info-panel').forEach((p) => {
        p.hidden = true;
      });
      if (open) modelPanel.hidden = false;
    });
  }

  const a = node.querySelector('.title-link');
  a.href = item.url;
  a.textContent = item.title || item.url;

  const meta = node.querySelector('.meta');
  const parts = [
    item.company,
    item.salaryRaw,
    item.salaryEstimate?.ok ? `≈${item.salaryEstimate.minUsd}–${item.salaryEstimate.maxUsd} USD/мес` : '',
    item.searchQuery ? `запрос: ${item.searchQuery}` : '',
  ].filter(Boolean);
  meta.textContent = parts.join(' · ');

  node.querySelector('.summary').textContent = item.geminiSummary || '';
  const risks = node.querySelector('.risks');
  risks.textContent = item.geminiRisks ? `Нюансы: ${item.geminiRisks}` : '';
  risks.hidden = !item.geminiRisks;

  const tags = node.querySelector('.tags');
  (item.geminiTags || []).forEach((t) => {
    const s = document.createElement('span');
    s.className = 'tag';
    s.textContent = t;
    tags.appendChild(s);
  });

  const empHints = node.querySelector('.employer-apply-hints');
  const empBadges = node.querySelector('.employer-apply-badges');
  const empSummary = node.querySelector('.employer-apply-summary');
  const empDetails = node.querySelector('.employer-apply-raw');
  const empPre = node.querySelector('.employer-apply-pre');
  if (empHints && empBadges && empSummary && empDetails && empPre) {
    const ei = item.employerInstructions;
    const show = item.hasEmployerInstructions && ei && ei.detected;
    if (show) {
      empHints.hidden = false;
      empBadges.replaceChildren();
      const addBadge = (text, extraClass = '') => {
        const sp = document.createElement('span');
        sp.className = `employer-apply-badge ${extraClass}`.trim();
        sp.textContent = text;
        empBadges.appendChild(sp);
      };
      if (ei.strictness === 'mandatory') addBadge('Обязательные требования', 'employer-apply-badge--strong');
      const nQ = (ei.mustAnswerQuestions || []).length;
      if (nQ) addBadge(`Вопросов: ${nQ}`);
      const arts = ei.requiredArtifacts || [];
      if (arts.some((a) => a && a.type === 'github' && a.required)) addBadge('Нужен GitHub');
      if (ei.lengthPolicy === 'extended_if_needed' || ei.responseFormat === 'plain_extended') {
        addBadge('Письмо может быть длиннее');
      }
      if (ei.responseFormat === 'question_answer') addBadge('Ответы по пунктам');
      if (ei.responseFormat === 'checklist') addBadge('Скрининг / список');
      const summaryText =
        ei.notesForGenerator ||
        (ei.rawFragments && ei.rawFragments[0] ? String(ei.rawFragments[0]).slice(0, 280) : '') ||
        '';
      empSummary.textContent = summaryText ? summaryText + (summaryText.length >= 280 ? '…' : '') : '';
      empSummary.hidden = !summaryText;
      const raw = Array.isArray(ei.rawFragments) ? ei.rawFragments.filter(Boolean).join('\n---\n') : '';
      empPre.textContent = raw || '(нет сохранённых фрагментов)';
      empDetails.hidden = !raw;
    } else {
      empHints.hidden = true;
    }
  }

  const condList = node.querySelector('.card-conditions-list');
  const condEmpty = node.querySelector('.card-conditions-empty');
  const publishedAside = node.querySelector('.card-col-published');
  const publishedText = node.querySelector('.card-published-text');
  const publishedEmpty = node.querySelector('.card-published-empty');
  const descBody = node.querySelector('.card-description-body');
  const descEmpty = node.querySelector('.card-description-empty');

  const conds = item.hhWorkConditions;
  condList.innerHTML = '';
  if (Array.isArray(conds)) {
    conds.forEach((line) => {
      const s = String(line || '').trim();
      if (!s) return;
      const li = document.createElement('li');
      li.textContent = s;
      condList.appendChild(li);
    });
  }
  const hasConditions = condList.children.length > 0;
  condEmpty.hidden = hasConditions;

  const pubLine = String(item.vacancyPublishedLine || '').trim();
  const pubDate = String(item.vacancyPublishedDate || '').trim();
  if (publishedAside && publishedText && publishedEmpty) {
    const y = new Date().getFullYear();
    const m = String(new Date().getMonth() + 1).padStart(2, '0');
    const d = String(new Date().getDate()).padStart(2, '0');
    const todayYmd = `${y}-${m}-${d}`;
    publishedAside.classList.toggle('card-col-published--today', !!pubDate && pubDate === todayYmd);
    if (pubLine) {
      publishedText.textContent = pubLine;
      publishedEmpty.hidden = true;
    } else {
      publishedText.textContent = '';
      publishedEmpty.hidden = false;
    }
  }

  const descText =
    String(item.vacancyDescriptionFull || '').trim() ||
    String(item.descriptionForLlm || '').trim() ||
    String(item.descriptionPreview || '').trim();
  if (descText) {
    descBody.textContent = descText;
    descEmpty.hidden = true;
  } else {
    descBody.textContent = '';
    descEmpty.hidden = false;
  }

  const cl = item.coverLetter;
  const applyChatRow = node.querySelector('.apply-chat-row');
  const pendingTop = node.querySelector('.pending-top-actions');
  const draftBtn = node.querySelector('.cover-draft-btn');
  const okPendingBtn = node.querySelector('.btn-pending-ok');
  const regenBtn = node.querySelector('.btn-regenerate-letter');
  const viewLetterBtn = node.querySelector('.btn-view-approved');

  const hasLetterDraft =
    cl?.status === 'pending' && (cl?.variants || []).length;

  if (item.status === 'pending') {
    applyChatRow.hidden = true;
    pendingTop.hidden = false;
  } else if (item.status === 'rejected') {
    applyChatRow.hidden = true;
    pendingTop.hidden = true;
  } else {
    applyChatRow.hidden = false;
    pendingTop.hidden = true;
  }

  if (item.status === 'pending' && okPendingBtn) {
    okPendingBtn.hidden = !hasLetterDraft;
  }

  if (hasLetterDraft) {
    draftBtn.hidden = false;
    draftBtn.addEventListener('click', () => openDraftModal(item));
  }

  if (cl?.status === 'declined') {
    regenBtn.hidden = false;
    regenBtn.addEventListener('click', async () => {
      regenBtn.disabled = true;
      try {
        await requestCoverLetterGenerate(item.id, false);
        showToast('Новые варианты готовы', 'good');
        await load();
      } catch (e) {
        if (e.status === 409) {
          const ok = confirm(
            'Уже есть утверждённое письмо. Пересоздать и заменить черновиком?'
          );
          if (ok) {
            try {
              await requestCoverLetterGenerate(item.id, true);
              showToast('Новые варианты готовы', 'good');
              await load();
            } catch (e2) {
              alert(e2.message);
            }
          }
        } else {
          alert(e.message);
        }
      } finally {
        regenBtn.disabled = false;
      }
    });
  }

  if (
    item.status === 'approved' &&
    cl?.status === 'approved' &&
    String(cl?.approvedText || '').trim()
  ) {
    viewLetterBtn.hidden = false;
    viewLetterBtn.addEventListener('click', () => openApprovedLetterModal(item));
  }

  const applyChatBtn = node.querySelector('.btn-apply-chat');
  const approvedLetter =
    cl?.status === 'approved' && String(cl?.approvedText || '').trim();
  if (item.status !== 'pending' && approvedLetter) {
    applyChatBtn.disabled = false;
    applyChatBtn.removeAttribute('title');
    applyChatBtn.addEventListener('click', async () => {
      applyChatBtn.disabled = true;
      try {
        const res = await api('/api/hh-launch-apply-chat', {
          method: 'POST',
          body: JSON.stringify({ id: item.id }),
        });
        const pid = res.pid != null ? ` PID ${res.pid}.` : '';
        const logHint = res.logFile ? ` Лог: ${res.logFile}` : '';
        showToast(
          `Запущен Chromium (отдельный процесс).${pid}${logHint} Лог отклика открыт — обновляется каждые 2.5 с.`,
          'neutral'
        );
        openApplyLogModal();
      } catch (e) {
        alert(e.message);
      } finally {
        applyChatBtn.disabled = false;
      }
    });
  }

  const actions = node.querySelector('.actions');
  const doneReason = node.querySelector('.done-reason');

  if (item.status === 'pending') {
    actions.hidden = false;
    const ta = actions.querySelector('.reason');
    const ok = pendingTop.querySelector('.btn-pending-ok');
    const bad = actions.querySelector('.bad');
    const coverBtn = pendingTop.querySelector('.btn-pending-cover');
    const refreshBtn = pendingTop.querySelector('.btn-refresh-vacancy');

    coverBtn.addEventListener('click', async () => {
      coverBtn.disabled = true;
      refreshBtn.disabled = true;
      if (ok && !ok.hidden) ok.disabled = true;
      try {
        await requestCoverLetterGenerate(item.id, false);
        showToast('Сопроводительное сгенерировано', 'good');
        await load();
      } catch (e) {
        if (e.status === 409) {
          const confirmed = confirm(
            'Письмо уже утверждено. Пересоздать черновик? (утверждённый текст будет сброшен до нового согласования)'
          );
          if (confirmed) {
            try {
              await requestCoverLetterGenerate(item.id, true);
              showToast('Новые варианты готовы', 'good');
              await load();
            } catch (e2) {
              alert(e2.message);
            }
          }
        } else {
          alert(e.message);
        }
      } finally {
        coverBtn.disabled = false;
        refreshBtn.disabled = false;
        if (ok && !ok.hidden) ok.disabled = false;
      }
    });

    refreshBtn.addEventListener('click', async () => {
      refreshBtn.disabled = true;
      coverBtn.disabled = true;
      if (ok && !ok.hidden) ok.disabled = true;
      try {
        const refreshRes = await api('/api/vacancy/refresh-body', {
          method: 'POST',
          body: JSON.stringify({ id: item.id }),
        });
        if (refreshRes.scoreUpdated) {
          showToast('Текст с hh.ru и оценка (OpenRouter) обновлены', 'good');
        } else if (refreshRes.scoreError) {
          showToast(`Текст обновлён с hh.ru. Оценка: ${refreshRes.scoreError}`, 'neutral');
        } else {
          showToast('Текст вакансии обновлён с hh.ru', 'good');
        }
        await load();
      } catch (e) {
        alert(e.message);
        refreshBtn.disabled = false;
        coverBtn.disabled = false;
        if (ok && !ok.hidden) ok.disabled = false;
      }
    });

    const send = async (action) => {
      if (ok) ok.disabled = true;
      bad.disabled = true;
      try {
        await api('/api/action', {
          method: 'POST',
          body: JSON.stringify({
            id: item.id,
            action,
            reason: ta.value.trim(),
          }),
        });
        if (action === 'approve') {
          showToast('Сохранено: подходит', 'good');
        } else {
          showToast('Сохранено: не подходит', 'bad');
        }
        await load();
      } catch (e) {
        alert(e.message);
        if (ok) ok.disabled = false;
        bad.disabled = false;
      }
    };
    ok.addEventListener('click', () => send('approve'));
    bad.addEventListener('click', () => send('reject'));
  } else {
    doneReason.textContent = item.feedbackReason
      ? `Комментарий: ${item.feedbackReason}`
      : '';
  }

  return node;
}

function syncVacancyTabs() {
  if (!vacancyTabsEl) return;
  vacancyTabsEl.querySelectorAll('.tab').forEach((b) => {
    if (b.dataset.tab === 'collect') {
      b.classList.toggle('active', viewMode === 'collect');
    } else {
      b.classList.toggle('active', viewMode === 'queue' && b.dataset.status === currentStatus);
    }
  });
}

function syncHarvestKeywordLogicUi() {
  if (!harvestPanelEl) return;
  const sel = harvestPanelEl.querySelector('select[name="HH_KEYWORDS_LOGIC"]');
  const v = sel?.value || 'loop';
  const cyclesLbl = harvestPanelEl.querySelector('.harvest-logic-cycles');
  const kwLbl = harvestPanelEl.querySelector('.harvest-logic-keywords');
  if (cyclesLbl) cyclesLbl.hidden = v !== 'cycles';
  if (kwLbl) kwLbl.hidden = v !== 'keywords';
}

function syncHarvestWorkHoursUi() {
  if (!harvestPanelEl) return;
  const cb = harvestPanelEl.querySelector('input[type="checkbox"][name="HH_WORK_HOURS_ENABLED"]');
  const on = !!cb?.checked;
  harvestPanelEl.querySelectorAll('.harvest-work-hours-range').forEach((el) => {
    el.hidden = !on;
  });
}

function syncHarvestDebugUi() {
  const cb = document.getElementById('harvest-debug-cb');
  if (!cb) return;
  const on = cb.checked;
  document.querySelectorAll('.btn-harvest-debug-toggle').forEach((btn) => {
    btn.classList.toggle('is-on', on);
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
}

document.body.addEventListener('click', (ev) => {
  if (!ev.target.closest('.btn-harvest-debug-toggle')) return;
  const cb = document.getElementById('harvest-debug-cb');
  if (!cb) return;
  cb.checked = !cb.checked;
  localStorage.setItem(LS_HH_HARVEST_DEBUG, cb.checked ? '1' : '0');
  syncHarvestDebugUi();
});

if (harvestPanelEl) {
  harvestPanelEl.querySelector('select[name="HH_KEYWORDS_LOGIC"]')?.addEventListener('change', syncHarvestKeywordLogicUi);
  harvestPanelEl.querySelector('input[name="HH_WORK_HOURS_ENABLED"]')?.addEventListener('change', syncHarvestWorkHoursUi);
  harvestPanelEl.querySelector('select[name="HH_REMOTE_TYPE"]')?.addEventListener('change', (e) => {
    localStorage.setItem(LS_HH_REMOTE_TYPE, e.target.value);
  });
  harvestPanelEl.querySelector('[data-ra="autoCoverLetterAtOrAboveTarget"]')?.addEventListener('change', syncRaCollectVisibility);
  syncHarvestKeywordLogicUi();
  syncHarvestWorkHoursUi();
  syncHarvestDebugUi();
}

function setCollectTabOpenedCount(n) {
  if (!vacancyTabsEl) return;
  const el = vacancyTabsEl.querySelector('[data-tab-count="collect"]');
  if (el) el.textContent = String(n ?? 0);
}

function setQueueTabCount(status, n) {
  if (!vacancyTabsEl) return;
  const el = vacancyTabsEl.querySelector(`[data-tab-count="${status}"]`);
  if (el) el.textContent = String(n ?? 0);
}

async function refreshVacancyCounts() {
  if (!vacancyTabsEl) return;
  try {
    const c = await api('/api/vacancy-counts');
    setQueueTabCount('pending', c.pending);
    setQueueTabCount('approved', c.approved);
    setQueueTabCount('rejected', c.rejected);
  } catch {
    /* ignore */
  }
}

function syncRaCollectVisibility() {
  if (!harvestPanelEl) return;
  const on = !!harvestPanelEl.querySelector('[data-ra="autoCoverLetterAtOrAboveTarget"]')?.checked;
  const scope = harvestPanelEl.querySelector('.ra-scope-wrap');
  const variant = harvestPanelEl.querySelector('.ra-variant-wrap');
  if (scope) scope.hidden = !on;
  if (variant) variant.hidden = !on;
}

function syncRaPendingVisibility() {
  if (!reviewPendingPanelEl) return;
  const on = !!reviewPendingPanelEl.querySelector('[data-ra="autoCoverLetterAtOrAboveTarget"]')?.checked;
  const variant = reviewPendingPanelEl.querySelector('.ra-variant-wrap--pending');
  if (variant) variant.hidden = !on;
}

/**
 * @param {HTMLElement | null} container — #harvest-panel или #review-pending-panel
 * @param {object} ra — reviewAutomation с API
 * @param {{ includeScope?: boolean }} opts
 */
function applyReviewAutomationToContainer(container, ra, opts = {}) {
  if (!container || !ra) return;
  const includeScope = !!opts.includeScope;
  const ts = container.querySelector('[data-ra="targetScore"]');
  if (ts) ts.value = String(ra.targetScore ?? 70);
  const ar = container.querySelector('[data-ra="autoRejectBelowTarget"]');
  if (ar) ar.checked = !!ra.autoRejectBelowTarget;
  const ac = container.querySelector('[data-ra="autoCoverLetterAtOrAboveTarget"]');
  if (ac) ac.checked = !!ra.autoCoverLetterAtOrAboveTarget;
  if (includeScope) {
    const sc = container.querySelector('[data-ra="coverLetterScope"]');
    if (sc) sc.value = ra.coverLetterScope === 'new_and_pending' ? 'new_and_pending' : 'new_only';
  }
  const vc = container.querySelector('[data-ra="coverLetterVariantCount"]');
  if (vc) vc.value = String(ra.coverLetterVariantCount ?? 3);
  if (container === harvestPanelEl) syncRaCollectVisibility();
  else syncRaPendingVisibility();
}

async function fillReviewAutomationForm() {
  try {
    const { reviewAutomation: ra } = await api('/api/review-automation');
    if (harvestPanelEl) applyReviewAutomationToContainer(harvestPanelEl, ra, { includeScope: true });
    if (reviewPendingPanelEl) applyReviewAutomationToContainer(reviewPendingPanelEl, ra, { includeScope: false });
  } catch {
    /* ignore */
  }
}

async function refreshReviewAutomationPendingPanel() {
  if (!reviewPendingPanelEl) return;
  try {
    const { reviewAutomation: ra } = await api('/api/review-automation');
    applyReviewAutomationToContainer(reviewPendingPanelEl, ra, { includeScope: false });
  } catch {
    /* ignore */
  }
}

function syncReviewPendingPanelVisibility() {
  if (!reviewPendingPanelEl) return;
  const show = viewMode === 'queue' && currentStatus === 'pending';
  reviewPendingPanelEl.hidden = !show;
  if (show) refreshReviewAutomationPendingPanel().catch(() => {});
}

async function fillHarvestFormFromApi() {
  if (!harvestPanelEl) return;
  const { env, requireRemoteDefault } = await api('/api/harvest-env');
  harvestPanelEl.querySelectorAll('input[name], select[name]').forEach((inp) => {
    if (inp.type === 'checkbox') {
      if (inp.name === 'HH_WORK_HOURS_ENABLED') inp.checked = env[inp.name] === '1';
      if (inp.name === 'HH_HARVEST_DEBUG') {
        const raw = env[inp.name];
        if (raw != null && String(raw).trim() !== '') {
          const v = String(raw).trim().toLowerCase();
          inp.checked = v === '1' || v === 'true' || v === 'yes';
        } else {
          inp.checked = localStorage.getItem(LS_HH_HARVEST_DEBUG) === '1';
        }
      }
      return;
    }
    const v = env[inp.name];
    if (v != null && v !== '') inp.value = v;
  });
  const sessionInp = harvestPanelEl.querySelector('input[name="HH_SESSION_LIMIT"]');
  if (sessionInp && !String(sessionInp.value || '').trim()) {
    const fb = env.HH_MAX_TOTAL;
    if (fb != null && String(fb).trim() !== '') sessionInp.value = String(fb).trim();
  }
  const remoteTypeSel = harvestPanelEl.querySelector('select[name="HH_REMOTE_TYPE"]');
  if (remoteTypeSel) {
    const stored = localStorage.getItem(LS_HH_REMOTE_TYPE);
    if (stored) {
      remoteTypeSel.value = stored;
    } else {
      remoteTypeSel.value = !!requireRemoteDefault ? 'remote_hybrid' : 'all';
    }
  }
  syncHarvestKeywordLogicUi();
  syncHarvestWorkHoursUi();
  syncHarvestDebugUi();
}

async function refreshHarvestStats() {
  let s;
  try {
    s = await api('/api/harvest-status');
  } catch {
    return;
  }
  const badge = document.getElementById('harvest-badge');
  if (badge) badge.hidden = !s.running;
  const harvestStopBtn = harvestPanelEl?.querySelector('.btn-harvest-stop');
  if (harvestStopBtn) harvestStopBtn.hidden = !s.running;
  setCollectTabOpenedCount(s.uniqueUrlsOpened ?? 0);
  if (!harvestPanelEl) return;
  const stats = harvestPanelEl.querySelector('.harvest-stats');
  if (!stats) return;
  const setHarvestStatText = (sel, val) => {
    const el = stats.querySelector(sel);
    if (el) el.textContent = String(val ?? '');
  };
  setHarvestStatText('.harvest-stat-queued', s.uniqueUrlsQueued ?? 0);
  setHarvestStatText('.harvest-stat-opened', s.uniqueUrlsOpened ?? 0);
  const outcomes = Array.isArray(s.urlOutcomes) && s.urlOutcomes.length > 0 ? s.urlOutcomes : null;
  const listCount = outcomes ? outcomes.length : (s.uniqueUrlsOpened ?? 0);
  setHarvestStatText('.harvest-urls-count', listCount);
  const tbody = stats.querySelector('.harvest-urls-tbody');
  if (tbody) {
    tbody.innerHTML = '';
    if (outcomes) {
      for (const row of outcomes) {
        const tr = document.createElement('tr');
        const tdLink = document.createElement('td');
        tdLink.className = 'harvest-urls-col-link';
        const a = document.createElement('a');
        a.href = row.url;
        a.target = '_blank';
        a.rel = 'noopener';
        a.textContent = row.url;
        tdLink.appendChild(a);
        const tdTitle = document.createElement('td');
        tdTitle.className = 'harvest-urls-col-title';
        const titleText = row.title && row.title !== '—' ? row.title : '—';
        tdTitle.textContent = titleText;
        tdTitle.title = titleText;
        const tdAt = document.createElement('td');
        tdAt.className = 'harvest-urls-col-time';
        tdAt.textContent = formatHarvestOutcomeAt(row.at);
        const tdAct = document.createElement('td');
        tdAct.className = 'harvest-urls-col-action';
        tdAct.textContent = harvestOutcomeActionText(row);
        tr.append(tdLink, tdTitle, tdAt, tdAct);
        tbody.appendChild(tr);
      }
    } else {
      for (const u of s.urlsOpened || []) {
        const tr = document.createElement('tr');
        const tdLink = document.createElement('td');
        tdLink.className = 'harvest-urls-col-link';
        const a = document.createElement('a');
        a.href = u;
        a.target = '_blank';
        a.rel = 'noopener';
        a.textContent = u;
        tdLink.appendChild(a);
        const tdTitle = document.createElement('td');
        tdTitle.className = 'harvest-urls-col-title';
        tdTitle.textContent = '—';
        const tdAt = document.createElement('td');
        tdAt.className = 'harvest-urls-col-time';
        tdAt.textContent = '—';
        const tdAct = document.createElement('td');
        tdAct.className = 'harvest-urls-col-action';
        tdAct.textContent = 'Нет данных (старый лог без url_outcome)';
        tr.append(tdLink, tdTitle, tdAt, tdAct);
        tbody.appendChild(tr);
      }
    }
  }
  const meta = stats.querySelector('.harvest-stats-meta');
  if (meta) {
    if (s.running) {
      const started = s.startedAtDisplay || s.startedAt || '';
      const parts = [];
      if (s.pid != null && String(s.pid).trim() !== '') parts.push(`PID ${s.pid}`);
      if (started) parts.push(`запущен ${started}`);
      let line = parts.length ? `В процессе · ${parts.join(' · ')}` : 'В процессе';
      if (s.gracefulStopPending) line += ' · Остановка после текущей вакансии запрошена';
      meta.textContent = line;
    } else if (s.exitAt != null) {
      const t = s.exitAtDisplay || s.exitAt || '';
      meta.textContent = `Последний запуск завершён: code ${s.exitCode ?? '—'} · ${t}`;
    } else {
      meta.textContent = '';
    }
  }
  const hint = stats.querySelector('.harvest-log-hint');
  if (hint) hint.textContent = s.logRelativePath ? `Лог: ${s.logRelativePath}` : '';
}

async function load() {
  if (!listEl) return;
  const countsPromise = refreshVacancyCounts();
  listEl.innerHTML = '';
  if (viewMode === 'collect') {
    listEl.innerHTML =
      '<p class="empty collect-hint">Очередь на соседних вкладках. Сбор после «Старт поиска» идёт в фоне — смотрите индикатор в шапке и блок статистики выше.</p>';
    await countsPromise;
    syncReviewPendingPanelVisibility();
    return;
  }
  try {
    try {
      const { preferences } = await api('/api/preferences');
      llmAxisWeights = normalizeSemanticScoreWeights(preferences?.llmScoreWeights);
      overallScoreShares = normalizeOverallScoreShares(
        preferences?.overallScoreWeights ||
          preferences?.scoreBlendShares ||
          preferences?.scoreOverallShares
      );
    } catch {
      llmAxisWeights = { vacancy: 0.35, cvMatch: 0.65 };
      overallScoreShares = { llm: 0.65, profile: 0.35 };
    }

    const { items } = await api(`/api/vacancies?status=${encodeURIComponent(currentStatus)}`);
    if (!items.length) {
      listEl.innerHTML = '<p class="empty">Пусто.</p>';
      return;
    }
    items.forEach((it) => listEl.appendChild(renderCard(it)));
  } catch (e) {
    listEl.innerHTML = `<p class="err">${e.message}</p>`;
  }
  await countsPromise;
  syncReviewPendingPanelVisibility();
}

if (vacancyTabsEl) {
  vacancyTabsEl.querySelectorAll('.tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (btn.dataset.tab === 'collect') {
        viewMode = 'collect';
        if (harvestPanelEl) harvestPanelEl.hidden = false;
        fillHarvestFormFromApi().catch(() => {});
        fillReviewAutomationForm().catch(() => {});
      } else {
        viewMode = 'queue';
        currentStatus = btn.dataset.status || 'pending';
        if (harvestPanelEl) harvestPanelEl.hidden = true;
      }
      syncVacancyTabs();
      load();
    });
  });
}

if (harvestPanelEl) {
  harvestPanelEl.querySelector('.btn-harvest-start')?.addEventListener('click', async () => {
  const payload = {};
  const logic = harvestPanelEl.querySelector('select[name="HH_KEYWORDS_LOGIC"]')?.value || 'loop';
  const harvestExclude = new Set([
    'HH_KEYWORDS_LOGIC',
    'HH_KEYWORDS_CYCLES',
    'HH_KEYWORDS_MAX',
    'HH_WORK_HOURS_ENABLED',
    'HH_WORK_HOUR_START',
    'HH_WORK_HOUR_END',
    'HH_HARVEST_DEBUG',
  ]);
  harvestPanelEl.querySelectorAll('input[name], select[name]').forEach((inp) => {
    if (inp.type === 'checkbox') return;
    if (harvestExclude.has(inp.name)) return;
    const t = inp.value.trim();
    if (t !== '') payload[inp.name] = t;
  });
  payload.HH_KEYWORDS_LOGIC = logic;
  if (logic === 'cycles') {
    payload.HH_KEYWORDS_CYCLES =
      harvestPanelEl.querySelector('input[name="HH_KEYWORDS_CYCLES"]')?.value.trim() || '1';
  }
  if (logic === 'keywords') {
    const k = harvestPanelEl.querySelector('input[name="HH_KEYWORDS_MAX"]')?.value.trim();
    payload.HH_KEYWORDS_MAX = k || '0';
  }
  const whcb = harvestPanelEl.querySelector('input[name="HH_WORK_HOURS_ENABLED"]');
  payload.HH_WORK_HOURS_ENABLED = whcb?.checked ? '1' : '0';
  if (whcb?.checked) {
    payload.HH_WORK_HOUR_START =
      harvestPanelEl.querySelector('input[name="HH_WORK_HOUR_START"]')?.value.trim() || '9';
    payload.HH_WORK_HOUR_END =
      harvestPanelEl.querySelector('input[name="HH_WORK_HOUR_END"]')?.value.trim() || '18';
  }
  const debugCb = document.getElementById('harvest-debug-cb');
  payload.HH_HARVEST_DEBUG = debugCb?.checked ? '1' : '0';
  const remoteTypeSel = harvestPanelEl.querySelector('select[name="HH_REMOTE_TYPE"]');
  payload.HH_REMOTE_TYPE = remoteTypeSel?.value || 'remote_hybrid';
  try {
    await api('/api/harvest-start', { method: 'POST', body: JSON.stringify(payload) });
    await refreshHarvestStats();
  } catch (e) {
    let msg = e.message || String(e);
    if (e.status === 409 && e.payload?.hint) msg += `\n\n${e.payload.hint}`;
    alert(msg);
  }
  });

  harvestPanelEl.querySelector('.btn-harvest-stop')?.addEventListener('click', async () => {
    try {
      let r = await api('/api/harvest-stop-graceful', { method: 'POST', body: '{}' });
      if (r.needStaleForce) {
        if (
          !confirm(
            'В последнем прогоне в логе нет PID (старый формат). Убедитесь, что процесс harvest / окно Playwright не запущены. Дописать в лог завершение и снять индикатор?'
          )
        ) {
          await refreshHarvestStats();
          showToast('Запрошена кооперативная остановка; повторите «Остановить» с подтверждением, чтобы сбросить только лог', 'neutral');
          return;
        }
        r = await api('/api/harvest-stop-graceful', {
          method: 'POST',
          body: JSON.stringify({ force: true }),
        });
      }
      await refreshHarvestStats();
      showToast(
        r.staleLogCleared
          ? 'Индикатор сброшен (процесс не был активен)'
          : 'Остановка запрошена — дождитесь текущей карточки/ключа',
        'neutral'
      );
    } catch (e) {
      alert(e.message);
    }
  });

  harvestPanelEl.querySelector('.btn-review-automation-save')?.addEventListener('click', async () => {
    const btn = harvestPanelEl.querySelector('.btn-review-automation-save');
    const ts = Number(harvestPanelEl.querySelector('[data-ra="targetScore"]')?.value);
    const vc = Number(harvestPanelEl.querySelector('[data-ra="coverLetterVariantCount"]')?.value);
    const body = {
      targetScore: ts,
      autoRejectBelowTarget: !!harvestPanelEl.querySelector('[data-ra="autoRejectBelowTarget"]')?.checked,
      autoCoverLetterAtOrAboveTarget: !!harvestPanelEl.querySelector('[data-ra="autoCoverLetterAtOrAboveTarget"]')
        ?.checked,
      coverLetterScope: harvestPanelEl.querySelector('[data-ra="coverLetterScope"]')?.value || 'new_only',
      coverLetterVariantCount: vc,
    };
    btn.disabled = true;
    try {
      const data = await api('/api/review-automation', { method: 'POST', body: JSON.stringify(body) });
      showToast('Настройки автоматизации сохранены', 'good');
      if (data.reviewAutomation) {
        applyReviewAutomationToContainer(harvestPanelEl, data.reviewAutomation, { includeScope: true });
        if (reviewPendingPanelEl) applyReviewAutomationToContainer(reviewPendingPanelEl, data.reviewAutomation, { includeScope: false });
      }
    } catch (e) {
      alert(e.message);
    } finally {
      btn.disabled = false;
    }
  });
}

reviewPendingPanelEl?.querySelector('[data-ra="autoCoverLetterAtOrAboveTarget"]')?.addEventListener('change', syncRaPendingVisibility);

reviewPendingPanelEl?.querySelector('.btn-review-automation-save-pending')?.addEventListener('click', async () => {
  const btn = reviewPendingPanelEl?.querySelector('.btn-review-automation-save-pending');
  const ts = Number(reviewPendingPanelEl.querySelector('[data-ra="targetScore"]')?.value);
  const vc = Number(reviewPendingPanelEl.querySelector('[data-ra="coverLetterVariantCount"]')?.value);
  const body = {
    targetScore: ts,
    autoRejectBelowTarget: !!reviewPendingPanelEl.querySelector('[data-ra="autoRejectBelowTarget"]')?.checked,
    autoCoverLetterAtOrAboveTarget: !!reviewPendingPanelEl.querySelector('[data-ra="autoCoverLetterAtOrAboveTarget"]')
      ?.checked,
    coverLetterVariantCount: vc,
  };
  if (btn) btn.disabled = true;
  try {
    const data = await api('/api/review-automation', { method: 'POST', body: JSON.stringify(body) });
    showToast('Настройки автоматизации сохранены', 'good');
    if (data.reviewAutomation) {
      if (harvestPanelEl) applyReviewAutomationToContainer(harvestPanelEl, data.reviewAutomation, { includeScope: true });
      applyReviewAutomationToContainer(reviewPendingPanelEl, data.reviewAutomation, { includeScope: false });
    }
  } catch (e) {
    alert(e.message);
  } finally {
    if (btn) btn.disabled = false;
  }
});

reviewPendingPanelEl?.querySelector('.btn-review-pending-batch')?.addEventListener('click', async () => {
  const btn = reviewPendingPanelEl?.querySelector('.btn-review-pending-batch');
  if (btn) btn.disabled = true;
  try {
    const ts = Number(reviewPendingPanelEl.querySelector('[data-ra="targetScore"]')?.value);
    const vc = Number(reviewPendingPanelEl.querySelector('[data-ra="coverLetterVariantCount"]')?.value);
    const body = {
      targetScore: ts,
      autoRejectBelowTarget: !!reviewPendingPanelEl.querySelector('[data-ra="autoRejectBelowTarget"]')?.checked,
      autoCoverLetterAtOrAboveTarget: !!reviewPendingPanelEl.querySelector('[data-ra="autoCoverLetterAtOrAboveTarget"]')
        ?.checked,
      coverLetterVariantCount: vc,
    };
    await api('/api/review-automation', { method: 'POST', body: JSON.stringify(body) });
    const r = await api('/api/review-automation/run-pending-cover-letters', {
      method: 'POST',
      body: '{}',
    });
    const errTail =
      Array.isArray(r.errors) && r.errors.length
        ? ` · ошибок: ${r.errors.length}`
        : '';
    const rej = Number(r.rejected) || 0;
    showToast(
      `Отклонено: ${rej}, сгенерировано черновиков: ${r.generated}, обработано под LLM: ${r.processed}, пропущено: ${r.skipped}${errTail}`,
      'good',
    );
    await load();
  } catch (e) {
    const payload = e.payload;
    const msg =
      payload && Array.isArray(payload.errors) && payload.errors.length
        ? payload.errors.map((x) => x.error).join('; ')
        : e.message;
    alert(msg);
  } finally {
    if (btn) btn.disabled = false;
  }
});

setInterval(() => {
  refreshHarvestStats().catch(() => {});
  refreshVacancyCounts();
}, 2000);

syncVacancyTabs();
syncReviewPendingPanelVisibility();
load();
refreshHarvestStats().catch(() => {});
initDraftModalDrag();
