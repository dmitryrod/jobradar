import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeEmployerInstructions,
  computeHasEmployerInstructions,
  buildVacancyDescriptionForCoverLetter,
  buildVacancyDescriptionForScoring,
  inferEmployerInstructionsFromText,
  mergeEmployerInstructions,
  mergeInstructionIntoRisks,
  enforceMustStartWith,
} from '../lib/employer-instructions.mjs';

test('normalizeEmployerInstructions: empty', () => {
  const e = normalizeEmployerInstructions(null);
  assert.equal(e.detected, false);
  assert.equal(e.responseFormat, 'plain_short');
});

test('normalizeEmployerInstructions: parses nested', () => {
  const e = normalizeEmployerInstructions({
    detected: true,
    confidence: 0.8,
    strictness: 'mandatory',
    responseFormat: 'question_answer',
    lengthPolicy: 'extended_if_needed',
    mustStartWith: 'Я тот специалист',
    mustAnswerQuestions: ['Q1?', ' Q2 '],
    rawFragments: ['фрагмент'],
  });
  assert.equal(e.mustAnswerQuestions.length, 2);
  assert.ok(computeHasEmployerInstructions(e));
});

test('buildVacancyDescriptionForCoverLetter: uses full text when hasEmployerInstructions', () => {
  const short = 'a'.repeat(100);
  const full = short + 'tail-instructions-как-откликнуться';
  const desc = buildVacancyDescriptionForCoverLetter({
    descriptionForLlm: short,
    vacancyDescriptionFull: full,
    hasEmployerInstructions: true,
    employerInstructions: { detected: true, confidence: 0.9 },
  });
  assert.ok(desc.includes('tail-instructions'));
});

test('buildVacancyDescriptionForScoring: includes tail instructions from long vacancy', () => {
  const head = 'A'.repeat(7000);
  const middle = 'B'.repeat(4000);
  const tail = 'Как откликнуться: в сопроводительном письме ответьте на два вопроса и приложите GitHub.';
  const desc = buildVacancyDescriptionForScoring({
    description: `${head}${middle}${tail}`,
  });
  assert.match(desc, /Как откликнуться/);
  assert.match(desc, /приложите GitHub/);
});

test('inferEmployerInstructionsFromText: extracts questions and links from raw description', () => {
  const raw =
    'Как откликнуться В сопроводительном письме расскажите: — Какой самый быстрый MVP вы собирали и за какой срок? — Какие AI-инструменты использовали в работе? Приложите ссылки на ваши проекты (GitHub, портфолио и т. д.), если они есть.';
  const ei = inferEmployerInstructionsFromText(raw);
  assert.equal(ei.detected, true);
  assert.equal(ei.responseFormat, 'question_answer');
  assert.equal(ei.mustAnswerQuestions.length, 2);
  assert.match(ei.mustAnswerQuestions[0], /самый быстрый MVP/i);
  assert.ok(ei.requiredArtifacts.some((x) => x.type === 'github'));
});

test('mergeEmployerInstructions: supplements stale stored instructions with fallback', () => {
  const merged = mergeEmployerInstructions(
    { detected: false },
    inferEmployerInstructionsFromText(
      'В сопроводительном письме расскажите: Какие AI-инструменты использовали в работе? Приложите GitHub.'
    )
  );
  assert.equal(merged.detected, true);
  assert.equal(merged.mustAnswerQuestions.length, 1);
  assert.ok(merged.requiredArtifacts.some((x) => x.type === 'github'));
});

test('mergeInstructionIntoRisks', () => {
  const r = mergeInstructionIntoRisks('база', 'не хватает ссылки', 'medium');
  assert.match(r, /база/);
  assert.match(r, /не хватает ссылки/);
});

test('enforceMustStartWith', () => {
  const out = enforceMustStartWith(['привет мир'], 'Здравствуйте!');
  assert.ok(out[0].startsWith('Здравствуйте!'));
});
