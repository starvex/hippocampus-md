/**
 * hippocampus.md - Context Lifecycle Extension
 * 
 * Biologically-inspired memory decay for AI agents.
 * Hooks into Pi/OpenClaw's session_before_compact event.
 * 
 * @see https://hippocampus.md
 * @see https://github.com/starvex/hippocampus-md
 */

// Re-export types for programmatic use
export interface DecayConfig {
  /** Decision messages - slowest decay (λ = 0.03) */
  decision: number;
  /** User intent messages (λ = 0.05) */
  user_intent: number;
  /** Context/background info (λ = 0.12) */
  context: number;
  /** Tool results (λ = 0.2) */
  tool_result: number;
  /** Ephemeral/routine messages - fastest decay (λ = 0.35) */
  ephemeral: number;
}

export interface RetentionConfig {
  /** Below this score → sparse index only (default: 0.25) */
  sparse: number;
  /** Below this score → compress (default: 0.65) */
  compress: number;
}

export interface SparseIndexConfig {
  /** Enable sparse indexing for pattern completion */
  enabled: boolean;
  /** Path to store the index */
  path: string;
}

export interface HippocampusConfig {
  /** Enable/disable the extension */
  enabled: boolean;
  /** Enable debug logging */
  debug: boolean;
  /** Path for debug logs */
  logPath: string;
  /** Decay rates per message type */
  decay: DecayConfig;
  /** Retention thresholds */
  retention: RetentionConfig;
  /** Sparse index settings */
  sparseIndex: SparseIndexConfig;
}

/** Message classification types */
export type MessageType = 
  | 'decision'
  | 'user_intent'
  | 'context'
  | 'tool_result'
  | 'ephemeral';

/** Default decay rates (λ values for exponential decay) */
export const DEFAULT_DECAY: DecayConfig = {
  decision: 0.03,      // Half-life ≈ 23 turns
  user_intent: 0.05,   // Half-life ≈ 14 turns
  context: 0.12,       // Half-life ≈ 6 turns
  tool_result: 0.2,    // Half-life ≈ 3.5 turns
  ephemeral: 0.35,     // Half-life ≈ 2 turns
};

/** Default retention thresholds */
export const DEFAULT_RETENTION: RetentionConfig = {
  sparse: 0.25,
  compress: 0.65,
};

/**
 * Calculate retention score using exponential decay
 * 
 * @param age - Message age in turns
 * @param lambda - Decay rate (higher = faster decay)
 * @param baseImportance - Base importance score (0-1)
 * @returns Retention score (0-1)
 */
export function calculateRetention(
  age: number,
  lambda: number,
  baseImportance: number = 1.0
): number {
  const decayFactor = Math.exp(-lambda * age);
  return baseImportance * decayFactor;
}

/**
 * Get recommended action based on retention score
 */
export function getRetentionAction(
  score: number,
  thresholds: RetentionConfig = DEFAULT_RETENTION
): 'keep' | 'compress' | 'sparse' {
  if (score >= thresholds.compress) return 'keep';
  if (score >= thresholds.sparse) return 'compress';
  return 'sparse';
}
