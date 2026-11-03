// service_worker.js — the only job here is to relay keyboard commands
// (chrome.commands) to the content script in the active Wikipedia tab, since
// speechSynthesis is unavailable in a service worker.
"use strict";

chrome.runtime.onInstalled.addListener(() => {
  console.log("[Wikipedia Reader] installed. Shortcuts configurable at chrome://extensions/shortcuts");
});

chrome.commands.onCommand.addListener((command) => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs && tabs[0];
    if (!tab || !tab.id) return;
    // Only relay to Wikipedia pages the content script runs on.
    if (!/^https?:\/\/[^/]*\.wikipedia\.org\/wiki\//.test(tab.url || "")) return;
    chrome.tabs.sendMessage(tab.id, { type: "command", command }, () => {
      // Swallow "no receiving end" errors when the content script is absent.
      void chrome.runtime.lastError;
    });
  });
});
