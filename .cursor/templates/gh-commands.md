# gh: создание PR и issue (кириллица в Windows)

Записывай title и body в файлы UTF-8 — не передавай строкой в аргументах (иначе mojibake в Cursor на Windows).

## gh pr create

1. Запиши title в `.cursor/gh-pr-title.txt`, body в `.cursor/gh-pr-body.txt` (инструмент Write).
2. Выполни:

**PowerShell (Windows):**
```powershell
$title = (Get-Content ".cursor/gh-pr-title.txt" -Raw -Encoding UTF8).Trim()
gh pr create --title $title --body-file ".cursor/gh-pr-body.txt"
```

**Bash (macOS/Linux):**
```bash
gh pr create --title "$(cat .cursor/gh-pr-title.txt)" --body-file ".cursor/gh-pr-body.txt"
```

3. Удали `.cursor/gh-pr-title.txt` и `.cursor/gh-pr-body.txt` после создания.

## gh issue create

1. Запиши title в `.cursor/gh-issue-title.txt`, body в `.cursor/gh-issue-body.txt` (инструмент Write).
2. Выполни:

**PowerShell (Windows):**
```powershell
$title = (Get-Content ".cursor/gh-issue-title.txt" -Raw -Encoding UTF8).Trim()
gh issue create --title $title --body-file ".cursor/gh-issue-body.txt"
```

**Bash (macOS/Linux):**
```bash
gh issue create --title "$(cat .cursor/gh-issue-title.txt)" --body-file ".cursor/gh-issue-body.txt"
```

3. Удали временные файлы после создания.

При необходимости добавь `--repo owner/repo`, `--label`, `--assignee`.
