(function () {
  const CHANNEL_ID = "frameport-demo";
  const DEMO_LOG_KEY = "__frameportDemoLog";
  const MESSAGE_NAMES = [
    "parent-notify",
    "child-status",
    "get-profile",
    "get-host-theme",
    "host-theme-updated",
  ];

  const THEMES = [
    { name: "midnight", accent: "#7c8cff" },
    { name: "sunset", accent: "#ff8a5b" },
    { name: "forest", accent: "#57c785" },
  ];

  const state = {
    channel: null,
    events: [],
    eventFilter: "both",
    noticeCount: 0,
    requestedUserId: 41,
    themeIndex: 0,
  };

  function byId(id) {
    return document.getElementById(id);
  }

  function timestamp() {
    return new Date().toLocaleTimeString();
  }

  function escapeHtml(text) {
    return text
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");
  }

  function previousNonWhitespaceChar(source, index) {
    for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
      const character = source[cursor];
      if (!/\s/.test(character)) {
        return character;
      }
    }

    return "";
  }

  function highlightJavaScript(source) {
    const keywords = new Set([
      "async",
      "await",
      "const",
      "function",
      "let",
      "new",
      "return",
    ]);
    const literals = new Set(["false", "null", "true"]);
    let output = "";
    let index = 0;

    while (index < source.length) {
      const character = source[index];

      if (source.startsWith("//", index)) {
        let end = index;
        while (end < source.length && source[end] !== "\n") {
          end += 1;
        }
        output += `<span class="token-comment">${escapeHtml(
          source.slice(index, end)
        )}</span>`;
        index = end;
        continue;
      }

      if (['"', "'", "`"].includes(character)) {
        const quote = character;
        let end = index + 1;

        while (end < source.length) {
          if (source[end] === "\\") {
            end += 2;
            continue;
          }

          if (source[end] === quote) {
            end += 1;
            break;
          }

          end += 1;
        }

        output += `<span class="token-string">${escapeHtml(
          source.slice(index, end)
        )}</span>`;
        index = end;
        continue;
      }

      if (/\d/.test(character)) {
        let end = index + 1;
        while (end < source.length && /[\d._]/.test(source[end])) {
          end += 1;
        }
        output += `<span class="token-number">${escapeHtml(
          source.slice(index, end)
        )}</span>`;
        index = end;
        continue;
      }

      if (/[A-Za-z_$]/.test(character)) {
        let end = index + 1;
        while (end < source.length && /[A-Za-z0-9_$]/.test(source[end])) {
          end += 1;
        }

        const identifier = source.slice(index, end);
        const previousCharacter = previousNonWhitespaceChar(source, index);

        if (keywords.has(identifier)) {
          output += `<span class="token-keyword">${identifier}</span>`;
        } else if (literals.has(identifier)) {
          output += `<span class="token-literal">${identifier}</span>`;
        } else if (previousCharacter === ".") {
          output += `<span class="token-property">${identifier}</span>`;
        } else {
          output += escapeHtml(identifier);
        }

        index = end;
        continue;
      }

      output += escapeHtml(character);
      index += 1;
    }

    return output;
  }

  function highlightHtml(source) {
    return escapeHtml(source)
      .replace(
        /(&lt;!--[\s\S]*?--&gt;)/g,
        '<span class="token-comment">$1</span>'
      )
      .replace(
        /(&lt;\/?)([A-Za-z][A-Za-z0-9-]*)([^&]*?)(\/?&gt;)/g,
        function (_, open, tagName, attributes, close) {
          const highlightedAttributes = attributes.replace(
            /([A-Za-z:-]+)(=)(&quot;.*?&quot;)/g,
            '<span class="token-attr-name">$1</span>$2<span class="token-string">$3</span>'
          );

          return `${open}<span class="token-tag">${tagName}</span>${highlightedAttributes}${close}`;
        }
      );
  }

  function highlightCodeBlocks() {
    document.querySelectorAll(".example-code code").forEach(function (block) {
      const language = block.parentElement?.dataset.language || "js";
      const source = block.textContent || "";

      block.innerHTML =
        language === "html"
          ? highlightHtml(source)
          : highlightJavaScript(source);
    });
  }

  function renderEvents() {
    const eventsLog = byId("events-log");
    const summary = byId("events-summary");
    const visibleEvents = state.events.filter(function (entry) {
      return state.eventFilter === "both" || entry.source === state.eventFilter;
    });

    summary.textContent =
      state.eventFilter === "both"
        ? "Showing both parent and child events."
        : `Showing only ${state.eventFilter} events.`;

    eventsLog.replaceChildren();

    if (visibleEvents.length === 0) {
      const emptyState = document.createElement("div");
      emptyState.className = "empty-log";
      emptyState.textContent = "No events match the current filter yet.";
      eventsLog.append(emptyState);
      return;
    }

    visibleEvents.forEach(function (entry) {
      const eventNode = document.createElement("div");
      eventNode.className = `log-entry ${entry.tone || "info"}`;
      eventNode.innerHTML = `
        <div class="log-entry-head">
          <span class="log-source log-source-${entry.source}">${entry.source}</span>
          <span class="log-time">${entry.time}</span>
        </div>
        <div class="log-message">${entry.message}</div>
      `;
      eventsLog.append(eventNode);
    });
  }

  function recordEvent(source, message, tone) {
    state.events.unshift({
      source: source,
      message: message,
      tone: tone || "info",
      time: timestamp(),
    });
    renderEvents();
  }

  function requireChannel() {
    if (!state.channel) {
      recordEvent(
        "parent",
        "Channel is not ready yet. Waiting for iframe load.",
        "warn"
      );
      return null;
    }

    return state.channel;
  }

  function currentTheme() {
    return THEMES[state.themeIndex];
  }

  function syncThemeUi() {
    const theme = currentTheme();
    document.documentElement.style.setProperty("--accent", theme.accent);
    byId("current-theme-label").textContent = `${theme.name} (${theme.accent})`;
  }

  function wireChannel(channel) {
    state.channel = channel;
    recordEvent(
      "parent",
      "Parent channel initialized through lazyChannel once iframe loaded.",
      "ok"
    );

    channel.listen("child-status", function (message) {
      const status = `${message.payload.kind}: ${message.payload.text}`;
      byId("last-child-status").textContent = status;
      recordEvent("parent", `Received child status -> ${status}`, "ok");
    });

    channel.respond("get-host-theme", async function () {
      const theme = currentTheme();
      recordEvent(
        "parent",
        `Iframe requested host theme. Responding with ${theme.name}.`,
        "info"
      );
      return theme;
    });

    channel.send("parent-notify", {
      text: "Parent channel is live. This was sent after lazy init.",
    });
    recordEvent("parent", "Sent initial one-way notice to iframe.", "info");
  }

  function setupChildEventBridge() {
    window.addEventListener("message", function (event) {
      const data = event.data;

      if (!data || data[DEMO_LOG_KEY] !== true || !data.entry) {
        return;
      }

      recordEvent("child", data.entry.message, data.entry.tone || "info");
    });
  }

  function setupLazyChannel() {
    const iframe = byId("demo-frame");
    const pendingChannel = frameport.lazyChannel({
      id: CHANNEL_ID,
      availableMessages: MESSAGE_NAMES,
    });

    pendingChannel.onInit(wireChannel);

    iframe.addEventListener("load", function () {
      if (state.channel || !iframe.contentWindow) {
        return;
      }

      pendingChannel.init(
        frameport.defaultIFrameGateway({
          currentWindow: window,
          targetWindow: iframe.contentWindow,
        })
      );
    });
  }

  function setupEventControls() {
    ["both", "parent", "child"].forEach(function (filterName) {
      byId(`filter-${filterName}-button`).addEventListener(
        "click",
        function () {
          state.eventFilter = filterName;

          ["both", "parent", "child"].forEach(function (name) {
            byId(`filter-${name}-button`).classList.toggle(
              "is-active",
              name === filterName
            );
          });

          renderEvents();
        }
      );
    });

    byId("clear-events-button").addEventListener("click", function () {
      state.events = [];
      renderEvents();
      recordEvent("parent", "Events cleared from the event column.", "info");
    });
  }

  function setupActions() {
    byId("send-notice-button").addEventListener("click", function () {
      const channel = requireChannel();
      if (!channel) {
        return;
      }

      state.noticeCount += 1;
      const text = `Manual notice #${state.noticeCount} from the parent.`;
      channel.send("parent-notify", { text: text });
      recordEvent("parent", `Sent parent-notify -> ${text}`, "info");
    });

    byId("request-profile-button").addEventListener("click", async function () {
      const channel = requireChannel();
      if (!channel) {
        return;
      }

      const userId = state.requestedUserId;
      state.requestedUserId += 1;
      recordEvent(
        "parent",
        `Requesting profile for user ${userId} from iframe...`,
        "info"
      );

      try {
        const response = await channel.request(
          "get-profile",
          { timeout: 2000 },
          { userId: userId }
        );
        const profile = response.payload;
        byId(
          "last-profile-result"
        ).textContent = `${profile.name}, ${profile.role}`;
        recordEvent(
          "parent",
          `Received iframe profile -> ${profile.name} (${profile.role})`,
          "ok"
        );
      } catch (error) {
        recordEvent(
          "parent",
          `Profile request failed -> ${JSON.stringify(error)}`,
          "warn"
        );
      }
    });

    byId("cycle-theme-button").addEventListener("click", function () {
      const channel = requireChannel();
      if (!channel) {
        return;
      }

      state.themeIndex = (state.themeIndex + 1) % THEMES.length;
      const theme = currentTheme();
      syncThemeUi();
      channel.send("host-theme-updated", theme);
      recordEvent("parent", `Broadcast new host theme -> ${theme.name}`, "ok");
    });
  }

  function start() {
    highlightCodeBlocks();
    syncThemeUi();
    renderEvents();
    setupChildEventBridge();
    setupEventControls();
    setupLazyChannel();
    setupActions();
    recordEvent(
      "parent",
      "Parent page booted. Waiting for iframe load to initialize the channel.",
      "info"
    );
  }

  window.addEventListener("DOMContentLoaded", start);
})();
