import fs from 'node:fs'
import path from 'node:path'
import { createBLAKE3 } from 'hash-wasm'
import { encryptBuffer, decryptBuffer, isEncryptionConfigured } from '../services/encryption'

/**
 * Content-addressed blob store. Each blob is stored at
 * `<root>/<aa>/<full-hash>` where `aa` are the first two characters of the
 * hash. Files are deduplicated by content hash.
 */
export class BlobStore {
  private rootDir: string

  constructor(rootDir: string) {
    this.rootDir = rootDir
    fs.mkdirSync(this.rootDir, { recursive: true })
  }

  /** Compute BLAKE3 hash of a Uint8Array. */
  static async hash(data: Uint8Array): Promise<string> {
    const hasher = await createBLAKE3()
    hasher.init()
    hasher.update(data)
    return hasher.digest('hex')
  }

  private pathFor(hash: string): string {
    const prefix = hash.slice(0, 2)
    return path.join(this.rootDir, prefix, hash)
  }

  /** Returns whether a blob with this hash already exists on disk. */
  exists(hash: string): boolean {
    return fs.existsSync(this.pathFor(hash))
  }

  /**
   * Write a blob to disk. Returns true if the blob was newly written, false if
   * it already existed. If `encrypt` is true and encryption is configured the
   * blob is stored encrypted.
   */
  async write(hash: string, data: Uint8Array, encrypt: boolean): Promise<boolean> {
    const filePath = this.pathFor(hash)
    if (fs.existsSync(filePath)) return false
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    const finalData = encrypt && isEncryptionConfigured() ? await encryptBuffer(data) : data
    fs.writeFileSync(filePath, Buffer.from(finalData))
    return true
  }

  /** Read a blob from disk, decrypting if it was stored encrypted. */
  async read(hash: string, encrypted: boolean): Promise<Buffer> {
    const filePath = this.pathFor(hash)
    const data = fs.readFileSync(filePath)
    if (encrypted && isEncryptionConfigured()) {
      const dec = await decryptBuffer(data)
      return Buffer.from(dec)
    }
    return data
  }

  /** Delete a blob from disk. Safe to call on missing blobs. */
  delete(hash: string): void {
    const filePath = this.pathFor(hash)
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
  }

  /** Recursive total size in bytes (best-effort). */
  totalBytes(): number {
    let total = 0
    const walk = (dir: string): void => {
      if (!fs.existsSync(dir)) return
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, entry.name)
        if (entry.isDirectory()) walk(p)
        else {
          try {
            total += fs.statSync(p).size
          } catch {
            // ignore
          }
        }
      }
    }
    walk(this.rootDir)
    return total
  }
}
