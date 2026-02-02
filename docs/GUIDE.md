# Getting Started with hippocampus.md

> 🌐 **Website**: [hippocampus.md](https://hippocampus.md) — Full documentation, whitepaper, and protocol spec

This guide will walk you through setting up and tuning hippocampus.md for optimal context lifecycle management.

## Prerequisites

Before starting, ensure you have:

- **OpenClaw with Pi agent** — hippocampus.md is a Pi extension
- **Node.js/TypeScript support** — for the extension runtime
- **Basic understanding of AI agent context** — what tokens are, why context size matters

### Check Your Setup

Verify Pi agent is working:
```bash
openclaw gateway status
# Should show Pi agent running

ls ~/.pi/extensions/
# Should exist (create if not: mkdir -p ~/.pi/extensions)
```

## Installation

### Step 1: Download the Extension

Copy the hippocampus.ts extension file to your Pi extensions directory:

```bash
# Option A: Clone this repo and copy
git clone https://github.com/starvex/hippocampus-md.git
cp hippocampus-md/extension/hippocampus.ts ~/.pi/extensions/

# Option B: Download directly
curl -o ~/.pi/extensions/hippocampus.ts \
  https://raw.githubusercontent.com/starvex/hippocampus-md/main/extension/hippocampus.ts
```

### Step 2: Configure Compaction Mode

**Critical**: Set your Pi agent to use `"default"` compaction mode (NOT `"safeguard"`):

```bash
# Edit your Pi configuration file
nano ~/.pi/config.json
```

Set:
```json
{
  "compaction_mode": "default"
}
```

The `"safeguard"` mode bypasses extension hooks, preventing hippocampus.md from working.

### Step 3: Restart Pi Agent

```bash
openclaw gateway restart
```

### Step 4: Verify Installation

Check the hippocampus log:
```bash
tail -f ~/.pi/hippocampus.log
```

You should see:
```
[2026-02-02T22:47:40.123Z] hippocampus extension LOADED
[2026-02-02T22:47:40.124Z] [hippocampus] 🧠 hippocampus.md extension loaded
```

If the log file doesn't exist or shows errors, see [Troubleshooting](#troubleshooting) below.

## Configuration

hippocampus.md works out-of-the-box with sensible defaults, but you can tune it for your specific use case.

### Core Configuration Options

Edit `~/.pi/extensions/hippocampus.ts` and modify the `CONFIG` object:

```typescript
const CONFIG = {
  // Per-type decay rates (lower = remembers longer)
  decayRates: {
    decision:    0.03,   // decisions persist ~30× longer
    user_intent: 0.05,   // user goals persist ~20× longer  
    context:     0.12,   // general context — standard decay
    tool_result: 0.20,   // tool outputs decay fast
    ephemeral:   0.35,   // heartbeats/status — decay very fast
    unknown:     0.15,   // unknown — moderate decay
  },
  
  decayLambda: 0.12,            // fallback decay rate
  sparseThreshold: 0.25,        // below this → pointer only
  compressThreshold: 0.65,      // below this → compressed summary  
  
  retentionFloor: {             // minimum retention per type
    decision:    0.50,          // decisions never drop below 0.50
    user_intent: 0.35,          // user goals never drop below 0.35
  },
  
  maxSparseIndexTokens: 2500,   // max tokens for sparse index section
  summaryModel: "gemini-2.5-flash", // cheap model for classification
  debug: true,                  // log to console for development
};
```

### Understanding Decay Rates

Decay rates control how fast different content types lose strength:

| Type | Rate | Half-life | Example Content |
|------|------|-----------|----------------|
| `decision` | 0.03 | ~46 turns | "I'll deploy using Vercel" |
| `user_intent` | 0.05 | ~28 turns | "Build me a login system" |
| `context` | 0.12 | ~12 turns | Normal conversation |
| `tool_result` | 0.20 | ~7 turns | File reads, API responses |
| `ephemeral` | 0.35 | ~4 turns | Heartbeats, status checks |

Lower rates = longer persistence.

### Understanding Thresholds

- **sparseThreshold (0.25)**: Below this strength, only store index pointer
- **compressThreshold (0.65)**: Below this, store compressed summary
- Above compressThreshold: Store full content

```
Strength 1.0 ████████████████████ Full content
         0.65 ████████████▓▓▓▓▓▓▓▓ ← compressThreshold
         0.25 █████▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ ← sparseThreshold  
         0.0  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ Dropped from context
```

## How It Works Step-by-Step

Let's trace through a typical session to understand the lifecycle:

### Turn 1: Tool Execution
```bash
# User asks agent to read a large file
User: "What's in the package.json file?"
```

Agent calls `file.read("package.json")` → Returns 8,000 tokens of JSON.

### Turn 2: Classification & Scoring
hippocampus.md:
1. **Classifies** the tool result as `type: "tool_result"`
2. **Scores** importance: base 0.30, +0.15 recency bonus = **0.45**
3. **Sets decay rate**: 0.20 (tool results decay fast)
4. **Creates index entry**:
   ```
   [ctx_001] tool_result: file.read(package.json)
   strength: 0.45, decay: 0.20/turn
   summary: "package.json with dependencies: express, react, ..."
   key_data: {name: "my-app", version: "1.0.0", ...}
   ```

### Turn 3-5: Active Use
Agent references the package.json content:
- Strength **resets to 1.0** each time it's accessed
- Decay clock resets

### Turn 10: Natural Decay
No access for 5 turns:
```
strength = 0.45 × (1 + 0.20 × 5)^(-0.5) = 0.45 × (2.0)^(-0.5) = 0.32
```
Still above `sparseThreshold` (0.25) → stays in context.

### Turn 20: Below Sparse Threshold
No access for 15 turns:
```
strength = 0.45 × (1 + 0.20 × 15)^(-0.5) = 0.45 × (4.0)^(-0.5) = 0.23
```
Below 0.25 → **Removed from active context**, index entry preserved.

### Turn 25: Pattern Completion
```bash
User: "What was the version in that package.json?"
```

Agent needs the version but content is no longer in context:
1. **Checks index**: Found `ctx_001` with key_data.version = "1.0.0"
2. **Key data sufficient?** YES → Uses "1.0.0" directly
3. **Strength reset**: Entry reactivated with strength 1.0

If key_data was insufficient, agent would **re-read the file** (pattern completion).

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                     CONTEXT WINDOW                          │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │              HIPPOCAMPUS INDEX                      │    │
│  │                                                     │    │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐   │    │
│  │  │ Entry A     │ │ Entry B     │ │ Entry C     │   │    │
│  │  │ str: 0.92   │ │ str: 0.45   │ │ str: 0.12   │   │    │
│  │  │ type: dcsn  │ │ type: tool  │ │ type: tool  │   │    │
│  │  │ → source_a  │ │ → source_b  │ │ → source_c  │   │    │
│  │  └─────────────┘ └─────────────┘ └─────────────┘   │    │
│  │                         │                           │    │
│  │                         │ decay threshold: 0.25     │    │
│  │                         ▼                           │    │
│  │                  ┌─────────────┐                    │    │
│  │                  │ Entry C     │ BELOW THRESHOLD    │    │
│  │                  │ (decayed)   │ → remove from ctx  │    │
│  │                  │ preserved   │ → recoverable      │    │
│  │                  └─────────────┘                    │    │
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
│  │ (memory) │ │ (cache)  │ │ (API)    │ │ (browser)│       │
│  │ decisions│ │ file     │ │ config   │ │ snapshot │       │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘       │
└─────────────────────────────────────────────────────────────┘
```

## Tuning for Different Use Cases

### Long-Running Sessions
If your agent runs for hours, tune for more aggressive decay:

```typescript
const CONFIG = {
  sparseThreshold: 0.15,     // Lower threshold (more indexing)
  decayRates: {
    tool_result: 0.30,       // Faster decay for tool outputs
    ephemeral: 0.50,         // Very fast for heartbeats
  },
  maxSparseIndexTokens: 2000, // Smaller sparse index
};
```

### Tool-Heavy Workflows
For agents that make many tool calls:

```typescript
const CONFIG = {
  decayRates: {
    tool_result: 0.25,       // Faster tool result decay
  },
  retentionFloor: {
    decision: 0.60,          // Keep decisions longer
    user_intent: 0.45,       // Keep user goals longer
  },
};
```

### Memory-Sensitive Applications
For agents handling sensitive user data:

```typescript
const CONFIG = {
  retentionFloor: {
    user_intent: 0.40,       // Preserve user context
  },
  // Use priority modifiers in code:
  // entry.modifiers.priority = "high"; // for critical data
  // entry.modifiers.encoding = "manual"; // for user-created content
};
```

### Developer/Debug Mode
For development and debugging:

```typescript
const CONFIG = {
  debug: true,               // Verbose logging
  sparseThreshold: 0.35,     // Conservative threshold
  compressThreshold: 0.75,   // Keep more full content
};
```

## Per-Entry Priority Control

You can also control individual entries programmatically:

### In Tool Results
When generating large tool outputs, hint to hippocampus about importance:

```typescript
// In your tool code, add metadata:
return {
  content: largeResult,
  metadata: {
    hippocampus: {
      priority: "high",        // critical | high | normal | low
      persist: true,           // write to MEMORY.md on consolidation
      decay_override: 0.05,    // custom decay rate
    }
  }
};
```

### User Message Patterns
hippocampus automatically detects important user instructions:

```
User: "Remember, always use TypeScript for new projects"
→ Classified as user_intent, priority: high, persist: true

User: "What's the weather?"  
→ Classified as user_intent, standard priority

User: "heartbeat_ok"
→ Classified as ephemeral, fast decay
```

## Troubleshooting

### Context Still Growing Too Large

**Check the logs:**
```bash
tail -20 ~/.pi/hippocampus.log
```

Look for scoring details:
```
[hippocampus] 📊 Scoring complete: {"total":45,"sparse":12,"compressed":8,"kept":25,"totalTokens":125000}
[hippocampus] 📝 Summary built: 8500 tokens (14.7× compression)
```

**Common causes:**
- **Wrong compaction mode**: Verify `compaction_mode: "default"` 
- **All entries marked high priority**: Review priority settings
- **Decay rates too low**: Increase rates for high-volume types

**Solutions:**
```typescript
// More aggressive settings
const CONFIG = {
  decayRates: {
    tool_result: 0.35,     // Faster decay
    context: 0.20,         // Faster general decay
  },
  sparseThreshold: 0.20,   // Earlier indexing
};
```

### Missing Important Context

**Symptoms:**
- Agent can't find information it should know
- "I don't have that file content" when it was just read

**Causes:**
- Decay rates too aggressive
- Retention floors too low
- Important content not properly classified

**Solutions:**
```typescript
// More conservative settings
const CONFIG = {
  retentionFloor: {
    decision: 0.60,        // Higher floors
    user_intent: 0.50,     
    tool_result: 0.10,     // Even tool results have some floor
  },
  decayRates: {
    decision: 0.02,        // Slower decay
    user_intent: 0.04,
  },
};
```

### Pattern Completion Failing

**Error messages:**
- "Source not available for pattern completion"
- "Failed to retrieve ctx_123"

**Check external sources:**
```bash
# Browser cache
ls ~/.cache/openclaw/browser/
# File cache  
ls ~/.pi/cache/
# Check if files still exist
```

**Common fixes:**
- **Browser snapshots expire** when page changes — this is normal
- **File moves/deletes** break references — use absolute paths when possible
- **API responses** aren't cacheable — design for summary-only usage

### No Decay Happening

**Check:**
1. **Extension loading**: Should see "extension LOADED" in logs
2. **Compaction triggering**: hippocampus only runs during compaction
3. **Force compaction**: Long conversation to trigger threshold

```bash
# Check if extension is active
grep "hippocampus" ~/.pi/hippocampus.log | tail -5

# Force compaction by having a very long conversation
# Context will eventually hit threshold and trigger
```

### Debug Mode

Enable verbose logging:

```typescript
const CONFIG = {
  debug: true,
};
```

This will log:
- Entry classification decisions
- Strength calculations  
- Index/compress/keep decisions
- Token counts and compression ratios

## Performance

hippocampus.md adds minimal overhead:

| Operation | Time | Impact |
|-----------|------|--------|
| Light consolidation (per turn) | ~10ms | Negligible |
| Deep consolidation | ~200ms | During compaction only |
| Pattern completion | Variable | Only when needed |

Memory usage is actually *reduced* because context is much smaller.

## Next Steps

Once hippocampus.md is working well:

1. **Tune decay rates** based on your agent's actual usage patterns
2. **Monitor compression ratios** — aim for 10-50× typical compression
3. **Set up consolidation** with [defrag.md](https://defrag.md) for session boundaries
4. **Share memory** between agents with [synapse.md](https://synapse.md)
5. **Implement long-term memory** with [neocortex.md](https://neocortex.md)

## Getting Help

- **Issues/Questions**: [GitHub Issues](https://github.com/starvex/hippocampus-md/issues)
- **Research Paper**: [WHITEPAPER.md](WHITEPAPER.md)
- **Extension Source**: [extension/hippocampus.ts](../extension/hippocampus.ts)

---

*Happy memory management! 🧠*