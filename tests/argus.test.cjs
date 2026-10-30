const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const test = require('node:test');

const source = fs.readFileSync('src/argus-one/argus.js', 'utf8');

function fixture(options = {}) {
  const items = new Map(), calls = [], alerts = [], relationIndex = new Set();
  let busy = false;
  function item(id, changes = {}) {
    const fields = {DOI: '10.1234/example', title: 'Existing title', extra: '', ...changes.fields};
    const value = {
      id, key: 'ITEM000' + id, libraryID: 1, itemTypeID: 2, deleted: false,
      dateAdded: `2026-01-0${id} 00:00:00`, dateModified: '2026-01-10 00:00:00', version: 1,
      creators: [], tags: [], collections: [], relations: {}, attachments: [], notes: [], fields,
      dirty: false, saved: 0, reloaded: 0,
      isRegularItem: () => true, isTopLevelItem: () => true, isEditable: () => true,
      isFileAttachment: () => false, isAttachment: () => false,
      hasChanged() { return this.dirty; },
      getField(name) { return this.fields[name] || ''; },
      getUsedFields() { return Object.keys(this.fields); },
      setField(name, value) { if (name === options.failField) throw Error('field failed'); this.fields[name] = value; this.dirty = true; },
      getCreators() { return this.creators; }, setCreators(value) { this.creators = value; this.dirty = true; },
      getTags() { return [...this.tags]; }, getCollections() { return [...this.collections]; },
      getRelations() { return this.relations; },
      getAttachments(includeTrashed) { assert.equal(includeTrashed, true); return [...this.attachments]; },
      getNotes(includeTrashed) { assert.equal(includeTrashed, true); return [...this.notes]; },
      async loadAllData() {},
      async save() { this.saved++; },
      async reload(types, unchanged) { assert.equal(types, null); assert.equal(unchanged, true); this.reloaded++; this.dirty = false; },
      ...changes,
    };
    items.set(id, value);
    return value;
  }
  const nativeMerge = async (survivor, losers) => {
    assert.equal(busy, false, 'native merge must not be nested in another transaction');
    calls.push({survivor, losers, fields: {...survivor.fields}, creators: [...survivor.creators]});
    assert.equal(survivor.saved, 0, 'prepared blank fields remain unsaved until native merge');
    if (options.beforeNativeFailure) await options.beforeNativeFailure();
    if (options.failGroup === calls.length) throw Error('native merge failed');
    for (const loser of losers) loser.deleted = true;
    survivor.dirty = false;
  };
  const Zotero = {
    debug() {}, Libraries: {userLibraryID: 1, get: () => ({editable: true, waitForDataLoad: async () => {}})},
    Search: class { addCondition() {} async search() { return [...items.keys()]; } },
    ItemFields: {getID: name => name, isValidForType: () => true},
    Items: {getAsync: async ids => ids.map(id => items.get(id)), merge: nativeMerge},
    URI: {getItemURI: item => `item:${item.id}`},
    Relations: {
      getByObject: async (type, uri) => [...items.values()]
        .flatMap(subject => Object.entries(subject.relations)
          .filter(([, targets]) => targets.includes(uri)).map(([predicate]) => ({subject, predicate}))),
      register(type, id, predicate, target) { relationIndex.add(JSON.stringify([id, predicate, target])); },
      unregister(type, id, predicate, target) { relationIndex.delete(JSON.stringify([id, predicate, target])); },
    },
    DB: {transactionInProgress: () => busy, executeTransaction() { throw Error('plugin must not open an outer transaction'); }},
  };
  const Services = {prompt: {confirm(window, title, message) { calls.preview = message; return options.confirm !== false; }}};
  const ChromeUtils = {importESModule(uri) {
    assert.equal(uri, 'chrome://zotero/content/mergeItems.mjs');
    if (options.compatibility) throw Error('module absent');
    return {mergeItems: nativeMerge};
  }};
  vm.runInNewContext(source, {Zotero, Services, ChromeUtils});
  return {argus: Zotero.ArgusOne, item, calls, alerts, setBusy: value => busy = value,
    window: {alert: value => alerts.push(value)}, Zotero, relationIndex};
}

test('DOI normalization preserves suffix identity and rejects malformed keys', () => {
  const {argus} = fixture();
  assert.equal(argus.normalizeDOI('https://DX.DOI.org/10.1234/Example.'), '10.1234/example.');
  assert.equal(argus.normalizeDOI(' DOI: 10.1234/A;B '), '10.1234/a;b');
  for (const value of ['10.x/a', '10.12/a', '10.1234/a trailing', 'https://example.org/10.1234/a']) {
    assert.equal(argus.normalizeDOI(value), null);
  }
});

test('ambiguous Extra identifiers and invalid dedicated DOI are not guessed', () => {
  const f = fixture();
  assert.equal(f.argus.getItemDOI(f.item(1, {fields: {DOI: '', extra: 'DOI: 10.1234/a\nDOI: 10.1234/b'}})), null);
  assert.equal(f.argus.getItemDOI(f.item(2, {fields: {DOI: 'bad', extra: 'DOI: 10.1234/a'}})), null);
});

test('plan is read-only, selects newest with ID tie-break, and excludes incompatible groups', () => {
  const f = fixture();
  const old = f.item(1), newest = f.item(2), tied = f.item(3, {dateAdded: newest.dateAdded});
  const {plans} = f.argus.planGroups([[old, newest, tied]]);
  assert.equal(plans[0].survivorKey, tied.key);
  assert.equal(old.deleted, false);
  assert.equal(f.calls.length, 0);
  const otherType = f.item(4, {itemTypeID: 4});
  assert.equal(f.argus.planGroups([[old, otherType]]).skipped.length, 1);
  assert.throws(() => f.argus.validateGroup([old, f.item(5, {libraryID: 2})]), /incompatible/);
});

test('native merge receives newest values, filled blanks and creators without pre-saving', async () => {
  const f = fixture();
  const older = f.item(1, {fields: {DOI: '10.1234/example', title: 'Older title', publicationTitle: 'Journal'}, creators: [{lastName: 'Author'}]});
  const newest = f.item(2, {fields: {DOI: '10.1234/example', title: 'Newest title', publicationTitle: ''}});
  const plan = f.argus.planGroups([[older, newest]]).plans[0];
  const result = await f.argus.mergeGroup(plan);
  assert.equal(result.survivorID, newest.id);
  assert.equal(f.calls[0].fields.title, 'Newest title');
  assert.equal(f.calls[0].fields.publicationTitle, 'Journal');
  assert.equal(f.calls[0].creators[0].lastName, 'Author');
  assert.equal(f.calls[0].losers[0], older);
  assert.equal(older.deleted, true);
});

test('stale metadata, child membership and pending edits block a reviewed plan', async () => {
  for (const change of [item => item.fields.title = 'Changed', item => item.attachments.push(99), item => item.dirty = true]) {
    const f = fixture(), older = f.item(1), newer = f.item(2);
    const plan = f.argus.planGroups([[older, newer]]).plans[0];
    change(older);
    await assert.rejects(f.argus.mergeGroup(plan), /changed|unsaved/i);
    assert.equal(f.calls.length, 0);
    assert.equal(older.deleted, false);
  }
});

test('active transactions are refused instead of nesting native merge', async () => {
  const f = fixture(), items = [f.item(1), f.item(2)];
  const plan = f.argus.planGroups([items]).plans[0];
  f.setBusy(true);
  await assert.rejects(f.argus.mergeGroup(plan), /busy/);
  assert.equal(f.calls.length, 0);
});

test('field-copy failure is not swallowed or followed by a merge', async () => {
  const f = fixture({failField: 'publicationTitle'});
  const older = f.item(1, {fields: {DOI: '10.1234/example', publicationTitle: 'Journal'}}), newer = f.item(2);
  const plan = f.argus.planGroups([[older, newer]]).plans[0];
  await assert.rejects(f.argus.mergeGroup(plan), /field failed/);
  assert.equal(f.calls.length, 0);
  assert.equal(older.deleted, false);
  assert.equal(newer.reloaded, 1);
});

test('native failure reloads group objects and leaves successful previous groups disclosed', async () => {
  const f = fixture({failGroup: 2});
  f.item(1); f.item(2);
  const third = f.item(3, {fields: {DOI: '10.1234/second'}});
  const fourth = f.item(4, {fields: {DOI: '10.1234/second'}});
  await f.argus.runInteractive(f.window);
  assert.equal(f.calls.length, 2);
  assert.equal(third.deleted, false);
  assert.equal(fourth.reloaded, 1);
  assert.match(f.alerts.at(-1), /1 groups completed/);
  assert.match(f.alerts.at(-1), /Completed groups remain merged/);
  assert.equal(f.argus.running, false);
});

test('cancelling preview makes no changes and concurrent entry is rejected', async () => {
  const f = fixture({confirm: false}); f.item(1); f.item(2);
  await f.argus.runInteractive(f.window);
  assert.equal(f.calls.length, 0);
  assert.match(f.calls.preview, /Keep ITEM0002/);
  f.argus.running = true;
  await f.argus.runInteractive(f.window);
  assert.match(f.alerts.at(-1), /already running/);
});

test('compatibility API fallback still delegates to Zotero native merge', async () => {
  const f = fixture({compatibility: true});
  await f.argus.mergeGroup(f.argus.planGroups([[f.item(1), f.item(2)]]).plans[0]);
  assert.equal(f.calls.length, 1);
});

test('native failure restores child objects and the incoming relation index after partial saves', async () => {
  let attachment, annotation, note, related;
  const f = fixture({failGroup: 1, beforeNativeFailure() {
    attachment.parentID = 2;
    annotation.parentID = 21;
    note.parentID = 2;
    related.relations = {'dc:relation': ['item:2']};
    f.Zotero.Relations.unregister('item', related.id, 'dc:relation', 'item:1');
    f.Zotero.Relations.register('item', related.id, 'dc:relation', 'item:2');
  }});
  const older = f.item(1, {attachments: [20], notes: [22]}), newer = f.item(2);
  const restore = function () { this.parentID = this.originalParent; this.reloaded++; this.dirty = false; };
  annotation = f.item(23, {parentID: 20, originalParent: 20, reload: restore});
  attachment = f.item(20, {parentID: 1, originalParent: 1, reload: restore,
    isAttachment: () => true, isFileAttachment: () => true, getAnnotations: () => [annotation]});
  note = f.item(22, {parentID: 1, originalParent: 1, reload: restore});
  related = f.item(30, {relations: {'dc:relation': ['item:1']},
    async reload() { this.relations = {'dc:relation': ['item:1']}; this.reloaded++; }});
  f.Zotero.Relations.register('item', 30, 'dc:relation', 'item:1');
  await assert.rejects(f.argus.mergeGroup(f.argus.planGroups([[older, newer]]).plans[0]), /native merge failed/);
  assert.equal(attachment.parentID, 1);
  assert.equal(annotation.parentID, 20);
  assert.equal(note.parentID, 1);
  assert.equal(related.reloaded, 1);
  assert.deepEqual([...f.relationIndex], [JSON.stringify([30, 'dc:relation', 'item:1'])]);
});

test('pending child edits are preserved and failed recovery blocks another merge', async () => {
  const f = fixture({failGroup: 1});
  const older = f.item(1, {notes: [20]}), newer = f.item(2);
  const note = f.item(20, {dirty: true});
  const plan = f.argus.planGroups([[older, newer]]).plans[0];
  await assert.rejects(f.argus.mergeGroup(plan), /child or related item has unsaved/);
  assert.equal(f.calls.length, 0);
  assert.equal(note.dirty, true);
  note.dirty = false;
  note.reload = async () => { throw Error('read failed'); };
  await assert.rejects(f.argus.mergeGroup(plan), /Restart Zotero/);
  await assert.rejects(f.argus.mergeGroup(plan), /Restart Zotero/);
  assert.equal(f.calls.length, 1);
});

test('shutdown during loading cancels writes, including after the same object is reinitialized', async () => {
  for (const restart of [false, true]) {
    const f = fixture();
    const older = f.item(1), newer = f.item(2);
    const plan = f.argus.planGroups([[older, newer]]).plans[0];
    older.loadAllData = async () => {
      f.argus.shutdown();
      if (restart) f.argus.init({id: 'test', version: '0.1.1', rootURI: ''});
    };
    await assert.rejects(f.argus.mergeGroup(plan), /disabled/);
    assert.equal(f.calls.length, 0);
    assert.equal(newer.dirty, false);
    assert.equal(older.deleted, false);
  }
});

test('shutdown permits an in-flight native merge to finish but stops the next group', async () => {
  const f = fixture({beforeNativeFailure() { f.argus.shutdown(); }});
  const older = f.item(1); f.item(2);
  const nextOlder = f.item(3, {fields: {DOI: '10.1234/next'}});
  f.item(4, {fields: {DOI: '10.1234/next'}});
  await f.argus.runInteractive(f.window);
  assert.equal(f.calls.length, 1);
  assert.equal(older.deleted, true);
  assert.equal(nextOlder.deleted, false);
  assert.match(f.alerts.at(-1), /disabled/);
  assert.match(f.alerts.at(-1), /1 groups completed/);
});

test('reviewed plans are frozen and caller-owned arrays cannot change an awaited merge', async () => {
  const f = fixture(), older = f.item(1), newer = f.item(2);
  const result = f.argus.planGroups([[older, newer]]);
  assert.equal(Object.isFrozen(result.plans), true);
  assert.equal(Object.isFrozen(result.plans[0].ids), true);
  const mutable = JSON.parse(JSON.stringify(result.plans[0]));
  const getAsync = f.Zotero.Items.getAsync;
  f.Zotero.Items.getAsync = async ids => {
    mutable.ids.reverse();
    mutable.snapshots.reverse();
    return getAsync(ids);
  };
  await f.argus.mergeGroup(mutable);
  assert.equal(f.calls[0].survivor.id, newer.id);
  assert.equal(f.calls[0].losers[0].id, older.id);
});
