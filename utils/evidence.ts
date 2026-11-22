import fs from 'fs';
import path from 'path';
import { test } from '@playwright/test';
import { RUN_NAME } from './env';

/** Adds an "actual result" line to the test (shown in the HTML report and in the summary CSV). */
export function actual(text: string) {
  test.info().annotations.push({ type: 'actual', description: text });
}

/** Records requirement, owner, technique and inputs as annotations for traceability. */
export function meta(m: { req: string; owner: string; technique: string; inputs: string }) {
  const a = test.info().annotations;
  a.push({ type: 'requirement', description: m.req });
  a.push({ type: 'owner', description: m.owner });
  a.push({ type: 'technique', description: m.technique });
  a.push({ type: 'inputs', description: m.inputs });
}

/** Saves an NFR measurement to reports/<run>/nfr/<id>.json and attaches it to the report. */
export async function saveNfr(id: string, data: unknown) {
  const dir = path.join(__dirname, '..', 'reports', RUN_NAME, 'nfr');
  fs.mkdirSync(dir, { recursive: true });
  const body = JSON.stringify(data, null, 2);
  fs.writeFileSync(path.join(dir, `${id}.json`), body);
  await test.info().attach(`${id}-measurement`, { body, contentType: 'application/json' });
}

export function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return NaN;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.min(Math.max(idx, 0), sorted.length - 1)];
}
