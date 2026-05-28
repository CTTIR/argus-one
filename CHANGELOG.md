# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
