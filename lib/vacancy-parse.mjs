/**
 * Извлечение полей со страницы вакансии hh.ru (зависит от вёрстки).
 */

const DESCRIPTION_MAX = 50_000;

/**
 * @param {import('playwright').Page} page
 */
export async function parseVacancyPage(page) {
  await page.waitForTimeout(800);
  return page.evaluate((DESCRIPTION_MAX_INNER) => {
    const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim();

    const t = (sel) => norm(document.querySelector(sel)?.textContent);

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
      t('[data-qa="vacancy-description"]') ||
      t('.vacancy-description') ||
      t('[itemprop="description"]') ||
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
      textBlob: blob,
    };
  }, DESCRIPTION_MAX);
}

export function vacancyIdFromUrl(url) {
  const m = String(url).match(/\/vacancy\/(\d+)/);
  return m ? m[1] : null;
}
