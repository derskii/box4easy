import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity, ArrowDown, Check, ChevronRight, CircleGauge, Download, Gauge, Globe2,
  House, Layers3, Link2, LoaderCircle, Network, Power, Route, Search, Server,
  Settings2, ShieldCheck, Trash2,
} from 'lucide-react';
import type { BoxConfig, BoxStatus } from '@/types/box';
import { boxBridge, notify } from '@/lib/bridge';
import {
  easyBridge, nodeProtocol, pingNode, type EasyCore, type EasyMode, type EasyServer,
  type EasyState, type LatencyResult,
} from '@/lib/easy';

type Props = {
  status: BoxStatus;
  config: BoxConfig;
  actionLoading: string | null;
  handleServiceAction: (action: string) => Promise<void>;
};

type View = 'home' | 'nodes' | 'settings';
type NodeRow = { ref: string; label: string; group: string; node: EasyServer };
type TestingLatency = { ok: false; testing: true; error?: string };
type LatencyMap = Record<string, LatencyResult | TestingLatency>;

const EMPTY: EasyState = {
  version: 3, easyEnabled: false, core: 'sing-box', mode: 'routing',
  subscriptions: [], servers: [], routings: [], chains: [],
};

const CORE_INFO: Array<{ value: EasyCore; title: string; subtitle: string; recommended?: boolean }> = [
  { value: 'sing-box', title: 'sing-box', subtitle: 'JSON · VLESS · Hysteria2 · Reality · chains', recommended: true },
  { value: 'xray', title: 'Xray', subtitle: 'VLESS · VMess · Trojan · Reality' },
  { value: 'v2ray', title: 'V2Ray', subtitle: 'V2Fly compatibility' },
  { value: 'mihomo', title: 'Mihomo', subtitle: 'Только legacy Clash/YAML' },
];

function compatible(node: EasyServer, core: EasyCore) {
  if (core === 'sing-box') return node.rawKind !== 'xray';
  if (core === 'xray' || core === 'v2ray') return node.rawKind !== 'sing-box' && String(node.proxy?.type || '').toLowerCase() !== 'hysteria2';
  return !node.rawKind;
}

function timeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => window.setTimeout(() => reject(new Error(`${label}: превышено время ожидания`)), ms)),
  ]);
}

function formatLatency(value?: LatencyResult | TestingLatency) {
  if (!value) return '—';
  if ('testing' in value && value.testing) return '…';
  if (value.ok && value.ms != null) return `${value.ms} ms`;
  return ('error' in value && value.error) ? value.error : 'нет ответа';
}

function Switch({ value, onChange, label, note }: { value: boolean; onChange: (v: boolean) => void; label: string; note?: string }) {
  return <button type="button" onClick={() => onChange(!value)} className="flex w-full items-center justify-between gap-4 py-3 text-left">
    <span><span className="block text-sm font-semibold">{label}</span>{note && <span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">{note}</span>}</span>
    <span className={`relative h-8 w-14 shrink-0 rounded-full transition ${value ? 'bg-indigo-600' : 'bg-slate-300 dark:bg-slate-700'}`}>
      <span className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow-sm transition-all ${value ? 'left-7' : 'left-1'}`} />
    </span>
  </button>;
}

export function TabEasy({ status, config, actionLoading, handleServiceAction }: Props) {
  const [view, setView] = useState<View>('home');
  const [state, setState] = useState<EasyState>(EMPTY);
  const [busy, setBusy] = useState<string | null>('load');
  const [busyText, setBusyText] = useState('Читаю состояние');
  const [input, setInput] = useState('');
  const [name, setName] = useState('');
  const [query, setQuery] = useState('');
  const [latency, setLatency] = useState<LatencyMap>({});
  const [chainName, setChainName] = useState('');
  const [hopA, setHopA] = useState('');
  const [hopB, setHopB] = useState('');
  const [network, setNetwork] = useState({
    proxyMode: Number(config.PROXY_MODE ?? 0), dns: Number(config.DNS_HIJACK_ENABLE ?? 1) !== 0,
    wifi: Number(config.PROXY_WIFI ?? 1) === 1, mobile: Number(config.PROXY_MOBILE ?? 1) === 1,
    udp: Number(config.PROXY_UDP ?? 1) === 1, ipv6: Number(config.PROXY_IPV6 ?? 0),
    blockQuic: Number(config.BLOCK_QUIC ?? 0) === 1, performance: Number(config.PERFORMANCE_MODE ?? 0) === 1,
  });

  const refresh = useCallback(async () => {
    try { setState(await easyBridge.state()); }
    catch (e) { notify(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(null); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  const nodes = useMemo<NodeRow[]>(() => {
    const rows: NodeRow[] = [];
    state.servers.forEach(n => rows.push({ ref: `local:${n.id}`, label: n.name, group: 'Локальные', node: n }));
    state.subscriptions.forEach(s => (s.nodes || []).forEach(n => rows.push({ ref: `sub:${s.id}:${n.id}`, label: n.name, group: s.name, node: n })));
    return rows.filter(r => compatible(r.node, state.core));
  }, [state]);

  const filteredNodes = useMemo(() => {
    const q = query.trim().toLocaleLowerCase();
    const rows = q ? nodes.filter(n => `${n.label} ${n.group} ${nodeProtocol(n.node)}`.toLocaleLowerCase().includes(q)) : nodes;
    return [...rows].sort((a, b) => {
      const av = latency[a.ref]; const bv = latency[b.ref];
      const am = av && !('testing' in av) && av.ok ? av.ms ?? 999999 : 999999;
      const bm = bv && !('testing' in bv) && bv.ok ? bv.ms ?? 999999 : 999999;
      return am - bm;
    });
  }, [latency, nodes, query]);

  useEffect(() => {
    if (!hopA && nodes[0]) setHopA(nodes[0].ref);
    if (!hopB && nodes[1]) setHopB(nodes[1].ref);
  }, [hopA, hopB, nodes]);

  const run = useCallback(async (key: string, text: string, fn: () => Promise<void>) => {
    setBusy(key); setBusyText(text);
    try { await fn(); }
    catch (e) { notify(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(null); }
  }, []);

  const activate = useCallback(async (candidate: EasyState, desiredCore = candidate.core) => {
    const previousCore = config.bin_name || status.bin_name || 'sing-box';
    let changedBin = false;
    try {
      setBusyText(`Готовлю ${desiredCore}`);
      let next = candidate;
      if (next.core !== desiredCore) next = await timeout(easyBridge.setCore(desiredCore), 150000, 'Установка core');
      else await timeout(easyBridge.ensureCore(desiredCore), 150000, 'Установка core');
      if (!next.easyEnabled) {
        setBusyText('Проверяю конфигурацию');
        next = await timeout(easyBridge.enable(previousCore), 30000, 'Проверка конфигурации');
      }
      setBusyText('Переключаю сетевой движок');
      await boxBridge.setConfig('bin_name', desiredCore);
      changedBin = true;
      await handleServiceAction(status.running ? 'restart' : 'start');
      setState(next);
      notify(`${desiredCore}: активен`);
    } catch (e) {
      if (changedBin && previousCore !== desiredCore) {
        try { await boxBridge.setConfig('bin_name', previousCore); if (status.running) await boxBridge.service('restart'); }
        catch { /* rollback best effort */ }
      }
      throw e;
    }
  }, [config.bin_name, handleServiceAction, status.bin_name, status.running]);

  const importValue = async () => {
    const value = input.trim();
    if (!value) return;
    await run('import', 'Скачиваю и разбираю подписку', async () => {
      let next = state;
      if (/^https?:\/\//i.test(value)) next = await timeout(easyBridge.addSubscription(name.trim(), value), 55000, 'Импорт подписки');
      else {
        const uris = value.split(/\s+/).filter(v => /^(vless|vmess|trojan|hysteria2|hy2|ss|socks5?|socks):\/\//i.test(v));
        if (!uris.length) throw new Error('Вставь URL подписки или URI сервера');
        for (const uri of uris) next = await easyBridge.addServer(uri, uris.length === 1 ? name.trim() : '');
      }
      setState(next);
      const count = next.subscriptions.reduce((sum, s) => sum + (s.nodes?.length || 0), 0) + next.servers.length;
      if (count < 1) throw new Error('Подписка распознана, но прокси-узлы не найдены');
      setBusyText(`Найдено ${count} узлов · проверяю core`);
      await activate(next, next.core || 'sing-box');
      setInput(''); setName(''); setView('nodes');
    });
  };

  const switchCore = async (core: EasyCore) => {
    if (core === state.core) return;
    await run(`core:${core}`, `Устанавливаю ${core}`, async () => {
      const before = state.core;
      const previousBin = config.bin_name || status.bin_name || before;
      const next = await timeout(easyBridge.setCore(core), 150000, 'Установка core');
      if (state.easyEnabled) {
        try { await boxBridge.setConfig('bin_name', core); await handleServiceAction(status.running ? 'restart' : 'start'); }
        catch (e) {
          await easyBridge.setCore(before); await boxBridge.setConfig('bin_name', previousBin);
          if (status.running) await boxBridge.service('restart');
          throw e;
        }
      }
      setState(next); notify(`Ядро: ${core}`);
    });
  };

  const selectNode = async (ref: string) => run('select-node', 'Переключаю узел', async () => {
    const next = await easyBridge.selectNode(ref); setState(next); if (status.running) await handleServiceAction('restart');
  });

  const testNode = async (row: NodeRow) => {
    setLatency(prev => ({ ...prev, [row.ref]: { ok: false, testing: true } }));
    const result = await pingNode(row.node).catch(e => ({ ok: false, error: e instanceof Error ? e.message : String(e) } as LatencyResult));
    setLatency(prev => ({ ...prev, [row.ref]: result }));
  };

  const testAll = async () => {
    if (!nodes.length) return;
    setBusy('ping-all'); setBusyText(`Проверяю ${nodes.length} узлов`);
    const queue = [...nodes];
    const workers = Array.from({ length: Math.min(6, queue.length) }, async () => {
      for (;;) { const row = queue.shift(); if (!row) return; await testNode(row); }
    });
    await Promise.all(workers); setBusy(null);
  };

  const saveNetwork = async () => run('network', 'Применяю сетевые настройки', async () => {
    await boxBridge.setNumber('PROXY_MODE', network.proxyMode);
    await boxBridge.setNumber('DNS_HIJACK_ENABLE', network.dns ? 1 : 0);
    await boxBridge.toggle('PROXY_WIFI', network.wifi ? 1 : 0);
    await boxBridge.toggle('PROXY_MOBILE', network.mobile ? 1 : 0);
    await boxBridge.toggle('PROXY_UDP', network.udp ? 1 : 0);
    await boxBridge.setNumber('PROXY_IPV6', network.ipv6);
    await boxBridge.toggle('BLOCK_QUIC', network.blockQuic ? 1 : 0);
    await boxBridge.toggle('PERFORMANCE_MODE', network.performance ? 1 : 0);
    if (status.running) await handleServiceAction('restart');
    notify('Сетевые настройки применены');
  });

  const stopEasy = async () => run('disable', 'Возвращаю предыдущую конфигурацию', async () => {
    const next = await easyBridge.disable();
    const previous = next.previousCore || state.previousCore;
    if (previous) await boxBridge.setConfig('bin_name', previous);
    if (status.running) await handleServiceAction('restart');
    setState(next);
  });

  const bg = 'bg-[#f7f7ff] text-slate-900 dark:bg-[#101014] dark:text-slate-100';
  const card = 'rounded-[28px] border border-slate-200/70 bg-white shadow-sm dark:border-white/10 dark:bg-[#1b1b20]';
  if (busy === 'load') return <div className={`flex h-full items-center justify-center ${bg}`}><LoaderCircle className="animate-spin text-indigo-600" /></div>;

  return <div className={`relative min-h-full pb-28 ${bg}`}>
    <div className="mx-auto max-w-md px-4 pt-3">
      {view === 'home' && <div className="space-y-4">
        <section className="relative overflow-hidden rounded-[32px] bg-indigo-600 p-6 text-white shadow-lg">
          <div className="absolute -right-12 -top-14 h-40 w-40 rounded-full bg-white/10" />
          <div className="relative flex items-start justify-between gap-4"><div><div className="mb-2 flex items-center gap-2 text-xs font-semibold text-indigo-100"><ShieldCheck size={16}/> ROOT · TPROXY</div><h2 className="text-2xl font-black tracking-tight">{status.running ? 'Защита включена' : 'Прокси остановлен'}</h2><p className="mt-2 text-sm text-indigo-100">{state.core} · {nodes.length} узлов · {state.subscriptions.length} подписок</p></div><div className={`flex h-14 w-14 items-center justify-center rounded-full ${status.running ? 'bg-emerald-400 text-emerald-950' : 'bg-white/15'}`}><Power size={26}/></div></div>
          <div className="relative mt-6 grid grid-cols-3 gap-2"><button disabled={Boolean(actionLoading)} onClick={() => void handleServiceAction(status.running ? 'stop' : 'start')} className="rounded-2xl bg-white/15 px-2 py-3 text-xs font-bold backdrop-blur">{status.running ? 'Остановить' : 'Запустить'}</button><button onClick={() => void handleServiceAction('restart')} className="rounded-2xl bg-white/15 px-2 py-3 text-xs font-bold backdrop-blur">Рестарт</button><button onClick={() => setView('settings')} className="rounded-2xl bg-white/15 px-2 py-3 text-xs font-bold backdrop-blur">Настройки</button></div>
        </section>

        <section className={`${card} p-5`}><div className="flex items-center gap-3"><div className="rounded-2xl bg-indigo-100 p-3 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300"><Link2 size={22}/></div><div><h3 className="font-bold">Добавить подписку</h3><p className="text-xs text-slate-500 dark:text-slate-400">URL, JSON, Base64 или URI</p></div></div><input value={name} onChange={e => setName(e.target.value)} placeholder="Название · необязательно" className="mt-4 w-full rounded-2xl bg-slate-100 px-4 py-3 text-sm outline-none ring-indigo-500 focus:ring-2 dark:bg-white/5"/><textarea value={input} onChange={e => setInput(e.target.value)} rows={4} placeholder={'Вставь ссылку подписки\nили vless://… / vmess://… / hysteria2://…'} className="mt-2 w-full resize-none rounded-2xl bg-slate-100 px-4 py-3 text-sm outline-none ring-indigo-500 focus:ring-2 dark:bg-white/5"/><button disabled={!input.trim() || Boolean(busy)} onClick={() => void importValue()} className="mt-3 flex w-full items-center justify-center gap-2 rounded-[20px] bg-indigo-600 py-3.5 text-sm font-black text-white shadow-md transition active:scale-[.98] disabled:opacity-40"><Download size={18}/>Импортировать и включить</button><p className="mt-3 text-xs leading-relaxed text-slate-500 dark:text-slate-400">Сначала подписка разбирается и проверяется. TPROXY переключается только после успешного импорта.</p></section>

        <section className={`${card} p-5`}><div className="flex items-center justify-between"><div><h3 className="font-bold">Маршрутизация</h3><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Happ routing подхватывается автоматически</p></div><Route className="text-indigo-500"/></div><div className="mt-4 grid grid-cols-3 gap-1 rounded-2xl bg-slate-100 p-1 dark:bg-white/5">{([['routing','Правила'],['global','Весь трафик'],['direct','Напрямую']] as Array<[EasyMode,string]>).map(([m,label]) => <button key={m} onClick={() => void run(`mode:${m}`, 'Меняю режим', async () => { const next = await easyBridge.setMode(m); setState(next); if (status.running) await handleServiceAction('restart'); })} className={`rounded-xl px-1 py-2.5 text-[11px] font-bold transition ${state.mode === m ? 'bg-white text-indigo-700 shadow-sm dark:bg-slate-700 dark:text-indigo-300' : 'text-slate-500'}`}>{label}</button>)}</div>{state.mode === 'routing' && state.routings.length > 0 && <select value={state.activeRouting || ''} onChange={e => void run('routing', 'Применяю routing', async () => { const next = await easyBridge.setRouting(e.target.value); setState(next); if (status.running) await handleServiceAction('restart'); })} className="mt-3 w-full rounded-2xl bg-slate-100 px-4 py-3 text-sm dark:bg-white/5"><option value="">Базовые правила</option>{state.routings.map(r => <option key={r.id} value={r.id}>{r.name}{r.autoEnable ? ' · AUTO' : ''}</option>)}</select>}</section>

        <section className={`${card} divide-y divide-slate-100 p-2 dark:divide-white/5`}><button onClick={() => setView('nodes')} className="flex w-full items-center gap-3 rounded-2xl p-3 text-left"><div className="rounded-2xl bg-emerald-100 p-3 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"><Gauge size={20}/></div><div className="flex-1"><b className="text-sm">Узлы и задержка</b><p className="text-xs text-slate-500 dark:text-slate-400">{nodes.length ? `${nodes.length} доступно` : 'Пока пусто'}</p></div><ChevronRight size={18} className="text-slate-400"/></button><button onClick={() => setView('settings')} className="flex w-full items-center gap-3 rounded-2xl p-3 text-left"><div className="rounded-2xl bg-amber-100 p-3 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300"><Settings2 size={20}/></div><div className="flex-1"><b className="text-sm">Core и сеть</b><p className="text-xs text-slate-500 dark:text-slate-400">{state.core} · {network.proxyMode === 2 ? 'REDIRECT' : network.proxyMode === 1 ? 'TPROXY' : 'AUTO TPROXY'}</p></div><ChevronRight size={18} className="text-slate-400"/></button></section>
      </div>}

      {view === 'nodes' && <div className="space-y-4"><div className="flex items-center justify-between px-1"><div><h2 className="text-2xl font-black">Узлы</h2><p className="text-xs text-slate-500 dark:text-slate-400">Выбор работает независимо от Clash UI</p></div><button onClick={() => void testAll()} disabled={!nodes.length || busy === 'ping-all'} className="flex items-center gap-2 rounded-full bg-indigo-100 px-4 py-2 text-xs font-bold text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300"><CircleGauge size={16}/>Проверить все</button></div><div className="relative"><Search size={18} className="absolute left-4 top-3.5 text-slate-400"/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Страна, сервер, протокол…" className="w-full rounded-[22px] bg-white py-3 pl-11 pr-4 text-sm shadow-sm outline-none ring-indigo-500 focus:ring-2 dark:bg-[#1b1b20]"/></div>
        {filteredNodes.length === 0 ? <section className={`${card} p-8 text-center`}><Server className="mx-auto text-slate-400" size={36}/><h3 className="mt-3 font-bold">Узлов нет</h3><p className="mt-1 text-sm text-slate-500">Импортируй подписку на главной. Узлы появятся здесь ещё до запуска core.</p></section> : <div className="space-y-2">{filteredNodes.map(row => { const selected = state.selectedNode === row.ref; const l = latency[row.ref]; return <section key={row.ref} className={`${card} flex items-center gap-3 p-3 ${selected ? 'ring-2 ring-indigo-500' : ''}`}><button onClick={() => void selectNode(row.ref)} className="flex min-w-0 flex-1 items-center gap-3 text-left"><div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${selected ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 dark:bg-white/5 dark:text-slate-300'}`}>{selected ? <Check size={20}/> : <Globe2 size={20}/>}</div><div className="min-w-0"><b className="block truncate text-sm">{row.label}</b><span className="block truncate text-[11px] text-slate-500 dark:text-slate-400">{row.group} · {nodeProtocol(row.node)}</span></div></button><button onClick={() => void testNode(row)} className={`min-w-[78px] rounded-2xl px-3 py-2 text-xs font-bold ${l && !('testing' in l) && l.ok ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300' : 'bg-slate-100 text-slate-600 dark:bg-white/5 dark:text-slate-300'}`}>{formatLatency(l)}</button></section>; })}</div>}
        {nodes.length >= 2 && <section className={`${card} p-5`}><div className="flex items-center gap-3"><div className="rounded-2xl bg-orange-100 p-3 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300"><Layers3 size={20}/></div><div><h3 className="font-bold">Цепочка прокси</h3><p className="text-xs text-slate-500">A → B → Internet</p></div></div><input value={chainName} onChange={e => setChainName(e.target.value)} placeholder="Название цепочки" className="mt-4 w-full rounded-2xl bg-slate-100 px-4 py-3 text-sm dark:bg-white/5"/><select value={hopA} onChange={e => setHopA(e.target.value)} className="mt-2 w-full rounded-2xl bg-slate-100 px-4 py-3 text-sm dark:bg-white/5">{nodes.map(n => <option key={n.ref} value={n.ref}>A · {n.group} · {n.label}</option>)}</select><div className="flex justify-center py-1 text-slate-400"><ArrowDown size={18}/></div><select value={hopB} onChange={e => setHopB(e.target.value)} className="w-full rounded-2xl bg-slate-100 px-4 py-3 text-sm dark:bg-white/5">{nodes.map(n => <option key={n.ref} value={n.ref}>B · {n.group} · {n.label}</option>)}</select><button disabled={!hopA || !hopB || hopA === hopB} onClick={() => void run('chain', 'Создаю цепочку', async () => { const next = await easyBridge.addChain(chainName.trim(), [hopA, hopB]); setState(next); setChainName(''); if (status.running) await handleServiceAction('restart'); })} className="mt-3 w-full rounded-2xl bg-orange-500 py-3 text-xs font-black text-white disabled:opacity-40">Создать цепочку</button>{state.chains.map(c => <div key={c.id} className="mt-2 flex items-center gap-2 rounded-2xl bg-slate-100 p-3 dark:bg-white/5"><span className="min-w-0 flex-1 truncate text-xs font-bold">{c.name}</span><button onClick={() => void run('chain-toggle','Переключаю цепочку',async()=>{const next=await easyBridge.toggleChain(c.id);setState(next);if(status.running)await handleServiceAction('restart');})} className={`rounded-full px-3 py-1 text-[10px] font-bold ${c.enabled?'bg-emerald-100 text-emerald-700':'bg-slate-200 text-slate-600'}`}>{c.enabled?'ON':'OFF'}</button><button onClick={() => void run('chain-delete','Удаляю цепочку',async()=>{const next=await easyBridge.removeChain(c.id);setState(next);})} className="rounded-full p-2 text-rose-500"><Trash2 size={15}/></button></div>)}</section>}
      </div>}

      {view === 'settings' && <div className="space-y-4"><div className="px-1"><h2 className="text-2xl font-black">Core и сеть</h2><p className="text-xs text-slate-500 dark:text-slate-400">Без скрытых Clash-настроек</p></div><section className={`${card} p-4`}><h3 className="px-1 pb-3 font-bold">Движок</h3><div className="grid grid-cols-2 gap-2">{CORE_INFO.map(c => <button key={c.value} disabled={Boolean(busy)} onClick={() => void switchCore(c.value)} className={`relative rounded-[22px] border p-4 text-left transition ${state.core === c.value ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-500/10' : 'border-slate-200 dark:border-white/10'}`}><div className="flex items-center justify-between"><Server size={19} className={state.core===c.value?'text-indigo-600':'text-slate-500'}/>{state.core===c.value&&<Check size={17} className="text-indigo-600"/>}</div><b className="mt-3 block text-sm">{c.title}</b><span className="mt-1 block text-[10px] leading-relaxed text-slate-500">{c.subtitle}</span>{c.recommended&&<span className="mt-2 inline-block rounded-full bg-indigo-100 px-2 py-1 text-[9px] font-bold text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300">РЕКОМЕНДУЕТСЯ</span>}</button>)}</div></section>
        <section className={`${card} p-4`}><div className="flex items-center gap-3 px-1 pb-3"><Network size={20} className="text-indigo-600"/><div><h3 className="font-bold">Прозрачный прокси</h3><p className="text-xs text-slate-500">Root firewall routing, не Android VPN</p></div></div><div className="grid grid-cols-3 gap-1 rounded-2xl bg-slate-100 p-1 dark:bg-white/5">{[[0,'AUTO'],[1,'TPROXY'],[2,'REDIRECT']].map(([value,label]) => <button key={value} onClick={()=>setNetwork(v=>({...v,proxyMode:Number(value)}))} className={`rounded-xl py-2.5 text-xs font-bold ${network.proxyMode===value?'bg-white text-indigo-700 shadow-sm dark:bg-slate-700 dark:text-indigo-300':'text-slate-500'}`}>{label}</button>)}</div><div className="mt-2 divide-y divide-slate-100 dark:divide-white/5"><Switch value={network.wifi} onChange={v=>setNetwork(n=>({...n,wifi:v}))} label="Wi‑Fi" note="Перехватывать трафик wlan"/><Switch value={network.mobile} onChange={v=>setNetwork(n=>({...n,mobile:v}))} label="Мобильная сеть"/><Switch value={network.udp} onChange={v=>setNetwork(n=>({...n,udp:v}))} label="UDP" note="Игры, QUIC, Hysteria2"/><Switch value={network.dns} onChange={v=>setNetwork(n=>({...n,dns:v}))} label="DNS hijack"/><Switch value={network.blockQuic} onChange={v=>setNetwork(n=>({...n,blockQuic:v}))} label="Блокировать прямой QUIC"/><Switch value={network.performance} onChange={v=>setNetwork(n=>({...n,performance:v}))} label="Performance mode"/></div><div className="mt-3"><label className="text-xs font-semibold text-slate-500">IPv6</label><select value={network.ipv6} onChange={e=>setNetwork(n=>({...n,ipv6:Number(e.target.value)}))} className="mt-1 w-full rounded-2xl bg-slate-100 px-4 py-3 text-sm dark:bg-white/5"><option value={0}>Не проксировать IPv6</option><option value={1}>Проксировать IPv6</option><option value={-1}>Полностью отключить IPv6</option></select></div><button onClick={() => void saveNetwork()} className="mt-4 w-full rounded-2xl bg-indigo-600 py-3 text-sm font-black text-white">Применить сетевые настройки</button></section>
        <section className={`${card} p-4`}><div className="grid grid-cols-2 gap-2 text-xs"><div className="rounded-2xl bg-slate-100 p-3 dark:bg-white/5"><span className="text-slate-500">Core</span><b className="mt-1 block">{status.bin_name}</b></div><div className="rounded-2xl bg-slate-100 p-3 dark:bg-white/5"><span className="text-slate-500">Сервис</span><b className={`mt-1 block ${status.running?'text-emerald-600':'text-rose-500'}`}>{status.running?'RUNNING':'STOPPED'}</b></div><div className="rounded-2xl bg-slate-100 p-3 dark:bg-white/5"><span className="text-slate-500">Transparent proxy</span><b className="mt-1 block">{status.transparent_proxy_running?'ACTIVE':'—'}</b></div><div className="rounded-2xl bg-slate-100 p-3 dark:bg-white/5"><span className="text-slate-500">Mode</span><b className="mt-1 block">{network.proxyMode===2?'REDIRECT':network.proxyMode===1?'TPROXY':'AUTO'}</b></div></div></section>{state.easyEnabled && <button onClick={() => void stopEasy()} className="w-full rounded-[22px] border border-rose-200 bg-rose-50 py-3 text-sm font-bold text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300">Выключить Box4Easy и вернуть предыдущий конфиг</button>}</div>}
    </div>

    {busy && busy !== 'load' && <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/25 p-4 backdrop-blur-[2px]"><div className="mb-20 flex w-full max-w-md items-center gap-4 rounded-[28px] bg-white p-5 shadow-2xl dark:bg-[#24242a]"><div className="rounded-full bg-indigo-100 p-3 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300"><LoaderCircle className="animate-spin" size={22}/></div><div className="min-w-0"><b className="block text-sm">{busyText}</b><span className="mt-1 block text-xs text-slate-500">Не закрывай окно во время применения</span></div></div></div>}

    <nav className="fixed bottom-0 left-1/2 z-40 flex w-full max-w-md -translate-x-1/2 items-center justify-around border-t border-slate-200/70 bg-[#f1eff9]/95 px-3 pb-[max(env(safe-area-inset-bottom),8px)] pt-2 backdrop-blur-xl dark:border-white/10 dark:bg-[#1b1b20]/95">{([{id:'home',label:'Главная',icon:House},{id:'nodes',label:'Узлы',icon:Activity},{id:'settings',label:'Настройки',icon:Settings2}] as const).map(item => { const Icon=item.icon; const active=view===item.id; return <button key={item.id} onClick={()=>setView(item.id)} className={`flex min-w-[92px] flex-col items-center gap-1 rounded-2xl py-1.5 text-[10px] font-bold ${active?'text-indigo-700 dark:text-indigo-300':'text-slate-500'}`}><span className={`rounded-full px-5 py-1 ${active?'bg-indigo-200/70 dark:bg-indigo-500/20':''}`}><Icon size={20}/></span>{item.label}</button>; })}</nav>
  </div>;
}
