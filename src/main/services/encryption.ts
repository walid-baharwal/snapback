import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

/**
 * Per-installation AES-256-GCM encryption for scope blobs.
 *
 * The key is generated on first use and stored alongside the database. The
 * file is created with 0600 permissions. Each encrypted payload is laid out as
 * `[12-byte IV][16-byte auth tag][ciphertext]`.
 */

let key: Buffer | null = null
let keyPath = ''

const ALGO = 'aes-256-gcm'
const IV_LEN = 12
const TAG_LEN = 16

export function initEncryption(storageDir: string): void {
  keyPath = path.join(storageDir, 'enc.key')
  if (fs.existsSync(keyPath)) {
    key = fs.readFileSync(keyPath)
    return
  }
  key = crypto.randomBytes(32)
  fs.writeFileSync(keyPath, key, { mode: 0o600 })
}

export function isEncryptionConfigured(): boolean {
  return key !== null
}

export async function encryptBuffer(data: Uint8Array): Promise<Uint8Array> {
  if (!key) throw new Error('Encryption not initialised')
  const iv = crypto.randomBytes(IV_LEN)
  const cipher = crypto.createCipheriv(ALGO, key, iv)
  const enc = Buffer.concat([cipher.update(Buffer.from(data)), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, tag, enc])
}

export async function decryptBuffer(data: Buffer): Promise<Uint8Array> {
  if (!key) throw new Error('Encryption not initialised')
  if (data.length < IV_LEN + TAG_LEN) throw new Error('Encrypted payload too short')
  const iv = data.subarray(0, IV_LEN)
  const tag = data.subarray(IV_LEN, IV_LEN + TAG_LEN)
  const ciphertext = data.subarray(IV_LEN + TAG_LEN)
  const decipher = crypto.createDecipheriv(ALGO, key, iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(ciphertext), decipher.final()])
}
