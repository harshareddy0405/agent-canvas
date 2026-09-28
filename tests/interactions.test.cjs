const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { boot } = require("./harness.cjs");
const key = fs
  .readFileSync(path.join(__dirname, "../app.js"), "utf8")
  .match(/const (?:STORAGE_KEY|STORE|KEY) = "([^"]+)"/)[1];
const fixture = async (t, options) => {
  const h = await boot(options);
  t.after(() => {
    const errors = [...h.errors];
    h.close();
    assert.deepEqual(errors, []);
  });
  return h;
};
const submit = (h, selector) =>
  h
    .$(selector)
    .dispatchEvent(
      new h.window.Event("submit", { bubbles: true, cancelable: true }),
    );
const readBlob = (h, blob) =>
  new Promise((resolve, reject) => {
    const r = new h.window.FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsText(blob);
  });
async function roundTrip(t, h) {
  await h.wait(450);
  const raw = h.window.localStorage.getItem(key);
  assert.ok(raw, "Interaction should persist workspace data");
  assert.equal(
    h.window.validateWorkspace(JSON.parse(raw)),
    true,
    "Generated state must satisfy its schema",
  );
  const reloaded = await fixture(t, { saved: { [key]: raw } });
  assert.equal(
    reloaded.$("#storage-notice"),
    null,
    "Valid edits must not be discarded on reload",
  );
}
test("graph editing supports undo/redo and durable node configuration", async (t) => {
  const h = await fixture(t);
  const count = h.document.querySelectorAll(".canvas-node").length;
  h.click('[data-component-type="agent"]');
  assert.equal(h.document.querySelectorAll(".canvas-node").length, count + 1);
  h.click("#undo-button");
  assert.equal(h.document.querySelectorAll(".canvas-node").length, count);
  h.click("#redo-button");
  assert.equal(h.document.querySelectorAll(".canvas-node").length, count + 1);
  h.click(".canvas-node");
  h.input("#node-label", "Evidence checker");
  await roundTrip(t, h);
});
test("graph export is parseable and invalid topology is rejected", async (t) => {
  const h = await fixture(t);
  h.click("#export-button");
  const data = JSON.parse(h.$("#export-code").textContent);
  const graph = {
    projectName: data.metadata.name,
    nodes: data.nodes.map((n) => ({
      id: n.id,
      type: n.type,
      label: n.label,
      x: n.position.x,
      y: n.position.y,
      ...n.config,
    })),
    edges: data.edges,
  };
  assert.ok(Array.isArray(graph.nodes));
  assert.equal(h.window.validateWorkspace(graph), true);
  assert.equal(
    h.window.validateWorkspace({
      ...graph,
      nodes: [...graph.nodes, graph.nodes[0]],
    }),
    false,
  );
  h.click("#download-json");
  assert.equal(h.downloads.length, 1);
});
