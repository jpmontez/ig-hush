import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

const dom = new JSDOM(read('./fixture.html'), { runScripts: 'outside-only' });
dom.window.eval(read('../ig-hush.user.js'));
const { document, getComputedStyle } = dom.window;
const display = (id) => getComputedStyle(document.getElementById(id)).display;

test('hides the red dot', () => assert.equal(display('dot-wrap'), 'none'));
test('hides the pop-out bubble', () => assert.equal(display('bubble'), 'none'));

test('keeps the Notifications link and icon', () => {
  for (const id of ['notif-link', 'icon-wrap', 'notif-svg', 'sidebar', 'feed']) assert.notEqual(display(id), 'none', id);
});

test('leaves tooltips in <main> alone', () => assert.notEqual(display('feed-tooltip'), 'none'));
