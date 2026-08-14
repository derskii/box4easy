import { useCallback, useEffect, useMemo, useState } from 'react';
import { House, Layers3, LoaderCircle, Route, Server, Settings2, Smartphone } from 'lucide-react';
import { useBoxController } from '@/hooks/useBoxController';
import { useTheme } from '@/hooks/useTheme';
import { boxBridge, notify } from '@/lib/bridge';
import { easyBridge, flattenNodes, type EasyCore, type EasyState, type LatencyResult } from '@/lib/easy';
import { compatibleNode } from '@/components/easyMaterial';
import { TabHomeEasy } from '@/tabs/TabHomeEasy';
import { TabServersEasy } from '@/tabs/TabServersEasy';
import { TabRoutingEasy } from '@/tabs/TabRoutingEasy';
import { TabSettingsEasy } from '@/tabs/TabSettingsEasy';
import { TabApps } from '@/tabs/TabApps';
import '@/index.css';

const EMPTY:EasyState={version:3,easyEnabled:false,core:'sing-box',mode:'routing',subscriptions:[],servers:[],routings:[],chains:[]};
type Tab='home'|'servers'|'routing'|'apps'|'settings';

export default function App(){
  const [tab,setTab]=useState<Tab>('home'); const [easy,setEasy]=useState<EasyState>(EMPTY); const [busy,setBusy]=useState<string|null>('load');
  const [stage,setStage]=useState(''); const [importOpen,setImportOpen]=useState(false); const [input,setInput]=useState(''); const [inputName,setInputName]=useState('');
  const [search,setSearch]=useState(''); const [latencies,setLatencies]=useState<Record<string,LatencyResult>>({}); const [logText,setLogText]=useState(''); const [showLog,setShowLog]=useState(false);
  const {theme,cycleTheme}=useTheme();
  const {loading,status,config,appList,actionLoading,hasChanges,handleServiceAction,handleToggle,handleChange,handleSaveAndApply,handleToggleAutoStart}=useBoxController();
  const nodes=useMemo(()=>flattenNodes(easy),[easy]); const compatibleNodes=useMemo(()=>nodes.filter(n=>compatibleNode(n,easy.core)),[nodes,easy.core]); const selected=useMemo(()=>nodes.find(n=>n.ref===easy.selectedNode),[nodes,easy.selectedNode]);

  const refresh=useCallback(async()=>{try{setEasy(await easyBridge.state())}catch(e){notify(message(e))}finally{setBusy(null)}},[]);
  useEffect(()=>{void refresh()},[refresh]);

  const mutate=async(key:string,fn:()=>Promise<EasyState>,restart=true)=>{setBusy(key);try{const next=await fn();setEasy(next);if(restart&&status.running)await handleServiceAction('restart');return next}catch(e){notify(message(e));return null}finally{setBusy(null)}};
  const testOne=async(ref:string)=>{setLatencies(p=>({...p,[ref]:{ref}}));try{const r=await easyBridge.latency(ref);setLatencies(p=>({...p,[ref]:r}))}catch(e){setLatencies(p=>({...p,[ref]:{ref,error:message(e)}}))}};
  const testAll=async()=>{setBusy('ping');try{const rows=await easyBridge.latencies();const next:Record<string,LatencyResult>={};rows.forEach(r=>{next[r.ref]=r});setLatencies(next)}catch(e){notify(`Проверка серверов: ${message(e)}`)}finally{setBusy(null)}};

  const importData=async()=>{
    const value=input.trim(); if(!value)return; setBusy('import'); let addedSub:string|undefined;
    try{
      setStage('Читаю подписку…'); let next=easy;
      if(/^https?:\/\//i.test(value)){const before=new Set(next.subscriptions.map(s=>s.id));next=await easyBridge.addSubscription(inputName.trim(),value);addedSub=next.subscriptions.find(s=>!before.has(s.id))?.id}
      else{const links=value.split(/\s+/).filter(v=>/^(vless|vmess|trojan|hysteria2|hy2|ss|socks5?|socks):\/\//i.test(v));if(!links.length)throw new Error('Нужен URL подписки или ссылка сервера');for(const link of links)next=await easyBridge.addServer(link,links.length===1?inputName.trim():'')}
      setEasy(next); const newest=addedSub?next.subscriptions.find(s=>s.id===addedSub):undefined;
      if(newest?.sourceFormat==='mihomo-yaml'&&next.core!=='mihomo'){next=await easyBridge.removeSubscription(newest.id);addedSub=undefined;setEasy(next);throw new Error('Провайдер отдал только Clash/Mihomo YAML. Для этого формата выбери Mihomo; сеть не переключена.')}
      setStage(`Проверяю ${next.core}…`); await easyBridge.ensureCore(next.core);
      if(!next.easyEnabled){setStage('Проверяю конфигурацию…');next=await easyBridge.enable(config.bin_name||status.bin_name||'sing-box');setEasy(next)}
      await boxBridge.setConfig('bin_name',next.core);
      setStage(status.running?'Перезапускаю безопасно…':'Запускаю TPROXY…'); await handleServiceAction(status.running?'restart':'start');
      setInput('');setInputName('');setImportOpen(false);setStage('');notify(`Импортировано: ${newest?.nodeCountHint||next.servers.length} серверов`);if(newest?.autoPing)void testAll();
    }catch(e){if(addedSub){try{const rolled=await easyBridge.removeSubscription(addedSub);setEasy(rolled)}catch{/* best effort */}}setStage('');notify(`Подписка не применена: ${message(e)}`)}finally{setBusy(null)}
  };

  const switchCore=async(core:EasyCore)=>{if(core===easy.core)return;setBusy(`core:${core}`);try{setStage(`Устанавливаю ${core}…`);await easyBridge.ensureCore(core);setStage('Проверяю конфигурацию…');const next=await easyBridge.setCore(core);await boxBridge.setConfig('bin_name',core);setEasy(next);if(status.running){setStage('Перезапускаю ядро…');await handleServiceAction('restart')}notify(`Ядро: ${core}`)}catch(e){notify(`Не удалось переключить ядро: ${message(e)}`)}finally{setStage('');setBusy(null)}};
  const loadLog=async()=>{try{const data=await boxBridge.checkLog(160);setLogText(typeof data==='string'?data:JSON.stringify(data,null,2));setShowLog(true)}catch(e){notify(message(e))}};

  if(loading||busy==='load')return <div className="flex h-dvh items-center justify-center bg-[#f7f2fa] text-[#6750a4] dark:bg-[#141218]"><LoaderCircle className="animate-spin" size={34}/></div>;
  return <div className="mx-auto h-dvh max-w-md overflow-hidden bg-[#f7f2fa] text-[#1d1b20] dark:bg-[#141218] dark:text-[#e6e1e5]">
    <header className="flex h-16 items-center justify-between px-5"><div><div className="text-[11px] font-bold uppercase tracking-[.18em] opacity-45">Box4Easy</div><div className="flex items-center gap-2 text-lg font-black"><span>{title(tab)}</span><span className={`h-2.5 w-2.5 rounded-full ${status.running?'bg-emerald-500':'bg-[#ba1a1a]'}`}/></div></div><button onClick={cycleTheme} className="flex h-11 w-11 items-center justify-center rounded-full bg-[#e8def8] text-[#1d192b] dark:bg-[#4a4458] dark:text-[#e8def8]" title={`Тема: ${theme}`}><Smartphone size={20}/></button></header>
    <main className="h-[calc(100dvh-128px)] overflow-y-auto">
      {tab==='home'&&<TabHomeEasy easy={easy} status={status} nodes={nodes} selected={selected} latencies={latencies} busy={busy} actionLoading={actionLoading} onPower={()=>handleServiceAction(status.running?'stop':'start')} onServers={()=>setTab('servers')} onRouting={()=>setTab('routing')} onAdd={()=>setImportOpen(true)} onTestAll={testAll} onUpdateSubscription={id=>mutate('update',()=>easyBridge.updateSubscription(id)).then(()=>{})}/>} 
      {tab==='servers'&&<TabServersEasy easy={easy} nodes={nodes} core={easy.core} search={search} setSearch={setSearch} latencies={latencies} busy={busy} onTestAll={testAll} onTestOne={testOne} onSelect={ref=>mutate(`node:${ref}`,()=>easyBridge.selectNode(ref)).then(()=>{})} onUpdateSubscription={id=>mutate('update',()=>easyBridge.updateSubscription(id)).then(()=>{})}/>} 
      {tab==='routing'&&<TabRoutingEasy easy={easy} nodes={compatibleNodes} busy={busy} onMode={m=>mutate(`mode:${m}`,()=>easyBridge.setMode(m)).then(()=>{})} onRouting={id=>mutate('routing',()=>easyBridge.setRouting(id)).then(()=>{})} onAddChain={(name,hops)=>mutate('chain',()=>easyBridge.addChain(name,hops)).then(Boolean)} onToggleChain={id=>mutate('chain-toggle',()=>easyBridge.toggleChain(id)).then(()=>{})} onDeleteChain={id=>mutate('chain-del',()=>easyBridge.removeChain(id)).then(()=>{})}/>} 
      {tab==='apps'&&<TabApps config={config} handleToggle={handleToggle} handleChange={handleChange} appList={appList}/>} 
      {tab==='settings'&&<TabSettingsEasy easy={easy} config={config} status={status} busy={busy} actionLoading={actionLoading} hasChanges={hasChanges} onCore={switchCore} onToggle={handleToggle} onChange={handleChange} onAutoStart={handleToggleAutoStart} onLog={loadLog} onRestart={()=>handleServiceAction('restart')} onSave={handleSaveAndApply}/>} 
    </main>
    <BottomNav tab={tab} setTab={setTab}/>
    {importOpen&&<ImportSheet input={input} name={inputName} stage={stage} busy={busy==='import'} setInput={setInput} setName={setInputName} onClose={()=>{setImportOpen(false);setStage('')}} onImport={importData}/>} 
    {showLog&&<LogSheet text={logText} onClose={()=>setShowLog(false)}/>} 
  </div>;
}

function message(e:unknown){return e instanceof Error?e.message:String(e)}
function title(tab:Tab){return tab==='home'?'Главная':tab==='servers'?'Серверы':tab==='routing'?'Маршруты':tab==='apps'?'Приложения':'Настройки'}
function BottomNav({tab,setTab}:{tab:Tab;setTab:(tab:Tab)=>void}){const items:[Tab,typeof House,string][]=[['home',House,'Главная'],['servers',Server,'Серверы'],['routing',Route,'Маршруты'],['apps',Layers3,'Приложения'],['settings',Settings2,'Настройки']];return <nav className="absolute bottom-0 flex h-16 w-full items-center justify-around border-t border-black/5 bg-[#f3edf7]/95 px-1 backdrop-blur dark:border-white/5 dark:bg-[#211f26]/95">{items.map(([id,Icon,label])=><button key={id} onClick={()=>setTab(id)} className={`flex min-w-0 flex-1 flex-col items-center gap-0.5 text-[9px] font-bold ${tab===id?'text-[#6750a4] dark:text-[#d0bcff]':'opacity-55'}`}><span className={`flex h-8 w-14 items-center justify-center rounded-full ${tab===id?'bg-[#e8def8] dark:bg-[#4a4458]':''}`}><Icon size={19}/></span>{label}</button>)}</nav>}
function ImportSheet({input,name,stage,busy,setInput,setName,onClose,onImport}:{input:string;name:string;stage:string;busy:boolean;setInput:(v:string)=>void;setName:(v:string)=>void;onClose:()=>void;onImport:()=>Promise<void>}){return <div className="absolute inset-0 z-50 flex items-end bg-black/35 p-3 backdrop-blur-sm"><div className="w-full rounded-[32px] bg-[#f7f2fa] p-5 shadow-2xl dark:bg-[#211f26]"><div className="mx-auto mb-4 h-1 w-10 rounded-full bg-black/20 dark:bg-white/20"/><h2 className="text-xl font-black">Добавить подписку</h2><p className="mt-1 text-xs opacity-50">Сначала скачиваем и разбираем. TPROXY включается только после успешной проверки.</p><input value={name} onChange={e=>setName(e.target.value)} placeholder="Название (необязательно)" className="mt-4 w-full rounded-2xl bg-white px-4 py-3 text-sm outline-none dark:bg-[#2b2930]"/><textarea rows={4} value={input} onChange={e=>setInput(e.target.value)} placeholder={'https://example.com/sub\nили vless://…'} className="mt-2 w-full resize-none rounded-2xl bg-white px-4 py-3 text-sm outline-none dark:bg-[#2b2930]"/>{stage&&<div className="mt-3 flex items-center gap-2 rounded-2xl bg-[#e8def8] px-4 py-3 text-xs font-bold text-[#6750a4] dark:bg-[#4a4458] dark:text-[#e8def8]"><LoaderCircle className="animate-spin" size={16}/>{stage}</div>}<div className="mt-4 grid grid-cols-2 gap-2"><button disabled={busy} onClick={onClose} className="rounded-2xl bg-[#e8def8] py-3 text-sm font-black text-[#6750a4] dark:bg-[#4a4458] dark:text-[#e8def8]">Отмена</button><button disabled={!input.trim()||busy} onClick={()=>void onImport()} className="rounded-2xl bg-[#6750a4] py-3 text-sm font-black text-white disabled:opacity-40">{busy?'Проверяю…':'Добавить'}</button></div></div></div>}
function LogSheet({text,onClose}:{text:string;onClose:()=>void}){return <div className="absolute inset-0 z-50 flex items-end bg-black/35 p-3"><div className="max-h-[80dvh] w-full rounded-[32px] bg-[#f7f2fa] p-5 dark:bg-[#211f26]"><div className="flex items-center justify-between"><h2 className="font-black">Диагностика</h2><button onClick={onClose} className="rounded-full bg-[#e8def8] px-3 py-1.5 text-xs font-bold text-[#6750a4] dark:bg-[#4a4458] dark:text-[#e8def8]">Закрыть</button></div><pre className="mt-3 max-h-[60dvh] overflow-auto whitespace-pre-wrap rounded-2xl bg-[#1d1b20] p-3 text-[10px] text-[#e6e1e5]">{text||'Лог пуст'}</pre></div></div>}
