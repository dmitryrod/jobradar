/**
 * Подготовка окружения на чистом клоне: .env, сопроводительное письмо, каталоги data/.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

function copyIfMissing(srcRel, destRel) {
  const src = path.join(ROOT, srcRel);
  const dest = path.join(ROOT, destRel);
  if (fs.existsSync(dest)) return false;
  if (!fs.existsSync(src)) {
    console.warn(`Пропуск: нет шаблона ${srcRel}`);
    return false;
  }
  fs.copyFileSync(src, dest);
  console.log(`Создан ${destRel} из ${srcRel}`);
  return true;
}

function ensureDir(rel) {
  const p = path.join(ROOT, rel);
  fs.mkdirSync(p, { recursive: true });
}

copyIfMissing('.env.example', '.env');
copyIfMissing('config/cover-letter.example.txt', 'config/cover-letter.txt');
ensureDir('data');
ensureDir('data/session');
ensureDir('CV');

console.log('Bootstrap готов. Отредактируйте .env и config/cover-letter.txt при необходимости.');
