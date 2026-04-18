import { clampLeftEdge } from './score-tooltip-clamp.js';

const listEl = document.getElementById('list');
const tpl = document.getElementById('card-tpl');

const vacancyTabsEl = document.querySelector('.vacancy-tabs');
const harvestPanelEl = document.getElementById('harvest-panel');

/** @type {'queue' | 'collect'} */
let viewMode = 'queue';
let currentStatus = 'pending';

/** Нормализованные веса для подсказки к скору (как в lib/openrouter-score.mjs) */
let scoreWeights = { vacancy: 0.35, cvMatch: 0.65 };

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

  while (variants.length < 3) {
    variants.push(variants[variants.length - 1] || '');
  }
  variants.splice(3);

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
  btnApprove.textContent = 'Утвердить';

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
    if (!Number.isFinite(idx) || idx < 0 || idx > 2) return;
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
      showToast('Письмо утверждено', 'good');
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
  const wv = scoreWeights.vacancy;
  const wc = scoreWeights.cvMatch;
  const sv = item.scoreVacancy;
  const scm = item.scoreCvMatch;
  const so = item.scoreOverall ?? item.geminiScore;
  if (Number.isFinite(Number(sv)) && Number.isFinite(Number(scm))) {
    tooltip.innerHTML = [
      '<strong>Вакансия</strong> (оценка модели): ',
      String(sv),
      '<br><strong>Сходство с твоими CV</strong>: ',
      String(scm),
      '<br><strong>Итог на карточке</strong>: ',
      so != null && so !== '' ? String(so) : '—',
      '<br><br>Если модель не вернула свой <code>scoreOverall</code>, итог считается как ',
      `<code>${wv.toFixed(2)}×</code>вакансия + <code>${wc.toFixed(2)}×</code>CV (веса из preferences.json).`,
    ].join('');
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

  const condList = node.querySelector('.card-conditions-list');
  const condEmpty = node.querySelector('.card-conditions-empty');
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
  const draftBtn = node.querySelector('.cover-draft-btn');
  const regenBtn = node.querySelector('.btn-regenerate-letter');
  const viewLetterBtn = node.querySelector('.btn-view-approved');

  if (cl?.status === 'pending' && (cl?.variants || []).length) {
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

  if (cl?.status === 'approved' && String(cl?.approvedText || '').trim()) {
    viewLetterBtn.hidden = false;
    viewLetterBtn.addEventListener('click', () => openApprovedLetterModal(item));
  }

  const applyChatBtn = node.querySelector('.btn-apply-chat');
  const approvedLetter =
    cl?.status === 'approved' && String(cl?.approvedText || '').trim();
  if (approvedLetter) {
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
    const ok = actions.querySelector('.ok');
    const bad = actions.querySelector('.bad');
    const coverBtn = actions.querySelector('.btn-cover');
    const refreshBtn = actions.querySelector('.btn-refresh-vacancy');

    coverBtn.addEventListener('click', async () => {
      coverBtn.disabled = true;
      refreshBtn.disabled = true;
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
      }
    });

    refreshBtn.addEventListener('click', async () => {
      refreshBtn.disabled = true;
      coverBtn.disabled = true;
      ok.disabled = true;
      bad.disabled = true;
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
        ok.disabled = false;
        bad.disabled = false;
      }
    });

    const send = async (action) => {
      ok.disabled = bad.disabled = true;
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
        ok.disabled = bad.disabled = false;
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
  const v = sel?.value || 'cycles';
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

if (harvestPanelEl) {
  harvestPanelEl.querySelector('select[name="HH_KEYWORDS_LOGIC"]')?.addEventListener('change', syncHarvestKeywordLogicUi);
  harvestPanelEl.querySelector('input[name="HH_WORK_HOURS_ENABLED"]')?.addEventListener('change', syncHarvestWorkHoursUi);
  syncHarvestKeywordLogicUi();
  syncHarvestWorkHoursUi();
}

async function fillHarvestFormFromApi() {
  if (!harvestPanelEl) return;
  const { env } = await api('/api/harvest-env');
  harvestPanelEl.querySelectorAll('input[name], select[name]').forEach((inp) => {
    if (inp.type === 'checkbox') {
      if (inp.name === 'HH_WORK_HOURS_ENABLED') inp.checked = env[inp.name] === '1';
      return;
    }
    const v = env[inp.name];
    if (v != null && v !== '') inp.value = v;
  });
  syncHarvestKeywordLogicUi();
  syncHarvestWorkHoursUi();
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
  if (!harvestPanelEl) return;
  const stats = harvestPanelEl.querySelector('.harvest-stats');
  if (!stats) return;
  const curKwEl = stats.querySelector('.harvest-stat-current-keyword');
  if (curKwEl) {
    curKwEl.textContent =
      s.running && s.harvestCurrentKeyword ? String(s.harvestCurrentKeyword) : '—';
  }
  const setHarvestStatText = (sel, val) => {
    const el = stats.querySelector(sel);
    if (el) el.textContent = String(val ?? '');
  };
  setHarvestStatText('.harvest-stat-queued', s.uniqueUrlsQueued ?? 0);
  setHarvestStatText('.harvest-stat-opened', s.uniqueUrlsOpened ?? 0);
  setHarvestStatText('.harvest-stat-added', s.addedToQueue ?? 0);
  setHarvestStatText('.harvest-urls-count', s.uniqueUrlsOpened ?? 0);
  const ul = stats.querySelector('.harvest-urls-list');
  if (ul) {
    ul.innerHTML = '';
    for (const u of s.urlsOpened || []) {
      const li = document.createElement('li');
      const a = document.createElement('a');
      a.href = u;
      a.target = '_blank';
      a.rel = 'noopener';
      a.textContent = u;
      li.appendChild(a);
      ul.appendChild(li);
    }
  }
  const kwDone = s.harvestKeywordsCompleted || [];
  const kwCount = typeof s.harvestKeywordsCompletedCount === 'number' ? s.harvestKeywordsCompletedCount : kwDone.length;
  const kwCountEl = stats.querySelector('.harvest-keywords-count');
  if (kwCountEl) kwCountEl.textContent = String(kwCount);
  const kwUl = stats.querySelector('.harvest-keywords-list');
  if (kwUl) {
    kwUl.innerHTML = '';
    for (const phrase of kwDone) {
      const li = document.createElement('li');
      li.textContent = phrase;
      kwUl.appendChild(li);
    }
  }
  const meta = stats.querySelector('.harvest-stats-meta');
  if (meta) {
    if (s.running) {
      const t = s.startedAtDisplay || s.startedAt || '';
      meta.textContent = `В процессе: pid ${s.pid ?? '—'} · ${t}`;
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
  listEl.innerHTML = '';
  if (viewMode === 'collect') {
    listEl.innerHTML =
      '<p class="empty collect-hint">Очередь на соседних вкладках. Сбор после «Старт поиска» идёт в фоне — смотрите индикатор в шапке и блок статистики выше.</p>';
    return;
  }
  try {
    try {
      const { preferences } = await api('/api/preferences');
      const w = preferences?.llmScoreWeights;
      if (w) {
        let v = Number(w.vacancy);
        let c = Number(w.cvMatch);
        if (Number.isFinite(v) && Number.isFinite(c) && v + c > 0) {
          const sum = v + c;
          scoreWeights = { vacancy: v / sum, cvMatch: c / sum };
        }
      }
    } catch {
      scoreWeights = { vacancy: 0.35, cvMatch: 0.65 };
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
}

if (vacancyTabsEl) {
  vacancyTabsEl.querySelectorAll('.tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (btn.dataset.tab === 'collect') {
        viewMode = 'collect';
        if (harvestPanelEl) harvestPanelEl.hidden = false;
        fillHarvestFormFromApi().catch(() => {});
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
  const logic = harvestPanelEl.querySelector('select[name="HH_KEYWORDS_LOGIC"]')?.value || 'cycles';
  const harvestExclude = new Set([
    'HH_KEYWORDS_LOGIC',
    'HH_KEYWORDS_CYCLES',
    'HH_KEYWORDS_MAX',
    'HH_WORK_HOURS_ENABLED',
    'HH_WORK_HOUR_START',
    'HH_WORK_HOUR_END',
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
  try {
    await api('/api/harvest-start', { method: 'POST', body: JSON.stringify(payload) });
    await refreshHarvestStats();
  } catch (e) {
    alert(e.message);
  }
  });
}

setInterval(() => {
  refreshHarvestStats().catch(() => {});
}, 2000);

syncVacancyTabs();
load();
refreshHarvestStats().catch(() => {});
