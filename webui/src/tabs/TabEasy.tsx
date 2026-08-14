import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowRight, Link2, LoaderCircle, RefreshCw, Route, Server, Trash2 } from 'lucide-react';
import type { BoxConfig, BoxStatus } from '@/types/box';
import { boxBridge, notify } from '@/lib/bridge';
import { easyBridge, type EasyCore, type EasyMode, type EasyServer, type EasyState } from '@/lib/easy';

type Props = {
  status: BoxStatus;
  config: BoxConfig;
  actionLoading: string | null;
  handleServiceAction: (action: string) => Promise<void>;
};

const EMPTY: EasyState = { version: 2, easyEnabled: false, core: 'sing-box', mode: 'routing', subscriptions: [], servers: [], routings: [], chains: [] };
const CORES: Array<{ value: EasyCore; title: string; note: string }> = [
  { value: 'sing-box', title: 'sing-box', note: 'Рекомендуется · JSON · Hysteria2 · chains' },
  { value: 'xray', title: 'Xray', note: 'VLESS · VMess · Trojan · Reality' },
  { value: 'v2ray', title: 'V2Ray', note: 'V2Fly JSON · VMess/VLESS' },
  { value: 'mihomo', title: 'Mihomo', note: 'Clash/YAML compatibility' },
];

function compatible(node: EasyServer, core: EasyCore) {
  if (core === 'sing-box') return node.rawKind !== 'xray';
  if (core === 'xray' || core === 'v2ray') return node.rawKind !== 'sing-box' && String(node.proxy?.type || '').toLowerCase() !== 'hysteria2';
  return !node.rawKind;
}

export function TabEasy({ status, config, handleServiceAction }: Props) {
  const [state, setState] = useState<EasyState>(EMPTY);
  const [input, setInput] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState<string | null>('load');
  const [chainName, setChainName] = useState('');
  const [hopA, setHopA] = useState('');
  const [hopB, setHopB] = useState('');

  const refresh = useCallback(async () => {
    try { setState(await easyBridge.state()); }
    catch (e) { notify(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(null); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  const mutate = useCallback(async (key: string, fn: () => Promise<EasyState>, restart = true) => {
    setBusy(key);
    try {
      const next = await fn();
      setState(next);
      if (restart && status.running) await handleServiceAction('restart');
      return next;
    } catch (e) {
      notify(e instanceof Error ? e.message : String(e));
      return null;
    } finally { setBusy(null); }
  }, [handleServiceAction, status.running]);

  const ensureEnabled = async () => {
    await easyBridge.ensureCore(state.core);
    if (!state.easyEnabled) {
      const previous = config.bin_name || status.bin_name || 'sing-box';
      setState(await easyBridge.enable(previous));
    }
    if (config.bin_name !== state.core) await boxBridge.setConfig('bin_name', state.core);
  };

  const switchCore = async (core: EasyCore) => {
    setBusy(`core:${core}`);
    try {
      await easyBridge.ensureCore(core);
      if (!state.easyEnabled) await easyBridge.enable(config.bin_name || status.bin_name || 'sing-box');
      const next = await easyBridge.setCore(core);
      await boxBridge.setConfig('bin_name', core);
      setState(next);
      if (status.running) await handleServiceAction('restart');
      notify(`Ядро: ${core}`);
    } catch (e) { notify(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(null); }
  };

  const add = async () => {
    const value = input.trim();
    if (!value) return;
    setBusy('add');
    try {
      await ensureEnabled();
      let next: EasyState;
      if (/^https?:\/\//i.test(value)) {
        next = await easyBridge.addSubscription(name.trim(), value);
      } else {
        const uris = value.split(/\s+/).filter(v => /^(vless|vmess|trojan|hysteria2|hy2|ss|socks5?|socks):\/\//i.test(v));
        if (!uris.length) throw new Error('Вставь URL подписки или URI сервера');
        next = state;
        for (const uri of uris) next = await easyBridge.addServer(uri, uris.length === 1 ? name.trim() : '');
      }
      setState(next);
      setInput(''); setName('');
      await handleServiceAction(status.running ? 'restart' : 'start');
      notify('Добавлено и применено');
    } catch (e) { notify(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(null); }
  };

  const nodes = useMemo(() => {
    const all: Array<{ ref: string; label: string; node: EasyServer }> = [];
    state.servers.forEach(n => all.push({ ref: `local:${n.id}`, label: `Local · ${n.name}`, node: n }));
    state.subscriptions.forEach(s => (s.nodes || []).forEach(n => all.push({ ref: `sub:${s.id}:${n.id}`, label: `${s.name} · ${n.name}`, node: n })));
    return all.filter(x => compatible(x.node, state.core));
  }, [state.core, state.servers, state.subscriptions]);

  useEffect(() => {
    if (!hopA && nodes[0]) setHopA(nodes[0].ref);
    if (!hopB && nodes[1]) setHopB(nodes[1].ref);
  }, [hopA, hopB, nodes]);

  if (busy === 'load') return <div className="flex h-full items-center justify-center"><LoaderCircle className="animate-spin text-blue-500" /></div>;

  return <div className="space-y-4 px-4 pb-8 pt-2">
    <section className="rounded-3xl bg-gradient-to-br from-blue-600 to-indigo-700 p-5 text-white shadow-lg">
      <div className="flex items-center justify-between"><div><div className="text-xs text-white/70">BOX4EASY · {state.core}</div><div className="mt-1 text-xl font-black">{status.running ? 'Прокси работает' : 'Прокси остановлен'}</div><div className="mt-1 text-xs text-white/70">{state.subscriptions.length} подписок · {nodes.length} узлов · {state.chains.length} цепочек</div></div><Server size={30} /></div>
      <div className="mt-4 grid grid-cols-3 gap-2 text-xs font-bold"><button className="rounded-xl bg-white/15 py-2" onClick={() => void handleServiceAction(status.running ? 'stop' : 'start')}>{status.running ? 'Стоп' : 'Старт'}</button><button className="rounded-xl bg-white/15 py-2" onClick={() => void handleServiceAction('restart')}>Рестарт</button><button className="rounded-xl bg-white/15 py-2" onClick={() => void mutate('all', () => easyBridge.updateAll())}>Обновить</button></div>
    </section>

    <section className="rounded-3xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"><h3 className="mb-3 font-bold">Ядро</h3><div className="grid grid-cols-2 gap-2">{CORES.map(c => <button key={c.value} disabled={Boolean(busy)} onClick={() => void switchCore(c.value)} className={`rounded-2xl border p-3 text-left ${state.core === c.value ? 'border-blue-500 bg-blue-50 dark:bg-blue-500/10' : 'border-slate-200 dark:border-slate-700'}`}><b className="text-sm">{c.title}</b><div className="mt-1 text-[10px] text-slate-400">{c.note}</div></button>)}</div></section>

    <section className="rounded-3xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"><div className="mb-3 flex items-center gap-2"><Link2 size={18} className="text-blue-500"/><h3 className="font-bold">Подписка или серверы</h3></div><input value={name} onChange={e => setName(e.target.value)} placeholder="Название (необязательно)" className="mb-2 w-full rounded-xl bg-slate-100 px-3 py-2.5 text-sm dark:bg-slate-800"/><textarea value={input} onChange={e => setInput(e.target.value)} rows={3} placeholder={'URL подписки (URI/Base64/JSON)\nили vless://… / trojan://… / hysteria2://…'} className="w-full resize-none rounded-xl bg-slate-100 px-3 py-3 text-sm dark:bg-slate-800"/><button disabled={!input.trim() || Boolean(busy)} onClick={() => void add()} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-3 text-sm font-black text-white disabled:opacity-40">{busy === 'add' ? <LoaderCircle size={17} className="animate-spin"/> : <Link2 size={17}/>}Съесть и применить</button><p className="mt-2 text-[11px] text-slate-400">URI/Base64, sing-box JSON, Xray/V2Ray JSON; Mihomo YAML остаётся fallback. Happ routing подхватывается отдельно.</p></section>

    <section className="rounded-3xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"><div className="mb-3 flex items-center gap-2"><Route size={18} className="text-violet-500"/><h3 className="font-bold">Маршрутизация</h3></div><div className="grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800">{([['routing','Правила'],['global','Всё прокси'],['direct','Напрямую']] as Array<[EasyMode,string]>).map(([m,label]) => <button key={m} onClick={() => void mutate(`mode:${m}`, () => easyBridge.setMode(m))} className={`rounded-lg py-2 text-[11px] font-bold ${state.mode === m ? 'bg-white text-blue-600 shadow dark:bg-slate-700' : 'text-slate-500'}`}>{label}</button>)}</div>{state.mode === 'routing' && state.routings.length > 0 && <select className="mt-3 w-full rounded-xl bg-slate-100 px-3 py-2.5 text-sm dark:bg-slate-800" value={state.activeRouting || ''} onChange={e => void mutate('routing', () => easyBridge.setRouting(e.target.value))}><option value="">Базовые правила</option>{state.routings.map(r => <option key={r.id} value={r.id}>{r.name}{r.autoEnable ? ' · auto' : ''}</option>)}</select>}</section>

    {nodes.length > 0 && <section className="rounded-3xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"><h3 className="mb-3 font-bold">Основной узел</h3><select value={state.selectedNode || ''} onChange={e => void mutate('node', () => easyBridge.selectNode(e.target.value))} className="w-full rounded-xl bg-slate-100 px-3 py-2.5 text-sm dark:bg-slate-800"><option value="">Авто / группа</option>{nodes.map(n => <option key={n.ref} value={n.ref}>{n.label}</option>)}</select></section>}

    {nodes.length >= 2 && <section className="rounded-3xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"><div className="mb-3 flex items-center gap-2"><ArrowRight size={18} className="text-orange-500"/><h3 className="font-bold">Пользовательский туннель</h3></div><input value={chainName} onChange={e => setChainName(e.target.value)} placeholder="Название цепочки" className="mb-2 w-full rounded-xl bg-slate-100 px-3 py-2.5 text-sm dark:bg-slate-800"/><select value={hopA} onChange={e => setHopA(e.target.value)} className="w-full rounded-xl bg-slate-100 px-3 py-2.5 text-sm dark:bg-slate-800">{nodes.map(n => <option key={n.ref} value={n.ref}>A · {n.label}</option>)}</select><div className="py-1 text-center text-slate-400">↓</div><select value={hopB} onChange={e => setHopB(e.target.value)} className="w-full rounded-xl bg-slate-100 px-3 py-2.5 text-sm dark:bg-slate-800">{nodes.map(n => <option key={n.ref} value={n.ref}>B · {n.label}</option>)}</select><button disabled={!hopA || !hopB || hopA === hopB || Boolean(busy)} onClick={() => void mutate('chain', () => easyBridge.addChain(chainName.trim(), [hopA, hopB])).then(v => { if (v) setChainName(''); })} className="mt-3 w-full rounded-xl bg-orange-500 py-2.5 text-xs font-black text-white disabled:opacity-40">Создать A → B → Internet</button><p className="mt-2 text-[11px] text-slate-400">sing-box: detour. Xray/V2Ray: proxySettings. Узлы могут быть из разных подписок.</p>{state.chains.map(c => <div key={c.id} className="mt-2 flex items-center justify-between rounded-xl bg-slate-100 p-2 dark:bg-slate-800"><span className="truncate text-xs font-bold">{c.name}</span><div className="flex gap-1"><button onClick={() => void mutate('toggle', () => easyBridge.toggleChain(c.id))} className="rounded-lg px-2 py-1 text-[10px] font-bold">{c.enabled ? 'ON' : 'OFF'}</button><button onClick={() => void mutate('delchain', () => easyBridge.removeChain(c.id))} className="rounded-lg p-1 text-rose-500"><Trash2 size={14}/></button></div></div>)}</section>}

    <section className="space-y-2"><div className="flex items-center justify-between px-1"><h3 className="font-bold">Подписки</h3><span className="text-xs text-slate-400">{state.subscriptions.length}</span></div>{state.subscriptions.map(s => <div key={s.id} className="flex items-center justify-between gap-2 rounded-2xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900"><div className="min-w-0"><b className="block truncate text-sm">{s.name}</b><span className="text-[10px] text-slate-400">{s.nodeCountHint || '?'} узлов · {s.sourceFormat || s.providerKind}</span>{s.lastError && <div className="text-[10px] text-rose-500">{s.lastError}</div>}</div><div className="flex gap-1"><button className="p-2" onClick={() => void mutate('update', () => easyBridge.updateSubscription(s.id))}><RefreshCw size={15}/></button><button className="p-2 text-rose-500" onClick={() => void mutate('delete', () => easyBridge.removeSubscription(s.id))}><Trash2 size={15}/></button></div></div>)}</section>

    <p className="px-2 text-center text-[10px] leading-relaxed text-slate-400">Ping/переключение для sing-box и Mihomo остаются во вкладке «Узлы» через Clash API. Для Xray/V2Ray отдельный handshake-test будет следующим слоем. HWID-обход лимитов подписки не реализуется.</p>
  </div>;
}
