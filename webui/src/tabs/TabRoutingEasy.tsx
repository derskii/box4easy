import { ArrowDown, ArrowRight, Boxes, Check, Globe2, Network, Route, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { type EasyMode, type EasyNode, type EasyState } from '@/lib/easy';
import { Card } from '@/components/easyMaterial';

type Props = {
  easy: EasyState;
  nodes: EasyNode[];
  busy: string | null;
  onMode: (mode: EasyMode) => Promise<void>;
  onRouting: (id: string) => Promise<void>;
  onAddChain: (name: string, hops: string[]) => Promise<boolean>;
  onToggleChain: (id: string) => Promise<void>;
  onDeleteChain: (id: string) => Promise<void>;
};

export function TabRoutingEasy({ easy, nodes, busy, onMode, onRouting, onAddChain, onToggleChain, onDeleteChain }: Props) {
  const [hopA,setHopA]=useState(''); const [hopB,setHopB]=useState(''); const [name,setName]=useState('');
  useEffect(()=>{ if(!hopA&&nodes[0])setHopA(nodes[0].ref); if(!hopB&&nodes[1])setHopB(nodes[1].ref); },[nodes,hopA,hopB]);
  return <div className="space-y-4 px-4 pb-28 pt-2">
    <Card className="p-4"><h2 className="font-black">Режим</h2><div className="mt-3 grid grid-cols-3 gap-1 rounded-2xl bg-[#f3edf7] p-1 dark:bg-[#2b2930]">{([['routing','Правила'],['global','Всё'],['direct','Напрямую']] as Array<[EasyMode,string]>).map(([m,l])=><button key={m} onClick={()=>void onMode(m)} className={`rounded-xl py-2.5 text-xs font-black ${easy.mode===m?'bg-white text-[#6750a4] shadow dark:bg-[#3b3743]':'opacity-55'}`}>{l}</button>)}</div></Card>
    <Card className="overflow-hidden"><div className="p-4"><h2 className="font-black">Routing-профили</h2><p className="text-xs opacity-50">Профили из заголовка или тела подписки, совместимые с Happ routing.</p></div><button onClick={()=>void onRouting('')} className={`flex w-full items-center gap-3 border-t border-black/5 px-4 py-3 text-left dark:border-white/5 ${!easy.activeRouting?'text-[#6750a4]':''}`}><Route size={19}/><div className="flex-1"><div className="text-sm font-bold">Базовые правила</div><div className="text-[10px] opacity-45">LAN напрямую, остальное по выбранному режиму</div></div>{!easy.activeRouting&&<Check size={18}/>}</button>{easy.routings.map(r=><button key={r.id} onClick={()=>void onRouting(r.id)} className={`flex w-full items-center gap-3 border-t border-black/5 px-4 py-3 text-left dark:border-white/5 ${easy.activeRouting===r.id?'text-[#6750a4]':''}`}><Globe2 size={19}/><div className="flex-1"><div className="text-sm font-bold">{r.name}</div><div className="text-[10px] opacity-45">{r.autoEnable?'Автоактивация':'Профиль маршрутизации'}</div></div>{easy.activeRouting===r.id&&<Check size={18}/>}</button>)}</Card>
    <Card className="p-4"><div className="flex items-center gap-2"><Network className="text-[#6750a4]"/><h2 className="font-black">Цепочка A → B</h2></div><p className="mt-1 text-xs opacity-50">Трафик идёт через первый сервер, затем через второй.</p>{nodes.length>=2?<><input value={name} onChange={e=>setName(e.target.value)} placeholder="Название цепочки" className="mt-4 w-full rounded-2xl bg-[#f3edf7] px-4 py-3 text-sm outline-none dark:bg-[#2b2930]"/><select value={hopA} onChange={e=>setHopA(e.target.value)} className="mt-2 w-full rounded-2xl bg-[#f3edf7] px-4 py-3 text-sm dark:bg-[#2b2930]">{nodes.map(n=><option value={n.ref} key={n.ref}>A · {n.subscriptionName} · {n.server.name}</option>)}</select><div className="flex justify-center py-1 opacity-40"><ArrowDown/></div><select value={hopB} onChange={e=>setHopB(e.target.value)} className="w-full rounded-2xl bg-[#f3edf7] px-4 py-3 text-sm dark:bg-[#2b2930]">{nodes.map(n=><option value={n.ref} key={n.ref}>B · {n.subscriptionName} · {n.server.name}</option>)}</select><button disabled={!hopA||!hopB||hopA===hopB||Boolean(busy)} onClick={()=>void onAddChain(name.trim(),[hopA,hopB]).then(ok=>{if(ok)setName('')})} className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-[#6750a4] py-3 text-sm font-black text-white disabled:opacity-40"><ArrowRight size={18}/>Создать цепочку</button></>:<div className="mt-4 rounded-2xl bg-[#f3edf7] p-4 text-xs opacity-60 dark:bg-[#2b2930]">Нужно минимум два совместимых сервера.</div>}{easy.chains.map(c=><div key={c.id} className="mt-3 flex items-center gap-3 rounded-2xl bg-[#f3edf7] p-3 dark:bg-[#2b2930]"><Boxes size={18}/><div className="min-w-0 flex-1"><div className="truncate text-sm font-bold">{c.name}</div><div className="text-[10px] opacity-45">{c.hops.length} hops · {c.enabled?'активна':'выключена'}</div></div><button onClick={()=>void onToggleChain(c.id)} className="rounded-full px-3 py-1.5 text-xs font-black text-[#6750a4]">{c.enabled?'ON':'OFF'}</button><button onClick={()=>void onDeleteChain(c.id)}><Trash2 size={17}/></button></div>)}</Card>
  </div>;
}
