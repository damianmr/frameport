import type {
  ChannelConfigHandlers,
  ChannelMessage,
  WindowMessageHandler,
} from "./windowChannel";

/**
 * A works-out-of-the-box implementation of the gateway needed by a `Channel`
 * that creates the proper methods using two window objects: the current window
 * and the target window.
 *
 * The current window is just the `window` Javascript object present everywhere.
 * The target window is the result of accessing the property `contentWindow` in any
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
export default function defaultIFrameGateway({
  currentWindow,
  targetWindow,
}: {
  currentWindow: Window;
  targetWindow: Window;
}): ChannelConfigHandlers {
  return {
    postMessage: (message: ChannelMessage<unknown>) => {
      targetWindow.postMessage(message, "*");
    },

    addEventListener: (windowMessageHandler: WindowMessageHandler) => {
      currentWindow.addEventListener("message", windowMessageHandler);
    },

    removeEventListener: (windowMessageHandler: WindowMessageHandler) => {
      currentWindow.removeEventListener("message", windowMessageHandler);
    },

    setTimeout: currentWindow.setTimeout.bind(currentWindow),

    clearTimeout: currentWindow.clearTimeout.bind(currentWindow),
  };
}
