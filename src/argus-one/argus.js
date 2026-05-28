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

  init({ id, version, rootURI }) {
    this.id = id;
    this.version = version;
    this.rootURI = rootURI;
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

  // ───────────────────────────────────────── DOI helpers

  normalizeDOI(doi) {
    if (!doi) return null;
    let s = String(doi).trim().toLowerCase();
    // Strip common prefixes/URLs.
    s = s.replace(/^https?:\/\/(dx\.)?doi\.org\//, "");
    s = s.replace(/^doi:\s*/, "");
    s = s.trim();
    if (!s) return null;
    // Sanity check: a DOI must start with "10." and contain a slash.
    if (!/^10\.\S+\/\S+/.test(s)) return null;
    return s;
  },

  getItemDOI(item) {
    // Try the dedicated DOI field first.
    let doi = null;
    try {
      if (item.getField && Zotero.ItemFields.isValidForType(
        Zotero.ItemFields.getID("DOI"), item.itemTypeID)) {
        doi = item.getField("DOI");
      }
    } catch (e) { /* field not valid for this type */ }
    if (doi) return this.normalizeDOI(doi);

    // Fall back to scanning Extra for "DOI: ..." (common for items without a DOI field).
    try {
      const extra = item.getField("extra");
      if (extra) {
        const m = extra.match(/(?:^|\n)\s*DOI\s*:\s*(\S+)/i);
        if (m) return this.normalizeDOI(m[1]);
      }
    } catch (e) {}
    return null;
  },

  // ───────────────────────────────────────── Main entry

  async runInteractive(window) {
    const libraryID = Zotero.Libraries.userLibraryID;
    // Could be extended to group libraries; user library by default.
    const groups = await this.findDuplicateGroups(libraryID);

    const groupCount = groups.length;
    const totalItems = groups.reduce((n, g) => n + g.length, 0);
    const willRemove = totalItems - groupCount;

    if (groupCount === 0) {
      window.alert("Argus One: no DOI duplicates found.");
      return;
    }

    const ok = Services.prompt.confirm(
      window,
      "Argus One",
      `Found ${groupCount} DOI duplicate group${groupCount === 1 ? "" : "s"} ` +
      `covering ${totalItems} items.\n\n` +
      `Merging will:\n` +
      `  • Keep the newest record per DOI (by dateAdded)\n` +
      `  • Fill missing fields from older copies\n` +
      `  • Preserve every collection the duplicates appeared in\n` +
      `  • Move ${willRemove} older record${willRemove === 1 ? "" : "s"} to trash\n\n` +
      `Proceed?`
    );
    if (!ok) return;

    let merged = 0;
    let trashed = 0;
    await Zotero.DB.executeTransaction(async () => {
      for (const group of groups) {
        const r = await this.mergeGroup(group);
        merged++;
        trashed += r.trashed;
      }
    });

    window.alert(
      `Argus One done.\n\n` +
      `Merged ${merged} group${merged === 1 ? "" : "s"}.\n` +
      `${trashed} older record${trashed === 1 ? "" : "s"} moved to trash.`
    );
  },

  // ───────────────────────────────────────── Discovery

  async findDuplicateGroups(libraryID) {
    // Top-level, non-trashed, regular items in this library.
    const s = new Zotero.Search();
    s.libraryID = libraryID;
    s.addCondition("itemType", "isNot", "attachment");
    s.addCondition("itemType", "isNot", "note");
    s.addCondition("deleted", "false");
    const ids = await s.search();
    const items = await Zotero.Items.getAsync(ids);

    const byDoi = new Map();
    for (const item of items) {
      if (!item.isTopLevelItem()) continue;
      const doi = this.getItemDOI(item);
      if (!doi) continue;
      if (!byDoi.has(doi)) byDoi.set(doi, []);
      byDoi.get(doi).push(item);
    }

    const groups = [];
    for (const arr of byDoi.values()) {
      if (arr.length > 1) groups.push(arr);
    }
    return groups;
  },

  // ───────────────────────────────────────── Merge one group

  async mergeGroup(items) {
    // Newest = greatest dateAdded. Ties broken by itemID (higher wins).
    items.sort((a, b) => {
      const da = new Date(a.dateAdded).getTime();
      const db = new Date(b.dateAdded).getTime();
      if (db !== da) return db - da;
      return b.id - a.id;
    });
    const survivor = items[0];
    const losers = items.slice(1);

    // ── 1. Fields: newest is authoritative; fill blanks from losers (newest loser first).
    const survivorTypeID = survivor.itemTypeID;
    for (const loser of losers) {
      // Only copy fields valid for the survivor's item type.
      const fields = loser.getUsedFields(true);
      for (const fieldName of fields) {
        let fieldID;
        try { fieldID = Zotero.ItemFields.getID(fieldName); } catch (e) { continue; }
        if (!fieldID) continue;
        if (!Zotero.ItemFields.isValidForType(fieldID, survivorTypeID)) continue;

        const survivorVal = survivor.getField(fieldName);
        if (survivorVal && String(survivorVal).trim() !== "") continue; // newest wins
        const loserVal = loser.getField(fieldName);
        if (loserVal && String(loserVal).trim() !== "") {
          try { survivor.setField(fieldName, loserVal); } catch (e) {}
        }
      }

      // Creators: keep survivor's if it has any, else borrow from this loser.
      if (survivor.getCreators().length === 0) {
        const c = loser.getCreators();
        if (c.length) {
          try { survivor.setCreators(c); } catch (e) {}
        }
      }
    }

    // ── 2. Tags: union.
    const tagSeen = new Set(survivor.getTags().map((t) => t.tag + "\x00" + (t.type || 0)));
    for (const loser of losers) {
      for (const t of loser.getTags()) {
        const key = t.tag + "\x00" + (t.type || 0);
        if (!tagSeen.has(key)) {
          survivor.addTag(t.tag, t.type);
          tagSeen.add(key);
        }
      }
    }

    // ── 3. Collections: union — this is the position-preservation guarantee.
    const targetCollections = new Set(survivor.getCollections());
    for (const loser of losers) {
      for (const cid of loser.getCollections()) targetCollections.add(cid);
    }
    survivor.setCollections([...targetCollections]);

    // ── 4. Related items: union (excluding the losers themselves).
    const loserKeys = new Set(losers.map((l) => l.key));
    const relations = new Set(survivor.relatedItems);
    for (const loser of losers) {
      for (const k of loser.relatedItems) {
        if (!loserKeys.has(k)) relations.add(k);
      }
    }
    survivor.relatedItems = [...relations];

    await survivor.save();

    // ── 5. Re-parent children (attachments, notes) from losers to survivor.
    for (const loser of losers) {
      const childIDs = [].concat(loser.getAttachments(), loser.getNotes());
      for (const cid of childIDs) {
        const child = await Zotero.Items.getAsync(cid);
        child.parentItemID = survivor.id;
        await child.save();
      }
    }

    // ── 6. Trash the losers.
    for (const loser of losers) {
      loser.deleted = true;
      await loser.save();
    }

    return { survivorID: survivor.id, trashed: losers.length };
  },
};
