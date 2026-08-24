import { createHmac } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import {
  snapshotSchema,
  statusOf,
  totalsOf,
  type DateAvailability,
  type DatedAvailability,
  type InPersonChannel,
  type OnlineChannel,
  type RouteAvailability,
  type RouteWindow,
} from './src/schema.ts';

const APP_URL = 'https://tuboleto.cultura.pe';
const PLACE = 'llaqta_machupicchu';
// "punto" picks the sale channel. The ticket office sells the six regular routes for the
// next few dates, so it is collected date by date. The online store sells all ten routes
// months ahead, and each route opens on its own window, so it is collected route by route
// until every one of them has enough dates or the horizon ends.
const IN_PERSON = { id: 'in-person', label: 'In person', point: 5, days: 6 } as const;
const ONLINE = {
  id: 'online',
  label: 'Online',
  point: 3,
  datesPerRoute: 6,
  horizon: 120,
} as const;
const TIMEOUT_MS = 15000;
const HOUR_MS = 60 * 60 * 1000;
const OUTPUT_FILE = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'public',
  'index.json'
);

// The API WAF rejects clients that do not look like a browser.
const HEADERS: Record<string, string> = {
  'user-agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36',
  accept: 'application/json, text/plain, */*',
  'accept-language': 'es-PE,es;q=0.9',
  referer: APP_URL + '/',
  origin: APP_URL,
};

const rawRouteSchema = z.object({
  ruta: z.string(),
  ncupo: z.coerce.number(),
  ncupoActual: z.coerce.number(),
});
const serverTimeSchema = z.object({
  tiempoServidor: z.union([z.number(), z.string()]),
});
type RawRoute = z.infer<typeof rawRouteSchema>;

class HttpError extends Error {
  status: number;

  constructor(status: number, url: string) {
    super(`${status} at ${url}`);
    this.status = status;
  }
}

function peruDates(total: number): string[] {
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

async function request(
  url: string,
  options: Omit<RequestInit, 'headers'> & { headers?: Record<string, string> } = {}
): Promise<Response> {
  const response = await fetch(url, {
    ...options,
    headers: { ...HEADERS, ...options.headers },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) throw new HttpError(response.status, url);
  return response;
}

// The signing key lives in the public bundle of the app. Fetching it on every run
// avoids keeping a third party credential here and survives rotations of the key.
async function appConfig(): Promise<{ key: string; api: string }> {
  const home = await request(APP_URL + '/');
  const html = await home.text();
  const pending = [...html.matchAll(/main-[A-Z0-9]+\.js/g)].map((match) => match[0]);
  const visited = new Set<string>();

  while (pending.length > 0) {
    const file = pending.shift()!;
    if (visited.has(file)) continue;
    visited.add(file);

    const bundle = await request(`${APP_URL}/${file}`);
    const source = await bundle.text();
    const key = /securitySecretKey:"([^"]+)"/.exec(source);
    const api = /apiUrl:"([^"]+)"/.exec(source);
    if (key && api) return { key: key[1], api: api[1] };

    for (const match of source.matchAll(/chunk-[A-Z0-9]+\.js/g)) pending.push(match[0]);
  }

  throw new Error('Could not find the signing key in the app bundle.');
}

async function sign(api: string, key: string): Promise<{ timestamp: string; code: string }> {
  const clock = await request(api + '/comunes/tiempo-servidor');
  const { tiempoServidor } = serverTimeSchema.parse(await clock.json());
  const timestamp = String(tiempoServidor);
  return {
    timestamp,
    code: createHmac('sha256', key).update(`${key}:${timestamp}`).digest('base64'),
  };
}

// Each call carries its own signature, and the API answers 403 when two calls share the
// same server timestamp, so the collection stays sequential.
async function availability(
  api: string,
  key: string,
  date: string,
  point: number
): Promise<RawRoute[]> {
  const signature = await sign(api, key);
  const response = await request(api + '/comunes/disponibilidad-actual', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ lugar: PLACE, fecha: date, punto: point, ...signature }),
  });
  const payload = await response.json();
  return z.array(rawRouteSchema).parse(payload);
}

function routeOf(raw: RawRoute): RouteAvailability {
  const quota = Number(raw.ncupo);
  const available = Number(raw.ncupoActual);
  return {
    name: raw.ruta,
    quota,
    available,
    sold: quota - available,
    status: statusOf(quota, available),
  };
}

async function collectByDate(
  api: string,
  key: string,
  channel: typeof IN_PERSON
): Promise<InPersonChannel> {
  const dates: DateAvailability[] = [];
  for (const date of peruDates(channel.days)) {
    const raw = await availability(api, key, date, channel.point);
    const routes = raw.map(routeOf);
    dates.push({ date, ...totalsOf(routes), routes });
  }
  return { ...channel, dates };
}

async function collectByRoute(
  api: string,
  key: string,
  channel: typeof ONLINE
): Promise<OnlineChannel> {
  const buckets = new Map<string, { name: string; dates: DatedAvailability[] }>();
  let scanned = 0;

  for (const date of peruDates(channel.horizon)) {
    let routes: RawRoute[];
    try {
      routes = await availability(api, key, date, channel.point);
    } catch (error) {
      // The endpoint answers 404 for dates the store does not sell yet, which ends the run.
      if (error instanceof HttpError && error.status === 404) break;
      throw error;
    }
    scanned++;

    for (const raw of routes) {
      const { name, ...entry } = routeOf(raw);
      const bucket = buckets.get(name) ?? { name, dates: [] };
      buckets.set(name, bucket);
      if (entry.available > 0 && bucket.dates.length < channel.datesPerRoute) {
        bucket.dates.push({ date, ...entry });
      }
    }

    const complete = [...buckets.values()].every(
      (bucket) => bucket.dates.length >= channel.datesPerRoute
    );
    if (buckets.size > 0 && complete) break;
  }

  const routes: RouteWindow[] = [...buckets.values()].map((bucket) => ({
    name: bucket.name,
    ...totalsOf(bucket.dates),
    dates: bucket.dates,
  }));
  return { ...channel, scanned, routes };
}

function reportByDate(channel: InPersonChannel): void {
  const width = Math.max(
    0,
    ...channel.dates.flatMap((entry) => entry.routes.map((route) => route.name.length))
  );

  for (const entry of channel.dates) {
    console.log(
      `${entry.date} ${entry.status.padEnd(10)} ` +
        `${entry.available}/${entry.quota} available, ${entry.sold} sold`
    );
    for (const route of entry.routes) {
      console.log(
        `  ${route.name.padEnd(width)} ${route.status.padEnd(10)} ` +
          `${route.available}/${route.quota} available, ${route.sold} sold`
      );
    }
  }

  const selling = channel.dates.filter((entry) => entry.status === 'selling');
  console.log('');
  if (selling.length === 0) {
    console.log(`No date with open sales in the next ${channel.days} dates.`);
    return;
  }
  const current = selling[0];
  console.log(
    `Selling now for ${current.date}, ${current.available} of ${current.quota} available`
  );
  if (selling.length > 1) {
    console.log('Also with open sales: ' + selling.slice(1).map((entry) => entry.date).join(', '));
  }
}

function reportByRoute(channel: OnlineChannel): void {
  const width = Math.max(0, ...channel.routes.map((route) => route.name.length));

  for (const route of channel.routes) {
    console.log(`${route.name.padEnd(width)} ${route.status}`);
    if (route.dates.length === 0) {
      console.log(`  no tickets in the next ${channel.scanned} dates`);
      continue;
    }
    for (const entry of route.dates) {
      console.log(`  ${entry.date} ${entry.available}/${entry.quota} available`);
    }
  }

  const open = channel.routes.filter((route) => route.dates.length > 0);
  console.log('');
  console.log(
    `${open.length} of ${channel.routes.length} routes with tickets in the next ` +
      `${channel.scanned} dates`
  );
  if (open.length > 0) {
    const closest = open.map((route) => route.dates[0].date).sort()[0];
    console.log(`Closest date with tickets: ${closest}`);
  }
}

const { key, api } = await appConfig();
const inPerson = await collectByDate(api, key, IN_PERSON);
const online = await collectByRoute(api, key, ONLINE);

const snapshot = snapshotSchema.parse({
  utcTime: new Date().toISOString(),
  channels: [inPerson, online],
});
writeFileSync(OUTPUT_FILE, JSON.stringify(snapshot, null, 2) + '\n');

console.log(`\n# ${inPerson.label} (punto ${inPerson.point})`);
reportByDate(inPerson);
console.log(`\n# ${online.label} (punto ${online.point})`);
reportByRoute(online);
