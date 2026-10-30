import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

const script = readFileSync(new URL('../ig-hush.user.js', import.meta.url), 'utf8');
// Synthetic tokens in the shape of the page's inline JSON. Never commit real ones.
const TOKENS = '<script type="application/json">["DTSGInitialData",[],{"token":"DT"}]["DTSGInitData",[],{"token":"DT","async_get_token":"AG"}]["LSD",[],{"token":"LS"}]</script>';
// 19-digit pks: JSON.parse rounds these, so the script has to use the string id.
const PKS = ['2907701477395132416', '2907701477395132417'];

// A fake Instagram: lists the archive in its real response shapes and deletes by pk.
function fakeIg({ failDelete = false, throttleSecond = false } = {}) {
  const live = new Set(PKS), deletes = [];
  const reply = (body, status = 200) => ({ ok: status < 300, status, url: 'https://www.instagram.com/x', text: async () => body });
  const fetch = async (url, o = {}) => {
    url = String(url);
    if (url.startsWith('/api/v1/archive/reel/day_shells/')) {
      const items = live.size ? [{ id: 'archiveDay:1', media_count: live.size }] : [];
      return reply('for (;;);' + JSON.stringify({ payload: { items, more_available: false } }));
    }
    if (url === '/api/v1/feed/reels_media/') {
      const items = [...live].map(pk => `{"pk":${pk},"id":"${pk}_42","media_type":1}`).join(',');
      return reply(`{"reels":{"archiveDay:1":{"items":[${items}]}},"status":"ok"}`);
    }
    const m = url.match(/^\/api\/v1\/web\/create\/(\d+)\/delete\/$/);
    if (m) {
      deletes.push({ pk: m[1], headers: o.headers, body: String(o.body) });
      if (failDelete) return reply('{"message":"invalid parameters","status":"fail"}', 400);
      if (throttleSecond && deletes.length === 2) return reply('{"message":"Please wait a few minutes before you try again."}', 429);
      live.delete(m[1]);
      return reply('for (;;);{"__ar":1,"payload":{"status":"ok"}}');
    }
    throw new Error('unexpected request ' + url);
  };
  return { fetch, live, deletes };
}

async function open(t, ig) {
  const dom = new JSDOM(`<!doctype html><body>${TOKENS}</body>`, { url: 'https://www.instagram.com/archive/stories/', runScripts: 'outside-only' });
  dom.window.document.cookie = 'csrftoken=CS';
  dom.window.fetch = ig.fetch;
  dom.window.console.log = () => {};
  t.after(() => dom.window.close()); // also stops the panel's interval when an assert throws
  dom.window.eval(script);
  const doc = dom.window.document;
  await until(() => [...doc.querySelectorAll('button')].length);
  const button = label => [...doc.querySelectorAll('button')].find(b => b.textContent === label);
  const status = () => doc.querySelector('strong').nextSibling.textContent;
  return { dom, button, status };
}

async function until(fn, ms = 10000) {
  const end = Date.now() + ms;
  while (!fn()) { if (Date.now() > end) throw new Error('timed out'); await new Promise(r => setTimeout(r, 50)); }
}

test('Scan counts the archive', async (t) => {
  const ig = fakeIg(), p = await open(t, ig);
  p.button('Scan').click();
  await until(() => /across/.test(p.status()));
  assert.equal(p.status(), '2 archived stories across 1 days.');
  assert.equal(ig.deletes.length, 0);
});

test('Delete all needs a second click, then deletes every story by its exact pk', async (t) => {
  const ig = fakeIg(), p = await open(t, ig);
  p.button('Delete all').click();
  await new Promise(r => setTimeout(r, 200));
  assert.equal(ig.deletes.length, 0, 'one click must not delete');
  p.button('Click again to delete permanently').click();
  await until(() => /^Done/.test(p.status()));
  assert.deepEqual(ig.deletes.map(d => d.pk), PKS);
  assert.equal(ig.live.size, 0);
  const h = ig.deletes[0].headers;
  assert.equal(h['X-IG-D'], 'www');
  assert.equal(h['X-IG-App-ID'], undefined, 'API headers make the delete fail with "invalid parameters"');
  assert.match(ig.deletes[0].body, /fb_dtsg=DT/);
});

test('stops after the first failed delete', async (t) => {
  const ig = fakeIg({ failDelete: true }), p = await open(t, ig);
  p.button('Delete all').click();
  p.button('Click again to delete permanently').click();
  await until(() => /Delete failed/.test(p.status()));
  assert.equal(ig.deletes.length, 1);
  assert.equal(ig.live.size, 2);
});

test('a throttle doubles the pace, remembers it, and Cancel ends the backoff', async (t) => {
  const ig = fakeIg({ throttleSecond: true }), p = await open(t, ig);
  p.button('Delete all').click();
  p.button('Click again to delete permanently').click();
  await until(() => /Rate-limited/.test(p.status()));
  assert.equal(p.dom.window.localStorage.getItem('ig-hush:archive-delay'), '2000');
  p.button('Cancel').click();
  await until(() => /Cancelled/.test(p.status()), 1000);
  assert.equal(ig.live.size, 1, 'only the probe was deleted');
});
