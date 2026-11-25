# WHITE NOISE — playable vertical slice

A compact winter psychological thriller set in northern Maine, December 2004. This is a self-contained static website project intended for GitHub Pages or any basic static host.

## Run locally

1. Extract the ZIP.
2. Open a terminal in the extracted `white_noise_site` folder.
3. Run `python -m http.server 8000` (or double-click `START_GAME.bat` on Windows).
4. Open `http://localhost:8000` in a modern browser.

Do not open `index.html` with `file://`; browser module loading and local audio are more reliable through a local web server.

## Publish with GitHub Pages

GitHub Pages does not run a ZIP file. Extract the archive and upload the **contents** of this folder into the repository root. `index.html` must be at the repository root beside `src/` and `assets/`.

In GitHub: **Settings → Pages → Deploy from a branch → main → /(root) → Save**.

The game loads Three.js r160 from jsDelivr, with unpkg as a fallback. A working internet connection is required for the 3D engine. The original ambience track is local and included in `assets/`.

## Controls

### Keyboard / mouse
- `W A S D` — move
- Mouse — look around (click the game to capture the cursor)
- `E` — interact / inspect
- `F` — toggle the field lantern after picking it up
- `Shift` — walk quickly
- `Esc` — pause / release cursor
- Open **Controls** from the title menu to rebind movement, interaction, lantern and run keys. Duplicate assignments swap automatically.

### Touchscreen
- Play in landscape orientation.
- Left virtual stick — move.
- Drag the right side of the screen — look.
- `USE` — interact.
- `LAMP` — toggle the lantern after collecting it.
- `RUN` — move faster while held.

## Play route

1. Tune the shortwave receiver to **103.2 MHz** and press LISTEN.
2. Take split firewood to the iron stove.
3. Open the front door and walk the trail toward the sea lookout. Watch for the deer.
4. Look out over the water at the cliff.
5. Return to the cabin and inspect the basement hatch to find the cassette.
6. The receiver falls back to static. Tune it to **103.2 MHz** again, then switch on the porch light.
7. Return to the warm room and listen to the last recording.

The lantern is optional, but it helps the exterior feel more intimate after dark. The old ranger equipment visible in the room is set dressing and is not usable gameplay equipment. Night encounters are surreal and non-graphic: the distant visitor is an atmospheric presence, not a combat opponent.

## Included

- `index.html` — app shell and title / settings / HUD UI
- `src/game.js` — Three.js scene, movement, interactions, time, sound and story logic
- `src/style.css` — responsive desktop / landscape-touch UI
- `assets/white_noise_ambient.mp3` — original generated ambient bed, 80 seconds, looped in-game
- `START_GAME.bat` — quick local HTTP server launcher for Windows

## Technical notes

- Three.js is pinned to **0.160.0** in the CDN URLs.
- Procedural canvas textures and procedural geometry keep the package compact and avoid third-party art assets.
- The renderer caps device pixel ratio, uses one shadow-casting directional light, and uses a small snow-particle system.
- Settings and story flags are stored in `localStorage` when available.
- This build has been checked for JavaScript syntax, referenced UI IDs, local asset paths, HTTP serving and ZIP integrity. A full browser/WebGL playthrough and physical-device performance test were not available in the build environment; expect to test on the target device.
