# Argus One

A Zotero 9.x plugin that merges duplicate items by **DOI only**.

## What it does

For every group of items that share the same DOI:

1. **Pick the newest** record by `dateAdded` (ties go to the higher itemID).
2. **Newest wins on conflicts.** If the survivor already has a value in a field, that value is kept. If it's empty, the value is taken from an older sibling.
3. **Preserve collection positions.** The survivor is added to the *union* of every collection any of the duplicates appeared in. So if DOI `X` was in collections `A` and `B` (one copy in each), the single surviving item now lives in both `A` and `B`.
4. **Tags and related items** are unioned across all duplicates.
5. **Attachments** remain separate records, including trashed attachments. Zotero moves notes, updates links and preserves citation redirects; it retains the earliest `dateAdded` after choosing the survivor.
6. **Older copies move to trash.**

DOI normalization: case-insensitive, strips `https://doi.org/`, `https://dx.doi.org/`, and `doi:` prefixes. Items also have their `Extra` field scanned for `DOI: …` when no dedicated DOI field is present.

## Install

1. In Zotero: **Tools → Plugins → ⚙ → Install Plugin From File…**
2. Pick the current `dist/argus-one-0.1.0-dev.xpi` candidate built from the repository root. Use a disposable synthetic profile for qualification.
3. **Tools → Argus One: merge DOI duplicates…**

A confirmation dialog shows the group count before anything changes. All work happens inside a single Zotero transaction, so an error rolls everything back.

## What it does NOT do

- Does not touch items without a DOI.
- Does not delete anything permanently — losers go to the trash. Empty the trash yourself when you're satisfied.
- Does not modify group library items (operates on the user library only in this version).
- Does not fuzzy-match titles. Use Zotero's built-in **Duplicate Items** view for that.

## Building the .xpi from source

```bash
python3 tools/build.py  # from the repository root
```

## Compatibility

- Manifest target: Zotero **9.x**. Host integration testing is pending.
- Updates are manual until a release and update feed are published.
