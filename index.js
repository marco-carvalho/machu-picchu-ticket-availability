const dates = document.querySelector('#dates');
const empty = document.querySelector('#empty');
const summary = document.querySelector('#summary');
const updated = document.querySelector('#updated');
const peruTimestampFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Lima',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23'
});
// Snapshot dimensions the placeholder assumes in order to reserve the exact height.
const DATES_PER_SNAPSHOT = 6;
const ROUTES_PER_DATE = 6;
const statuses = {
  'sold out': { label: 'Sold out', badgeClass: 'bg-red-100 text-red-700' },
  'selling': { label: 'Selling', badgeClass: 'bg-amber-100 text-amber-800' },
  'no sales': { label: 'No sales', badgeClass: 'bg-slate-100 text-slate-600' }
};

function formatTimestamp(value) {
  const parts = Object.fromEntries(
    peruTimestampFormatter.formatToParts(new Date(value)).map(part => [part.type, part.value])
  );
  return (
    parts.year + '-' + parts.month + '-' + parts.day + ' ' +
    parts.hour + ':' + parts.minute + ':' + parts.second
  );
}

function statusBadge(status, extraClass = '') {
  const badge = document.createElement('span');
  const style = statuses[status];
  badge.className =
    'shrink-0 rounded-full px-2 py-0.5 font-semibold ' +
    (style ? style.badgeClass : 'bg-slate-100 text-slate-600') + ' ' + extraClass;
  badge.textContent = style ? style.label : status;
  return badge;
}

function ticketBar(sold, available) {
  const track = document.createElement('div');
  track.className = 'flex h-2 overflow-hidden rounded-full bg-slate-200';
  for (const [count, color] of [[sold, 'bg-red-600'], [available, 'bg-green-600']]) {
    const total = sold + available;
    if (count <= 0 || total <= 0) continue;
    const segment = document.createElement('div');
    segment.className = color;
    segment.style.width = (count / total) * 100 + '%';
    track.append(segment);
  }
  return track;
}

// The long part of the count only shows up when the card has room for it.
function ticketCounts(entry, extraClass = '') {
  const counts = document.createElement('span');
  counts.className = 'shrink-0 whitespace-nowrap tabular-nums text-slate-600 ' + extraClass;
  const ratio = document.createElement('span');
  ratio.textContent = entry.available + '/' + entry.quota;
  const detail = document.createElement('span');
  detail.className = 'hidden @md:inline';
  detail.textContent = ' available, ' + entry.sold + ' sold';
  counts.append(ratio, detail);
  return counts;
}

function routeRow(route) {
  const row = document.createElement('li');
  row.className = 'flex items-center gap-2 text-sm @md:gap-3';
  const name = document.createElement('span');
  name.className = 'min-w-0 flex-1 truncate';
  name.textContent = route.name;
  const status = document.createElement('span');
  status.className = 'hidden w-20 shrink-0 justify-end @md:flex';
  status.append(statusBadge(route.status, 'text-xs'));
  const bar = document.createElement('div');
  bar.className = 'hidden w-16 shrink-0 @xs:block @md:w-28';
  bar.append(ticketBar(route.sold, route.available));
  row.append(name, status, bar, ticketCounts(route, 'text-right @md:w-48'));
  return row;
}

function dateCard(entry) {
  const card = document.createElement('section');
  card.className = '@container rounded-lg border border-slate-200 p-4';

  // Fixed height and no line wrapping: the placeholder needs to know the header size.
  const head = document.createElement('div');
  head.className = 'flex h-6 items-center gap-x-2 @md:gap-x-3';
  const heading = document.createElement('h2');
  heading.className = 'm-0 shrink-0 text-base font-bold';
  heading.textContent = entry.date;
  head.append(
    heading,
    statusBadge(entry.status, 'text-xs'),
    ticketCounts(entry, 'ml-auto text-sm')
  );

  const total = document.createElement('div');
  total.className = 'mt-3';
  total.append(ticketBar(entry.sold, entry.available));

  const routes = document.createElement('ul');
  routes.className = 'm-0 mt-4 flex list-none flex-col gap-2 border-t border-slate-100 p-0 pt-3';
  for (const route of entry.routes) routes.append(routeRow(route));

  card.append(head, total, routes);
  return card;
}

// The placeholder repeats the structure and the spacings of the real card so that
// the swap shifts nothing: 24px header, 8px bar and 20px rows.
function skeletonCard() {
  const card = document.createElement('section');
  card.className = '@container rounded-lg border border-slate-200 p-4';
  card.setAttribute('aria-hidden', 'true');

  const head = document.createElement('div');
  head.className = 'flex h-6 items-center gap-x-2';
  const heading = document.createElement('div');
  heading.className = 'h-4 w-24 animate-pulse rounded bg-slate-200';
  const counts = document.createElement('div');
  counts.className = 'ml-auto h-4 w-16 animate-pulse rounded bg-slate-200';
  head.append(heading, counts);

  const total = document.createElement('div');
  total.className = 'mt-3 h-2 animate-pulse rounded-full bg-slate-100';

  const routes = document.createElement('div');
  routes.className = 'mt-4 flex flex-col gap-2 border-t border-slate-100 pt-3';
  for (let index = 0; index < ROUTES_PER_DATE; index++) {
    const row = document.createElement('div');
    row.className = 'h-5 animate-pulse rounded bg-slate-100';
    routes.append(row);
  }

  card.append(head, total, routes);
  return card;
}

function render(snapshot) {
  const entries = snapshot.dates;
  dates.replaceChildren(...entries.map(dateCard));
  dates.classList.toggle('hidden', entries.length === 0);
  empty.classList.toggle('hidden', entries.length > 0);

  const selling = entries.filter(entry => entry.status === 'selling');
  const lastWithSales = entries.filter(entry => entry.sold > 0).at(-1);
  const sentences = [];
  if (entries.length === 0) {
    sentences.push('No dates were collected.');
  } else if (selling.length === 0) {
    sentences.push('No date has open sales in this window.');
  } else {
    const current = selling[0];
    sentences.push(
      'Selling now for ' + current.date + ', ' +
      current.available + ' of ' + current.quota + ' available.'
    );
  }
  if (lastWithSales) {
    sentences.push('Sales registered up to ' + lastWithSales.date + '.');
  }
  summary.textContent = sentences.join(' ');
  updated.textContent = 'Snapshot from ' + formatTimestamp(snapshot.utcTime) + ' Peru time';
}

async function loadSnapshot() {
  try {
    const response = await fetch('./index.json', { cache: 'no-store' });
    if (!response.ok) throw new Error('HTTP ' + response.status);
    const snapshot = await response.json();
    if (!Array.isArray(snapshot?.dates)) throw new Error('the file must contain a "dates" array');
    render(snapshot);
  } catch (error) {
    dates.classList.add('hidden');
    empty.classList.remove('hidden');
    empty.textContent = 'Could not load the ticket sale window.';
    console.error(error);
  }
}

dates.replaceChildren(...Array.from({ length: DATES_PER_SNAPSHOT }, () => skeletonCard()));
loadSnapshot();
