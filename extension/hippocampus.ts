/**
 * hippocampus.md — Context Lifecycle Extension
 * 
 * Replaces default compaction with decay-based context lifecycle management.
 * Inspired by hippocampal memory systems: sparse indexing, importance scoring,
 * exponential decay, and pattern completion.
 * 
 * Part of the Agent Brain Architecture:
 * defrag.md · synapse.md · hippocampus.md · neocortex.md
 * 
 * Authors: Roman Godz, R2D2
 * 
 * Usage: Place in <workspace>/.pi/extensions/hippocampus.ts
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { appendFileSync, writeFileSync } from "fs";

const HIPPOCAMPUS_LOG = "/Users/admin/clawd/.pi/hippocampus.log";

// ─── Config ───────────────────────────────────────────────────────────────────

const CONFIG = {
  // Per-type decay rates (lower = remembers longer)
  decayRates: {
    decision:    0.03,   // decisions persist ~30× longer
    user_intent: 0.05,   // user goals persist ~20× longer  
    context:     0.12,   // general context — standard decay
    tool_result: 0.20,   // tool outputs decay fast
    ephemeral:   0.35,   // heartbeats/status — decay very fast
    unknown:     0.15,   // unknown — moderate decay
  } as Record<string, number>,
  decayLambda: 0.12,            // fallback decay rate
  sparseThreshold: 0.25,        // below this → pointer only
  compressThreshold: 0.65,      // below this → compressed summary  
  retentionFloor: {             // minimum retention per type (anchor)
    decision:    0.50,          // decisions never drop below 0.50
    user_intent: 0.35,          // user goals never drop below 0.35
  } as Record<string, number>,
  maxSparseIndexTokens: 2500,   // max tokens for the sparse index section
  summaryModel: "gemini-2.5-flash", // cheap model for classification/summarization
  debug: true,                  // log to console for development
};

// ─── Types ────────────────────────────────────────────────────────────────────

type EntryType = "tool_result" | "decision" | "user_intent" | "ephemeral" | "context" | "unknown";

interface ScoredEntry {
  index: number;
  type: EntryType;
  importance: number;    // 0.0 - 1.0
  retention: number;     // after decay: 0.0 - 1.0
  tokenEstimate: number;
  summary: string;       // sparse index line
  role: string;
  contentPreview: string;
}

// ─── Classification ───────────────────────────────────────────────────────────

function classifyMessage(msg: any): EntryType {
  const role = msg.role || "";
  const content = typeof msg.content === "string" 
    ? msg.content 
    : Array.isArray(msg.content) 
      ? msg.content.map((c: any) => c.text || "").join(" ")
      : "";

  // Tool results
  if (role === "tool" || role === "toolResult") return "tool_result";
  
  // User messages
  if (role === "user") {
    const lower = content.toLowerCase();
    // Heartbeats and status checks
    if (lower.includes("heartbeat") || lower === "heartbeat_ok" || lower.includes("/status")) {
      return "ephemeral";
    }
    return "user_intent";
  }

  // Assistant messages
  if (role === "assistant") {
    const lower = content.toLowerCase();
    // Decision indicators
    if (lower.includes("decision") || lower.includes("решил") || lower.includes("план") ||
        lower.includes("will do") || lower.includes("approach") || lower.includes("strategy") ||
        lower.includes("no_reply")) {
      return content.length < 50 ? "ephemeral" : "decision";
    }
    // Tool calls (assistant requesting tool use)
    if (msg.toolCalls || msg.tool_calls || (Array.isArray(msg.content) && msg.content.some((c: any) => c.type === "tool_use"))) {
      return "context";
    }
    return "context";
  }

  return "unknown";
}

// ─── Importance Scoring ───────────────────────────────────────────────────────

function baseImportance(type: EntryType): number {
  switch (type) {
    case "decision":    return 0.90;
    case "user_intent": return 0.80;
    case "context":     return 0.50;
    case "tool_result": return 0.30;
    case "ephemeral":   return 0.10;
    case "unknown":     return 0.40;
  }
}

function estimateTokens(msg: any): number {
  const content = typeof msg.content === "string"
    ? msg.content
    : Array.isArray(msg.content)
      ? msg.content.map((c: any) => c.text || JSON.stringify(c)).join(" ")
      : JSON.stringify(msg.content || "");
  return Math.ceil(content.length / 4);
}

function extractContentPreview(msg: any, maxLen = 120): string {
  const content = typeof msg.content === "string"
    ? msg.content
    : Array.isArray(msg.content)
      ? msg.content.map((c: any) => c.text || "").join(" ")
      : "";
  if (content.length <= maxLen) return content;
  return content.slice(0, maxLen) + "…";
}

function extractToolName(msg: any): string {
  // Try various formats
  if (msg.toolName) return msg.toolName;
  if (msg.name) return msg.name;
  if (msg.tool_call_id) return msg.tool_call_id;
  // Check content for tool_use blocks
  if (Array.isArray(msg.content)) {
    for (const block of msg.content) {
      if (block.type === "tool_use" && block.name) return block.name;
      if (block.type === "tool_result" && block.tool_use_id) return block.tool_use_id;
    }
  }
  return "unknown_tool";
}

// ─── Decay Function ───────────────────────────────────────────────────────────

/**
 * Exponential decay with per-type rates and retention floors.
 * retention = max(floor, importance × e^(-λ_type × age))
 * 
 * age = position from end (0 = most recent, N = oldest)
 * λ = per-type decay rate (decisions decay 6× slower than tool_results)
 */
function calculateRetention(importance: number, age: number, type: EntryType): number {
  const lambda = CONFIG.decayRates[type] ?? CONFIG.decayLambda;
  const floor = CONFIG.retentionFloor[type] ?? 0;
  const raw = importance * Math.exp(-lambda * age);
  return Math.max(floor, raw);
}

// ─── Sparse Index Builder ─────────────────────────────────────────────────────

function buildSparseIndexLine(entry: ScoredEntry, msg: any): string {
  const type = entry.type;
  
  if (type === "tool_result") {
    const toolName = extractToolName(msg);
    return `[TOOL:${toolName}] ${entry.tokenEstimate}tok → "${entry.contentPreview.slice(0, 80)}"`;
  }
  
  if (type === "user_intent") {
    return `[USER] "${entry.contentPreview.slice(0, 100)}"`;
  }
  
  if (type === "decision") {
    return `[DECISION] "${entry.contentPreview.slice(0, 100)}"`;
  }
  
  if (type === "ephemeral") {
    return `[EPHEMERAL] ${entry.contentPreview.slice(0, 40)}`;
  }
  
  return `[${entry.role.toUpperCase()}] ${entry.contentPreview.slice(0, 80)}`;
}

// ─── Score All Messages ───────────────────────────────────────────────────────

function scoreMessages(messages: any[]): ScoredEntry[] {
  const total = messages.length;
  const scored: ScoredEntry[] = [];

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    const type = classifyMessage(msg);
    let importance = baseImportance(type);
    const age = total - 1 - i; // 0 = newest
    const tokenEstimate = estimateTokens(msg);

    // ── Modifiers ──

    // Recency bonus: last 5 entries get +0.15
    if (age < 5) importance = Math.min(1.0, importance + 0.15);

    // Size penalty: huge tool results are less likely to be fully relevant
    if (tokenEstimate > 10000) importance = Math.max(0.1, importance - 0.15);
    if (tokenEstimate > 30000) importance = Math.max(0.1, importance - 0.10);

    // Reference bonus: if later messages quote/reference this content
    // (simplified: check if content appears in later messages)
    const preview = extractContentPreview(msg, 50);
    const isReferenced = messages.slice(i + 1).some((later: any) => {
      const laterContent = typeof later.content === "string" ? later.content : "";
      return laterContent.includes(preview.slice(0, 30));
    });
    if (isReferenced) importance = Math.min(1.0, importance + 0.20);

    const retention = calculateRetention(importance, age, type);

    scored.push({
      index: i,
      type,
      importance,
      retention,
      tokenEstimate,
      summary: "",
      role: msg.role || "unknown",
      contentPreview: extractContentPreview(msg),
    });
  }

  return scored;
}

// ─── Build Hippocampus Summary ────────────────────────────────────────────────

function buildHippocampusSummary(
  scored: ScoredEntry[],
  messages: any[],
  previousSummary?: string,
): string {
  const sparse: string[] = [];    // retention < sparseThreshold
  const compressed: string[] = []; // retention < compressThreshold
  const kept: string[] = [];       // retention >= compressThreshold

  let sparseTokens = 0;
  let compressedTokens = 0;
  let keptTokens = 0;
  let droppedCount = 0;

  for (const entry of scored) {
    const msg = messages[entry.index];
    const line = buildSparseIndexLine(entry, msg);

    if (entry.retention < CONFIG.sparseThreshold) {
      // Sparse index only — just a pointer
      const indexLine = line;
      const lineTokens = Math.ceil(indexLine.length / 4);
      if (sparseTokens + lineTokens <= CONFIG.maxSparseIndexTokens) {
        sparse.push(indexLine);
        sparseTokens += lineTokens;
      } else {
        droppedCount++;
      }
    } else if (entry.retention < CONFIG.compressThreshold) {
      // Compressed — keep a summary line
      compressed.push(`• (r=${entry.retention.toFixed(2)}) ${line}`);
      compressedTokens += Math.ceil(line.length / 4);
    } else {
      // Full retention — keep the actual content
      const content = extractContentPreview(msg, 500);
      kept.push(`### [${entry.type}] (r=${entry.retention.toFixed(2)})\n${content}`);
      keptTokens += entry.tokenEstimate;
    }
  }

  // ── Assemble ──

  const parts: string[] = [];

  // ── Extract goals from user_intent entries ──
  const goals: string[] = [];
  for (const entry of scored) {
    if (entry.type === "user_intent" && entry.retention >= CONFIG.sparseThreshold) {
      const goalLine = entry.contentPreview.slice(0, 150).replace(/\n/g, " ");
      if (goalLine.length > 10) goals.push(`- ${goalLine}`);
    }
  }

  parts.push("# hippocampus.md Compaction");
  parts.push(`<!-- decay_λ=${JSON.stringify(CONFIG.decayRates)} sparse_threshold=${CONFIG.sparseThreshold} compress_threshold=${CONFIG.compressThreshold} -->`);
  parts.push(`<!-- entries: ${scored.length} | sparse: ${sparse.length} | compressed: ${compressed.length} | kept: ${kept.length} | dropped: ${droppedCount} -->`);
  parts.push("");

  if (goals.length > 0) {
    parts.push("## Goal");
    parts.push(goals.join("\n"));
    parts.push("");
  }

  if (previousSummary) {
    parts.push("## Prior Context");
    parts.push(previousSummary);
    parts.push("");
  }

  if (kept.length > 0) {
    parts.push("## Active Context (high retention)");
    parts.push(kept.join("\n\n"));
    parts.push("");
  }

  if (compressed.length > 0) {
    parts.push("## Compressed (mid retention — re-fetch if needed)");
    parts.push(compressed.join("\n"));
    parts.push("");
  }

  if (sparse.length > 0) {
    parts.push("## Sparse Index (decayed — pointers only)");
    parts.push(sparse.join("\n"));
    if (droppedCount > 0) {
      parts.push(`\n<!-- ${droppedCount} additional entries dropped (sparse index full) -->`);
    }
    parts.push("");
  }

  // Stats
  const totalOriginalTokens = scored.reduce((sum, e) => sum + e.tokenEstimate, 0);
  const totalNewTokens = sparseTokens + compressedTokens + keptTokens;
  const ratio = totalOriginalTokens > 0 ? (totalOriginalTokens / Math.max(totalNewTokens, 1)).toFixed(1) : "∞";

  parts.push(`<!-- hippocampus stats: ${totalOriginalTokens}tok → ${totalNewTokens}tok (${ratio}× compression) -->`);

  return parts.join("\n");
}

// ─── Extension Entry Point ────────────────────────────────────────────────────

export default function hippocampus(pi: ExtensionAPI) {
  const log = (msg: string, ...args: any[]) => {
    const line = `[${new Date().toISOString()}] [hippocampus] ${msg} ${args.length ? JSON.stringify(args) : ""}\n`;
    try { appendFileSync(HIPPOCAMPUS_LOG, line); } catch {}
    if (CONFIG.debug) {
      console.log(`[hippocampus] ${msg}`, ...args);
    }
  };

  // Write load marker (append, not overwrite!)
  try { appendFileSync(HIPPOCAMPUS_LOG, `[${new Date().toISOString()}] hippocampus extension LOADED\n`); } catch {}
  log("🧠 hippocampus.md extension loaded");

  // ── Hook: session_before_compact ──
  pi.on("session_before_compact", async (event, ctx) => {
    const { preparation } = event;
    const {
      messagesToSummarize,
      turnPrefixMessages,
      tokensBefore,
      firstKeptEntryId,
      previousSummary,
    } = preparation;

    const allMessages = [...messagesToSummarize, ...turnPrefixMessages];
    const totalMessages = allMessages.length;

    log(`🔬 Compaction triggered: ${totalMessages} messages, ${tokensBefore.toLocaleString()} tokens`);

    if (totalMessages === 0) {
      log("⚠️ No messages to process, falling back to default");
      return; // fallback to default compaction
    }

    try {
      // ── Phase 1: Score & Decay ──
      const scored = scoreMessages(allMessages);

      const stats = {
        total: scored.length,
        sparse: scored.filter(e => e.retention < CONFIG.sparseThreshold).length,
        compressed: scored.filter(e => e.retention >= CONFIG.sparseThreshold && e.retention < CONFIG.compressThreshold).length,
        kept: scored.filter(e => e.retention >= CONFIG.compressThreshold).length,
        totalTokens: scored.reduce((sum, e) => sum + e.tokenEstimate, 0),
      };

      log(`📊 Scoring complete:`, stats);

      // ── Phase 2: Build Summary ──
      const summary = buildHippocampusSummary(scored, allMessages, previousSummary);

      const summaryTokens = Math.ceil(summary.length / 4);
      log(`📝 Summary built: ${summaryTokens} tokens (${(stats.totalTokens / Math.max(summaryTokens, 1)).toFixed(1)}× compression)`);

      if (!summary.trim()) {
        log("⚠️ Empty summary, falling back to default");
        return;
      }

      ctx.ui.notify(
        `🧠 hippocampus compaction: ${stats.total} entries → ${stats.sparse} sparse + ${stats.compressed} compressed + ${stats.kept} kept (${(stats.totalTokens / Math.max(summaryTokens, 1)).toFixed(1)}× compression)`,
        "info",
      );

      // ── Return hippocampus compaction ──
      return {
        compaction: {
          summary,
          firstKeptEntryId,
          tokensBefore,
        },
      };

    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log(`❌ Error: ${message}`);
      ctx.ui.notify(`hippocampus error: ${message}, falling back to default`, "warning");
      return; // fallback to default compaction
    }
  });

  // ── Hook: turn_end — update scoring based on actual usage ──
  pi.on("turn_end", (_event, ctx) => {
    // Future: track which entries the agent actually referenced
    // and boost their importance scores for next compaction
    log("📍 Turn ended — scoring update (future: track references)");
  });
}
