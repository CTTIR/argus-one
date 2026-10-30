/* Argus One — bootstrap.js
 * Lifecycle hooks for the declared Zotero 9/10 plugin range.
 */

const FTL_FILE = "argus-one.ftl";
var ArgusOne;

function log(msg) {
  Zotero.debug("[Argus One] " + msg);
}

function install() {}
function uninstall() {}

async function startup({ id, version, rootURI }) {
  log("startup " + version);
  Services.scriptloader.loadSubScript(rootURI + "argus.js");
  ArgusOne = Zotero.ArgusOne;
  ArgusOne.init({ id, version, rootURI });
  for (const win of Zotero.getMainWindows()) {
    if (win.MozXULElement) win.MozXULElement.insertFTLIfNeeded(FTL_FILE);
  }
  ArgusOne.registerMenu();
}

function shutdown() {
  log("shutdown");
  if (ArgusOne) ArgusOne.shutdown();
  ArgusOne = undefined;
  if (Zotero.ArgusOne) delete Zotero.ArgusOne;
}

function onMainWindowLoad({ window }) {
  if (window.MozXULElement) window.MozXULElement.insertFTLIfNeeded(FTL_FILE);
}

function onMainWindowUnload({ window }) {}
