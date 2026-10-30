/* Argus One — argus.js
 *
 * Strategy:
 *   1. Build a map: normalized DOI -> array of items.
 *   2. For each group with >1 item, pick the "newest" item by dateAdded.
 *   3. Newest's fields are authoritative; fields it doesn't have are filled
 *      from older siblings (so we don't lose data, but conflicts go to newest).
 *   4. Union the set of collections across all siblings; ensure the surviving
 *      item ends up in every one of those collections.
 *   5. Re-parent children (attachments, notes) of older siblings to the survivor.
 *   6. Merge tags, relations, and "related" links.
 *   7. Move older siblings to trash.
 */

Zotero.ArgusOne = {
  id: null,
  version: null,
  rootURI: null,
  menuRegistrationID: null,
  stopped: false,
  lifecycle: 0,

  init({ id, version, rootURI }) {
    this.id = id;
    this.version = version;
    this.rootURI = rootURI;
    this.stopped = false;
    this.lifecycle++;
  },

  shutdown() {
    this.stopped = true;
    this.lifecycle++;
    this.unregisterMenu();
  },

  assertActive(lifecycle) {
    if (this.stopped || lifecycle !== this.lifecycle) {
      throw new Error("Argus One was disabled; no further merge groups will start");
    }
  },

  log(msg) {
    Zotero.debug("[Argus One] " + msg);
  },

  // ───────────────────────────────────────── UI (Zotero 8/9 MenuManager)

  registerMenu() {
    this.menuRegistrationID = Zotero.MenuManager.registerMenu({
      menuID: "argus-one-tools-menu",
      pluginID: this.id,
      target: "main/menubar/tools",
      menus: [
        {
          menuType: "menuitem",
          l10nID: "argus-one-menu-merge",
          onCommand: (event) => {
            const win = event?.target?.ownerGlobal || Zotero.getMainWindow();
            this.runInteractive(win).catch((e) => {
              this.log("ERROR " + e + "\n" + (e.stack || ""));
              win.alert("Argus One error:\n" + e);
            });
          },
        },
      ],
    });
  },

  unregisterMenu() {
    if (this.menuRegistrationID && Zotero.MenuManager?.unregisterMenu) {
      try { Zotero.MenuManager.unregisterMenu(this.menuRegistrationID); } catch (e) {}
    }
    this.menuRegistrationID = null;
  },

  // DOI wrappers are removed; punctuation within an identifier is preserved.
  normalizeDOI(doi) {
    if (typeof doi !== "string") return null;
    const value = doi.trim().toLowerCase()
      .replace(/^https?:\/\/(dx\.)?doi\.org\//, "")
      .replace(/^doi:\s*/, "").trim();
    return /^10\.\d{4,9}\/\S+$/.test(value) ? value : null;
  },

  getItemDOI(item) {
    const fieldID = Zotero.ItemFields.getID("DOI");
    if (Zotero.ItemFields.isValidForType(fieldID, item.itemTypeID)) {
      const dedicated = item.getField("DOI");
      if (dedicated) return this.normalizeDOI(dedicated);
    }
    const matches = [...String(item.getField("extra") || "").matchAll(/(?:^|\n)\s*DOI\s*:\s*(\S+)/gi)];
    const identifiers = new Set(matches.map(match => this.normalizeDOI(match[1])).filter(Boolean));
    return identifiers.size === 1 ? [...identifiers][0] : null;
  },

  snapshot(item) {
    return JSON.stringify({
      id: item.id, key: item.key, libraryID: item.libraryID, itemTypeID: item.itemTypeID,
      dateAdded: item.dateAdded, dateModified: item.dateModified, version: item.version,
      deleted: item.deleted,
      fields: item.getUsedFields(true).sort().map(name => [name, item.getField(name)]),
      creators: item.getCreators(), tags: item.getTags(), collections: item.getCollections().sort((a, b) => a - b),
      relations: Object.entries(item.getRelations()).sort(([a], [b]) => a.localeCompare(b)),
      attachments: item.getAttachments(true).sort((a, b) => a - b),
      notes: item.getNotes(true).sort((a, b) => a - b),
    });
  },

  validateGroup(items) {
    if (!Array.isArray(items) || items.length < 2) throw new Error("A merge needs at least two items");
    const ids = new Set(items.map(item => item.id));
    const doi = this.getItemDOI(items[0]);
    const typeID = items[0].itemTypeID;
    if (ids.size !== items.length || !doi) throw new Error("Invalid duplicate group");
    for (const item of items) {
      if (item.libraryID !== Zotero.Libraries.userLibraryID || !item.isRegularItem()
          || !item.isTopLevelItem() || item.deleted || !item.isEditable()
          || item.itemTypeID !== typeID || this.getItemDOI(item) !== doi) {
        throw new Error("Group has changed or contains incompatible items; rescan before merging");
      }
      if (item.hasChanged()) throw new Error("An item has unsaved edits; save them and rescan");
      if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(item.dateAdded)) {
        throw new Error("An item has an unsupported dateAdded value; review it before merging");
      }
    }
    return doi;
  },

  async findDuplicateGroups(libraryID) {
    if (libraryID !== Zotero.Libraries.userLibraryID) throw new Error("Only the personal library is supported");
    const library = Zotero.Libraries.get(libraryID);
    if (!library?.editable) throw new Error("The personal library is not editable");
    await library.waitForDataLoad("item");
    const search = new Zotero.Search();
    search.libraryID = libraryID;
    search.addCondition("itemType", "isNot", "attachment");
    search.addCondition("itemType", "isNot", "note");
    search.addCondition("deleted", "false");
    const items = await Zotero.Items.getAsync(await search.search());
    const byDOI = new Map();
    for (const item of items) {
      if (!item?.isRegularItem() || !item.isTopLevelItem() || item.deleted) continue;
      await item.loadAllData();
      const doi = this.getItemDOI(item);
      if (!doi) continue;
      if (!byDOI.has(doi)) byDOI.set(doi, []);
      byDOI.get(doi).push(item);
    }
    return [...byDOI.values()].filter(items => items.length > 1);
  },

  planGroups(groups) {
    const plans = [], skipped = [];
    for (const items of groups) {
      try {
        const doi = this.validateGroup(items);
        const ordered = [...items].sort((a, b) => b.dateAdded.localeCompare(a.dateAdded) || b.id - a.id);
        plans.push(this.freezePlan({ doi, ids: ordered.map(item => item.id),
          snapshots: ordered.map(item => this.snapshot(item)),
          survivorKey: ordered[0].key, title: ordered[0].getField("title"),
          loserKeys: ordered.slice(1).map(item => item.key) }));
      } catch (error) {
        skipped.push({ keys: items.map(item => item.key), reason: error.message });
      }
    }
    return { plans: Object.freeze(plans), skipped };
  },

  freezePlan(plan) {
    return Object.freeze({ ...plan, ids: Object.freeze([...plan.ids]),
      snapshots: Object.freeze([...plan.snapshots]), loserKeys: Object.freeze([...plan.loserKeys]) });
  },

  nativeMerge() {
    if (typeof ChromeUtils !== "undefined" && ChromeUtils.importESModule) {
      try {
        const module = ChromeUtils.importESModule("chrome://zotero/content/mergeItems.mjs");
        if (typeof module.mergeItems === "function") return module.mergeItems;
      } catch (error) {
        this.log("Native merge module unavailable; checking supported compatibility API");
      }
    }
    if (typeof Zotero.Items.merge === "function") return Zotero.Items.merge.bind(Zotero.Items);
    throw new Error("This Zotero version does not provide a supported native merge operation");
  },

  async recoveryScope(items) {
    // A DB rollback does not reset already-saved Zotero objects or its relation
    // index. Record the native merge's existing object scope before it writes.
    const records = new Map(items.map(item => [item.id, item]));
    const relationTargets = [...items];
    for (const item of items) {
      const children = await Zotero.Items.getAsync([...item.getAttachments(true), ...item.getNotes(true)]);
      for (const child of children) {
        if (!child) throw new Error("A child item is missing; rescan");
        await child.loadAllData();
        records.set(child.id, child);
        if (child.isFileAttachment()) {
          for (const annotation of child.getAnnotations(true)) {
            await annotation.loadAllData();
            records.set(annotation.id, annotation);
          }
        }
        if (child.isAttachment()) relationTargets.push(child);
      }
    }
    for (const target of relationTargets) {
      for (const { subject } of await Zotero.Relations.getByObject("item", Zotero.URI.getItemURI(target))) {
        if (subject.libraryID !== target.libraryID) continue;
        await subject.loadAllData();
        records.set(subject.id, subject);
      }
    }
    return [...records.values()].map(item => ({ item, relations: item.getRelations() }));
  },

  async recoverObjects(scope) {
    for (const { item, relations } of scope) {
      try {
        // Remove both original and possibly saved tuples before rebuilding this
        // subject's relation index from the rolled-back database.
        for (const data of [relations, item.getRelations()]) {
          for (const [predicate, targets] of Object.entries(data)) {
            for (const target of targets) Zotero.Relations.unregister("item", item.id, predicate, target);
          }
        }
        await item.reload(null, true);
        for (const [predicate, targets] of Object.entries(item.getRelations())) {
          for (const target of targets) Zotero.Relations.register("item", item.id, predicate, target);
        }
      } catch (error) {
        this.log("Object recovery failed: " + error);
        this.needsRestart = true;
      }
    }
  },

  async mergeGroup(plan) {
    const lifecycle = this.lifecycle;
    this.assertActive(lifecycle);
    // Keep the reviewed identity and ordering stable while item loads await.
    plan = this.freezePlan(plan);
    if (this.needsRestart) throw new Error("Restart Zotero to reload library state before another merge");
    const items = await Zotero.Items.getAsync(plan.ids);
    if (items.length !== plan.ids.length || items.some(item => !item)) throw new Error("A reviewed item is missing; rescan");
    for (const item of items) await item.loadAllData();
    const merge = this.nativeMerge();
    // The native operation starts its own transaction. Never nest it: the
    // installed Zotero API waits for an existing transaction instead of nesting.
    if (Zotero.DB.transactionInProgress()) throw new Error("Zotero is busy; wait and rescan before merging");
    this.validateGroup(items);
    if (items.some((item, i) => this.snapshot(item) !== plan.snapshots[i])) {
      throw new Error("Items changed after preview; rescan before merging");
    }
    const scope = await this.recoveryScope(items);
    if (Zotero.DB.transactionInProgress()) throw new Error("Zotero is busy; wait and rescan before merging");
    this.validateGroup(items);
    if (items.some((item, i) => this.snapshot(item) !== plan.snapshots[i])) {
      throw new Error("Items changed after preview; rescan before merging");
    }
    if (scope.some(({ item }) => item.hasChanged())) {
      throw new Error("A child or related item has unsaved edits; save them and rescan");
    }
    this.assertActive(lifecycle);
    const [survivor, ...losers] = items;
    try {
      // Keep newest field values; fill only supported empty fields. These edits
      // remain in memory until the native operation saves them in its transaction.
      for (const loser of losers) {
        for (const name of loser.getUsedFields(true)) {
          const id = Zotero.ItemFields.getID(name);
          if (!id || !Zotero.ItemFields.isValidForType(id, survivor.itemTypeID)) continue;
          const value = loser.getField(name);
          if (!String(survivor.getField(name) || "").trim() && String(value || "").trim()) {
            survivor.setField(name, value);
          }
        }
        if (!survivor.getCreators().length && loser.getCreators().length) survivor.setCreators(loser.getCreators());
      }
      // Zotero handles replacement identity, incoming relations, collection/tag
      // union, child/annotation remapping, trash, and undo tracking.
      await merge(survivor, losers);
      return { survivorID: survivor.id, trashed: losers.length };
    } catch (error) {
      // Clear unsaved field filling and failed native-operation object changes.
      // The native transaction rolls back this group; earlier groups may be done.
      await this.recoverObjects(scope);
      if (this.needsRestart) throw new Error(`${error.message}. Restart Zotero before using the library; object recovery was incomplete`);
      throw error;
    }
  },

  async runInteractive(window) {
    if (this.needsRestart) { window.alert("Restart Zotero to reload library state before another merge."); return; }
    if (this.running) { window.alert("Argus One is already running."); return; }
    this.running = true;
    const lifecycle = this.lifecycle;
    let completed = 0, trashed = 0;
    try {
      this.assertActive(lifecycle);
      const { plans, skipped } = this.planGroups(await this.findDuplicateGroups(Zotero.Libraries.userLibraryID));
      this.assertActive(lifecycle);
      if (!plans.length) {
        window.alert("Argus One: no eligible DOI duplicate groups." +
          (skipped.length ? "\n\nNeeds review:\n" + skipped.map(row => row.keys.join(", ") + ": " + row.reason).join("\n") : ""));
        return;
      }
      const preview = plans.map(plan => `${plan.doi}\nKeep ${plan.survivorKey}: ${plan.title}\nTrash ${plan.loserKeys.join(", ")}`).join("\n\n");
      const ok = Services.prompt.confirm(window, "Argus One — review DOI merge plan",
        preview + `\n\n${plans.length} groups eligible; ${skipped.length} groups skipped for review.\n\n` +
        "Newest record values win; empty fields are filled. Zotero performs each group as its own native merge, " +
        "including attachment consolidation and citation links. Its earliest dateAdded is retained.\n\n" +
        "If a group fails, earlier successful groups remain merged. Keep a full library backup. Proceed?");
      if (!ok) return;
      for (const plan of plans) {
        this.assertActive(lifecycle);
        const result = await this.mergeGroup(plan);
        completed++;
        trashed += result.trashed;
      }
      window.alert(`Argus One: merged ${completed} groups; ${trashed} older records moved to trash. ` +
        `${skipped.length} groups were skipped. Review the results before emptying trash.`);
    } catch (error) {
      this.log("Merge stopped: " + error);
      window.alert(`Argus One stopped: ${error.message}\n${completed} groups completed; ${trashed} older records moved to trash. ` +
        "Completed groups remain merged. Rescan and review before continuing.");
    } finally {
      this.running = false;
    }
  },
};
