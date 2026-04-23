/** Парсинг строки «Вакансия опубликована …» с hh.ru (русские названия месяцев). */

const MONTHS = {
  января: 1,
  февраля: 2,
  марта: 3,
  апреля: 4,
  мая: 5,
  июня: 6,
  июля: 7,
  августа: 8,
  сентября: 9,
  октября: 10,
  ноября: 11,
  декабря: 12,
};

function pad2(n) {
  return String(n).padStart(2, '0');
}

/**
 * @param {Date} d
 * @returns {string|null} YYYY-MM-DD в локальной TZ
 */
export function formatLocalYmd(d) {
  if (!(d instanceof Date) || !Number.isFinite(d.getTime())) return null;
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/**
 * @param {Date} [now]
 * @returns {string} YYYY-MM-DD
 */
export function localYmdToday(now = new Date()) {
  return formatLocalYmd(now) || '';
}

/** Первое вхождение — граница города и кнопок/виджетов hh.ru (склейка textContent). */
const PUBLISHED_LINE_JUNK_SPLIT = /(Откликнуться|Отзывы|Dream|Курсы|Поделиться|Сохранить|Пожаловаться|Похожие|Реклама)/i;

/**
 * Обрезает строку до «Вакансия опубликована … [в Город]» без хвоста из соседних элементов.
 * @param {string} raw
 * @returns {string}
 */
export function sanitizeVacancyPublishedLine(raw) {
  const s = String(raw || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!s) return '';
  const coreRe = /Вакансия опубликована\s+\d{1,2}\s+[а-яё]+\s+\d{4}/iu;
  const m = s.match(coreRe);
  if (!m || m.index === undefined) return s;
  let out = m[0].trim();
  const afterCore = s.slice(m.index + m[0].length);
  const cityPart = afterCore.match(/^\s+в\s+(.+)/iu);
  if (cityPart) {
    const [beforeJunk] = cityPart[1].split(PUBLISHED_LINE_JUNK_SPLIT);
    const city = String(beforeJunk || '').trim();
    if (city) out += ` в ${city}`;
  }
  return out.trim();
}

/**
 * @param {string} line например «Вакансия опубликована 21 апреля 2026 в Санкт-Петербурге»
 * @returns {string|null} YYYY-MM-DD
 */
export function parsePublishedLineToLocalYmd(line) {
  const s = String(line || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!s) return null;
  const re = /Вакансия опубликована\s+(\d{1,2})\s+([а-яё]+)\s+(\d{4})/i;
  const m = s.match(re);
  if (!m) return null;
  const day = parseInt(m[1], 10);
  const monthName = m[2].toLowerCase();
  const year = parseInt(m[3], 10);
  const month = MONTHS[monthName];
  if (!month || !Number.isFinite(day) || !Number.isFinite(year)) return null;
  if (day < 1 || day > 31) return null;
  const dt = new Date(year, month - 1, day);
  if (dt.getFullYear() !== year || dt.getMonth() !== month - 1 || dt.getDate() !== day) return null;
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

export const DEFAULT_PUBLICATION_TODAY_BONUS = 5;

/**
 * Значение из preferences (или дефолт), только неотрицательное целое.
 * @param {unknown} raw
 */
export function normalizePublicationTodayBonus(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return DEFAULT_PUBLICATION_TODAY_BONUS;
  return Math.max(0, Math.floor(n));
}

/**
 * @param {string|null|undefined} vacancyPublishedDate YYYY-MM-DD
 * @param {string|null|undefined} todayYmd YYYY-MM-DD
 * @param {number} [bonusPoints] при совпадении дат; по умолчанию {@link DEFAULT_PUBLICATION_TODAY_BONUS}; нечисло или меньше 0 → 0
 */
export function publicationDeltaPoints(vacancyPublishedDate, todayYmd, bonusPoints) {
  const p = String(vacancyPublishedDate || '').trim();
  const t = String(todayYmd || '').trim();
  if (!p || !t) return 0;
  if (p !== t) return 0;
  const raw = bonusPoints === undefined ? DEFAULT_PUBLICATION_TODAY_BONUS : bonusPoints;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}
