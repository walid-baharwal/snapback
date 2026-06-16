import type { ScopePreset, ScopeRules } from './types'

const CODE_EXTENSIONS = [
  'ts',
  'tsx',
  'js',
  'jsx',
  'mjs',
  'cjs',
  'json',
  'yaml',
  'yml',
  'toml',
  'py',
  'rb',
  'go',
  'rs',
  'java',
  'kt',
  'kts',
  'swift',
  'c',
  'h',
  'cpp',
  'hpp',
  'cc',
  'cs',
  'php',
  'lua',
  'sh',
  'bash',
  'zsh',
  'fish',
  'sql',
  'html',
  'css',
  'scss',
  'less',
  'vue',
  'svelte',
  'astro',
  'md',
  'mdx'
]

const DOC_EXTENSIONS = [
  'md',
  'mdx',
  'txt',
  'rtf',
  'tex',
  'org',
  'rst',
  'docx',
  'odt',
  'csv',
  'json',
  'yaml',
  'yml'
]

const COMMON_EXCLUDES = [
  '**/node_modules/**',
  '**/.git/**',
  '**/.svn/**',
  '**/.hg/**',
  '**/dist/**',
  '**/build/**',
  '**/out/**',
  '**/.next/**',
  '**/.nuxt/**',
  '**/.cache/**',
  '**/.parcel-cache/**',
  '**/.vite/**',
  '**/.turbo/**',
  '**/target/**',
  '**/__pycache__/**',
  '**/*.pyc',
  '**/venv/**',
  '**/.venv/**',
  '**/Library/Caches/**',
  '**/AppData/Local/**',
  '**/.Trash/**',
  '**/Trash/**',
  '**/.DS_Store',
  '**/Thumbs.db',
  '**/desktop.ini'
]

const SECRET_PATTERNS = [
  '**/.env',
  '**/.env.*',
  '**/*.pem',
  '**/*.key',
  '**/*.p12',
  '**/*.pfx',
  '**/id_rsa',
  '**/id_ed25519',
  '**/id_ecdsa',
  '**/*_rsa',
  '**/credentials',
  '**/credentials.json',
  '**/secrets.json',
  '**/.aws/credentials',
  '**/.ssh/**'
]

export function getSecretPatterns(): string[] {
  return [...SECRET_PATTERNS]
}

export function getCommonExcludes(): string[] {
  return [...COMMON_EXCLUDES]
}

function includesFor(preset: ScopePreset): string[] {
  switch (preset) {
    case 'code':
      return [`**/*.{${CODE_EXTENSIONS.join(',')}}`]
    case 'documents':
      return [`**/*.{${DOC_EXTENSIONS.join(',')}}`]
    case 'everything':
      return ['**/*']
  }
}

export function presetRules(preset: ScopePreset): ScopeRules {
  return {
    filters: {
      captureMode: preset === 'documents' ? 'docs' : preset === 'code' ? 'code' : 'everything',
      includeGlobs: includesFor(preset),
      excludeGlobs: [...COMMON_EXCLUDES],
      respectGitignore: preset === 'code',
      skipBinaries: true,
      excludeSecrets: true,
      maxFileSizeBytes: 10 * 1024 * 1024
    },
    triggers: {
      debounceMs: 3000,
      onAnyChange: true
    },
    retention: {
      keepAllDays: 7,
      hourlyDays: 14,
      dailyDays: 30,
      weeklyDays: 90,
      maxAgeDays: 180,
      maxBytes: 2 * 1024 * 1024 * 1024,
      maxVersionsPerFile: 0
    },
    security: {
      encrypt: false
    }
  }
}

export function defaultGlobalRules(): ScopeRules {
  const base = presetRules('everything')
  base.filters.maxFileSizeBytes = 5 * 1024 * 1024
  return base
}

/**
 * Extra excludes layered on top of `presetRules('everything')` for the
 * "whole machine" mode. Skips every dotfile/dotfolder plus OS-specific
 * system locations that are huge and/or churn constantly. Users can still
 * track a specific path (e.g. ~/.bashrc) by adding it as its own scope.
 */
export function wholeMachineExtraExcludes(platform: NodeJS.Platform): string[] {
  const dotfiles = ['**/.*', '**/.*/**']
  if (platform === 'darwin') {
    return [
      ...dotfiles,
      '**/Library/**',
      '**/.Spotlight-V100/**',
      '**/.fseventsd/**',
      '**/.DocumentRevisions-V100/**',
      '**/.TemporaryItems/**',
      '**/.Trashes/**',
      '**/Network Trash Folder/**',
      '**/Temporary Items/**',
      '**/.AppleDouble/**',
      '**/.AppleDB/**',
      '**/.AppleDesktop/**',
      '**/.DS_Store',
      '**/.localized'
    ]
  }
  if (platform === 'win32') {
    return [
      ...dotfiles,
      '**/AppData/**',
      '**/Application Data/**',
      '**/Local Settings/**',
      '**/NTUSER.DAT*',
      '**/ntuser.*',
      '**/desktop.ini',
      '**/$Recycle.Bin/**',
      '**/$RECYCLE.BIN/**',
      '**/System Volume Information/**',
      '**/Thumbs.db',
      '**/ehthumbs.db',
      '**/Recent/**',
      '**/SendTo/**',
      '**/Cookies/**',
      '**/PrintHood/**',
      '**/NetHood/**'
    ]
  }
  return dotfiles
}

export function mergeRules(parent: ScopeRules, child: Partial<ScopeRules>): ScopeRules {
  return {
    filters: { ...parent.filters, ...(child.filters ?? {}) },
    triggers: { ...parent.triggers, ...(child.triggers ?? {}) },
    retention: { ...parent.retention, ...(child.retention ?? {}) },
    security: { ...parent.security, ...(child.security ?? {}) }
  }
}
