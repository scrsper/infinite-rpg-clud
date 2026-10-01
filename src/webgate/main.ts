import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { WebGateway } from './gateway';

/**
 * Start the web gateway for one client profile.
 *
 *   tsx src/webgate/main.ts --profile web-preview [--port 7470] [--static dist-web]
 *                           [--profile-dir <dir>] [--state-dir <dir>] [--allow-upstream host:port]
 *                           [--dev-origin http://127.0.0.1:5180]
 *
 * The profile is the same JSON the native Unreal client uses (%LOCALAPPDATA%\TornVeil\Client\<name>.json):
 * `{ server: "127.0.0.1:7460", account, token, ... }`. The token is read here and only here.
 * The gateway writes `gateway.json` (port, pid, operator secret) to its state directory so the launcher
 * can mint one-time launch links; that file is per-user local state and is never committed.
 */
const argv = process.argv.slice(2);
const flag = (name: string) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : undefined; };
const many = (name: string) => argv.flatMap((a, i) => a === `--${name}` ? [argv[i + 1]] : []);
const fail = (message: string): never => { process.stderr.write(`error: ${message}\n`); process.exit(1); };

const profileName = flag('profile') ?? fail('--profile <name> is required (a client profile with the account credential)');
if (!/^[A-Za-z0-9_-]+$/.test(profileName)) fail('profile names are letters, digits, - and _');
const profileDir = resolve(flag('profile-dir') ?? join(process.env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local'), 'TornVeil', 'Client'));
const profilePath = join(profileDir, `${profileName}.json`);
if (!existsSync(profilePath)) fail(`profile not found: ${profilePath}`);
const profile = JSON.parse(readFileSync(profilePath, 'utf8')) as { server?: string; account?: string; token?: string };
if (!profile.server || !profile.account || !profile.token) fail(`profile ${profileName} needs server, account and token`);
const [upHost, upPortText] = String(profile.server).split(':');
const upPort = Number(upPortText);
if (!upHost || !Number.isInteger(upPort)) fail(`profile server must be host:port (got ${profile.server})`);

const stateDir = resolve(flag('state-dir') ?? join(homedir(), 'TornVeilAlpha', 'web-gateway'));
mkdirSync(stateDir, { recursive: true });
const staticDir = flag('static') ? resolve(flag('static')!) : resolve('dist-web');

const gateway = new WebGateway({
  port: Number(flag('port') ?? 7470),
  host: flag('host') ?? '127.0.0.1',
  upstream: { host: upHost, port: upPort },
  upstreamAllow: [`${upHost}:${upPort}`, ...many('allow-upstream')],
  credentials: { account: profile.account!, token: profile.token! },
  staticDir: existsSync(staticDir) ? staticDir : undefined,
  extraOrigins: many('dev-origin'),
  log: (level, event, data) => process.stdout.write(JSON.stringify({ t: new Date().toISOString(), level, event, ...data }) + '\n'),
});
await gateway.listen();
writeFileSync(join(stateDir, 'gateway.json'), JSON.stringify({ pid: process.pid, port: gateway.port, origin: gateway.url, profile: profileName, staticDir, upstream: profile.server, operator: gateway.operatorSecret, startedAtIso: new Date().toISOString() }, null, 2));
process.stdout.write(JSON.stringify({ t: new Date().toISOString(), level: 'info', event: 'gateway_ready', origin: gateway.url, staticDir: existsSync(staticDir) ? staticDir : null, state: join(stateDir, 'gateway.json') }) + '\n');
const stop = async () => { await gateway.close(); process.exit(0); };
process.on('SIGINT', stop); process.on('SIGTERM', stop);
