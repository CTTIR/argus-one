# Contributing to Argus One

Thanks for taking the time to contribute. Argus One is a small, focused Zotero plugin — keeping its scope tight is part of the design.

## Reporting bugs and requesting features

- Search [open issues](https://github.com/CTTIR/argus-one/issues) before filing a new one.
- For bugs, include your Zotero version, OS, plugin version, and a minimal reproduction (a small library export is ideal).
- For features, please describe the use case before the implementation — Argus One deliberately limits itself to DOI-keyed merging.

## Development setup

1. Clone the repo.
2. The plugin source lives in `src/argus-one/`.
3. To test locally, package it as an `.xpi`:

   ```powershell
   cd src/argus-one
   Compress-Archive -Path * -DestinationPath ../../argus-one-dev.xpi -Force
   ```

   or with `zip`:

   ```bash
   cd src/argus-one
   zip -r ../../argus-one-dev.xpi . -x "*.DS_Store"
   ```

4. In Zotero: **Tools → Plugins → ⚙ → Install Plugin From File…** and pick the `.xpi`.
5. Reinstall after each change. Use **Help → Debug Output Logging** to capture `Zotero.debug` output (lines prefixed with `[Argus One]`).

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
