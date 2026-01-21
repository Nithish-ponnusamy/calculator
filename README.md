# PrismTape Calculator (Vanilla JS)

A unique calculator with a **tape (history)** sidebar, **keyboard input**, **memory keys**, and **safe expression parsing** (no `eval`).

## Run

- Open `index.html` in your browser (double-click it).

## Features

- Expression support: `+ - * / %` and parentheses `( )`
- Tape/history: click any result to reuse it
- Buttons: `AC`, `CE`, `⌫`, `MC/MR/M+`
- Theme toggle (light/dark)
- Copy result to clipboard

## Notes

- `%` is treated as **modulo**.
- History is saved in `localStorage` (up to 200 entries).
