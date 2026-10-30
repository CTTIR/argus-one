# Argus One 0.1.1 candidate

A Zotero DOI duplicate-merging plugin for the declared 9.0–10.0.* range.
Installed Zotero 10.0.5 API source and executable adapter tests were checked;
consult the repository audit for live-validation evidence.

Install this candidate first in a disposable Zotero profile through Tools →
Plugins → Install Plugin From File. Keep a full library backup before real use.

Tools → Argus One: merge DOI duplicates… previews DOI groups and record keys.
Only personal-library regular items of one type with valid exact DOI identity
are eligible. The newest record's field values win; empty fields and absent
creators are filled from older copies. Zotero's native merge handles collections,
tags, children, replacement/citation identity, related links and undo support.
It can consolidate attachments by PDF text or web title, even when files differ,
and keeps the earliest dateAdded. Live plugin qualification has not been run.

Each group has its own transaction. A failure stops the run; earlier completed
groups remain merged. Stale previews, pending edits and active database work are
refused. Review all results before emptying trash and rerun external Workbench
extraction/audit after merges. Reversing trash alone is not a complete merge undo.

There is no automatic update feed for this candidate. The root 0.1.0 archives in
the repository are historical and do not support Zotero 10. Build current source
with `python3 tools/build.py` from the repository root; new artifacts go to dist/.
