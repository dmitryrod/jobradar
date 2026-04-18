#!/usr/bin/env node
/**
 * NoRissk Metrics Report
 * Анализирует session reports и генерирует METRICS_SUMMARY.md с итоговым скором.
 * Вывод: stdout — блок скора для вставки агентом в ответ; файл METRICS_SUMMARY.md.
 * Расширение .cjs: корневой package.json с "type":"module" иначе ломает require().
 */

const fs = require('fs');
const path = require('path');

const SCRIPT_DIR = __dirname;
const CONFIG_PATH = path.join(SCRIPT_DIR, '..', 'config.json');
const DEFAULT_SESSIONS_PATH = '.cursor/reports';
const PROJECT_ROOT = path.resolve(SCRIPT_DIR, '..', '..');

function loadConfig() {
  try {
    const configPath = fs.existsSync(CONFIG_PATH) ? CONFIG_PATH : path.join(process.cwd(), '.cursor', 'config.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    if (config.metrics && config.metrics.enabled === false) {
      return null;
    }
    return (config.metrics && config.metrics.sessionsPath) || DEFAULT_SESSIONS_PATH;
  } catch (e) {
    return DEFAULT_SESSIONS_PATH;
  }
}

function loadSessions(sessionsPath) {
  const fullPath = path.join(PROJECT_ROOT, sessionsPath);
  if (!fs.existsSync(fullPath)) {
    return [];
  }
  const files = fs.readdirSync(fullPath)
    .filter(f => f.startsWith('session-') && f.endsWith('.json'))
    .sort()
    .reverse();
  const sessions = [];
  for (const file of files) {
    try {
      const content = fs.readFileSync(path.join(fullPath, file), 'utf8');
      sessions.push(JSON.parse(content));
    } catch {
      // skip invalid files
    }
  }
  return sessions;
}

function computeScore(sessions) {
  if (sessions.length === 0) {
    return { score: null, components: {}, interpretation: 'Нет данных' };
  }

  const testRelevantSessions = sessions.filter(s =>
    s.testsApplicable === true || (s.testsApplicable === undefined && s.testsPassed !== undefined)
  );
  const testsPassed = testRelevantSessions.filter(s => s.testsPassed === true).length;
  const docsCreated = sessions.filter(s => s.documentationCreated === true).length;
  const totalDebugger = sessions.reduce((sum, s) => sum + (s.debuggerCalls || 0), 0);
  const securitySensitive = sessions.filter(s =>
    s.workflow === 'feature' || s.securityAuditorCalled === true
  );
  const securityCalled = sessions.filter(s => s.securityAuditorCalled === true).length;

  // Делегирование: доля ожидаемых субагентов (имена = subagent_type в Task(...))
  const expectedByWorkflow = {
    scaffold: ['worker', 'test-runner', 'documenter'],
    implement: ['worker', 'test-runner', 'reviewer-senior', 'documenter'],
    feature: ['planner', 'worker', 'test-runner', 'reviewer-senior', 'documenter']
  };
  const expectedByTaskType = {
    marketing_tactical: ['marketing'],
    marketing_research: ['marketing-researcher']
  };
  const expectedByPrimaryAgent = {
    marketing: ['marketing'],
    'marketing-researcher': ['marketing-researcher'],
    researcher: ['researcher'],
    worker: ['worker'],
    planner: ['planner'],
    documenter: ['documenter']
  };
  let delegationSum = 0;
  let delegationCount = 0;
  for (const s of sessions) {
    const expected =
      expectedByTaskType[s.taskType] ||
      expectedByPrimaryAgent[s.primaryAgent] ||
      expectedByWorkflow[s.workflow] ||
      expectedByWorkflow.implement;
    const called = s.subagentsCalled || [];
    const matched = expected.filter(e => called.includes(e)).length;
    delegationSum += expected.length > 0 ? matched / expected.length : 1;
    delegationCount++;
  }
  const delegationRate = delegationCount > 0 ? delegationSum / delegationCount : 1;

  const testsRate = testRelevantSessions.length > 0 ? testsPassed / testRelevantSessions.length : 1;
  const docsRate = sessions.length > 0 ? docsCreated / sessions.length : 0;
  const securityRate = securitySensitive.length > 0
    ? securityCalled / securitySensitive.length
    : 1;
  const debuggerPenalty = Math.min(10, totalDebugger * 2);

  const components = {
    tests: Math.round(testsRate * 100),
    docs: Math.round(docsRate * 100),
    delegation: Math.round(delegationRate * 100),
    security: Math.round(securityRate * 100),
    debuggerPenalty: -debuggerPenalty
  };

  const rawScore = testsRate * 30 + docsRate * 20 + delegationRate * 25 + securityRate * 15 + (10 - debuggerPenalty);
  const score = Math.max(0, Math.min(100, Math.round(rawScore)));

  let interpretation;
  if (score >= 80) interpretation = 'подход работает хорошо';
  else if (score >= 60) interpretation = 'в целом ок, есть зоны роста';
  else if (score >= 40) interpretation = 'заметные проблемы';
  else interpretation = 'критично, нужны изменения';

  return { score, components, interpretation, sessions };
}

function formatScoreBlock(score, components, sessions, interpretation) {
  const lines = [];
  lines.push('┌─────────────────────────────────────────────────────────┐');
  lines.push(`│  NoRissk Score:  ${String(score).padStart(3)} / 100  — ${interpretation.padEnd(24)} │`);
  lines.push('└─────────────────────────────────────────────────────────┘');
  lines.push('');
  const firstDate = sessions[0]?.timestamp?.slice(0, 10) || '—';
  const lastDate = sessions[sessions.length - 1]?.timestamp?.slice(0, 10) || '—';
  lines.push(`Сессий: ${sessions.length} | Период: ${firstDate} – ${lastDate}`);
  lines.push('');
  lines.push(`  Тесты:        ${components.tests}% ${components.tests >= 80 ? '✓' : ''}`);
  lines.push(`  Документация: ${components.docs}% ${components.docs >= 80 ? '✓' : ''}`);
  lines.push(`  Делегирование: ${components.delegation}% ${components.delegation >= 80 ? '✓' : ''}`);
  lines.push(`  Security:     ${components.security}%`);
  lines.push(`  Debugger:     ${components.debuggerPenalty} (штраф)`);
  lines.push('');
  return lines.join('\n');
}

function buildMarkdownReport(score, components, sessions, interpretation, sessionsPath) {
  const workflowCounts = { scaffold: 0, implement: 0, feature: 0, 'integrate-skill': 0, custom: 0, other: 0 };
  const taskTypeCounts = { engineering: 0, marketing_tactical: 0, marketing_research: 0, other: 0 };
  for (const s of sessions) {
    if (workflowCounts[s.workflow] !== undefined) workflowCounts[s.workflow]++;
    else workflowCounts.other++;
    if (taskTypeCounts[s.taskType] !== undefined) taskTypeCounts[s.taskType]++;
    else if (s.taskType) taskTypeCounts.other++;
    else taskTypeCounts.engineering++;
  }

  let md = `# Метрики NoRissk\n\n`;
  md += `## Итоговый скор: ${score} / 100\n\n`;
  md += `**Интерпретация:** ${interpretation}\n\n`;
  md += `| Компонент      | Вклад | Оценка |\n`;
  md += `| -------------- | ----- | ------ |\n`;
  md += `| Тесты         | 30%   | ${components.tests}% |\n`;
  md += `| Документация  | 20%   | ${components.docs}% |\n`;
  md += `| Делегирование | 25%   | ${components.delegation}% |\n`;
  md += `| Security      | 15%   | ${components.security}% |\n`;
  md += `| Debugger      | 10%   | ${components.debuggerPenalty} |\n\n`;
  md += `---\n\n`;
  md += `## Детали (сводка)\n\n`;
  const firstDate = sessions[0]?.timestamp?.slice(0, 10) || '—';
  const lastDate = sessions[sessions.length - 1]?.timestamp?.slice(0, 10) || '—';
  md += `**Период:** ${firstDate} – ${lastDate} | **Сессий:** ${sessions.length}\n\n`;
  md += `| Workflow   | Сессий |\n`;
  md += `| ---------- | ------ |\n`;
  md += `| scaffold   | ${workflowCounts.scaffold} |\n`;
  md += `| implement  | ${workflowCounts.implement} |\n`;
  md += `| feature    | ${workflowCounts.feature} |\n\n`;
  md += `| integrate-skill | ${workflowCounts['integrate-skill']} |\n`;
  md += `| custom         | ${workflowCounts.custom} |\n`;
  md += `| other          | ${workflowCounts.other} |\n\n`;
  md += `| Task type            | Сессий |\n`;
  md += `| -------------------- | ------ |\n`;
  md += `| engineering / none   | ${taskTypeCounts.engineering} |\n`;
  md += `| marketing_tactical   | ${taskTypeCounts.marketing_tactical} |\n`;
  md += `| marketing_research   | ${taskTypeCounts.marketing_research} |\n`;
  md += `| other                | ${taskTypeCounts.other} |\n\n`;
  md += `## Последние сессии\n\n`;
  md += `| Дата       | Workflow | Task type | Primary agent | Задача                    | Тесты | Debugger |\n`;
  md += `| ---------- | -------- | --------- | ------------- | ------------------------- | ----- | -------- |\n`;
  for (const s of sessions.slice(0, 10)) {
    const date = s.timestamp?.slice(0, 10) || s.reportDate || '—';
    const wf = s.workflow || '—';
    const taskType = s.taskType || 'engineering';
    const primaryAgent = s.primaryAgent || '—';
    const task = (s.taskSummary || '—').slice(0, 24);
    const tests = s.testsApplicable === false ? 'N/A' : (s.testsPassed ? '✓' : '—');
    const dbg = s.debuggerCalls || 0;
    md += `| ${date} | ${wf.padEnd(8)} | ${taskType.padEnd(9)} | ${primaryAgent.padEnd(13)} | ${task.padEnd(24)} | ${tests.padEnd(5)} | ${dbg} |\n`;
  }
  return md;
}

function main() {
  const sessionsPath = loadConfig();
  if (sessionsPath === null) {
    console.log('Метрики отключены (config.metrics.enabled: false).');
    return;
  }

  const sessions = loadSessions(sessionsPath);
  const { score, components, interpretation } = computeScore(sessions);

  const fullPath = path.join(PROJECT_ROOT, sessionsPath);
  if (!fs.existsSync(fullPath)) {
    fs.mkdirSync(fullPath, { recursive: true });
  }

  if (sessions.length === 0) {
    const msg = 'Нет session reports. Запусти workflow (norissk, workflow-scaffold и т.д.) — после выполнения появится session-*.json.';
    console.log(msg);
    try {
      fs.mkdirSync(fullPath, { recursive: true });
      fs.writeFileSync(path.join(fullPath, 'METRICS_SUMMARY.md'), `# Метрики NoRissk\n\n${msg}\n`, 'utf8');
    } catch (e) {
      console.error('Не удалось записать METRICS_SUMMARY:', e.message);
    }
    return;
  }

  const scoreBlock = formatScoreBlock(score, components, sessions, interpretation);
  console.log(scoreBlock);

  try {
    const md = buildMarkdownReport(score, components, sessions, interpretation, sessionsPath);
    fs.writeFileSync(path.join(fullPath, 'METRICS_SUMMARY.md'), md, 'utf8');
  } catch (e) {
    console.error('Не удалось записать METRICS_SUMMARY:', e.message);
  }
}

try {
  main();
} catch (err) {
  console.error('metrics-report error:', err.message);
  if (process.env.DEBUG) {
    console.error(err.stack);
  }
  process.exit(1);
}
