# ig-hush

Userscript (`ig-hush.user.js`) that hides Instagram's sidebar Notifications dot and the pop-out activity bubble. It's CSS only, injected at `document-start`, `@grant none`, with no build step. The same file runs in Tampermonkey (Chrome) and Userscripts (Safari), so don't use GM_* APIs.

## Commands
- `npm test`: node:test + jsdom against `test/fixture.html`

## Releasing
Installed copies update from `@updateURL`, which is the raw file on `main`. They only update when `@version` goes up, so bump it in every commit that changes the script.

## How the selectors work (recorded live 2026-10-21)
Class names are obfuscated and change between deploys, so the selectors only use aria-labels, roles and structure.
- **Dot:** a 12px `div`, background `rgb(255, 48, 64)`, inside the `<a>` that wraps `svg[aria-label="Notifications"]`. It sits in the next sibling of the svg's parent div.
- **Bubble:** `div[role="tooltip"]` holding `span[aria-label="Like"]` and a count. It renders about 2s after load in a `position: fixed` portal layer. That layer is a sibling branch of the app shell, and their nearest shared ancestor also contains `<main>`, so "inside the sidebar" selectors can't reach it.

## When Instagram changes the DOM
1. Update `test/fixture.html` first so it matches the new structure, and keep the `<main>` tooltip as a must-stay-visible case.
2. To catch the bubble live (it fades in a few seconds), reload and poll from the console for elements with background `rgb(255, 48, 64)`, then print their ancestor chain.
3. Confirm live on instagram.com that no red element has a non-zero rect for about 15s after reload, in both the collapsed sidebar and the hover-expanded one, and that `<main>` stays visible.
