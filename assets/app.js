(function () {
  "use strict";

  const STORAGE_KEY = "coplan-us-workboard-v2";
  const LEGACY_STORAGE_KEY = "coplan-us-dashboard-unificado-v1";
  const AUTH_KEY = "coplan-us-auth";
  const CLOUD_KEY = "coplan-us-github-cloud-v1";
  const AUTH_USER = "coplan";
  const AUTH_PASS = "coplan123";
  const PAGE = document.body.dataset.page || "management";
  const CLOUD_DEFAULT = {
    owner: "biofjaber-prog",
    repo: "coplan-gestao-user-stories",
    branch: "main",
    path: "data/store.json",
  };
  const DEFAULT_STATUSES = [
    "Apresentar e planejar",
    "Em desenvolvimento",
    "Em testes",
    "Testes concluídos",
    "Em homologação",
    "Concluído Homologação",
    "Aguardando",
    "A cancelar",
  ];
  const HIDDEN_SPRINTS = new Set(["Sprint 22"]);
  const PALETTE = ["#61bb46", "#3c7b55", "#4b7778", "#365d78", "#2d3f7f", "#002847", "#6f42c1", "#b7791f"];

  const state = {
    stories: [],
    sprintMeta: {},
    developers: [],
    devColors: {},
    filters: {
      search: "",
      sprint: "Todos",
      developer: "Todos",
      status: "Todos",
      queue: "Todos",
    },
    sort: {
      field: "queue",
      dir: "asc",
    },
    pagination: {
      backlogPage: 1,
      pageSize: 10,
    },
    dragStoryId: null,
    booted: false,
    eventsReady: false,
    cloudSaveTimer: null,
    cloudLoading: false,
    cloudSaving: false,
  };

  const $ = (id) => document.getElementById(id);

  function clone(value) {
    return JSON.parse(JSON.stringify(value || {}));
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function toNumber(value, fallback) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
  }

  function cleanDependency(value) {
    const text = String(value || "").trim();
    return /^n[aã]o h[aá]$/i.test(text) ? "" : text;
  }

  function normalizeStory(story, index) {
    const queueRaw = story.queue ?? story.priorityOrder ?? story.developmentOrder ?? story.rank;
    return {
      id: String(story.id || story.us || "").trim(),
      title: String(story.title || story.d || "").trim(),
      developer: String(story.developer || story.dev || "DEFINIR DESENVOLVEDOR").trim() || "DEFINIR DESENVOLVEDOR",
      sprint: String(story.sprint || story.sp || "Sem sprint").trim() || "Sem sprint",
      status: String(story.status || story.st || "Apresentar e planejar").trim() || "Apresentar e planejar",
      dependency: cleanDependency(story.dependency || story.dep || ""),
      queue: toNumber(queueRaw, null),
      notes: String(story.notes || "").trim(),
      order: Number.isFinite(Number(story.order)) ? Number(story.order) : index + 1,
    };
  }

  function loadState() {
    const initialStories = Array.isArray(window.INITIAL_USER_STORIES) ? window.INITIAL_USER_STORIES : [];
    state.stories = initialStories.map(normalizeStory).filter((story) => !HIDDEN_SPRINTS.has(story.sprint));
    state.sprintMeta = clone(window.INITIAL_SPRINT_META || {});
    HIDDEN_SPRINTS.forEach((sprint) => delete state.sprintMeta[sprint]);
    state.devColors = clone(window.INITIAL_DEV_COLORS || {});

    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_STORAGE_KEY) || "null");
      if (saved && Array.isArray(saved.stories)) {
        state.stories = saved.stories.map(normalizeStory).filter((story) => !HIDDEN_SPRINTS.has(story.sprint));
        state.sprintMeta = { ...state.sprintMeta, ...(saved.sprintMeta || {}) };
        HIDDEN_SPRINTS.forEach((sprint) => delete state.sprintMeta[sprint]);
        state.developers = Array.isArray(saved.developers) ? saved.developers.map((name) => String(name).trim()).filter(Boolean) : [];
        state.devColors = { ...state.devColors, ...(saved.devColors || {}) };
      }
    } catch (error) {
      console.warn("Nao foi possivel carregar dados salvos.", error);
    }

    ensureSprintMeta();
    ensureDevelopers();
    assignQueueDefaults();
  }

  function persist(label) {
    ensureSprintMeta();
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          stories: state.stories,
          sprintMeta: state.sprintMeta,
          developers: state.developers,
          devColors: state.devColors,
          savedAt: new Date().toISOString(),
        })
      );
      setSaveState(label || "Alterações salvas");
    } catch (error) {
      setSaveState("Não foi possível salvar localmente");
      console.warn(error);
    }
  }

  function setSaveState(text) {
    const el = $("saveState");
    if (!el) return;
    const now = new Date().toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
    el.textContent = PAGE === "dashboard" ? `Atualizado em: ${now}` : `${text} - ${now}`;
  }

  function unique(values) {
    return [...new Set(values.filter(Boolean))];
  }

  function sprintNumber(name) {
    const match = String(name).match(/\d+/);
    return match ? Number(match[0]) : Number.MAX_SAFE_INTEGER;
  }

  function sortSprints(values) {
    return unique(values).sort((a, b) => {
      const num = sprintNumber(a) - sprintNumber(b);
      return num !== 0 ? num : String(a).localeCompare(String(b), "pt-BR");
    });
  }

  function sortDevelopers(values) {
    return unique(values).sort((a, b) => {
      if (a === "DEFINIR DESENVOLVEDOR") return 1;
      if (b === "DEFINIR DESENVOLVEDOR") return -1;
      return a.localeCompare(b, "pt-BR");
    });
  }

  function getAllSprints() {
    return sortSprints([...Object.keys(state.sprintMeta), ...state.stories.map((story) => story.sprint)]).filter((sprint) => !HIDDEN_SPRINTS.has(sprint));
  }

  function getAllDevelopers() {
    return sortDevelopers([...state.developers, ...state.stories.map((story) => story.developer)]);
  }

  function ensureDevelopers() {
    state.developers = getAllDevelopers();
  }

  function groupBy(items, getter) {
    const map = new Map();
    items.forEach((item) => {
      const key = getter(item);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(item);
    });
    return map;
  }

  function ensureSprintMeta() {
    getAllSprints().forEach((sprint) => {
      if (!state.sprintMeta[sprint]) {
        state.sprintMeta[sprint] = { start: "", end: "", goal: "Planejamento a definir", color: sprintColor(sprint) };
      } else if (!state.sprintMeta[sprint].color) {
        state.sprintMeta[sprint].color = sprintColor(sprint);
      }
    });
  }

  function sprintColor(sprint) {
    const colors = ["#61bb46", "#3c7b55", "#4b7778", "#365d78", "#2d3f7f", "#002847", "#7aa05a", "#528f8c"];
    const idx = Math.max(0, sprintNumber(sprint) % colors.length);
    return colors[idx];
  }

  function assignQueueDefaults() {
    const groups = groupBy(state.stories, (story) => `${story.sprint}::${story.developer}`);
    groups.forEach((items) => {
      const used = new Set(items.filter((story) => Number.isFinite(story.queue) && story.queue > 0).map((story) => story.queue));
      let next = 1;
      items
        .slice()
        .sort((a, b) => Number(a.order) - Number(b.order))
        .forEach((story) => {
          if (!Number.isFinite(story.queue) || story.queue <= 0) {
            while (used.has(next)) next += 1;
            story.queue = next;
            used.add(next);
          }
        });
    });
  }

  function storyMap() {
    return new Map(state.stories.map((story) => [story.id, story]));
  }

  function normalizedStatus(status) {
    return String(status || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  }

  function isDone(status) {
    const value = normalizedStatus(status);
    return value.includes("testes concluidos") || value.includes("concluido homologacao");
  }

  function isInProgress(status) {
    const value = normalizedStatus(status);
    return value.includes("desenvolvimento") || value.includes("em testes") || value.includes("homologacao");
  }

  function parseDependencies(story) {
    return cleanDependency(story.dependency)
      .split(/[,\s;/]+/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  function dependencyInfo(story, map) {
    const deps = parseDependencies(story);
    if (!deps.length) return { label: "Não há", blocked: false, missing: [] };
    const missing = deps.filter((dep) => {
      const linked = map.get(dep);
      return !linked || !isDone(linked.status);
    });
    return { label: deps.join(", "), blocked: missing.length > 0, missing };
  }

  function queueConflicts(stories) {
    const groups = groupBy(stories, (story) => `${story.sprint}::${story.developer}::${story.queue}`);
    return [...groups.entries()]
      .filter(([, items]) => items.length > 1)
      .map(([key, items]) => {
        const [sprint, developer, queue] = key.split("::");
        return { sprint, developer, queue, items };
      });
  }

  function getFilteredStories() {
    const query = state.filters.search.trim().toLowerCase();
    return state.stories.filter((story) => {
      const text = [story.id, story.title, story.developer, story.sprint, story.status, `P${story.queue}`, story.dependency]
        .join(" ")
        .toLowerCase();
      return (
        (!query || text.includes(query)) &&
        (state.filters.sprint === "Todos" || story.sprint === state.filters.sprint) &&
        (state.filters.developer === "Todos" || story.developer === state.filters.developer) &&
        (state.filters.status === "Todos" || story.status === state.filters.status) &&
        (state.filters.queue === "Todos" || story.queue === Number(state.filters.queue))
      );
    });
  }

  function sortedStories(stories, field = state.sort.field, dir = state.sort.dir) {
    const factor = dir === "asc" ? 1 : -1;
    return [...stories].sort((a, b) => compareField(a, b, field) * factor || Number(a.order) - Number(b.order));
  }

  function compareField(a, b, field) {
    if (field === "queue") {
      return (
        sprintNumber(a.sprint) - sprintNumber(b.sprint) ||
        a.sprint.localeCompare(b.sprint, "pt-BR") ||
        a.developer.localeCompare(b.developer, "pt-BR") ||
        Number(a.queue) - Number(b.queue)
      );
    }
    if (field === "sprint") {
      return sprintNumber(a.sprint) - sprintNumber(b.sprint) || a.sprint.localeCompare(b.sprint, "pt-BR");
    }
    if (field === "id") {
      return Number(a.id) - Number(b.id) || a.id.localeCompare(b.id, "pt-BR");
    }
    return String(a[field] || "").localeCompare(String(b[field] || ""), "pt-BR");
  }

  function getDevColor(name) {
    if (state.devColors[name]) return state.devColors[name];
    let total = 0;
    for (let i = 0; i < name.length; i += 1) total += name.charCodeAt(i);
    const color = PALETTE[total % PALETTE.length];
    state.devColors[name] = color;
    return color;
  }

  function initials(name) {
    return String(name)
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase();
  }

  function priorityBadge(story) {
    const cls = story.queue <= 3 ? "hot" : story.queue >= 8 ? "late" : "";
    return `<span class="badge priority-badge ${cls}">P${escapeHtml(story.queue)}</span>`;
  }

  function statusBadge(status) {
    if (isDone(status)) return badge(status, "done");
    if (isInProgress(status)) return badge(status, "progress");
    if (normalizedStatus(status).includes("aguard")) return badge(status, "wait");
    return badge(status, "plan");
  }

  function dependencyBadge(story, map = storyMap()) {
    const dep = dependencyInfo(story, map);
    return badge(dep.blocked ? `${dep.label} pendente` : dep.label, dep.blocked ? "blocked" : "neutral");
  }

  function badge(text, className) {
    return `<span class="badge ${className}">${escapeHtml(text)}</span>`;
  }

  function devChip(name) {
    return `<span class="dev-link"><span class="avatar" style="background:${getDevColor(name)}">${escapeHtml(initials(name))}</span>${escapeHtml(name)}</span>`;
  }

  function render() {
    const filtered = getFilteredStories();
    renderFilterOptions();
    renderKpis(filtered);
    renderQueueBoard(filtered);
    renderRiskPanel(filtered);
    renderSprintManageTable();
    renderDeveloperManageList();
    renderManageTable(filtered);
    renderSprintChart(filtered);
    renderStatusChart(filtered);
    renderPriorityChart(filtered);
    renderDeveloperLoadChart(filtered);
    renderBlockedSprintChart(filtered);
    renderDependencyMap(filtered);
    renderSprintTrendChart(filtered);
    renderCompletionChart(filtered);
    renderExecutionBoard(filtered);
    renderDeveloperSummary(filtered);
    renderBacklog(filtered);
    renderRoadmap(filtered);
  }

  function fillSelect(id, values, selected, formatter) {
    const el = $(id);
    if (!el) return;
    const options = ["Todos", ...values];
    el.innerHTML = options
      .map((value) => {
        const label = value === "Todos" ? "Todos" : formatter ? formatter(value) : value;
        return `<option value="${escapeHtml(value)}"${String(value) === String(selected) ? " selected" : ""}>${escapeHtml(label)}</option>`;
      })
      .join("");
  }

  function renderFilterOptions() {
    const search = $("filterSearch");
    if (search) search.value = state.filters.search;
    fillSelect("filterSprint", getAllSprints(), state.filters.sprint);
    fillSelect("filterDeveloper", getAllDevelopers(), state.filters.developer);
    fillSelect("filterStatus", unique(state.stories.map((story) => story.status)).sort(), state.filters.status);
    fillSelect("filterQueue", unique(state.stories.map((story) => story.queue)).sort((a, b) => a - b), state.filters.queue, (value) => `P${value}`);
  }

  function renderKpis(stories) {
    const el = $("kpiGrid");
    if (!el) return;
    const map = storyMap();
    const total = stories.length;
    const done = stories.filter((story) => isDone(story.status)).length;
    const progress = stories.filter((story) => isInProgress(story.status)).length;
    const planned = stories.filter((story) => normalizedStatus(story.status).includes("planejar")).length;
    const blocked = stories.filter((story) => dependencyInfo(story, map).blocked).length;
    const conflicts = queueConflicts(stories).length;
    const topQueue = stories.filter((story) => story.queue <= 3 && !isDone(story.status)).length;
    const sprints = unique(stories.map((story) => story.sprint)).length;
    const percent = total ? Math.round((done / total) * 100) : 0;
    const cards =
      PAGE === "dashboard"
        ? [
            ["Total de US", total, "Base filtrada", "#0b5ea8"],
            ["Em andamento", progress, "Desenvolvimento, testes ou homologação", "#00a6c8"],
            ["A planejar", planned, "Ainda sem início", "#b7791f"],
            ["Bloqueadas", blocked, "Dependências pendentes", "#c2413d"],
            ["Top P1-P3", topQueue, "Próximas prioridades abertas", "#23b574"],
            ["Conflitos", conflicts, "Mesma prioridade na mesma fila", "#6f42c1"],
            ["Sprints", sprints, "Ciclos com US no filtro", "#0f766e"],
            ["Conclusão", `${percent}%`, `${done} de ${total} concluídas`, "#23b574"],
          ]
        : [
            ["US no filtro", total, "Backlog operacional", "#0b5ea8"],
            ["P1-P3 abertas", topQueue, "O que vem primeiro", "#23b574"],
            ["Em andamento", progress, "Histórias ativas", "#00a6c8"],
            ["Bloqueadas", blocked, "Dependências pendentes", "#c2413d"],
            ["Conflitos", conflicts, "Revisar prioridade duplicada", "#6f42c1"],
            ["Sprints", sprints, "Ciclos afetados", "#0f766e"],
          ];

    el.innerHTML = cards
      .map(
        ([label, value, foot, color]) => `
        <article class="kpi-card" style="--kpi-color:${color}">
          <div class="kpi-label">${escapeHtml(label)}</div>
          <div class="kpi-value">${escapeHtml(value)}</div>
          <div class="kpi-foot">${escapeHtml(foot)}</div>
        </article>`
      )
      .join("");
  }

  function renderQueueBoard(stories) {
    const el = $("queueBoard");
    if (!el) return;
    const map = storyMap();
    const sprints = state.filters.sprint === "Todos" ? getAllSprints() : [state.filters.sprint].filter((sprint) => sprint !== "Todos");
    el.innerHTML =
      sprints
        .map((sprint) => {
          const sprintItems = stories.filter((story) => story.sprint === sprint);
          const devs = state.filters.developer === "Todos" ? getAllDevelopers() : [state.filters.developer];
          const conflicts = queueConflicts(sprintItems).length;
          return `
            <section class="sprint-group">
              <div class="sprint-group-head">
                <div>
                  <h3>${escapeHtml(sprint)}</h3>
                  <p>${sprintItems.length} US na sprint${conflicts ? ` - ${conflicts} conflito(s) de prioridade` : ""}</p>
                </div>
                <button class="mini-button" type="button" data-filter-sprint="${escapeHtml(sprint)}">Filtrar sprint</button>
              </div>
              <div class="developer-lanes">
                ${devs
                  .map((developer) => {
                    const items = sortedStories(
                      sprintItems.filter((story) => story.developer === developer),
                      "queue",
                      "asc"
                    );
                    return `
                      <article class="lane" data-drop-sprint="${escapeHtml(sprint)}" data-drop-developer="${escapeHtml(developer)}">
                        <div class="lane-head">
                          <button class="dev-link lane-title" type="button" data-open-dev="${escapeHtml(developer)}">
                            <span class="avatar" style="background:${getDevColor(developer)}">${escapeHtml(initials(developer))}</span>
                            <strong>${escapeHtml(developer)}</strong>
                          </button>
                          <span class="lane-count">${items.length} US</span>
                        </div>
                        <div class="lane-list">
                          ${items.map((story) => renderQueueItem(story, map)).join("") || '<div class="empty-state">Arraste uma US para cá.</div>'}
                        </div>
                      </article>`;
                  })
                  .join("")}
              </div>
            </section>`;
        })
        .join("") || '<div class="empty-state">Nenhuma US encontrada para os filtros atuais.</div>';
  }

  function renderQueueItem(story, map) {
    return `
      <article class="queue-item" draggable="true" data-drag-story="${escapeHtml(story.id)}" data-drop-story="${escapeHtml(story.id)}">
        <input class="queue-input" data-update="${escapeHtml(story.id)}" data-field="queue" type="number" min="1" value="${escapeHtml(story.queue)}" aria-label="Prioridade da US ${escapeHtml(story.id)}">
        <div class="queue-item-body">
          <button class="us-link" type="button" data-open-story="${escapeHtml(story.id)}">${escapeHtml(story.id)}</button>
          <div class="queue-item-title">${escapeHtml(story.title)}</div>
          <div class="queue-meta">${statusBadge(story.status)} ${dependencyBadge(story, map)}</div>
        </div>
      </article>`;
  }

  function renderRiskPanel(stories) {
    const el = $("riskPanel");
    if (!el) return;
    const map = storyMap();
    const conflicts = queueConflicts(stories);
    const blocked = stories.filter((story) => dependencyInfo(story, map).blocked);
    const items = [];
    conflicts.forEach((item) => {
      items.push(`
        <div class="risk-item critical">
          <strong>Prioridade P${escapeHtml(item.queue)} duplicada</strong>
          <span>${escapeHtml(item.sprint)} - ${escapeHtml(item.developer)}: ${escapeHtml(item.items.map((story) => story.id).join(", "))}</span>
        </div>`);
    });
    blocked.slice(0, 8).forEach((story) => {
      const dep = dependencyInfo(story, map);
      items.push(`
        <div class="risk-item critical">
          <strong>US ${escapeHtml(story.id)} bloqueada</strong>
          <span>${escapeHtml(story.sprint)} - ${escapeHtml(story.developer)} depende de ${escapeHtml(dep.missing.join(", "))}</span>
        </div>`);
    });
    el.innerHTML =
      items.join("") ||
      '<div class="risk-item"><strong>Nenhum conflito crítico no filtro atual</strong><span>A fila está ordenada e sem dependências pendentes visíveis.</span></div>';
  }

  function renderSprintManageTable() {
    const table = $("sprintManageTable");
    if (!table) return;
    const rows = getAllSprints()
      .map((sprint) => {
        const meta = state.sprintMeta[sprint] || { start: "", end: "", goal: "" };
        const count = state.stories.filter((story) => story.sprint === sprint).length;
        return `
          <tr>
            <td><strong>${escapeHtml(sprint)}</strong></td>
            <td><input data-sprint-update="${escapeHtml(sprint)}" data-sprint-field="start" value="${escapeHtml(meta.start || "")}" placeholder="08/06"></td>
            <td><input data-sprint-update="${escapeHtml(sprint)}" data-sprint-field="end" value="${escapeHtml(meta.end || "")}" placeholder="19/06"></td>
            <td><input data-sprint-update="${escapeHtml(sprint)}" data-sprint-field="color" type="color" value="${escapeHtml(meta.color || sprintColor(sprint))}"></td>
            <td><input data-sprint-update="${escapeHtml(sprint)}" data-sprint-field="goal" value="${escapeHtml(meta.goal || "")}" placeholder="Objetivo da sprint"></td>
            <td>${count}</td>
          </tr>`;
      })
      .join("");
    table.querySelector("tbody").innerHTML = rows || '<tr><td colspan="5"><div class="empty-state">Nenhuma sprint cadastrada.</div></td></tr>';
  }

  function renderDeveloperManageList() {
    const el = $("developerManageList");
    if (!el) return;
    const developers = getAllDevelopers();
    el.innerHTML =
      developers
        .map((developer) => {
          const total = state.stories.filter((story) => story.developer === developer).length;
          const open = state.stories.filter((story) => story.developer === developer && !isDone(story.status)).length;
          return `
            <article class="developer-manage-card">
              <div class="dev-link">
                <span class="avatar" style="background:${getDevColor(developer)}">${escapeHtml(initials(developer))}</span>
                <div>
                  <strong>${escapeHtml(developer)}</strong>
                  <span>${total} US - ${open} abertas</span>
                </div>
              </div>
              <button class="mini-button" type="button" data-open-dev="${escapeHtml(developer)}">Ver</button>
            </article>`;
        })
        .join("") || '<div class="empty-state">Nenhum desenvolvedor cadastrado.</div>';
  }

  function optionsMarkup(values, selected) {
    return values
      .map((value) => `<option value="${escapeHtml(value)}"${value === selected ? " selected" : ""}>${escapeHtml(value)}</option>`)
      .join("");
  }

  function renderManageTable(stories) {
    const table = $("manageTable");
    if (!table) return;
    const statuses = unique([...DEFAULT_STATUSES, ...state.stories.map((story) => story.status)]);
    const developers = getAllDevelopers();
    const sprints = getAllSprints();
    const rows = sortedStories(stories)
      .map(
        (story) => `
        <tr>
          <td><button class="us-link" type="button" data-open-story="${escapeHtml(story.id)}">${escapeHtml(story.id)}</button></td>
          <td><input data-update="${escapeHtml(story.id)}" data-field="title" value="${escapeHtml(story.title)}" aria-label="Descrição da US ${escapeHtml(story.id)}"></td>
          <td><input data-update="${escapeHtml(story.id)}" data-field="queue" type="number" min="1" value="${escapeHtml(story.queue)}" aria-label="Prioridade da US ${escapeHtml(story.id)}"></td>
          <td><select data-update="${escapeHtml(story.id)}" data-field="developer" aria-label="Desenvolvedor da US ${escapeHtml(story.id)}">${optionsMarkup(developers, story.developer)}</select></td>
          <td><select data-update="${escapeHtml(story.id)}" data-field="sprint" aria-label="Sprint da US ${escapeHtml(story.id)}">${optionsMarkup(sprints, story.sprint)}</select></td>
          <td><select data-update="${escapeHtml(story.id)}" data-field="status" aria-label="Status da US ${escapeHtml(story.id)}">${optionsMarkup(statuses, story.status)}</select></td>
          <td><input data-update="${escapeHtml(story.id)}" data-field="dependency" value="${escapeHtml(story.dependency)}" placeholder="Ex.: 6552, 6553" aria-label="Dependência da US ${escapeHtml(story.id)}"></td>
          <td><textarea data-update="${escapeHtml(story.id)}" data-field="notes" aria-label="Notas da US ${escapeHtml(story.id)}">${escapeHtml(story.notes)}</textarea></td>
        </tr>`
      )
      .join("");
    table.querySelector("tbody").innerHTML = rows || '<tr><td colspan="8"><div class="empty-state">Nenhuma US encontrada para edição.</div></td></tr>';
  }

  function renderSprintChart(stories) {
    const el = $("sprintChart");
    if (!el) return;
    const sprints = getAllSprints();
    const max = Math.max(1, ...sprints.map((sprint) => stories.filter((story) => story.sprint === sprint).length));
    el.innerHTML = sprints
      .map((sprint) => {
        const items = stories.filter((story) => story.sprint === sprint);
        const done = items.filter((story) => isDone(story.status)).length;
        const open = items.length - done;
        const pct = items.length ? Math.round((done / items.length) * 100) : 0;
        const color = state.sprintMeta[sprint]?.color || sprintColor(sprint);
        return `
          <div class="bar-row">
            <button class="bar-label" type="button" data-filter-sprint="${escapeHtml(sprint)}">${escapeHtml(sprint)}</button>
            <div class="bar-track" title="${escapeHtml(`${items.length} US`)}">
              <span class="bar-done" style="width:${(done / max) * 100}%;background:${color}"></span>
              <span class="bar-open" style="width:${(open / max) * 100}%;background:color-mix(in srgb, ${color} 68%, white)"></span>
            </div>
            <div class="bar-meta">${items.length} US - ${pct}%</div>
          </div>`;
      })
      .join("");
  }

  function renderStatusChart(stories) {
    const el = $("statusChart");
    if (!el) return;
    const total = stories.length;
    const done = stories.filter((story) => isDone(story.status)).length;
    const pct = total ? Math.round((done / total) * 100) : 0;
    const groups = unique(stories.map((story) => story.status))
      .map((status) => ({ status, count: stories.filter((story) => story.status === status).length }))
      .sort((a, b) => b.count - a.count || a.status.localeCompare(b.status, "pt-BR"));
    const max = Math.max(1, ...groups.map((item) => item.count));
    const doneDegrees = (pct / 100) * 360;
    el.innerHTML = `
      <div class="donut" style="background:conic-gradient(var(--coplan-green) 0deg, var(--coplan-green) ${doneDegrees}deg, #e6eef6 ${doneDegrees}deg)">
        <div class="donut-center">${pct}%</div>
      </div>
      <div class="status-list">
        ${
          groups.length
            ? groups
                .map(
                  (item) => `
          <div class="status-item">
            <div>
              <strong>${escapeHtml(item.status)}</strong>
              <div class="mini-bar"><span class="mini-fill" style="width:${(item.count / max) * 100}%"></span></div>
            </div>
            <span>${item.count}</span>
          </div>`
                )
                .join("")
            : '<div class="empty-state">Nenhuma US no filtro atual.</div>'
        }
      </div>`;
  }

  function renderPriorityChart(stories) {
    const el = $("priorityChart");
    if (!el) return;
    const groups = unique(stories.map((story) => story.queue))
      .sort((a, b) => a - b)
      .slice(0, 10)
      .map((queue) => ({ label: `P${queue}`, count: stories.filter((story) => story.queue === queue).length }));
    renderMetricBars(el, groups, "prioridade");
  }

  function renderDeveloperLoadChart(stories) {
    const el = $("developerLoadChart");
    if (!el) return;
    const groups = getAllDevelopers()
      .map((developer) => ({
        label: developer,
        count: stories.filter((story) => story.developer === developer).length,
        color: getDevColor(developer),
      }))
      .filter((item) => item.count > 0)
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "pt-BR"))
      .slice(0, 12);
    renderMetricBars(el, groups, "desenvolvedor");
  }

  function renderBlockedSprintChart(stories) {
    const el = $("blockedSprintChart");
    if (!el) return;
    const map = storyMap();
    const groups = getAllSprints()
      .map((sprint) => ({
        label: sprint,
        count: stories.filter((story) => story.sprint === sprint && dependencyInfo(story, map).blocked).length,
      }))
      .filter((item) => item.count > 0)
      .sort((a, b) => sprintNumber(a.label) - sprintNumber(b.label));
    renderMetricBars(el, groups, "bloqueio");
  }

  function renderMetricBars(el, groups, emptyLabel) {
    const max = Math.max(1, ...groups.map((item) => item.count));
    el.innerHTML =
      groups.length
        ? groups
            .map(
              (item) => `
        <div class="metric-row">
          <div class="metric-label" title="${escapeHtml(item.label)}">${escapeHtml(item.label)}</div>
          <div class="metric-track">
            <span style="width:${(item.count / max) * 100}%;background:${item.color || "linear-gradient(90deg,var(--coplan-green),var(--coplan-cyan))"}"></span>
          </div>
          <strong>${item.count}</strong>
        </div>`
            )
            .join("")
        : `<div class="empty-state">Nenhum ${escapeHtml(emptyLabel)} no filtro atual.</div>`;
  }

  function renderDependencyMap(stories) {
    const el = $("dependencyMap");
    if (!el) return;
    const map = storyMap();
    const items = sortedStories(stories.filter((story) => parseDependencies(story).length > 0)).slice(0, 14);
    el.innerHTML =
      items.length
        ? items
            .map((story) => {
              const dep = dependencyInfo(story, map);
              return `
        <article class="dependency-node ${dep.blocked ? "blocked" : "ok"}">
          <div class="dependency-node-head">
            <span>⚠ US ${escapeHtml(story.id)}</span>
            ${priorityBadge(story)}
          </div>
          <div class="dependency-line">
            <strong>Depende de</strong>
            <span>${escapeHtml(dep.label)}</span>
          </div>
          <div class="dependency-foot">${escapeHtml(story.sprint)} - ${escapeHtml(story.developer)}</div>
        </article>`;
            })
            .join("")
        : '<div class="empty-state">Nenhuma US com dependência no filtro atual.</div>';
  }

  function renderSprintTrendChart(stories) {
    const el = $("sprintTrendChart");
    if (!el) return;
    const sprints = getAllSprints();
    const points = sprints.map((sprint) => stories.filter((story) => story.sprint === sprint).length);
    const max = Math.max(1, ...points);
    const width = 720;
    const height = 210;
    const pad = 30;
    const coords = points.map((value, index) => {
      const x = sprints.length === 1 ? width / 2 : pad + (index * (width - pad * 2)) / (sprints.length - 1);
      const y = height - pad - (value / max) * (height - pad * 2);
      return { x, y, value, sprint: sprints[index] };
    });
    const path = coords.map((point, index) => `${index ? "L" : "M"}${point.x},${point.y}`).join(" ");
    el.innerHTML = `
      <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Evolução por sprint">
        <path d="${path}" fill="none" stroke="url(#trendGradient)" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
        <defs><linearGradient id="trendGradient"><stop offset="0%" stop-color="#61bb46"/><stop offset="100%" stop-color="#365d78"/></linearGradient></defs>
        ${coords.map((point) => `<circle cx="${point.x}" cy="${point.y}" r="6" fill="${state.sprintMeta[point.sprint]?.color || sprintColor(point.sprint)}"></circle>`).join("")}
        ${coords.map((point) => `<text x="${point.x}" y="${height - 8}" text-anchor="middle">${escapeHtml(point.sprint.replace("Sprint ", "S"))}</text><text x="${point.x}" y="${point.y - 12}" text-anchor="middle">${point.value}</text>`).join("")}
      </svg>`;
  }

  function renderCompletionChart(stories) {
    const el = $("completionChart");
    if (!el) return;
    const sprints = getAllSprints();
    el.innerHTML = sprints
      .map((sprint) => {
        const items = stories.filter((story) => story.sprint === sprint);
        const done = items.filter((story) => isDone(story.status)).length;
        const pct = items.length ? Math.round((done / items.length) * 100) : 0;
        const color = state.sprintMeta[sprint]?.color || sprintColor(sprint);
        return `
          <div class="column-item">
            <div class="column-bar"><span style="height:${pct || 2}%;background:${color}"></span></div>
            <strong>${pct}%</strong>
            <small>${escapeHtml(sprint.replace("Sprint ", "S"))}</small>
          </div>`;
      })
      .join("");
  }

  function renderExecutionBoard(stories) {
    const el = $("executionBoard");
    if (!el) return;
    const map = storyMap();
    const open = sortedStories(stories.filter((story) => !isDone(story.status)));
    const devs = sortDevelopers(open.map((story) => story.developer));
    el.innerHTML =
      devs
        .map((developer) => {
          const items = open.filter((story) => story.developer === developer).slice(0, 6);
          return `
          <article class="execution-card">
            <div class="execution-head">
              <button class="dev-link" type="button" data-open-dev="${escapeHtml(developer)}">
                <span class="avatar" style="background:${getDevColor(developer)}">${escapeHtml(initials(developer))}</span>${escapeHtml(developer)}
              </button>
              <span class="lane-count">${open.filter((story) => story.developer === developer).length} abertas</span>
            </div>
            <div class="focus-list">
              ${items
                .map(
                  (story) => `
                <button class="focus-item" type="button" data-open-story="${escapeHtml(story.id)}">
                  <b>P${escapeHtml(story.queue)}</b>
                  <span>${escapeHtml(story.sprint)} - US ${escapeHtml(story.id)} - ${escapeHtml(story.status)}</span>
                </button>`
                )
                .join("")}
              ${items.length ? "" : '<div class="focus-item"><b>OK</b><span>Sem US aberta neste filtro.</span></div>'}
            </div>
          </article>`;
        })
        .join("") || '<div class="empty-state">Nenhuma US aberta para o filtro atual.</div>';
  }

  function renderDeveloperSummary(stories) {
    const el = $("developerSummary");
    if (!el) return;
    const map = storyMap();
    const developers = sortDevelopers(stories.map((story) => story.developer));
    el.innerHTML =
      developers
        .map((developer) => {
          const items = stories.filter((story) => story.developer === developer);
          const done = items.filter((story) => isDone(story.status)).length;
          const open = items.length - done;
          const top = items.filter((story) => story.queue <= 3 && !isDone(story.status)).length;
          const blocked = items.filter((story) => dependencyInfo(story, map).blocked).length;
          const pct = items.length ? Math.round((done / items.length) * 100) : 0;
          const focus = sortedStories(items.filter((story) => !isDone(story.status))).slice(0, 3);
          return `
          <article class="developer-card">
            <div class="developer-head">
              <button class="dev-link" type="button" data-open-dev="${escapeHtml(developer)}">
                <span class="avatar" style="background:${getDevColor(developer)}">${escapeHtml(initials(developer))}</span>${escapeHtml(developer)}
              </button>
            </div>
            <div class="developer-stats">
              <div class="stat-box"><strong>${items.length}</strong><span>Total</span></div>
              <div class="stat-box"><strong>${open}</strong><span>Abertas</span></div>
              <div class="stat-box"><strong>${top}</strong><span>P1-P3</span></div>
              <div class="stat-box"><strong>${blocked}</strong><span>Bloq.</span></div>
            </div>
            <div class="progress-track"><div class="progress-fill" style="width:${pct}%"></div></div>
            <div class="focus-list">
              ${
                focus.length
                  ? focus
                      .map(
                        (story) => `
                <button class="focus-item" type="button" data-open-story="${escapeHtml(story.id)}">
                  <b>P${escapeHtml(story.queue)}</b>
                  <span>${escapeHtml(story.sprint)} - US ${escapeHtml(story.id)} - ${escapeHtml(story.status)}</span>
                </button>`
                      )
                      .join("")
                  : '<div class="focus-item"><b>OK</b><span>Sem US aberta neste filtro.</span></div>'
              }
            </div>
          </article>`;
        })
        .join("") || '<div class="empty-state">Nenhum desenvolvedor encontrado para os filtros atuais.</div>';
  }

  function renderBacklog(stories) {
    const table = $("backlogTable");
    if (!table) return;
    const map = storyMap();
    const sorted = sortedStories(stories);
    const totalPages = Math.max(1, Math.ceil(sorted.length / state.pagination.pageSize));
    state.pagination.backlogPage = Math.min(state.pagination.backlogPage, totalPages);
    const start = (state.pagination.backlogPage - 1) * state.pagination.pageSize;
    const pageStories = sorted.slice(start, start + state.pagination.pageSize);
    const rows = pageStories
      .map(
        (story) => `
        <tr>
          <td><button class="us-link" type="button" data-open-story="${escapeHtml(story.id)}">${escapeHtml(story.id)}</button></td>
          <td>${priorityBadge(story)}</td>
          <td class="title-cell">${escapeHtml(story.title)}</td>
          <td><button class="dev-link" type="button" data-open-dev="${escapeHtml(story.developer)}">${devChip(story.developer)}</button></td>
          <td>${escapeHtml(story.sprint)}</td>
          <td>${statusBadge(story.status)}</td>
          <td>${dependencyBadge(story, map)}</td>
        </tr>`
      )
      .join("");
    table.querySelector("tbody").innerHTML = rows || '<tr><td colspan="7"><div class="empty-state">Nenhuma US encontrada para os filtros atuais.</div></td></tr>';
    renderBacklogPagination(sorted.length, totalPages, start);
  }

  function renderBacklogPagination(total, totalPages, start) {
    const table = $("backlogTable");
    if (!table) return;
    const panel = table.closest(".panel");
    let bar = $("backlogPagination");
    if (!bar) {
      bar = document.createElement("div");
      bar.id = "backlogPagination";
      bar.className = "pagination-bar";
      panel.appendChild(bar);
    }
    const end = Math.min(total, start + state.pagination.pageSize);
    bar.innerHTML = `
      <span>Mostrando ${total ? start + 1 : 0}-${end} de ${total} registros</span>
      <div class="pagination-actions">
        <button class="ghost-button" type="button" data-page-backlog="prev" ${state.pagination.backlogPage <= 1 ? "disabled" : ""}>Anterior</button>
        <span>Página ${state.pagination.backlogPage} de ${totalPages}</span>
        <button class="ghost-button" type="button" data-page-backlog="next" ${state.pagination.backlogPage >= totalPages ? "disabled" : ""}>Próxima</button>
      </div>`;
  }

  function renderRoadmap(stories) {
    const el = $("roadmap");
    if (!el) return;
    const sprints = getAllSprints();
    el.innerHTML = sprints
      .map((sprint) => {
        const items = [...stories.filter((story) => story.sprint === sprint)].sort(
          (a, b) => Number(a.queue) - Number(b.queue) || a.developer.localeCompare(b.developer, "pt-BR") || Number(a.order) - Number(b.order)
        );
        const done = items.filter((story) => isDone(story.status)).length;
        const pct = items.length ? Math.round((done / items.length) * 100) : 0;
        const meta = state.sprintMeta[sprint] || {};
        const dates = [meta.start, meta.end].filter(Boolean).join(" a ") || "Período a definir";
        const color = meta.color || sprintColor(sprint);
        return `
          <article class="sprint-lane" style="--sprint-color:${color}">
            <div class="sprint-lane-head">
              <h3>${escapeHtml(sprint)}</h3>
              <p>${escapeHtml(dates)} - ${items.length} US - ${pct}% concluído</p>
              <p>${escapeHtml(meta.goal || "Objetivo a definir")}</p>
              <div class="progress-track"><div class="progress-fill" style="width:${pct}%"></div></div>
            </div>
            <div class="sprint-list">
              ${
                items.length
                  ? items
                      .map(
                        (story) => `
                <article class="roadmap-us-card" data-open-story="${escapeHtml(story.id)}">
                  <div class="roadmap-us-dev">
                    <span class="avatar" style="background:${getDevColor(story.developer)}">${escapeHtml(initials(story.developer))}</span>
                    <strong>${escapeHtml(story.developer)}</strong>
                  </div>
                  <div class="roadmap-us-main">
                    <div>${priorityBadge(story)} <button class="us-link" type="button" data-open-story="${escapeHtml(story.id)}">${escapeHtml(story.id)}</button> ${escapeHtml(story.title)}</div>
                    <div class="roadmap-us-meta">${statusBadge(story.status)} ${dependencyBadge(story)}</div>
                  </div>
                </article>`
                      )
                      .join("")
                  : '<div class="empty-state">Nenhuma US neste filtro.</div>'
              }
            </div>
          </article>`;
      })
      .join("");
  }

  function openStoryDrawer(id) {
    if (PAGE === "dashboard") {
      openStoryDetailsDrawer(id);
      return;
    }
    const isNew = !id;
    const story =
      state.stories.find((item) => item.id === id) ||
      normalizeStory({
        id: nextStoryId(),
        title: "",
        developer: "DEFINIR DESENVOLVEDOR",
        sprint: firstSprintName(),
        status: "Apresentar e planejar",
        queue: nextQueueFor(firstSprintName(), "DEFINIR DESENVOLVEDOR"),
      }, state.stories.length);
    const statuses = unique([...DEFAULT_STATUSES, ...state.stories.map((item) => item.status), story.status]);
    const developers = getAllDevelopers();
    const sprints = getAllSprints();

    $("drawerTitle").textContent = isNew ? "Nova User Story" : `US ${story.id}`;
    $("drawerSubtitle").textContent = isNew ? "Cadastrar uma US na fila de desenvolvimento" : "Editar fila, responsável, sprint e status";
    $("drawerBody").innerHTML = `
      <form id="storyForm">
        <div class="form-grid">
          <div class="form-field">
            <label for="storyId">Código US</label>
            <input id="storyId" name="id" value="${escapeHtml(story.id)}" required>
          </div>
          <div class="form-field">
            <label for="storyQueue">Prioridade na fila</label>
            <input id="storyQueue" name="queue" type="number" min="1" value="${escapeHtml(story.queue || 1)}" required>
          </div>
          <div class="form-field full">
            <label for="storyTitle">Descrição</label>
            <textarea id="storyTitle" name="title" required>${escapeHtml(story.title)}</textarea>
          </div>
          <div class="form-field">
            <label for="storyDeveloper">Desenvolvedor</label>
            <select id="storyDeveloper" name="developer" required>${optionsMarkup(developers, story.developer)}</select>
          </div>
          <div class="form-field">
            <label for="storySprint">Sprint</label>
            <select id="storySprint" name="sprint" required>${optionsMarkup(sprints, story.sprint)}</select>
          </div>
          <div class="form-field">
            <label for="storyStatus">Status</label>
            <select id="storyStatus" name="status">${optionsMarkup(statuses, story.status)}</select>
          </div>
          <div class="form-field">
            <label for="storyDependency">Dependência</label>
            <input id="storyDependency" name="dependency" value="${escapeHtml(story.dependency)}" placeholder="Ex.: 6552, 6553">
          </div>
          <div class="form-field full">
            <label for="storyNotes">Notas</label>
            <textarea id="storyNotes" name="notes">${escapeHtml(story.notes)}</textarea>
          </div>
        </div>
        <div class="drawer-actions">
          ${isNew ? "" : '<button class="danger-button" id="deleteStoryBtn" type="button">Excluir US</button>'}
          <button class="ghost-button" type="button" data-close-drawer>Cancelar</button>
          <button class="primary-button" type="submit">Salvar US</button>
        </div>
      </form>`;

    openDrawer();
    $("storyForm").addEventListener("submit", (event) => {
      event.preventDefault();
      saveStoryFromForm(story.id, isNew);
    });
    const deleteBtn = $("deleteStoryBtn");
    if (deleteBtn) deleteBtn.addEventListener("click", () => deleteStory(story.id));
  }

  function openStoryDetailsDrawer(id) {
    const story = state.stories.find((item) => item.id === id);
    if (!story) return;
    $("drawerTitle").textContent = `US ${story.id}`;
    $("drawerSubtitle").textContent = "Consulta somente leitura";
    $("drawerBody").innerHTML = `
      <div class="readonly-detail">
        <div class="readonly-main">
          ${priorityBadge(story)}
          ${statusBadge(story.status)}
          ${dependencyBadge(story)}
        </div>
        <h3>${escapeHtml(story.title)}</h3>
        <dl>
          <div><dt>Desenvolvedor</dt><dd>${devChip(story.developer)}</dd></div>
          <div><dt>Sprint</dt><dd>${escapeHtml(story.sprint)}</dd></div>
          <div><dt>Prioridade</dt><dd>P${escapeHtml(story.queue)}</dd></div>
          <div><dt>Dependência</dt><dd>${escapeHtml(dependencyInfo(story, storyMap()).label)}</dd></div>
          <div><dt>Notas</dt><dd>${escapeHtml(story.notes || "Sem notas")}</dd></div>
        </dl>
      </div>`;
    openDrawer();
  }

  function nextStoryId() {
    const max = state.stories.reduce((highest, story) => Math.max(highest, Number(story.id) || 0), 0);
    return String(max + 1);
  }

  function firstSprintName() {
    return getAllSprints()[0] || "Sprint 1";
  }

  function nextQueueFor(sprint, developer) {
    const values = state.stories.filter((story) => story.sprint === sprint && story.developer === developer).map((story) => story.queue);
    return values.length ? Math.max(...values) + 1 : 1;
  }

  function showFormScreen(kind, title, subtitle, body) {
    const screen = $("formScreen");
    if (!screen) return;
    $("formEyebrow").textContent = kind;
    $("formTitle").textContent = title;
    $("formSubtitle").textContent = subtitle;
    $("formScreenBody").innerHTML = `<div class="form-screen-body">${body}</div>`;
    screen.hidden = false;
    screen.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function closeFormScreen() {
    const screen = $("formScreen");
    if (screen) {
      screen.hidden = true;
      $("formScreenBody").innerHTML = "";
    }
  }

  function openNewStoryScreen() {
    const sprint = firstSprintName();
    const developer = getAllDevelopers()[0] || "DEFINIR DESENVOLVEDOR";
    const statuses = unique([...DEFAULT_STATUSES, ...state.stories.map((story) => story.status)]);
    showFormScreen(
      "Nova US",
      "Cadastrar User Story",
      "A nova US entra diretamente na fila da sprint e do desenvolvedor selecionados.",
      `
      <form id="storyForm">
        <div class="form-grid">
          <div class="form-field">
            <label for="storyId">Código US</label>
            <input id="storyId" name="id" value="${escapeHtml(nextStoryId())}" required>
          </div>
          <div class="form-field">
            <label for="storyQueue">Prioridade na fila</label>
            <input id="storyQueue" name="queue" type="number" min="1" value="${escapeHtml(nextQueueFor(sprint, developer))}" required>
          </div>
          <div class="form-field full">
            <label for="storyTitle">Descrição</label>
            <textarea id="storyTitle" name="title" required></textarea>
          </div>
          <div class="form-field">
            <label for="storyDeveloper">Desenvolvedor</label>
            <select id="storyDeveloper" name="developer">${optionsMarkup(getAllDevelopers(), developer)}</select>
          </div>
          <div class="form-field">
            <label for="storySprint">Sprint</label>
            <select id="storySprint" name="sprint">${optionsMarkup(getAllSprints(), sprint)}</select>
          </div>
          <div class="form-field">
            <label for="storyStatus">Status</label>
            <select id="storyStatus" name="status">${optionsMarkup(statuses, "Apresentar e planejar")}</select>
          </div>
          <div class="form-field">
            <label for="storyDependency">Dependência</label>
            <input id="storyDependency" name="dependency" placeholder="Ex.: 6552, 6553">
          </div>
          <div class="form-field full">
            <label for="storyNotes">Notas</label>
            <textarea id="storyNotes" name="notes"></textarea>
          </div>
        </div>
        <div class="form-screen-actions">
          <button class="ghost-button" type="button" data-close-form>Cancelar</button>
          <button class="primary-button" type="submit">Salvar US</button>
        </div>
      </form>`
    );
    $("storyForm").addEventListener("submit", (event) => {
      event.preventDefault();
      saveStoryFromForm("", true);
      closeFormScreen();
    });
  }

  function openNewSprintScreen() {
    const nextSprintNumber = Math.max(0, ...getAllSprints().map((sprint) => sprintNumber(sprint)).filter(Number.isFinite)) + 1;
    showFormScreen(
      "Nova Sprint",
      "Cadastrar Sprint",
      "Depois de criada, a sprint aparece nos filtros, na fila de gestão e no roadmap.",
      `
      <form id="sprintForm">
        <div class="form-grid">
          <div class="form-field">
            <label for="sprintName">Nome</label>
            <input id="sprintName" name="name" value="Sprint ${escapeHtml(nextSprintNumber)}" required>
          </div>
          <div class="form-field">
            <label for="sprintStart">Início</label>
            <input id="sprintStart" name="start" placeholder="08/06">
          </div>
          <div class="form-field">
            <label for="sprintEnd">Fim</label>
            <input id="sprintEnd" name="end" placeholder="19/06">
          </div>
          <div class="form-field">
            <label for="sprintColor">Cor da Sprint</label>
            <input id="sprintColor" name="color" type="color" value="${escapeHtml(sprintColor(`Sprint ${nextSprintNumber}`))}">
          </div>
          <div class="form-field full">
            <label for="sprintGoal">Objetivo</label>
            <textarea id="sprintGoal" name="goal" placeholder="Objetivo da sprint"></textarea>
          </div>
        </div>
        <div class="form-screen-actions">
          <button class="ghost-button" type="button" data-close-form>Cancelar</button>
          <button class="primary-button" type="submit">Salvar Sprint</button>
        </div>
      </form>`
    );
    $("sprintForm").addEventListener("submit", (event) => {
      event.preventDefault();
      const formData = new FormData($("sprintForm"));
      const name = String(formData.get("name") || "").trim();
      if (!name) return;
      state.sprintMeta[name] = {
        start: String(formData.get("start") || "").trim(),
        end: String(formData.get("end") || "").trim(),
        goal: String(formData.get("goal") || "").trim() || "Objetivo a definir",
        color: String(formData.get("color") || sprintColor(name)),
      };
      persist("Sprint criada");
      closeFormScreen();
      render();
    });
  }

  function openNewDeveloperScreen() {
    showFormScreen(
      "Novo Dev",
      "Cadastrar Desenvolvedor",
      "O novo responsável passa a aparecer como coluna de destino nas filas de sprint.",
      `
      <form id="developerForm">
        <div class="form-grid">
          <div class="form-field">
            <label for="developerName">Nome</label>
            <input id="developerName" name="name" required>
          </div>
          <div class="form-field">
            <label for="developerColor">Cor</label>
            <input id="developerColor" name="color" type="color" value="#365d78">
          </div>
        </div>
        <div class="form-screen-actions">
          <button class="ghost-button" type="button" data-close-form>Cancelar</button>
          <button class="primary-button" type="submit">Salvar Dev</button>
        </div>
      </form>`
    );
    $("developerForm").addEventListener("submit", (event) => {
      event.preventDefault();
      const formData = new FormData($("developerForm"));
      const name = String(formData.get("name") || "").trim();
      if (!name) return;
      state.developers = sortDevelopers([...state.developers, name]);
      state.devColors[name] = String(formData.get("color") || "#365d78");
      persist("Desenvolvedor criado");
      closeFormScreen();
      render();
    });
  }

  function saveStoryFromForm(originalId, isNew) {
    const formData = new FormData($("storyForm"));
    const next = normalizeStory({
      id: formData.get("id"),
      title: formData.get("title"),
      developer: formData.get("developer"),
      sprint: formData.get("sprint"),
      status: formData.get("status"),
      dependency: formData.get("dependency"),
      queue: formData.get("queue"),
      notes: formData.get("notes"),
      order: isNew ? state.stories.length + 1 : state.stories.find((story) => story.id === originalId)?.order,
    }, state.stories.length);

    if (!next.id || !next.title) {
      alert("Informe o código da US e a descrição.");
      return;
    }

    const duplicate = state.stories.some((story) => story.id === next.id && story.id !== originalId);
    if (duplicate) {
      alert("Já existe uma US com esse código.");
      return;
    }

    if (isNew) {
      state.stories.push(next);
    } else {
      state.stories = state.stories.map((story) => (story.id === originalId ? next : story));
    }
    ensureDevelopers();
    assignQueueDefaults();
    persist(isNew ? "US criada" : "US atualizada");
    closeDrawer();
    render();
  }

  function deleteStory(id) {
    if (!confirm(`Excluir a US ${id}?`)) return;
    state.stories = state.stories.filter((story) => story.id !== id);
    persist("US excluída");
    closeDrawer();
    render();
  }

  function openDeveloperDrawer(developer) {
    const items = sortedStories(state.stories.filter((story) => story.developer === developer));
    const map = storyMap();
    const sprints = sortSprints(items.map((story) => story.sprint));
    $("drawerTitle").textContent = developer;
    $("drawerSubtitle").textContent = `${items.length} US atribuídas, agrupadas por sprint e prioridade`;
    $("drawerBody").innerHTML = `
      <div class="drawer-actions" style="justify-content:flex-start;margin-top:0;margin-bottom:12px">
        <button class="primary-button" type="button" data-apply-dev-filter="${escapeHtml(developer)}">Filtrar por este desenvolvedor</button>
      </div>
      <div class="table-wrap drawer-table">
        <table class="data-table">
          <thead>
            <tr>
              <th>Sprint</th>
              <th>Prioridade</th>
              <th>US</th>
              <th>Descrição</th>
              <th>Status</th>
              <th>Dependência</th>
            </tr>
          </thead>
          <tbody>
            ${
              sprints
                .map((sprint) =>
                  sortedStories(items.filter((story) => story.sprint === sprint))
                    .map(
                      (story) => `
                <tr>
                  <td>${escapeHtml(story.sprint)}</td>
                  <td>${priorityBadge(story)}</td>
                  <td><button class="us-link" type="button" data-open-story="${escapeHtml(story.id)}">${escapeHtml(story.id)}</button></td>
                  <td class="title-cell">${escapeHtml(story.title)}</td>
                  <td>${statusBadge(story.status)}</td>
                  <td>${dependencyBadge(story, map)}</td>
                </tr>`
                    )
                    .join("")
                )
                .join("") || '<tr><td colspan="6"><div class="empty-state">Nenhuma US atribuída.</div></td></tr>'
            }
          </tbody>
        </table>
      </div>`;
    openDrawer();
  }

  function openDrawer() {
    const drawer = $("drawerBackdrop");
    if (drawer) drawer.hidden = false;
  }

  function closeDrawer() {
    const drawer = $("drawerBackdrop");
    if (drawer) drawer.hidden = true;
  }

  function clearFilters() {
    state.filters = { search: "", sprint: "Todos", developer: "Todos", status: "Todos", queue: "Todos" };
    state.pagination.backlogPage = 1;
    render();
  }

  function setFilter(name, value) {
    state.filters[name] = value || "Todos";
    state.pagination.backlogPage = 1;
    render();
  }

  function updateStoryField(id, field, value) {
    const story = state.stories.find((item) => item.id === id);
    if (!story) return;
    if (field === "queue") story.queue = toNumber(value, 1);
    else story[field] = field === "dependency" ? cleanDependency(value) : String(value || "").trim();
    if (field === "sprint") ensureSprintMeta();
    if (field === "developer") ensureDevelopers();
    assignQueueDefaults();
    persist("Alteração salva");
    render();
  }

  function updateSprintMeta(sprint, field, value) {
    if (!state.sprintMeta[sprint]) state.sprintMeta[sprint] = { start: "", end: "", goal: "" };
    state.sprintMeta[sprint][field] = String(value || "").trim();
    persist("Sprint atualizada");
    render();
  }

  function compactLane(sprint, developer, orderedIds) {
    const current = sortedStories(
      state.stories.filter((story) => story.sprint === sprint && story.developer === developer),
      "queue",
      "asc"
    );
    const preferred = orderedIds
      ? orderedIds.map((id) => current.find((story) => story.id === id)).filter(Boolean)
      : [];
    const remaining = current.filter((story) => !preferred.some((item) => item.id === story.id));
    [...preferred, ...remaining].forEach((story, index) => {
      story.queue = index + 1;
      story.order = index + 1;
    });
  }

  function moveStoryToQueue(storyId, targetSprint, targetDeveloper, beforeId) {
    const story = state.stories.find((item) => item.id === storyId);
    if (!story || !targetSprint || !targetDeveloper) return;
    const sourceSprint = story.sprint;
    const sourceDeveloper = story.developer;

    const targetItems = sortedStories(
      state.stories.filter((item) => item.id !== storyId && item.sprint === targetSprint && item.developer === targetDeveloper),
      "queue",
      "asc"
    );
    const targetIds = targetItems.map((item) => item.id);
    const insertAt = beforeId ? targetIds.indexOf(beforeId) : -1;
    if (insertAt >= 0) targetIds.splice(insertAt, 0, storyId);
    else targetIds.push(storyId);

    story.sprint = targetSprint;
    story.developer = targetDeveloper;
    ensureSprintMeta();
    ensureDevelopers();

    if (sourceSprint !== targetSprint || sourceDeveloper !== targetDeveloper) {
      compactLane(sourceSprint, sourceDeveloper);
    }
    compactLane(targetSprint, targetDeveloper, targetIds);
    persist("Fila recalculada");
    render();
  }

  function buildDataPayload() {
    ensureSprintMeta();
    ensureDevelopers();
    return {
      version: 1,
      updatedAt: new Date().toISOString(),
      stories: state.stories,
      sprintMeta: state.sprintMeta,
      developers: state.developers,
      devColors: state.devColors,
    };
  }

  function applyDataPayload(payload, label) {
    const stories = Array.isArray(payload) ? payload : payload?.stories;
    if (!Array.isArray(stories)) throw new Error("Arquivo de nuvem sem stories.");
    state.stories = stories.map(normalizeStory).filter((story) => !HIDDEN_SPRINTS.has(story.sprint));
    state.sprintMeta = { ...(payload.sprintMeta || {}) };
    HIDDEN_SPRINTS.forEach((sprint) => delete state.sprintMeta[sprint]);
    state.developers = Array.isArray(payload.developers) ? payload.developers.map((name) => String(name).trim()).filter(Boolean) : [];
    state.devColors = { ...(payload.devColors || {}) };
    ensureSprintMeta();
    ensureDevelopers();
    assignQueueDefaults();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(buildDataPayload()));
    setSaveState(label || "Dados da nuvem carregados");
    render();
  }

  function inferCloudDefaults() {
    const defaults = { ...CLOUD_DEFAULT };
    if (location.hostname.endsWith(".github.io")) {
      defaults.owner = location.hostname.replace(".github.io", "");
      defaults.repo = location.pathname.split("/").filter(Boolean)[0] || defaults.repo;
    }
    return defaults;
  }

  function loadCloudConfig() {
    const defaults = inferCloudDefaults();
    try {
      return { ...defaults, ...(JSON.parse(localStorage.getItem(CLOUD_KEY) || "{}") || {}) };
    } catch (error) {
      return defaults;
    }
  }

  function saveCloudConfig(config) {
    localStorage.setItem(CLOUD_KEY, JSON.stringify({
      owner: String(config.owner || "").trim(),
      repo: String(config.repo || "").trim(),
      branch: String(config.branch || "main").trim(),
      path: String(config.path || "data/store.json").trim(),
      token: String(config.token || "").trim(),
    }));
  }

  function githubApiUrl(config) {
    return `https://api.github.com/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}/contents/${config.path.split("/").map(encodeURIComponent).join("/")}`;
  }

  function githubRawUrl(config) {
    return `https://raw.githubusercontent.com/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}/${encodeURIComponent(config.branch)}/${config.path.split("/").map(encodeURIComponent).join("/")}?v=${Date.now()}`;
  }

  function cloudReadUrl(config) {
    if (location.protocol === "file:" || ["localhost", "127.0.0.1"].includes(location.hostname)) {
      return `${config.path}?v=${Date.now()}`;
    }
    return githubRawUrl(config);
  }

  function base64Utf8(text) {
    const bytes = new TextEncoder().encode(text);
    let binary = "";
    for (let index = 0; index < bytes.length; index += 0x8000) {
      binary += String.fromCharCode(...bytes.slice(index, index + 0x8000));
    }
    return btoa(binary);
  }

  function decodeBase64Utf8(content) {
    const clean = String(content || "").replace(/\s/g, "");
    const binary = atob(clean);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return new TextDecoder("utf-8").decode(bytes);
  }

  async function fetchCloudPayload(config) {
    if (config.token) {
      const response = await fetch(`${githubApiUrl(config)}?ref=${encodeURIComponent(config.branch)}`, {
        cache: "no-store",
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${config.token}`,
          "X-GitHub-Api-Version": "2022-11-28",
        },
      });
      if (!response.ok) throw new Error(cloudErrorMessage(response.status, "carregar"));
      const file = await response.json();
      return JSON.parse(decodeBase64Utf8(file.content));
    }

    const response = await fetch(cloudReadUrl(config), { cache: "no-store" });
    if (!response.ok) throw new Error(cloudErrorMessage(response.status, "carregar"));
    return response.json();
  }

  function cloudErrorMessage(status, action) {
    if (status === 401) return "Token invalido. Gere um novo token e configure novamente.";
    if (status === 403) return "Token sem permissao. Libere Contents como Read and write.";
    if (status === 404) return "Arquivo data/store.json nao encontrado no repositorio. Envie a pasta data para o GitHub.";
    if (status === 409) return "O arquivo mudou no GitHub. Clique em Carregar Nuvem e tente salvar novamente.";
    return `GitHub retornou ${status} ao ${action}.`;
  }

  async function loadCloudData(manual) {
    const config = loadCloudConfig();
    if (location.protocol === "file:" && !manual) return;
    if (state.cloudLoading) return;
    state.cloudLoading = true;
    if (manual) setSaveState("Carregando nuvem");
    try {
      applyDataPayload(await fetchCloudPayload(config), "Dados carregados da nuvem");
      if (manual) alert("Nuvem carregada com sucesso.");
    } catch (error) {
      if (manual) alert(`Nao foi possivel carregar a nuvem: ${error.message}`);
      if (manual) console.warn("Falha ao carregar nuvem.", error);
    } finally {
      state.cloudLoading = false;
    }
  }

  async function saveCloudData() {
    const config = loadCloudConfig();
    if (!config.token) {
      openCloudConfigScreen();
      alert("Cole o token do GitHub antes de salvar na nuvem.");
      return;
    }
    if (state.cloudSaving) return;
    state.cloudSaving = true;
    setSaveState("Salvando nuvem");
    try {
      let sha = null;
      const current = await fetch(`${githubApiUrl(config)}?ref=${encodeURIComponent(config.branch)}`, {
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${config.token}`,
          "X-GitHub-Api-Version": "2022-11-28",
        },
      });
      if (current.ok) {
        sha = (await current.json()).sha;
      } else if (current.status !== 404) {
        throw new Error(cloudErrorMessage(current.status, "consultar o JSON"));
      }

      const body = {
        message: `Atualiza backlog Coplan - ${new Date().toLocaleString("pt-BR")}`,
        content: base64Utf8(JSON.stringify(buildDataPayload(), null, 2)),
        branch: config.branch,
      };
      if (sha) body.sha = sha;

      const saved = await fetch(githubApiUrl(config), {
        method: "PUT",
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${config.token}`,
          "Content-Type": "application/json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
        body: JSON.stringify(body),
      });
      if (!saved.ok) {
        throw new Error(cloudErrorMessage(saved.status, "salvar"));
      }
      setSaveState("Nuvem sincronizada");
      alert("Dados salvos na nuvem. No celular, atualize a pagina para carregar a nova versao.");
    } catch (error) {
      alert(`Nao foi possivel salvar na nuvem: ${error.message}`);
      setSaveState("Falha ao salvar nuvem");
      console.warn("Falha ao salvar nuvem.", error);
    } finally {
      state.cloudSaving = false;
    }
  }

  function scheduleCloudSave() {
    return;
  }

  function openCloudConfigScreen() {
    const config = loadCloudConfig();
    showFormScreen(
      "Nuvem",
      "Configurar GitHub JSON",
      "O token fica salvo somente neste navegador e grava o arquivo data/store.json no repositorio.",
      `
      <form id="cloudForm">
        <div class="form-grid">
          <div class="form-field">
            <label for="cloudOwner">Owner</label>
            <input id="cloudOwner" name="owner" value="${escapeHtml(config.owner)}" required>
          </div>
          <div class="form-field">
            <label for="cloudRepo">Repositorio</label>
            <input id="cloudRepo" name="repo" value="${escapeHtml(config.repo)}" required>
          </div>
          <div class="form-field">
            <label for="cloudBranch">Branch</label>
            <input id="cloudBranch" name="branch" value="${escapeHtml(config.branch || "main")}" required>
          </div>
          <div class="form-field">
            <label for="cloudPath">Arquivo JSON</label>
            <input id="cloudPath" name="path" value="${escapeHtml(config.path || "data/store.json")}" required>
          </div>
          <div class="form-field full">
            <label for="cloudToken">Token GitHub</label>
            <input id="cloudToken" name="token" type="password" value="${escapeHtml(config.token || "")}" placeholder="github_pat_..." autocomplete="off">
          </div>
        </div>
        <div class="form-screen-actions">
          <button class="ghost-button" type="button" data-close-form>Cancelar</button>
          <button class="primary-button" type="submit">Salvar Configuracao</button>
        </div>
      </form>`
    );
    $("cloudForm").addEventListener("submit", (event) => {
      event.preventDefault();
      saveCloudConfig(Object.fromEntries(new FormData($("cloudForm")).entries()));
      closeFormScreen();
      setSaveState("Nuvem configurada");
    });
  }

  function exportJson() {
    download(
      "gestao-user-stories.json",
      JSON.stringify(
        {
          exportedAt: new Date().toISOString(),
          stories: state.stories,
          sprintMeta: state.sprintMeta,
          developers: state.developers,
          devColors: state.devColors,
        },
        null,
        2
      ),
      "application/json;charset=utf-8"
    );
  }

  function download(filename, content, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function importJson(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const payload = JSON.parse(String(reader.result));
        const stories = Array.isArray(payload) ? payload : payload.stories;
        if (!Array.isArray(stories)) throw new Error("Arquivo sem lista de stories.");
        state.stories = stories.map(normalizeStory).filter((story) => !HIDDEN_SPRINTS.has(story.sprint));
        state.sprintMeta = { ...state.sprintMeta, ...(payload.sprintMeta || {}) };
        HIDDEN_SPRINTS.forEach((sprint) => delete state.sprintMeta[sprint]);
        state.developers = Array.isArray(payload.developers) ? payload.developers.map((name) => String(name).trim()).filter(Boolean) : state.developers;
        state.devColors = { ...state.devColors, ...(payload.devColors || {}) };
        ensureDevelopers();
        assignQueueDefaults();
        persist("JSON importado");
        render();
      } catch (error) {
        alert("Não foi possível importar o JSON. Verifique o formato do arquivo.");
        console.warn(error);
      } finally {
        if ($("importFile")) $("importFile").value = "";
      }
    };
    reader.readAsText(file, "utf8");
  }

  function resetBase() {
    if (!confirm("Restaurar a base inicial e apagar alterações locais deste navegador?")) return;
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(LEGACY_STORAGE_KEY);
    loadState();
    clearFilters();
    persist("Base restaurada");
  }

  function bind(id, event, handler) {
    const el = $(id);
    if (el) el.addEventListener(event, handler);
  }

  function exportCsv() {
    const map = storyMap();
    const headers = ["US", "Prioridade", "Descrição", "Desenvolvedor", "Sprint", "Status", "Dependência", "Bloqueada", "Notas"];
    const rows = sortedStories(getFilteredStories()).map((story) => {
      const dep = dependencyInfo(story, map);
      return [story.id, `P${story.queue}`, story.title, story.developer, story.sprint, story.status, dep.label, dep.blocked ? "Sim" : "Não", story.notes];
    });
    const blob = makeXlsxBlob("Backlog", [headers, ...rows]);
    downloadBlob("backlog-user-stories.xlsx", blob);
  }

  function makeXlsxBlob(sheetName, rows) {
    const files = {
      "[Content_Types].xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`,
      "_rels/.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
      "xl/_rels/workbook.xml.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
      "xl/workbook.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${xmlEscape(sheetName)}" sheetId="1" r:id="rId1"/></sheets></workbook>`,
      "xl/styles.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0"/></cellXfs></styleSheet>`,
      "xl/worksheets/sheet1.xml": worksheetXml(rows),
    };
    return new Blob([zipStore(files)], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  }

  function worksheetXml(rows) {
    const widths = [12, 13, 58, 26, 14, 24, 22, 12, 36];
    const cols = widths.map((width, index) => `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`).join("");
    const body = rows
      .map((row, rowIndex) => `<row r="${rowIndex + 1}">${row.map((cell, colIndex) => {
        const ref = `${columnName(colIndex + 1)}${rowIndex + 1}`;
        return `<c r="${ref}" t="inlineStr" s="${rowIndex === 0 ? 1 : 0}"><is><t>${xmlEscape(cell)}</t></is></c>`;
      }).join("")}</row>`)
      .join("");
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cols>${cols}</cols><sheetData>${body}</sheetData><autoFilter ref="A1:I${Math.max(rows.length, 1)}"/></worksheet>`;
  }

  function columnName(index) {
    let name = "";
    while (index > 0) {
      const rem = (index - 1) % 26;
      name = String.fromCharCode(65 + rem) + name;
      index = Math.floor((index - 1) / 26);
    }
    return name;
  }

  function xmlEscape(value) {
    return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function zipStore(files) {
    const encoder = new TextEncoder();
    const chunks = [];
    const central = [];
    let offset = 0;
    Object.entries(files).forEach(([name, content]) => {
      const nameBytes = encoder.encode(name);
      const data = encoder.encode(content);
      const crc = crc32(data);
      const local = new Uint8Array(30 + nameBytes.length);
      const view = new DataView(local.buffer);
      view.setUint32(0, 0x04034b50, true);
      view.setUint16(4, 20, true);
      view.setUint16(8, 0, true);
      view.setUint32(14, crc, true);
      view.setUint32(18, data.length, true);
      view.setUint32(22, data.length, true);
      view.setUint16(26, nameBytes.length, true);
      local.set(nameBytes, 30);
      chunks.push(local, data);
      const centralFile = new Uint8Array(46 + nameBytes.length);
      const cView = new DataView(centralFile.buffer);
      cView.setUint32(0, 0x02014b50, true);
      cView.setUint16(4, 20, true);
      cView.setUint16(6, 20, true);
      cView.setUint32(16, crc, true);
      cView.setUint32(20, data.length, true);
      cView.setUint32(24, data.length, true);
      cView.setUint16(28, nameBytes.length, true);
      cView.setUint32(42, offset, true);
      centralFile.set(nameBytes, 46);
      central.push(centralFile);
      offset += local.length + data.length;
    });
    const centralOffset = offset;
    central.forEach((entry) => {
      chunks.push(entry);
      offset += entry.length;
    });
    const end = new Uint8Array(22);
    const endView = new DataView(end.buffer);
    endView.setUint32(0, 0x06054b50, true);
    endView.setUint16(8, central.length, true);
    endView.setUint16(10, central.length, true);
    endView.setUint32(12, offset - centralOffset, true);
    endView.setUint32(16, centralOffset, true);
    chunks.push(end);
    return new Blob(chunks, { type: "application/zip" });
  }

  function crc32(data) {
    if (!crc32.table) {
      crc32.table = Array.from({ length: 256 }, (_, n) => {
        let c = n;
        for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        return c >>> 0;
      });
    }
    let crc = -1;
    for (let i = 0; i < data.length; i += 1) crc = (crc >>> 8) ^ crc32.table[(crc ^ data[i]) & 0xff];
    return (crc ^ -1) >>> 0;
  }

  function downloadBlob(filename, blob) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function setupEvents() {
    if (state.eventsReady) return;
    state.eventsReady = true;

    document.addEventListener("click", (event) => {
      const storyBtn = event.target.closest("[data-open-story]");
      if (storyBtn) {
        openStoryDrawer(storyBtn.dataset.openStory);
        return;
      }

      const devBtn = event.target.closest("[data-open-dev]");
      if (devBtn) {
        openDeveloperDrawer(devBtn.dataset.openDev);
        return;
      }

      const sprintBtn = event.target.closest("[data-filter-sprint]");
      if (sprintBtn) {
        state.filters.sprint = sprintBtn.dataset.filterSprint;
        state.pagination.backlogPage = 1;
        render();
        return;
      }

      const pageBtn = event.target.closest("[data-page-backlog]");
      if (pageBtn && !pageBtn.disabled) {
        state.pagination.backlogPage += pageBtn.dataset.pageBacklog === "next" ? 1 : -1;
        render();
        return;
      }

      const sortHead = event.target.closest("th[data-sort]");
      if (sortHead) {
        const field = sortHead.dataset.sort;
        if (state.sort.field === field) state.sort.dir = state.sort.dir === "asc" ? "desc" : "asc";
        else {
          state.sort.field = field;
          state.sort.dir = "asc";
        }
        state.pagination.backlogPage = 1;
        render();
        return;
      }

      if (event.target.closest("[data-close-form]")) {
        closeFormScreen();
        return;
      }

      if (event.target.closest("[data-close-drawer]")) {
        closeDrawer();
        return;
      }

      const applyDev = event.target.closest("[data-apply-dev-filter]");
      if (applyDev) {
        state.filters.developer = applyDev.dataset.applyDevFilter;
        closeDrawer();
        render();
      }
    });

    document.addEventListener("change", (event) => {
      const target = event.target;
      if (target.matches("[data-update]")) updateStoryField(target.dataset.update, target.dataset.field, target.value);
      if (target.matches("[data-sprint-update]")) updateSprintMeta(target.dataset.sprintUpdate, target.dataset.sprintField, target.value);
    });

    document.addEventListener("dragstart", (event) => {
      const item = event.target.closest("[data-drag-story]");
      if (!item) return;
      state.dragStoryId = item.dataset.dragStory;
      item.classList.add("dragging");
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", state.dragStoryId);
    });

    document.addEventListener("dragover", (event) => {
      const lane = event.target.closest("[data-drop-sprint][data-drop-developer]");
      if (!lane || !state.dragStoryId) return;
      event.preventDefault();
      lane.classList.add("drop-ready");
    });

    document.addEventListener("dragleave", (event) => {
      const lane = event.target.closest("[data-drop-sprint][data-drop-developer]");
      if (lane) lane.classList.remove("drop-ready");
    });

    document.addEventListener("drop", (event) => {
      const lane = event.target.closest("[data-drop-sprint][data-drop-developer]");
      if (!lane || !state.dragStoryId) return;
      event.preventDefault();
      const before = event.target.closest("[data-drop-story]");
      const beforeId = before?.dataset.dropStory === state.dragStoryId ? null : before?.dataset.dropStory;
      moveStoryToQueue(state.dragStoryId, lane.dataset.dropSprint, lane.dataset.dropDeveloper, beforeId);
      state.dragStoryId = null;
      document.querySelectorAll(".drop-ready,.dragging").forEach((node) => node.classList.remove("drop-ready", "dragging"));
    });

    document.addEventListener("dragend", () => {
      state.dragStoryId = null;
      document.querySelectorAll(".drop-ready,.dragging").forEach((node) => node.classList.remove("drop-ready", "dragging"));
    });

    bind("filterSearch", "input", (event) => {
      state.filters.search = event.target.value;
      state.pagination.backlogPage = 1;
      render();
    });
    bind("filterSprint", "change", (event) => setFilter("sprint", event.target.value));
    bind("filterDeveloper", "change", (event) => setFilter("developer", event.target.value));
    bind("filterStatus", "change", (event) => setFilter("status", event.target.value));
    bind("filterQueue", "change", (event) => setFilter("queue", event.target.value));
    bind("clearFiltersBtn", "click", clearFilters);
    bind("cloudConfigBtn", "click", openCloudConfigScreen);
    bind("cloudLoadBtn", "click", () => loadCloudData(true));
    bind("cloudSaveBtn", "click", saveCloudData);
    bind("exportCsvBtn", "click", exportCsv);
    bind("exportJsonBtn", "click", exportJson);
    bind("importJsonBtn", "click", () => $("importFile")?.click());
    bind("importFile", "change", (event) => importJson(event.target.files[0]));
    bind("resetBtn", "click", resetBase);
    bind("newStoryBtnManage", "click", openNewStoryScreen);
    bind("newSprintBtn", "click", openNewSprintScreen);
    bind("newSprintBtnPanel", "click", openNewSprintScreen);
    bind("newDeveloperBtn", "click", openNewDeveloperScreen);
    bind("newDeveloperBtnPanel", "click", openNewDeveloperScreen);
    bind("closeFormScreenBtn", "click", closeFormScreen);
    bind("closeDrawerBtn", "click", closeDrawer);
    bind("printDashboardBtn", "click", () => window.print());
    bind("logoutBtn", "click", logout);
    bind("drawerBackdrop", "click", (event) => {
      if (event.target === $("drawerBackdrop")) closeDrawer();
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeDrawer();
    });
  }

  function setupAuth() {
    const loginForm = $("loginForm");
    if (loginForm) {
      loginForm.addEventListener("submit", (event) => {
        event.preventDefault();
        const user = String($("loginUser").value || "").trim();
        const pass = String($("loginPass").value || "");
        if (user === AUTH_USER && pass === AUTH_PASS) {
          localStorage.setItem(AUTH_KEY, "ok");
          $("loginError").textContent = "";
          bootstrap();
        } else {
          $("loginError").textContent = "Login ou senha inválidos.";
        }
      });
    }

    if (localStorage.getItem(AUTH_KEY) === "ok") bootstrap();
    else {
      if ($("loginScreen")) $("loginScreen").hidden = false;
      if ($("appRoot")) $("appRoot").hidden = true;
    }
  }

  function logout() {
    localStorage.removeItem(AUTH_KEY);
    if ($("appRoot")) $("appRoot").hidden = true;
    if ($("loginScreen")) $("loginScreen").hidden = false;
  }

  function bootstrap() {
    if ($("loginScreen")) $("loginScreen").hidden = true;
    if ($("appRoot")) $("appRoot").hidden = false;
    if (!state.booted) {
      loadState();
      setupEvents();
      state.booted = true;
    }
    setSaveState(PAGE === "dashboard" ? "Dashboard carregado" : "Gestão carregada");
    render();
    loadCloudData(false);
  }

  setupAuth();
})();
