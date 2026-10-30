const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../src/argus-one/argus.js'), 'utf8');

// A deliberately narrow host contract, not a replacement for Zotero integration
// tests. In particular, relatedItems is getter-only, as in Zotero 9.0.6 item.js.
function harness() {
  const items = new Map();
  const calls = { merges: [], transactions: 0, confirmations: 0, alerts: [] };
  let inTransaction = false;
  let nextID = 1;
  function item(options = {}) {
    const record = {
      id: nextID++, key: `KEY${nextID}`, libraryID: 1, itemTypeID: 1,
      dateAdded: '2026-01-01 00:00:00', deleted: false,
      fields: { DOI: '10.1000/example' }, creators: [], collections: [], tags: [], related: [],
      parentItemID: null, kind: 'regular', saves: 0,
      ...options,
      getField(name) { return name === 'dateAdded' ? this.dateAdded : (this.fields[name] ?? ''); },
      getUsedFields() { return Object.keys(this.fields); },
      setField(name, value) {
        if (this.rejectField === name) throw new Error('field rejected');
        if (name === 'dateAdded') this.dateAdded = value;
        else this.fields[name] = value;
      },
      getCreators() { return this.creators; },
      setCreators(value) { if (this.rejectCreators) throw new Error('creators rejected'); this.creators = value; },
      getTags() { return this.tags; },
      addTag(tag, type) { this.tags.push({ tag, type }); },
      getCollections() { return this.collections; },
      setCollections(value) { this.collections = value; },
      isTopLevelItem() { return !this.parentItemID; },
      isRegularItem() { return this.kind === 'regular'; },
      getAttachments(includeDeleted = false) {
        return [...items.values()].filter(x => x.parentItemID === this.id &&
          x.kind === 'attachment' && (includeDeleted || !x.deleted)).map(x => x.id);
      },
      getNotes(includeDeleted = false) {
        return [...items.values()].filter(x => x.parentItemID === this.id &&
          x.kind === 'note' && (includeDeleted || !x.deleted)).map(x => x.id);
      },
      async save() { if (this.rejectSave) throw new Error('save rejected'); this.saves++; },
    };
    Object.defineProperty(record, 'relatedItems', { get() { return this.related; } });
    items.set(record.id, record);
    return record;
  }
  const Zotero = {
    debug() {}, Libraries: { userLibraryID: 1 },
    ItemFields: { getID: x => x, isValidForType: () => true },
    Items: { getAsync: async ids => Array.isArray(ids) ? ids.map(x => items.get(x)) : items.get(ids) },
    Search: class {
      addCondition() {}
      async search() { return [...items.values()].map(x => x.id); }
    },
    DB: {
      requireTransaction() { assert.ok(inTransaction, 'merge must require a transaction'); },
      async executeTransaction(fn) {
        calls.transactions++;
        const snapshots = new Map([...items].map(([id, x]) => [id, JSON.parse(JSON.stringify(x))]));
        inTransaction = true;
        try { return await fn(); }
        catch (error) {
          for (const [id, snapshot] of snapshots) {
            delete snapshot.relatedItems;
            Object.assign(items.get(id), snapshot);
          }
          throw error;
        }
        finally { inTransaction = false; }
      },
    },
  };
  const nativeMerge = async (survivor, others) => {
    Zotero.DB.requireTransaction();
    // Attachments must already have moved; the native engine must not be given
    // duplicates to coalesce, including matching or trashed files.
    for (const other of others) assert.deepEqual(other.getAttachments(true), []);
    calls.merges.push({ survivor: survivor.id, others: others.map(x => x.id) });
    if (calls.rejectMerge) throw new Error('native merge failed');
    for (const other of others) {
      survivor.collections = [...new Set([...survivor.collections, ...other.collections])];
      survivor.related = [...new Set([...survivor.related, ...other.related])];
      survivor.tags.push(...other.tags);
      for (const id of other.getNotes(true)) items.get(id).parentItemID = survivor.id;
      other.deleted = true;
    }
  };
  Zotero.Items.merge = nativeMerge;
  const context = vm.createContext({ Zotero, Services: { prompt: { confirm() {
    calls.confirmations++; return calls.confirm !== false;
  } } }, ChromeUtils: { importESModule(uri) {
    assert.equal(uri, 'chrome://zotero/content/mergeItems.mjs');
    return { mergeItems: nativeMerge };
  } } });
  vm.runInContext(source, context);
  const app = Zotero.ArgusOne;
  const window = { alert: x => calls.alerts.push(x) };
  return { app, item, items, calls, Zotero, window,
    merge: group => Zotero.DB.executeTransaction(() => app.mergeGroup(group)) };
}

test('normalizes DOI prefixes and rejects incomplete or whitespace-bearing values', () => {
  const { app } = harness();
  for (const input of ['doi:10.1000/EXAMPLE', 'https://dx.doi.org/10.1000/EXAMPLE', '10.1000/Example ']) {
    assert.equal(app.normalizeDOI(input), '10.1000/example');
  }
  for (const input of ['', '10.invalid/name', '10.1000/', '10.1000/name trailing text']) {
    assert.equal(app.normalizeDOI(input), null);
  }
});

test('ignores deleted, nonregular, child and other-library records at discovery', async () => {
  const h = harness();
  const a = h.item(); const b = h.item();
  h.item({ deleted: true }); h.item({ libraryID: 2 });
  h.item({ kind: 'attachment' }); h.item({ parentItemID: a.id });
  const groups = await h.app.findDuplicateGroups(1);
  assert.deepEqual(Array.from(groups[0], x => x.id), [a.id, b.id]);
});

test('reads an Extra DOI without accepting an ambiguous partial value', () => {
  const h = harness();
  assert.equal(h.app.getItemDOI(h.item({ fields: { extra: 'DOI: 10.1000/EXAMPLE' } })),
    '10.1000/example');
  assert.equal(h.app.getItemDOI(h.item({ fields: { extra: 'DOI: 10.1000/EXAMPLE more text' } })), null);
});

test('unexpected field-read failures remain visible during discovery', async () => {
  const h = harness(); const broken = h.item();
  broken.getField = () => { throw new Error('field unavailable'); };
  await assert.rejects(h.app.findDuplicateGroups(1), /field unavailable/);
});

test('uses the host relation merger with a getter-only relatedItems property', async () => {
  const h = harness(); const old = h.item({ related: ['EXTERNAL'] }); const newest = h.item();
  await h.merge([old, newest]);
  assert.deepEqual(newest.relatedItems, ['EXTERNAL']);
  assert.equal(h.calls.merges.length, 1);
});

test('preserves newest fields, fills blanks, and routes relations through native merge', async () => {
  const h = harness();
  const old = h.item({ fields: { DOI: '10.1000/example', title: 'old', abstractNote: 'abstract', volume: 10 },
    creators: [{ lastName: 'Example' }], collections: [2], related: ['EXTERNAL'] });
  const newest = h.item({ dateAdded: '2026-02-01 00:00:00',
    fields: { DOI: '10.1000/example', title: 'new', volume: 0 }, collections: [1] });
  const attachment = h.item({ kind: 'attachment', parentItemID: old.id });
  const trashed = h.item({ kind: 'attachment', parentItemID: old.id, deleted: true });
  const note = h.item({ kind: 'note', parentItemID: old.id });
  const result = await h.merge([old, newest]);
  assert.equal(result.survivorID, newest.id);
  assert.equal(newest.fields.title, 'new');
  assert.equal(newest.fields.abstractNote, 'abstract');
  assert.equal(newest.fields.volume, 0);
  assert.equal(newest.creators[0].lastName, 'Example');
  assert.deepEqual(newest.relatedItems, ['EXTERNAL']);
  assert.equal(h.calls.merges.length, 1);
  for (const child of [attachment, trashed, note]) assert.equal(child.parentItemID, newest.id);
  assert.equal(trashed.deleted, true);
  assert.equal(attachment.deleted, false);
  assert.equal(old.deleted, true);
});

test('date ties choose the larger ID without mutating the supplied group', async () => {
  const h = harness(); const first = h.item(); const second = h.item(); const group = [first, second];
  assert.equal((await h.merge(group)).survivorID, second.id);
  assert.deepEqual(group.map(x => x.id), [first.id, second.id]);
});

for (const fault of ['field', 'creators', 'attachment', 'native']) {
  test(`propagates ${fault} errors so the transaction can roll back`, async () => {
    const h = harness();
    const old = h.item({ fields: { DOI: '10.1000/example', title: 'old' }, creators: [{ lastName: 'Example' }] });
    const newest = h.item({ dateAdded: '2026-02-01 00:00:00' });
    const child = h.item({ kind: 'attachment', parentItemID: old.id });
    if (fault === 'field') newest.rejectField = 'title';
    if (fault === 'creators') newest.rejectCreators = true;
    if (fault === 'attachment') child.rejectSave = true;
    if (fault === 'native') h.calls.rejectMerge = true;
    await assert.rejects(h.merge([old, newest]));
    assert.equal(old.deleted, false);
    assert.equal(child.parentItemID, old.id);
    assert.equal(newest.fields.title, undefined);
  });
}

for (const change of [{ deleted: true }, { libraryID: 2 }, { fields: { DOI: '10.1000/different' } },
  { dateAdded: 'not a date' }, { kind: 'attachment' }]) {
  test(`rejects a stale or ineligible merge group: ${JSON.stringify(change)}`, async () => {
    const h = harness(); const a = h.item(); const b = h.item(change);
    await assert.rejects(h.merge([a, b]));
    assert.equal(h.calls.merges.length, 0);
  });
}

test('cancel does not begin a transaction; a later run can still proceed', async () => {
  const h = harness(); h.item(); h.item(); h.calls.confirm = false;
  await h.app.runInteractive(h.window);
  assert.equal(h.calls.transactions, 0);
  h.calls.confirm = true;
  await h.app.runInteractive(h.window);
  assert.equal(h.calls.merges.length, 1);
});

test('simultaneous menu invocations cannot start two merges', async () => {
  const h = harness(); h.item(); h.item();
  await Promise.all([h.app.runInteractive(h.window), h.app.runInteractive(h.window)]);
  assert.equal(h.calls.confirmations, 1);
  assert.equal(h.calls.merges.length, 1);
});

test('a later group failure aborts the entire interactive batch and releases the lock', async () => {
  const h = harness(); const first = h.item(); h.item();
  const later = h.item({ fields: { DOI: '10.1000/second', title: 'filled' } });
  h.item({ fields: { DOI: '10.1000/second' }, rejectField: 'title' });
  await assert.rejects(h.app.runInteractive(h.window), /field rejected/);
  assert.equal(first.deleted, false);
  assert.equal(later.deleted, false);
  assert.equal(h.app.running, false);
  assert.equal(h.calls.alerts.length, 0);
});
