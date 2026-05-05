/**
 * Утилиты для текста от LLM: суррогаты UTF-16 и символы замены (U+FFFD).
 */

const REPLACEMENT = '\uFFFD';

/**
 * Удаляет непарные суррогаты UTF-16 (дают «битый» текст и иногда отображаются как �).
 * @param {string} s
 * @returns {string}
 */
export function stripLoneUtf16Surrogates(s) {
  if (s == null || typeof s !== 'string' || !s.length) return typeof s === 'string' ? s : '';
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff) {
      const low = s.charCodeAt(i + 1);
      if (low >= 0xdc00 && low <= 0xdfff) {
        out += s.slice(i, i + 2);
        i++;
        continue;
      }
      continue;
    }
    if (c >= 0xdc00 && c <= 0xdfff) continue;
    out += s[i];
  }
  return out;
}

/**
 * @param {string} s
 * @returns {boolean}
 */
export function hasUnicodeReplacementChar(s) {
  return typeof s === 'string' && s.includes(REPLACEMENT);
}

/**
 * Удаляет символы замены Unicode (U+FFFD), которые появляются при ошибках декодирования UTF-8.
 * @param {string} s
 * @returns {string}
 */
export function stripReplacementChars(s) {
  if (s == null || typeof s !== 'string' || !s.length) return typeof s === 'string' ? s : '';
  return s.replace(/\uFFFD/g, '');
}

/**
 * Комбинированная очистка текста от суррогатов и символов замены.
 * @param {string} s
 * @returns {string}
 */
export function sanitizeLlmText(s) {
  if (s == null || typeof s !== 'string') return '';
  return stripReplacementChars(stripLoneUtf16Surrogates(s));
}
