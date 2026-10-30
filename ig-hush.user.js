// ==UserScript==
// @name         ig-hush
// @namespace    https://github.com/jpmontez
// @version      1.1.0
// @description  Hide Instagram's red Notifications dot and pop-out activity bubble, and add a panel to scan and delete your story archive.
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

// ---- story archive cleaner: a panel on /archive/stories/ (endpoints recorded in CLAUDE.md) ----
(() => {
  const ROUTE = '/archive/stories';
  const MAX_THROTTLES = 6, DELAY_KEY = 'ig-hush:archive-delay';
  // Starts at 1s between deletes and doubles on each throttle streak; the slower pace is remembered for later runs.
  let delay = 1000;
  try { delay = Math.max(1000, +localStorage.getItem(DELAY_KEY) || 0); } catch (e) {}
  class Stop extends Error {}

  let box, statusEl, logEl, scanBtn, delBtn, cancelBtn, running = false, cancelled = false;

  const env = t => { try { return JSON.parse(String(t).replace(/^for \(;;\);/, '')); } catch (e) { return null; } };
  const jz = s => '2' + [...s].reduce((a, c) => a + c.charCodeAt(0), 0);
  // ponytail: plain setTimeout, so a hidden tab slows to about one delete a minute; keep the tab in front during a run.
  let wake = null; // resolves the current wait early, so Cancel doesn't sit out a backoff
  const wait = ms => new Promise(r => { wake = r; setTimeout(r, ms); }).then(() => { wake = null; if (cancelled) throw new Stop('Cancelled.'); });
  function slowDown() {
    delay = Math.min(delay * 2, 60000);
    try { localStorage.setItem(DELAY_KEY, String(delay)); } catch (e) {}
    log(`Slowing down: ${delay / 1000}s between deletes.`);
  }

  function readTokens() {
    const src = [...document.querySelectorAll('script:not([src])')].map(s => s.textContent).join('\n');
    const pick = re => (src.match(re) || [])[1];
    const t = {
      dtsg: pick(/"DTSGInitialData",\[\],\{"token":"([^"]+)"/),
      ag:   pick(/"DTSGInitData",\[\],\{"token":"[^"]+","async_get_token":"([^"]+)"/),
      lsd:  pick(/"LSD",\[\],\{"token":"([^"]+)"/),
      csrf: (document.cookie.match(/(?:^|;\s*)csrftoken=([^;]+)/) || [])[1],
    };
    if (!t.dtsg || !t.ag || !t.lsd || !t.csrf) throw new Stop('Reload the page, then try again.');
    return t;
  }

  // Story ids come from the string `id` ("<pk>_<owner>"): `pk` is an unquoted
  // 19-digit number that JSON.parse rounds to a story that doesn't exist.
  async function scan(t) {
    const api = { 'X-IG-App-ID': '936619743392459', 'X-CSRFToken': t.csrf, 'X-Requested-With': 'XMLHttpRequest' };
    const q = new URLSearchParams({ timezone_offset: -new Date().getTimezoneOffset() * 60, __a: 1, __comet_req: 7, fb_dtsg_ag: t.ag, jazoest: jz(t.ag) });
    const shells = env(await (await fetch('/api/v1/archive/reel/day_shells/?' + q, { headers: api, credentials: 'include' })).text())?.payload;
    if (!shells?.items) throw new Stop('Couldn\'t list the archive. Instagram may have changed it; see CLAUDE.md.');
    const days = shells.items.map(d => d.id), ids = [];
    for (let i = 0; i < days.length; i += 20) {
      const body = new URLSearchParams({ reel_ids: JSON.stringify(days.slice(i, i + 20)), fb_dtsg: t.dtsg, jazoest: jz(t.dtsg) });
      const j = env(await (await fetch('/api/v1/feed/reels_media/', { method: 'POST', credentials: 'include',
        headers: { ...api, 'Content-Type': 'application/x-www-form-urlencoded' }, body })).text());
      if (!j?.reels) throw new Stop('Couldn\'t read the archived stories. Instagram may have changed it; see CLAUDE.md.');
      for (const r of Object.values(j.reels)) ids.push(...r.items.map(it => String(it.id).split('_')[0]));
      if (i + 20 < days.length) await wait(500);
    }
    // ponytail: one day_shells call returned all 243 days (more_available false); if it ever pages, a second run gets the rest.
    if (shells.more_available) log('The archive has more pages than one scan reads; run again when this finishes.');
    return { days: days.length, ids: [...new Set(ids)] };
  }

  // The delete endpoint answers "invalid parameters" to the API headers scan()
  // sends; these are the ones the story viewer's own Delete sends.
  async function remove(t, id) {
    const res = await fetch(`/api/v1/web/create/${id}/delete/`, { method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-FB-LSD': t.lsd, 'X-ASBD-ID': '359341', 'X-IG-D': 'www', 'X-IG-Max-Touch-Points': '0' },
      body: new URLSearchParams({ __a: 1, __d: 'www', __user: 0, __comet_req: 7, fb_dtsg: t.dtsg, jazoest: jz(t.dtsg), lsd: t.lsd }) });
    const text = await res.text(), j = env(text);
    if (/\/accounts\/login|\/challenge|\/checkpoint/.test(res.url)) throw new Stop('Instagram wants you to sign in again. Reload and start over.');
    if (res.status === 429 || /try again later|wait a few minutes|we limit how often/i.test(text)) return false;
    if (!res.ok || !j || j.error || j.status === 'fail' || j.payload?.status === 'fail') throw new Stop(`Delete failed (HTTP ${res.status}): ${text.slice(0, 150)}`);
    return true;
  }

  let deleted = 0;

  async function purge() {
    const t = readTokens();
    const { ids } = await scan(t);
    if (!ids.length) return status_('The archive is empty.');
    // One story first, checked against a fresh scan: a 200 alone isn't proof.
    if (!await remove(t, ids[0])) throw new Stop('Instagram is rate-limiting deletes. Try again later.');
    if ((await scan(t)).ids.includes(ids[0])) throw new Stop('Instagram accepted the delete but the story is still there; nothing else was sent.');
    deleted = 1;
    log('Probe passed: the first story was deleted.');
    for (let i = 1, throttles = 0; i < ids.length; ) {
      await wait(delay);
      if (await remove(t, ids[i])) { throttles = 0; i++; deleted++; status_(`Deleted ${deleted} of ${ids.length}.`); continue; }
      if (++throttles > MAX_THROTTLES) throw new Stop('Still rate-limited after ~2 hours. Try again later; a new run picks up the rest.');
      if (throttles === 1) slowDown();
      const ms = 60000 * 2 ** (throttles - 1);
      status_(`Rate-limited. Resuming at ${new Date(Date.now() + ms).toLocaleTimeString()}.`);
      await wait(ms);
    }
    status_(`Done. Deleted ${deleted}. Scan again to check.`);
  }

  // ---- panel ----

  function el(tag, css, text) {
    const e = document.createElement(tag);
    if (css) e.style.cssText = css;
    if (text) e.textContent = text;
    return e;
  }
  function status_(msg) { if (statusEl) statusEl.textContent = msg; }
  function log(msg) {
    console.log('[ig-hush]', msg);
    if (!logEl) return;
    logEl.textContent = [...logEl.textContent.split('\n').filter(Boolean), `${new Date().toLocaleTimeString()} ${msg}`].slice(-5).join('\n');
  }

  async function task(fn, label) {
    running = true; cancelled = false; deleted = 0;
    scanBtn.hidden = delBtn.hidden = true; cancelBtn.hidden = false;
    log(`${label} started.`);
    try { await fn(); } catch (e) {
      status_((e instanceof Stop ? e.message : `Stopped: ${e.message}`) + (deleted ? ` Deleted ${deleted} so far.` : ''));
      if (!(e instanceof Stop)) console.error('[ig-hush]', e);
    }
    log(`${label} finished.`);
    running = false;
    scanBtn.hidden = delBtn.hidden = false; cancelBtn.hidden = true;
  }

  function buildPanel() {
    box = el('div', 'position:fixed;right:16px;bottom:72px;z-index:2147483647;width:300px;padding:12px;border-radius:12px;'
      + 'background:Canvas;color:CanvasText;color-scheme:light dark;border:1px solid GrayText;font:13px/1.4 system-ui,sans-serif;box-shadow:0 4px 24px rgba(0,0,0,.35)');
    statusEl  = el('div', 'margin:6px 0', 'Scan or delete your archived stories.');
    const btn = 'margin-right:8px;padding:6px 12px;border-radius:8px;border:1px solid GrayText;background:ButtonFace;color:ButtonText;font:inherit;cursor:pointer';
    scanBtn   = el('button', btn, 'Scan');
    delBtn    = el('button', btn, 'Delete all');
    cancelBtn = el('button', btn, 'Cancel');
    cancelBtn.hidden = true;
    logEl     = el('pre', 'margin:8px 0 0;white-space:pre-wrap;font:11px/1.4 ui-monospace,monospace;opacity:.75');

    scanBtn.onclick = () => task(async () => {
      const { days, ids } = await scan(readTokens());
      status_(`${ids.length} archived ${ids.length === 1 ? 'story' : 'stories'} across ${days} days.`);
    }, 'Scan');
    let armed = null;
    delBtn.onclick = () => {
      if (!armed) {
        delBtn.textContent = 'Click again to delete permanently';
        armed = setTimeout(() => { armed = null; delBtn.textContent = 'Delete all'; }, 5000);
        return;
      }
      clearTimeout(armed); armed = null; delBtn.textContent = 'Delete all';
      task(purge, 'Delete');
    };
    cancelBtn.onclick = () => { cancelled = true; status_('Cancelling…'); if (wake) wake(); };

    box.append(el('strong', '', 'ig-hush · story archive'), statusEl, scanBtn, delBtn, cancelBtn, logEl);
    document.body.appendChild(box);
  }

  // Instagram is a SPA: show the panel on the archive page, keep it while a run is going.
  setInterval(() => {
    const here = location.pathname.replace(/\/$/, '') === ROUTE;
    if (here && !box && document.body) buildPanel();
    else if (!here && box && !running) { box.remove(); box = null; }
  }, 500);
})();
