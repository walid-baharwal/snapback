import path from 'node:path'
import fs from 'node:fs'
import micromatch from 'micromatch'
import ignore, { type Ignore } from 'ignore'
import { defaultGlobalRules, getSecretPatterns, mergeRules } from '@shared/defaults'
import type { Scope, ScopeRules } from '@shared/types'

/**
 * Rules engine. Resolves rules for a given absolute path by cascading:
 *   global -> matching folder scopes (most specific path wins) -> glob scopes.
 *
 * Also evaluates filter rules to decide whether a given path is allowed.
 */
export class RulesEngine {
  private scopes: Scope[] = []
  private gitignoreCache = new Map<string, Ignore>()
  private secretPatterns = getSecretPatterns()

  setScopes(scopes: Scope[]): void {
    this.scopes = scopes
    this.gitignoreCache.clear()
  }

  /**
   * Returns the matching folder scope (most specific wins), if any. A folder
   * scope matches when the file path is the scope path or a descendant.
   */
  matchingFolderScope(absPath: string): Scope | null {
    const candidates = this.scopes.filter(
      (s) => s.enabled && s.type === 'folder' && isSubPath(s.pathOrPattern, absPath)
    )
    if (candidates.length === 0) return null
    candidates.sort((a, b) => b.pathOrPattern.length - a.pathOrPattern.length)
    return candidates[0]
  }

  matchingGlobScopes(absPath: string): Scope[] {
    return this.scopes.filter(
      (s) => s.enabled && s.type === 'glob' && micromatch.isMatch(absPath, s.pathOrPattern, { dot: true })
    )
  }

  /** Resolve final rules for an absolute path. Returns null if no global scope. */
  resolve(absPath: string): { rules: ScopeRules; scope: Scope | null } | null {
    const global = this.scopes.find((s) => s.enabled && s.type === 'global')
    let merged: ScopeRules = global ? global.rules : defaultGlobalRules()
    let activeScope: Scope | null = global ?? null

    const folder = this.matchingFolderScope(absPath)
    if (folder) {
      merged = mergeRules(merged, folder.rules)
      activeScope = folder
    }
    for (const glob of this.matchingGlobScopes(absPath)) {
      merged = mergeRules(merged, glob.rules)
      activeScope = glob
    }
    return { rules: merged, scope: activeScope }
  }

  /**
   * Determine if a path is allowed to be captured given resolved rules.
   * Performs include/exclude glob, secret pattern, file size, and gitignore checks.
   * Binary detection is deferred to the capture step (needs file contents).
   */
  isAllowed(absPath: string, rules: ScopeRules, folderScopePath?: string): boolean {
    if (containsHardSkipSegment(absPath)) return false
    if (rules.filters.excludeSecrets && micromatch.isMatch(absPath, this.secretPatterns, { dot: true })) {
      return false
    }
    if (rules.filters.excludeGlobs.length > 0 && micromatch.isMatch(absPath, rules.filters.excludeGlobs, { dot: true })) {
      return false
    }
    if (
      rules.filters.includeGlobs.length > 0 &&
      !micromatch.isMatch(absPath, rules.filters.includeGlobs, { dot: true })
    ) {
      return false
    }
    if (rules.filters.respectGitignore && folderScopePath) {
      const ig = this.loadGitignore(folderScopePath)
      const rel = path.relative(folderScopePath, absPath)
      if (rel && !rel.startsWith('..') && ig.ignores(rel)) return false
    }
    try {
      const stat = fs.statSync(absPath)
      if (stat.isDirectory()) return false
      if (rules.filters.maxFileSizeBytes > 0 && stat.size > rules.filters.maxFileSizeBytes) {
        return false
      }
    } catch {
      // The file may not exist (deletion event) — let the caller decide.
    }
    return true
  }

  private loadGitignore(rootDir: string): Ignore {
    const cached = this.gitignoreCache.get(rootDir)
    if (cached) return cached
    const ig = ignore()
    const giPath = path.join(rootDir, '.gitignore')
    if (fs.existsSync(giPath)) {
      try {
        ig.add(fs.readFileSync(giPath, 'utf8'))
      } catch {
        // ignore
      }
    }
    this.gitignoreCache.set(rootDir, ig)
    return ig
  }
}

function isSubPath(parent: string, child: string): boolean {
  const rel = path.relative(parent, child)
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))
}

const HARD_SKIP_SEGMENTS = new Set<string>([
  // Cross-platform / VCS / build / package managers
  '.git',
  '.svn',
  '.hg',
  'node_modules',
  '.next',
  '.nuxt',
  '.cache',
  '.parcel-cache',
  '.vite',
  '.turbo',
  '.gradle',
  '.idea',
  '.vscode-server',
  'dist',
  'build',
  'out',
  'target',
  '__pycache__',
  'venv',
  '.venv',
  '.tox',
  '.mypy_cache',
  '.pytest_cache',
  '.npm',
  '.nvm',
  '.yarn',
  '.pnpm-store',
  '.cargo',
  '.rustup',
  // Linux user
  '.local',
  '.config',
  '.mozilla',
  '.electron',
  '.Trash',
  'Trash',
  'snap',
  '.snap',
  '.snapshots',
  // macOS
  'Library',
  '.Spotlight-V100',
  '.fseventsd',
  '.Trashes',
  '.DocumentRevisions-V100',
  '.TemporaryItems',
  'Network Trash Folder',
  'Temporary Items',
  '.AppleDouble',
  '.AppleDB',
  '.AppleDesktop',
  // Windows
  'AppData',
  'Application Data',
  'Local Settings',
  '$Recycle.Bin',
  '$RECYCLE.BIN',
  'System Volume Information',
  'Recent',
  'SendTo',
  'Cookies',
  'PrintHood',
  'NetHood'
])

function containsHardSkipSegment(absPath: string): boolean {
  const parts = absPath.split(/[\\/]/)
  for (const part of parts) {
    if (HARD_SKIP_SEGMENTS.has(part)) return true
  }
  return false
}
