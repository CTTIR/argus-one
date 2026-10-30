# Contributing to Argus One

Thanks for taking the time to contribute. Argus One is a small, focused Zotero plugin — keeping its scope tight is part of the design.

## Reporting bugs and requesting features

- Search [open issues](https://github.com/CTTIR/argus-one/issues) before filing a new one.
- For bugs, include your Zotero version, OS, plugin version, and a minimal reproduction (a small library export is ideal).
- For features, please describe the use case before the implementation — Argus One deliberately limits itself to DOI-keyed merging.

## Development setup

1. Clone the repo.
2. The plugin source lives in `src/argus-one/`.
3. Run `node --test tests/argus.test.cjs` and
   `python3 -m unittest discover -s tests -p 'test_*.py'`.
4. Run `python3 tools/build.py`. This builds `dist/argus-one-0.1.0-dev.xpi`
   without replacing historical archives.
5. Install the candidate into a disposable Zotero 9.x profile with synthetic
   records and complete `docs/maintenance-2026-10-30.md` before release.

The Node tests model the Zotero API contract. They do not establish that the
actual SQLite transaction, citation redirection, sync, or plugin UI works.

## Pull requests

- Branch from `main`.
- Keep changes focused. One logical change per PR.
- Update `CHANGELOG.md` under `## [Unreleased]`.
- Bump `version` in `src/argus-one/manifest.json` and `CITATION.cff` only when cutting a release — usually a maintainer task.
- Match the existing code style (plain, no build step, no transpilation).

## Releases

Maintainer checklist:

1. Update version in `src/argus-one/manifest.json`, `CITATION.cff`, and `CHANGELOG.md`.
2. Tag the release: `git tag v<version> && git push --tags`.
3. Build the `.xpi` and attach it to a GitHub Release.
4. If a DOI is desired, ensure the Zenodo–GitHub integration is enabled before publishing the release; copy the minted DOI into `CITATION.cff` and the README BibTeX entry.

## License

By contributing you agree that your contributions will be licensed under the [MIT License](LICENSE).
