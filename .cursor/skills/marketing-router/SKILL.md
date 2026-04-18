---
name: marketing-router
description: >-
  Maps user intent to 1–3 marketing leaf skills after marketing-context is loaded.
  Use with agent marketing for tactical tasks (copy, CRO, SEO slice, email, etc.).
---

# Marketing Router

Цель: по запросу пользователя выбрать **минимальный набор** leaf skills (обычно 1–3), не запускать всё подряд.

## Preconditions

1. Прочитан [`marketing-context`](../marketing-context/SKILL.md) и при наличии файл `.cursor/marketing-context.md`
2. Если контекста нет — сначала зафиксируй blocking questions или создай черновик контекста

## Матрица intent → skill(s)

| Intent (ключевые слова) | Primary skill | Часто вместе |
|-------------------------|---------------|--------------|
| headline, landing copy, homepage, CTA | `copywriting` | `page-cro`, `copy-editing` |
| edit polish line-level | `copy-editing` | `copywriting` |
| ideas, brainstorm tactics | `marketing-ideas` | `launch-strategy` |
| SEO audit, rankings, technical | `seo-audit` | `site-architecture`, `schema-markup` |
| AI search, citations, LLM SEO | `ai-seo` | `content-strategy` |
| pSEO, templates at scale | `programmatic-seo` | `competitor-alternatives` |
| IA, URLs, internal links | `site-architecture` | `content-strategy` |
| JSON-LD, rich results | `schema-markup` | `seo-audit` |
| LP conversion, hero, proof | `page-cro` | `copywriting`, `ab-test-setup` |
| signup, trial, registration flow | `signup-flow-cro` | `form-cro`, `analytics-tracking` |
| after signup activation | `onboarding-cro` | `email-sequence` |
| forms friction | `form-cro` | `page-cro` |
| modals, popups | `popup-cro` | `page-cro` |
| upgrade, paywall | `paywall-upgrade-cro` | `pricing-strategy` |
| GA4, events, tracking plan | `analytics-tracking` | `ab-test-setup` |
| experiment design | `ab-test-setup` | `analytics-tracking` |
| pricing, packaging | `pricing-strategy` | `page-cro` |
| launch, GTM, PH | `launch-strategy` | `email-sequence`, `social-content` |
| nurture, drips | `email-sequence` | `copywriting` |
| outbound B2B | `cold-email` | `customer-research` |
| ads creative | `ad-creative` | `copywriting` |
| churn, retention | `churn-prevention` | `email-sequence`, `pricing-strategy` |
| referrals, virality | `referral-program` | `launch-strategy` |
| lead magnet | `lead-magnets` | `email-sequence`, `content-strategy` |
| free tool as marketing | `free-tool-strategy` | `programmatic-seo` |
| interviews, VOC, personas | `customer-research` | `marketing-psychology` |
| battlecards, vs pages SEO | `competitor-alternatives` | `copywriting` |
| sales collateral | `sales-enablement` | `revops` |
| CRM, lifecycle, MQL | `revops` | `analytics-tracking` |
| PMM, positioning, ICP deep | `marketing-strategy-pmm` | `customer-research`, `pricing-strategy` |
| social organic | `social-content` | `copywriting` |
| LinkedIn / X / Reddit / Pinterest / YouTube / TikTok | matching channel skill | `social-content` |
| App Store ASO | `aso-audit` | `page-cro` |
| philosophy, minimal bootstrap plan | `marketing-plan-philosophy` | `content-strategy` |

## Output format для агента `marketing`

1. **Selected skills:** `name1`, `name2` (обоснование в 1–2 предложениях)
2. **Assumptions / gaps** в контексте
3. **Next:** применить только выбранные `.cursor/skills/<name>/SKILL.md`

## Делегирование

- Субагенты — только через **`Task`** ([`CREATING_ASSETS.md`](../../docs/CREATING_ASSETS.md#task-delegation))
- Роутер **не заменяет** leaf skills: он выбирает, какие файлы читать
