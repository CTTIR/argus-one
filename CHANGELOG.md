# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### 0.1.1 local candidate — 2026-10-30

- Delegate merges to Zotero's native API to preserve replacement identity,
  incoming relations, notes, annotations, tags and collection behavior.
- Keep newest field selection and explicit blank filling, with strict DOI,
  item-type, personal-library, pending-edit, and stale-preview guards.
- Preview record identities before applying; report per-group transaction
  results and stop on failure instead of implying whole-run rollback.
- Declare compatibility through 10.0.*; retain 9.0 minimum without claiming
  every declared version has been exercised. Remove the nonexistent update feed.
- Add regression tests, reproducible non-overwriting builds and check CI.
- Preserve historical 0.1.0 archives and published citation metadata unchanged.


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
