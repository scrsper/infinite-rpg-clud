import { tsImport } from 'tsx/esm/api';

// Node must be able to load the worker entry before TypeScript hooks apply.
// Register/import within this source-only worker; compiled releases use checkpointWorker.mjs.
await tsImport('./checkpointWorker.ts', import.meta.url);
