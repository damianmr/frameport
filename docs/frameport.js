"use strict";
var frameport = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __getOwnPropSymbols = Object.getOwnPropertySymbols;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __propIsEnum = Object.prototype.propertyIsEnumerable;
  var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
  var __spreadValues = (a, b) => {
    for (var prop in b ||= {})
      if (__hasOwnProp.call(b, prop))
        __defNormalProp(a, prop, b[prop]);
    if (__getOwnPropSymbols)
      for (var prop of __getOwnPropSymbols(b)) {
        if (__propIsEnum.call(b, prop))
          __defNormalProp(a, prop, b[prop]);
      }
    return a;
  };
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
  var __async = (__this, __arguments, generator) => {
    return new Promise((resolve, reject) => {
      var fulfilled = (value) => {
        try {
          step(generator.next(value));
        } catch (e) {
          reject(e);
        }
      };
      var rejected = (value) => {
        try {
          step(generator.throw(value));
        } catch (e) {
          reject(e);
        }
      };
      var step = (x) => x.done ? resolve(x.value) : Promise.resolve(x.value).then(fulfilled, rejected);
      step((generator = generator.apply(__this, __arguments)).next());
    });
  };

  // src/index.ts
  var src_exports = {};
  __export(src_exports, {
    createChannel: () => createChannel,
    defaultIFrameGateway: () => defaultIFrameGateway,
    lazyChannel: () => lazyChannel
  });

  // src/defaultIFrameGateway.ts
  function defaultIFrameGateway({
    currentWindow,
    targetWindow
  }) {
    return {
      postMessage: (message) => {
        targetWindow.postMessage(message, "*");
      },
      addEventListener: (windowMessageHandler) => {
        currentWindow.addEventListener("message", windowMessageHandler);
      },
      removeEventListener: (windowMessageHandler) => {
        currentWindow.removeEventListener("message", windowMessageHandler);
      },
      setTimeout: currentWindow.setTimeout.bind(currentWindow),
      clearTimeout: currentWindow.clearTimeout.bind(currentWindow)
    };
  }

  // src/windowChannel.ts
  function getRequestIdGenerator() {
    let n = 1;
    return () => `req${n++}`;
  }
  function createChannel(config) {
    const genId = getRequestIdGenerator();
    function validateMessageName(messageName) {
      if (!config.availableMessages.includes(messageName)) {
        throw new Error(
          `Unknown message "${messageName}" to send/listen in channel "${config.id}"`
        );
      }
    }
    function buildIncomingMessageHandler(messageName, handler) {
      return function incomingMessageHandler(rawWindowMessageEvent) {
        const channelMessageMaybe = rawWindowMessageEvent.data || {};
        let isChannelMessage = false;
        try {
          isChannelMessage = ["channelId", "messageName", "payload"].every(
            (m) => m in channelMessageMaybe
          );
        } catch (e) {
          return;
        }
        if (!isChannelMessage) {
          return;
        }
        const isForThisChannel = channelMessageMaybe.channelId === config.id && channelMessageMaybe.messageName === messageName;
        if (isForThisChannel) {
          handler(channelMessageMaybe);
        }
      };
    }
    return {
      respond(messageName, handleRequest) {
        validateMessageName(messageName);
        return this.listen(
          messageName,
          (incomingMessage) => __async(this, null, function* () {
            const responsePayload = yield handleRequest(
              incomingMessage.payload
            );
            this.send(
              messageName,
              responsePayload,
              incomingMessage.requestId
            );
          })
        );
      },
      send: (messageName, payload, requestId) => {
        validateMessageName(messageName);
        config.postMessage({
          channelId: config.id,
          messageName,
          requestId,
          payload: payload ? payload : null
        });
      },
      listen: (messageName, handler) => {
        validateMessageName(messageName);
        const windowEventHandler = buildIncomingMessageHandler(
          messageName,
          handler
        );
        const removeListener = () => {
          config.removeEventListener(windowEventHandler);
        };
        config.addEventListener(windowEventHandler);
        return removeListener;
      },
      request: function(messageName, requestConfig, payload) {
        validateMessageName(messageName);
        return new Promise((resolve, reject) => {
          const requestId = genId();
          let timeoutId = -1;
          const requestResponseHandler = buildIncomingMessageHandler(
            messageName,
            (channelMessage) => {
              if (channelMessage.requestId && channelMessage.requestId === requestId) {
                config.clearTimeout(timeoutId);
                config.removeEventListener(requestResponseHandler);
                resolve(channelMessage);
              }
            }
          );
          config.addEventListener(requestResponseHandler);
          timeoutId = config.setTimeout(() => {
            reject({
              status: "timeout",
              messageName,
              requestId,
              channelId: config.id,
              payload: payload || null
            });
            config.removeEventListener(requestResponseHandler);
          }, requestConfig.timeout);
          config.postMessage({
            channelId: config.id,
            messageName,
            requestId,
            payload: payload ? payload : null
          });
        });
      }
    };
  }

  // src/lazyChannel.ts
  function lazyChannel(partialConfig) {
    const listeners = [];
    return {
      init: (config) => {
        const windowChannel = createChannel(__spreadValues(__spreadValues({}, partialConfig), config));
        const runAsync = new Promise((resolve) => resolve());
        runAsync.then(() => {
          for (const handler of listeners) {
            handler(windowChannel);
          }
        });
        return windowChannel;
      },
      onInit: (handler) => {
        listeners.push(handler);
      }
    };
  }
  return __toCommonJS(src_exports);
})();
