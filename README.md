# Machu Picchu Ticket Availability

Tracks hourly availability for in person Machu Picchu ticket sales using data from the official [Tu Boleto page](https://tuboleto.cultura.pe/cusco/1000boletos).

View the live dashboard at [marco-carvalho.github.io/machu-picchu-ticket-availability](https://marco-carvalho.github.io/machu-picchu-ticket-availability/).

## How it works

1. A GitHub Actions workflow runs every hour.
2. Playwright opens the official page using the `America/Lima` timezone.
3. The collector captures and normalizes the availability response.
4. The latest observation is appended to `index.json`.
5. The dashboard loads the JSON and renders the availability timeline with Apache ECharts.

## Run locally

Requirements:

1. Node.js
2. Google Chrome
3. Playwright installed globally

Install Playwright:

```sh
npm install --global playwright
```

Collect the latest availability:

```sh
node index.js
```

This command appends a new observation to `index.json`.

Serve the dashboard:

```sh
python3 -m http.server 8000
```

Open [localhost:8000](http://localhost:8000) in a browser.

## Project files

1. `index.js` coordinates collection and history updates.
2. `collector.js` retrieves and normalizes availability data.
3. `history.js` reads and writes the JSON history.
4. `index.json` stores all collected observations.
5. `index.html` renders the dashboard.
6. `.github/workflows/hourly-update.yml` runs and commits hourly updates.

## Automation

The workflow is scheduled at minute 17 of every hour and can also be triggered manually from GitHub Actions. This avoids the start of the hour, when GitHub documents that scheduled workflows are more likely to be delayed or dropped. When `index.json` changes, the workflow commits and pushes the updated history to the default branch.

See the GitHub documentation for [scheduled workflow limitations](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule).
