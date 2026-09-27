import { execFileSync } from 'node:child_process';
import { platform } from 'node:os';

/** Optional allocation for a Windows desktop hosting both the world and Unreal.
 * This is environment policy, never part of canonical world state. */
export interface CpuAllocation { affinity: number; powerShell: string }

export function validateCpuAllocation(value: unknown): CpuAllocation | undefined {
  if (value === undefined) return undefined;
  const c = value as Partial<CpuAllocation> | null;
  if (!c || typeof c !== 'object' || !Number.isSafeInteger(c.affinity) || c.affinity! <= 0
    || typeof c.powerShell !== 'string' || !c.powerShell.trim())
    throw new Error('cpuAllocation requires a positive safe-integer affinity mask and a PowerShell executable');
  return { affinity: c.affinity!, powerShell: c.powerShell };
}

/** Run before opening the world/listener, on every supervisor restart. The command
 * addresses only this service process; operator text is never interpolated into it. */
export function applyCpuAllocation(value: CpuAllocation | undefined): { affinity: number; priority: string } | undefined {
  const c = validateCpuAllocation(value);
  if (!c) return undefined;
  if (platform() !== 'win32') throw new Error('cpuAllocation is supported only on Windows');
  const command = `$ErrorActionPreference='Stop'; $p=Get-Process -Id ${process.pid}; $p.ProcessorAffinity=[IntPtr]${c.affinity}; $p.PriorityClass='AboveNormal'; @{affinity=$p.ProcessorAffinity.ToInt64();priority=$p.PriorityClass.ToString()} | ConvertTo-Json -Compress`;
  const result = JSON.parse(execFileSync(c.powerShell, ['-NoProfile', '-NonInteractive', '-Command', command], {
    encoding: 'utf8', windowsHide: true, timeout: 15_000,
  }));
  if (result.affinity !== c.affinity || result.priority !== 'AboveNormal') throw new Error('CPU allocation did not match the requested policy');
  return result;
}
