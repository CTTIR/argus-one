# Maintenance integration — 3 November 2026

The integration combines maintenance commit `8f7cbc33` with upstream `d195b5a4`,
which includes the Zotero safety work in `047a0b3`. Upstream was pulled first in
an isolated checkout. Original worktrees, historical archives and branding are
preserved. The candidate remains 0.1.1; this change does not create a release.

The newer native-merge contract takes precedence over the earlier audit's
outer transaction and manual attachment movement. Each group retains Zotero's
own transaction, attachment consolidation and identity handling. Object/relation
cache recovery, pending-edit checks, frozen previews, lifecycle cancellation,
per-group failure reporting and the declared 9.0–10.0.* range remain intact.

Compatible audit improvements were retained or adapted: strict full-line Extra
DOI validation, numeric zero field preservation, foreign-library discovery
filtering, valid calendar timestamps, and explicit creator-failure regression
coverage. The original 15 newer safety tests remain, with five additional
contract cases. Tests tied to the superseded outer transaction and manual
attachment coalescer bypass are replaced by the native-contract checks rather
than reinstating that unsafe design.

Packaging combines the newer reproducible XPI/source ZIP/checksum interface
with licence inclusion and source/historical-directory protection. New files
are staged completely and linked into place without overwriting a destination.
Existing differing outputs and symlink artifact destinations are rejected.
One CI workflow runs all Node tests, Python packaging tests, build and build
verification; it uses Node.js 24.

Local integration checks: 20 Node tests and four Python packaging tests; source
syntax; reproducible build and `--check`; workflow and whitespace validation.
The separate publication receipt records exact commands, artifact hashes,
commit identity and observed remote main SHA after pushing.

Live Zotero-profile qualification remains unperformed. These adapter and
packaging checks do not prove actual database/filesystem rollback, citation
refresh, menu behavior or compatibility across every declared host version.
Follow the disposable-profile qualification in the current candidate audit
before using this candidate with a working library. No tag, GitHub Release,
plugin installation or working-library operation is part of this integration.
