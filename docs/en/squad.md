# Squad of three (advanced)

One player’s gaming PC (the host) records everyone and runs the app. Friends send their screen and voice from OBS, and watch in a browser.

[![OBS, Tailscale, the web app and browsers across three players’ PCs](/diagrams/recommended-en.svg)](/diagrams/recommended-en.svg)

The host needs Windows, OBS, Docker Desktop and Git. Friends need [Tailscale](https://tailscale.com/download), a browser, and OBS to send their picture and voice.

## 1. Share the host PC {#share}

In your [admin console](https://login.tailscale.com/admin/machines), open the host’s menu, choose **Share**, and send each friend an invitation link. Friends accept it and keep Tailscale connected. See [Tailscale’s sharing guide](https://tailscale.com/kb/1084/sharing).

Only the host is shared. If you already share this PC, reuse that share.

## 2. Make the recording {#record}

Everyone ends up in one MP4 recorded by the host’s OBS.

- The picture is a 2×2 grid: the host top left, then top right, bottom left, bottom right. Unused cells can hold anything.
- Audio track 1 is everything mixed. Tracks 2 and up are each player’s voice, in the same order. The track names are the player names the app shows.

### Set up the host’s OBS

Download the [three-player OBS scene (Windows)](../obs/scene.json), or [build it by hand](#manual).

1. Export your current scene collection as a backup.
2. In **Scene Collection → Import**, select the downloaded JSON.
3. Point `Player 1 game` and `Game audio` at your game, and `Player 1 mic` at your microphone.
4. In Settings → Output → Advanced → Recording, choose Hybrid MP4 and enable audio tracks 1 to 4. In the Audio tab, name track 1 `Mix` and tracks 2 to 4 after the players.

The scene is `Apex`, with a 2560×1440 canvas.

### Set up the friends’ OBS

Settings → Stream, Custom, server `srt://<host Tailscale IP>:10002`. The second friend uses `10003`. Start streaming before the host starts recording.

### Test it

Record a short clip where each player talks alone, then open it in the app.

- Voices: each player view should play only that player. Even out the levels in the mixer.
- Sync: remote feeds arrive later than the local capture. Compare the same in-game countdown across the views and delay the earlier ones with Render Delay filters on the video (up to 500 ms each) and the same Sync Offset in Advanced Audio Properties.

### Adapt the scene with Codex or Claude Code {#ai}

Open this repository in Codex or Claude Code on the host PC. For example:

```text
Adapt docs/public/obs/scene.json to my setup.
Follow the recording requirements in docs/en/squad.md.
We play Apex Legends as a squad of three on Windows.
Player 1's PC records the squad. Its game and microphone are local;
the other two players send their screen and voice from OBS over SRT.
Microphone: [my chosen device]
Preserve the view layout and separate audio tracks.
Leave the original preset unchanged and create obs-custom.json for import.
Explain your changes,
and list the settings I still need to configure in OBS.
```

### Build the scene by hand {#manual}

1. Settings → Video: a 16:9 canvas, such as 2560×1440.
2. Add a Game Capture for your game. Edit Transform: position 0, 0, bounding box "Scale to inner bounds" at half the canvas (1280×720).
3. Add an Audio Input Capture for your microphone and an Application Audio Capture for the game sound.
4. For each friend add a Media Source: untick Local File and set Input to `srt://0.0.0.0:10002?mode=listener` (another port per friend, such as 10003). Use the same bounding box, at 1280, 0 for player 2 and 0, 720 for player 3.
5. Mute the global Desktop Audio and Mic/Aux so nothing is recorded twice.
6. Advanced Audio Properties, Tracks: game sound on 1; your microphone on 1 and 2; player 2 on 1 and 3; player 3 on 1 and 4.

Then do the recording settings in step 4 above.

## 3. Start the app {#app}

On the host, with Docker Desktop running, in PowerShell:

```powershell
git clone https://github.com/hrs23/apex-hanseikai.git
cd apex-hanseikai
Copy-Item .env.example .env
notepad .env
```

Set the recording folder (your OBS recording folder) and time zone in `.env`:

```dotenv
RECORDINGS_DIR=D:/Recordings
TZ=Asia/Tokyo
```

Save, close Notepad and run:

```powershell
docker compose up -d
```

Open `http://localhost:8080`. Recordings become available after processing finishes.

If you started the solo command earlier, run `docker rm -f apex-hanseikai` first. To update later, run `docker compose pull` and `docker compose up -d`.

## 4. Review together {#watch}

Create the app’s Tailscale URL on the host:

```powershell
tailscale serve --bg http://127.0.0.1:8080
tailscale serve status
```

If the first command provides a setup link, follow it to enable HTTPS. Send friends the `https://your-PC.…ts.net` URL shown by `status`. If you already use Serve for another service, check the [official guide](https://tailscale.com/docs/reference/tailscale-cli/serve) first.

The app has no login: anyone who can reach it can watch, upload and edit comments. Share it only with trusted friends, through Tailscale.

Everyone keeps Tailscale connected, opens the same URL and enables **Watch Party**. Keep the host PC, Docker and Tailscale running.

- Anyone can play, pause, seek or switch views, and everyone follows.
- **0** shows all views; **1–4** select a player’s picture and voice.
- **C** adds a comment at that moment. Write what to do next time.
- Drag on the paused picture to draw; **X** clears the drawing.
- **A / D** jump to 60 seconds before the previous or next detected match end.

![Example with sample coaching notes and drawing](/screenshots/watch-party-en.jpg)

If a friend cannot connect, check that both Tailscale clients are connected and the share was accepted.
