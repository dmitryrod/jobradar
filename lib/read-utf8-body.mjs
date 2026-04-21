/**
 * Чтение тела HTTP-запроса в UTF-8 без порчи многобайтовых символов.
 *
 * Важно: нельзя делать `data += chunk`, если chunk — Buffer: каждый chunk
 * декодируется в UTF-8 отдельно, и символ, разрезанный между chunk'ами,
 * превращается в U+FFFD (�).
 */

/**
 * @param {Buffer[]} chunks
 * @returns {string}
 */
export function buffersToUtf8String(chunks) {
  if (!chunks.length) return '';
  return Buffer.concat(chunks).toString('utf8');
}

/**
 * @param {import('http').IncomingMessage} req
 * @param {{ maxBytes?: number }} [opts]
 * @returns {Promise<string>}
 */
export function readUtf8Body(req, opts = {}) {
  const maxBytes = opts.maxBytes ?? 2_000_000;
  return new Promise((resolve, reject) => {
    /** @type {Buffer[]} */
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      const buf = Buffer.isBuffer(c) ? c : Buffer.from(c);
      size += buf.length;
      if (size > maxBytes) reject(new Error('body too large'));
      chunks.push(buf);
    });
    req.on('end', () => resolve(buffersToUtf8String(chunks)));
    req.on('error', reject);
  });
}
