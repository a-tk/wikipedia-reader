// Trivial module used by the Task 1 smoke test to confirm the test
// harness and the UMD-style export pattern both work.
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.WikiReader = root.WikiReader || {};
  root.WikiReader.hello = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  function hello(name) {
    return `Wikipedia Reader ready${name ? `, ${name}` : ""}.`;
  }
  return { hello };
});
