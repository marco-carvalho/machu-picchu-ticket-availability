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
// Dimensões do snapshot que o placeholder assume para reservar a altura exata.
const DATAS_POR_SNAPSHOT = 6;
const ROTAS_POR_DATA = 6;
const statuses = {
  'esgotado': { label: 'Sold out', badgeClass: 'bg-red-100 text-red-700' },
  'vendendo': { label: 'Selling', badgeClass: 'bg-amber-100 text-amber-800' },
  'sem vendas': { label: 'No sales', badgeClass: 'bg-slate-100 text-slate-600' }
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

function offsetLabel(offset) {
  if (offset === 0) return 'today';
  return '+' + offset + (offset === 1 ? ' day' : ' days');
}

// Em cartão estreito o rótulo vira "+4"; a palavra completa volta quando há espaço.
function offsetChip(offset) {
  const chip = document.createElement('span');
  chip.className = 'shrink-0 text-xs font-semibold uppercase tracking-wide text-slate-500';
  const short = document.createElement('span');
  short.textContent = offset === 0 ? 'today' : '+' + offset;
  const detail = document.createElement('span');
  detail.className = 'hidden @md:inline';
  detail.textContent = offset === 0 ? '' : offset === 1 ? ' day' : ' days';
  chip.append(short, detail);
  return chip;
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

// A parte longa da contagem só aparece quando o cartão tem largura para ela.
function ticketCounts(entry, extraClass = '') {
  const counts = document.createElement('span');
  counts.className = 'shrink-0 whitespace-nowrap tabular-nums text-slate-600 ' + extraClass;
  const ratio = document.createElement('span');
  ratio.textContent = entry.disponiveis + '/' + entry.cota;
  const detail = document.createElement('span');
  detail.className = 'hidden @md:inline';
  detail.textContent = ' available, ' + entry.vendidos + ' sold';
  counts.append(ratio, detail);
  return counts;
}

function routeRow(route) {
  const row = document.createElement('li');
  row.className = 'flex items-center gap-2 text-sm @md:gap-3';
  const name = document.createElement('span');
  name.className = 'min-w-0 flex-1 truncate';
  name.textContent = route.ruta;
  const status = document.createElement('span');
  status.className = 'hidden w-20 shrink-0 justify-end @md:flex';
  status.append(statusBadge(route.situacao, 'text-xs'));
  const bar = document.createElement('div');
  bar.className = 'hidden w-16 shrink-0 @xs:block @md:w-28';
  bar.append(ticketBar(route.vendidos, route.disponiveis));
  row.append(name, status, bar, ticketCounts(route, 'text-right @md:w-48'));
  return row;
}

function dateCard(entry) {
  const card = document.createElement('section');
  card.className = '@container rounded-lg border border-slate-200 p-4';

  // Altura fixa e sem quebra de linha: o placeholder precisa saber o tamanho do cabeçalho.
  const head = document.createElement('div');
  head.className = 'flex h-6 items-center gap-x-2 @md:gap-x-3';
  const heading = document.createElement('h2');
  heading.className = 'm-0 shrink-0 text-base font-bold';
  heading.textContent = entry.data;
  head.append(
    heading,
    offsetChip(entry.offset),
    statusBadge(entry.situacao, 'text-xs'),
    ticketCounts(entry, 'ml-auto text-sm')
  );

  const total = document.createElement('div');
  total.className = 'mt-3';
  total.append(ticketBar(entry.vendidos, entry.disponiveis));

  const routes = document.createElement('ul');
  routes.className = 'm-0 mt-4 flex list-none flex-col gap-2 border-t border-slate-100 p-0 pt-3';
  for (const route of entry.rotas) routes.append(routeRow(route));

  card.append(head, total, routes);
  return card;
}

// O placeholder repete a estrutura e os espaçamentos do cartão real para que a
// troca não desloque nada: cabeçalho de 24px, barra de 8px e linhas de 20px.
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
  for (let linha = 0; linha < ROTAS_POR_DATA; linha++) {
    const row = document.createElement('div');
    row.className = 'h-5 animate-pulse rounded bg-slate-100';
    routes.append(row);
  }

  card.append(head, total, routes);
  return card;
}

function render(snapshot) {
  const entries = snapshot.datas;
  dates.replaceChildren(...entries.map(dateCard));
  dates.classList.toggle('hidden', entries.length === 0);
  empty.classList.toggle('hidden', entries.length > 0);

  const selling = entries.filter(entry => entry.situacao === 'vendendo');
  const lastWithSales = entries.filter(entry => entry.vendidos > 0).at(-1);
  const sentences = [];
  if (entries.length === 0) {
    sentences.push('No dates were collected.');
  } else if (selling.length === 0) {
    sentences.push('No date has open sales in this window.');
  } else {
    const current = selling[0];
    sentences.push(
      'Selling now for ' + current.data + ' (' + offsetLabel(current.offset) + '), ' +
      current.disponiveis + ' of ' + current.cota + ' available.'
    );
  }
  if (lastWithSales) {
    sentences.push(
      'Sales registered up to ' + lastWithSales.data +
      ' (' + offsetLabel(lastWithSales.offset) + ').'
    );
  }
  summary.textContent = sentences.join(' ');
  updated.textContent = 'Snapshot from ' + formatTimestamp(snapshot.horarioUtc) + ' Peru time';
}

async function loadSnapshot() {
  try {
    const response = await fetch('./index.json', { cache: 'no-store' });
    if (!response.ok) throw new Error('HTTP ' + response.status);
    const snapshot = await response.json();
    if (!Array.isArray(snapshot?.datas)) throw new Error('the file must contain a "datas" array');
    render(snapshot);
  } catch (error) {
    dates.classList.add('hidden');
    empty.classList.remove('hidden');
    empty.textContent = 'Could not load the ticket sale window.';
    console.error(error);
  }
}

dates.replaceChildren(...Array.from({ length: DATAS_POR_SNAPSHOT }, () => skeletonCard()));
loadSnapshot();
