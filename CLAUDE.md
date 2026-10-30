# ig-hush

Userscript (`ig-hush.user.js`) that hides Instagram's sidebar Notifications dot and the pop-out activity bubble (CSS injected at `document-start`), and adds a panel on `/archive/stories/` that scans and deletes the story archive. `@grant none`, no build step. The same file runs in Tampermonkey (Chrome) and Userscripts (Safari), so don't use GM_* APIs.

## Commands
- `npm test`: node:test + jsdom. `ig-hush.test.js` checks the CSS against `test/fixture.html`; `archive.test.js` drives the panel against a fake Instagram `fetch`. Its tokens and IDs are synthetic: never commit real responses, they hold the session's tokens.

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

## Story archive endpoints (recorded live 2026-10-29)
- **Days:** `GET /api/v1/archive/reel/day_shells/?timezone_offset=<s>&__a=1&__comet_req=7&fb_dtsg_ag=<DTSGInitData.async_get_token>&jazoest=<2+charsum(ag)>` with `X-IG-App-ID: 936619743392459`, `X-CSRFToken`. Without `fb_dtsg_ag` it answers 200 with an empty body. Returns a `for (;;);` envelope, `payload.items[]` of `{id: "archiveDay:<n>", media_count}`. All 243 days came back in one call (`more_available: false`).
- **Stories:** `POST /api/v1/feed/reels_media/`, `reel_ids=<JSON array of day ids>&fb_dtsg&jazoest`, same headers. Plain JSON. Use each item's string `id` (`"<pk>_<owner>"`): `pk` is an unquoted 19-digit number and `JSON.parse` rounds it to a story that doesn't exist.
- **Delete:** `POST /api/v1/web/create/<pk>/delete/`, body `__a=1&__d=www&__user=0&__comet_req=7&fb_dtsg&jazoest&lsd`, headers `X-FB-LSD`, `X-ASBD-ID: 359341`, `X-IG-D: www`, `X-IG-Max-Touch-Points: 0`. Adding the API headers (`X-IG-App-ID`, `X-Requested-With`) makes it answer `400 invalid parameters` whatever the pk. With the right headers a bad pk gets a `for (;;);` envelope with `error: 1357005`.
- The panel deletes one story, rescans to confirm it's gone, then paces the rest starting 1s apart. Each throttle streak doubles the gap (up to 60s), saved in `localStorage['ig-hush:archive-delay']`, plus a 1, 2, 4… min backoff. Clear that key to go back to 1s. The delete rate limit itself hasn't been measured. The success response of a real delete hasn't been recorded yet; the check treats any `error` or `status: "fail"` as failure.

To re-record the delete without sending it: open a story, open its `…` menu, then in the console wrap `XMLHttpRequest.prototype.send` and `window.fetch` so every non-GET is saved and thrown instead of sent (installing it before the viewer loads breaks the viewer). Click Delete → Delete. The viewer shows "Couldn't delete post"; read the saved URL and header names, masking tokens.
