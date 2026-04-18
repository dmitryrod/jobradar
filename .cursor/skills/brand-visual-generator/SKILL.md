---
name: brand-visual-generator
description: >-
  Visual identity execution: typography, color system, spacing, a11y contrast — pairs with branding strategy.
---

# Brand Visual Generator

## Канон в этом репозитории

- **Токены и тема:** [`app/frontend/tailwind.config.js`](../../../app/frontend/tailwind.config.js) — семантические цвета (`background`, `foreground`, `accent`, `danger`, …), типографика, радиусы, тени.
- **Глобальные стили и focus:** [`app/frontend/src/index.css`](../../../app/frontend/src/index.css).
- **Документация дизайна:** [`app/docs/design/DESIGN.md`](../../../app/docs/design/DESIGN.md) — роли токенов, frontend/backend (Swagger/ReDoc), границы дизайн-системы MVP.
- **Голос бренда для UI-текста:** [`.cursor/marketing-context.md`](../../marketing-context.md) (Brand Voice).

При новых экранах в `app/frontend` — расширять тему в `tailwind.config.js`, не размножать произвольные hex в компонентах.

## Output

Token table (HEX, roles) | type scale | component notes | a11y checklist

## Upstream

- [brand-visual-generator](https://skills.sh/kostja94/marketing-skills/brand-visual-generator) — дополнительные идеи; источник правды по коду — файлы выше.
