import { exec } from 'kernelsu';

export type EasyMode = 'routing' | 'global' | 'direct';
export type EasyCore = 'sing-box' | 'xray' | 'v2ray' | 'mihomo';

export interface EasyServer {
  id: string;
  name: string;
  uri?: string;
  sourceSubscription?: string;
  proxy?: Record<string, unknown>;
  rawKind?: 'sing-box' | 'xray';
  raw?: Record<string, unknown>;
}

export interface EasySubscription {
  id: string;
  name: string;
  url: string;
  providerKind: 'http' | 'file' | 'json';
  providerPath?: string;
  sourceFormat?: string;
  userAgent?: string;
  routingId?: string;
  lastUpdate?: string;
  lastError?: string;
  nodeCountHint?: number;
  nodes?: EasyServer[];
}

export interface EasyRouting {
  id: string;
  name: string;
  autoEnable: boolean;
  sourceSubscription?: string;
  raw: unknown;
}

export interface EasyChain {
  id: string;
  name: string;
  hops: string[];
  enabled: boolean;
}

export interface EasyState {
  version: number;
  easyEnabled: boolean;
  previousCore?: string;
  core: EasyCore;
  mode: EasyMode;
  activeRouting?: string;
  selectedNode?: string;
  subscriptions: EasySubscription[];
  servers: EasyServer[];
  routings: EasyRouting[];
  chains: EasyChain[];
  updatedAt?: string;
}

export interface LatencyResult {
  ok: boolean;
  ms?: number;
  method?: 'icmp';
  error?: string;
}

const BIN = '/data/adb/box/bin/box4easy';

function q(value: string) {
  return `'${value.split("'").join(`'\\''`)}'`;
}

function extractJSON(text: string) {
  const lines = text.split(/\r?\n/).map(v => v.trim()).filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      return JSON.parse(lines[i]);
    } catch { /* keep scanning */ }
  }
  throw new Error(text || 'Box4Easy не вернул JSON');
}

async function shell(command: string) {
  if (typeof exec !== 'function') throw new Error('KernelSU bridge недоступен');
  return exec(command);
}

async function run<T = EasyState>(args: string[]): Promise<T> {
  const result = await shell(`${q(BIN)} ${args.map(q).join(' ')}`);
  const stdout = String(result.stdout ?? '').trim();
  const stderr = String(result.stderr ?? '').trim();
  if (!stdout) {
    try {
      const payload = extractJSON(stderr);
      throw new Error(payload?.error || stderr || 'Box4Easy: ошибка выполнения');
    } catch (e) {
      if (e instanceof Error && e.message !== stderr) throw e;
      throw new Error(stderr || 'Box4Easy: ошибка выполнения');
    }
  }
  return extractJSON(stdout) as T;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function firstString(...values: unknown[]) {
  for (const value of values) if (typeof value === 'string' && value.trim()) return value.trim();
  return '';
}

export function nodeHost(node: EasyServer) {
  const proxy = record(node.proxy);
  const raw = record(node.raw);
  const settings = record(raw?.settings);
  const vnext = Array.isArray(settings?.vnext) ? record(settings?.vnext[0]) : undefined;
  const servers = Array.isArray(settings?.servers) ? record(settings?.servers[0]) : undefined;
  return firstString(proxy?.server, proxy?.address, raw?.server, raw?.address, vnext?.address, servers?.address);
}

export function nodeProtocol(node: EasyServer) {
  const proxy = record(node.proxy);
  const raw = record(node.raw);
  return firstString(proxy?.type, raw?.type, raw?.protocol, node.rawKind, 'proxy');
}

export async function pingNode(node: EasyServer): Promise<LatencyResult> {
  const host = nodeHost(node);
  if (!host) return { ok: false, error: 'Адрес узла не найден' };
  const result = await shell(`(ping -c 1 -W 2 ${q(host)} 2>&1 || toybox ping -c 1 -W 2 ${q(host)} 2>&1 || true) | tail -n 8`);
  const text = `${String(result.stdout ?? '')}\n${String(result.stderr ?? '')}`;
  const match = text.match(/time[=<]([0-9.]+)\s*ms/i);
  if (!match) return { ok: false, error: /unknown host|bad address/i.test(text) ? 'DNS' : 'Нет ответа' };
  return { ok: true, ms: Math.max(1, Math.round(Number(match[1]))), method: 'icmp' };
}

export const easyBridge = {
  state: () => run<EasyState>(['state']),
  ensureCore: (core: EasyCore) => run<EasyState>(['ensure-core', '--core', core]),
  enable: (previousCore: string) => run<EasyState>(['enable', '--previous-core', previousCore]),
  disable: () => run<EasyState>(['disable']),
  addSubscription: (name: string, url: string) => run<EasyState>(['add-subscription', '--name', name, '--url', url]),
  updateSubscription: (id: string) => run<EasyState>(['update-subscription', '--id', id]),
  updateAll: () => run<EasyState>(['update-all']),
  removeSubscription: (id: string) => run<EasyState>(['remove-subscription', '--id', id]),
  addServer: (uri: string, name = '') => run<EasyState>(['add-server', '--uri', uri, '--name', name]),
  removeServer: (id: string) => run<EasyState>(['remove-server', '--id', id]),
  setRouting: (id: string) => run<EasyState>(['set-routing', '--id', id || 'off']),
  setMode: (mode: EasyMode) => run<EasyState>(['set-mode', '--mode', mode]),
  setCore: (core: EasyCore) => run<EasyState>(['set-core', '--core', core]),
  selectNode: (ref: string) => run<EasyState>(['select-node', '--id', ref]),
  addChain: (name: string, hops: string[]) => run<EasyState>(['add-chain', '--name', name, '--hops', hops.join(',')]),
  removeChain: (id: string) => run<EasyState>(['remove-chain', '--id', id]),
  toggleChain: (id: string) => run<EasyState>(['toggle-chain', '--id', id]),
  rebuild: () => run<EasyState>(['rebuild']),
};
