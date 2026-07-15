#!/usr/bin/env node

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectAvailability } from './collector.js';
import { readHistory, writeHistory } from './history.js';

const URL = 'https://tuboleto.cultura.pe/cusco/1000boletos';
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const historyPath = path.join(scriptDir, 'index.json');

let record;
try {
  record = await collectAvailability(URL);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

const history = readHistory(historyPath);
history.push(record);
writeHistory(historyPath, history);

console.log(`History updated: ${historyPath}`);
