# Robinhood Translator

A Chrome extension + AWS backend that provides context-aware Chinese translation of Robinhood pages for non-English-speaking retail traders.

## Status
Early development.

## Structure
- `extension/` — Chrome extension (manifest, content scripts, popup UI)
- `backend/` — AWS Lambda functions for translation and news summarization
- `docs/` — design notes and the user evaluation set

## Tech
Chrome extension (JS) · Python Lambda · API Gateway · DynamoDB · LLM API · AWS
