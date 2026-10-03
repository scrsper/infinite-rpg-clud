import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';

/** A fixed development-evidence allowlist, deliberately not a general save-directory API. */
function directory(run: string) {
  if (!['baseline', 'repaired'].includes(run)) throw new Error('Unknown isolated validation archive');
  return new URL(`../../.debug/observatory-hardening/${run === 'baseline' ? 'baseline/replay-918271' : 'reviewed-918271'}/`, import.meta.url);
}
export async function validationEvidence(run: string) {
  const dir = directory(run);
  const [report, evidence, analysis, review] = await Promise.all(['report.json', 'final.evidence.json', 'final.analysis.json', 'health-review-summary.json'].map(async f => JSON.parse(await readFile(new URL(f, dir), 'utf8'))));
  const originalDiagnoses = JSON.parse(await readFile(new URL('../../docs/evidence/observatory-hardening/original-findings.json', import.meta.url), 'utf8'));
  let longRunVerification: unknown = { status: 'Not yet recorded' };
  if (run === 'repaired') {
    try { longRunVerification = JSON.parse(await readFile(new URL('../../docs/evidence/observatory-hardening/validation-summary.json', import.meta.url), 'utf8')); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  }
  return { run, report, evidence, analysis, review, originalDiagnoses, longRunVerification, note: 'Archived emission-time developer receipts. IDs belong to this archived world, not necessarily the currently inspected world. Full JSON contains all records; the tree bounds each section to 100 entries. Hourly findings open their complete worst-window receipts separately. Human-reviewed original diagnoses are interpretations, not canonical facts. Long-run replay evidence applies to the recorded source hashes and saved runs, not arbitrary later edits or inputs.' };
}
export async function validationFinding(run: string, key: string) {
  const review = JSON.parse(gunzipSync(await readFile(new URL('health-review.json.gz', directory(run)))).toString());
  const finding = review.groups.find((g: { key: string }) => g.key === key);
  if (!finding) throw Error('Unknown archived finding');
  return finding;
}
export async function validationSave(run: string) { return gunzipSync(await readFile(new URL('final.save.json.gz', directory(run)))).toString(); }
