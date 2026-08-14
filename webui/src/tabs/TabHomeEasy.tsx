import { Activity, Check, ChevronRight, CirclePower, Gauge, Globe2, Link2, Plus, RefreshCw, Route, Server } from 'lucide-react';
import { openExternalUrl } from '@/lib/bridge';
import { nodeProtocol, type EasyNode, type EasyState, type LatencyResult } from '@/lib/easy';
import type { BoxStatus } from '@/types/box';
import { Card, latencyText } from '@/components/easyMaterial';

type Props = {
  easy: EasyState;
  status: BoxStatus;
  nodes: EasyNode[];
  selected?: EasyNode;
  latencies: Record<string, LatencyResult>;
  busy: string | null;
  actionLoading: string | null;
  onPower: () => Promise<void>;
  onServers: () => void;
  onRouting: () => void;
  onAdd: () => void;
  onTestAll: () => Promise<void>;
  onUpdateSubscription: (id: string) => Promise<void>;
};

export function TabHomeEasy({ easy, status, nodes, selected, latencies, busy, actionLoading, onPower, onServers, onRouting, onAdd, onTestAll, onUpdateSubscription }: Props) {
  const announcement = easy.subscriptions.find(s => s.announcement)?.announcement;
  return <div className="space-y-4 px-4 pb-28 pt-2">
    <section className="relative overflow-hidden rounded-[32px] bg-[#6750a4] p-5 text-white shadow-lg">
      <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10"/><div className="absolute -bottom-14 -left-8 h-36 w-36 rounded-full bg-white/5"/>
      <div className="relative flex items-start justify-between gap-4">
        <div className="min-w-0"><div className="text-xs font-semibold text-white/70">{status.running ? 'Защищено через TPROXY' : 'Прокси выключен'}</div><h1 className="mt-1 truncate text-2xl font-black">{selected?.server.name || (nodes.length ? 'Выбери сервер' : 'Добавь подписку')}</h1><div className="mt-2 flex flex-wrap gap-2"><span className="rounded-full bg-white/15 px-3 py-1 text-[11px] font-bold">{easy.core}</span>{selected&&<span className="rounded-full bg-white/15 px-3 py-1 text-[11px] font-bold">{nodeProtocol(selected.server)}</span>}{selected&&<span className="rounded-full bg-white/15 px-3 py-1 text-[11px] font-bold">{latencyText(latencies[selected.ref])}</span>}</div></div>
        <button disabled={Boolean(actionLoading)||Boolean(busy)} onClick={()=>void onPower()} className={`flex h-20 w-20 shrink-0 items-center justify-center rounded-full shadow-xl transition active:scale-95 ${status.running?'bg-[#d0bcff] text-[#381e72]':'bg-white text-[#6750a4]'}`}><CirclePower size={38}/></button>
      </div>
      <div className="relative mt-5 grid grid-cols-3 gap-2"><button onClick={onServers} className="rounded-2xl bg-white/12 p-3 text-left"><Server size={18}/><div className="mt-2 text-lg font-black">{nodes.length}</div><div className="text-[10px] text-white/65">серверов</div></button><button onClick={()=>void onTestAll()} className="rounded-2xl bg-white/12 p-3 text-left"><Gauge size={18}/><div className="mt-2 text-lg font-black">{busy==='ping'?'…':'PING'}</div><div className="text-[10px] text-white/65">проверить все</div></button><button onClick={onRouting} className="rounded-2xl bg-white/12 p-3 text-left"><Route size={18}/><div className="mt-2 text-lg font-black">{easy.mode==='routing'?'RULE':easy.mode==='global'?'ALL':'OFF'}</div><div className="text-[10px] text-white/65">маршрутизация</div></button></div>
    </section>

    {announcement && <Card className="p-4"><div className="flex gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#ffdad6] text-[#93000a] dark:bg-[#93000a] dark:text-[#ffdad6]"><Activity size={19}/></div><div className="min-w-0"><div className="text-xs font-black">Сообщение провайдера</div><div className="mt-1 text-sm opacity-70">{announcement}</div></div></div></Card>}

    <Card className="overflow-hidden">
      <div className="flex items-center justify-between p-4"><div><h2 className="font-black">Подписки</h2><p className="text-xs opacity-50">Обновление, трафик и срок действия</p></div><button onClick={onAdd} className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#e8def8] text-[#6750a4] dark:bg-[#4a4458] dark:text-[#e8def8]"><Plus/></button></div>
      {easy.subscriptions.length===0 ? <button onClick={onAdd} className="m-4 mt-0 flex w-[calc(100%-2rem)] items-center gap-3 rounded-[24px] border-2 border-dashed border-[#cac4d0] p-5 text-left"><Link2 className="text-[#6750a4]"/><div><div className="font-bold">Добавить подписку</div><div className="text-xs opacity-50">URL → JSON / URI / routing</div></div></button> : easy.subscriptions.map(s=><div key={s.id} className="border-t border-black/5 px-4 py-3 dark:border-white/5"><div className="flex items-center gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#e8def8] text-[#6750a4] dark:bg-[#4a4458] dark:text-[#e8def8]"><Globe2 size={20}/></div><div className="min-w-0 flex-1"><div className="truncate text-sm font-black">{s.name}</div><div className="mt-0.5 text-[11px] opacity-50">{s.nodeCountHint || 0} серверов · {s.sourceFormat || s.providerKind}</div>{s.userInfo&&<div className="mt-1 truncate text-[10px] text-[#6750a4] dark:text-[#d0bcff]">{s.userInfo}</div>}{s.lastError&&<div className="mt-1 text-[10px] text-[#ba1a1a]">{s.lastError}</div>}</div><button disabled={Boolean(busy)} onClick={()=>void onUpdateSubscription(s.id)} className="rounded-full p-2"><RefreshCw size={17}/></button>{s.supportUrl&&<button onClick={()=>void openExternalUrl(s.supportUrl!)} className="rounded-full p-2"><ChevronRight size={17}/></button>}</div></div>)}
    </Card>

    {easy.activeRouting && <Card className="flex items-center gap-3 p-4"><div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#e8def8] text-[#6750a4] dark:bg-[#4a4458]"><Route size={19}/></div><div className="min-w-0 flex-1"><div className="text-xs opacity-50">Активный routing</div><div className="truncate text-sm font-black">{easy.routings.find(r=>r.id===easy.activeRouting)?.name || 'Профиль'}</div></div><Check className="text-[#6750a4]" size={18}/></Card>}
  </div>;
}
