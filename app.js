(() => {
  "use strict";

  const STORAGE_KEY = "agent-canvas.workspace.v1";
  const THEME_KEY = "agent-canvas.theme";
  const WORLD = { width: 1600, height: 1000 };
  const NODE_WIDTH = 228;

  const ICONS = {
    trigger:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13 2 5 13h6l-1 9 9-12h-6V2Z"/></svg>',
    agent:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="6" width="16" height="13" rx="4"/><path d="M9 11h.01M15 11h.01M9 15h6M12 6V3M10 3h4"/></svg>',
    tool: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 6a4 4 0 0 0-5 5L3 17l4 4 6-6a4 4 0 0 0 5-5l-3 3-3-1-1-3 3-3Z"/></svg>',
    condition:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3v5a4 4 0 0 0 4 4h4a4 4 0 0 1 4 4v5M6 21v-5a4 4 0 0 1 4-4M3 3h6M3 21h6M15 3h6"/></svg>',
    memory:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><ellipse cx="12" cy="6" rx="7" ry="3"/><path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6"/></svg>',
    output:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h13m0 0-4-4m4 4-4 4M4 5v14"/></svg>',
  };

  const CATALOG = {
    trigger: {
      label: "Event trigger",
      short: "Trigger",
      description: "Starts a flow from an event or schedule.",
      prompt:
        "Accept the incoming event, validate its payload, and pass normalized input to the next step.",
      color: "#ff7c6b",
      model: "local-runtime",
    },
    agent: {
      label: "AI agent",
      short: "Agent",
      description: "Reasons, decides, and creates with an LLM.",
      prompt:
        "You are a precise, helpful specialist. Analyze the available context, explain your reasoning briefly, and return a structured response.",
      color: "#8067ff",
      model: "gpt-4.1",
    },
    tool: {
      label: "Tool action",
      short: "Tool",
      description: "Calls an API, function, or external service.",
      prompt:
        "Execute the configured tool with validated arguments and return a concise result object.",
      color: "#3ddbd9",
      model: "local-runtime",
    },
    condition: {
      label: "Logic router",
      short: "Condition",
      description: "Routes execution using natural-language rules.",
      prompt:
        "Evaluate the input against the routing rules. Return the matching route and a confidence score.",
      color: "#f6b94a",
      model: "gpt-4.1-mini",
    },
    memory: {
      label: "Memory store",
      short: "Memory",
      description: "Reads or writes persistent agent context.",
      prompt:
        "Retrieve the most relevant memories for the current task and update the store with durable facts.",
      color: "#63d6a6",
      model: "local-runtime",
    },
    output: {
      label: "Output",
      short: "Output",
      description: "Delivers the result to a channel or user.",
      prompt:
        "Format the final result for the destination, preserving important context and next actions.",
      color: "#62a8ff",
      model: "local-runtime",
    },
  };

  const TEMPLATES = [
    {
      id: "customer-intelligence",
      name: "Customer intelligence",
      badge: "Popular",
      color: "#8067ff",
      description:
        "Qualify feedback, detect churn risk, and route the right response.",
      types: ["trigger", "agent", "condition", "memory", "output"],
    },
    {
      id: "research-swarm",
      name: "Research swarm",
      badge: "3 agents",
      color: "#3ddbd9",
      description:
        "Parallel research agents synthesize evidence into a cited brief.",
      types: ["trigger", "agent", "agent", "agent", "output"],
    },
    {
      id: "content-engine",
      name: "Content engine",
      badge: "Creative",
      color: "#ff7c6b",
      description:
        "Turn one idea into a reviewed, channel-ready content package.",
      types: ["trigger", "agent", "tool", "condition", "output"],
    },
  ];

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [
    ...root.querySelectorAll(selector),
  ];
  const uid = (prefix = "node") =>
    `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const deepClone = (value) => JSON.parse(JSON.stringify(value));
  const escapeHTML = (value = "") =>
    String(value).replace(
      /[&<>'"]/g,
      (character) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          "'": "&#39;",
          '"': "&quot;",
        })[character],
    );

  const dom = {};
  let state;
  let selectedNodeId = null;
  let selectedEdgeId = null;
  let connectionSource = null;
  let connectionMode = false;
  let zoom = 1;
  let history = [];
  let future = [];
  let saveTimer = null;
  let simulationToken = 0;
  let simulationRunning = false;
  let inspectorEditCaptured = false;

  function makeNode(type, x, y, overrides = {}) {
    const definition = CATALOG[type] || CATALOG.agent;
    return {
      id: uid(type),
      type,
      label: definition.label,
      x: Math.round(x),
      y: Math.round(y),
      prompt: definition.prompt,
      model: definition.model,
      temperature: type === "agent" ? 0.4 : 0.1,
      memory: type === "agent" || type === "memory",
      stream: type === "agent" || type === "output",
      retries: type === "tool" ? 2 : 1,
      ...overrides,
    };
  }

  function getTemplateState(id) {
    if (id === "research-swarm") {
      const trigger = makeNode("trigger", 90, 330, {
        label: "Research request",
      });
      const scoutA = makeNode("agent", 390, 120, {
        label: "Market scout",
        prompt:
          "Find current market data, competitors, and credible quantitative evidence.",
      });
      const scoutB = makeNode("agent", 390, 330, {
        label: "User researcher",
        prompt:
          "Synthesize user needs, pain points, and relevant behavioral evidence.",
      });
      const scoutC = makeNode("agent", 390, 540, {
        label: "Risk analyst",
        prompt:
          "Challenge assumptions, identify risks, and find contradictory evidence.",
      });
      const synthesis = makeNode("agent", 730, 330, {
        label: "Lead synthesizer",
        model: "claude-3.7-sonnet",
        prompt:
          "Reconcile the research streams into a clear, evidence-weighted recommendation with citations.",
      });
      const output = makeNode("output", 1060, 330, { label: "Research brief" });
      return {
        projectName: "Research Swarm",
        nodes: [trigger, scoutA, scoutB, scoutC, synthesis, output],
        edges: [
          edge(trigger, scoutA),
          edge(trigger, scoutB),
          edge(trigger, scoutC),
          edge(scoutA, synthesis),
          edge(scoutB, synthesis),
          edge(scoutC, synthesis),
          edge(synthesis, output),
        ],
      };
    }

    if (id === "content-engine") {
      const trigger = makeNode("trigger", 80, 300, { label: "Creative brief" });
      const strategist = makeNode("agent", 365, 300, {
        label: "Content strategist",
        prompt:
          "Turn the brief into an audience insight, angle, key message, and channel plan.",
      });
      const memory = makeNode("memory", 365, 535, { label: "Brand knowledge" });
      const creator = makeNode("agent", 680, 220, {
        label: "Creative director",
        temperature: 0.8,
        model: "claude-3.7-sonnet",
        prompt:
          "Create bold, on-brand concepts and draft the strongest execution.",
      });
      const reviewer = makeNode("condition", 680, 475, {
        label: "Brand review",
        prompt:
          "Pass content only if it is clear, distinctive, accurate, and aligned with the brand voice.",
      });
      const publisher = makeNode("tool", 1000, 220, {
        label: "Schedule content",
      });
      const output = makeNode("output", 1000, 475, { label: "Review queue" });
      return {
        projectName: "Autonomous Content Engine",
        nodes: [
          trigger,
          strategist,
          memory,
          creator,
          reviewer,
          publisher,
          output,
        ],
        edges: [
          edge(trigger, strategist),
          edge(memory, strategist),
          edge(strategist, creator),
          edge(creator, reviewer),
          edge(reviewer, publisher),
          edge(reviewer, output),
        ],
      };
    }

    const trigger = makeNode("trigger", 80, 330, {
      label: "New feedback",
      prompt:
        "Accept feedback from any channel and normalize the customer, account, and message fields.",
    });
    const enrich = makeNode("tool", 350, 165, {
      label: "Enrich account",
      prompt:
        "Look up account tier, product usage, open tickets, and recent sentiment.",
    });
    const analyst = makeNode("agent", 350, 430, {
      label: "Voice analyst",
      model: "gpt-4.1",
      prompt:
        "Classify intent and sentiment, summarize the feedback, and identify the most useful next action.",
    });
    const memory = makeNode("memory", 665, 100, { label: "Customer memory" });
    const router = makeNode("condition", 665, 360, {
      label: "Risk router",
      prompt:
        "Route high-value or churn-risk customers to recovery. Send product insights to the product digest.",
    });
    const recovery = makeNode("agent", 990, 200, {
      label: "Recovery agent",
      temperature: 0.3,
      prompt:
        "Draft an empathetic, specific recovery response grounded in the customer's history.",
    });
    const output = makeNode("output", 990, 500, { label: "Insight digest" });
    return {
      projectName: "Customer Intelligence Flow",
      nodes: [trigger, enrich, analyst, memory, router, recovery, output],
      edges: [
        edge(trigger, enrich),
        edge(trigger, analyst),
        edge(enrich, memory),
        edge(enrich, analyst),
        edge(memory, router),
        edge(analyst, router),
        edge(router, recovery),
        edge(router, output),
      ],
    };
  }

  function edge(source, target) {
    return { id: uid("edge"), source: source.id, target: target.id };
  }

  function validateState(candidate) {
    if (!window.validateWorkspace(candidate)) return false;
    if (
      !candidate ||
      !Array.isArray(candidate.nodes) ||
      !Array.isArray(candidate.edges)
    )
      return false;
    if (
      !candidate.nodes.every(
        (node) => node && typeof node.id === "string" && CATALOG[node.type],
      )
    )
      return false;
    const ids = new Set(candidate.nodes.map((node) => node.id));
    return candidate.edges.every(
      (item) => item && ids.has(item.source) && ids.has(item.target),
    );
  }

  function hydrateNode(node) {
    const definition = CATALOG[node.type] || CATALOG.agent;
    return {
      ...makeNode(node.type, Number(node.x) || 0, Number(node.y) || 0),
      ...node,
      label: String(node.label || definition.label).slice(0, 40),
      prompt: String(node.prompt || definition.prompt).slice(0, 800),
      x: clamp(Number(node.x) || 0, 0, WORLD.width - NODE_WIDTH - 20),
      y: clamp(Number(node.y) || 0, 0, WORLD.height - 150),
    };
  }

  function loadState() {
    try {
      const stored = JSON.parse(WorkspaceStorage.getItem(STORAGE_KEY));
      if (validateState(stored)) {
        return {
          projectName: String(
            stored.projectName || "Untitled agent flow",
          ).slice(0, 52),
          nodes: stored.nodes.map(hydrateNode),
          edges: stored.edges.map((item) => ({
            id: item.id || uid("edge"),
            source: item.source,
            target: item.target,
          })),
        };
      }
    } catch (error) {
      console.warn(
        "Agent Canvas could not restore the saved workspace.",
        error,
      );
    }
    return getTemplateState("customer-intelligence");
  }

  function snapshot() {
    return deepClone(state);
  }

  function pushHistory() {
    history.push(snapshot());
    if (history.length > 45) history.shift();
    future = [];
    updateHistoryButtons();
  }

  function restore(nextState) {
    state = deepClone(nextState);
    selectedNodeId = null;
    selectedEdgeId = null;
    cancelConnection();
    dom.projectName.value = state.projectName;
    renderAll();
    persistSoon();
  }

  function undo() {
    if (!history.length) return;
    future.push(snapshot());
    restore(history.pop());
    updateHistoryButtons();
    showToast("Last change undone");
  }

  function redo() {
    if (!future.length) return;
    history.push(snapshot());
    restore(future.pop());
    updateHistoryButtons();
    showToast("Change restored");
  }

  function updateHistoryButtons() {
    dom.undo.disabled = history.length === 0;
    dom.redo.disabled = future.length === 0;
  }

  function persistSoon() {
    clearTimeout(saveTimer);
    dom.saveStatus.classList.add("saving");
    dom.saveStatus.lastChild.textContent = " Saving…";
    saveTimer = window.setTimeout(() => {
      try {
        const saved = WorkspaceStorage.setItem(
          STORAGE_KEY,
          JSON.stringify(state),
        );
        dom.saveStatus.classList.remove("saving");
        dom.saveStatus.lastChild.textContent = saved
          ? " Saved locally"
          : " Session only";
      } catch (error) {
        dom.saveStatus.classList.remove("saving");
        dom.saveStatus.lastChild.textContent = " Save unavailable";
      }
    }, 320);
  }

  function cacheDOM() {
    Object.assign(dom, {
      projectName: $("#project-name"),
      saveStatus: $("#save-status"),
      componentList: $("#component-list"),
      templateList: $("#template-list"),
      componentSearch: $("#component-search"),
      nodesTab: $("#nodes-tab"),
      templatesTab: $("#templates-tab"),
      nodesPanel: $("#nodes-panel"),
      templatesPanel: $("#templates-panel"),
      stage: $("#canvas-stage"),
      world: $("#canvas-world"),
      nodeLayer: $("#node-layer"),
      edgeLayer: $("#edge-layer"),
      empty: $("#canvas-empty"),
      inspectorEmpty: $("#inspector-empty"),
      inspectorForm: $("#inspector-form"),
      inspectorTypeIcon: $("#inspector-node-icon"),
      inspectorType: $("#inspector-node-type"),
      inspectorId: $("#inspector-node-id"),
      nodeLabel: $("#node-label"),
      nodeType: $("#node-type"),
      nodeModel: $("#node-model"),
      nodePrompt: $("#node-prompt"),
      nodeTemperature: $("#node-temperature"),
      temperatureValue: $("#temperature-value"),
      nodeMemory: $("#node-memory"),
      nodeStream: $("#node-stream"),
      nodeRetries: $("#node-retries"),
      duplicate: $("#duplicate-node"),
      undo: $("#undo-button"),
      redo: $("#redo-button"),
      connect: $("#connect-button"),
      connectionHint: $("#connection-hint"),
      zoomLabel: $("#zoom-label"),
      minimapNodes: $("#minimap-nodes"),
      exportDialog: $("#export-dialog"),
      exportCode: $("#export-code"),
      importInput: $("#import-input"),
      runDrawer: $("#run-drawer"),
      runLog: $("#run-log"),
      runSummary: $("#run-summary"),
      runStatusIcon: $(".run-status-icon"),
      metricDuration: $("#metric-duration"),
      metricSteps: $("#metric-steps"),
      metricTokens: $("#metric-tokens"),
      runFooterStatus: $("#run-footer-status"),
      stopRun: $("#stop-run"),
      rerun: $("#rerun-button"),
      libraryPanel: $(".library-panel"),
      inspectorPanel: $(".inspector-panel"),
      mobileScrim: $("#mobile-scrim"),
      toastRegion: $("#toast-region"),
    });
  }

  function renderLibrary() {
    dom.componentList.innerHTML = Object.entries(CATALOG)
      .map(
        ([type, definition]) => `
      <button class="component-card" type="button" draggable="true" data-component-type="${type}" style="--component-color:${definition.color}" aria-label="Add ${escapeHTML(definition.label)}">
        <span class="component-icon">${ICONS[type]}</span>
        <span class="component-card-copy"><strong>${escapeHTML(definition.label)}</strong><small>${escapeHTML(definition.description)}</small></span>
        <span class="component-grip" aria-hidden="true">⠿</span>
      </button>
    `,
      )
      .join("");

    dom.templateList.innerHTML = TEMPLATES.map(
      (template) => `
      <article class="template-card" style="--template-color:${template.color}">
        <div class="template-card-top"><strong>${escapeHTML(template.name)}</strong><span class="template-badge">${escapeHTML(template.badge)}</span></div>
        <p>${escapeHTML(template.description)}</p>
        <div class="template-footer">
          <span class="template-node-dots" aria-label="${template.types.length} components">
            ${template.types
              .slice(0, 5)
              .map(
                (type) => `<i style="--dot-color:${CATALOG[type].color}"></i>`,
              )
              .join("")}
          </span>
          <button class="template-use" type="button" data-template-id="${template.id}">Use blueprint</button>
        </div>
      </article>
    `,
    ).join("");

    dom.nodeType.innerHTML = Object.entries(CATALOG)
      .map(
        ([value, item]) =>
          `<option value="${value}">${escapeHTML(item.label)}</option>`,
      )
      .join("");
  }

  function renderNodes() {
    dom.nodeLayer.innerHTML = state.nodes
      .map((node) => nodeMarkup(node))
      .join("");
    dom.empty.hidden = state.nodes.length > 0;
    bindNodeEvents();
    renderMinimap();
    window.requestAnimationFrame(renderEdges);
  }

  function nodeMarkup(node) {
    const definition = CATALOG[node.type] || CATALOG.agent;
    const description = node.prompt || definition.description;
    const selected = node.id === selectedNodeId ? " selected" : "";
    return `
      <article class="canvas-node${selected}" data-node-id="${escapeHTML(node.id)}" tabindex="0" role="group" aria-label="${escapeHTML(node.label)}, ${escapeHTML(definition.label)}" style="left:${node.x}px;top:${node.y}px;--node-color:${definition.color}">
        <button class="node-port input" type="button" data-port="input" aria-label="Connect into ${escapeHTML(node.label)}" title="Input"></button>
        <div class="node-head">
          <span class="node-type-icon">${ICONS[node.type]}</span>
          <span class="node-title"><strong>${escapeHTML(node.label)}</strong><small>${escapeHTML(definition.short)}</small></span>
          <span class="node-grip" aria-hidden="true">⠿</span>
        </div>
        <p class="node-description">${escapeHTML(description)}</p>
        <div class="node-meta">
          <span class="node-chip model">${escapeHTML(formatModel(node.model))}</span>
          <span class="node-chip">${Number(node.temperature).toFixed(1)} temp</span>
          ${node.memory ? '<span class="node-chip memory">memory</span>' : ""}
        </div>
        <button class="node-port output" type="button" data-port="output" aria-label="Connect from ${escapeHTML(node.label)}" title="Output"></button>
      </article>
    `;
  }

  function formatModel(model) {
    const names = {
      "gpt-4.1": "GPT-4.1",
      "gpt-4.1-mini": "GPT-4.1 mini",
      "claude-3.7-sonnet": "Claude 3.7",
      "gemini-2.5-pro": "Gemini 2.5",
      "local-runtime": "Local",
    };
    return names[model] || model || "Runtime";
  }

  function bindNodeEvents() {
    $$(".canvas-node", dom.nodeLayer).forEach((element) => {
      element.addEventListener("pointerdown", startNodeDrag);
      element.addEventListener("click", (event) => {
        if (!event.target.closest(".node-port"))
          selectNode(element.dataset.nodeId);
      });
      element.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          selectNode(element.dataset.nodeId);
        }
      });
      $$(".node-port", element).forEach((port) =>
        port.addEventListener("click", handlePortClick),
      );
    });
    markConnectionTargets();
  }

  function startNodeDrag(event) {
    if (event.button !== 0 || event.target.closest(".node-port")) return;
    const element = event.currentTarget;
    const node = state.nodes.find((item) => item.id === element.dataset.nodeId);
    if (!node) return;

    selectNode(node.id);
    const origin = {
      clientX: event.clientX,
      clientY: event.clientY,
      x: node.x,
      y: node.y,
    };
    let moved = false;
    element.setPointerCapture(event.pointerId);

    const move = (moveEvent) => {
      const deltaX = (moveEvent.clientX - origin.clientX) / zoom;
      const deltaY = (moveEvent.clientY - origin.clientY) / zoom;
      if (!moved && Math.hypot(deltaX, deltaY) > 3) {
        moved = true;
        pushHistory();
        element.classList.add("dragging");
      }
      if (!moved) return;
      node.x = clamp(
        Math.round(origin.x + deltaX),
        0,
        WORLD.width - NODE_WIDTH - 15,
      );
      node.y = clamp(
        Math.round(origin.y + deltaY),
        0,
        WORLD.height - element.offsetHeight - 15,
      );
      element.style.left = `${node.x}px`;
      element.style.top = `${node.y}px`;
      renderEdges();
      renderMinimap();
    };

    const end = () => {
      element.classList.remove("dragging");
      element.removeEventListener("pointermove", move);
      element.removeEventListener("pointerup", end);
      element.removeEventListener("pointercancel", end);
      if (moved) persistSoon();
    };

    element.addEventListener("pointermove", move);
    element.addEventListener("pointerup", end);
    element.addEventListener("pointercancel", end);
  }

  function renderEdges() {
    $$(".workflow-edge", dom.edgeLayer).forEach((item) => item.remove());
    const namespace = "http://www.w3.org/2000/svg";

    state.edges.forEach((item) => {
      const source = state.nodes.find((node) => node.id === item.source);
      const target = state.nodes.find((node) => node.id === item.target);
      if (!source || !target) return;
      const sourceElement = $(
        `[data-node-id="${CSS.escape(source.id)}"]`,
        dom.nodeLayer,
      );
      const targetElement = $(
        `[data-node-id="${CSS.escape(target.id)}"]`,
        dom.nodeLayer,
      );
      const sourceHeight = sourceElement?.offsetHeight || 132;
      const targetHeight = targetElement?.offsetHeight || 132;
      const startX = source.x + NODE_WIDTH;
      const startY = source.y + sourceHeight / 2;
      const endX = target.x;
      const endY = target.y + targetHeight / 2;
      const direction = endX >= startX ? 1 : -1;
      const distance = Math.max(
        72,
        Math.min(220, Math.abs(endX - startX) * 0.52),
      );
      const pathData = `M ${startX} ${startY} C ${startX + distance * direction} ${startY}, ${endX - distance * direction} ${endY}, ${endX} ${endY}`;

      const group = document.createElementNS(namespace, "g");
      group.classList.add("workflow-edge");
      if (item.id === selectedEdgeId) group.classList.add("selected");
      group.dataset.edgeId = item.id;
      const hitbox = document.createElementNS(namespace, "path");
      hitbox.setAttribute("d", pathData);
      hitbox.setAttribute("class", "edge-hitbox");
      const line = document.createElementNS(namespace, "path");
      line.setAttribute("d", pathData);
      line.setAttribute("class", "edge-line");
      group.append(hitbox, line);
      group.addEventListener("click", () => selectEdge(item.id));
      group.addEventListener("dblclick", () => deleteEdge(item.id));
      dom.edgeLayer.appendChild(group);
    });
  }

  function renderMinimap() {
    dom.minimapNodes.innerHTML = state.nodes
      .map((node) => {
        const left = (node.x / WORLD.width) * 130;
        const top = (node.y / WORLD.height) * 82;
        return `<i class="minimap-node" style="left:${left}px;top:${top}px;--mini-color:${CATALOG[node.type].color}"></i>`;
      })
      .join("");
  }

  function renderInspector() {
    const node = state.nodes.find((item) => item.id === selectedNodeId);
    dom.duplicate.disabled = !node;
    if (!node) {
      dom.inspectorEmpty.hidden = false;
      dom.inspectorForm.hidden = true;
      return;
    }

    const definition = CATALOG[node.type];
    dom.inspectorEmpty.hidden = true;
    dom.inspectorForm.hidden = false;
    dom.inspectorTypeIcon.innerHTML = ICONS[node.type];
    dom.inspectorTypeIcon.style.setProperty(
      "--component-color",
      definition.color,
    );
    dom.inspectorType.textContent = definition.label;
    dom.inspectorId.textContent = node.id;
    dom.nodeLabel.value = node.label;
    dom.nodeType.value = node.type;
    dom.nodeModel.value = node.model;
    dom.nodePrompt.value = node.prompt;
    dom.nodeTemperature.value = node.temperature;
    dom.temperatureValue.value = Number(node.temperature).toFixed(1);
    dom.nodeMemory.checked = Boolean(node.memory);
    dom.nodeStream.checked = Boolean(node.stream);
    dom.nodeRetries.value = String(node.retries);
  }

  function renderAll() {
    renderNodes();
    renderInspector();
    updateHistoryButtons();
  }

  function selectNode(id) {
    selectedNodeId = id;
    selectedEdgeId = null;
    $$(".canvas-node.selected", dom.nodeLayer).forEach((element) =>
      element.classList.remove("selected"),
    );
    const element = $(`[data-node-id="${CSS.escape(id)}"]`, dom.nodeLayer);
    element?.classList.add("selected");
    $$(".workflow-edge.selected", dom.edgeLayer).forEach((edgeElement) =>
      edgeElement.classList.remove("selected"),
    );
    renderInspector();
  }

  function selectEdge(id) {
    selectedEdgeId = id;
    selectedNodeId = null;
    renderNodes();
    renderInspector();
    const edgeItem = state.edges.find((item) => item.id === id);
    if (edgeItem) showToast("Connection selected — press Delete to remove");
  }

  function handlePortClick(event) {
    event.stopPropagation();
    const element = event.currentTarget;
    const nodeId = element.closest(".canvas-node").dataset.nodeId;
    if (element.dataset.port === "output") {
      if (connectionSource === nodeId) {
        cancelConnection();
      } else {
        connectionSource = nodeId;
        connectionMode = true;
        updateConnectionUI();
      }
      return;
    }

    if (!connectionSource) {
      showToast("Choose an output dot first", "error");
      return;
    }
    connectNodes(connectionSource, nodeId);
  }

  function connectNodes(source, target) {
    if (source === target) {
      showToast("A node cannot connect to itself", "error");
      return;
    }
    if (
      state.edges.some(
        (item) => item.source === source && item.target === target,
      )
    ) {
      showToast("These nodes are already connected", "error");
      cancelConnection();
      return;
    }
    pushHistory();
    state.edges.push({ id: uid("edge"), source, target });
    cancelConnection();
    renderEdges();
    persistSoon();
    showToast("Connection created");
  }

  function cancelConnection() {
    connectionSource = null;
    connectionMode = false;
    updateConnectionUI();
  }

  function updateConnectionUI() {
    dom.connect.classList.toggle("active", connectionMode);
    dom.connect.setAttribute("aria-pressed", String(connectionMode));
    dom.stage.classList.toggle("connecting", connectionMode);
    dom.connectionHint.hidden = !connectionMode;
    if (connectionMode) {
      dom.connectionHint.childNodes[2].textContent = connectionSource
        ? " Select a target input "
        : " Select a source output ";
    }
    markConnectionTargets();
  }

  function markConnectionTargets() {
    $$(".node-port", dom.nodeLayer).forEach((port) => {
      const isInputTarget =
        connectionSource &&
        port.dataset.port === "input" &&
        port.closest(".canvas-node").dataset.nodeId !== connectionSource;
      const isSource =
        connectionSource &&
        port.dataset.port === "output" &&
        port.closest(".canvas-node").dataset.nodeId === connectionSource;
      port.classList.toggle("awaiting", Boolean(isInputTarget || isSource));
    });
  }

  function addNode(type, x, y) {
    if (!CATALOG[type]) return;
    pushHistory();
    const node = makeNode(
      type,
      clamp(x, 15, WORLD.width - NODE_WIDTH - 15),
      clamp(y, 15, WORLD.height - 170),
    );
    state.nodes.push(node);
    selectedNodeId = node.id;
    selectedEdgeId = null;
    renderNodes();
    renderInspector();
    persistSoon();
    showToast(`${CATALOG[type].label} added`);
    return node;
  }

  function addNodeToViewport(type) {
    const x =
      (dom.stage.scrollLeft + dom.stage.clientWidth / 2) / zoom -
      NODE_WIDTH / 2;
    const y = (dom.stage.scrollTop + dom.stage.clientHeight / 2) / zoom - 70;
    addNode(type, x, y);
  }

  function duplicateSelectedNode() {
    const source = state.nodes.find((item) => item.id === selectedNodeId);
    if (!source) return;
    pushHistory();
    const copy = {
      ...deepClone(source),
      id: uid(source.type),
      label: `${source.label} copy`.slice(0, 40),
      x: clamp(source.x + 34, 0, WORLD.width - NODE_WIDTH - 15),
      y: clamp(source.y + 34, 0, WORLD.height - 160),
    };
    state.nodes.push(copy);
    selectedNodeId = copy.id;
    renderAll();
    persistSoon();
    showToast("Component duplicated");
  }

  function deleteSelectedNode() {
    if (!selectedNodeId) return;
    const node = state.nodes.find((item) => item.id === selectedNodeId);
    if (!node) return;
    pushHistory();
    state.nodes = state.nodes.filter((item) => item.id !== selectedNodeId);
    state.edges = state.edges.filter(
      (item) =>
        item.source !== selectedNodeId && item.target !== selectedNodeId,
    );
    selectedNodeId = null;
    renderAll();
    persistSoon();
    showToast(`${node.label} deleted`);
  }

  function deleteEdge(id) {
    const item = state.edges.find((candidate) => candidate.id === id);
    if (!item) return;
    pushHistory();
    state.edges = state.edges.filter((candidate) => candidate.id !== id);
    selectedEdgeId = null;
    renderEdges();
    persistSoon();
    showToast("Connection removed");
  }

  function applyTemplate(id, ask = true) {
    if (
      ask &&
      state.nodes.length &&
      !window.confirm(
        "Replace this canvas with the selected blueprint? Your current flow remains available with Undo.",
      )
    )
      return;
    pushHistory();
    state = getTemplateState(id);
    selectedNodeId = null;
    selectedEdgeId = null;
    dom.projectName.value = state.projectName;
    renderAll();
    persistSoon();
    closeMobilePanels();
    showToast("Blueprint loaded");
  }

  function autoLayout() {
    if (!state.nodes.length) return;
    pushHistory();
    const indegree = new Map(state.nodes.map((node) => [node.id, 0]));
    state.edges.forEach(
      (item) =>
        indegree.has(item.target) &&
        indegree.set(item.target, indegree.get(item.target) + 1),
    );
    const levels = new Map();
    const queue = state.nodes
      .filter((node) => indegree.get(node.id) === 0)
      .map((node) => node.id);
    if (!queue.length) queue.push(state.nodes[0].id);
    queue.forEach((id) => levels.set(id, 0));
    const visited = new Set();
    while (queue.length) {
      const id = queue.shift();
      if (visited.has(id)) continue;
      visited.add(id);
      state.edges
        .filter((item) => item.source === id)
        .forEach((item) => {
          levels.set(
            item.target,
            Math.max(levels.get(item.target) || 0, (levels.get(id) || 0) + 1),
          );
          indegree.set(item.target, (indegree.get(item.target) || 1) - 1);
          if (indegree.get(item.target) <= 0) queue.push(item.target);
        });
    }
    state.nodes.forEach((node) => {
      if (!levels.has(node.id))
        levels.set(node.id, Math.max(0, ...levels.values()) + 1);
    });
    const columns = new Map();
    state.nodes.forEach((node) => {
      const level = levels.get(node.id);
      if (!columns.has(level)) columns.set(level, []);
      columns.get(level).push(node);
    });
    const maxLevel = Math.max(...columns.keys());
    const xGap = Math.min(300, (WORLD.width - 220) / Math.max(1, maxLevel));
    [...columns.entries()]
      .sort(([a], [b]) => a - b)
      .forEach(([level, nodes]) => {
        const yGap = Math.min(205, 760 / Math.max(1, nodes.length - 1));
        const totalHeight = (nodes.length - 1) * yGap;
        nodes.forEach((node, index) => {
          node.x = Math.round(70 + level * xGap);
          node.y = Math.round(120 + (760 - totalHeight) / 2 + index * yGap);
        });
      });
    renderNodes();
    persistSoon();
    showToast("Workflow arranged");
  }

  function setZoom(nextZoom) {
    zoom = clamp(Math.round(nextZoom * 100) / 100, 0.6, 1.4);
    dom.world.style.transform = `scale(${zoom})`;
    dom.zoomLabel.value = `${Math.round(zoom * 100)}%`;
    dom.zoomLabel.textContent = `${Math.round(zoom * 100)}%`;
  }

  function updateSelectedFromInspector(event) {
    const node = state.nodes.find((item) => item.id === selectedNodeId);
    if (!node || !event.target.name) return;
    const field = event.target;
    let value = field.type === "checkbox" ? field.checked : field.value;
    if (field.type === "range") value = Number(value);
    if (field.name === "retries") value = Number(value);
    node[field.name] = value;
    if (field.name === "temperature")
      dom.temperatureValue.value = Number(value).toFixed(1);
    renderNodes();
    if (field.name === "type") renderInspector();
    persistSoon();
  }

  function exportPayload() {
    return {
      schema: "agent-canvas/workflow@1",
      metadata: {
        name: state.projectName,
        exportedAt: new Date().toISOString(),
        generator: "Agent Canvas",
      },
      nodes: state.nodes.map(
        ({
          id,
          type,
          label,
          x,
          y,
          prompt,
          model,
          temperature,
          memory,
          stream,
          retries,
        }) => ({
          id,
          type,
          label,
          position: { x, y },
          config: { prompt, model, temperature, memory, stream, retries },
        }),
      ),
      edges: state.edges.map(({ id, source, target }) => ({
        id,
        source,
        target,
      })),
    };
  }

  function serializedExport() {
    return JSON.stringify(exportPayload(), null, 2);
  }

  function openExportDialog() {
    dom.exportCode.textContent = serializedExport();
    dom.exportDialog.showModal();
  }

  async function copyJSON() {
    const value = serializedExport();
    try {
      await navigator.clipboard.writeText(value);
      showToast("Workflow JSON copied");
    } catch (error) {
      const textarea = document.createElement("textarea");
      textarea.value = value;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      textarea.remove();
      showToast("Workflow JSON copied");
    }
  }

  function downloadJSON() {
    const blob = new Blob([serializedExport()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${slugify(state.projectName) || "agent-flow"}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    showToast("Workflow downloaded");
  }

  function slugify(value) {
    return String(value)
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
  }

  async function importJSON(file) {
    if (!file) return;
    try {
      const input = JSON.parse(await file.text());
      let imported;
      if (input.schema && Array.isArray(input.nodes)) {
        imported = {
          projectName:
            input.metadata?.name || file.name.replace(/\.json$/i, ""),
          nodes: input.nodes.map((node) =>
            hydrateNode({
              ...node,
              x: node.position?.x,
              y: node.position?.y,
              ...(node.config || {}),
            }),
          ),
          edges: input.edges || [],
        };
      } else {
        imported = input;
      }
      if (!validateState(imported))
        throw new Error("Invalid Agent Canvas file");
      pushHistory();
      restore(imported);
      dom.exportDialog.close();
      showToast("Workflow imported");
    } catch (error) {
      showToast("That JSON is not a valid workflow", "error");
    } finally {
      dom.importInput.value = "";
    }
  }

  function simulationOrder() {
    const incoming = new Map(state.nodes.map((node) => [node.id, 0]));
    state.edges.forEach((item) =>
      incoming.set(item.target, (incoming.get(item.target) || 0) + 1),
    );
    const queue = state.nodes
      .filter((node) => incoming.get(node.id) === 0)
      .map((node) => node.id);
    const ordered = [];
    const seen = new Set();
    while (queue.length) {
      const id = queue.shift();
      if (seen.has(id)) continue;
      seen.add(id);
      ordered.push(id);
      state.edges
        .filter((item) => item.source === id)
        .forEach((item) => {
          incoming.set(item.target, incoming.get(item.target) - 1);
          if (incoming.get(item.target) <= 0) queue.push(item.target);
        });
    }
    state.nodes.forEach((node) => {
      if (!seen.has(node.id)) ordered.push(node.id);
    });
    return ordered;
  }

  function openRunDrawer(start = false) {
    dom.runDrawer.classList.add("open");
    dom.runDrawer.setAttribute("aria-hidden", "false");
    if (start) startSimulation();
  }

  function closeRunDrawer() {
    dom.runDrawer.classList.remove("open");
    dom.runDrawer.setAttribute("aria-hidden", "true");
  }

  function logRun(level, message) {
    const row = document.createElement("div");
    row.className = `log-line ${level}`;
    const now = new Date();
    const time = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}`;
    const timeElement = document.createElement("span");
    timeElement.className = "log-time";
    timeElement.textContent = time;
    const levelElement = document.createElement("span");
    levelElement.className = "log-level";
    levelElement.textContent = level;
    const messageElement = document.createElement("span");
    messageElement.className = "log-message";
    messageElement.textContent = message;
    row.append(timeElement, levelElement, messageElement);
    dom.runLog.appendChild(row);
    dom.runLog.scrollTop = dom.runLog.scrollHeight;
  }

  function wait(milliseconds) {
    return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
  }

  async function startSimulation() {
    if (simulationRunning || !state.nodes.length) {
      if (!state.nodes.length) showToast("Add a node before running", "error");
      return;
    }
    const token = ++simulationToken;
    const order = simulationOrder();
    const started = performance.now();
    let tokens = 0;
    simulationRunning = true;
    dom.runLog.innerHTML = "";
    dom.runSummary.textContent = `Running ${state.projectName}`;
    dom.runStatusIcon.classList.add("running");
    dom.runFooterStatus.textContent = "Executing with safe sample data";
    dom.stopRun.disabled = false;
    dom.rerun.disabled = true;
    dom.metricDuration.textContent = "0.0s";
    dom.metricSteps.textContent = `0 / ${order.length}`;
    dom.metricTokens.textContent = "0";
    $$(".canvas-node").forEach((item) =>
      item.classList.remove("running", "complete"),
    );
    $$(".workflow-edge").forEach((item) => item.classList.remove("active"));
    logRun(
      "info",
      `Simulation initialized with ${order.length} executable steps.`,
    );

    for (let index = 0; index < order.length; index += 1) {
      if (token !== simulationToken) return;
      const id = order[index];
      const node = state.nodes.find((item) => item.id === id);
      const nodeElement = $(
        `[data-node-id="${CSS.escape(id)}"]`,
        dom.nodeLayer,
      );
      const incomingEdges = state.edges.filter((item) => item.target === id);
      incomingEdges.forEach((item) =>
        $(
          `[data-edge-id="${CSS.escape(item.id)}"]`,
          dom.edgeLayer,
        )?.classList.add("active"),
      );
      nodeElement?.classList.add("running");
      logRun("step", `${node.label} · ${runtimeMessage(node.type, "start")}`);
      await wait(440 + index * 45);
      if (token !== simulationToken) return;
      const generated =
        node.model === "local-runtime" ? 0 : 110 + ((index * 47) % 240);
      tokens += generated;
      nodeElement?.classList.remove("running");
      nodeElement?.classList.add("complete");
      incomingEdges.forEach((item) =>
        $(
          `[data-edge-id="${CSS.escape(item.id)}"]`,
          dom.edgeLayer,
        )?.classList.remove("active"),
      );
      logRun(
        "success",
        `${node.label} completed${generated ? ` · ${generated} tokens` : ""}.`,
      );
      dom.metricSteps.textContent = `${index + 1} / ${order.length}`;
      dom.metricTokens.textContent = tokens.toLocaleString();
      dom.metricDuration.textContent = `${((performance.now() - started) / 1000).toFixed(1)}s`;
      await wait(130);
    }

    if (token !== simulationToken) return;
    simulationRunning = false;
    dom.runStatusIcon.classList.remove("running");
    dom.runSummary.textContent = "Run completed successfully";
    dom.runFooterStatus.textContent = "All steps completed without errors";
    dom.stopRun.disabled = true;
    dom.rerun.disabled = false;
    logRun(
      "success",
      `Flow completed in ${((performance.now() - started) / 1000).toFixed(1)} seconds.`,
    );
  }

  function runtimeMessage(type, stage) {
    if (stage !== "start") return "completed";
    return {
      trigger: "validating event payload",
      agent: "reasoning over the current context",
      tool: "executing the configured action",
      condition: "evaluating routing rules",
      memory: "retrieving relevant context",
      output: "formatting the destination payload",
    }[type];
  }

  function stopSimulation() {
    if (!simulationRunning) return;
    simulationToken += 1;
    simulationRunning = false;
    dom.runStatusIcon.classList.remove("running");
    dom.runSummary.textContent = "Run stopped";
    dom.runFooterStatus.textContent = "Simulation stopped by user";
    dom.stopRun.disabled = true;
    dom.rerun.disabled = false;
    $$(".canvas-node").forEach((item) => item.classList.remove("running"));
    $$(".workflow-edge").forEach((item) => item.classList.remove("active"));
    logRun("warn", "Simulation stopped before completion.");
  }

  function showToast(message, type = "success") {
    const toast = document.createElement("div");
    toast.className = `toast ${type}`;
    toast.textContent = message;
    dom.toastRegion.appendChild(toast);
    window.setTimeout(() => toast.remove(), 2900);
  }

  function toggleLibraryTab(showTemplates) {
    dom.nodesTab.classList.toggle("active", !showTemplates);
    dom.templatesTab.classList.toggle("active", showTemplates);
    dom.nodesTab.setAttribute("aria-selected", String(!showTemplates));
    dom.templatesTab.setAttribute("aria-selected", String(showTemplates));
    dom.nodesPanel.hidden = showTemplates;
    dom.templatesPanel.hidden = !showTemplates;
  }

  function toggleTheme() {
    const next =
      document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    WorkspaceStorage.setItem(THEME_KEY, next);
    const button = $("#theme-toggle");
    button.setAttribute(
      "aria-label",
      `Switch to ${next === "dark" ? "light" : "dark"} theme`,
    );
    window.requestAnimationFrame(renderEdges);
  }

  function openMobilePanel(name) {
    closeMobilePanels();
    const panel = name === "library" ? dom.libraryPanel : dom.inspectorPanel;
    panel.classList.add("open");
    dom.mobileScrim.hidden = false;
    dom.mobileScrim.classList.add("open");
  }

  function closeMobilePanels() {
    dom.libraryPanel.classList.remove("open");
    dom.inspectorPanel.classList.remove("open");
    dom.mobileScrim.classList.remove("open");
    dom.mobileScrim.hidden = true;
  }

  function bindEvents() {
    dom.componentList.addEventListener("click", (event) => {
      const card = event.target.closest("[data-component-type]");
      if (card) {
        addNodeToViewport(card.dataset.componentType);
        closeMobilePanels();
      }
    });
    dom.componentList.addEventListener("dragstart", (event) => {
      const card = event.target.closest("[data-component-type]");
      if (!card) return;
      event.dataTransfer.setData(
        "application/x-agent-component",
        card.dataset.componentType,
      );
      event.dataTransfer.effectAllowed = "copy";
    });
    dom.stage.addEventListener("dragover", (event) => {
      if (
        [...event.dataTransfer.types].includes("application/x-agent-component")
      ) {
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
        dom.stage.classList.add("drag-over");
      }
    });
    dom.stage.addEventListener("dragleave", () =>
      dom.stage.classList.remove("drag-over"),
    );
    dom.stage.addEventListener("drop", (event) => {
      event.preventDefault();
      dom.stage.classList.remove("drag-over");
      const type = event.dataTransfer.getData("application/x-agent-component");
      if (!CATALOG[type]) return;
      const bounds = dom.stage.getBoundingClientRect();
      const x =
        (event.clientX - bounds.left + dom.stage.scrollLeft) / zoom -
        NODE_WIDTH / 2;
      const y = (event.clientY - bounds.top + dom.stage.scrollTop) / zoom - 70;
      addNode(type, x, y);
    });
    dom.stage.addEventListener("click", (event) => {
      if (
        event.target === dom.stage ||
        event.target === dom.world ||
        event.target === dom.nodeLayer
      ) {
        selectedNodeId = null;
        selectedEdgeId = null;
        renderNodes();
        renderInspector();
      }
    });

    dom.templateList.addEventListener("click", (event) => {
      const button = event.target.closest("[data-template-id]");
      if (button) applyTemplate(button.dataset.templateId);
    });
    dom.componentSearch.addEventListener("input", () => {
      const query = dom.componentSearch.value.toLowerCase().trim();
      $$(".component-card", dom.componentList).forEach((card) => {
        card.hidden = !card.textContent.toLowerCase().includes(query);
      });
    });
    dom.nodesTab.addEventListener("click", () => toggleLibraryTab(false));
    dom.templatesTab.addEventListener("click", () => toggleLibraryTab(true));

    dom.projectName.addEventListener("focus", () => {
      if (!inspectorEditCaptured) {
        pushHistory();
        inspectorEditCaptured = true;
      }
    });
    dom.projectName.addEventListener("blur", () => {
      inspectorEditCaptured = false;
    });
    dom.projectName.addEventListener("input", () => {
      state.projectName = dom.projectName.value || "Untitled agent flow";
      persistSoon();
    });

    dom.inspectorForm.addEventListener("focusin", (event) => {
      if (
        event.target.matches("input, select, textarea") &&
        !inspectorEditCaptured
      ) {
        pushHistory();
        inspectorEditCaptured = true;
      }
    });
    dom.inspectorForm.addEventListener("focusout", (event) => {
      if (!dom.inspectorForm.contains(event.relatedTarget))
        inspectorEditCaptured = false;
    });
    dom.inspectorForm.addEventListener("input", updateSelectedFromInspector);
    dom.inspectorForm.addEventListener("change", updateSelectedFromInspector);
    $("#delete-node").addEventListener("click", deleteSelectedNode);
    dom.duplicate.addEventListener("click", duplicateSelectedNode);

    dom.undo.addEventListener("click", undo);
    dom.redo.addEventListener("click", redo);
    dom.connect.addEventListener("click", () => {
      connectionMode = !connectionMode;
      if (!connectionMode) connectionSource = null;
      updateConnectionUI();
    });
    $("#cancel-connect").addEventListener("click", cancelConnection);
    $("#auto-layout-button").addEventListener("click", autoLayout);
    $("#zoom-out").addEventListener("click", () => setZoom(zoom - 0.1));
    $("#zoom-in").addEventListener("click", () => setZoom(zoom + 0.1));
    $("#empty-add-button").addEventListener("click", () =>
      addNodeToViewport("agent"),
    );

    $("#export-button").addEventListener("click", openExportDialog);
    $("#copy-json").addEventListener("click", copyJSON);
    $("#download-json").addEventListener("click", downloadJSON);
    dom.importInput.addEventListener("change", () =>
      importJSON(dom.importInput.files[0]),
    );
    $("#theme-toggle").addEventListener("click", toggleTheme);

    $("#run-button").addEventListener("click", () => openRunDrawer(true));
    $("#close-run-drawer").addEventListener("click", closeRunDrawer);
    dom.rerun.addEventListener("click", startSimulation);
    dom.stopRun.addEventListener("click", stopSimulation);

    $("#open-library").addEventListener("click", () =>
      openMobilePanel("library"),
    );
    $("#open-inspector").addEventListener("click", () =>
      openMobilePanel("inspector"),
    );
    $$("[data-close-panel]").forEach((button) =>
      button.addEventListener("click", closeMobilePanels),
    );
    dom.mobileScrim.addEventListener("click", closeMobilePanels);

    window.addEventListener("resize", () =>
      window.requestAnimationFrame(renderEdges),
    );
    document.addEventListener("keydown", handleKeyboard);
  }

  function handleKeyboard(event) {
    const editing =
      event.target.matches("input, textarea, select") ||
      event.target.isContentEditable;
    const command = event.metaKey || event.ctrlKey;
    if (command && event.key.toLowerCase() === "z") {
      event.preventDefault();
      event.shiftKey ? redo() : undo();
      return;
    }
    if (command && event.key.toLowerCase() === "d" && !editing) {
      event.preventDefault();
      duplicateSelectedNode();
      return;
    }
    if (!editing && (event.key === "Delete" || event.key === "Backspace")) {
      event.preventDefault();
      if (selectedNodeId) deleteSelectedNode();
      else if (selectedEdgeId) deleteEdge(selectedEdgeId);
      return;
    }
    if (!editing && event.key === "/") {
      event.preventDefault();
      dom.componentSearch.focus();
      return;
    }
    if (!editing && event.key.toLowerCase() === "r") {
      openRunDrawer(true);
      return;
    }
    if (event.key === "Escape") {
      cancelConnection();
      closeMobilePanels();
      return;
    }
    if (
      !editing &&
      selectedNodeId &&
      ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)
    ) {
      event.preventDefault();
      const node = state.nodes.find((item) => item.id === selectedNodeId);
      const amount = event.shiftKey ? 1 : 10;
      pushHistory();
      if (event.key === "ArrowLeft") node.x -= amount;
      if (event.key === "ArrowRight") node.x += amount;
      if (event.key === "ArrowUp") node.y -= amount;
      if (event.key === "ArrowDown") node.y += amount;
      node.x = clamp(node.x, 0, WORLD.width - NODE_WIDTH - 15);
      node.y = clamp(node.y, 0, WORLD.height - 150);
      renderNodes();
      persistSoon();
    }
  }

  function init() {
    cacheDOM();
    const preferredTheme =
      WorkspaceStorage.getItem(THEME_KEY) ||
      (window.matchMedia("(prefers-color-scheme: light)").matches
        ? "light"
        : "dark");
    document.documentElement.dataset.theme = preferredTheme;
    state = loadState();
    dom.projectName.value = state.projectName;
    renderLibrary();
    renderAll();
    bindEvents();
    setZoom(1);
    window.requestAnimationFrame(() => {
      dom.stage.scrollLeft = 20;
      dom.stage.scrollTop = 75;
      renderEdges();
    });
  }

  document.addEventListener("DOMContentLoaded", init);
})();
