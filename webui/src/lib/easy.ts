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
  sourceFormat?: 'uri-list' | 'sing-box-json' | 'xray-json' | 'mihomo-yaml' | string;
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

const BIN = '/data/adb/box/bin/box4easy';

function q(value: string) {
  return `'${value.split("'").join(`'\\''`)}'`;
}

function extractJSON(text: string) {
  const lines = text.split(/\r?\n/).map(v => v.trim()).filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      return JSON.parse(lines[i]);
    } catch { /* continue */ }
  }
  throw new Error(text || 'box4easy returned no JSON');
}

async function run(args: string[]): Promise<EasyState> {
  if (typeof exec !== 'function') throw new Error('KernelSU bridge unavailable');
  const result = await exec(`${q(BIN)} ${args.map(q).join(' ')}`);
  const stdout = String(result.stdout ?? '').trim();
  const stderr = String(result.stderr ?? '').trim();
  if (!stdout) {
    const payload = extractJSON(stderr);
    throw new Error(payload?.error || stderr || 'box4easy failed');
  }
  return extractJSON(stdout) as EasyState;
}

export const easyBridge = {
  state: () => run(['state']),
  ensureCore: (core: EasyCore) => run(['ensure-core', '--core', core]),
  enable: (previousCore: string) => run(['enable', '--previous-core', previousCore]),
  disable: () => run(['disable']),
  addSubscription: (name: string, url: string) => run(['add-subscription', '--name', name, '--url', url]),
  updateSubscription: (id: string) => run(['update-subscription', '--id', id]),
  updateAll: () => run(['update-all']),
  removeSubscription: (id: string) => run(['remove-subscription', '--id', id]),
  addServer: (uri: string, name = '') => run(['add-server', '--uri', uri, '--name', name]),
  removeServer: (id: string) => run(['remove-server', '--id', id]),
  setRouting: (id: string) => run(['set-routing', '--id', id || 'off']),
  setMode: (mode: EasyMode) => run(['set-mode', '--mode', mode]),
  setCore: (core: EasyCore) => run(['set-core', '--core', core]),
  selectNode: (ref: string) => run(['select-node', '--id', ref]),
  addChain: (name: string, hops: string[]) => run(['add-chain', '--name', name, '--hops', hops.join(',')]),
  removeChain: (id: string) => run(['remove-chain', '--id', id]),
  toggleChain: (id: string) => run(['toggle-chain', '--id', id]),
  rebuild: () => run(['rebuild']),
};
