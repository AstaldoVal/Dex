# Changelog

All notable changes to Dex will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Protected user extensions in CLAUDE.md** - Add personal instructions between `USER_EXTENSIONS_START/END` markers. These persist through updates.
- **User-owned MCP preservation** - MCP servers named `user-*` or `custom-*` are automatically preserved during `/dex-update`
- **Guided conflict resolution** - `/dex-update` now uses interactive choices instead of merge editors for core file conflicts

### Changed
- `/dex-update` skill now extracts and re-inserts user blocks before merging, preventing accidental overwrites
- Update documentation expanded with protected locations guidance

### Fixed