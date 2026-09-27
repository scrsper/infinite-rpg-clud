import { beforeEach, describe, expect, it, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
import { applyCpuAllocation, validateCpuAllocation } from '../src/server/cpuAllocation';

const host = vi.hoisted(() => ({ platform: 'win32' }));
vi.mock('node:os', async original => ({ ...await original<typeof import('node:os')>(), platform: () => host.platform }));
vi.mock('node:child_process', async original => ({ ...await original<typeof import('node:child_process')>(), execFileSync: vi.fn() }));

describe('optional desktop CPU allocation', () => {
  beforeEach(() => { vi.mocked(execFileSync).mockReset(); host.platform = 'win32'; });
  it('leaves ordinary environments untouched', () => {
    expect(applyCpuAllocation(undefined)).toBeUndefined();
    expect(execFileSync).not.toHaveBeenCalled();
  });
  it('rejects malformed masks before executing an operator command', () => {
    for (const affinity of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, '3; exit'])
      expect(() => validateCpuAllocation({ affinity, powerShell: 'pwsh.exe' })).toThrow('safe-integer');
    expect(() => validateCpuAllocation({ affinity: 3, powerShell: '' })).toThrow();
    expect(execFileSync).not.toHaveBeenCalled();
  });
  it('applies and verifies the policy only to the current service PID', () => {
    vi.mocked(execFileSync).mockReturnValue('{"affinity":3,"priority":"AboveNormal"}');
    expect(applyCpuAllocation({ affinity: 3, powerShell: 'C:/Runtime/pwsh.exe' })).toEqual({ affinity: 3, priority: 'AboveNormal' });
    const [file, args, options] = vi.mocked(execFileSync).mock.calls[0];
    expect(file).toBe('C:/Runtime/pwsh.exe');
    expect(args).toEqual(['-NoProfile', '-NonInteractive', '-Command', expect.stringContaining(`Get-Process -Id ${process.pid};`)]);
    expect(options).toMatchObject({ windowsHide: true, timeout: 15_000 });
    vi.mocked(execFileSync).mockReturnValue('{"affinity":4095,"priority":"Normal"}');
    expect(() => applyCpuAllocation({ affinity: 3, powerShell: 'pwsh.exe' })).toThrow('did not match');
  });
  it('refuses unsupported hosts and failed application instead of claiming isolation', () => {
    host.platform = 'linux';
    expect(() => applyCpuAllocation({ affinity: 3, powerShell: 'pwsh.exe' })).toThrow('only on Windows');
    expect(execFileSync).not.toHaveBeenCalled();
    host.platform = 'win32';
    vi.mocked(execFileSync).mockImplementation(() => { throw new Error('denied'); });
    expect(() => applyCpuAllocation({ affinity: 3, powerShell: 'pwsh.exe' })).toThrow('denied');
  });
});
