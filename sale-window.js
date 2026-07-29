import { createHmac } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const URL_APP = 'https://tuboleto.cultura.pe';
const LUGAR = 'llaqta_machupicchu';
const PUNTO = 5;
const DIAS = 6;
const TIMEOUT_MS = 15000;
const HORA_MS = 60 * 60 * 1000;
const ARQUIVO_SAIDA = path.join(path.dirname(fileURLToPath(import.meta.url)), 'index.json');

// O WAF da API rejeita clientes sem cara de navegador.
const CABECALHOS = {
  'user-agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36',
  accept: 'application/json, text/plain, */*',
  'accept-language': 'es-PE,es;q=0.9',
  referer: URL_APP + '/',
  origin: URL_APP,
};

function datasPeru(total) {
  const partes = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Lima',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
      .formatToParts(new Date())
      .map((parte) => [parte.type, parte.value])
  );
  const hojeMs = Date.UTC(Number(partes.year), Number(partes.month) - 1, Number(partes.day));
  return Array.from({ length: total }, (_, indice) =>
    new Date(hojeMs + indice * 24 * HORA_MS).toISOString().slice(0, 10)
  );
}

async function buscar(url, opcoes = {}) {
  const resposta = await fetch(url, {
    ...opcoes,
    headers: { ...CABECALHOS, ...opcoes.headers },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!resposta.ok) throw new Error(`${resposta.status} em ${url}`);
  return resposta;
}

// A chave de assinatura vive no bundle público do app. Buscá-la a cada execução
// evita guardar credencial de terceiro aqui e sobrevive a rotações dela.
async function configuracaoDoApp() {
  const html = await (await buscar(URL_APP + '/')).text();
  const pendentes = [...html.matchAll(/main-[A-Z0-9]+\.js/g)].map((achado) => achado[0]);
  const visitados = new Set();

  while (pendentes.length > 0) {
    const arquivo = pendentes.shift();
    if (visitados.has(arquivo)) continue;
    visitados.add(arquivo);

    const codigo = await (await buscar(`${URL_APP}/${arquivo}`)).text();
    const chave = /securitySecretKey:"([^"]+)"/.exec(codigo);
    const api = /apiUrl:"([^"]+)"/.exec(codigo);
    if (chave && api) return { chave: chave[1], api: api[1] };

    for (const achado of codigo.matchAll(/chunk-[A-Z0-9]+\.js/g)) pendentes.push(achado[0]);
  }

  throw new Error('Não encontrei a chave de assinatura no bundle do app.');
}

async function assinar(api, chave) {
  const { tiempoServidor } = await (await buscar(api + '/comunes/tiempo-servidor')).json();
  const timestamp = String(tiempoServidor);
  return {
    timestamp,
    code: createHmac('sha256', chave).update(`${chave}:${timestamp}`).digest('base64'),
  };
}

// Uma assinatura por data: reaproveitar a mesma em chamadas paralelas leva a 403.
async function disponibilidade(api, chave, fecha) {
  const resposta = await buscar(api + '/comunes/disponibilidad-actual', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ lugar: LUGAR, fecha, punto: PUNTO, ...(await assinar(api, chave)) }),
  });
  const rotas = await resposta.json();
  if (!Array.isArray(rotas)) throw new Error(`Resposta inesperada para ${fecha}`);
  return rotas;
}

function situacaoDe(cota, disponiveis) {
  if (disponiveis === 0) return 'esgotado';
  return cota === disponiveis ? 'sem vendas' : 'vendendo';
}

const { chave, api } = await configuracaoDoApp();
const datas = datasPeru(DIAS);
const coletado = await Promise.all(datas.map((data) => disponibilidade(api, chave, data)));

const linhas = coletado.map((rotasCruas, indice) => {
  const rotas = rotasCruas.map((rota) => {
    const cota = Number(rota.ncupo);
    const disponiveis = Number(rota.ncupoActual);
    return {
      ruta: rota.ruta,
      cota,
      disponiveis,
      vendidos: cota - disponiveis,
      situacao: situacaoDe(cota, disponiveis),
    };
  });
  const cota = rotas.reduce((soma, rota) => soma + rota.cota, 0);
  const disponiveis = rotas.reduce((soma, rota) => soma + rota.disponiveis, 0);
  return {
    data: datas[indice],
    offset: indice,
    cota,
    disponiveis,
    vendidos: cota - disponiveis,
    situacao: situacaoDe(cota, disponiveis),
    rotas,
  };
});

const snapshot = { horarioUtc: new Date().toISOString(), datas: linhas };
writeFileSync(ARQUIVO_SAIDA, JSON.stringify(snapshot, null, 2) + '\n');

const larguraRuta = Math.max(
  0,
  ...linhas.flatMap((linha) => linha.rotas.map((rota) => rota.ruta.length))
);

for (const linha of linhas) {
  const rotulo = linha.offset === 0 ? 'hoje' : '+' + linha.offset;
  console.log(
    `${linha.data} ${rotulo.padEnd(5)} ${linha.situacao.padEnd(10)} ` +
      `${linha.disponiveis}/${linha.cota} disponíveis, ${linha.vendidos} vendidos`
  );
  for (const rota of linha.rotas) {
    console.log(
      `  ${rota.ruta.padEnd(larguraRuta)} ${rota.situacao.padEnd(10)} ` +
        `${rota.disponiveis}/${rota.cota} disponíveis, ${rota.vendidos} vendidos`
    );
  }
}

const vendendo = linhas.filter((linha) => linha.situacao === 'vendendo');
const ultimaComVendas = linhas.filter((linha) => linha.vendidos > 0).at(-1);

console.log('');
if (vendendo.length === 0) {
  console.log('Nenhuma data com venda aberta nas próximas ' + DIAS + ' datas.');
} else {
  const atual = vendendo[0];
  console.log(
    `Vendendo agora para ${atual.data} (+${atual.offset} dias), ` +
      `${atual.disponiveis} de ${atual.cota} disponíveis`
  );
  if (vendendo.length > 1) {
    console.log('Também com venda aberta: ' + vendendo.slice(1).map((l) => l.data).join(', '));
  }
}
if (ultimaComVendas) {
  console.log(`Horizonte com vendas registradas: até ${ultimaComVendas.data} (+${ultimaComVendas.offset})`);
}
