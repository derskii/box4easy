import { Check, Gauge, LoaderCircle, RefreshCw, Search, Server } from 'lucide-react';
import { nodeProtocol, type EasyCore, type EasyNode, type EasyState, type LatencyResult } from '@/lib/easy';
import { Card, compatibleNode, latencyClass, latencyText } from '@/components/easyMaterial';

type Props = {
  easy: EasyState;
  nodes: EasyNode[];
  core: EasyCore;
  search: string;
  setSearch: (value: string) => void;
  latencies: Record<string, LatencyResult>;
  busy: string | null;
  onTestAll: () => Promise<void>;
  onTestOne: (ref: string) => Promise<void>;
  onSelect: (ref: string) => Promise<void>;
  onUpdateSubscription: (id: string) => Promise<void>;
};

export function TabServersEasy({ easy, nodes, core, search, setSearch, latencies, busy, onTestAll, onTestOne, onSelect, onUpdateSubscription }: Props) {
  const q = search.toLowerCase();
  return <div className="space-y-4 px-4 pb-28 pt-2">
    <div className="flex gap-2"><div className="relative flex-1"><Search className="absolute left-4 top-1/2 -translate-y-1/2 opacity-45" size={18}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Поиск сервера" className="w-full rounded-[24px] bg-white py-3.5 pl-11 pr-4 text-sm outline-none focus:ring-2 focus:ring-[#6750a4]/30 dark:bg-[#211f26]"/></div><button onClick={()=>void onTestAll()} className="flex h-12 w-12 items-center justify-center rounded-[20px] bg-[#e8def8] text-[#6750a4] dark:bg-[#4a4458] dark:text-[#e8def8]">{busy==='ping'?<LoaderCircle className="animate-spin" size={19}/>:<Gauge size={20}/>}</button></div>
    {easy.subscriptions.map(sub=>{const list=nodes.filter(n=>n.subscriptionId===sub.id&&n.server.name.toLowerCase().includes(q)); if(!list.length)return null; return <Card key={sub.id} className="overflow-hidden"><div className="flex items-center justify-between px-4 py-3"><div><div className="font-black">{sub.name}</div><div className="text-[11px] opacity-45">{list.length} серверов</div></div><button onClick={()=>void onUpdateSubscription(sub.id)}><RefreshCw size={17}/></button></div>{list.map(n=><NodeRow key={n.ref} node={n} core={core} active={easy.selectedNode===n.ref} ping={latencies[n.ref]} busy={busy} onSelect={onSelect} onTest={onTestOne}/>)}</Card>})}
    {easy.servers.length>0&&<Card className="overflow-hidden"><div className="px-4 py-3 font-black">Локальные серверы</div>{nodes.filter(n=>!n.subscriptionId&&n.server.name.toLowerCase().includes(q)).map(n=><NodeRow key={n.ref} node={n} core={core} active={easy.selectedNode===n.ref} ping={latencies[n.ref]} busy={busy} onSelect={onSelect} onTest={onTestOne}/>)}</Card>}
    {nodes.length===0&&<Card className="p-8 text-center"><Server className="mx-auto opacity-30" size={42}/><div className="mt-3 font-black">Серверов пока нет</div><div className="mt-1 text-xs opacity-50">На главной нажми «+» и добавь подписку.</div></Card>}
  </div>;
}

function NodeRow({ node, core, active, ping, busy, onSelect, onTest }: { node:EasyNode; core:EasyCore; active:boolean; ping?:LatencyResult; busy:string|null; onSelect:(ref:string)=>Promise<void>; onTest:(ref:string)=>Promise<void> }) {
  const ok=compatibleNode(node,core);
  return <div className={`flex items-center gap-3 border-t border-black/5 px-4 py-3 dark:border-white/5 ${ok?'':'opacity-35'}`}><button disabled={!ok||Boolean(busy)} onClick={()=>void onSelect(node.ref)} className={`flex h-10 w-10 items-center justify-center rounded-full ${active?'bg-[#6750a4] text-white':'bg-[#f3edf7] text-[#6750a4] dark:bg-[#2b2930]'}`}>{active?<Check size={18}/>:<Server size={18}/>}</button><button disabled={!ok||Boolean(busy)} onClick={()=>void onSelect(node.ref)} className="min-w-0 flex-1 text-left"><div className="truncate text-sm font-bold">{node.server.name}</div><div className="mt-0.5 text-[10px] opacity-45">{nodeProtocol(node.server)}{!ok?' · не поддерживается этим ядром':''}</div></button><button disabled={!ok} onClick={()=>void onTest(node.ref)} className={`rounded-full px-2.5 py-1.5 text-[10px] font-black ${latencyClass(ping)}`}>{latencyText(ping)}</button></div>;
}
