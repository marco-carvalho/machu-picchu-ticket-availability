# Machu Picchu ticket availability

A dashboard for checking current Machu Picchu ticket availability from Peru's official
[Tu Boleto](https://tuboleto.cultura.pe/) service.

The dashboard shows two sale channels:

- **In person:** the next six dates and their available routes.
- **Online:** the nearest dates with tickets for each route, scanning up to 120 days ahead.

Live dashboard:
[marco-carvalho.github.io/machu-picchu-ticket-availability](https://marco-carvalho.github.io/machu-picchu-ticket-availability/)

## How it works

`sale-window.ts` reads the configuration published by the Tu Boleto web app, signs API
requests with the site's current public client key, and writes a snapshot to
`public/index.json`. The collector calls the API sequentially because each request needs a
fresh server timestamp. Node.js runs it directly through its built-in TypeScript type
stripping, so it needs no build step.

The dashboard is a Vite app scaffolded from the official `react-ts` template, with Tailwind CSS
added through `@tailwindcss/vite`. Vite copies `public/index.json` to the site root at build
time, and the browser reloads after one minute when the page is visible.

Collector and dashboard share Zod schemas in `src/schema.ts`. The collector validates Tu Boleto
responses and the snapshot it writes; the dashboard validates the snapshot it loads.

GitHub Actions provides two workflows:

- `Scheduled update` runs the collector and commits a changed snapshot.
- `Deploy` lints and builds the app, then publishes `dist` to GitHub Pages.

## Development

Requires Node.js 24 or newer, since the collector relies on native TypeScript execution.

```bash
npm install
npm run dev
```

Other commands:

```bash
npm run collect  # refresh public/index.json from Tu Boleto
npm run lint     # oxlint
npm run build
npm run preview
```

The Vite development server reads the repository's existing `public/index.json`. Running the
collector contacts the Tu Boleto service and replaces that snapshot.

## Project structure

```text
src/                 React dashboard (`App.tsx`) and shared Zod schemas (`schema.ts`)
public/index.json    Latest generated availability snapshot
index.html           Vite HTML entry point
sale-window.ts       Node.js snapshot collector
vite.config.ts       Vite, React, and Tailwind configuration
.oxlintrc.json       Lint configuration
.github/workflows/   Snapshot update and GitHub Pages deployment
```
