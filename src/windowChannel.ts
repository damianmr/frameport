function getRequestIdGenerator() {
  let n = 1;
  return (): string => `req${n++}`;
}

export type ChannelMessage<Payload> = {
  channelId: string;
  messageName: string;
  payload: Payload;
  requestId?: string;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type MessageEventWithData = MessageEvent & { data: ChannelMessage<any> };
export type WindowMessageHandler = (windowMessage: MessageEventWithData) => void;

export type ChannelMessageHandler<Payload> = (message: ChannelMessage<Payload>) => void;

export type RemoveListenerFunction = () => void;

export type ChannelConfig = {
  id: string;
  availableMessages: string[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  postMessage: (message: ChannelMessage<any>) => void;
  addEventListener: (windowMessageHandler: WindowMessageHandler) => void;
  removeEventListener: (windowMessageHandler: WindowMessageHandler) => void;
  setTimeout: (handler: Function, timeout?: number) => number;
  clearTimeout: (handle: number) => void;
};

export type RequestConfig = {
  timeout: number;
};

export type Channel = {
  /**
   * Allows the channel to respond to certain request made by the target window.
   *
   * It assumes that the message coming from the target window has a `requestId`, which
   * is automatically created when the target uses the `#request` method. If the
   * target runs a `#send` instead, then that message won't have any `requestId` and
   * this handler will be unable to respond properly.
   *
   * In summary, to be able to use this method in a certain `messageName` then you need
   * to make sure the client will always perform a `request` to it. If you can't make sure
   * of this, then use `#listen` here and check if you received a `requestId` before responding
   * with a `#post`.
   */
  respond: <RequestPayload, ResponsePayload>(
    messageName: string,
    handleRequest: (incomingRequestPayload: RequestPayload) => Promise<ResponsePayload>
  ) => RemoveListenerFunction;

  /**
   * Sends a message to the target window. The target window must be listening this message
   * for this to work.
   *
   * The `requestId` is provided automatically when you perform a `#request`, you shouldn't try
   * to use it directly.
   */
  send: <Payload>(messageName: string, payload?: Payload, requestId?: string) => void;

  /**
   * Makes this channel listen to a certain message posted in the current window object.
   * Returns a function that can be used to stop listening to `messageName`.
   */
  listen: <Payload>(
    messageName: string,
    handler: (message: ChannelMessage<Payload>) => void
  ) => RemoveListenerFunction;

  /**
   * Performs a `#post` with a `requestId` that the target channel must use to reply within
   * certain time frame, or a timeout rejection will be executed by this method.
   *
   * If certain `message` is expected to behave always like an "API endpoint" it is a good idea
   * to use `#responds` in the target channel so that it handles the `requestId` automatically.
   */
  request: <RequestPayload, ResponsePayload>(
    messageName: string,
    requestConfig: RequestConfig,
    payload?: RequestPayload
  ) => Promise<ChannelMessage<ResponsePayload>>;
};

/**
 * Creates a communication channel using the given config.
 *
 * The channel uses the config to listen to messages in the
 * current window and to post messages to the target window. It also
 * provides the #setTimeout and #clearTimeout methods.
 */
export default function createChannel(config: ChannelConfig): Channel {
  const genId = getRequestIdGenerator();

  function validateMessageName(messageName: string) {
    if (!config.availableMessages.includes(messageName)) {
      throw new Error(`Unknown message "${messageName}" to send/listen in channel "${config.id}"`);
    }
  }

  /**
   * Every handler received by the #listen method is wrapped with this handler function.
   *
   * The handler function will run everytime a message is posted to this window.
   *
   * The handler will discard messages not intended for this channel
   * and also messages coming from a different iframe other than the one this module is
   * interested in.
   */
  function buildIncomingMessageHandler<Payload>(
    messageName: string,
    handler: ChannelMessageHandler<Payload>
  ): WindowMessageHandler {
    return function incomingMessageHandler(rawWindowMessageEvent: MessageEventWithData) {
      const channelMessageMaybe: ChannelMessage<Payload> = rawWindowMessageEvent.data || {};
      // We need to make sure the data is relevant to the channel. It might be a message coming
      // from an ad-service, a tracking script, etc. Those will have different properties in the
      // `data` member.
      let isChannelMessage = false;
      try {
        isChannelMessage = ['channelId', 'messageName', 'payload'].every(
          (m) => m in channelMessageMaybe
        );
      } catch {
        // The 'in' operator might fail miserable if the object is a string or something weird.
        return;
      }

      if (!isChannelMessage) {
        return;
      }

      const isForThisChannel =
        channelMessageMaybe.channelId === config.id &&
        channelMessageMaybe.messageName === messageName;
      if (isForThisChannel) {
        handler(channelMessageMaybe as ChannelMessage<Payload>);
      }
    };
  }

  return {
    respond<RequestPayload, ResponsePayload>(
      messageName: string,
      handleRequest: (incomingRequestPayload: RequestPayload) => Promise<ResponsePayload>
    ) {
      validateMessageName(messageName);

      return this.listen<RequestPayload>(messageName, async (incomingMessage) => {
        const responsePayload: ResponsePayload = await handleRequest(incomingMessage.payload);
        this.send<ResponsePayload>(messageName, responsePayload, incomingMessage.requestId);
      });
    },

    send: <Payload>(messageName: string, payload?: Payload, requestId?: string) => {
      validateMessageName(messageName);
      config.postMessage({
        channelId: config.id,
        messageName,
        requestId: requestId,
        payload: payload ? payload : null
      });
    },

    listen: <Payload>(messageName: string, handler: (message: ChannelMessage<Payload>) => void) => {
      validateMessageName(messageName);
      const windowEventHandler = buildIncomingMessageHandler<Payload>(messageName, handler);
      const removeListener = () => {
        config.removeEventListener(windowEventHandler);
      };
      config.addEventListener(windowEventHandler);
      return removeListener;
    },

    request: function<RequestPayload, ResponsePayload>(
      messageName: string,
      requestConfig: RequestConfig,
      payload?: RequestPayload
    ): Promise<ChannelMessage<ResponsePayload>> {
      validateMessageName(messageName);
      return new Promise((resolve, reject) => {
        const requestId = genId();
        let timeoutId = -1;
        const requestResponseHandler = buildIncomingMessageHandler<ResponsePayload>(
          messageName,
          (channelMessage: ChannelMessage<ResponsePayload>) => {
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
            status: 'timeout',
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

/**
 * A works-out-of-the-box implementation of the gateway needed by a `Channel`
 * that creates the proper methods using two window objects: the current window
 * and the target window.
 *
 * The current window is just the `window` Javascript object present everywhere.
 * Thet target window is the result of accesing the property `contentWindow` in any
 * <iframe> element.
 *
 * A good way to get a reference of the target window is to setup an `onload` handler
 * in the iframe tag. Something like this:
 *
 * window.handleLoad = (theIframe) => {
 *   const targetWindow = theIframe.contentWindow;
 *   // now store this reference somewhere and pass it to this method.
 * }
 *
 * <iframe onload="handleLoad(this)" src="..."></iframe>
 */
export function defaultIFrameGateway({
  currentWindow,
  targetWindow
}: {
  currentWindow: Window;
  targetWindow: Window;
}) {
  return {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    postMessage: (message: ChannelMessage<any>) => {
      targetWindow.postMessage(message, '*');
    },

    addEventListener: (windowMessageHandler: WindowMessageHandler) => {
      currentWindow.addEventListener('message', windowMessageHandler);
    },

    removeEventListener: (windowMessageHandler: WindowMessageHandler) => {
      currentWindow.removeEventListener('message', windowMessageHandler);
    },

    setTimeout: currentWindow.setTimeout.bind(currentWindow),

    clearTimeout: currentWindow.clearTimeout.bind(currentWindow)
  };
}
