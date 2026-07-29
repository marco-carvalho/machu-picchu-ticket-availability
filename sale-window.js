import { createHmac } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const APP_URL = 'https://tuboleto.cultura.pe';
const PLACE = 'llaqta_machupicchu';
const POINT = 5;
const DAYS = 6;
const TIMEOUT_MS = 15000;
const HOUR_MS = 60 * 60 * 1000;
const OUTPUT_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'index.json');

// The API WAF rejects clients that do not look like a browser.
const HEADERS = {
  'user-agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36',
  accept: 'application/json, text/plain, */*',
  'accept-language': 'es-PE,es;q=0.9',
  referer: APP_URL + '/',
  origin: APP_URL,
};

function peruDates(total) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Lima',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
      .formatToParts(new Date())
      .map((part) => [part.type, part.value])
  );
  const todayMs = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day));
  // The website only sells from tomorrow on.
  return Array.from({ length: total }, (_, index) =>
    new Date(todayMs + (index + 1) * 24 * HOUR_MS).toISOString().slice(0, 10)
  );
}

async function request(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { ...HEADERS, ...options.headers },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`${response.status} at ${url}`);
  return response;
}

// The signing key lives in the public bundle of the app. Fetching it on every run
// avoids keeping a third party credential here and survives rotations of the key.
async function appConfig() {
  const html = await (await request(APP_URL + '/')).text();
  const pending = [...html.matchAll(/main-[A-Z0-9]+\.js/g)].map((match) => match[0]);
  const visited = new Set();

  while (pending.length > 0) {
    const file = pending.shift();
    if (visited.has(file)) continue;
    visited.add(file);

    const source = await (await request(`${APP_URL}/${file}`)).text();
    const key = /securitySecretKey:"([^"]+)"/.exec(source);
    const api = /apiUrl:"([^"]+)"/.exec(source);
    if (key && api) return { key: key[1], api: api[1] };

    for (const match of source.matchAll(/chunk-[A-Z0-9]+\.js/g)) pending.push(match[0]);
  }

  throw new Error('Could not find the signing key in the app bundle.');
}

async function sign(api, key) {
  const { tiempoServidor } = await (await request(api + '/comunes/tiempo-servidor')).json();
  const timestamp = String(tiempoServidor);
  return {
    timestamp,
    code: createHmac('sha256', key).update(`${key}:${timestamp}`).digest('base64'),
  };
}

// One signature per date: reusing the same one across parallel calls leads to 403.
async function availability(api, key, date) {
  const response = await request(api + '/comunes/disponibilidad-actual', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ lugar: PLACE, fecha: date, punto: POINT, ...(await sign(api, key)) }),
  });
  const routes = await response.json();
  if (!Array.isArray(routes)) throw new Error(`Unexpected response for ${date}`);
  return routes;
}

function statusOf(quota, available) {
  if (available === 0) return 'sold out';
  return quota === available ? 'no sales' : 'selling';
}

const { key, api } = await appConfig();
const dates = peruDates(DAYS);
const collected = await Promise.all(dates.map((date) => availability(api, key, date)));

const entries = collected.map((rawRoutes, index) => {
  const routes = rawRoutes.map((route) => {
    const quota = Number(route.ncupo);
    const available = Number(route.ncupoActual);
    return {
      name: route.ruta,
      quota,
      available,
      sold: quota - available,
      status: statusOf(quota, available),
    };
  });
  const quota = routes.reduce((sum, route) => sum + route.quota, 0);
  const available = routes.reduce((sum, route) => sum + route.available, 0);
  return {
    date: dates[index],
    quota,
    available,
    sold: quota - available,
    status: statusOf(quota, available),
    routes,
  };
});

const snapshot = { utcTime: new Date().toISOString(), dates: entries };
writeFileSync(OUTPUT_FILE, JSON.stringify(snapshot, null, 2) + '\n');

const nameWidth = Math.max(
  0,
  ...entries.flatMap((entry) => entry.routes.map((route) => route.name.length))
);

for (const entry of entries) {
  console.log(
    `${entry.date} ${entry.status.padEnd(10)} ` +
      `${entry.available}/${entry.quota} available, ${entry.sold} sold`
  );
  for (const route of entry.routes) {
    console.log(
      `  ${route.name.padEnd(nameWidth)} ${route.status.padEnd(10)} ` +
        `${route.available}/${route.quota} available, ${route.sold} sold`
    );
  }
}

const selling = entries.filter((entry) => entry.status === 'selling');
const lastWithSales = entries.filter((entry) => entry.sold > 0).at(-1);

console.log('');
if (selling.length === 0) {
  console.log('No date with open sales in the next ' + DAYS + ' dates.');
} else {
  const current = selling[0];
  console.log(
    `Selling now for ${current.date}, ${current.available} of ${current.quota} available`
  );
  if (selling.length > 1) {
    console.log('Also with open sales: ' + selling.slice(1).map((entry) => entry.date).join(', '));
  }
}
if (lastWithSales) {
  console.log(`Horizon with registered sales: up to ${lastWithSales.date}`);
}
