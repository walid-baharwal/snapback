import fs from 'node:fs'
import path from 'node:path'
import { presetRules } from '@shared/defaults'
import type { DryRunEstimate, ScopePreset } from '@shared/types'
import { RulesEngine } from './rulesEngine'

const MAX_SCAN_FILES = 5000

/**
 * Walks a folder and counts how many files would be captured under a preset.
 * Heuristic: assumes each matched file generates ~3 snapshots/week to estimate
 * weekly storage.
 */
export async function dryRun(rootPath: string, preset: ScopePreset): Promise<DryRunEstimate> {
  const rules = presetRules(preset)
  const engine = new RulesEngine()
  engine.setScopes([
    {
      id: -1,
      type: 'folder',
      pathOrPattern: rootPath,
      parentId: null,
      enabled: true,
      name: 'dryrun',
      rules
    }
  ])

  let matched = 0
  let totalSize = 0
  let scanned = 0
  const stack = [rootPath]

  while (stack.length > 0 && scanned < MAX_SCAN_FILES) {
    const dir = stack.pop()!
    let entries: fs.Dirent[] = []
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      continue
    }
    for (const e of entries) {
      if (scanned >= MAX_SCAN_FILES) break
      const full = path.join(dir, e.name)
      if (e.isDirectory()) {
        if (e.name === 'node_modules' || e.name === '.git') continue
        stack.push(full)
      } else if (e.isFile()) {
        scanned++
        if (engine.isAllowed(full, rules, rootPath)) {
          matched++
          try {
            const st = fs.statSync(full)
            totalSize += Math.min(st.size, rules.filters.maxFileSizeBytes)
          } catch {
            // ignore
          }
        }
      }
    }
  }
  const estimatedBytesPerWeek = Math.round(totalSize * 0.3)
  return { matchedFiles: matched, estimatedBytesPerWeek, scannedFiles: scanned }
}
