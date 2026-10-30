<picture class="cttir-readme-logo"><source class="cttir-logo-dark-source" media="(prefers-color-scheme: dark)" srcset="assets/branding/logo-with-name-dark.png" /><img src="assets/branding/logo-with-name.png" alt="argus-one hex logo" align="right" width="120" height="139" /></picture>

# Argus One

[![DOI](https://zenodo.org/badge/DOI/10.5281/zenodo.21889976.svg)](https://doi.org/10.5281/zenodo.21889976)

A Zotero plugin that identifies duplicates by exact normalized DOI and selects
newest record values before handing the merge to Zotero's native operation.
Only personal-library items of the same type are eligible.

## Compatibility and status

The current local candidate is **0.1.1**. The manifest declares Zotero 9.0 through
10.0.*. Zotero 10.0.5/10.0.6 API source was inspected; the application is now
observed at **10.0.7**. Adapter tests pass, but **live plugin qualification has
not been run**. See [audit and validation](docs/AUDIT-2026-10-30.md).

The root `argus-one-0.1.0.xpi` and `argus-one-source.zip` are preserved historical
artifacts. Their manifests differ from the former source and do not support
Zotero 10. Do not use them for this candidate. There is no published 0.1.1 release
or functioning automatic update feed; updates are manual until publication.

## Build and install the candidate

Requires Python 3 and Node.js 18+ for tests; no npm dependencies are needed.

```bash
node --test tests/*.test.cjs
python3 tools/build.py
python3 tools/build.py --check
```

The builder creates `dist/argus-one-0.1.1.xpi`, a corresponding source ZIP and
SHA-256 receipt. Sorted inputs and fixed archive metadata make repeated builds
identical. Existing different output files are never overwritten; select a new
`--output PATH` directory for a revised build.

Keep a full Zotero data-directory backup. First install the candidate in a
**disposable Zotero profile** using **Tools → Plugins → Install Plugin From File**.
Review the results there before installing it in the working profile. Source and
build presence do not mean the plugin is installed or enabled.

## Usage and merge policy

1. Open **Tools → Argus One: merge DOI duplicates…**
2. Review every DOI, survivor key/title, and list of older keys in the preview.
3. Confirm to process the eligible groups. Mixed types, pending edits, malformed
   identifiers and otherwise unsafe groups are left for review.
4. Review the library before emptying trash. Re-run Workbench extraction/audit
   after merges because parent and attachment identities may have changed.

Newest `dateAdded` wins, with higher item ID breaking ties. Existing survivor
fields are kept; valid blank fields and missing creators are filled from newer
siblings first. Zotero's native merge then handles collections, tags, incoming
relations, replacement/citation identity, notes, attachments, and undo tracking.
It may consolidate attachments using native PDF text or web-title matching,
even when files are not byte-identical, and retains the **earliest dateAdded**
for the merged record. Those native semantics are intentional in 0.1.1.

Each group has its **own native transaction**. If a later group fails, earlier
successful groups remain merged and the result dialog states how many completed.
Children use their current saved content; pending child/annotation/related-item
edits block merging. Failed merges reload affected object and relation caches;
if recovery fails, restart Zotero before using the library again.
The native operation is never nested in another transaction. Pending database
work or changes since preview stop application and require a fresh scan. Field
errors are reported; they are not silently ignored while records are trashed.
Disabling the plugin stops pending groups. A native merge already in flight is
allowed to finish safely, and its result remains part of the completed count.

## DOI and library boundaries

Normalization removes `doi:` and `https://(dx.)doi.org/` wrappers and folds case.
It requires `10.` followed by 4–9 digits, `/`, and a non-whitespace suffix, while
preserving suffix punctuation. An absent dedicated DOI can use a single,
unambiguous `DOI:` entry in Extra. A malformed dedicated DOI or conflicting Extra
identifiers is not guessed. Same DOI does not independently prove that records
are the same work: review wrong/misassigned DOIs before merging.

No fuzzy matching of parent records, group-library changes, permanent deletion, or automatic
background merges are performed.

## Documentation

- [Audit, acceptance checks, and remaining limits](docs/AUDIT-2026-10-30.md)
- [Contributing and builds](CONTRIBUTING.md)
- Existing published documentation: <https://cttir.github.io/argus-one/>

The citation below identifies the published 0.1.0 software; the 0.1.1 candidate
has not been published or assigned a new release DOI.

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

> Published 0.1.0 DOI: https://doi.org/10.5281/zenodo.21889976. The local 0.1.1 candidate has not been published.

## Links

- **Documentation:** <https://cttir.github.io/argus-one/>
- **Issues:** <https://github.com/CTTIR/argus-one/issues>
- **License:** [MIT](LICENSE)
- **Changelog:** [CHANGELOG.md](CHANGELOG.md)
- **Contributing:** [CONTRIBUTING.md](CONTRIBUTING.md)

## Citation

If you use this software, please cite it as:

> Heller, R. (2026). *Argus One: DOI-based duplicate merger for Zotero* (Version 0.1.0) [Computer software]. Zenodo. https://doi.org/10.5281/zenodo.21889976

DOI: [10.5281/zenodo.21889976](https://doi.org/10.5281/zenodo.21889976)

## Use of LLM tools

Where applicable, LLM tools were used for narrowly defined, non-authorial tasks:
copyediting, prose refinement, Markdown/LaTeX formatting, boilerplate scaffolding
(such as CI configurations and build scripts), and code refactoring. Tools included
[Chat AI](https://kisski.gwdg.de/leistungen/2-02-llm-service/), the KISSKI
(GWDG) service, and self-hosted **Mistral Small (24B, Apache-2.0)** served through
a local **vLLM architecture** on an Ubuntu Linux workstation with Intel
processors and NVIDIA GPUs. The self-hosted model ran locally, with no data sent
to third parties.

All scientific claims, methodological choices, analyses, interpretations and
conclusions remain the authors' own. Where applicable, LLM-generated material
must be reviewed and revised before inclusion, and references must be verified
against their DOI, arXiv ID or ISBN.

Local software setup: vLLM with Python/PyTorch, plus R and RStudio.

## Branding

The supplied CTTIR Coder Edition v5 artwork and its editable R source are in
[`tools/branding`](tools/branding/README.md). Use that renderer to reproduce
the primary badge, alternate editions, and platform icons.
