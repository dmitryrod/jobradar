/**
 * Левый край прямоугольника ширины width, чтобы он целиком попал в [margin, viewportWidth - margin].
 *
 * @param {number} left
 * @param {number} width
 * @param {number} viewportWidth
 * @param {number} [margin=8]
 * @returns {number}
 */
export function clampLeftEdge(left, width, viewportWidth, margin = 8) {
  if (width <= 0) return left;
  const min = margin;
  const max = viewportWidth - margin - width;
  if (max < min) return min;
  return Math.min(Math.max(min, left), max);
}
