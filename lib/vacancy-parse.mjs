/**
 * Извлечение полей со страницы вакансии hh.ru (зависит от вёрстки).
 */

import { parsePublishedLineToLocalYmd, sanitizeVacancyPublishedLine } from './vacancy-published-date.mjs';

const DESCRIPTION_MAX = 50_000;

/**
 * @param {import('playwright').Page} page
 */
export async function parseVacancyPage(page) {
  await page.waitForTimeout(800);
  const raw = await page.evaluate((DESCRIPTION_MAX_INNER) => {
    const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim();

    const t = (sel) => norm(document.querySelector(sel)?.textContent);

    /** Текст блока без содержимого script/style (в брендированных вакансиях CSS и JS попадают внутрь описания). */
    const plainFromSelector = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return '';
      const clone = el.cloneNode(true);
      for (const rm of clone.querySelectorAll('script, style, noscript')) {
        rm.remove();
      }
      return norm(clone.textContent);
    };

    /** @param {...string} sels */
    const firstOf = (...sels) => {
      for (const sel of sels) {
        const x = t(sel);
        if (x) return x;
      }
      return '';
    };

    const title = firstOf('[data-qa="vacancy-title"]') || norm(document.querySelector('h1')?.textContent);
    const company = firstOf(
      '[data-qa="vacancy-company-name"]',
      'a[data-qa="vacancy-company-name"]'
    );

    const salaryEl = document.querySelector('[data-qa="vacancy-salary"]');
    const salaryFromDom = norm(salaryEl?.textContent);
    const salaryLine =
      salaryFromDom ||
      (salaryEl && !salaryFromDom ? 'Уровень дохода не указан' : '') ||
      'Уровень дохода не указан';

    const experience = firstOf('[data-qa="vacancy-experience"]');
    const employment = firstOf(
      '[data-qa="vacancy-employment-mode"]',
      '[data-qa="vacancy-view-employment-mode"]'
    );

    const contract = firstOf(
      '[data-qa="vacancy-view-employment-terms"]',
      '[data-qa="vacancy-view-employment-form"]',
      '[data-qa="vacancy-view-terms-of-work"]',
      '[data-qa="vacancy-view-employment-contract"]'
    );

    const schedule = firstOf(
      '[data-qa="vacancy-view-employment-schedule"]',
      '[data-qa="vacancy-view-schedule"]',
      '[data-qa="vacancy-view-work-schedule-by-days"]'
    );

    const hours = firstOf(
      '[data-qa="vacancy-view-working-hours"]',
      '[data-qa="vacancy-view-work-hours"]',
      '[data-qa="vacancy-view-employment-working-hours"]'
    );

    const workFormat = firstOf(
      '[data-qa="vacancy-view-employment-format"]',
      '[data-qa="vacancy-view-employment-remote"]',
      '[data-qa="vacancy-view-flexible-schedule"]',
      '[data-qa="vacancy-view-workplace-type"]'
    );

    const address = firstOf('[data-qa="vacancy-view-location"]', '[data-qa="vacancy-view-raw-address"]');

    let description =
      plainFromSelector('[data-qa="vacancy-description"]') ||
      plainFromSelector('.vacancy-description') ||
      plainFromSelector('[itemprop="description"]') ||
      '';

    if (description.length > DESCRIPTION_MAX_INNER) {
      description = `${description.slice(0, DESCRIPTION_MAX_INNER)}…`;
    }

    const ordered = [salaryLine, experience, employment, contract, schedule, hours, workFormat].filter(
      Boolean
    );

    const descRoot = document.querySelector('[data-qa="vacancy-description"]');
    const mainRoot =
      document.querySelector('[data-qa="vacancy-view"]') ||
      document.querySelector('.vacancy-view') ||
      document.querySelector('main') ||
      document.body;

    const seen = new Set(ordered.map((x) => x.toLowerCase()));
    if (mainRoot && ordered.length < 4) {
      const nodes = mainRoot.querySelectorAll('[data-qa^="vacancy-view-"]');
      for (const el of nodes) {
        if (descRoot && descRoot.contains(el)) continue;
        const qa = el.getAttribute('data-qa') || '';
        if (
          /layout|breadcrumb|logo|sidebar|similar|employer-page|branding|actions-link/i.test(qa) ||
          qa.includes('vacancy-view-location')
        ) {
          continue;
        }
        const text = norm(el.textContent);
        if (!text || text.length > 800) continue;
        const key = text.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        if (!ordered.includes(text)) ordered.push(text);
      }
    }

    /** @type {string[]} */
    const workConditionsLines = [];
    for (const line of ordered) {
      if (!workConditionsLines.length || workConditionsLines[workConditionsLines.length - 1] !== line) {
        workConditionsLines.push(line);
      }
    }

    const extractVacancyPublishedLine = () => {
      const withPublished = (text) => {
        const x = norm(text);
        return /Вакансия опубликована/i.test(x) ? x : '';
      };

      for (const sel of [
        '[data-qa="vacancy-creation-time"]',
        '[data-qa="vacancy-publication-time"]',
        '[data-qa="vacancy-view-publishing-info"]',
      ]) {
        const hit = withPublished(document.querySelector(sel)?.textContent);
        if (hit) return hit;
      }

      const descRoot = document.querySelector('[data-qa="vacancy-description"]');
      if (descRoot) {
        let el = descRoot.nextElementSibling;
        let guard = 0;
        while (el && guard++ < 12) {
          const hit = withPublished(el.textContent);
          if (hit && hit.length < 500) return hit;
          el = el.nextElementSibling;
        }
        const parent = descRoot.parentElement;
        if (parent) {
          for (const node of parent.querySelectorAll('[data-qa]')) {
            if (node === descRoot || descRoot.contains(node)) continue;
            const hit = withPublished(node.textContent);
            if (hit && hit.length < 500) return hit;
          }
        }
      }

      const body = norm(document.body?.innerText || '');
      const pubIx = body.search(/Вакансия опубликована\s+\d{1,2}\s+[а-яё]+\s+\d{4}/iu);
      if (pubIx >= 0) {
        return norm(body.slice(pubIx, pubIx + 320));
      }

      return '';
    };

    const vacancyPublishedLine = extractVacancyPublishedLine();

    const blob = [
      title,
      company,
      salaryLine,
      experience,
      employment,
      contract,
      schedule,
      hours,
      workFormat,
      address,
      description,
      workConditionsLines.join('\n'),
      vacancyPublishedLine,
    ]
      .join('\n')
      .toLowerCase();

    return {
      title,
      company,
      salaryRaw: salaryFromDom,
      experience,
      employment,
      address,
      description,
      vacancyDescriptionFull: description,
      workConditionsLines,
      vacancyPublishedLine,
      textBlob: blob,
    };
  }, DESCRIPTION_MAX);

  const vacancyPublishedLine = sanitizeVacancyPublishedLine(String(raw.vacancyPublishedLine || '')).trim();
  const vacancyPublishedDate = parsePublishedLineToLocalYmd(vacancyPublishedLine);

  return {
    ...raw,
    vacancyPublishedLine,
    vacancyPublishedDate,
  };
}

export function vacancyIdFromUrl(url) {
  const m = String(url).match(/\/vacancy\/(\d+)/);
  return m ? m[1] : null;
}
