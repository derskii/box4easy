import { exec } from 'kernelsu';

export type EasyMode = 'routing' | 'global' | 'direct';
export type EasyCore = 'sing-box' | 'xray' | 'v2ray' | 'mihomo';

export interface EasyServer { id:string; name:string; uri?:string; sourceSubscription?:string; proxy?:Record<string,unknown>; rawKind?:'sing-box'|'xray'; raw?:Record<string,unknown>; }
export interface EasySubscription { id:string; name:string; url:string; providerKind:'http'|'file'|'json'; providerPath?:string; sourceFormat?:'uri-list'|'sing-box-json'|'xray-json'|'json-array'|'mihomo-yaml'|string; userAgent?:string; routingId?:string; lastUpdate?:string; lastError?:string; nodeCountHint?:number; nodes?:EasyServer[]; userInfo?:string; supportUrl?:string; webUrl?:string; announcement?:string; updateHours?:number; autoPing?:boolean; autoConnect?:boolean; autoConnectBy?:string; }
export interface EasyRouting { id:string; name:string; autoEnable:boolean; sourceSubscription?:string; raw:unknown; }
export interface EasyChain { id:string; name:string; hops:string[]; enabled:boolean; }
export interface EasyState { version:number; easyEnabled:boolean; previousCore?:string; core:EasyCore; mode:EasyMode; activeRouting?:string; selectedNode?:string; subscriptions:EasySubscription[]; servers:EasyServer[]; routings:EasyRouting[]; chains:EasyChain[]; updatedAt?:string; }
export interface EasyNode { ref:string; subscriptionId?:string; subscriptionName:string; server:EasyServer; }
export interface LatencyResult { ref:string; latencyMs?:number; error?:string; }

const BIN='/data/adb/box/bin/box4easy';
function q(value:string){ return `'${value.split("'").join(`'\\''`)}'`; }
function extractJSON(text:string):unknown { const source=text.trim(); if(!source) throw new Error('box4easy вернул пустой ответ'); try{return JSON.parse(source)}catch{} const lines=source.split(/\r?\n/).map(v=>v.trim()).filter(Boolean); for(let i=lines.length-1;i>=0;i--){try{return JSON.parse(lines[i])}catch{}} throw new Error(source); }
async function runJSON<T>(args:string[]):Promise<T>{ if(typeof exec!=='function') throw new Error('KernelSU bridge недоступен'); const result=await exec(`${q(BIN)} ${args.map(q).join(' ')}`); const stdout=String(result.stdout??'').trim(); const stderr=String(result.stderr??'').trim(); if(!stdout){let message=stderr||'box4easy завершился с ошибкой'; try{const payload=extractJSON(stderr) as {error?:string}; message=payload?.error||message}catch{} throw new Error(message)} return extractJSON(stdout) as T; }

export function flattenNodes(state:EasyState):EasyNode[]{ const rows:EasyNode[]=[]; state.servers.forEach(server=>rows.push({ref:`local:${server.id}`,subscriptionName:'Локальные',server})); state.subscriptions.forEach(sub=>(sub.nodes||[]).forEach(server=>rows.push({ref:`sub:${sub.id}:${server.id}`,subscriptionId:sub.id,subscriptionName:sub.name,server}))); return rows; }
export function nodeProtocol(server:EasyServer):string { const p=String(server.proxy?.type||server.raw?.type||server.raw?.protocol||'').toUpperCase(); return p||server.rawKind?.toUpperCase()||'PROXY'; }

export const easyBridge={
 state:()=>runJSON<EasyState>(['state']),
 ensureCore:(core:EasyCore)=>runJSON<EasyState>(['ensure-core','--core',core]),
 enable:(previousCore:string)=>runJSON<EasyState>(['enable','--previous-core',previousCore]),
 disable:()=>runJSON<EasyState>(['disable']),
 addSubscription:(name:string,url:string)=>runJSON<EasyState>(['add-subscription','--name',name,'--url',url]),
 updateSubscription:(id:string)=>runJSON<EasyState>(['update-subscription','--id',id]),
 updateAll:()=>runJSON<EasyState>(['update-all']),
 removeSubscription:(id:string)=>runJSON<EasyState>(['remove-subscription','--id',id]),
 addServer:(uri:string,name='')=>runJSON<EasyState>(['add-server','--uri',uri,'--name',name]),
 removeServer:(id:string)=>runJSON<EasyState>(['remove-server','--id',id]),
 setRouting:(id:string)=>runJSON<EasyState>(['set-routing','--id',id||'off']),
 setMode:(mode:EasyMode)=>runJSON<EasyState>(['set-mode','--mode',mode]),
 setCore:(core:EasyCore)=>runJSON<EasyState>(['set-core','--core',core]),
 selectNode:(ref:string)=>runJSON<EasyState>(['select-node','--id',ref]),
 latency:(ref:string)=>runJSON<LatencyResult>(['latency','--id',ref]),
 latencies:()=>runJSON<LatencyResult[]>(['latencies']),
 addChain:(name:string,hops:string[])=>runJSON<EasyState>(['add-chain','--name',name,'--hops',hops.join(',')]),
 removeChain:(id:string)=>runJSON<EasyState>(['remove-chain','--id',id]),
 toggleChain:(id:string)=>runJSON<EasyState>(['toggle-chain','--id',id]),
 rebuild:()=>runJSON<EasyState>(['rebuild']),
};
