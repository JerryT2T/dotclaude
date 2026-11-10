// State of the devops mods (hooks/mods/index.tsx, feature `claude-mods`, alpha).
// Display only: every value is copied from an engine event or a file the
// plugin's scripts already write.

export type AgentRow = {
  id: string
  type: string
  description: string
  model: string
  startedAt: number
  endedAt?: number
  status: string
}

export type Budget = {
  fiveHour: number | null
  weekly: number | null
  context: number | null
}

export type Hygiene = { branches: number; worktrees: number; ageHours: number }

export type ShipView = {
  branch: string
  steps: string[]
  next: string
  pr: { number: number; state: string; pass: number; fail: number; pending: number } | null
  checkedAt: number
}

declare module 'claude-code' {
  interface PluginState {
    devops: {
      agents: AgentRow[]
      budget: Budget | null
      hygiene: Hygiene | null
      ship: ShipView | null
    }
  }
}
