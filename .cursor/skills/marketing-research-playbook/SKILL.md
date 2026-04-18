---
name: marketing-research-playbook
description: >-
  Phased playbook for full product marketing research and GTM: intake, context, research, positioning, channels, CRO, measurement.
  Use with agent marketing-researcher; conditional branches, not “run all skills”.
---

# Marketing Research Playbook

Полный цикл «продукт/проект с нуля → маркетинг под ключ» с **условными ветками**. Каждая фаза имеет gate: без прохождения gate не переходить к генерации финальных артефактов.

## Phase 0 — Intake (Q&A)

Зафиксировать:

- Продукт/MVP, категория, стадия (idea / MVP / PMF / scale)
- GTM: PLG, sales-led, hybrid; география; языки
- ICP черновик, бюджет, командные ограничения, KPI
- Запреты (комплаенс, бренд, каналы off-limit)

Output: `IntakeSummary` (markdown bullet list).

## Phase 1 — Marketing context

- Создать или обновить `.cursor/marketing-context.md` по [`marketing-context`](../marketing-context/SKILL.md)
- Если мало данных — явно пометить **Confidence: low** в выводах Phase 2–4

## Phase 2 — Evidence (customer + market)

Skills (параллель по смыслу, но синтез один):

1. `customer-research` — VOC, работы, триггеры, возражения (см. confidence labels в skill)
2. `competitor-alternatives` или обзор конкурентов — если релевантно поисковому/сравнению
3. `marketing-psychology` — поведенческие рычаги, этика (не манипуляции)

Output: **ResearchSynthesis** + **QuoteBank** (verbatim) + top objections.

## Phase 3 — Strategy (PMM + economics)

1. `marketing-strategy-pmm` — позиционирование, ICP углубление, messaging architecture (адаптировать глубину под стадию)
2. `pricing-strategy` — метрика ценности, тиры, исследование WTP (если есть данные)
3. `launch-strategy` — фазы, ORB (owned/rented/borrowed), таймлайн

Output: **PositioningBrief** + **PricingHypotheses** + **LaunchSequence** (high level).

## Phase 4 — Acquisition (ветки)

Выбрать **одну или две** основные ветки по ICP и ресурсам:

### A. SEO / content-led

- `content-strategy` → `seo-audit` → при необходимости `ai-seo`, `programmatic-seo`, `schema-markup`, `site-architecture`

### B. Product-led / self-serve

- `page-cro` → `signup-flow-cro` / `onboarding-cro` / `form-cro` / `popup-cro` / `paywall-upgrade-cro` (только релевантные узлы воронки)

### C. Sales-led

- `sales-enablement` + `revops` + при необходимости `cold-email`, `email-sequence`

### D. Social / community / video

- `social-content` + выбранные channel skills (`linkedin-posts`, `twitter-x-posts`, `reddit-posts`, `youtube-seo`, `tiktok-marketing`, …)

## Phase 5 — Measurement

- `analytics-tracking` — tracking plan, конверсии, воронка, privacy placeholders
- `ab-test-setup` — если планируются эксперименты; иначе явно «experiments deferred»

## Phase 6 — Consolidated roadmap

Единый выход:

```markdown
## Marketing Roadmap
### Executive summary
### ICP & positioning (confidence)
### Priority channels (why)
### Skill execution order (ordered list with IDs)
### KPIs & metrics
### Dependencies (design, eng, legal)
### What not to do (anti-goals)
### Handoff to `marketing` agent (next prompts)
```

## Handoff к агенту `marketing`

После roadmap родительский агент может вызывать **`Task(subagent_type="marketing", ...)`** с промптом:

- конкретный deliverable (например «3 варианта hero + CTA для /pricing»)
- ссылка на `.cursor/marketing-context.md`
- список skills из roadmap

## Важно

- Не выполнять все skills из [upstream map](../../docs/MARKETING_SKILLS_UPSTREAM.md) — только релевантные ветки
- Внешний веб-ресёрч для фактов о рынке — через агента **`researcher`** + [`firecrawl-mcp`](../firecrawl-mcp/SKILL.md), не выдумывать конкурентов/цены
