# Solo

## Quick start

1. Install [Docker Desktop](https://docs.docker.com/desktop/setup/install/windows-install/) and start it.
2. Run in a terminal:

   ```bash
   docker run --rm -p 127.0.0.1:8080:8080 ghcr.io/hrs23/apex-hanseikai
   ```

3. Open `http://localhost:8080` and upload an MP4. Any recording tool works.

Ctrl+C stops the app and removes everything.

## Keep recordings and notes

Replace `D:/Recordings` with your recording folder and `TZ` with your time zone:

```powershell
docker run -d --name apex-hanseikai --restart unless-stopped -p 127.0.0.1:8080:8080 -v apex-data:/data -v D:/Recordings:/recordings -e TZ=Asia/Tokyo ghcr.io/hrs23/apex-hanseikai
```

Files in the folder appear in the app once they are named `YYYY-MM-DD hh-mm-ss.mp4`, which is OBS’s default. Uploading any other MP4 asks you for a name.

To update, run `docker rm -f apex-hanseikai`, `docker pull ghcr.io/hrs23/apex-hanseikai`, then the command above again.

## Record with OBS

Install [OBS](https://obsproject.com/). Add your game picture and sound, and record with Hybrid MP4, one audio track and the default file name. No 2×2 layout is needed.

## Next

Playing with friends? [Squad of three (advanced)](squad.md).
