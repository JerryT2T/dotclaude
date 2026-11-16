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
  /** Window resets, epoch ms (the rate limit's resetsAt); null when none was reported. */
  fiveHourResetsAt?: number | null
  weeklyResetsAt?: number | null
  /** The measured context: tokens in use and the window they sit in (session.measure); the ring's basis, never a model constant. */
  contextTokens?: number | null
  contextWindow?: number | null
}

/** copies: undecided safety copies (parked ≥ 3 days); optional so a value stored before it still reads. */
export type Hygiene = {
  branches: number
  worktrees: number
  copies?: number
  ageHours: number
  /** Of branches + worktrees: agent worktrees (`.claude/worktrees/agent-*`, `worktree-agent-*`) and broken worktrees; the rest are plain branches. */
  agent?: number
  broken?: number
  /** Landed leftovers hygiene would remove (report `landedLeftovers`): count toward the nudge threshold only. */
  landed?: number
  /** Unlanded or dirty at-risk entries no live session uses, idle >= 1 day (or age unknown): always shown. */
  inactive?: number
  /** Those inactive unmerged entries by cause ("agent worktree", "session worktree", "branch"), for the learn offer. */
  causes?: Record<string, number>
  /** The report's own time (epoch ms) and the repo's path in it. */
  reportAt?: number
  repo?: string
}

/** ~/.claude/devops-cleanup-run.json: one cleanup run per repo machine-wide; other sessions hide the block while it runs. */
export type RunMarker = { repo: string; session: string; startedAt: number; endedAt?: number }

/** ~/.claude/devops-cleanup-history.json: finished runs with the inactive unmerged leftovers each cause held. */
export type CleanupHistory = { runs: Array<{ repo: string; at: number; causes: Record<string, number> }> }

export type ShipView = {
  branch: string
  steps: string[]
  next: string
  pr: { number: number; state: string; pass: number; fail: number; pending: number } | null
  checkedAt: number
}

/**
 * The cleanup run the band's button starts: a plan subagent (reads only), then, on the pane's
 * Apply button, an apply subagent that executes exactly that plan. idle = nothing running.
 */
export type CleanupRun = {
  phase: 'idle' | 'planning' | 'planned' | 'applying' | 'done' | 'failed'
  agentId: string | null
  report: string
  at: number
  /** Inactive unmerged leftovers by cause when the run started (the learn offer's input). */
  causes?: Record<string, number>
  /** The cause a finished run offers `devops learn` for; set once, when the repeat rule holds. */
  learn?: string
  learnRuns?: number
}

/** Once-per-session flags: SessionStart notices toasted, Agents pane opened by itself. */
export type SessionFlags = { noticesShown: boolean; agentsPaneOpened: boolean }

/**
 * Passive Spike 1: when the last main turn ended (epoch ms) and, while a turn that
 * followed a long pause runs, its id and the pause length; null = nothing armed.
 */
export type SpikeWatch = { lastMainEnd: number; armed: { turnId: string; gapMs: number } | null }

/** One button of the completion card: its label and the prompt it sends. */
export type CardButton = { label: string; prompt: string; primary: boolean }

/**
 * The completion card's template part as the card tool rendered it (never the
 * `answer`, which stays inline in the transcript): title, time, decision
 * heading, open points and buttons. Copied from the tool's result, not rebuilt.
 */
export type CardView = {
  title: string
  at: string
  heading: string
  points: string[]
  buttons: CardButton[]
}

/** One step of the turn's task list (update_plan / TodoWrite), as the tool call set it. */
export type PlanStep = { text: string; status: 'pending' | 'in_progress' | 'completed' }

/** What the main turn is doing: its task list and the tool call running now. */
export type Progress = { steps: PlanStep[]; activity: string; startedAt: number }

/** The newest observed benefit in the savings log: a search that came back narrower, or text the local model wrote. */
export type LastBenefit = { kind: 'narrowed' | 'delegated'; tokens: number; at: number }

/**
 * ~/.claude/devops-savings.jsonl, netted. `net7` (blocked minus released, last 7 days) is an estimate;
 * `narrowed` rows are measured upper bounds over the whole log, `since` its first row (epoch ms).
 */
export type Benefit = {
  net7: number
  blocks7: number
  released7: number
  narrowed: number
  narrowedTokens: number
  since: number | null
  last: LastBenefit | null
}

/** The hook-telemetry rollup of the last 7 days: the hooks' own output in tokens (chars ÷ 4) and guard blocks. */
export type Overhead = { ownTokens7: number; guardBlocks7: number }

/**
 * Whether the plugin's hooks run and its MCP server is connected. `misses` = tool calls in a row without a
 * fresh hook record; they only count once `proven` (a fresh record was seen in this session), so a machine
 * whose hook telemetry is switched off never reads as "hooks not running".
 */
export type Health = { hooks: boolean; mcp: boolean; misses: number; proven?: boolean }

/** The last benefit as it went on screen (`shownAt`); it leaves again after 90 s. */
export type Echo = LastBenefit & { shownAt: number }

/** The benefit line's state: the newest log event already accounted for, and the one on screen. */
export type EchoState = { seenAt: number; last: Echo | null }

/** Everything the info card shows, read from the local logs once when it opens. */
export type InfoData = {
  benefit: Benefit
  overhead: Overhead | null
  api: { usd7: number; runs7: number } | null
  ships: { branches7: number; reused7: number } | null
  version: string
  at: number
}

/** The info card under the status element: open or not, and what it read when it opened. */
export type InfoState = { open: boolean; data: InfoData | null }

declare module 'claude-code' {
  interface PluginState {
    devops: {
      agents: AgentRow[]
      budget: Budget | null
      hygiene: Hygiene | null
      ship: ShipView | null
      shells: Record<string, number>
      /** tool_use_ids of background Bash runs that are devops concept watchers (waker, pulser, bridge). */
      watchers: Record<string, true>
      cleanup: CleanupRun
      flags: SessionFlags
      /** Bumped every few seconds while a subagent runs, so the Agents pane redraws its elapsed times. */
      tick: number
      spike: SpikeWatch
      card: CardView | null
      progress: Progress
      /** The band's cleanup block expanded (per session). */
      fold: boolean
      /** A ship / released / finished card is on record: no open work until a new edit or an open plan. */
      settled: boolean
      /** The hint card's points are expanded behind its `?` (per session). */
      hintsOpen: boolean
      /** The last card's title and time, kept after the card is spent (the idle row's "Last:"). */
      lastCard: { title: string; at: string } | null
      /** Hooks running and MCP server connected: the status element's green or red dot. */
      health: Health
      /** The last benefit shown next to the status element. */
      echo: EchoState
      /** The info card a press on the status element opens. */
      info: InfoState
    }
  }
}
