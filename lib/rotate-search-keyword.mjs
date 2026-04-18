import fs from 'fs';
import path from 'path';

/**
 * Переносит первую непустую строку поискового запроса (как в loadSearchKeywords: # — комментарий)
 * в конец файла. Атомарно через временный файл.
 *
 * @param {string} filePath
 * @returns {{ ok: boolean, reason?: string }}
 */
export function rotateSearchKeywordFirstToEnd(filePath) {
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) {
    return { ok: false, reason: 'file not found' };
  }
  const raw = fs.readFileSync(resolved, 'utf8');
  const hadTrailingNl = raw.endsWith('\n');
  const lines = raw.split('\n');
  if (hadTrailingNl && lines.length && lines[lines.length - 1] === '') {
    lines.pop();
  }
  let moveIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const hash = line.indexOf('#');
    const part = (hash === -1 ? line : line.slice(0, hash)).trim();
    if (part) {
      moveIdx = i;
      break;
    }
  }
  if (moveIdx === -1) {
    return { ok: false, reason: 'no keyword line' };
  }
  const moved = lines[moveIdx];
  const rest = lines.filter((_, i) => i !== moveIdx);
  const newContent = [...rest, moved].join('\n') + (hadTrailingNl ? '\n' : '');
  const dir = path.dirname(resolved);
  const base = path.basename(resolved);
  const tmp = path.join(dir, `.${base}.${process.pid}.${Date.now()}.tmp`);
  fs.writeFileSync(tmp, newContent, 'utf8');
  try {
    fs.renameSync(tmp, resolved);
  } catch {
    try {
      fs.copyFileSync(tmp, resolved);
    } finally {
      try {
        fs.unlinkSync(tmp);
      } catch {
        /* ignore */
      }
    }
  }
  return { ok: true };
}
