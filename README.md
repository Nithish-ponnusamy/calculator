# PrismTape Calculator (Vanilla JS)

A unique calculator with a **tape (history)** sidebar, **keyboard input**, **memory keys**, and **safe expression parsing** (no `eval`).

## Run

### Frontend only (no backend)

- Open `index.html` in your browser (double-click it).

### With backend (recommended for SSH/servers)

This project includes a dependency-free Node server that serves the frontend files and adds a safe API endpoint: `POST /api/eval`.

- Start: `node server.js`
- Bind/port via env vars:
  - `HOST=0.0.0.0 PORT=8000 node server.js`

Then open the same URL: `http://localhost:8000` (or `http://<server-ip>:8000`).

If you can’t open ports on the server, use SSH port forwarding from your laptop:

- On your laptop: `ssh -L 8000:localhost:8000 ubuntu@<server-ip>`
- On the server: `HOST=127.0.0.1 PORT=8000 node server.js`
- Then open: `http://localhost:8000`

## Features

- Expression support: `+ - * / %` and parentheses `( )`
- Tape/history: click any result to reuse it
- Buttons: `AC`, `CE`, `⌫`, `MC/MR/M+`
- Theme toggle (light/dark)
- Copy result to clipboard

## Notes

- `%` is treated as **modulo**.
- History is saved in `localStorage` (up to 200 entries).
