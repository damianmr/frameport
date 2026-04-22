# frameport

Tiny request/response channels for `window.postMessage`.

`frameport` is a small utility for communication between a page and an iframe, or between any two window contexts that can talk through `postMessage`. It wraps raw message passing with a small channel abstraction, message name validation, and request/response helpers that feel closer to an async API call.

## What It Gives You

- named channels with an explicit `channelId`
- `send` / `listen` for one-way messages
- `request` / `respond` for async request-response flows
- per-request timeouts
- a `lazyChannel` helper for setups where the target window is not ready yet

## Why

Using `postMessage` directly works, but the callsites usually become noisy fast:

- you need to agree on message names
- you need to correlate requests and responses
- you need timeout handling
- you need to ignore unrelated messages flying around the window

`frameport` keeps that logic small and reusable.

## Core Concepts

Every message has this shape:

```ts
type ChannelMessage<Payload> = {
  channelId: string;
  messageName: string;
  payload: Payload;
  requestId?: string;
};
```

- `channelId` isolates one channel from another
- `messageName` identifies the action
- `payload` carries the data
- `requestId` is added automatically for `request()` / `respond()` flows

## Quick Start

### Parent Window

```ts
import { createChannel, defaultIFrameGateway } from "frameport";

const iframe = document.querySelector("iframe");

if (!iframe?.contentWindow) {
  throw new Error("Iframe is not ready");
}

const parentChannel = createChannel({
  id: "app-shell",
  availableMessages: ["get-user", "theme-changed"],
  ...defaultIFrameGateway({
    currentWindow: window,
    targetWindow: iframe.contentWindow,
  }),
});

parentChannel.listen("theme-changed", (message) => {
  console.log("iframe theme update", message.payload);
});

const response = await parentChannel.request<
  { userId: number },
  { id: number; name: string }
>("get-user", { timeout: 1500 }, { userId: 42 });

console.log(response.payload.name);
```

### Iframe Window

```ts
import { createChannel, defaultIFrameGateway } from "frameport";

const iframeChannel = createChannel({
  id: "app-shell",
  availableMessages: ["get-user", "theme-changed"],
  ...defaultIFrameGateway({
    currentWindow: window,
    targetWindow: window.parent,
  }),
});

iframeChannel.respond<{ userId: number }, { id: number; name: string }>(
  "get-user",
  async ({ userId }) => {
    return { id: userId, name: "Ada" };
  }
);

iframeChannel.send("theme-changed", { mode: "dark" });
```

## API

### `createChannel(config)`

Creates a channel bound to your message transport.

```ts
const channel = createChannel({
  id: "app-shell",
  availableMessages: ["ping", "get-user"],
  postMessage,
  addEventListener,
  removeEventListener,
  setTimeout,
  clearTimeout,
});
```

Config fields:

- `id`: channel identifier shared by both ends
- `availableMessages`: whitelist of accepted message names
- `postMessage`: transport sender
- `addEventListener`: subscribes to incoming window messages
- `removeEventListener`: unsubscribes from incoming messages
- `setTimeout`: timeout scheduler used by `request`
- `clearTimeout`: timeout cleanup used when a request resolves

### `channel.send(messageName, payload?)`

Sends a one-way message.

```ts
channel.send("ping", { now: Date.now() });
```

### `channel.listen(messageName, handler)`

Listens for one-way or request messages. Returns an unsubscribe function.

```ts
const stop = channel.listen("ping", (message) => {
  console.log(message.payload);
});

stop();
```

### `channel.request(messageName, { timeout }, payload?)`

Sends a request and waits for a response with the same `requestId`.

```ts
const response = await channel.request<{ id: number }, { name: string }>(
  "get-user",
  { timeout: 1000 },
  { id: 1 }
);
```

If the response does not arrive in time, the promise rejects with an object like:

```ts
{
  status: "timeout",
  messageName: "get-user",
  requestId: "req1",
  channelId: "app-shell",
  payload: { id: 1 }
}
```

### `channel.respond(messageName, handler)`

Convenience helper for request-response handlers.

```ts
channel.respond<{ id: number }, { name: string }>(
  "get-user",
  async ({ id }) => {
    return { name: `user-${id}` };
  }
);
```

This assumes callers use `request()`. If a caller uses `send()` instead, there is no `requestId` to answer with.

### `defaultIFrameGateway({ currentWindow, targetWindow })`

Creates the transport handlers for the common iframe case.

```ts
const gateway = defaultIFrameGateway({
  currentWindow: window,
  targetWindow: iframe.contentWindow,
});
```

You can skip this helper and provide your own gateway if you need stricter origin checks or a custom transport.

### `lazyChannel(partialConfig)`

Useful when you know the channel identity up front, but you do not have the real transport yet.

```ts
import { lazyChannel, defaultIFrameGateway } from "frameport";

const pendingChannel = lazyChannel({
  id: "app-shell",
  availableMessages: ["ready", "get-user"],
});

pendingChannel.onInit((channel) => {
  channel.listen("ready", () => {
    console.log("iframe connected");
  });
});

iframe.addEventListener("load", () => {
  if (!iframe.contentWindow) {
    return;
  }

  pendingChannel.init(
    defaultIFrameGateway({
      currentWindow: window,
      targetWindow: iframe.contentWindow,
    })
  );
});
```

## Notes

### Message Validation

`frameport` ignores window messages that do not look like channel messages, and throws if you try to use a `messageName` that is not listed in `availableMessages`.

### Security

The built-in `defaultIFrameGateway()` uses `targetWindow.postMessage(message, "*")` for convenience.

That is fine for controlled environments, but it is not a security boundary.

If you need stricter guarantees, provide your own transport functions and validate things like:

- `event.origin`
- `event.source`
- allowed target origin in `postMessage`

### Null Payloads

When no payload is provided, the library normalizes it to `null` on the wire.

## Development

```bash
npm install
npm test
./node_modules/.bin/tsc --noEmit
```
