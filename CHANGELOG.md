# Changelog

All notable changes to Dex will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Protected user extensions block in `CLAUDE.md` preserved by `/dex-update`
- `/dex-add-mcp` skill to add MCP servers with user scope by default
- PreToolUse hook to enforce explicit MCP scope on `claude mcp add`

### Changed
- `/dex-update` now preserves user-owned MCP entries (`user-` / `custom-`) and uses a guided AskQuestion conflict flow
- Update documentation clarifies preserved customizations and MCP naming guidance
- AskUserQuestion flows now include CLI fallback when the tool is unavailable

### Fixed