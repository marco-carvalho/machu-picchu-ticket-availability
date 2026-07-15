import { execSync } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export async function collectAvailability(url) {
  const globalRoot = execSync('npm root -g').toString().trim();
  const pw = await import(
    pathToFileURL(path.join(globalRoot, 'playwright', 'index.js')).href
  );
  const chromium = pw.chromium ?? pw.default?.chromium;

  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({
    timezoneId: 'America/Lima',
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
      '(KHTML, like Gecko) Chrome/126.0 Safari/537.36',
  });

  let disponibilidad = null;
  let fechaConsultada = null;

  page.on('request', (request) => {
    if (request.url().includes('disponibilidad-actual')) {
      try {
        const body = JSON.parse(request.postData() || '{}');
        if (body.fecha) fechaConsultada = body.fecha;
      } catch {}
    }
  });

  page.on('response', async (response) => {
    const responseUrl = response.url();
    if (response.request().method() === 'OPTIONS') return;
    try {
      if (responseUrl.includes('disponibilidad-actual')) {
        disponibilidad = await response.json();
      }
    } catch {}
  });

  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 90000 });
    for (let attempt = 0; attempt < 20 && !disponibilidad; attempt++) {
      await page.waitForTimeout(500);
    }
  } finally {
    await browser.close();
  }

  if (!disponibilidad) {
    throw new Error(
      'Could not retrieve availability because the page did not respond in time.'
    );
  }

  const rutas = disponibilidad.map((route) => {
    const ingressosTotais = Number(route.ncupo);
    const ingressosDisponiveis = Number(route.ncupoActual);
    return {
      ruta: route.ruta,
      ingressosTotais,
      ingressosVendidos: ingressosTotais - ingressosDisponiveis,
      ingressosDisponiveis,
    };
  });

  const totais = {
    ingressosTotais: rutas.reduce((sum, route) => sum + route.ingressosTotais, 0),
    ingressosVendidos: rutas.reduce((sum, route) => sum + route.ingressosVendidos, 0),
    ingressosDisponiveis: rutas.reduce(
      (sum, route) => sum + route.ingressosDisponiveis,
      0
    ),
  };
  const registro = {
    horarioUtc: new Date().toISOString(),
    dataDisponibilidade: fechaConsultada,
    rotas: rutas,
    totais,
  };

  return registro;
}
