# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- Preserve relations and citation redirects through Zotero's native merge API;
  keep attachments separate and let unexpected host errors abort the transaction.
- Reject stale or ineligible groups, malformed DOI values and invalid dates;
  prevent overlapping interactive runs and preserve numeric zero fields.
- Remove the missing update-feed URL and document the actual Zotero 9.x target.

### Added

- Synthetic host-contract regressions, reproducible development XPI builds,
  source/archive validation and a plugin-check workflow.

Host integration qualification is still required before a release.

## [0.1.0] - 2026-05-28

### Added

- Initial release.
- Tools menu entry: **Argus One: merge DOI duplicates…**
- DOI-only duplicate detection with normalization
  (case-insensitive, strips `https://doi.org/`, `https://dx.doi.org/`, `doi:`;
  scans the `Extra` field as a fallback).
- Newest record (by `dateAdded`, tie-broken by `itemID`) wins on field conflicts;
  empty fields are filled from older copies.
- Union of tags, related items, and collection memberships across duplicates.
- Re-parents attachments and child notes from older copies to the survivor.
- Single-transaction execution: any error rolls the entire merge back.
- Compatibility with Zotero 9 and later.

[Unreleased]: https://github.com/CTTIR/argus-one/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/CTTIR/argus-one/releases/tag/v0.1.0
