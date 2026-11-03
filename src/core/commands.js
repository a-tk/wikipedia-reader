// Maps chrome.commands command names to content-script actions.
// Kept as a pure lookup so it can be unit tested without the extension APIs.
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.WikiReader = root.WikiReader || {};
  root.WikiReader.commands = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  // Placeholder mapping; filled in and used by the service worker + content
  // script in Task 7.
  const COMMAND_ACTIONS = {
    "toggle-play": "togglePlay",
    stop: "stop",
    "skip-section": "skipSection",
  };

  function actionForCommand(command) {
    return COMMAND_ACTIONS[command] || null;
  }

  return { COMMAND_ACTIONS, actionForCommand };
});
