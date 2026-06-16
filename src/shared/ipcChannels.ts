/** IPC channel names shared between main and renderer. */
export const Channels = {
  setup: {
    getPreferences: 'setup:getPreferences',
    complete: 'setup:complete',
    updatePreferences: 'setup:updatePreferences'
  },
  daemon: {
    getInfo: 'daemon:getInfo',
    pause: 'daemon:pause',
    resume: 'daemon:resume',
    statusChanged: 'daemon:statusChanged'
  },
  scopes: {
    list: 'scopes:list',
    add: 'scopes:add',
    update: 'scopes:update',
    remove: 'scopes:remove',
    dryRun: 'scopes:dryRun',
    resolved: 'scopes:resolved'
  },
  timeline: {
    day: 'timeline:day',
    days: 'timeline:days'
  },
  files: {
    versions: 'files:versions',
    readVersion: 'files:readVersion',
    current: 'files:current',
    restore: 'files:restore',
    search: 'files:search',
    deleted: 'files:deleted'
  },
  storage: {
    stats: 'storage:stats',
    runPruneNow: 'storage:runPruneNow'
  },
  picker: {
    chooseFolder: 'picker:chooseFolder'
  },
  events: {
    snapshotCreated: 'events:snapshotCreated'
  }
} as const
