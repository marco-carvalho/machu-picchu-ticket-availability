import { execSync } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const MAX_ATTEMPTS = 3;
const RESPONSE_WAIT_MS = 10000;
const RETRY_DELAY_MS = 2000;

export async function collectAvailability(url) {
  const globalRoot = execSync('npm root -g').toString().trim();
  const pw = await import(
    pathToFileURL(path.join(globalRoot, 'playwright', 'index.js')).href
  );
  const chromium = pw.chromium ?? pw.default?.chromium;

  const browser = await chromium.launch({ channel: 'chrome', headless: true });

  let disponibilidad = null;
  let fechaConsultada = null;

  try {
    for (let attempt = 1; attempt <= MAX_ATTEMPTS && !disponibilidad; attempt++) {
      fechaConsultada = null;
      const logPrefix = `[collector] Attempt ${attempt}/${MAX_ATTEMPTS}`;
      const page = await browser.newPage({
        timezoneId: 'America/Lima',
        userAgent:
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
          '(KHTML, like Gecko) Chrome/126.0 Safari/537.36',
      });

      page.on('request', (request) => {
        if (!request.url().includes('disponibilidad-actual')) return;
        try {
          const body = JSON.parse(request.postData() || '{}');
          if (body.fecha) fechaConsultada = body.fecha;
        } catch (error) {
          console.error(`${logPrefix}: could not parse request body: ${error.message}`);
        }
      });

      page.on('response', async (response) => {
        const responseUrl = response.url();
        if (
          response.request().method() === 'OPTIONS' ||
          !responseUrl.includes('disponibilidad-actual')
        ) {
          return;
        }

        console.log(
          `${logPrefix}: availability response ${response.status()} ${responseUrl}`
        );

        try {
          const payload = await response.json();
          if (!Array.isArray(payload)) {
            console.error(
              `${logPrefix}: availability response was not an array ` +
                `(content-type: ${response.headers()['content-type'] || 'unknown'})`
            );
            return;
          }
          disponibilidad = payload;
        } catch (error) {
          console.error(`${logPrefix}: could not parse availability JSON: ${error.message}`);
        }
      });

      page.on('requestfailed', (request) => {
        if (!request.url().includes('disponibilidad-actual')) return;
        console.error(
          `${logPrefix}: availability request failed: ` +
            `${request.failure()?.errorText || 'unknown error'} ${request.url()}`
        );
      });

      page.on('pageerror', (error) => {
        console.error(`${logPrefix}: page error: ${error.message}`);
      });

      try {
        console.log(`${logPrefix}: loading ${url}`);
        await page.goto(url, { waitUntil: 'networkidle', timeout: 90000 });

        const responseDeadline = Date.now() + RESPONSE_WAIT_MS;
        while (!disponibilidad && Date.now() < responseDeadline) {
          await page.waitForTimeout(500);
        }

        if (!disponibilidad) {
          console.error(
            `${logPrefix}: no usable availability response within ` +
              `${RESPONSE_WAIT_MS}ms; current URL: ${page.url()}`
          );
        }
      } catch (error) {
        console.error(`${logPrefix}: navigation failed: ${error.message}`);
      } finally {
        await page.close();
      }

      if (!disponibilidad && attempt < MAX_ATTEMPTS) {
        console.log(`${logPrefix}: retrying in ${RETRY_DELAY_MS}ms`);
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
      }
    }
  } finally {
    await browser.close();
  }

  if (!disponibilidad) {
    throw new Error(
      `Could not retrieve availability after ${MAX_ATTEMPTS} attempts.`
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
