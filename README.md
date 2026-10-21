# ig-hush

A userscript that hides Instagram's notification lures in the web sidebar:

- the red dot on the **Notifications** heart
- the red **♥ 1** bubble that pops out next to it after the page loads

It's CSS only and doesn't remove anything from the page. Notifications still work: click the heart and the panel opens as usual.

Works in Chrome (Tampermonkey) and Safari (Userscripts). It runs at `document-start` with `@grant none`, so the badges never show up, not even briefly.

## Install

### Chrome: Tampermonkey
1. Install [Tampermonkey](https://chromewebstore.google.com/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo).
2. Let it run userscripts. Open `chrome://extensions`, then **Tampermonkey → Details**, and turn on **Allow User Scripts**. On older Chrome versions, turn on **Developer mode** at the top right instead.
3. Open [ig-hush.user.js (raw)](https://raw.githubusercontent.com/jpmontez/ig-hush/main/ig-hush.user.js). Tampermonkey shows its install page; click **Install**.
4. Reload instagram.com.

### Safari: Userscripts
1. Install [Userscripts](https://apps.apple.com/app/userscripts/id1463298887) from the App Store and open it once.
2. In the app, choose **Set Userscripts Directory** and pick a folder, for example `~/Documents/Userscripts`.
3. Download the script into that folder:
   ```sh
   curl -fsSL -o ~/Documents/Userscripts/ig-hush.user.js \
     https://raw.githubusercontent.com/jpmontez/ig-hush/main/ig-hush.user.js
   ```
4. Go to Safari → **Settings → Extensions**, turn on **Userscripts**, and set it to **Always Allow on instagram.com**.
5. Reload instagram.com.

## Update / uninstall
Updates are automatic. Both managers check `@updateURL` and install a new release whenever its `@version` is higher. Tampermonkey checks daily by default. In Userscripts, use **Check for updates** in the toolbar popup. To uninstall, delete the script in Tampermonkey's dashboard or remove the file from the Userscripts folder.

## Check it works
Reload instagram.com while you have unseen activity. Neither the red dot nor the bubble should appear, in either the collapsed or the hover-expanded sidebar.

## Develop
```sh
npm install
npm test
```
The tests load `test/fixture.html` (a trimmed copy of the live DOM) in jsdom and check that the dot and bubble are hidden while the nav, the feed and tooltips inside the feed stay visible.

## Limits
- The selectors match English accessibility labels (`aria-label="Notifications"`). In other UI languages the badges won't be hidden.
- Every `role="tooltip"` element in a portal layer, meaning anything outside the app shell, is hidden. The activity bubble was the only one seen on 2026-10-21.
- If Instagram changes its markup, the badges come back. Nothing breaks. See `CLAUDE.md` for how to re-record the selectors.

## License
[MIT](LICENSE)
