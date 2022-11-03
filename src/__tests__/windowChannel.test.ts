import {
  default as createChannel,
  ChannelMessage,
  WindowMessageHandler,
} from "../windowChannel";
import { TinyEmitter } from "tiny-emitter";
import { describe, it, expect, vi } from "vitest";

async function sleep(n: number): Promise<void> {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, n);
  });
}

function pubSubContext() {
  const emitter = new TinyEmitter();

  return {
    // only for tests in which the types defined for #post, #listen and #unlisten generate errors.
    // Use it to overcome the defined public interface and emit messages without type checking.
    __instance: emitter,

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    post: (message: ChannelMessage<any>) => {
      // Simulates an async window.postMessage(message);
      setTimeout(() => {
        // Sending the message as part of the `data` property is important, as that's
        // the name of property the `windowChannel` relies on to handle channel events.
        // It is part of MessageEvent DOM interface.
        emitter.emit("message", { data: message });
      }, 1);
    },
    listen: (windowMessageHandler: WindowMessageHandler) => {
      emitter.on("message", windowMessageHandler);
    },

    unlisten: (windowMessageHandler: WindowMessageHandler) => {
      emitter.off("message", windowMessageHandler);
    },
  };
}

describe("windowChannel", () => {
  describe("pubSubContext", () => {
    it("tests the mocked postMessage/listen interface", async () => {
      const ctx = pubSubContext();

      type P = {
        payloadProp: string;
        anotherProp: string;
      };

      ctx.listen(({ data }) => {
        const { channelId, messageName, payload }: ChannelMessage<P> = data;
        expect(channelId).toEqual("testChannel");
        expect(messageName).toEqual("testMessage");
        expect(payload).toMatchObject({
          payloadProp: "1",
          anotherProp: "2",
        });
      });

      ctx.post({
        channelId: "testChannel",
        messageName: "testMessage",
        payload: {
          payloadProp: "1",
          anotherProp: "2",
        },
      });
    });
  });

  describe("#listen and #send behavior", () => {
    it("calls the listeners handlers properly", async () => {
      const pubSub = pubSubContext();

      const channel = createChannel({
        id: "mockChannel",
        availableMessages: ["mockMessage"],
        postMessage: pubSub.post,
        addEventListener: pubSub.listen,
        removeEventListener: pubSub.unlisten,
        setTimeout: vi.fn(),
        clearTimeout: vi.fn(),
      });

      channel.listen(
        "mockMessage",
        (message: ChannelMessage<{ dummy: string; value: string }>) => {
          expect(message.channelId).toEqual("mockChannel");
          expect(message.messageName).toEqual("mockMessage");
          expect(message.payload).toMatchObject({
            dummy: "dummy",
            value: "value",
          });
        }
      );

      channel.send("mockMessage", { dummy: "dummy", value: "value" });
    });

    it("handles undefined payloads just fine", () => {
      const pubSub = pubSubContext();

      const channel = createChannel({
        id: "mockChannel",
        availableMessages: ["mockMessage"],
        postMessage: pubSub.post,
        addEventListener: pubSub.listen,
        removeEventListener: pubSub.unlisten,
        setTimeout: vi.fn(),
        clearTimeout: vi.fn(),
      });

      channel.listen("mockMessage", (message: ChannelMessage<undefined>) => {
        expect(message.channelId).toEqual("mockChannel");
        expect(message.messageName).toEqual("mockMessage");
        expect(message.payload).toBeNull();
      });

      channel.send("mockMessage");
    });
  });

  describe("API", () => {
    it("calls #postMessage with proper params (eg: the request starts)", () => {
      const postStub = vi.fn();
      const listenStub = vi.fn();

      const channel = createChannel({
        id: "mockChannel",
        availableMessages: ["mockRequest"],
        postMessage: postStub,
        addEventListener: listenStub,
        removeEventListener: vi.fn(),
        setTimeout: vi.fn(),
        clearTimeout: vi.fn(),
      });

      // we are not 'awaiting' for response here. It is on purpose not to block
      // the execution.
      channel.request<{ userId: number }, { userId: string; userName: string }>(
        "mockRequest",
        { timeout: 100 },
        { userId: 666 }
      );

      expect(postStub).toHaveBeenCalledTimes(1);
      expect(postStub).toHaveBeenCalledWith({
        requestId: "req1",
        messageName: "mockRequest",
        channelId: "mockChannel",
        payload: { userId: 666 },
      });
    });

    it("setups a listener for the request's response and its called properly", async () => {
      const REQUEST_TIMEOUT = 100;

      const pubSub = pubSubContext();
      const postStub = vi.fn();

      const channel = createChannel({
        id: "mockChannel",
        availableMessages: ["mockRequest"],
        postMessage: postStub,
        addEventListener: pubSub.listen,
        removeEventListener: pubSub.unlisten,
        setTimeout: setTimeout,
        clearTimeout: clearTimeout,
      });

      setTimeout(() => {
        // Simulates an incoming response.
        pubSub.post({
          channelId: "mockChannel",
          messageName: "mockRequest",
          requestId: "req1",
          payload: {
            userName: "dummyUser",
            userId: 666,
            extraData: "*",
          },
        });
      }, REQUEST_TIMEOUT / 2);

      type MockResponse = {
        userId: number;
        userName: string;
        extraData: string;
      };

      type MockRequest = {
        userId: number;
      };

      const response = await channel.request<MockRequest, MockResponse>(
        "mockRequest",
        { timeout: REQUEST_TIMEOUT },
        { userId: 666 }
      );

      expect(response.channelId).toEqual("mockChannel");
      expect(response.messageName).toEqual("mockRequest");
      expect(response.requestId).toEqual("req1");
      expect(response.payload.userId).toEqual(666);
      expect(response.payload.userName).toEqual("dummyUser");
      expect(response.payload.extraData).toEqual("*");
    });

    it("removes the handler for the request's response once it finished", async () => {
      const REQUEST_TIMEOUT = 100;

      const pubSub = pubSubContext();
      const postStub = vi.fn();
      const unlistenStub = vi.fn();

      const aux: { windowMessageHandler: WindowMessageHandler | null } = {
        windowMessageHandler: null,
      };

      const listenWrap = (windowMessageHandler: WindowMessageHandler) => {
        aux.windowMessageHandler = windowMessageHandler;
        pubSub.listen(windowMessageHandler);
      };

      const channel = createChannel({
        id: "mockChannel",
        availableMessages: ["mockRequest"],
        postMessage: postStub,
        addEventListener: listenWrap,
        removeEventListener: unlistenStub,
        setTimeout: setTimeout,
        clearTimeout: clearTimeout,
      });

      setTimeout(() => {
        // Simulates an incoming response.
        pubSub.post({
          channelId: "mockChannel",
          messageName: "mockRequest",
          requestId: "req1",
          payload: {
            userName: "dummyUser",
            userId: 666,
            extraData: "*",
          },
        });
      }, REQUEST_TIMEOUT / 2);

      type MockResponse = {
        extraData: string;
      };

      type MockRequest = {
        userId: number;
      };

      await channel.request<MockRequest, MockResponse>(
        "mockRequest",
        { timeout: REQUEST_TIMEOUT },
        { userId: 666 }
      );

      expect(unlistenStub).toHaveBeenCalledTimes(1);
      expect(unlistenStub).toHaveBeenCalledWith(aux.windowMessageHandler);
    });

    it("removes the timeout for the request's response once it succeded", async () => {
      const REQUEST_TIMEOUT = 100;

      const pubSub = pubSubContext();

      const setTimeoutStub = vi.fn(() => 666);
      const clearTimeoutStub = vi.fn();

      const channel = createChannel({
        id: "mockChannel",
        availableMessages: ["mockRequest"],
        postMessage: vi.fn(),
        addEventListener: pubSub.listen,
        removeEventListener: vi.fn(),
        setTimeout: setTimeoutStub,
        clearTimeout: clearTimeoutStub,
      });

      setTimeout(() => {
        // Simulates an incoming response.
        pubSub.post({
          channelId: "mockChannel",
          messageName: "mockRequest",
          requestId: "req1",
          payload: {
            userName: "dummyUser",
            userId: 666,
            extraData: "*",
          },
        });
      }, REQUEST_TIMEOUT / 2);

      type MockResponse = {
        extraData: string;
      };

      type MockRequest = {
        userId: number;
      };

      await channel.request<MockRequest, MockResponse>(
        "mockRequest",
        { timeout: REQUEST_TIMEOUT },
        { userId: 0 }
      );

      expect(clearTimeoutStub).toHaveBeenCalledTimes(1);
      expect(clearTimeoutStub).toHaveBeenCalledWith(666);
    });

    it("expires after the timeout period", async () => {
      const REQUEST_TIMEOUT = 10;

      const pubSub = pubSubContext();
      const postStub = vi.fn();
      const unlistenStub = vi.fn();

      const aux: { windowMessageHandler: WindowMessageHandler | null } = {
        windowMessageHandler: null,
      };

      const listenWrap = (windowMessageHandler: WindowMessageHandler) => {
        aux.windowMessageHandler = windowMessageHandler;
        pubSub.listen(windowMessageHandler);
      };

      const channel = createChannel({
        id: "mockChannel",
        availableMessages: ["mockRequest"],
        postMessage: postStub,
        addEventListener: listenWrap,
        removeEventListener: unlistenStub,
        setTimeout: setTimeout,
        clearTimeout: clearTimeout,
      });

      setTimeout(() => {
        // Simulates an incoming response with a delay longer than the timeout period.
        pubSub.post({
          channelId: "mockChannel",
          messageName: "mockRequest",
          requestId: "req1",
          payload: {
            userName: "dummyUser",
            userId: 666,
            extraData: "*",
          },
        });
      }, REQUEST_TIMEOUT * 2);

      type MockResponse = {
        extraData: string;
      };

      type MockRequest = {
        userId: number;
      };

      try {
        await channel.request<MockRequest, MockResponse>(
          "mockRequest",
          { timeout: REQUEST_TIMEOUT },
          { userId: 666 }
        );
      } catch (e) {
        expect(e).toEqual({
          status: "timeout",
          payload: { userId: 666 },
          channelId: "mockChannel",
          messageName: "mockRequest",
          requestId: "req1",
        });
      }

      expect(unlistenStub).toHaveBeenCalledTimes(1);
      expect(unlistenStub).toHaveBeenCalledWith(aux.windowMessageHandler);
    });

    it("throws when posting/listening-to/requesting/responding-to an unknown message", () => {
      const channel = createChannel({
        id: "mockChannel",
        availableMessages: [],
        postMessage: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        setTimeout: vi.fn(),
        clearTimeout: vi.fn(),
      });

      expect(() => {
        channel.send("failPost", null);
      }).toThrowError(/Unknown message "failPost"/);

      expect(() => {
        channel.listen("failListen", () => {});
      }).toThrowError(/Unknown message "failListen"/);

      expect(() => {
        channel.request("failRequest", { timeout: 1 }, null);
      }).toThrowError(/Unknown message "failRequest"/);

      expect(() => {
        channel.respond("failRespond", () => Promise.resolve(true));
      }).toThrowError(/Unknown message "failRespond"/);
    });

    it("ignores unknown messages (with props other than the ones defined in #ChannelMessage)", async () => {
      const pubSub = pubSubContext();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let preHandlerThatChecksMessage: vi.Mock<any, any> | null = null;

      const listenStub = (windowMessageHandler: WindowMessageHandler) => {
        preHandlerThatChecksMessage = vi.fn((ev) => windowMessageHandler(ev));
        pubSub.listen(preHandlerThatChecksMessage);
      };

      const channel = createChannel({
        id: "mockChannel",
        availableMessages: ["mockListen"],
        postMessage: vi.fn(),
        addEventListener: listenStub,
        removeEventListener: vi.fn(),
        setTimeout: vi.fn(),
        clearTimeout: vi.fn(),
      });

      const notToBeExecutedFunction = vi.fn();

      // The handler for this 'mockListen' action should never be executed because we will
      // sending invalid messages
      channel.listen("mockListen", notToBeExecutedFunction);

      await sleep(5);

      // Simulate message without data
      pubSub.__instance.emit("message", { data: null });

      await sleep(5);

      // Simulate message without payload (is not a valid message and thus it should not react)
      pubSub.__instance.emit("message", {
        data: { channelId: "mockChannel", messageName: "mockListen" },
      });

      await sleep(5);

      expect(notToBeExecutedFunction).not.toHaveBeenCalled();
      expect(preHandlerThatChecksMessage).toHaveBeenCalledTimes(2);
      expect(preHandlerThatChecksMessage).toHaveBeenNthCalledWith(1, {
        data: null,
      });
      expect(preHandlerThatChecksMessage).toHaveBeenNthCalledWith(2, {
        data: {
          channelId: "mockChannel",
          messageName: "mockListen",
        },
      });
    });

    it.todo(
      "does not crash when the uknown message is a string or value that is not an object"
    ); // analytics scripts usually send string messages through the window.

    it.todo("allows to stop listening a certain message"); // here we use the function returned by #listen

    it.todo("allows to stop responding to requests (#respond)"); // here we use the function returned by #respond

    it("ignores messages going to other channels", async () => {
      const pubSub = pubSubContext();
      let preHandlerThatChecksMessage: any | null = null;
      const listenStub = (windowMessageHandler: WindowMessageHandler) => {
        preHandlerThatChecksMessage = vi.fn((ev) => windowMessageHandler(ev));
        pubSub.listen(preHandlerThatChecksMessage);
      };

      const channel = createChannel({
        id: "mockChannel",
        availableMessages: ["mockListen"],
        postMessage: vi.fn(),
        addEventListener: listenStub,
        removeEventListener: vi.fn(),
        setTimeout: vi.fn(),
        clearTimeout: vi.fn(),
      });

      const notToBeExecutedFunction = vi.fn();

      // The handler for this 'mockListen' action should never be executed because we will
      // sending messages for a different channel
      channel.listen("mockListen", notToBeExecutedFunction);

      pubSub.post({
        channelId: "mockyChannely",
        messageName: "mockListen",
        payload: { pleaseWork: true },
      });

      await sleep(10);

      expect(notToBeExecutedFunction).not.toHaveBeenCalled();
      expect(preHandlerThatChecksMessage).toHaveBeenCalledTimes(1);
      expect(preHandlerThatChecksMessage).toHaveBeenNthCalledWith(1, {
        data: {
          channelId: "mockyChannely",
          messageName: "mockListen",
          payload: { pleaseWork: true },
        },
      });
    });
  });

  describe("creation", () => {
    it("should use provided #postMessage method", async () => {
      const mockPost = vi.fn();

      const channel = createChannel({
        id: "dummy",
        availableMessages: ["msg1", "msg2"],
        postMessage: mockPost,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        setTimeout: vi.fn(),
        clearTimeout: vi.fn(),
      });

      channel.send("msg1", "testPayload");
      await sleep(10);

      expect(mockPost).toHaveBeenCalled();
      expect(mockPost).toHaveBeenCalledWith({
        channelId: "dummy",
        messageName: "msg1",
        payload: "testPayload",
      });
    });

    it("should use provided #addEventListener method", () => {
      const mockAddEventListener = vi.fn();

      const channel = createChannel({
        id: "dummy",
        availableMessages: ["msg1", "msg2"],
        postMessage: vi.fn(),
        addEventListener: mockAddEventListener,
        removeEventListener: vi.fn(),
        setTimeout: vi.fn(),
        clearTimeout: vi.fn(),
      });

      channel.listen("msg1", () => {});

      expect(mockAddEventListener).toHaveBeenCalled();
    });
  });

  describe("cross channels behavior", () => {
    function createTestChannels() {
      const REQUEST_TIMEOUT = 10;

      const pubSubA = pubSubContext();
      const pubSubB = pubSubContext();

      /*
        Note that the channels are created exactly the same with the difference
        that channel-A posts to pubSub-B while listening to pubSub-A and vice-versa.

        This replicates the conditions we would have in two separate window objects.
      */
      const channelA = createChannel({
        id: "mockChannel",
        availableMessages: ["mockRequest"],
        postMessage: pubSubB.post,
        addEventListener: pubSubA.listen,
        removeEventListener: pubSubA.unlisten,
        setTimeout: setTimeout,
        clearTimeout: clearTimeout,
      });

      const channelB = createChannel({
        id: "mockChannel",
        availableMessages: ["mockRequest"],
        postMessage: pubSubA.post,
        addEventListener: pubSubB.listen,
        removeEventListener: pubSubB.unlisten,
        setTimeout: setTimeout,
        clearTimeout: clearTimeout,
      });

      return {
        channelA,
        channelB,
        pubSubA,
        pubSubB,
        REQUEST_TIMEOUT,
      };
    }

    it("makes requests between different channels", async () => {
      const { channelA, channelB, REQUEST_TIMEOUT } = createTestChannels();

      type MockResponse = {
        userName: string;
      };

      type MockRequest = {
        userId: number;
      };

      channelB.listen<MockRequest>("mockRequest", (incomingMsg) => {
        expect(incomingMsg.channelId).toEqual("mockChannel");
        expect(incomingMsg.messageName).toEqual("mockRequest");
        expect(incomingMsg.requestId).toEqual("req1");
        expect(incomingMsg.payload.userId).toEqual(666);
        channelB.send(
          "mockRequest",
          { userName: "evil user" },
          incomingMsg.requestId
        );
      });

      const response = await channelA.request<MockRequest, MockResponse>(
        "mockRequest",
        { timeout: REQUEST_TIMEOUT },
        { userId: 666 }
      );

      expect(response.channelId).toEqual("mockChannel");
      expect(response.messageName).toEqual("mockRequest");
      expect(response.requestId).toEqual("req1");
      expect(response.payload.userName).toEqual("evil user");
    });

    it("supports no request params just fine", async () => {
      const { channelA, channelB, REQUEST_TIMEOUT } = createTestChannels();

      type MockResponse = {
        userName: string;
      };

      channelB.listen<null>("mockRequest", (incomingMsg) => {
        expect(incomingMsg.channelId).toEqual("mockChannel");
        expect(incomingMsg.messageName).toEqual("mockRequest");
        expect(incomingMsg.requestId).toEqual("req1");
        expect(incomingMsg.payload).toBeNull();
        channelB.send(
          "mockRequest",
          { userName: "evil user" },
          incomingMsg.requestId
        );
      });

      const response = await channelA.request<null, MockResponse>(
        "mockRequest",
        {
          timeout: REQUEST_TIMEOUT,
        }
      );

      expect(response.channelId).toEqual("mockChannel");
      expect(response.messageName).toEqual("mockRequest");
      expect(response.requestId).toEqual("req1");
      expect(response.payload.userName).toEqual("evil user");
    });

    it("supports no response params just fine", async () => {
      const { channelA, channelB, REQUEST_TIMEOUT } = createTestChannels();

      channelB.listen<null>("mockRequest", (incomingMsg) => {
        expect(incomingMsg.channelId).toEqual("mockChannel");
        expect(incomingMsg.messageName).toEqual("mockRequest");
        expect(incomingMsg.requestId).toEqual("req1");
        expect(incomingMsg.payload).toBeNull();
        channelB.send("mockRequest", null, incomingMsg.requestId);
      });

      const response = await channelA.request<null, null>("mockRequest", {
        timeout: REQUEST_TIMEOUT,
      });

      expect(response.channelId).toEqual("mockChannel");
      expect(response.messageName).toEqual("mockRequest");
      expect(response.requestId).toEqual("req1");
      expect(response.payload).toBeNull();
    });

    it("uses #respond to return responses to incoming requests", async () => {
      const { channelA, channelB, REQUEST_TIMEOUT } = createTestChannels();

      type MockResponse = {
        userName: string;
      };

      type MockRequest = {
        userId: number;
      };

      channelB.respond<MockRequest, MockResponse>(
        "mockRequest",
        (requestPayload) => {
          return new Promise(async (resolve) => {
            expect(requestPayload.userId).toEqual(666);
            await sleep(REQUEST_TIMEOUT / 3);
            resolve({ userName: "evil user 666" });
          });
        }
      );

      const response = await channelA.request<MockRequest, MockResponse>(
        "mockRequest",
        { timeout: REQUEST_TIMEOUT * 3 },
        { userId: 666 }
      );

      expect(response.channelId).toEqual("mockChannel");
      expect(response.messageName).toEqual("mockRequest");
      expect(response.requestId).toEqual("req1");
      expect(response.payload.userName).toEqual("evil user 666");
    });

    it("uses #respond to return responses to incoming requests with null request payload", async () => {
      const { channelA, channelB, REQUEST_TIMEOUT } = createTestChannels();

      type MockResponse = {
        userName: string;
      };

      type MockRequest = null;

      channelB.respond<MockRequest, MockResponse>(
        "mockRequest",
        (requestPayload) => {
          return new Promise(async (resolve) => {
            expect(requestPayload).toBeNull();
            await sleep(REQUEST_TIMEOUT / 3);
            resolve({ userName: "evil user 666" });
          });
        }
      );

      const response = await channelA.request<MockRequest, MockResponse>(
        "mockRequest",
        { timeout: REQUEST_TIMEOUT * 3 },
        null
      );

      expect(response.channelId).toEqual("mockChannel");
      expect(response.messageName).toEqual("mockRequest");
      expect(response.requestId).toEqual("req1");
      expect(response.payload.userName).toEqual("evil user 666");
    });

    it("uses #respond to return responses to incoming requests with null response payload", async () => {
      const { channelA, channelB, REQUEST_TIMEOUT } = createTestChannels();

      type MockResponse = null;

      type MockRequest = {
        userId: number;
      };

      channelB.respond<MockRequest, MockResponse>(
        "mockRequest",
        (requestPayload) => {
          return new Promise(async (resolve) => {
            expect(requestPayload.userId).toBe(666);
            await sleep(REQUEST_TIMEOUT / 3);
            resolve(null);
          });
        }
      );

      const response = await channelA.request<MockRequest, MockResponse>(
        "mockRequest",
        { timeout: REQUEST_TIMEOUT * 3 },
        { userId: 666 }
      );

      expect(response.channelId).toEqual("mockChannel");
      expect(response.messageName).toEqual("mockRequest");
      expect(response.requestId).toEqual("req1");
      expect(response.payload).toBeNull();
    });

    it("uses #respond to return responses to incoming requests with null response and null request payloads", async () => {
      const { channelA, channelB, REQUEST_TIMEOUT } = createTestChannels();

      type MockResponse = null;

      type MockRequest = null;

      channelB.respond<MockRequest, MockResponse>(
        "mockRequest",
        (requestPayload) => {
          return new Promise(async (resolve) => {
            expect(requestPayload).toBeNull();
            await sleep(REQUEST_TIMEOUT / 3);
            resolve(null);
          });
        }
      );

      const response = await channelA.request<MockRequest, MockResponse>(
        "mockRequest",
        { timeout: REQUEST_TIMEOUT * 3 },
        null
      );

      expect(response.channelId).toEqual("mockChannel");
      expect(response.messageName).toEqual("mockRequest");
      expect(response.requestId).toEqual("req1");
      expect(response.payload).toBeNull();
    });
  });
});
