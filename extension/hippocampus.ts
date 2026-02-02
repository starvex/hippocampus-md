/**
 * hippocampus.md — Context Lifecycle Extension for Pi/OpenClaw
 * 
 * @version 0.1.0
 * @license MIT
 * @authors Roman Godz, R2D2
 * 
 * Replaces default compaction with decay-based context lifecycle management.
 * Inspired by hippocampal memory systems: sparse indexing, importance scoring,
 * exponential decay, and pattern completion.
 * 
 * Part of the Agent Brain Architecture:
 * - defrag.md — Sleep-inspired memory consolidation
 * - synapse.md — Multi-agent memory sharing
 * - hippocampus.md — Context lifecycle management (this)
 * - neocortex.md — Long-term memory format
 * 
 * @see https://hippocampus.md
 * @see https://github.com/starvex/hippocampus-md
 * 
 * Installation:
 *   Place in <workspace>/.pi/extensions/hippocampus.ts
 *   Or globally: ~/.pi/extensions/hippocampus.ts
 * 
 * Configuration:
 *   Create hippocampus.config.json in your workspace root (optional)
 */

import type { ExtensionAPI, CompactionEvent, ExtensionContext, CompactionResult } from "@mariozechner/pi-coding-agent";
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/** Message classification types based on role and content */
type EntryType = 
  | "tool_result"   // Output from tool calls — decays fast
  | "decision"      // Agent decisions and plans — persists long
  | "user_intent"   // User goals and requests — persists long
  | "ephemeral"     // Heartbeats, status checks — decays very fast
  | "context"       // General conversation — standard decay
  | "unknown";      // Unclassified — moderate decay

/** Configuration schema for hippocampus behavior */
interface HippocampusConfig {
  /** Per-type exponential decay rates (λ). Lower = remembers longer. */
  decayRates: Record<EntryType, number>;
  
  /** Retention threshold for sparse index (pointer only). Default: 0.25 */
  sparseThreshold: number;
  
  /** Retention threshold for compression. Default: 0.65 */
  compressThreshold: number;
  
  /** Minimum retention floor per type (anchors important types) */
  retentionFloor: Partial<Record<EntryType, number>>;
  
  /** Maximum tokens allocated for sparse index section */
  maxSparseIndexTokens: number;
  
  /** Enable debug logging */
  debug: boolean;
  
  /** Log file path (relative to workspace or absolute) */
  logFile: string;
}

/** Scored message entry with retention calculation */
interface ScoredEntry {
  /** Original index in message array */
  index: number;
  /** Classified type */
  type: EntryType;
  /** Base importance score (0.0-1.0) */
  importance: number;
  /** Retention after decay (0.0-1.0) */
  retention: number;
  /** Estimated token count */
  tokenEstimate: number;
  /** Generated summary line for sparse index */
  summary: string;
  /** Original message role */
  role: string;
  /** Truncated content preview */
  contentPreview: string;
}

/** Message structure from Pi compaction event */
interface CompactionMessage {
  role?: string;
  content?: string | ContentBlock[];
  toolCalls?: unknown[];
  tool_calls?: unknown[];
  toolName?: string;
  name?: string;
  tool_call_id?: string;
}

/** Content block types */
interface ContentBlock {
  type?: string;
  text?: string;
  name?: string;
  tool_use_id?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// DEFAULT CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════

const DEFAULT_CONFIG: HippocampusConfig = {
  decayRates: {
    decision:    0.03,   // Decisions persist ~30× longer than tool_results
    user_intent: 0.05,   // User goals persist ~20× longer
    context:     0.12,   // General context — standard decay
    tool_result: 0.20,   // Tool outputs decay fast (often large, rarely reused)
    ephemeral:   0.35,   // Heartbeats/status — decay very fast
    unknown:     0.15,   // Unknown — moderate decay
  },
  sparseThreshold: 0.25,
  compressThreshold: 0.65,
  retentionFloor: {
    decision:    0.50,   // Decisions never drop below 0.50
    user_intent: 0.35,   // User goals never drop below 0.35
  },
  maxSparseIndexTokens: 2500,
  debug: false,
  logFile: ".pi/hippocampus.log",
};

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIGURATION LOADER
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Load configuration from workspace or use defaults.
 * Looks for hippocampus.config.json in workspace root.
 */
function loadConfig(workspaceDir: string): HippocampusConfig {
  const configPath = join(workspaceDir, "hippocampus.config.json");
  
  if (existsSync(configPath)) {
    try {
      const raw = readFileSync(configPath, "utf-8");
      const userConfig = JSON.parse(raw) as Partial<HippocampusConfig>;
      return {
        ...DEFAULT_CONFIG,
        ...userConfig,
        decayRates: { ...DEFAULT_CONFIG.decayRates, ...userConfig.decayRates },
        retentionFloor: { ...DEFAULT_CONFIG.retentionFloor, ...userConfig.retentionFloor },
      };
    } catch (err) {
      console.warn(`[hippocampus] Failed to load config from ${configPath}:`, err);
    }
  }
  
  return DEFAULT_CONFIG;
}

// ═══════════════════════════════════════════════════════════════════════════════
// MESSAGE CLASSIFICATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Extract text content from a message, handling various formats.
 */
function extractContent(msg: CompactionMessage): string {
  if (typeof msg.content === "string") return msg.content;
  if (Array.isArray(msg.content)) {
    return msg.content
      .map((block) => block.text || "")
      .filter(Boolean)
      .join(" ");
  }
  return "";
}

/**
 * Classify a message by its type for decay rate assignment.
 * 
 * Classification priority:
 * 1. Tool results (role-based)
 * 2. Ephemeral content (heartbeats, status)
 * 3. User intent (user messages)
 * 4. Decisions (assistant messages with decision markers)
 * 5. Context (everything else)
 */
function classifyMessage(msg: CompactionMessage): EntryType {
  const role = msg.role || "";
  const content = extractContent(msg).toLowerCase();

  // Tool results are always tool_result type
  if (role === "tool" || role === "toolResult") {
    return "tool_result";
  }

  // User messages
  if (role === "user") {
    // Check for ephemeral patterns
    if (
      content.includes("heartbeat") ||
      content === "heartbeat_ok" ||
      content.includes("/status") ||
      content.includes("no_reply")
    ) {
      return "ephemeral";
    }
    return "user_intent";
  }

  // Assistant messages
  if (role === "assistant") {
    // Short responses are often ephemeral
    if (content.length < 50 && (content.includes("no_reply") || content.includes("ok"))) {
      return "ephemeral";
    }
    
    // Decision markers
    const decisionMarkers = [
      "decision", "decided", "will do", "plan", "approach", "strategy",
      "решил", "план", "буду", "сделаю", "подход"
    ];
    if (decisionMarkers.some(marker => content.includes(marker))) {
      return "decision";
    }
    
    // Check for tool calls (assistant requesting tools)
    if (
      msg.toolCalls ||
      msg.tool_calls ||
      (Array.isArray(msg.content) && msg.content.some((c) => c.type === "tool_use"))
    ) {
      return "context";
    }
    
    return "context";
  }

  return "unknown";
}

// ═══════════════════════════════════════════════════════════════════════════════
// IMPORTANCE SCORING
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Base importance score by message type.
 * Higher = more important = retained longer.
 */
function getBaseImportance(type: EntryType): number {
  const scores: Record<EntryType, number> = {
    decision:    0.90,
    user_intent: 0.80,
    context:     0.50,
    tool_result: 0.30,
    ephemeral:   0.10,
    unknown:     0.40,
  };
  return scores[type];
}

/**
 * Estimate token count from message content.
 * Uses rough 4 chars per token approximation.
 */
function estimateTokens(msg: CompactionMessage): number {
  const content = extractContent(msg);
  const jsonFallback = JSON.stringify(msg.content || "");
  const text = content || jsonFallback;
  return Math.ceil(text.length / 4);
}

/**
 * Extract a preview of message content for summaries.
 */
function extractPreview(msg: CompactionMessage, maxLen = 120): string {
  const content = extractContent(msg);
  if (content.length <= maxLen) return content;
  return content.slice(0, maxLen) + "…";
}

/**
 * Extract tool name from various message formats.
 */
function extractToolName(msg: CompactionMessage): string {
  if (msg.toolName) return msg.toolName;
  if (msg.name) return msg.name;
  if (msg.tool_call_id) return msg.tool_call_id;
  
  if (Array.isArray(msg.content)) {
    for (const block of msg.content) {
      if (block.type === "tool_use" && block.name) return block.name;
      if (block.type === "tool_result" && block.tool_use_id) return block.tool_use_id;
    }
  }
  
  return "unknown_tool";
}

// ═══════════════════════════════════════════════════════════════════════════════
// DECAY FUNCTION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Calculate retention score after exponential decay.
 * 
 * Formula: retention = max(floor, importance × e^(-λ × age))
 * 
 * @param importance - Base importance score (0.0-1.0)
 * @param age - Position from end (0 = newest, N = oldest)
 * @param type - Entry type for per-type decay rate
 * @param config - Configuration object
 * @returns Retention score (0.0-1.0)
 */
function calculateRetention(
  importance: number,
  age: number,
  type: EntryType,
  config: HippocampusConfig
): number {
  const lambda = config.decayRates[type];
  const floor = config.retentionFloor[type] ?? 0;
  const raw = importance * Math.exp(-lambda * age);
  return Math.max(floor, raw);
}

// ═══════════════════════════════════════════════════════════════════════════════
// SPARSE INDEX BUILDER
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Build a sparse index line for a message.
 * Format varies by type for optimal information density.
 */
function buildSparseIndexLine(entry: ScoredEntry, msg: CompactionMessage): string {
  const preview = entry.contentPreview;
  
  switch (entry.type) {
    case "tool_result": {
      const toolName = extractToolName(msg);
      return `[TOOL:${toolName}] ${entry.tokenEstimate}tok → "${preview.slice(0, 80)}"`;
    }
    case "user_intent":
      return `[USER] "${preview.slice(0, 100)}"`;
    case "decision":
      return `[DECISION] "${preview.slice(0, 100)}"`;
    case "ephemeral":
      return `[EPHEMERAL] ${preview.slice(0, 40)}`;
    default:
      return `[${entry.role.toUpperCase()}] ${preview.slice(0, 80)}`;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// MESSAGE SCORING
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Score all messages with importance and decay calculations.
 * 
 * Applies modifiers:
 * - Recency bonus: Last 5 entries get +0.15
 * - Size penalty: Very large messages get -0.15 to -0.25
 * - Reference bonus: Messages referenced later get +0.20
 */
function scoreMessages(
  messages: CompactionMessage[],
  config: HippocampusConfig
): ScoredEntry[] {
  const total = messages.length;
  const scored: ScoredEntry[] = [];

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    const type = classifyMessage(msg);
    let importance = getBaseImportance(type);
    const age = total - 1 - i; // 0 = newest
    const tokenEstimate = estimateTokens(msg);

    // ── Modifiers ──

    // Recency bonus: last 5 entries get +0.15
    if (age < 5) {
      importance = Math.min(1.0, importance + 0.15);
    }

    // Size penalty: huge tool results are less likely to be fully relevant
    if (tokenEstimate > 10000) {
      importance = Math.max(0.1, importance - 0.15);
    }
    if (tokenEstimate > 30000) {
      importance = Math.max(0.1, importance - 0.10);
    }

    // Reference bonus: check if content appears in later messages
    const preview = extractPreview(msg, 50);
    const isReferenced = messages.slice(i + 1).some((later) => {
      const laterContent = extractContent(later);
      return laterContent.includes(preview.slice(0, 30));
    });
    if (isReferenced) {
      importance = Math.min(1.0, importance + 0.20);
    }

    const retention = calculateRetention(importance, age, type, config);

    scored.push({
      index: i,
      type,
      importance,
      retention,
      tokenEstimate,
      summary: "",
      role: msg.role || "unknown",
      contentPreview: extractPreview(msg),
    });
  }

  return scored;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SUMMARY BUILDER
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Build the hippocampus compaction summary.
 * 
 * Structure:
 * - Goal: Extracted from user_intent messages
 * - Prior Context: Previous summary if available
 * - Active Context: High retention entries (full content)
 * - Compressed: Mid retention entries (summary lines)
 * - Sparse Index: Low retention entries (pointers only)
 */
function buildHippocampusSummary(
  scored: ScoredEntry[],
  messages: CompactionMessage[],
  config: HippocampusConfig,
  previousSummary?: string
): string {
  const sparse: string[] = [];
  const compressed: string[] = [];
  const kept: string[] = [];

  let sparseTokens = 0;
  let compressedTokens = 0;
  let keptTokens = 0;
  let droppedCount = 0;

  for (const entry of scored) {
    const msg = messages[entry.index];
    const line = buildSparseIndexLine(entry, msg);

    if (entry.retention < config.sparseThreshold) {
      // Sparse index only — just a pointer
      const lineTokens = Math.ceil(line.length / 4);
      if (sparseTokens + lineTokens <= config.maxSparseIndexTokens) {
        sparse.push(line);
        sparseTokens += lineTokens;
      } else {
        droppedCount++;
      }
    } else if (entry.retention < config.compressThreshold) {
      // Compressed — keep a summary line with retention score
      compressed.push(`• (r=${entry.retention.toFixed(2)}) ${line}`);
      compressedTokens += Math.ceil(line.length / 4);
    } else {
      // Full retention — keep the actual content
      const content = extractPreview(msg, 500);
      kept.push(`### [${entry.type}] (r=${entry.retention.toFixed(2)})\n${content}`);
      keptTokens += entry.tokenEstimate;
    }
  }

  // ── Assemble summary ──
  const parts: string[] = [];

  // Extract goals from user_intent entries
  const goals: string[] = [];
  for (const entry of scored) {
    if (entry.type === "user_intent" && entry.retention >= config.sparseThreshold) {
      const goalLine = entry.contentPreview.slice(0, 150).replace(/\n/g, " ");
      if (goalLine.length > 10) {
        goals.push(`- ${goalLine}`);
      }
    }
  }

  // Header with metadata
  parts.push("# hippocampus.md Compaction");
  parts.push(`<!-- decay_λ=${JSON.stringify(config.decayRates)} sparse_threshold=${config.sparseThreshold} compress_threshold=${config.compressThreshold} -->`);
  parts.push(`<!-- entries: ${scored.length} | sparse: ${sparse.length} | compressed: ${compressed.length} | kept: ${kept.length} | dropped: ${droppedCount} -->`);
  parts.push("");

  // Goals section
  if (goals.length > 0) {
    parts.push("## Goal");
    parts.push(goals.join("\n"));
    parts.push("");
  }

  // Prior context
  if (previousSummary) {
    parts.push("## Prior Context");
    parts.push(previousSummary);
    parts.push("");
  }

  // Active context (high retention)
  if (kept.length > 0) {
    parts.push("## Active Context (high retention)");
    parts.push(kept.join("\n\n"));
    parts.push("");
  }

  // Compressed entries
  if (compressed.length > 0) {
    parts.push("## Compressed (mid retention — re-fetch if needed)");
    parts.push(compressed.join("\n"));
    parts.push("");
  }

  // Sparse index
  if (sparse.length > 0) {
    parts.push("## Sparse Index (decayed — pointers only)");
    parts.push(sparse.join("\n"));
    if (droppedCount > 0) {
      parts.push(`\n<!-- ${droppedCount} additional entries dropped (sparse index full) -->`);
    }
    parts.push("");
  }

  // Stats footer
  const totalOriginalTokens = scored.reduce((sum, e) => sum + e.tokenEstimate, 0);
  const totalNewTokens = sparseTokens + compressedTokens + keptTokens;
  const ratio = totalOriginalTokens > 0 
    ? (totalOriginalTokens / Math.max(totalNewTokens, 1)).toFixed(1) 
    : "∞";

  parts.push(`<!-- hippocampus stats: ${totalOriginalTokens}tok → ${totalNewTokens}tok (${ratio}× compression) -->`);

  return parts.join("\n");
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXTENSION ENTRY POINT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Hippocampus extension for Pi/OpenClaw.
 * 
 * Hooks into the compaction lifecycle to replace default summarization
 * with decay-based context lifecycle management.
 */
export default function hippocampus(pi: ExtensionAPI): void {
  // Load config from workspace
  const workspaceDir = process.cwd();
  const config = loadConfig(workspaceDir);
  
  // Resolve log path
  const logPath = config.logFile.startsWith("/") 
    ? config.logFile 
    : join(workspaceDir, config.logFile);

  // Logger function
  const log = (msg: string, data?: unknown): void => {
    const timestamp = new Date().toISOString();
    const line = `[${timestamp}] [hippocampus] ${msg}${data ? " " + JSON.stringify(data) : ""}\n`;
    
    try {
      appendFileSync(logPath, line);
    } catch {
      // Ignore log write errors
    }
    
    if (config.debug) {
      console.log(`[hippocampus] ${msg}`, data ?? "");
    }
  };

  log("🧠 hippocampus.md extension loaded", { config: { ...config, decayRates: "..." } });

  // ── Hook: session_before_compact ──
  pi.on("session_before_compact", async (event: CompactionEvent, ctx: ExtensionContext): Promise<CompactionResult | void> => {
    const { preparation } = event;
    const {
      messagesToSummarize,
      turnPrefixMessages,
      tokensBefore,
      firstKeptEntryId,
      previousSummary,
    } = preparation;

    const allMessages = [...messagesToSummarize, ...turnPrefixMessages] as CompactionMessage[];
    const totalMessages = allMessages.length;

    log(`🔬 Compaction triggered`, { messages: totalMessages, tokensBefore });

    if (totalMessages === 0) {
      log("⚠️ No messages to process, falling back to default");
      return; // Fallback to default compaction
    }

    try {
      // Phase 1: Score all messages
      const scored = scoreMessages(allMessages, config);

      const stats = {
        total: scored.length,
        sparse: scored.filter(e => e.retention < config.sparseThreshold).length,
        compressed: scored.filter(e => e.retention >= config.sparseThreshold && e.retention < config.compressThreshold).length,
        kept: scored.filter(e => e.retention >= config.compressThreshold).length,
        totalTokens: scored.reduce((sum, e) => sum + e.tokenEstimate, 0),
      };

      log(`📊 Scoring complete`, stats);

      // Phase 2: Build summary
      const summary = buildHippocampusSummary(scored, allMessages, config, previousSummary);
      const summaryTokens = Math.ceil(summary.length / 4);
      const compressionRatio = (stats.totalTokens / Math.max(summaryTokens, 1)).toFixed(1);

      log(`📝 Summary built`, { summaryTokens, compressionRatio });

      if (!summary.trim()) {
        log("⚠️ Empty summary, falling back to default");
        return;
      }

      // Notify user
      ctx.ui.notify(
        `🧠 hippocampus: ${stats.total} entries → ${stats.sparse} sparse + ${stats.compressed} compressed + ${stats.kept} kept (${compressionRatio}× compression)`,
        "info"
      );

      // Return hippocampus compaction result
      return {
        compaction: {
          summary,
          firstKeptEntryId,
          tokensBefore,
        },
      };

    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log(`❌ Error during compaction`, { error: message });
      ctx.ui.notify(`hippocampus error: ${message}, falling back to default`, "warning");
      return; // Fallback to default compaction
    }
  });

  // ── Hook: turn_end ──
  pi.on("turn_end", (_event: any, _ctx: ExtensionContext) => {
    // Future: Track which entries the agent actually referenced
    // and boost their importance scores for next compaction
    log("📍 Turn ended — scoring update (future: track references)");
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORTS FOR TESTING
// ═══════════════════════════════════════════════════════════════════════════════

/** @internal */
export {
  classifyMessage,
  getBaseImportance,
  estimateTokens,
  extractPreview,
  extractToolName,
  calculateRetention,
  scoreMessages,
  buildSparseIndexLine,
  buildHippocampusSummary,
  loadConfig,
  extractContent,
  DEFAULT_CONFIG
}

/** @internal */
export type {
  EntryType,
  HippocampusConfig,
  ScoredEntry,
  CompactionMessage,
  ContentBlock
}
