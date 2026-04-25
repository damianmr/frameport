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

  const USER_PROFILES = [
    { name: "Ada Lovelace", role: "analysis engine operator" },
    { name: "Grace Hopper", role: "compiler wrangler" },
    { name: "Margaret Hamilton", role: "guidance software lead" },
    { name: "Radia Perlman", role: "network pathfinder" },
  ];

  const THEME_CLASS_BY_NAME = {
    midnight: "theme-midnight",
    sunset: "theme-sunset",
    forest: "theme-forest",
  };

  const state = {
    statusCount: 0,
    theme: { name: "midnight", accent: "#7c8cff" },
  };

  function byId(id) {
    return document.getElementById(id);
  }

  function sleep(ms) {
    return new Promise(function (resolve) {
      window.setTimeout(resolve, ms);
    });
  }

  function log(message, tone) {
    if (window.parent && window.parent !== window) {
      window.parent.postMessage(
        {
          [DEMO_LOG_KEY]: true,
          entry: {
            message: message,
            tone: tone || "info",
          },
        },
        "*"
      );
    }
  }

  function applyTheme(theme) {
    const childShell = byId("child-shell");

    state.theme = theme;
    Object.values(THEME_CLASS_BY_NAME).forEach(function (className) {
      childShell.classList.remove(className);
    });

    childShell.classList.add(
      THEME_CLASS_BY_NAME[theme.name] || "theme-midnight"
    );
    childShell.style.setProperty("--child-accent", theme.accent);
    byId("child-theme-status").textContent = `theme: ${theme.name}`;
    byId("latest-host-theme").textContent = `${theme.name} (${theme.accent})`;
  }

  function createChildChannel() {
    return frameport.createChannel({
      id: CHANNEL_ID,
      availableMessages: MESSAGE_NAMES,
      postMessage: function (message) {
        window.parent.postMessage(message, "*");
      },
      addEventListener: function (windowMessageHandler) {
        window.addEventListener("message", windowMessageHandler);
      },
      removeEventListener: function (windowMessageHandler) {
        window.removeEventListener("message", windowMessageHandler);
      },
      setTimeout: window.setTimeout.bind(window),
      clearTimeout: window.clearTimeout.bind(window),
    });
  }

  function sendStatus(channel, kind, text) {
    channel.send("child-status", { kind: kind, text: text });
    log(`Sent child-status -> ${kind}: ${text}`, "info");
  }

  function setupChannel(channel) {
    channel.listen("parent-notify", function (message) {
      byId("parent-notice-status").textContent = message.payload.text;
      log(`Received parent-notify -> ${message.payload.text}`, "ok");
    });

    channel.listen("host-theme-updated", function (message) {
      applyTheme(message.payload);
      log(`Received host-theme-updated -> ${message.payload.name}`, "ok");
    });

    channel.respond("get-profile", async function (requestPayload) {
      const profile =
        USER_PROFILES[requestPayload.userId % USER_PROFILES.length];
      byId("last-requested-user").textContent = String(requestPayload.userId);
      log(
        `Received get-profile request for user ${requestPayload.userId}`,
        "info"
      );
      await sleep(350);
      return {
        id: requestPayload.userId,
        name: profile.name,
        role: profile.role,
      };
    });

    byId("send-status-button").addEventListener("click", function () {
      state.statusCount += 1;
      sendStatus(channel, "manual", `Button click #${state.statusCount}`);
    });

    byId("request-host-theme-button").addEventListener(
      "click",
      async function () {
        log("Requesting the current host theme from parent...", "info");

        try {
          const response = await channel.request("get-host-theme", {
            timeout: 2000,
          });
          applyTheme(response.payload);
          log(`Received host theme response -> ${response.payload.name}`, "ok");
        } catch (error) {
          log(`Theme request failed -> ${JSON.stringify(error)}`, "warn");
        }
      }
    );

    window.setTimeout(function () {
      sendStatus(channel, "boot", "Iframe is ready and listening.");
    }, 300);
  }

  function start() {
    applyTheme(state.theme);
    setupChannel(createChildChannel());
    log("Iframe page booted and channel created.", "info");
  }

  window.addEventListener("DOMContentLoaded", start);
})();
