# hippocampus.md

[![Part of the Agent Brain Architecture](https://img.shields.io/badge/part_of-Agent_Brain_Architecture-blue)](https://github.com/starvex/agent-brain-architecture)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

> **Context Lifecycle Protocol for AI Agents**
> 
> *Replaces crude context truncation with biologically-inspired memory decay and sparse indexing.*

## What is hippocampus.md?

**hippocampus.md** is a context lifecycle protocol that solves AI agents' memory bloat problem using principles from neuroscience. Instead of carrying massive tool outputs in context forever, it creates sparse index entries that decay over time and can be retrieved on demand.

**Part of the Agent Brain Architecture:**
[defrag.md](https://defrag.md) · [synapse.md](https://synapse.md) · **hippocampus.md** · [neocortex.md](https://neocortex.md)

## The Problem It Solves

AI agents accumulate context continuously. A single browser snapshot: **50,000 tokens**. A config schema: **285,000 tokens**. After 30 minutes of work, context windows overflow with tool results that were used once and never referenced again.

Current solutions are crude:
- **Truncation**: Removes oldest content regardless of importance
- **Summarization**: Loses specificity and compounds errors over time

Neither approach mirrors how biological memory actually works.

## How It Works

hippocampus.md implements four core mechanisms:

### 1. Classify
Every context entry is classified by type and importance:
- **Decisions** → Persist longer (30× decay resistance)
- **User intents** → Persist longer (20× decay resistance)  
- **Tool results** → Decay fast unless referenced
- **Ephemeral** (heartbeats) → Decay very fast

### 2. Score
Each entry gets an importance score modified by:
- **Recency bonus** (last 5 entries: +0.15)
- **Size penalty** (huge tool outputs: -0.15)
- **Reference bonus** (cited by later messages: +0.20)

### 3. Decay
Memories decay exponentially but can resist with retention floors:
```
retention = max(floor, importance × e^(-λ × age))
```

### 4. Sparse Index
Instead of storing full content, create compressed pointers:
```
BEFORE: [52,847 tokens] Full browser snapshot
AFTER:  [487 tokens] Index entry with key references
→ 108× compression
```

## Live Results

**Production data from R2D2 agent (7 days):**

| Metric | Before | After | Improvement |
|--------|--------|-------|-------------|
| **Context size** | 202,773 tokens | 5,100 tokens | **39× smaller** |
| **Messages scored** | 115 | 115 | Same coverage |
| **Token cost/day** | $43 | $8 | **5× cheaper** |
| **Compactions needed** | 12/day | 2/day | **6× fewer** |

**62% of tool outputs were never reused** — they decayed out of context instead of persisting until expensive compaction.

## Quick Install

### Prerequisites
- OpenClaw with Pi agent configured
- Node.js/TypeScript support

### Installation

1. **Copy the extension:**
   ```bash
   # Download hippocampus.ts from this repo
   cp extension/hippocampus.ts ~/.pi/extensions/
   ```

2. **Configure decay settings** in the extension:
   ```typescript
   const CONFIG = {
     decayRates: {
       decision:    0.03,   // decisions persist ~30× longer
       user_intent: 0.05,   // user goals persist ~20× longer  
       context:     0.12,   // general context — standard decay
       tool_result: 0.20,   // tool outputs decay fast
       ephemeral:   0.35,   // heartbeats/status — decay very fast
     },
     sparseThreshold: 0.25, // below this → pointer only
     compressThreshold: 0.65, // below this → compressed summary
     // ...
   };
   ```

3. **Set compaction mode to "default"** (not "safeguard"):
   ```bash
   # In your Pi agent config
   compaction_mode: "default"  # Required for extension hooks
   ```

4. **Restart Pi agent**:
   ```bash
   openclaw gateway restart
   ```

5. **Check logs**:
   ```bash
   tail -f ~/.pi/hippocampus.log
   ```

## Documentation

- **[Getting Started Guide](docs/GUIDE.md)** — Step-by-step setup and tuning
- **[Research Whitepaper](docs/WHITEPAPER.md)** — Full scientific background and theory
- **[Extension Code](extension/hippocampus.ts)** — TypeScript implementation

## Architecture

```
┌─────────────────────────────────────────┐
│             CONTEXT WINDOW              │
│  ┌─────────────────────────────────┐    │
│  │       HIPPOCAMPUS INDEX         │    │     ┌─────────────────────┐
│  │                                 │    │────▶│   EXTERNAL SOURCES  │
│  │  Entry A [str: 0.92] → source_a │    │     │                     │
│  │  Entry B [str: 0.45] → source_b │    │     │  • File cache       │
│  │  Entry C [str: 0.12] → source_c │    │     │  • Browser snapshots│
│  │            ▲                    │    │     │  • API responses     │
│  │            │ decay < threshold  │    │     │  • Tool outputs      │
│  │            ▼                    │    │     │                     │
│  │  Entry C (DECAYED) → recoverable│    │     └─────────────────────┘
│  └─────────────────────────────────┘    │              ▲
│                                         │              │
│  Active: ~5K tokens (index only)        │              │ pattern
│  Retrievable: ~500K tokens (external)   │              │ completion
└─────────────────────────────────────────┘              │
                                                         │
                                    "I need that browser │
                                     snapshot from earlier"
```

## Configuration

### Decay Rates (per-type)
```typescript
decayRates: {
  decision:    0.03,   // Persist 30× longer than tool results
  user_intent: 0.05,   // User goals persist 20× longer
  context:     0.12,   // General conversation — standard
  tool_result: 0.20,   // Tool outputs decay fast if unused
  ephemeral:   0.35,   // Heartbeats decay very fast
}
```

### Retention Thresholds
```typescript
sparseThreshold: 0.25,    // Below this → pointer only
compressThreshold: 0.65,  // Below this → compressed summary
retentionFloor: {         // Minimum retention per type
  decision: 0.50,         // Decisions never drop below 50%
  user_intent: 0.35,      // User goals never drop below 35%
}
```

## Tuning Guide

### For Long Sessions
- Lower `sparseThreshold` to 0.15 (more aggressive indexing)
- Increase `retentionFloor` for `decision` type

### For Tool-Heavy Workflows  
- Increase `tool_result` decay rate to 0.3
- Lower `maxSparseIndexTokens` to 2000

### For Memory-Sensitive Tasks
- Set `priority: "high"` on critical tool outputs
- Use `encoding: "manual"` for user-created content

## Troubleshooting

**Context still growing too large?**
- Check `~/.pi/hippocampus.log` for scoring details
- Verify `compaction_mode: "default"` (not "safeguard")
- Increase decay rates for high-volume tool types

**Missing important context?**
- Lower decay rates for critical types
- Set retention floors higher
- Use `priority: "high"` modifiers

**Pattern completion failing?**
- Check external source availability (browser cache, file existence)
- Verify `retrievable: true` in index entries
- Review source reference validity

## Related Projects

- **[defrag.md](https://defrag.md)** — Sleep/consolidation cycles for agents
- **[synapse.md](https://synapse.md)** — Multi-agent memory sharing protocol  
- **[neocortex.md](https://neocortex.md)** — Long-term memory format standard

## License

MIT License - see [LICENSE](LICENSE) file.

## Contributing

hippocampus.md is part of the Agent Brain Architecture research project. For questions, suggestions, or contributions, please open an issue.

---

*hippocampus.md: Because agents, like humans, need to know what to forget.*