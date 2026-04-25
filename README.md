# frameport

Turn `postMessage` into real request/response workflows.

`frameport` is a zero-dependency library for communication between a page and an iframe, or between any two window contexts that can talk through `postMessage`. It wraps raw browser messaging in a small channel API so you can move real behavior between windows without re-solving message names, reply handling, timeout behavior, and late iframe startup every time.

## What It Solves

`frameport` is a good fit when you want to:

- keep parent and iframe in sync with one-way updates such as theme changes, ready signals, or host state
- ask the other side for data and treat the interaction more like a small async API call
- prepare the communication flow early and connect it once the embedded window becomes available

## What It Gives You

- named channels with an explicit `channelId`
- `send` / `listen` for one-way messages
- `request` / `respond` for async request-response flows
- per-request timeouts
- a default iframe gateway for `window` + `contentWindow`
- a `lazyChannel` helper for setups where the target window is not ready yet

## Installation

```bash
npm install frameport
```

## Importing

### ESM

```ts
import { createChannel, defaultIFrameGateway, lazyChannel } from "frameport";
```

### CommonJS

```js
const {
  createChannel,
  defaultIFrameGateway,
  lazyChannel,
} = require("frameport");
```

There is no API difference between `import` and `require`; the package ships both ESM and CommonJS builds.

### Raw TypeScript source

```ts
import {
  createChannel,
  defaultIFrameGateway,
  lazyChannel,
} from "frameport/source";
```

The `frameport/source` entry is only for toolchains that can consume `.ts` files directly. For normal npm usage, prefer the default `frameport` entry.

## Quickstart

Use the same `id` and the same `availableMessages` on both sides.

### Parent side HTML

```html
<!DOCTYPE html>
<html>
  <body>
    <iframe id="quickstart-frame" src="./child.html"></iframe>

    <script src="./frameport.js"></script>
    <script src="./parent.js"></script>
  </body>
</html>
```

### Iframe side HTML

```html
<!DOCTYPE html>
<html>
  <body>
    <div>Iframe page UI</div>

    <script src="./frameport.js"></script>
    <script src="./child.js"></script>
  </body>
</html>
```

### `parent.js`

```ts
const iframe = document.getElementById("quickstart-frame");

const pendingChannel = frameport.lazyChannel({
  id: "quickstart-demo",
  availableMessages: ["child-ready", "get-answer"],
});

pendingChannel.onInit(async function (channel) {
  channel.listen("child-ready", function (message) {
    console.log("Child says:", message.payload.text);
  });

  const response = await channel.request(
    "get-answer",
    { timeout: 2000 },
    { question: "Hello from parent" }
  );

  console.log("Child answered:", response.payload.text);
});

iframe.addEventListener("load", function () {
  if (!iframe.contentWindow) {
    return;
  }

  pendingChannel.init(
    frameport.defaultIFrameGateway({
      currentWindow: window,
      targetWindow: iframe.contentWindow,
    })
  );
});
```

### `child.js`

```ts
const channel = frameport.createChannel({
  id: "quickstart-demo",
  availableMessages: ["child-ready", "get-answer"],
  ...frameport.defaultIFrameGateway({
    currentWindow: window,
    targetWindow: window.parent,
  }),
});

channel.respond("get-answer", async function (payload) {
  return {
    text: `Child received: ${payload.question}`,
  };
});

channel.send("child-ready", {
  text: "Iframe booted and ready.",
});
```

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

## Demo

There is a plain HTML demo under `docs/` that uses a compiled browser bundle of the library.

```bash
npm run build
npm run build:website
```

Then open `docs/index.html` in a browser.

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
npm run build
npm test
./node_modules/.bin/tsc --noEmit
```
