<img src="icon.svg" alt="Argus One icon" width="96" align="right" />

# Argus One

A Zotero plugin that merges duplicate items by **DOI only**, keeping the newest record's field values and preserving every collection the duplicates appeared in.

Zotero's built-in duplicate detector is fuzzy by design — it inspects titles, creators, and years. That is the right default for most libraries but a poor fit for curated collections where the DOI is the source of truth. Argus One does one job: it groups items that share a normalized DOI, picks a survivor by `dateAdded`, fills missing fields from older copies, unions tags / related items / collection memberships, re-parents attachments and notes, and trashes the older records inside a single Zotero transaction.

## Compatibility

- **Zotero 9 and later** (see `src/argus-one/manifest.json`)
- Cross-platform (Windows, macOS, Linux)

## Installation

1. Download the latest `argus-one-<version>.xpi` from the [Releases](https://github.com/CTTIR/argus-one/releases) page.
2. In Zotero, open **Tools → Plugins**.
3. Click the gear icon → **Install Plugin From File…**
4. Select the downloaded `.xpi`.
5. Restart Zotero if prompted.

## Usage

1. Open **Tools → Argus One: merge DOI duplicates…**
2. A confirmation dialog reports how many DOI duplicate groups were found and how many items will be moved to trash.
3. Confirm to merge. All work runs inside one Zotero database transaction, so any error rolls the entire operation back.
4. Empty the Zotero trash yourself when you have verified the result.

### Merge rules

For every group of items that share the same normalized DOI:

1. **Pick the newest** by `dateAdded` (ties broken by higher `itemID`).
2. **Newest wins on conflicts.** If the survivor already has a value in a field, that value is kept. Empty fields are filled from older siblings.
3. **Collections are unioned.** If the DOI appeared in collections `A` and `B`, the survivor ends up in both.
4. **Tags, related items, and creators** are unioned across all duplicates (creators only if the survivor has none).
5. **Attachments and child notes** of older copies are re-parented to the survivor.
6. **Older copies move to trash** — never deleted permanently.

### DOI normalization

Case-insensitive. Strips `https://doi.org/`, `https://dx.doi.org/`, and `doi:` prefixes. Items without a dedicated DOI field also have their `Extra` field scanned for `DOI: …`.

### Out of scope

- Items without a DOI are ignored.
- Group libraries are not touched (user library only in this version).
- No fuzzy title matching — use Zotero's built-in **Duplicate Items** view for that.

## Building from source

```powershell
cd src/argus-one
Compress-Archive -Path * -DestinationPath ../../argus-one-0.1.0.xpi -Force
Rename-Item ../../argus-one-0.1.0.xpi.zip ../../argus-one-0.1.0.xpi
```

Or with `zip`:

```bash
cd src/argus-one
zip -r ../../argus-one-0.1.0.xpi . -x "*.DS_Store"
```

## Documentation

Full vignette and walkthrough: <https://cttir.github.io/argus-one/>

## How to cite this plugin

If Argus One supports your research, please cite it.

**BibTeX**

```bibtex
@software{heller_argus_one_2026,
  author  = {Heller, Raban},
  title   = {{Argus One: DOI-based duplicate merger for Zotero}},
  year    = {2026},
  version = {0.1.0},
  url     = {https://github.com/CTTIR/argus-one},
  license = {MIT}
}
```

**APA**

> Heller, R. (2026). *Argus One: DOI-based duplicate merger for Zotero* (Version 0.1.0) [Computer software]. https://github.com/CTTIR/argus-one

> **DOI:** none yet. To mint a permanent DOI, enable the [Zenodo–GitHub integration](https://docs.github.com/en/repositories/archiving-a-github-repository/referencing-and-citing-content) and publish a release. Once minted, paste the DOI into the `doi:` field of `CITATION.cff` and into the BibTeX entry above as `doi = {10.xxxx/zenodo.xxxxxxx}`.

## Links

- **Documentation:** <https://cttir.github.io/argus-one/>
- **Issues:** <https://github.com/CTTIR/argus-one/issues>
- **License:** [MIT](LICENSE)
- **Changelog:** [CHANGELOG.md](CHANGELOG.md)
- **Contributing:** [CONTRIBUTING.md](CONTRIBUTING.md)
