---
name: "openai-docs"
description: "Use when the user asks how to build with OpenAI products or APIs and needs up-to-date official documentation with citations, help choosing the latest model for a use case, or model upgrade and prompt-upgrade guidance; prioritize OpenAI docs MCP tools, use bundled references only as helper context, and restrict any fallback browsing to official OpenAI domains."
source: "https://github.com/openai/skills/tree/main/skills/.curated/openai-docs"
---

# OpenAI Docs

Provide authoritative, current guidance from OpenAI developer docs using the developers.openai.com MCP server. Always prioritize the developer docs MCP tools over web search for OpenAI-related questions. This skill also owns model selection, API model migration, and prompt-upgrade guidance.

## Quick start

- Use `mcp__openaiDeveloperDocs__search_openai_docs` to find the most relevant doc pages.
- Use `mcp__openaiDeveloperDocs__fetch_openai_doc` to pull exact sections and quote/paraphrase accurately.
- For model-selection questions, fetch `https://developers.openai.com/api/docs/guides/latest-model.md` first.
- For general docs lookup, search docs with a precise query, fetch the best page and exact section needed, and answer with concise citations.

## Bestfriend-specific OpenAI usage

Bestfriend uses OpenAI for:
1. **Chat completions** with streaming + function/tool calls (`propose_reminder`, `propose_suggestion`, `remember_about_user`)
2. **Embeddings** — `text-embedding-3-small` (1536 dim) for doc chunks and chat history
3. **Whisper transcription** (`whisper-1`) for audio file ingestion and push-to-talk voice input

When consulting OpenAI docs for this project, prioritize:
- Chat Completions API → streaming, tool calls with `strict: true` schemas
- Embeddings API → batch upsert limits, dimension configuration
- Audio transcription API → supported formats (m4a, mp3, wav), response format
- Token counting — `tiktoken` for estimating context and chunk sizes

## OpenAI product snapshots

1. **Chat Completions API** — stateless request/response or streaming; supports tool/function calling
2. **Embeddings API** — `text-embedding-3-small` (1536d) or `text-embedding-3-large` (3072d)
3. **Audio Transcription** — Whisper-1; supports m4a, mp3, mp4, wav, webm; max 25MB
4. **Realtime API** — low-latency bidirectional voice (not used in Bestfriend v1)
5. **Responses API** — stateful agentic workflows (not used in Bestfriend v1)

## Quality rules

- Treat OpenAI docs as the source of truth; avoid speculation.
- Do not invent pricing, availability, parameters, or API changes.
- When falling back to web search, restrict to official OpenAI domains (developers.openai.com, platform.openai.com).
