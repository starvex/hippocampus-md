# hippocampus.md Extension

> Decay-based context lifecycle management for Pi/OpenClaw agents

## What It Does

Replaces default compaction with intelligent memory management inspired by hippocampal memory systems:

- **Importance Scoring** — Classifies messages by type (decisions, user intent, tool results, etc.)
- **Exponential Decay** — Recent and important content persists; old noise fades
- **Sparse Indexing** — Decayed content becomes pointers, not lost completely
- **Per-Type Decay Rates** — Decisions decay 6× slower than tool outputs

## Installation

### Local (per-workspace)

```bash
mkdir -p .pi/extensions
cp hippocampus.ts .pi/extensions/
```

### Global

```bash
mkdir -p ~/.pi/extensions
cp hippocampus.ts ~/.pi/extensions/
```

## Configuration

Create `hippocampus.config.json` in your workspace root (optional):

```json
{
  "decayRates": {
    "decision": 0.03,
    "user_intent": 0.05,
    "context": 0.12,
    "tool_result": 0.20,
    "ephemeral": 0.35,
    "unknown": 0.15
  },
  "sparseThreshold": 0.25,
  "compressThreshold": 0.65,
  "retentionFloor": {
    "decision": 0.50,
    "user_intent": 0.35
  },
  "maxSparseIndexTokens": 2500,
  "debug": false,
  "logFile": ".pi/hippocampus.log"
}
```

### Configuration Options

| Option | Default | Description |
|--------|---------|-------------|
| `decayRates` | See below | Exponential decay rate (λ) per message type |
| `sparseThreshold` | `0.25` | Below this retention → pointer only |
| `compressThreshold` | `0.65` | Below this → compressed summary |
| `retentionFloor` | `{}` | Minimum retention per type (anchor) |
| `maxSparseIndexTokens` | `2500` | Max tokens for sparse index section |
| `debug` | `false` | Enable console logging |
| `logFile` | `.pi/hippocampus.log` | Log file path |

### Default Decay Rates

| Type | λ | Meaning |
|------|---|---------|
| `decision` | 0.03 | Decisions persist ~30× longer |
| `user_intent` | 0.05 | User goals persist ~20× longer |
| `context` | 0.12 | Standard decay (baseline) |
| `tool_result` | 0.20 | Tool outputs decay fast |
| `ephemeral` | 0.35 | Heartbeats/status decay very fast |
| `unknown` | 0.15 | Moderate decay |

## How It Works

### 1. Classification

Each message is classified:
- `tool_result` — Output from tool calls
- `decision` — Agent decisions and plans
- `user_intent` — User requests and goals
- `ephemeral` — Heartbeats, status checks
- `context` — General conversation
- `unknown` — Unclassified

### 2. Importance Scoring

Base importance by type, modified by:
- **Recency bonus** (+0.15 for last 5 messages)
- **Size penalty** (-0.15 for >10K tokens, -0.25 for >30K)
- **Reference bonus** (+0.20 if later messages reference this content)

### 3. Decay Calculation

```
retention = max(floor, importance × e^(-λ × age))
```

Where:
- `age` = position from end (0 = newest)
- `λ` = per-type decay rate
- `floor` = minimum retention for type (optional anchor)

### 4. Summary Generation

Based on retention score:
- `retention ≥ 0.65` → Full content preserved
- `0.25 ≤ retention < 0.65` → Compressed summary line
- `retention < 0.25` → Sparse index pointer only

## Summary Format

```markdown
# hippocampus.md Compaction
<!-- metadata -->

## Goal
- User intent extracted from messages

## Prior Context
Previous summary content

## Active Context (high retention)
Full content of high-retention entries

## Compressed (mid retention — re-fetch if needed)
• (r=0.45) [TOOL:read] 1200tok → "File content preview..."
• (r=0.38) [USER] "User message preview..."

## Sparse Index (decayed — pointers only)
[TOOL:exec] 5000tok → "Command output..."
[ASSISTANT] Response preview...

<!-- hippocampus stats: 150000tok → 3500tok (42.9× compression) -->
```

## Logging

Logs are written to `.pi/hippocampus.log` (or configured path):

```
[2026-02-02T15:00:00.000Z] [hippocampus] 🧠 extension loaded
[2026-02-02T15:30:00.000Z] [hippocampus] 🔬 Compaction triggered {"messages":115,"tokensBefore":163000}
[2026-02-02T15:30:01.000Z] [hippocampus] 📊 Scoring complete {"total":115,"sparse":78,"compressed":25,"kept":12}
[2026-02-02T15:30:01.500Z] [hippocampus] 📝 Summary built {"summaryTokens":3200,"compressionRatio":"50.9"}
```

## Requirements

- Pi Coding Agent (via OpenClaw or standalone)
- TypeScript runtime (jiti handles compilation)

## Part of Agent Brain Architecture

- [defrag.md](https://defrag.md) — Sleep-inspired memory consolidation
- [synapse.md](https://synapse.md) — Multi-agent memory sharing
- **hippocampus.md** — Context lifecycle management (this)
- [neocortex.md](https://neocortex.md) — Long-term memory format

## License

MIT © Roman Godz, R2D2

## Links

- Website: https://hippocampus.md
- GitHub: https://github.com/starvex/hippocampus-md
- Whitepaper: https://hippocampus.md/whitepaper
