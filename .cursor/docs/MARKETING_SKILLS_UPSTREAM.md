# Карта upstream marketing skills

Канонические адаптированные skills лежат в `.cursor/skills/<name>/SKILL.md`. Этот файл — **карта соответствия** upstream (skills.sh / GitHub) → локальное имя → слияния (без потери практик).

## Принципы

- **Один leaf skill** в репо на тему; дубли из других пакетов сведены в appendix секции или в таблицу ниже.
- Полный upstream текст не копируется — только адаптированные паттерны + ссылки.

## Источники по умолчанию

| Upstream | Роль |
|----------|------|
| [coreyhaines31/marketingskills](https://github.com/coreyhaines31/marketingskills) | Базовый набор vertical skills, cross-links |
| [kostja94/marketing-skills](https://github.com/kostja94/marketing-skills) | Tactical / channel / generators — доп. формулы |
| [davila7/claude-code-templates marketing-strategy-pmm](https://skills.sh/davila7/claude-code-templates/marketing-strategy-pmm) | PMM / GTM / ICP глубина |
| [refoundai/lenny-skills content-marketing](https://skills.sh/refoundai/lenny-skills/content-marketing) | Принципы content engine |
| [slavingia/skills marketing-plan](https://skills.sh/slavingia/skills/marketing-plan) | Философия minimal / organic — отдельный skill |
| [claude-office-skills tiktok-marketing](https://skills.sh/claude-office-skills/skills/tiktok-marketing) | TikTok + automation patterns |

## Слияния (merge targets)

| Upstream A | Upstream B | Канон в репо | Что сохранено из B |
|--------------|------------|--------------|---------------------|
| copywriting (Corey) | copywriting (kostja94) | `copywriting` | PAS/AIDA/BAB/4U, headline table — appendix |
| content-strategy (Corey) | content-marketing (Lenny) | `content-strategy` | demand validation, evergreen, human voice |
| site-architecture (Corey) | website-structure (kostja94) | `site-architecture` | page priority matrix, growth→path mapping |
| page-cro (Corey) | conversion-optimization (kostja94) | `page-cro` | PIE, funnel, sample size notes — appendix |
| marketing-ideas (Corey) | marketing-ideas (phuryn) | `marketing-ideas` | формат «5 идей + channel + cost» |
| product-marketing-context (Corey) | — | `marketing-context` | путь `.cursor/marketing-context.md` |
| marketing-skills-collection / marketing-automation (supercent-io) | — | *не vendorятся* | Использовать только как taxonomy/orientation reference |

## Маршрутизация skill → агент

| Агент | Назначение |
|-------|------------|
| `marketing` | Читает `marketing-context` → `marketing-router` → 1–3 leaf skills → deliverable |
| `marketing-researcher` | Фазы из `marketing-research-playbook`; веб-факты через `researcher` |

## Полный список локальных marketing skills

Имена папок под `.cursor/skills/` (alphabetical):

`ab-test-setup`, `ad-creative`, `affiliate-page-generator`, `ai-seo`, `analytics-tracking`, `aso-audit`, `brand-visual-generator`, `branding`, `churn-prevention`, `cold-email`, `competitor-alternatives`, `content-strategy`, `copy-editing`, `copywriting`, `customer-research`, `email-sequence`, `form-cro`, `free-tool-strategy`, `indexing`, `keyword-research`, `landing-page-generator`, `launch-strategy`, `lead-magnets`, `link-building`, `linkedin-posts`, `marketing-context`, `marketing-ideas`, `marketing-plan-philosophy`, `marketing-psychology`, `marketing-research-playbook`, `marketing-router`, `marketing-strategy-pmm`, `onboarding-cro`, `page-cro`, `paywall-upgrade-cro`, `pinterest-posts`, `popup-cro`, `pricing-strategy`, `programmatic-seo`, `reddit-posts`, `referral-program`, `revops`, `robots-txt`, `sales-enablement`, `schema-markup`, `seo-audit`, `signup-flow-cro`, `site-architecture`, `social-content`, `tiktok-marketing`, `twitter-x-posts`, `video-marketing`, `youtube-seo`.

*Foundation (`marketing-context`) / router / playbook — входные для агентов; leaf выбирает `marketing-router`.*

## Поддержка `subagent_type`

В этой сборке **предполагается** вызов `Task(subagent_type="<name>")` для файлов **`.cursor/agents/<name>.md`** (поле `name` в frontmatter), **если среда Cursor поддерживает custom subagents**. Имена `marketing` и `marketing-researcher` зарегистрированы на уровне репозитория и согласованы с docs/CSV.

**Fallback:** если среда не подхватывает custom агента, родительский агент выполняет те же инструкции, явно прочитав перечисленные `SKILL.md`, либо делегирует существующие роли точечно (например `researcher` для веб-фактов) без подмены маркетингового содержания.
