// ==UserScript==
// @name         ig-hush
// @namespace    https://github.com/jpmontez
// @version      1.0.1
// @description  Hide Instagram's red Notifications dot and the pop-out activity bubble in the sidebar.
// @match        https://www.instagram.com/*
// @run-at       document-start
// @grant        none
// @license      MIT
// @updateURL    https://raw.githubusercontent.com/jpmontez/ig-hush/main/ig-hush.user.js
// @downloadURL  https://raw.githubusercontent.com/jpmontez/ig-hush/main/ig-hush.user.js
// ==/UserScript==

// ponytail: relies on English aria-labels ("Notifications") and role="tooltip", and hides every tooltip in a portal layer (none seen besides the bubble); if Instagram renames them the badge just reappears — re-record selectors (see CLAUDE.md).
const CSS = `
/* red dot on the Notifications heart */
a:has(svg[aria-label="Notifications"]) div:has(> svg[aria-label="Notifications"]) + div,
/* pop-out activity bubble: a tooltip in a portal layer, i.e. a branch beside the app holding neither the nav nor <main> */
div:has(> * svg[aria-label="Notifications"]) > :not(:has(svg[aria-label="Notifications"], main)) [role="tooltip"] {
  display: none !important;
}
`;

const style = document.createElement('style');
style.textContent = CSS;
document.documentElement.appendChild(style);
