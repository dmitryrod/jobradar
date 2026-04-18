import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { ROOT } from './paths.mjs';

/**
 * Порядок (последние перекрывают предыдущие): .env → .env.local
 * Шаблон переменных — .env.example в корне репозитория.
 */
export function loadEnv() {
  const tryLoad = (rel) => {
    const p = path.join(ROOT, rel);
    if (fs.existsSync(p)) dotenv.config({ path: p, override: true });
  };
  tryLoad('.env');
  tryLoad('.env.local');

  const stripQuotes = (v) => {
    if (!v || !/^["']/.test(v)) return v;
    return v.replace(/^["'\s]+|["'\s]+$/g, '');
  };
  if (process.env.GEMINI_API_KEY) {
    process.env.GEMINI_API_KEY = stripQuotes(process.env.GEMINI_API_KEY);
  }
  const orKeys = ['OpenRouter_API_KEY', 'OPENROUTER_API_KEY'];
  for (const name of orKeys) {
    if (process.env[name]) process.env[name] = stripQuotes(process.env[name]);
  }
  const polzaKeys = ['POLZA_API_KEY', 'POLZA_AI_API_KEY'];
  for (const name of polzaKeys) {
    if (process.env[name]) process.env[name] = stripQuotes(process.env[name]);
  }
}
