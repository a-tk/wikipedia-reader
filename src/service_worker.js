// service_worker.js — relays keyboard commands and toolbar clicks to the
// content script in the active Wikipedia tab (speechSynthesis is unavailable
// in a service worker), and serves the few chrome.* calls that content scripts
// cannot make themselves.
//
// This worker is stateless: every handler derives what it needs from its
// arguments, so it is safe for Chrome to terminate it between events.
"use strict";

// Send a playback command to a tab's content script. Resolves true if a
// content script received it, false if the tab has none (non-Wikipedia page,
// or a page that was open before the extension was reloaded).
async function relayCommand(tabId, command) {
  if (typeof tabId !== "number") return false;
  try {
    await chrome.tabs.sendMessage(tabId, { type: "command", command });
    return true;
  } catch (err) {
    // "Receiving end does not exist" — expected when the content script is absent.
    return false;
  }
}

// Current shortcut bindings, keyed by command name. Users can rebind these at
// chrome://extensions/shortcuts, so the UI asks for them instead of hardcoding.
async function getShortcuts() {
  const commands = await chrome.commands.getAll();
  const shortcuts = {};
  for (const c of commands) {
    if (c.name && c.shortcut) shortcuts[c.name] = c.shortcut;
  }
  return shortcuts;
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // Only accept messages from this extension's own pages and content scripts.
  if (sender.id !== chrome.runtime.id || !msg) return false;

  if (msg.type === "open-options") {
    // Content scripts cannot call chrome.runtime.openOptionsPage directly.
    (async () => {
      try {
        await chrome.runtime.openOptionsPage();
        sendResponse({ ok: true });
      } catch (err) {
        sendResponse({ ok: false });
      }
    })();
    return true; // keep the channel open for the async response
  }

  if (msg.type === "get-shortcuts") {
    (async () => {
      try {
        sendResponse({ shortcuts: await getShortcuts() });
      } catch (err) {
        sendResponse({ shortcuts: {} });
      }
    })();
    return true;
  }

  return false;
});

// Keyboard shortcuts. onCommand passes the active tab as its second argument,
// so no tabs query (and no `tabs` permission for tab.url) is needed; if the tab
// has no content script, the relay simply reports false and we do nothing.
chrome.commands.onCommand.addListener(async (command, tab) => {
  await relayCommand(tab && tab.id, command);
});

// Toolbar icon: toggle play/pause on a Wikipedia article, otherwise open the
// settings page so the click always does something useful.
chrome.action.onClicked.addListener(async (tab) => {
  const handled = await relayCommand(tab && tab.id, "toggle-play");
  if (!handled) await chrome.runtime.openOptionsPage();
});
