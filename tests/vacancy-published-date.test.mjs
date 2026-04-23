import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parsePublishedLineToLocalYmd,
  publicationDeltaPoints,
  formatLocalYmd,
  sanitizeVacancyPublishedLine,
  normalizePublicationTodayBonus,
} from '../lib/vacancy-published-date.mjs';

test('parsePublishedLineToLocalYmd: полная строка с городом', () => {
  const line = 'Вакансия опубликована 21 апреля 2026 в Санкт-Петербурге';
  assert.equal(parsePublishedLineToLocalYmd(line), '2026-04-21');
});

test('sanitizeVacancyPublishedLine: отрезает хвост UI (Откликнуться, Dream Job, …)', () => {
  const dirty =
    'Вакансия опубликована 22 апреля 2026 в Санкт-Петербурге Откликнуться Dream Job Отзывы о компании Курсы по профессии «C#/»';
  assert.equal(
    sanitizeVacancyPublishedLine(dirty),
    'Вакансия опубликована 22 апреля 2026 в Санкт-Петербурге'
  );
});

test('parsePublishedLineToLocalYmd: лишние пробелы', () => {
  assert.equal(
    parsePublishedLineToLocalYmd('  Вакансия  опубликована  1  мая  2025  в  Москве  '),
    '2025-05-01'
  );
});

test('parsePublishedLineToLocalYmd: нет совпадения', () => {
  assert.equal(parsePublishedLineToLocalYmd('Сегодня на hh.ru'), null);
  assert.equal(parsePublishedLineToLocalYmd(''), null);
});

test('publicationDeltaPoints: дефолт +5 только при равенстве дат', () => {
  assert.equal(publicationDeltaPoints('2026-04-21', '2026-04-21'), 5);
  assert.equal(publicationDeltaPoints('2026-04-21', '2026-04-22'), 0);
  assert.equal(publicationDeltaPoints(null, '2026-04-21'), 0);
});

test('publicationDeltaPoints: явный бонус из preferences', () => {
  assert.equal(publicationDeltaPoints('2026-04-21', '2026-04-21', 7), 7);
  assert.equal(publicationDeltaPoints('2026-04-21', '2026-04-21', 0), 0);
  assert.equal(publicationDeltaPoints('2026-04-21', '2026-04-22', 7), 0);
});

test('normalizePublicationTodayBonus: дефолт и обрезка', () => {
  assert.equal(normalizePublicationTodayBonus(undefined), 5);
  assert.equal(normalizePublicationTodayBonus(3.7), 3);
  assert.equal(normalizePublicationTodayBonus(-2), 0);
  assert.equal(normalizePublicationTodayBonus(NaN), 5);
});

test('formatLocalYmd: фиксированная дата', () => {
  assert.equal(formatLocalYmd(new Date(2026, 3, 21)), '2026-04-21');
});
