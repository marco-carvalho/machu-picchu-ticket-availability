import { existsSync, readFileSync, writeFileSync } from 'node:fs';

export function readHistory(historyPath) {
  if (!existsSync(historyPath)) return [];

  try {
    const data = JSON.parse(readFileSync(historyPath, 'utf8'));
    if (!Array.isArray(data)) throw new Error('the file contents must be an array');
    return data;
  } catch (error) {
    console.error(`Could not read ${historyPath}: ${error.message}`);
    process.exit(1);
  }
}

export function writeHistory(historyPath, history) {
  writeFileSync(historyPath, `${JSON.stringify(history, null, 2)}\n`);
}
