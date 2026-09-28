/* Validate persisted data before it reaches rendering or simulation. */
(() => {
  "use strict";
  const text = (v) => typeof v === "string" && v.length <= 100000;
  const id = (v) => text(v) && /^[a-zA-Z0-9_-]{1,120}$/.test(v);
  const number =
    (min = 0, max = 1e15) =>
    (v) =>
      Number.isFinite(v) && v >= min && v <= max;
  const bool = (v) => typeof v === "boolean";
  const one =
    (...values) =>
    (v) =>
      values.includes(v);
  const optional = (check) => (v) => v === undefined || check(v);
  const nullable = (check) => (v) => v === null || check(v);
  const array =
    (check, min = 0, max = 1000) =>
    (v) =>
      Array.isArray(v) && v.length >= min && v.length <= max && v.every(check);
  const object = (fields) => (v) =>
    !!v &&
    typeof v === "object" &&
    !Array.isArray(v) &&
    Object.entries(fields).every(([key, check]) => check(v[key]));
  const record = (check) => (v) =>
    !!v &&
    typeof v === "object" &&
    !Array.isArray(v) &&
    Object.values(v).every(check);
  const unique = (items) =>
    new Set(items.map((item) => item.id)).size === items.length;
  const node = object({
    id,
    type: one("trigger", "agent", "tool", "condition", "memory", "output"),
    x: number(0, 5000),
    y: number(0, 5000),
    label: text,
    prompt: text,
    temperature: optional(number(0, 2)),
    retries: optional(number(0, 10)),
  });
  window.validateWorkspace = (v) =>
    object({
      projectName: text,
      nodes: array(node, 0, 100),
      edges: array(object({ id, source: id, target: id }), 0, 500),
    })(v) &&
    unique(v.nodes) &&
    unique(v.edges) &&
    v.edges.every(
      (e) =>
        v.nodes.some((n) => n.id === e.source) &&
        v.nodes.some((n) => n.id === e.target),
    );
})();
