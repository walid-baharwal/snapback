/**
 * Compute basic text statistics. Returns zeroes for binary buffers.
 * Binary detection is a simple null-byte heuristic over the first 8 KB.
 */
export function isLikelyBinary(buf: Buffer): boolean {
  const sample = buf.subarray(0, Math.min(buf.length, 8192))
  for (let i = 0; i < sample.length; i++) {
    if (sample[i] === 0) return true
  }
  return false
}

export interface TextStats {
  lines: number
  words: number
  chars: number
}

export function computeTextStats(buf: Buffer, isBinary: boolean): TextStats {
  if (isBinary || buf.length === 0) return { lines: 0, words: 0, chars: 0 }
  const text = buf.toString('utf8')
  const chars = text.length
  const lines = text.length === 0 ? 0 : text.split(/\r\n|\r|\n/).length
  const trimmed = text.trim()
  const words = trimmed.length === 0 ? 0 : trimmed.split(/\s+/).length
  return { lines, words, chars }
}
