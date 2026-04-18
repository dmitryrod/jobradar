---
name: marp-slide
description: Create professional Marp presentation slides with 7 beautiful themes (default, minimal, colorful, dark, gradient, tech, business). Use when users request slide creation, presentations, or Marp documents. Supports custom themes, image layouts, and "make it look good" requests with automatic quality improvements.
---

# Marp Slide Creator

Create professional, visually appealing Marp presentation slides with 7 pre-designed themes and built-in best practices.

## When to Use This Skill

Use this skill when the user:
- Requests to create presentation slides or Marp documents
- Asks to "make slides look good" or "improve slide design"
- Provides vague instructions like "良い感じにして" (make it nice) or "かっこよく" (make it cool)
- Wants to create lecture or seminar materials
- Needs bullet-point focused slides with occasional images

## Project paths and orchestration

- **Canonical paths** live in [`.cursor/config.json`](../../config.json) under `presentations`:
  - `source` — Marp `.md` files and slide assets (e.g. `presentations/images/`, `presentations/assets/`).
  - `output` — generated **pptx**, **pdf**, **html** from Marp CLI (default: `presentations/dist/`; usually gitignored).
- **`DESIGN_TOKENS.md` + extended tokens:** для тематических deck’ов стиль Marp и согласованность с UI берут из **`presentations/DESIGN_TOKENS.md`** (и при наличии **`*-extended.tokens.json`**) — не только из сырого Stitch JSON. Шаблон контракта: [`presentations/DESIGN_TOKENS.md`](../../../presentations/DESIGN_TOKENS.md). Правило потока: [`.cursor/docs/CREATING_ASSETS.md` § Stitch/designer](../../docs/CREATING_ASSETS.md#stitch-designer-canonical).
- **Subagents** are invoked only via Cursor **`Task(subagent_type="designer", ...)`** — not via MCP. This skill is used by the **designer** agent when building decks.
- **Workflows:** `/norissk` or `/workflow-scaffold` / `/workflow-implement` — for design-only slides use **designer** → (optional) **documenter** if `app/docs/` must be updated. See [`workflow-selection.mdc`](../../rules/workflow-selection.mdc) and [`CREATING_ASSETS.md`](../../docs/CREATING_ASSETS.md#agent-intent-map).
- **Google Stitch:** not a separate subagent. The **designer** may use Stitch MCP for **raw** tokens / theme / `designMd` / **HTML as reference** — then **normalize** into `DESIGN_TOKENS.md`. Stitch output is **not** the repo canonical spec by itself (see [`stitch-mcp/SKILL.md`](../stitch-mcp/SKILL.md)). **Не** использовать скачивание **скриншотов** / битого SVG с URL для слайдов — см. «Экспорт картинок» в [`stitch-mcp/SKILL.md`](../stitch-mcp/SKILL.md).
- **Polza / AI images:** разрешены только для **narrative / cover / metaphor / section** слайдов; **запрещены** для точных data charts и слайдов, где смысл несёт таблица/график. **Не более 30%** слайдов в deck с AI-картинками; **не более 2** таких слайдов подряд. Картинки только как **локальные файлы** под `presentations/` (например `assets/generated/`). Промпты согласовать с фоном и палитрой из **`DESIGN_TOKENS.md`**; в промпте явно указывать **предметную метафору** (экономика → графики/терминал/валюта, а не generic abstract). Генерацию файлов и HTTP к Polza выполняет агент **`imager`** ([`.cursor/agents/imager.md`](../../agents/imager.md)); скрипт: [`presentations/scripts/polza_marp_images.py`](../../../presentations/scripts/polza_marp_images.py), скилл: [`ai-image-generation`](../ai-image-generation/SKILL.md).

## Quick Start

### Step 1: Select Theme

First, determine the appropriate theme based on the user's request and content.

**Quick theme selection:**
- **Technical/Developer content** → tech theme
- **Business/Corporate** → business theme
- **Creative/Event** → colorful or gradient theme
- **Academic/Simple** → minimal theme
- **General/Unsure** → default theme
- **Dark background preferred** → dark or tech theme

For detailed theme selection guidance, read `references/theme-selection.md`.

### Step 2: Create Slides

1. **Read relevant references first**:
   - Always start by reading `references/marp-syntax.md` for basic syntax
   - For images: `references/image-patterns.md` (official Marpit image syntax)
   - For advanced features (math, emoji): `references/advanced-features.md`
   - For custom themes: `references/theme-css-guide.md`

2. Copy content from the appropriate template file:
   - `assets/template-basic.md` - Default theme (most common)
   - `assets/template-minimal.md` - Minimal theme
   - `assets/template-colorful.md` - Colorful theme
   - `assets/template-dark.md` - Dark mode theme
   - `assets/template-gradient.md` - Gradient theme
   - `assets/template-tech.md` - Tech/code theme
   - `assets/template-business.md` - Business theme

3. Read `references/best-practices.md` for quality guidelines

4. Structure content following best practices:
   - Title slide with `<!-- _class: lead -->`
   - Concise h2 titles (5-7 characters in Japanese)
   - 3-5 bullet points per slide
   - Adequate whitespace

5. Add images if needed using patterns from `references/image-patterns.md`

6. Save the Markdown deck under **`presentations.source`** from config (e.g. `presentations/my-deck.md`) with `.md` extension

## Available Themes

### 1. Default Theme
**Colors**: Beige background, navy text, blue headings
**Style**: Clean, sophisticated with decorative lines
**Use for**: General seminars, lectures, presentations
**Template**: `template-basic.md`

### 2. Minimal Theme
**Colors**: White background, gray text, black headings
**Style**: Minimal decoration, wide margins, light fonts
**Use for**: Content-focused presentations, academic talks
**Template**: `template-minimal.md`

### 3. Colorful & Pop Theme
**Colors**: Pink gradient background, multi-color accents
**Style**: Vibrant gradients, bold fonts, rainbow accents
**Use for**: Youth-oriented events, creative projects
**Template**: `template-colorful.md`

### 4. Dark Mode Theme
**Colors**: Black background, cyan/purple accents
**Style**: Dark theme with glow effects, eye-friendly
**Use for**: Tech presentations, evening talks, modern look
**Template**: `template-dark.md`

### 5. Gradient Background Theme
**Colors**: Purple/pink/blue/green gradients (varies per slide)
**Style**: Different gradient per slide, white text, shadows
**Use for**: Visual-focused, creative presentations
**Template**: `template-gradient.md`

### 6. Tech/Code Theme
**Colors**: GitHub-style dark background, blue/green accents
**Style**: Code fonts, Markdown-style headers with # symbols
**Use for**: Programming tutorials, tech meetups, developer content
**Template**: `template-tech.md`

### 7. Business Theme
**Colors**: White background, navy headings, blue accents
**Style**: Corporate presentation style, top border, table support
**Use for**: Business presentations, proposals, reports
**Template**: `template-business.md`

## Creating Slides Process

### Basic Workflow

1. **Understand requirements**
   - Identify content: title, topics, key points
   - Determine target audience
   - Assess formality level

2. **Select theme**
   - Use quick selection rules above
   - If uncertain, consult `references/theme-selection.md`
   - Default to default theme if still unsure

3. **Apply template**
   - Load appropriate template from `assets/`
   - CSS is already embedded - no external files needed
   - Maintain template structure

4. **Structure content**
   - Title slide: `<!-- _class: lead -->` + h1
   - Content slides: h2 title + bullet points
   - Keep titles to 5-7 characters (Japanese)
   - Use 3-5 bullet points per slide

5. **Refine quality**
   - Read `references/best-practices.md`
   - Ensure adequate whitespace
   - Maintain consistency
   - Keep text concise (15-25 chars per line)

6. **Add images**
   - If needed, consult `references/image-patterns.md`
   - Common: `![bg right:40%](image.png)` for side images
   - Use proper Marp image syntax

6b. **Charts from data (CSV → PNG → slide)**

   - **Numeric series / точные ряды:** готовь **CSV** с заголовком (две числовые колонки, например `year`, `gdp_growth_pct`), затем скрипт в репозитории строит **PNG**:
     - Зависимости: `uv sync --extra presentations` в каталоге `app/` (ставит `matplotlib`).
     - Из **корня репозитория**:  
       `uv run python presentations/tools/chart_from_csv.py presentations/sample-data/gdp-demo.csv -o presentations/assets/chart-gdp.png --title "ВВП, % г/г" --dark --kind line`
     - Модуль: [`presentations/chart_from_csv.py`](../../../presentations/chart_from_csv.py) (`--backend matplotlib` по умолчанию; `--backend plotly` — опционально, extras `presentations-plotly` и **kaleido** для экспорта PNG).
   - В Marp вставь: `![w:700px](assets/chart-gdp.png)` или `![bg right:38%](assets/chart-gdp.png)`.
   - **Обложки / метафоры / иллюстрации без табличных данных** — не через `chart_from_csv`; внешние генераторы (**Polza AI** и др.) — только **декоративные** локальные PNG, с лимитом **≤30%** слайдов и **не подряд >2**; **никогда** не вместо графиков по фактическим рядам или плотных data/table слайдов. Сборка батча: `uv run python presentations/scripts/polza_marp_images.py --help` (ключ `POLZA_API_KEY` или `POLZA_AI_API_KEY`, опционально `POLZA_BASE_URL`). Палитра/фон — из **`DESIGN_TOKENS.md`**.

7. **Output file**
   - Save under **`presentations.source`** (see `.cursor/config.json` → `presentations.source`)
   - Use a descriptive filename like `presentation.md`

## Build artifacts (Marp CLI)

After the `.md` file exists, export **pptx** / **pdf** / **html** into **`presentations.output`** (see `.cursor/config.json` → `presentations.output`).

From the **repository root**:

```bash
# PowerShell / bash — adjust paths to match config
npx marp --no-stdin presentations/deck.md -o presentations/dist/deck.pptx --pptx
npx marp --no-stdin presentations/deck.md -o presentations/dist/deck.pdf --pdf
npx marp --no-stdin presentations/deck.md -o presentations/dist/deck.html --html
```

On **Windows**, `--no-stdin` avoids Marp waiting for piped input when launched via `npx`. Global `marp` (npm install -g) usually does not need it.

Or: `npm run marp -- --no-stdin <file> -o ...` (see root `package.json`).

- Local images: `--allow-local-files` may be required when exporting to PDF/PPTX.
- PDF/PPTX need a Chromium-based engine (bundled or system Chrome).

Optional: `.marprc.yml` in repo root for shared theme paths — see `references/advanced-features.md`.

### PPTX и тёмная тема (типичные сбои)

- **Таблицы `|...|`:** в экспорте pptx у `td` часто оказывается **белый фон** и светлый текст — в `style:` задайте явно `background-color` и `color` для **`th` и `td`** с `!important` (см. `presentations/russia-economy-2022-2026.md`).
- **Fenced code (тройные backticks):** блоки кода часто рендерятся **белым прямоугольником**; для тёмного дека **предпочитайте** обычный markdown (списки, жирный, стрелки) вместо ```…``` или дублируйте тёмный фон в CSS для `pre`/`code` (надёжность в pptx не 100%).
- **Split `![bg right:…%](chart.png)`:** слишком крупный PNG + широкая колонка → график **обрезается**. Делайте PNG **компактным** в `chart_from_csv` (маленький `figsize`, короткие заголовки), колонку **32–36%**, не 40–45%.

### AI-иллюстрации (Polza / GenerateImage)

- Промпт обязан **привязать предмет**: для экономики/финансов — силуэты графиков, сетка терминала, валютные символы (без читаемых чисел и логотипов), а не «абстрактное свечение» без темы. Согласовать цвета с **`DESIGN_TOKENS.md`**.

## Handling "Make It Look Good" Requests

When users give vague instructions like "良い感じにして", "かっこよく", or "make it cool":

1. **Infer theme from content**:
   - Business content → business theme
   - Technical content → tech or dark theme
   - Creative content → gradient or colorful theme
   - General → default theme

2. **Apply best practices automatically**:
   - Shorten titles to 5-7 characters
   - Limit bullet points to 3-5 items
   - Add adequate whitespace
   - Use consistent structure

3. **Enhance visual hierarchy**:
   - Use h3 for sub-sections when appropriate
   - Break up dense text into multiple slides
   - Ensure logical flow (intro → body → conclusion)

4. **Maintain professional tone**:
   - Match formality to content
   - Use parallel structure in lists
   - Keep technical terms consistent

## Image Integration

For slides with images, consult `references/image-patterns.md` for detailed syntax.

Common patterns:
- **Side image**: `![bg right:40%](image.png)` - Image on right, text on left
- **Centered**: `![w:600px](image.png)` - Centered with specific width
- **Full background**: `![bg](image.png)` - Full-screen background
- **Multiple images**: Multiple `![bg]` declarations

Example lecture pattern:
```markdown
## Slide Title

![bg right:40%](diagram.png)

- Explanation point 1
- Explanation point 2
- Explanation point 3
```

## File output

Always save the final Marp **source** (`.md`) under **`presentations.source`** from `.cursor/config.json`, for example:
- `presentation.md`
- `seminar-slides.md`
- `lecture-materials.md`

Put static images next to the deck or under `presentations/assets/` as appropriate.

## Quality Checklist

Before delivering slides, verify:
- [ ] Theme selected appropriately for content
- [ ] CSS theme is embedded in the file
- [ ] Title slide uses `<!-- _class: lead -->`
- [ ] All h2 titles are concise (5-7 chars)
- [ ] Bullet points are 3-5 items per slide
- [ ] Images use proper Marp syntax
- [ ] File saved under `presentations.source` from config
- [ ] User knows how to run Marp CLI into `presentations.output` (pptx/pdf/html), or commands were run for them
- [ ] Content follows best practices

## References

### Core Documentation
- **Marp syntax**: `references/marp-syntax.md` - Basic Marp/Marpit syntax (directives, frontmatter, pagination, etc.)
- **Image patterns**: `references/image-patterns.md` - Official image syntax (bg, filters, split backgrounds)
- **Theme CSS guide**: `references/theme-css-guide.md` - How to create custom themes based on Marpit specification
- **Advanced features**: `references/advanced-features.md` - Math, emoji, fragmented lists, Marp CLI, VS Code
- **Official themes**: `references/official-themes.md` - default, gaia, uncover themes documentation

### Quality & Selection Guides
- **Theme selection**: `references/theme-selection.md` - How to choose the right theme for content
- **Best practices**: `references/best-practices.md` - Quality guidelines for "cool" slides

### Templates & Assets
- **Templates**: `assets/template-*.md` - Starting points with embedded CSS for each theme (7 themes)
- **Standalone CSS**: `assets/theme-*.css` - CSS files for reference (already embedded in templates)

### Official External Links
- **Marp Official Site**: https://marp.app/
- **Marpit Directives**: https://marpit.marp.app/directives
- **Marpit Image Syntax**: https://marpit.marp.app/image-syntax
- **Marpit Theme CSS**: https://marpit.marp.app/theme-css
- **Marp Core GitHub**: https://github.com/marp-team/marp-core
- **Marp CLI GitHub**: https://github.com/marp-team/marp-cli
