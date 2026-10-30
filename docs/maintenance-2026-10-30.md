# Maintenance audit — 30 October 2026

## Purpose and scope

Argus One merges personal-library items with identical normalized DOIs. It must
choose the newest record deterministically, preserve bibliographic fields and
child records, retain citation relationships, and abort on a material error.
The manifest currently targets Zotero 9.x. Group libraries and fuzzy matching
remain outside scope. Source baseline: `18c8a01b05f1f5a3b7f3724162ca4ace61d641aa`.

The original checkout was clean. Work is isolated on a maintenance branch. The
GitHub issue list and release list were empty. Existing successful CI runs
rendered documentation only; they did not test the plugin. The local Zotero
installation is 10.0.5, outside the declared target, and its library was not used.

## Evidence and implemented roadmap

| Finding | Impact and evidence | Priority | Change |
| --- | --- | --- | --- |
| Assignment to getter-only `relatedItems` | Zotero 9.0.6 `item.js` exposes no setter; the manual merge did not preserve incoming relations or citation redirects. | Release blocker | Use the native `mergeItems.mjs` entry point, present in both 9.0.0 and 9.0.6. Move every attachment first so the native attachment coalescer receives no older attachments. |
| Field and creator errors swallowed | The code caught errors and proceeded toward trashing older records. Synthetic host rejection reproduced the problem. | Release blocker | Propagate errors through the transaction; validate group eligibility again before mutation. |
| Concurrent runs and unstable selection | Two invocations could confirm the same records; date parsing was host-dependent and sorting mutated discovery results. | High | Add an execution lock, parse SQL timestamps as UTC, reject invalid dates and sort a copy. |
| DOI input accepted only by prefix match | Numeric-invalid prefixes and trailing whitespace text passed the old regex. | High | Match the entire DOI and reject ambiguous Extra-field values. |
| Historical XPI differs from source | The archive manifest has a different update owner and compatibility range. Source references an absent update manifest. | High | Preserve historical archives, remove the missing update URL, and build a deterministic development XPI directly from current source. |
| Documentation and package claims drifted | The internal README claimed 7.x/8.x, the source manifest allowed 9.x, and the public README claimed 9 and later. Three documentation screenshots did not exist. | Medium | Align the declared 9.x target, explain qualification and manual updates, remove broken screenshot references, and provide executable first-use commands. |

M1 repairs data-preservation and transaction behavior; M2 makes source, package
and documentation consistent; M3 qualifies the plugin in its actual host.
M1 and M2 have local regression/build evidence. M3 remains required before
release. General compatibility with Zotero 10, group libraries, background
processing and automatic updates are deferred.

Tradeoff: the native merger retains the oldest `dateAdded` after selecting the
newest survivor. This is documented explicitly. Its relationship and note-link
handling avoids maintaining a competing implementation of Zotero's data model.
Attachments are moved before the native merge and checked again; they remain
distinct even when their file content is identical. No file is deleted.

## Local verification

The Node suite uses a synthetic host with read-only relationship access and
transaction snapshots. It exercises DOI selection, field preservation, numeric
zero values, attachments (including trashed ones), stale groups, cancellation,
concurrent calls and injected failures. These are contract regressions, not
proof of real Zotero database behavior.

Python tests build two archives, compare hashes, verify every source entry and
the MIT licence, and reject overwriting historical root archives. JavaScript
syntax checks and workflow validation are separate checks. No production data,
live Zotero database, sync account, or external library is needed for these tests.

Observed local results: 19 Node contract tests and 3 Python packaging tests pass;
JavaScript syntax, actionlint and whitespace checks pass. Quarto 1.10.19 rendered
both documentation pages from a clean temporary copy, and all 24 local asset
references on the home page resolve. The initial 15-case contract suite had 14
failures against the original implementation. Generated-site rendering from
the hidden audit directory skipped project inputs, so the clean-copy build is
the recorded website verification. Hosted CI has not run for these changes.

```sh
node --check src/argus-one/argus.js
node --check src/argus-one/bootstrap.js
node --test tests/argus.test.cjs
python3 -m unittest discover -s tests -p 'test_*.py'
python3 tools/build.py
```

Prerequisites: Node.js 24 and Python 3.9+. Candidate:
`dist/argus-one-0.1.0-dev.xpi`. The version and historical citation metadata have
not been advanced; the candidate is not a release. DOI registration could not
be verified and is not inferred from the existing badge or identifier.

## Required host qualification

In a disposable Zotero 9.x profile with sync disabled and synthetic records:

1. Install the candidate, open and close multiple main windows, and verify the
   Tools menu, localization and plugin shutdown behavior.
2. Merge DOI duplicates with conflicting fields, creators, tags and collections.
   Check the selected survivor, retained metadata and earliest date added.
3. Include separate identical PDFs, annotations, trashed attachments, child
   notes with item links, and incoming/outgoing related-item links. Verify all
   attachment identities and note contents are preserved.
4. Refresh an existing word-processor citation to an older item and verify it
   resolves to the survivor through Zotero's merge-tracking relation.
5. Cancel a merge, repeat it, and inject a save failure in a later group. Verify
   the real database rolls back the entire operation and a retry is possible.
6. Verify other libraries remain unchanged. Exercise a large synthetic library
   and record duration and UI responsiveness before claiming scale readiness.

Only after this passes: select the next version, synchronize release metadata,
build and review the final package, then publish with authorization. This audit
does not claim a submitted, deployed, published, or host-qualified release.

## Primary sources

- [Zotero 9 developer requirements](https://www.zotero.org/support/dev/zotero_9_for_developers)
- [Read-only item properties in 9.0.6](https://github.com/zotero/zotero/blob/9.0.6/chrome/content/zotero/xpcom/data/item.js)
- [Native merger in 9.0.6](https://github.com/zotero/zotero/blob/9.0.6/chrome/content/zotero/mergeItems.mjs)
- [Native merger in 9.0.0](https://github.com/zotero/zotero/blob/9.0.0/chrome/content/zotero/mergeItems.mjs)
