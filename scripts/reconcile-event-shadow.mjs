import { readFile } from 'node:fs/promises';
import process from 'node:process';
import { reconcileEventShadow } from '../shared/eventShadowReconciliation.js';

function usage() {
  return 'Usage: npm run reconcile:shadow -- <sheet-events.json> <d1-shadow.json>';
}

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

const [, , sheetPath, shadowPath] = process.argv;
if (!sheetPath || !shadowPath) {
  console.error(usage());
  process.exitCode = 2;
} else {
  try {
    const report = reconcileEventShadow(await readJson(sheetPath), await readJson(shadowPath));
    console.log(JSON.stringify(report, null, 2));
    if (!report.ok) process.exitCode = 1;
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Reconciliation failed.');
    process.exitCode = 2;
  }
}
