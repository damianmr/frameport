import createChannel, { ChannelConfig, Channel } from "./windowChannel";

export type PartialConfig = Pick<ChannelConfig, "id" | "availableMessages">;

type OnInitCallback = (initializedChannel: Channel) => void;

/**
 * A Lazy Channel is a Channel whose config is only partially provided.
 *
 * The methods that allow communication with another window are provided
 * later, allowing you to subscribe to the 'init' event and start listening
 * to events once the channel has been initialized.
 */
export type LazyChannel = {
  init: (
    config: Pick<
      ChannelConfig,
      | "postMessage"
      | "addEventListener"
      | "removeEventListener"
      | "setTimeout"
      | "clearTimeout"
    >
  ) => Channel;
  onInit: (onInitCallback: OnInitCallback) => void;
};

export default function lazyChannel(partialConfig: PartialConfig): LazyChannel {
  const listeners: OnInitCallback[] = [];

  return {
    init: (config): Channel => {
      const windowChannel = createChannel({ ...partialConfig, ...config });
      const runAsync = new Promise<void>((resolve) => resolve());
      runAsync.then(() => {
        for (const handler of listeners) {
          handler(windowChannel);
        }
      });
      return windowChannel;
    },

    onInit: (handler) => {
      listeners.push(handler);
    },
  };
}
