import type Database from 'better-sqlite3'
import type { Scope, ScopeRules, ScopeType } from '@shared/types'

export class ScopesRepo {
  constructor(private db: Database.Database) {}

  list(): Scope[] {
    const rows = this.db
      .prepare(
        `SELECT id, type, path_or_pattern as pathOrPattern, parent_id as parentId,
                rules_json as rulesJson, enabled, name FROM scopes ORDER BY id ASC`
      )
      .all() as Array<{
      id: number
      type: ScopeType
      pathOrPattern: string
      parentId: number | null
      rulesJson: string
      enabled: number
      name: string
    }>
    return rows.map((r) => ({
      id: r.id,
      type: r.type,
      pathOrPattern: r.pathOrPattern,
      parentId: r.parentId,
      rules: JSON.parse(r.rulesJson) as ScopeRules,
      enabled: !!r.enabled,
      name: r.name
    }))
  }

  add(
    type: ScopeType,
    pathOrPattern: string,
    rules: ScopeRules,
    parentId: number | null,
    name: string
  ): Scope {
    const info = this.db
      .prepare(
        `INSERT INTO scopes (type, path_or_pattern, parent_id, rules_json, enabled, name)
         VALUES (?, ?, ?, ?, 1, ?)`
      )
      .run(type, pathOrPattern, parentId, JSON.stringify(rules), name)
    return {
      id: Number(info.lastInsertRowid),
      type,
      pathOrPattern,
      parentId,
      rules,
      enabled: true,
      name
    }
  }

  update(id: number, rules: ScopeRules, name?: string): Scope | null {
    if (name !== undefined) {
      this.db
        .prepare('UPDATE scopes SET rules_json = ?, name = ? WHERE id = ?')
        .run(JSON.stringify(rules), name, id)
    } else {
      this.db.prepare('UPDATE scopes SET rules_json = ? WHERE id = ?').run(JSON.stringify(rules), id)
    }
    return this.get(id)
  }

  setEnabled(id: number, enabled: boolean): void {
    this.db.prepare('UPDATE scopes SET enabled = ? WHERE id = ?').run(enabled ? 1 : 0, id)
  }

  remove(id: number): void {
    this.db.prepare('DELETE FROM scopes WHERE id = ?').run(id)
  }

  get(id: number): Scope | null {
    const list = this.list().filter((s) => s.id === id)
    return list[0] ?? null
  }

  /** The single global scope; created on first call if missing. */
  ensureGlobal(defaultRules: ScopeRules): Scope {
    const existing = this.list().find((s) => s.type === 'global')
    if (existing) return existing
    return this.add('global', '*', defaultRules, null, 'Global defaults')
  }
}
