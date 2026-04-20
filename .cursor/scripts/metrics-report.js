/**
 * Документированная точка входа: `node .cursor/scripts/metrics-report.js`
 * Реализация — metrics-report.cjs (CJS: корневой package.json с "type":"module").
 */
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
require('./metrics-report.cjs');
