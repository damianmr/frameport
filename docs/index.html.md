# Frameport JS

Frameport JS is a zero-dependency library that turns `window.postMessage` into a small, predictable communication layer between a page and an iframe.

It is useful when you want to:

- keep parent and iframe in sync with one-way updates
- ask the other side for data in a request/response style
- set up the communication flow before the iframe window exists

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

### Raw TypeScript source

```ts
import {
  createChannel,
  defaultIFrameGateway,
  lazyChannel,
} from "frameport/source";
```

The raw TypeScript source entry is only for toolchains that can consume `.ts` files directly. Normal consumers should use the default `frameport` package entry.

## Quickstart

See [quickstart.md](https://damianmr.github.io/frameport/quickstart.md) for the smallest complete parent/iframe example.

## Live Demo

The live website demo is at [index.html](https://damianmr.github.io/frameport/index.html). It shows:

- a parent window using `lazyChannel`
- a child iframe using `createChannel`
- a combined event log showing both sides of the communication

## More

For the full package documentation and API reference, see the project README:

- [README.md](https://raw.githubusercontent.com/damianmr/frameport/main/README.md)
