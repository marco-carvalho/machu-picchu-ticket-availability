let history = [];
let chartInstances = [];
const charts = document.querySelector('#charts');
const empty = document.querySelector('#empty');
const summary = document.querySelector('#summary');
const timelineWindowMilliseconds = 24 * 60 * 60 * 1000;
const xAxisLabelIntervalMilliseconds = 4 * 60 * 60 * 1000;
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
const crowdLevels = {
  lowDemand: { label: 'Low demand', badgeClass: 'bg-green-100 text-green-700' },
  highDemand: { label: 'High demand', badgeClass: 'bg-red-100 text-red-700' }
};

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function computeHistoricalMedian(observations, targetTimeMs) {
  const cutoff = targetTimeMs - timelineWindowMilliseconds;
  const values = observations
    .filter(item => item.time.getTime() <= cutoff)
    .map(item => item.values.ingressosDisponiveis);
  return values.length > 0 ? { value: median(values), count: values.length } : null;
}

function getCrowdLevel(availableNow, medianAvailable) {
  return availableNow >= medianAvailable ? crowdLevels.lowDemand : crowdLevels.highDemand;
}

const seriesDefinitions = [
  {
    name: 'Tickets available',
    key: 'ingressosDisponiveis',
    color: '#16a34a',
    labelOffset: 7,
    showSymbol: true,
    labelFormatter: (value, percentage) => value + ' (' + percentage + '%)'
  },
  {
    name: 'Tickets sold',
    key: 'ingressosVendidos',
    color: '#dc2626',
    labelOffset: -7,
    showSymbol: false,
    labelFormatter: value => value
  }
];

function formatTimestamp(value, separator = '\n') {
  const parts = Object.fromEntries(
    peruTimestampFormatter
      .formatToParts(new Date(value))
      .map(part => [part.type, part.value])
  );
  return (
    parts.year + '-' + parts.month + '-' + parts.day +
    separator +
    parts.hour + ':' + parts.minute + ':' + parts.second
  );
}

function chartOptions(routeName, observations, medianCurve) {
  const timestamps = observations.map(item => item.time.getTime());
  const latestTimestamp = Math.max(...timestamps);
  const timelineMinimum = Math.min(
    Math.min(...timestamps),
    latestTimestamp - timelineWindowMilliseconds
  );
  const capacity = Math.max(
    1,
    ...observations.map(
      item => item.values.ingressosVendidos + item.values.ingressosDisponiveis
    )
  );
  const interval = capacity <= 100 ? 10 : 100;
  const maximum = Math.ceil(capacity / interval) * interval;

  return {
    animation: false,
    aria: {
      enabled: true,
      description: 'Ticket availability timeline for ' + routeName
    },
    tooltip: {
      trigger: 'item',
      formatter: parameters =>
        '<strong>' +
        formatTimestamp(parameters.value[0], ' ') +
        ' Peru time</strong><br>' +
        parameters.marker +
        parameters.seriesName +
        ': ' +
        parameters.value[1]
    },
    grid: {
      top: 18,
      right: 78,
      bottom: 48,
      left: 8,
      containLabel: true
    },
    xAxis: {
      type: 'time',
      min: timelineMinimum,
      max: latestTimestamp,
      boundaryGap: false,
      splitNumber: 2,
      minInterval: xAxisLabelIntervalMilliseconds,
      maxInterval: xAxisLabelIntervalMilliseconds,
      axisLine: { lineStyle: { color: '#cbd5e1' } },
      axisTick: { show: false },
      axisLabel: {
        color: '#64748b',
        fontSize: 10,
        hideOverlap: true,
        formatter: value => formatTimestamp(value) + ' PET'
      },
      splitLine: {
        show: true,
        lineStyle: { color: '#e2e8f0' }
      }
    },
    dataZoom: [{
      type: 'slider',
      xAxisIndex: 0,
      filterMode: 'none',
      startValue: latestTimestamp - timelineWindowMilliseconds,
      endValue: latestTimestamp,
      minValueSpan: timelineWindowMilliseconds,
      maxValueSpan: timelineWindowMilliseconds,
      zoomLock: true,
      brushSelect: false,
      height: 20,
      bottom: 4,
      labelFormatter: value => formatTimestamp(value) + ' PET'
    }],
    yAxis: {
      type: 'value',
      min: 0,
      max: maximum,
      interval: maximum / 10,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: {
        color: '#64748b',
        fontSize: 10,
        formatter: value => Math.round(value)
      },
      splitLine: {
        show: true,
        lineStyle: { color: '#e2e8f0' }
      }
    },
    series: [
      ...seriesDefinitions.map(definition => ({
        name: definition.name,
        type: 'line',
        stack: 'tickets',
        smooth: false,
        showSymbol: definition.showSymbol,
        symbol: 'circle',
        symbolSize: value => (!definition.showSymbol || value[2] === 100) ? 0 : 7,
        emphasis: {
          disabled: true
        },
        data: observations.map(item => {
          const capacity = item.values.ingressosVendidos + item.values.ingressosDisponiveis;
          const value = item.values[definition.key];
          const percentage = capacity > 0 ? Math.round((value / capacity) * 100) : 0;
          return [item.time.getTime(), value, percentage];
        }),
        lineStyle: {
          color: definition.color,
          width: 3,
          cap: 'butt',
          join: 'miter',
          opacity: 0.5
        },
        itemStyle: {
          color: definition.color,
          borderColor: '#ffffff',
          borderWidth: 2
        },
        areaStyle: {
          color: definition.color,
          opacity: 0.5
        },
        endLabel: {
          show: true,
          color: definition.color,
          fontSize: 12,
          fontWeight: 700,
          distance: 8,
          offset: [0, definition.labelOffset],
          formatter: parameters =>
            definition.labelFormatter(parameters.value[1], parameters.value[2])
        }
      })),
      {
        name: 'Historical median (available)',
        type: 'line',
        smooth: false,
        showSymbol: false,
        symbol: 'none',
        silent: true,
        emphasis: {
          disabled: true
        },
        data: medianCurve,
        lineStyle: {
          color: '#64748b',
          width: 2,
          type: 'dashed'
        },
        itemStyle: {
          color: '#64748b'
        },
        tooltip: {
          show: false
        },
        z: 5
      }
    ]
  };
}

function render() {
  for (const chart of chartInstances) chart.dispose();
  chartInstances = [];
  charts.replaceChildren();
  const routeNames = [...new Set(
    history.flatMap(item => item.rotas.map(route => route.ruta))
  )].sort();
  const hasData = routeNames.length > 0;
  charts.style.display = hasData ? 'grid' : 'none';
  empty.style.display = hasData ? 'none' : 'block';
  if (!hasData) return;

  for (const routeName of routeNames) {
    const observations = history.flatMap(item => {
      const values = item.rotas.find(route => route.ruta === routeName);
      return values ? [{ time: new Date(item.horarioUtc), values }] : [];
    });
    const latestObservation = observations.at(-1);

    const historicalMedianAtLatest = computeHistoricalMedian(
      observations,
      latestObservation.time.getTime()
    );

    const latestAvailable = latestObservation.values.ingressosDisponiveis;
    const medianAvailable = historicalMedianAtLatest !== null
      ? historicalMedianAtLatest.value
      : median(observations.map(item => item.values.ingressosDisponiveis));
    const comparablePointCount = historicalMedianAtLatest !== null
      ? historicalMedianAtLatest.count
      : 0;
    const routeLevel = getCrowdLevel(latestAvailable, medianAvailable);

    const windowStart = latestObservation.time.getTime() - timelineWindowMilliseconds;
    const medianCurve = [];
    for (const item of observations) {
      if (item.time.getTime() < windowStart) continue;
      const estimate = computeHistoricalMedian(observations, item.time.getTime());
      if (estimate !== null) medianCurve.push([item.time.getTime(), estimate.value]);
    }

    const section = document.createElement('section');
    section.className = 'min-w-0';
    const title = document.createElement('h2');
    title.className = 'h-9 flex items-center gap-2 text-sm font-bold leading-[18px]';
    const titleText = document.createElement('span');
    titleText.textContent = routeName;
    const routeBadge = document.createElement('span');
    routeBadge.className =
      'rounded-full px-2 py-0.5 text-xs font-semibold ' + routeLevel.badgeClass;
    routeBadge.textContent = routeLevel.label;
    routeBadge.title =
      latestAvailable + ' available now vs. a median of ' +
      Math.round(medianAvailable * 10) / 10 + ' from ' +
      comparablePointCount + ' observation(s) older than 24h';
    title.append(titleText, routeBadge);
    const chartElement = document.createElement('div');
    chartElement.className = 'w-full';
    chartElement.style.height = '280px';
    chartElement.setAttribute('role', 'img');
    chartElement.setAttribute('aria-label', 'Timeline for ' + routeName);
    section.append(title, chartElement);
    charts.append(section);
    const chart = echarts.init(chartElement, null, { renderer: 'canvas' });
    chart.setOption(chartOptions(routeName, observations, medianCurve));
    chartInstances.push(chart);
  }

  const first = formatTimestamp(history[0].horarioUtc, ' ');
  const last = formatTimestamp(history.at(-1).horarioUtc, ' ');
  summary.textContent =
    history.length + ' observation(s) from ' + first + ' to ' + last + ' Peru time';
}

async function loadHistory() {
  try {
    const response = await fetch('./index.json', { cache: 'no-store' });
    if (!response.ok) throw new Error('HTTP ' + response.status);
    const data = await response.json();
    if (!Array.isArray(data)) throw new Error('the file contents must be an array');
    history = data;
    render();
  } catch (error) {
    charts.style.display = 'none';
    empty.style.display = 'block';
    empty.textContent = 'Could not load ticket history.';
    console.error(error);
  }
}

window.addEventListener('resize', () => {
  for (const chart of chartInstances) chart.resize();
});
loadHistory();
