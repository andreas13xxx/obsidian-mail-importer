# Changelog

All notable changes to the Email Importer plugin will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2025-07-14

### Added

- IMAP connection with SSL/TLS and STARTTLS support
- Import unread emails as Markdown notes with YAML frontmatter
- HTML-to-Markdown conversion using Turndown with GFM table support
- Attachment and inline image handling with local storage
- Automatic sync on configurable interval
- Manual sync via ribbon icon and command palette
- Settings tab with connection test and sync-now buttons
- Status bar with sync progress and last-sync timestamp
- Duplicate filename handling with counter suffix
- Subject sanitization (special characters, length truncation, reserved names)
- Fallback for emails without subject, date, or attachment filenames
- Concurrent sync prevention (mutex guard)
- 30-second connection timeout
- Error notices for connection failures and import errors
