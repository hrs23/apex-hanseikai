# Reference

## Settings

Set these in `.env` for Docker Compose, or with `-e` for `docker run`.

| Variable | Meaning | Default |
| --- | --- | --- |
| `RECORDINGS_DIR` | Recording folder; uploads are saved here too | `./recordings` |
| `TZ` | Time zone for file names without creation metadata | `UTC` |
| `BIND_IP` / `PORT` | Listening address and port | `127.0.0.1` / `8080` |
| `CACHE_DIR` | Extracted audio, thumbnails, match markers and 720p versions | `./cache` |

Optional: `config/config.json` ([example](https://github.com/hrs23/apex-hanseikai/blob/main/config.example.json)) sets the title.

## Principles

The home page has four editable cards: one for the team and three personal ones. Use the pencil to write Markdown, up to 500 characters each, one block per line:

- `# title` is a large heading and `## section` a small one. A personal card is usually titled `# Role | Legend`.
- `- item` is a bullet. Any other line is a paragraph.
- `**bold**`, `==highlight==` and `[label](url)` work inside any line and can be nested.
- A link is either `https://…` or a scene link, `#watch?rec=<file name>&t=<seconds>`, that opens a recording at that moment.

The API (`/docs`) reads and writes the same text.

## 720p version

For a slow connection, pick **Make 720p** in the player's quality menu. The server then makes a smaller copy of that recording (about a quarter of the size) and each viewer chooses their own quality. To free the space, delete `low.mp4` from that recording's folder in `CACHE_DIR`.

## Match end markers

Match end detection is tuned for the Japanese Apex Legends UI with gamepad hints. Other UI languages or layouts may not be detected.

## If it does not open

Check Docker Desktop is running. From the app folder, run `docker compose logs --tail 50`.

## Development and API

[Development & API](https://github.com/hrs23/apex-hanseikai/blob/main/docs/development.md)
