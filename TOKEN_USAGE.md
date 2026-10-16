# Token Usage Log

## Purpose
Track API token consumption for Claude/Anthropic API calls made during this project.

---

## Session Log

| Date | Time | Operation | Model | Est. Input Tokens | Est. Output Tokens | Total | Notes |
|------|------|-----------|-------|-------------------|-------------------|-------|-------|
| 2026-08-04 | | Initial setup & Supabase fix | Sonnet 5 | ~15,000 | ~8,000 | ~23,000 | Fixed auth key, password hash, login |
| 2026-08-04 | | BRAIN.md creation | Sonnet 5 | ~2,000 | ~3,500 | ~5,500 | Full troubleshooting documentation |

---

## How to Estimate Tokens

### Rough Rules of Thumb
- **1 token ≈ 4 characters** (English text)
- **1 token ≈ 0.75 words**
- **Typical page of text** ≈ 500-1000 tokens
- **Code file** ≈ 200-2000 tokens depending on size

### For This Project
| Action | Est. Tokens |
|--------|-------------|
| Read a typical .ts/.tsx file | 500-3000 |
| Read supabase_schema.sql | ~5000 |
| Edit a file | Input: file size + Output: diff |
| Bash command + output | 100-5000 |
| Web search | ~2000 |
| Agent task | 5000-50000 |

---

## Monthly Budget Tracking

| Month | Budget | Used | Remaining | % Used |
|-------|--------|------|-----------|--------|
| Aug 2026 | | ~28,500 | | |

---

## Quick Reference: Model Pricing (Anthropic API)

| Model | Input ($/1M) | Output ($/1M) |
|-------|--------------|---------------|
| Opus 4.1 | $15 | $75 |
| Sonnet 4 | $3 | $15 |
| Haiku 3.5 | $0.80 | $4 |
| Sonnet 5 (current) | $3 | $15 |

---

## Notes
- This log is **manual** — update after significant sessions
- For exact usage, check [Anthropic Console](https://console.anthropic.com) → Usage
- CLI tokens are billed to your Anthropic account, not this project