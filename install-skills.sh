#!/usr/bin/env bash
# install-skills.sh — Install recommended external Claude Code skills for Bestfriend
#
# Downloads SKILL.md files directly from GitHub into .claude/skills/ (project-local).
# No external tools required — only curl (pre-installed on macOS).
#
# Usage:
#   chmod +x install-skills.sh && ./install-skills.sh

set -euo pipefail

SKILLS_DIR="$(cd "$(dirname "$0")" && pwd)/.claude/skills"
mkdir -p "$SKILLS_DIR"

GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'; NC='\033[0m'

install_skill() {
  local name="$1"
  local url="$2"
  local description="$3"

  local dest="$SKILLS_DIR/$name"
  mkdir -p "$dest"

  printf "  %-32s" "$name"

  if curl -fsSL "$url" -o "$dest/SKILL.md" 2>/dev/null; then
    echo -e "${GREEN}✓${NC}  $description"
  else
    # Try alternate URL patterns
    local alt_url="${url/\/main\///refs/heads/main/}"
    if curl -fsSL "$alt_url" -o "$dest/SKILL.md" 2>/dev/null; then
      echo -e "${GREEN}✓${NC}  $description"
    else
      rm -f "$dest/SKILL.md"
      rmdir "$dest" 2>/dev/null || true
      echo -e "${YELLOW}✗ skipped${NC} (URL not reachable — see manual install below)"
    fi
  fi
}

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Bestfriend — External Skill Installer"
echo "  Installing to: $SKILLS_DIR"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# ── OpenAI ────────────────────────────────────────────────────────────────────
echo ""
echo "[ OpenAI ]"
install_skill "openai-docs-official" \
  "https://raw.githubusercontent.com/openai/skills/main/skills/.curated/openai-docs/SKILL.md" \
  "Authoritative OpenAI docs: Chat, Embeddings, Whisper, model selection"

install_skill "openai-security" \
  "https://raw.githubusercontent.com/openai/skills/main/skills/.curated/security-best-practices/SKILL.md" \
  "Language-specific security vulnerability patterns"

# ── Vercel / React ────────────────────────────────────────────────────────────
echo ""
echo "[ React / Frontend ]"
install_skill "react-best-practices" \
  "https://raw.githubusercontent.com/vercel-labs/next-skills/main/skills/react-best-practices/SKILL.md" \
  "64 React performance rules: waterfalls, bundle, re-renders, Suspense"

install_skill "composition-patterns" \
  "https://raw.githubusercontent.com/vercel-labs/next-skills/main/skills/composition-patterns/SKILL.md" \
  "React component composition and reusable patterns"

install_skill "web-design-guidelines" \
  "https://raw.githubusercontent.com/vercel-labs/next-skills/main/skills/web-design-guidelines/SKILL.md" \
  "Web design guidelines and standards from Vercel"

# ── Security (Trail of Bits) ──────────────────────────────────────────────────
echo ""
echo "[ Security ]"
install_skill "insecure-defaults" \
  "https://raw.githubusercontent.com/trailofbits/skills/main/plugins/insecure-defaults/SKILL.md" \
  "Detect hardcoded secrets, fail-open patterns, weak crypto"

install_skill "sharp-edges" \
  "https://raw.githubusercontent.com/trailofbits/skills/main/plugins/sharp-edges/SKILL.md" \
  "Error-prone APIs and dangerous Node/Electron configurations"

install_skill "differential-review" \
  "https://raw.githubusercontent.com/trailofbits/skills/main/plugins/differential-review/SKILL.md" \
  "Security-focused diff review with git history analysis"

# ── Garry Tan / gstack ────────────────────────────────────────────────────────
echo ""
echo "[ Code Quality / gstack ]"
install_skill "gstack-review" \
  "https://raw.githubusercontent.com/garrytan/gstack/main/review/SKILL.md" \
  "Staff Engineer PR review: race conditions, LLM trust boundaries"

install_skill "gstack-investigate" \
  "https://raw.githubusercontent.com/garrytan/gstack/main/investigate/SKILL.md" \
  "Systematic root-cause debugging"

install_skill "gstack-qa" \
  "https://raw.githubusercontent.com/garrytan/gstack/main/qa/SKILL.md" \
  "QA Lead: find bugs, fix with atomic commits"

install_skill "gstack-careful" \
  "https://raw.githubusercontent.com/garrytan/gstack/main/careful/SKILL.md" \
  "Safety guardrails before destructive commands"

# ── Addy Osmani / Web Quality ─────────────────────────────────────────────────
echo ""
echo "[ Performance & Accessibility ]"
install_skill "web-performance" \
  "https://raw.githubusercontent.com/addyosmani/web-quality-skills/main/performance/SKILL.md" \
  "Loading speed, runtime efficiency, resource optimization"

install_skill "web-accessibility" \
  "https://raw.githubusercontent.com/addyosmani/web-quality-skills/main/accessibility/SKILL.md" \
  "WCAG 2.1 compliance, screen reader, keyboard navigation"

# ── UI Quality ────────────────────────────────────────────────────────────────
echo ""
echo "[ UI Design Quality ]"
install_skill "ui-constraints" \
  "https://raw.githubusercontent.com/ibelick/ui-skills/main/SKILL.md" \
  "Opinionated UI constraints — prevents generic AI aesthetics"

install_skill "platform-design-hig" \
  "https://raw.githubusercontent.com/ehmo/platform-design-skills/main/SKILL.md" \
  "300+ rules from Apple HIG, Material Design 3, WCAG 2.2"

# ── Multi-agent ───────────────────────────────────────────────────────────────
echo ""
echo "[ Multi-Agent Workflow ]"
install_skill "subagent-driven-dev" \
  "https://raw.githubusercontent.com/obra/superpowers-lab/main/subagent-driven-development/SKILL.md" \
  "Development patterns using multiple sub-agents"

install_skill "parallel-agents" \
  "https://raw.githubusercontent.com/obra/superpowers-lab/main/dispatching-parallel-agents/SKILL.md" \
  "Coordinate multiple simultaneous agents"

install_skill "verification-before-completion" \
  "https://raw.githubusercontent.com/obra/superpowers-lab/main/verification-before-completion/SKILL.md" \
  "Validate work before finalizing — quality gate"

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "  Custom skills already active (no install needed):"
echo "    .claude/skills/openai-docs/         — OpenAI API (Bestfriend-tuned)"
echo "    .claude/skills/electron-security/   — Electron security checklist"
echo "    .claude/skills/rag-patterns/        — RAG + Pinecone + streaming"
echo "    .claude/skills/react-electron/      — React/TanStack/Zustand patterns"
echo "    .claude/skills/macos-design/        — Design tokens + HIG rules"
echo ""
echo "  All skills installed to: $SKILLS_DIR"
echo ""
echo "  To install a skill manually:"
echo "    mkdir -p .claude/skills/<name>"
echo "    curl -fsSL <raw-github-url> -o .claude/skills/<name>/SKILL.md"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
