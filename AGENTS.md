# AGENTS.md

This file is for the next maintainer working on `frameport`.

## Project Summary

`frameport` is a zero-dependency browser library for communication between a parent window and an iframe over `window.postMessage`.

Main ideas:

- `createChannel(...)` builds a channel over a transport
- `send(...)` / `listen(...)` handle one-way messages
- `request(...)` / `respond(...)` handle request-response flows
- `lazyChannel(...)` is for cases where the iframe window is not ready yet
- `defaultIFrameGateway(...)` is the batteries-included browser transport helper

The source of truth for the library code is `src/`.

## Important Paths

- `src/`: library source
- `dist/`: generated npm publish artifacts
- `docs/`: static website and demo, published with GitHub Pages
- `docs/llms.txt`: LLM-friendly website index
- `.github/workflows/deploy-website.yml`: Pages deployment workflow
- `README.md`: package documentation
- `package.json`: package metadata, exports, and scripts

## Package Outputs

The package is published with multiple entry formats:

- ESM: `dist/*.mjs`
- CommonJS: `dist/*.cjs`
- declarations: `dist/*.d.ts`
- raw TypeScript source: `src/*.ts`, exposed through `frameport/source`

Current package entrypoints are defined in `package.json` under `exports`.

If you change public modules, update both:

- `src/index.ts`
- `package.json` `exports`

## Build Commands

Use these from the repo root:

```bash
npm install
npm run build
npm run build:website
npm test
npm run lint
```

What they do:

- `npm run build`: builds npm package artifacts into `dist/`
- `npm run build:website`: builds the browser bundle used by the website/demo into `docs/frameport.js`
- `npm test`: runs Vitest
- `npm run lint`: runs Prettier check

## Node Version

Node 22 is the contributor/build/test environment for this repo.

That is pinned via:

- `.nvmrc`
- GitHub Actions workflows

Important:

- the published package is browser-focused and does **not** declare a Node engine requirement
- do not reintroduce a restrictive `engines.node` field unless there is a real consumer-facing need

## npm Publishing

Before publishing:

```bash
npm run build
npm test
npm publish --dry-run
```

Publish command:

```bash
npm publish
```

Notes:

- `prepublishOnly` already runs `npm run build && npm test`
- `dist/` is included in the npm tarball via `package.json` `files`
- `dist/` is intentionally ignored in git and should generally not be committed

## GitHub Pages Website

Live site:

- `https://damianmr.github.io/frameport/`

The site is deployed from `docs/` by GitHub Actions.

Workflow:

- `.github/workflows/deploy-website.yml`

Important details:

- deployment runs on pushes to `main`
- it runs tests before building the website
- the workflow expects GitHub Pages to be enabled for the repo

If Pages ever fails with a 404 during `configure-pages`, check whether Pages is enabled in the GitHub repo settings.

## LLM Website Files

The website includes LLM-friendly files that should stay published:

- `/llms.txt`
- `/index.html.md`
- `/quickstart.md`

They live in `docs/` and are deployed with the rest of the site.

If you update the website structure or project positioning, update these files too so they stay aligned with:

- the live website copy
- the README
- the actual package API

## Documentation Conventions

The README should cover:

- what the library solves
- install instructions
- import guidance for ESM/CommonJS/raw TypeScript source
- a minimal quickstart
- deeper API reference below that

The website should stay more visual and demo-oriented, but the README and website should agree on:

- project positioning
- quickstart examples
- naming of parent/iframe files

## Git Conventions In This Repo

- `dist/` is ignored in git
- generated website bundle is `docs/frameport.js`
- `docs/frameport.js` is generated and should not be hand-edited
- source files in `src/` are the only library files you should manually edit

## Safe Maintenance Checklist

When changing package surface:

1. update `src/`
2. update `src/index.ts` exports if needed
3. update `package.json` exports if needed
4. run `npm run build`
5. run `npm test`
6. run `npm run lint`
7. if website/docs changed, run `npm run build:website`

When changing website/demo:

1. update files under `docs/`
2. keep `llms.txt` and markdown companions in sync if needed
3. run `npm run build:website`
4. run `npm run lint`

When preparing a release:

1. check `package.json` version
2. run `npm publish --dry-run`
3. confirm tarball contents look right
4. publish
