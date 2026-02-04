---
name: hippocampus
description: Decay-based memory scoring and context lifecycle management for AI agents.
metadata: { "openclaw": { "emoji": "🧠", "requires": { "bins": ["node"] } } }
---

# hippocampus.md

Decay-based memory scoring and context lifecycle management. Part of the Agent Brain Architecture.

**Protocol spec:** https://hippocampus.md/whitepaper

## Quick Install

```bash
npx hippocampus-md init
```

This auto-detects your platform (Pi/OpenClaw/Clawdbot) and installs the extension.

## Entry Types & Decay Rates

| Type | λ (decay) | Description |
|------|-----------|-------------|
| `decision` | 0.03 | Agent decisions — persists ~30× longer |
| `user_intent` | 0.05 | User goals — persists ~20× longer |
| `context` | 0.12 | General conversation — standard decay |
| `tool_result` | 0.20 | Tool outputs — decays fast |
| `ephemeral` | 0.35 | Heartbeats, status — decays very fast |

## Retention Formula

```
retention = max(floor, importance × e^(-λ × age))
```

## Score Memory Files

```bash
# Score a specific file
npx hippocampus-md score memory/2026-02-03.md

# Output: memory/2026-02-03.scores.json
```

## Check Status

```bash
npx hippocampus-md status
```

## Manual Tagging

Tag entries in your daily notes for explicit scoring:

```markdown
<!-- hippocampus: type=decision score=0.85 -->
Decided to use Railway for deployment.

<!-- hippocampus: type=user_intent score=0.72 -->
User wants the landing page done by Friday.
```

## Configuration

Create `hippocampus.config.json` in workspace root:

```json
{
  "enabled": true,
  "debug": false,
  "decay": {
    "decision": 0.03,
    "user_intent": 0.05,
    "context": 0.12,
    "tool_result": 0.20,
    "ephemeral": 0.35
  },
  "retention": {
    "sparse": 0.25,
    "compress": 0.65
  }
}
```

## Defrag Integration

Scores integrate with defrag.md for nightly consolidation:
- `score < 0.25` → sparse index (pointers only)
- `0.25 ≤ score < 0.65` → compressed (summary)
- `score ≥ 0.65` → kept (full content)

## Links

- **Docs:** https://hippocampus.md
- **Whitepaper:** https://hippocampus.md/whitepaper
- **GitHub:** https://github.com/starvex/hippocampus-md

---

*Part of the Agent Brain Architecture*
