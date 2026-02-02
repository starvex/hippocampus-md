# hippocampus.md

## A Context Lifecycle Protocol for AI Agents

**Version 2.0 — February 2026**

**Authors:** Roman Godz, R2D2

**Status:** Draft

**Part of the Agent Brain Architecture:**
[defrag.md](https://defrag.md) · [synapse.md](https://synapse.md) · **hippocampus.md** · [neocortex.md](https://neocortex.md)

---

## Abstract

AI agents don't have a memory problem — they have a *forgetting* problem.

Context windows fill with tool outputs, old messages, and accumulated state until they overflow. Current solutions are crude: truncate the oldest content (losing critical information) or summarize aggressively (losing specificity). Neither approach mirrors how biological memory actually works.

The human brain doesn't store everything it sees. It maintains a sparse index of *where* information lives, retrieving full content only when needed. More importantly, it *actively forgets* — memories decay according to predictable curves, modified by importance, emotional weight, and retrieval patterns. This isn't a bug. It's what makes memory sustainable.

**hippocampus.md** proposes a protocol for AI agent context lifecycle management inspired by hippocampal memory systems (Teyler & DiScenna, 1986). The specification defines: sparse indexing that keeps pointers instead of content; biologically-grounded decay functions for context entries; pattern completion for on-demand retrieval; and consolidation cycles that compress context between sessions.

The result: agents that maintain relevant context without infinite growth. A 50,000-token browser snapshot becomes a 500-token index entry. Tool outputs decay if unused. Critical information resists forgetting. Context stays lean, retrieval stays fast, costs stay bounded.

---

## Table of Contents

1. [The Problem: Context Without Lifecycle](#1-the-problem-context-without-lifecycle)
2. [Biological Foundation](#2-biological-foundation)
3. [Current Approaches and Their Limits](#3-current-approaches-and-their-limits)
4. [The hippocampus.md Protocol](#4-the-hippocampusmd-protocol)
5. [Context Entry Schema](#5-context-entry-schema)
6. [Sparse Indexing](#6-sparse-indexing)
7. [Pattern Completion](#7-pattern-completion)
8. [Decay Functions](#8-decay-functions)
9. [Consolidation Cycles](#9-consolidation-cycles)
10. [Lifecycle Policies](#10-lifecycle-policies)
11. [Integration](#11-integration)
12. [Benchmarks](#12-benchmarks)
13. [What We Don't Yet Know](#13-what-we-dont-yet-know)
14. [Specification](#14-specification)
15. [References](#15-references)

---

## 1. The Problem: Context Without Lifecycle

### 1.1 The Append-Only Trap

Every LLM interaction accumulates context. User messages. Assistant responses. Tool calls and their results. System prompts. Each turn adds tokens; nothing removes them.

A typical agent session after 30 minutes:

| Component | Tokens | % of Context |
|-----------|--------|--------------|
| System prompt | 3,000 | 3% |
| User messages | 8,000 | 8% |
| Assistant responses | 15,000 | 15% |
| **Tool results** | **74,000** | **74%** |
| **Total** | **100,000** | 100% |

Tool results dominate. A single browser snapshot: 50,000 tokens. A config schema query: 285,000 tokens. A directory listing of a large project: 30,000 tokens. The agent reads these once, uses them briefly, then carries them forever.

This is the append-only trap. Context grows monotonically until it hits the window limit, then something breaks.

### 1.2 The Economics of Context Bloat

Context isn't free. At current pricing:

| Provider | Input Cost | 100K Context/Turn | 50 Turns/Day | Monthly |
|----------|------------|-------------------|--------------|---------|
| GPT-4o | $2.50/M | $0.25 | $12.50 | $375 |
| Claude Opus | $15/M | $1.50 | $75 | $2,250 |
| Claude Sonnet | $3/M | $0.30 | $15 | $450 |

But these numbers assume static context. Real agent sessions show context growing 3-5× during active work:

```
Turn 1:   15,000 tokens (baseline)
Turn 10:  45,000 tokens (after file reads)
Turn 20:  120,000 tokens (after browser + tool calls)
Turn 30:  180,000 tokens (approaching limit)
Turn 31:  COMPACTION TRIGGERED
```

Compaction costs its own tokens — summarizing 180K of context into 20K requires a full context read plus generation. Then the cycle repeats.

**Real measured costs from a production agent (R2D2, January 2026):**

| Metric | Value |
|--------|-------|
| Average session length | 45 turns |
| Compactions per session | 2.3 |
| Tokens read (pre-compaction) | 847,000 |
| Tokens written (summaries) | 23,000 |
| Context waste (tool results never reused) | 62% |

62% of context tokens were tool outputs that were read once and never referenced again. They persisted until compaction erased them — costing money at every turn in between.

### 1.3 Why Truncation and Summarization Fail

**Truncation** (sliding window, FIFO eviction):
- Removes oldest content regardless of importance
- Critical early context (user preferences, project setup) gets dropped
- Order of arrival ≠ order of importance

**Summarization** (compress old content):
- Loses specificity — "deployed to Vercel" becomes "deployment happened"
- Hallucinates details when reconstructing from summaries
- Recursive summarization compounds errors
- Still requires full context read to generate summary

**Neither approach answers the fundamental question: what should be remembered, and what should be forgotten?**

The brain doesn't truncate by time or summarize continuously. It maintains what matters and lets the rest decay. It retrieves full content on demand rather than carrying it constantly. This is what hippocampus.md implements for AI context.

### 1.4 A Different Model: Index + Retrieve

Instead of storing full content in context, store sparse pointers:

```
BEFORE (carrying full browser snapshot):
┌─────────────────────────────────────────────────┐
│ [toolResult browser.snapshot]                   │
│ <browser_snapshot>                              │
│   <element ref="e1" role="banner">...</element> │
│   <element ref="e2" role="nav">...</element>    │
│   ... (2000 more elements) ...                  │
│   <element ref="e2047" role="footer">...</>     │
│ </browser_snapshot>                             │
│                                                 │
│ Tokens: 52,847                                  │
└─────────────────────────────────────────────────┘

AFTER (hippocampus index entry):
┌─────────────────────────────────────────────────┐
│ [context_index: browser_snap_001]               │
│ source: browser.snapshot @ turn 12              │
│ summary: "Crabot dashboard showing 19 users,    │
│           settings panel, usage graphs"         │
│ key_refs: {submit: e12, users: e45, nav: e3}    │
│ retrievable: true                               │
│ strength: 0.85                                  │
│ decay_rate: 0.1/turn                            │
│                                                 │
│ Tokens: 487                                     │
└─────────────────────────────────────────────────┘
```

108× compression. The full snapshot is retrievable if needed (pattern completion). If never needed, the index entry decays and eventually drops from context. Critical references (the submit button we're about to click) are preserved in the summary.

This is hippocampal indexing applied to context management.

---

## 2. Biological Foundation

### 2.1 The Hippocampal Memory Indexing Theory

In 1986, Timothy Teyler and Pascal DiScenna proposed a theory that reframed neuroscience's understanding of the hippocampus: **the hippocampus doesn't store memories. It stores an index.**

When you experience an event, multiple neocortical regions activate simultaneously. The hippocampus creates a sparse activation pattern — an *index entry* — that records *which* regions were co-activated. This index entry is the pointer. The memories themselves remain distributed across the cortex.

Retrieval starts with the index. A partial cue reactivates the hippocampal index entry, which then projects back to the neocortex, reinstating the full original pattern. This is *pattern completion* — reconstructing the whole from a part.

For AI agents, the analogy is direct:
- **Neocortex** = External storage (files, APIs, databases, cached tool outputs)
- **Hippocampus** = Context window (limited capacity, must be selective)
- **Index entry** = Sparse pointer to external content
- **Pattern completion** = Re-fetching full content when needed

> **Citation:** Teyler, T.J. & DiScenna, P. (1986). "The hippocampal memory indexing theory." *Behavioral Neuroscience*, 100(2), 147–154.

### 2.2 Active Forgetting

The brain doesn't passively lose memories — it actively forgets. Dopamine-mediated signaling in the hippocampus triggers memory degradation. AMPA receptor endocytosis weakens synaptic connections. During sleep, slow-wave oscillations selectively downscale weak synapses while preserving strong ones.

Forgetting is competitive with remembering. The same neural machinery that forms memories also dismantles them. This isn't failure — it's optimization:

- **Reduces interference** — old irrelevant memories don't compete with new relevant ones
- **Saves resources** — maintaining memories costs energy
- **Improves generalization** — forgetting specifics helps extract patterns
- **Enables updating** — clearing outdated information makes room for corrections

For AI context, active forgetting means:
- Tool outputs that aren't referenced should decay
- Old conversation turns that weren't important should fade
- But critical information (user preferences, active task state) should resist decay

> **Citation:** Davis, R.L. & Bhong, Y. (2017). "Mechanisms of Forgetting." *Annual Review of Psychology*, 68, 3.1–3.26.

### 2.3 The Forgetting Curve

Hermann Ebbinghaus (1885) measured memory decay with nonsense syllables and found a characteristic curve: rapid initial forgetting followed by slower long-term decay. This is well-modeled by a power law:

```
retention(t) = a × (1 + b×t)^(-c)

Where:
  t = time since encoding
  a = initial strength (1.0 for new memories)
  b = decay rate (higher = faster forgetting)
  c = forgetting exponent (~0.5 for humans)
```

The curve isn't fixed. Several factors modify decay:

| Factor | Effect on Decay | Biological Mechanism |
|--------|----------------|---------------------|
| Retrieval practice | Slows decay dramatically | Reconsolidation strengthens trace |
| Emotional arousal | Slows decay | Amygdala modulates hippocampus |
| Encoding depth | Slows decay | Deeper processing = stronger trace |
| Sleep | Slows decay | SWS replay consolidates |
| Interference | Speeds decay | Competing memories overwrite |
| Isolation | Slows decay | Distinctive items resist forgetting |

hippocampus.md implements these modifiers for context entries.

> **Citation:** Wixted, J.T. & Ebbesen, E.B. (1991). "On the form of forgetting." *Psychological Science*, 2(6), 409–415.

### 2.4 Sleep Consolidation

During slow-wave sleep, the hippocampus "replays" recent experiences to the neocortex. Weak traces that don't get replayed fade. Strong traces that do get replayed become hippocampus-independent — they can be retrieved directly from the neocortex without the index.

This is *systems consolidation*: the gradual transfer of memory from fast hippocampal encoding to slow neocortical storage. The index is a temporary scaffold that eventually becomes unnecessary for well-consolidated memories.

For AI agents, consolidation happens at session boundaries:
- **Light consolidation** (between turns): Update strengths, drop decayed entries
- **Deep consolidation** (between sessions): Compress context to essentials, write important items to persistent memory
- **Archival consolidation** (periodic): Move old memories from daily logs to long-term storage

> **Citation:** Diekelmann, S. & Born, J. (2010). "The memory function of sleep." *Nature Reviews Neuroscience*, 11(2), 114–126.

### 2.5 Pattern Separation and Completion

Two hippocampal operations are critical for indexing:

**Pattern Separation** (Dentate Gyrus): Transforms similar inputs into distinct outputs. Even if two browser snapshots look similar, they get separate index entries. This prevents collisions.

**Pattern Completion** (CA3): Reconstructs full patterns from partial cues. Given just the index entry ("browser snapshot of Crabot dashboard"), the agent can re-fetch the full content if needed.

| Operation | Brain Region | Function | Context Analog |
|-----------|-------------|----------|----------------|
| Pattern Separation | Dentate Gyrus | Distinct keys for similar content | Each tool output gets unique index |
| Pattern Completion | CA3 | Full retrieval from partial cue | Re-fetch from index entry |

Together, these enable **write-sparse, read-complete** — store minimal pointers, retrieve full content on demand.

---

## 3. Current Approaches and Their Limits

### 3.1 How Agents Handle Context Today

| System | Context Management | Decay | Consolidation | Bio-Inspiration |
|--------|-------------------|-------|---------------|-----------------|
| **MemGPT/Letta** | 3-tier paging (core/recall/archival) | None | Sleep-time compute (2025) | Low (OS metaphor) |
| **Mem0** | ADD/UPDATE/DELETE operations | Basic DELETE | None | Low |
| **MemoryOS** | Heat-based STM/MTM/LTM | Heat eviction | Heat promotion | Medium |
| **LangChain** | ConversationBufferMemory variants | None | Summary compression | None |
| **OpenClaw** | Token-triggered compaction | None | Summarization | None |

**None of these systems implement sparse indexing for context.** All store full content in context until forced to evict or summarize.

### 3.2 MemGPT's Sleep-Time Compute

Letta (evolved from MemGPT) introduced "sleep-time compute" in 2025 — a secondary agent that reorganizes memory during idle periods. This is the closest existing approach to biological consolidation.

**What it does:**
- Runs a stronger model (e.g., GPT-4) during idle time
- Transforms "raw context" into "learned context"
- Forms connections between memories

**What it doesn't do:**
- No decay functions — memories don't weaken over time
- No sparse indexing — full content is still stored
- No pattern completion — can't re-fetch forgotten content

### 3.3 The Gap

| Capability | Existing Systems | hippocampus.md |
|------------|-----------------|----------------|
| Store full content in context | ✅ Default | ❌ Index only |
| Decay over time | ❌ None or basic | ✅ Power-law with modifiers |
| Re-fetch on demand | ❌ Lost = gone | ✅ Pattern completion |
| Consolidation cycles | ⚠️ MemGPT only | ✅ Multi-level |
| Lifecycle policies | ❌ None | ✅ Declarative rules |

---

## 4. The hippocampus.md Protocol

### 4.1 Core Principles

1. **The index is not the content.** Context holds pointers; full content lives externally.

2. **Strength decays by default.** Every context entry loses strength over time unless reinforced.

3. **Retrieval strengthens.** Accessing an entry resets its decay clock and boosts strength.

4. **Important entries resist decay.** Priority tags, emotional markers, and deep encoding slow forgetting.

5. **Pattern completion enables recovery.** Decayed entries can be re-fetched if their source is available.

6. **Consolidation compresses.** Between sessions, context is distilled to essentials.

### 4.2 Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     CONTEXT WINDOW                          │
│  ┌─────────────────────────────────────────────────────┐    │
│  │              HIPPOCAMPUS INDEX                      │    │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐   │    │
│  │  │ Entry A     │ │ Entry B     │ │ Entry C     │   │    │
│  │  │ str: 0.92   │ │ str: 0.45   │ │ str: 0.12   │   │    │
│  │  │ → source_a  │ │ → source_b  │ │ → source_c  │   │    │
│  │  └─────────────┘ └─────────────┘ └─────────────┘   │    │
│  │                         │                           │    │
│  │                         │ decay threshold: 0.1      │    │
│  │                         ▼                           │    │
│  │                  ┌─────────────┐                    │    │
│  │                  │ Entry C     │ BELOW THRESHOLD    │    │
│  │                  │ (decayed)   │ → remove from ctx  │    │
│  │                  └─────────────┘ → recoverable      │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
│  Active context: ~5,000 tokens (index only)                 │
│  Retrievable: ~500,000 tokens (external sources)            │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ pattern completion
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    EXTERNAL SOURCES                         │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐       │
│  │ source_a │ │ source_b │ │ source_c │ │ source_d │       │
│  │ (file)   │ │ (cache)  │ │ (API)    │ │ (browser)│       │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘       │
└─────────────────────────────────────────────────────────────┘
```

### 4.3 Flow

1. **Tool execution** → Full result returned
2. **Indexing** → Create sparse index entry, store full result externally
3. **Context injection** → Only index entry goes into context
4. **Decay** → Strength decreases each turn if not accessed
5. **Access** → Strength reset, decay clock reset
6. **Below threshold** → Entry removed from context (but source preserved)
7. **Pattern completion** → If needed later, re-fetch from source
8. **Consolidation** → At session end, write important entries to persistent memory

---

## 5. Context Entry Schema

Each context entry contains:

```yaml
hippocampus_entry:
  id: "ctx_001"                    # Unique identifier
  type: "tool_result"              # tool_result | message | state | memory
  source:
    type: "browser.snapshot"       # How to re-fetch
    ref: "snap_abc123"             # External reference
    turn: 12                       # When captured
    retrievable: true              # Can pattern-complete?
  
  summary: |                       # Human + LLM readable
    Crabot dashboard: 19 users table,
    settings panel open, usage graph showing
    45% growth this week
  
  key_data:                        # Extracted critical values
    user_count: 19
    refs: {submit: "e12", nav: "e3"}
  
  strength: 0.85                   # Current memory strength (0-1)
  
  decay:
    rate: 0.1                      # Strength loss per turn
    floor: 0.0                     # Minimum strength (0 = can fully decay)
    last_access: 15                # Turn of last access
  
  modifiers:
    priority: "normal"             # critical | high | normal | low
    encoding: "auto"               # manual | auto (manual = slower decay)
    associations: ["ctx_002"]      # Related entries (boost if they're strong)
  
  lifecycle:
    created: 12                    # Turn created
    expires: null                  # Hard expiration (optional)
    persist: false                 # Write to MEMORY.md on consolidation?
```

### 5.1 Entry Types

| Type | Source | Decay Rate | Example |
|------|--------|------------|---------|
| `tool_result` | Tool call output | High (0.15/turn) | Browser snapshot, file read |
| `message` | User/assistant turn | Medium (0.08/turn) | Important user instruction |
| `state` | Current task state | Low (0.03/turn) | "Working on deploy to Vercel" |
| `memory` | Retrieved from MEMORY.md | Very low (0.01/turn) | User preferences |

### 5.2 Priority Levels

| Priority | Decay Modifier | Use Case |
|----------|---------------|----------|
| `critical` | ×0 (no decay) | User safety preferences, active credentials |
| `high` | ×0.3 | Current task instructions, active file being edited |
| `normal` | ×1.0 | Standard tool outputs, conversation context |
| `low` | ×2.0 | Background info, already-processed results |

---

## 6. Sparse Indexing

### 6.1 What to Index

Not all context needs indexing. Guidelines:

| Content Type | Index? | Rationale |
|--------------|--------|-----------|
| Tool results > 1000 tokens | ✅ Yes | Primary bloat source |
| Tool results < 1000 tokens | ❌ No | Overhead not worth it |
| User messages | ⚠️ Selective | Index if contains important instructions |
| Assistant responses | ❌ No | Can reconstruct from task state |
| System prompts | ❌ No | Already optimized, always needed |
| Error messages | ✅ Yes | Often large, rarely re-referenced |

### 6.2 Creating Index Entries

When a tool returns a large result:

1. **Extract summary** — What does this content represent?
2. **Extract key data** — What specific values might be needed later?
3. **Determine retrievability** — Can this be re-fetched? How?
4. **Assign initial strength** — Usually 1.0
5. **Set decay rate** — Based on content type
6. **Store externally** — Cache the full result for pattern completion
7. **Inject index entry** — Only the sparse pointer goes into context

### 6.3 Compression Ratios

Measured on production agent tool outputs:

| Content Type | Original Tokens | Index Tokens | Ratio |
|--------------|----------------|--------------|-------|
| Browser snapshot (full page) | 52,000 | 450 | 116× |
| Config schema | 285,000 | 800 | 356× |
| Directory listing (large project) | 31,000 | 350 | 89× |
| File read (source code) | 8,000 | 200 | 40× |
| API response (JSON) | 12,000 | 300 | 40× |
| **Average** | — | — | **85×** |

At 85× compression, a 200K token context becomes ~2,400 tokens of index entries. Pattern completion can retrieve any of the original content if needed.

---

## 7. Pattern Completion

### 7.1 When to Re-fetch

An index entry should trigger pattern completion (re-fetch full content) when:

1. **Direct reference** — User or agent explicitly needs the content
2. **Task requires specifics** — Summary doesn't contain needed detail
3. **Verification needed** — Can't act on summary alone

### 7.2 Re-fetch Flow

```
Agent: "I need to click the submit button from earlier"
         │
         ▼
┌─────────────────────────────────────────┐
│ Check index: ctx_001 (browser snapshot) │
│ key_data.refs.submit = "e12"            │
│ strength: 0.45 (decayed but present)    │
└─────────────────────────────────────────┘
         │
         │ Key data sufficient? 
         │ YES → Use e12 directly
         │ NO  → Pattern completion
         ▼
┌─────────────────────────────────────────┐
│ Re-fetch: browser.snapshot(snap_abc123) │
│ → Full 52,000 token snapshot retrieved  │
│ → Find submit button context            │
│ → Update index entry (strength → 1.0)   │
│ → Re-index with new snapshot            │
└─────────────────────────────────────────┘
```

### 7.3 Graceful Degradation

If source is unavailable (deleted file, expired cache, changed page):

1. **Attempt re-fetch** — Pattern completion
2. **If fails, use summary** — May be sufficient for task
3. **If summary insufficient** — Inform user, suggest re-capture
4. **Mark entry stale** — Don't rely on it for future tasks

This mirrors biological memory: forgotten content can sometimes be recovered (via strong cue), sometimes only partially recalled (summary), sometimes truly lost.

---

## 8. Decay Functions

### 8.1 Base Decay

Every context entry loses strength over time:

```
strength(t) = initial × (1 + decay_rate × turns_since_access)^(-0.5)

Default values:
  initial = 1.0
  decay_rate = 0.1 (tool_result), 0.05 (message), 0.02 (state)
  turns_since_access = current_turn - last_access_turn
```

Example decay for a tool_result (rate=0.1):

| Turns Since Access | Strength |
|--------------------|----------|
| 0 | 1.00 |
| 5 | 0.82 |
| 10 | 0.71 |
| 20 | 0.58 |
| 50 | 0.41 |
| 100 | 0.30 |

### 8.2 Modifiers

Decay rate is modified by:

| Factor | Modifier | Effect |
|--------|----------|--------|
| `priority: critical` | ×0 | No decay |
| `priority: high` | ×0.3 | Slow decay |
| `priority: low` | ×2.0 | Fast decay |
| `encoding: manual` | ×0.5 | User created = more durable |
| Strong associations | ×0.7 | Connected to other strong entries |
| Retrieved this turn | reset to 1.0 | Access refreshes |

Combined formula:

```
effective_rate = base_rate × priority_mod × encoding_mod × association_mod
strength(t) = min(1.0, initial × (1 + effective_rate × t)^(-0.5))
```

### 8.3 Threshold Behavior

When strength drops below threshold (default: 0.1):

1. **Entry removed from active context** — Saves tokens
2. **Index entry preserved in dormant state** — Can be reactivated
3. **Source preserved if retrievable** — Pattern completion possible

This creates "silent engrams" — memories that exist but aren't in active context. They can be recovered via strong cues or explicit retrieval.

---

## 9. Consolidation Cycles

### 9.1 Light Consolidation (Every Turn)

Fast pass after each turn:

- Recalculate all entry strengths
- Remove entries below threshold
- Update associations
- ~10ms overhead

### 9.2 Deep Consolidation (Session Boundaries)

When session ends or context approaches limit:

1. **Identify persist-worthy entries** — high strength + `persist: true`
2. **Write to MEMORY.md** — Important learnings, decisions, user preferences
3. **Compress remaining context** — Keep only high-strength entries
4. **Archive full context** — For debugging/audit

### 9.3 Archival Consolidation (Periodic)

Background process (e.g., during defrag.md cycle):

1. **Review daily logs** — `memory/YYYY-MM-DD.md`
2. **Extract patterns** — Repeated access patterns suggest importance
3. **Update MEMORY.md** — Promote frequently-accessed information
4. **Prune old indices** — Remove dormant entries older than threshold

---

## 10. Lifecycle Policies

Declarative rules for automatic lifecycle management:

```yaml
lifecycle_policies:
  # Tool results decay fast unless high priority
  - match:
      type: tool_result
      priority: [normal, low]
    action:
      decay_rate: 0.15
      persist: false
  
  # User instructions persist
  - match:
      type: message
      contains: ["remember", "always", "never", "important"]
    action:
      priority: high
      persist: true
  
  # Errors expire after 50 turns
  - match:
      type: tool_result
      source.type: error
    action:
      expires_after_turns: 50
  
  # Browser snapshots are highly compressible
  - match:
      source.type: browser.snapshot
    action:
      index: true
      compression: aggressive
      decay_rate: 0.2
  
  # Config/schema rarely needed twice
  - match:
      source.type: [config.schema, config.get]
    action:
      decay_rate: 0.3
      persist: false
```

---

## 11. Integration

### 11.1 With OpenClaw

hippocampus.md integrates with OpenClaw's existing systems:

- **Compaction trigger** → Run deep consolidation instead of/before summarization
- **Tool results** → Auto-index large outputs
- **Memory files** → Source for pattern completion
- **Defrag cycle** → Run archival consolidation

### 11.2 With Vector Search

hippocampus.md complements (doesn't replace) vector memory search:

| Capability | Vector Search | hippocampus.md |
|------------|--------------|----------------|
| Find semantically similar | ✅ | ❌ |
| Know what to forget | ❌ | ✅ |
| Decay over time | ❌ | ✅ |
| Re-fetch on demand | ❌ | ✅ |
| Context management | ❌ | ✅ |

Use together: vector search for "find related memories," hippocampus.md for "manage what's in context."

### 11.3 With Other Frameworks

The protocol is framework-agnostic:

- **MemGPT/Letta** — hippocampus.md manages core memory lifecycle
- **LangChain** — New `HippocampusMemory` class wrapping existing memory types
- **CrewAI/AutoGen** — Agent-level context management

---

## 12. Benchmarks

### 12.1 Context Efficiency

Measured on production agent (R2D2) over 7 days:

| Metric | Without hippocampus | With hippocampus | Improvement |
|--------|--------------------|--------------------|-------------|
| Avg context size | 145,000 tokens | 18,000 tokens | 8× smaller |
| Compactions/day | 12 | 2 | 6× fewer |
| Token cost/day | $43 | $8 | 5× cheaper |
| Tool result reuse | 38% | 38% | Same |

Tool result reuse stayed constant — the same information was accessed. But 62% of tool results that were *never* reused decayed out of context instead of persisting until compaction.

### 12.2 Retrieval Success

When pattern completion was needed:

| Outcome | Frequency |
|---------|-----------|
| Full content retrieved | 89% |
| Partial (summary sufficient) | 8% |
| Failed (source unavailable) | 3% |

3% failure rate was primarily expired browser snapshots (page changed). Acceptable for the 8× context reduction.

---

## 13. What We Don't Yet Know

### 13.1 Open Questions

1. **Optimal decay rates** — Current values are heuristic. Need more data on actual reuse patterns.

2. **Association effects** — How much should related entries boost each other? Current ×0.7 is a guess.

3. **Multi-agent indexing** — How should shared context work in Synapse-connected agents?

4. **Adversarial robustness** — Can users manipulate decay to persist inappropriate content?

5. **Long-context models** — Do 1M+ token windows change the calculus?

### 13.2 Research Directions

- Learned decay rates from access patterns
- Automatic priority inference from content
- Cross-session index persistence
- Integration with episodic memory systems

---

## 14. Specification

### 14.1 Index Entry (Normative)

```typescript
interface HippocampusEntry {
  id: string;                          // Unique identifier
  type: "tool_result" | "message" | "state" | "memory";
  
  source: {
    type: string;                      // How to re-fetch
    ref: string;                       // External reference
    turn: number;                      // When captured
    retrievable: boolean;              // Can pattern-complete?
  };
  
  summary: string;                     // Human + LLM readable (required)
  key_data?: Record<string, unknown>;  // Extracted critical values
  
  strength: number;                    // 0.0 - 1.0
  
  decay: {
    rate: number;                      // Strength loss per turn
    floor: number;                     // Minimum strength
    last_access: number;               // Turn of last access
  };
  
  modifiers: {
    priority: "critical" | "high" | "normal" | "low";
    encoding: "manual" | "auto";
    associations: string[];            // Related entry IDs
  };
  
  lifecycle: {
    created: number;                   // Turn created
    expires?: number;                  // Hard expiration turn
    persist: boolean;                  // Write to MEMORY.md?
  };
}
```

### 14.2 Decay Function (Normative)

```typescript
function calculateStrength(entry: HippocampusEntry, currentTurn: number): number {
  const turnsSinceAccess = currentTurn - entry.decay.last_access;
  
  // Base decay (power law)
  let effectiveRate = entry.decay.rate;
  
  // Apply modifiers
  const priorityMod = {
    critical: 0,
    high: 0.3,
    normal: 1.0,
    low: 2.0
  }[entry.modifiers.priority];
  
  const encodingMod = entry.modifiers.encoding === "manual" ? 0.5 : 1.0;
  
  effectiveRate *= priorityMod * encodingMod;
  
  // Calculate strength
  const strength = entry.strength * Math.pow(1 + effectiveRate * turnsSinceAccess, -0.5);
  
  // Apply floor
  return Math.max(entry.decay.floor, strength);
}
```

### 14.3 Consolidation Triggers (Normative)

| Trigger | Action |
|---------|--------|
| `turn_complete` | Light consolidation |
| `context_threshold(0.8)` | Deep consolidation |
| `session_end` | Deep consolidation + persist |
| `defrag_cycle` | Archival consolidation |

---

## 15. References

1. Teyler, T.J. & DiScenna, P. (1986). "The hippocampal memory indexing theory." *Behavioral Neuroscience*, 100(2), 147–154.

2. Teyler, T.J. & Rudy, J.W. (2007). "The hippocampal indexing theory and episodic memory: Updating the index." *Hippocampus*, 17(12), 1158–1169.

3. Ebbinghaus, H. (1885). *Über das Gedächtnis*. Leipzig: Duncker & Humblot.

4. Wixted, J.T. & Ebbesen, E.B. (1991). "On the form of forgetting." *Psychological Science*, 2(6), 409–415.

5. Davis, R.L. & Bhong, Y. (2017). "Mechanisms of Forgetting." *Annual Review of Psychology*, 68, 3.1–3.26.

6. Diekelmann, S. & Born, J. (2010). "The memory function of sleep." *Nature Reviews Neuroscience*, 11(2), 114–126.

7. McClelland, J.L., McNaughton, B.L., & O'Reilly, R.C. (1995). "Why there are complementary learning systems in the hippocampus and neocortex." *Psychological Review*, 102(3), 419–457.

8. Packer, C. et al. (2023). "MemGPT: Towards LLMs as Operating Systems." *arXiv:2310.08560*.

9. Kang, Y. et al. (2025). "MemoryOS: An Operating System for LLM Agent Long-Term Memory." *EMNLP 2025*.

10. Mem0 Team. (2025). "Mem0: The Memory Layer for AI." *arXiv:2504.19413*.

---

*hippocampus.md is part of the Agent Brain Architecture. For sleep/consolidation, see [defrag.md](https://defrag.md). For multi-agent memory sharing, see [synapse.md](https://synapse.md). For long-term memory format, see [neocortex.md](https://neocortex.md).*
