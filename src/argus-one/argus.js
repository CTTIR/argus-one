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
  running: false,

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
    // Require a numeric DOI prefix and the entire non-whitespace suffix.
    if (!/^10\.\d+(?:\.\d+)*\/\S+$/.test(s)) return null;
    return s;
  },

  getItemDOI(item) {
    // Invalid-for-type fields are expected; unexpected host errors must remain
    // visible instead of silently removing records from the duplicate scan.
    const doiField = Zotero.ItemFields.getID("DOI");
    if (Zotero.ItemFields.isValidForType(doiField, item.itemTypeID)) {
      const doi = item.getField("DOI");
      if (doi) return this.normalizeDOI(doi);
    }
    const extra = item.getField("extra");
    const match = extra && extra.match(/(?:^|\n)\s*DOI\s*:\s*([^\r\n]+)/i);
    return match ? this.normalizeDOI(match[1]) : null;
  },

  // ───────────────────────────────────────── Main entry

  async runInteractive(window) {
    if (this.running) {
      window.alert("Argus One: a merge is already in progress.");
      return;
    }
    this.running = true;
    try {
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
    } finally {
      this.running = false;
    }
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
      if (!item || item.libraryID !== libraryID || item.deleted ||
          !item.isRegularItem() || !item.isTopLevelItem()) continue;
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
    Zotero.DB.requireTransaction();
    if (!Array.isArray(items) || items.length < 2 ||
        new Set(items.map(item => item.id)).size !== items.length) {
      throw new Error("A merge group must contain at least two distinct items.");
    }
    const doi = this.getItemDOI(items[0]);
    for (const item of items) {
      if (!doi || item.deleted || !item.isRegularItem() || !item.isTopLevelItem() ||
          item.libraryID !== Zotero.Libraries.userLibraryID || this.getItemDOI(item) !== doi) {
        throw new Error("The duplicate group changed. Run the scan again before merging.");
      }
      if (!Number.isFinite(this.dateAddedTime(item))) {
        throw new Error("An item has an invalid dateAdded; the newest record cannot be selected.");
      }
    }

    // Copy before sorting so the confirmed discovery result remains unchanged.
    const ordered = [...items].sort((a, b) =>
      this.dateAddedTime(b) - this.dateAddedTime(a) || b.id - a.id);
    const [survivor, ...losers] = ordered;
    const missing = value => value == null || value === false || String(value).trim() === "";

    // Only fill fields supported by the survivor's type. An unexpected host
    // error must escape so the surrounding transaction can roll back.
    for (const loser of losers) {
      for (const fieldName of loser.getUsedFields(true)) {
        const fieldID = Zotero.ItemFields.getID(fieldName);
        if (!fieldID || !Zotero.ItemFields.isValidForType(fieldID, survivor.itemTypeID)) continue;
        if (missing(survivor.getField(fieldName))) {
          const value = loser.getField(fieldName);
          if (!missing(value)) survivor.setField(fieldName, value);
        }
      }
      if (survivor.getCreators().length === 0 && loser.getCreators().length) {
        survivor.setCreators(loser.getCreators());
      }
    }
    await survivor.save();

    // Preserve every attachment as a separate record, including trashed ones.
    // Moving first prevents Zotero's native merge from coalescing similar PDFs.
    for (const loser of losers) {
      for (const id of loser.getAttachments(true)) {
        const attachment = await Zotero.Items.getAsync(id);
        attachment.parentItemID = survivor.id;
        await attachment.save();
      }
      if (loser.getAttachments(true).length) {
        throw new Error("Not all attachments could be moved; the merge was cancelled.");
      }
    }

    // Let Zotero preserve incoming/outgoing relations and citation redirects,
    // rewrite note links, union collections/tags, and trash the older records.
    // relatedItems is a getter-only property, not a writable item field.
    const { mergeItems } = ChromeUtils.importESModule("chrome://zotero/content/mergeItems.mjs");
    await mergeItems(survivor, losers);
    return { survivorID: survivor.id, trashed: losers.length };
  },

  dateAddedTime(item) {
    // Zotero stores SQL timestamps in UTC. Parse consistently across hosts.
    const value = String(item.dateAdded || "");
    const iso = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)
      ? value.replace(" ", "T") + "Z" : value;
    return Date.parse(iso);
  },
};
