const tablist = document.querySelector('#tabs');
const tabs = [...document.querySelectorAll('[role="tab"]')];
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
const statuses = {
  'sold out': { label: 'Sold out', badgeClass: 'bg-red-500/15 text-red-300' },
  'selling': { label: 'Selling', badgeClass: 'bg-amber-500/15 text-amber-300' },
  'no sales': { label: 'No sales', badgeClass: 'bg-slate-800 text-slate-300' }
};
// The ticket office is shown as one card per date listing its six routes, the web store
// as one card per route listing the closest dates with tickets. The shapes are also the
// dimensions the placeholders assume in order to reserve the exact height.
const channelViews = {
  'in-person': { label: 'In person', shape: { cards: 6, rows: 6 }, build: dateCards },
  'online': { label: 'Online', shape: { cards: 10, rows: 6 }, build: routeCards }
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
    (style ? style.badgeClass : 'bg-slate-800 text-slate-300') + ' ' + extraClass;
  badge.textContent = style ? style.label : status;
  return badge;
}

function ticketBar(sold, available) {
  const track = document.createElement('div');
  track.className = 'flex h-2 overflow-hidden rounded-full bg-slate-800';
  for (const [count, color] of [[sold, 'bg-red-500'], [available, 'bg-green-500']]) {
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
  counts.className = 'shrink-0 whitespace-nowrap tabular-nums text-slate-300 ' + extraClass;
  const ratio = document.createElement('span');
  ratio.textContent = entry.available + '/' + entry.quota;
  const detail = document.createElement('span');
  detail.className = 'hidden @md:inline';
  detail.textContent = ' available, ' + entry.sold + ' sold';
  counts.append(ratio, detail);
  return counts;
}

function pulse(extraClass) {
  const bar = document.createElement('div');
  bar.className = 'animate-pulse rounded bg-slate-900 ' + extraClass;
  return bar;
}

// A row is a route inside a date card, or a date inside a route card.
function detailRow(label, entry) {
  const row = document.createElement('li');
  row.className = 'flex h-5 items-center gap-2 text-sm @md:gap-3';
  const name = document.createElement('span');
  name.className = 'min-w-0 flex-1 truncate';
  name.textContent = label;
  const status = document.createElement('span');
  status.className = 'hidden w-20 shrink-0 justify-end @md:flex';
  status.append(statusBadge(entry.status, 'text-xs'));
  const bar = document.createElement('div');
  bar.className = 'hidden w-16 shrink-0 @xs:block @md:w-28';
  bar.append(ticketBar(entry.sold, entry.available));
  row.append(name, status, bar, ticketCounts(entry, 'text-right @md:w-48'));
  return row;
}

function emptyRow(label) {
  const row = document.createElement('li');
  row.className = 'flex h-5 items-center text-sm text-slate-500';
  row.textContent = label;
  return row;
}

// Cards keep the same number of rows so that every one of them has the same height,
// which also lets the placeholder reserve the exact space: 24px header, 8px bar and
// 20px rows.
function spacerRow() {
  const row = document.createElement('li');
  row.className = 'h-5';
  row.setAttribute('aria-hidden', 'true');
  return row;
}

function card(title, totals, rows, rowCount, emptyLabel) {
  const element = document.createElement('section');
  element.className = '@container rounded-lg border border-slate-800 bg-slate-900/40 p-4';

  const head = document.createElement('div');
  head.className = 'flex h-6 items-center gap-x-2 @md:gap-x-3';
  const heading = document.createElement('h3');
  heading.className = 'm-0 min-w-0 truncate text-base font-bold';
  heading.textContent = title;
  heading.title = title;
  head.append(heading, statusBadge(totals.status, 'text-xs'));
  if (totals.quota > 0) head.append(ticketCounts(totals, 'ml-auto text-sm'));

  const total = document.createElement('div');
  total.className = 'mt-3';
  total.append(ticketBar(totals.sold, totals.available));

  const list = document.createElement('ul');
  list.className = 'm-0 mt-4 flex list-none flex-col gap-2 border-t border-slate-800 p-0 pt-3';
  list.append(...(rows.length === 0 && emptyLabel ? [emptyRow(emptyLabel)] : rows));
  while (list.children.length < rowCount) list.append(spacerRow());

  element.append(head, total, list);
  return element;
}

function skeletonCard(rowCount) {
  const element = document.createElement('section');
  element.className = '@container rounded-lg border border-slate-800 bg-slate-900/40 p-4';

  const head = document.createElement('div');
  head.className = 'flex h-6 items-center gap-x-2';
  head.append(pulse('h-4 w-24 bg-slate-800'), pulse('ml-auto h-4 w-16 bg-slate-800'));

  const total = document.createElement('div');
  total.className = 'mt-3';
  total.append(pulse('h-2 rounded-full'));

  const list = document.createElement('div');
  list.className = 'mt-4 flex flex-col gap-2 border-t border-slate-800 pt-3';
  for (let index = 0; index < rowCount; index++) list.append(pulse('h-5'));

  element.append(head, total, list);
  return element;
}

function cardGrid(cards, shape) {
  const grid = document.createElement('div');
  grid.className = 'grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3';
  grid.append(...(cards ?? Array.from({ length: shape.cards }, () => skeletonCard(shape.rows))));
  return grid;
}

function dateCards(channel, shape) {
  return cardGrid(
    channel.dates?.map(entry =>
      card(entry.date, entry, entry.routes.map(route => detailRow(route.name, route)), shape.rows)
    ),
    shape
  );
}

function routeCards(channel, shape) {
  return cardGrid(
    channel.routes?.map(route =>
      card(
        route.name,
        route,
        route.dates.map(entry => detailRow(entry.date, entry)),
        shape.rows,
        'No tickets in the next ' + channel.scanned + ' dates.'
      )
    ),
    shape
  );
}

function describe(channel) {
  if (channel.dates) {
    const selling = channel.dates.filter(entry => entry.status === 'selling');
    if (selling.length === 0) {
      return { headline: 'no open sales', detail: 'No date has open sales in this window.' };
    }
    const closest = selling[0];
    return {
      headline: selling.length + ' of ' + channel.dates.length + ' dates with tickets',
      detail:
        selling.length + ' of ' + channel.dates.length + ' dates with tickets, the closest one ' +
        closest.date + ' with ' + closest.available + ' of ' + closest.quota + ' available.'
    };
  }

  const open = channel.routes.filter(route => route.dates.length > 0);
  if (open.length === 0) {
    return {
      headline: 'no open sales',
      detail: 'No route has tickets in the next ' + channel.scanned + ' dates.'
    };
  }
  return {
    headline: open.length + ' of ' + channel.routes.length + ' routes with tickets',
    detail:
      open.length + ' of ' + channel.routes.length + ' routes with tickets in the next ' +
      channel.scanned + ' dates, the closest one ' +
      open.map(route => route.dates[0].date).sort()[0] + '.'
  };
}

// The tab labels the channel, so the panel only repeats the sale point and the counts.
// Both show up in the same render, which keeps the reserved line from moving twice.
function renderChannel(channel, view) {
  const note = document.createElement('div');
  note.className =
    'mb-3 flex min-h-10 items-start gap-2 text-sm text-slate-400 sm:min-h-5 sm:items-center';
  if (channel.point) {
    const point = document.createElement('span');
    point.className =
      'shrink-0 rounded-full bg-slate-800 px-2 py-0.5 text-xs font-semibold text-slate-300';
    point.textContent = 'punto ' + channel.point;
    note.append(point);
  }
  if (channel.dates || channel.routes) {
    const detail = document.createElement('p');
    detail.className = 'm-0';
    detail.textContent = describe(channel).detail;
    note.append(detail);
  }

  document.querySelector('#' + channel.id).replaceChildren(note, view.build(channel, view.shape));
}

function activate(id) {
  for (const tab of tabs) {
    const panel = tab.getAttribute('aria-controls');
    const selected = panel === id;
    tab.setAttribute('aria-selected', String(selected));
    tab.tabIndex = selected ? 0 : -1;
    document.querySelector('#' + panel).classList.toggle('hidden', !selected);
  }
}

function render(snapshot) {
  const channels = snapshot.channels.filter(
    channel => channelViews[channel.id] && (channel.dates ?? channel.routes ?? []).length > 0
  );
  for (const channel of channels) renderChannel(channel, channelViews[channel.id]);

  const shown = new Set(channels.map(channel => channel.id));
  for (const tab of tabs) tab.classList.toggle('hidden', !shown.has(tab.getAttribute('aria-controls')));
  const available = tabs.filter(tab => !tab.classList.contains('hidden'));
  if (!available.some(tab => tab.getAttribute('aria-selected') === 'true') && available.length > 0) {
    activate(available[0].getAttribute('aria-controls'));
  }
  tablist.classList.toggle('hidden', channels.length === 0);
  empty.classList.toggle('hidden', channels.length > 0);

  summary.textContent = channels
    .map(channel => (channel.label ?? channelViews[channel.id].label) + ': ' + describe(channel).headline + '.')
    .join(' ');
  updated.textContent = 'Snapshot from ' + formatTimestamp(snapshot.utcTime) + ' Peru time';
}

async function loadSnapshot() {
  try {
    const response = await fetch('./index.json', { cache: 'no-store' });
    if (!response.ok) throw new Error('HTTP ' + response.status);
    const snapshot = await response.json();
    if (!Array.isArray(snapshot?.channels)) {
      throw new Error('the file must contain a "channels" array');
    }
    render(snapshot);
  } catch (error) {
    tablist.classList.add('hidden');
    for (const id of Object.keys(channelViews)) {
      document.querySelector('#' + id).classList.add('hidden');
    }
    empty.classList.remove('hidden');
    empty.textContent = 'Could not load the ticket sale window.';
    console.error(error);
  }
}

for (const tab of tabs) {
  const panel = tab.getAttribute('aria-controls');
  tab.addEventListener('click', () => {
    activate(panel);
    // The address bar keeps the choice, so each view can be linked and survives a reload.
    history.replaceState(null, '', '#' + panel);
  });
  tab.addEventListener('keydown', event => {
    const step = { ArrowLeft: -1, ArrowRight: 1 }[event.key];
    if (step === undefined) return;
    event.preventDefault();
    const next = tabs[(tabs.indexOf(tab) + step + tabs.length) % tabs.length];
    next.click();
    next.focus();
  });
}

for (const [id, view] of Object.entries(channelViews)) renderChannel({ id }, view);
activate(
  (tabs.find(tab => '#' + tab.getAttribute('aria-controls') === location.hash) ?? tabs[0])
    .getAttribute('aria-controls')
);
loadSnapshot();
