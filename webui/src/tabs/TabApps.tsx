import { useMemo, useState, type ChangeEvent } from 'react';
import { Check, Search } from 'lucide-react';
import type { BoxControllerState } from '@/types/box';

type Props = Pick<BoxControllerState, 'config' | 'handleToggle' | 'handleChange' | 'appList'>;

export function TabApps({ config, handleToggle, handleChange, appList }: Props) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'user' | 'system' | 'all'>('user');
  const enabled = config.APP_PROXY_ENABLE === 1;
  const mode = config.APP_PROXY_MODE || 'blacklist';
  const key: 'PROXY_APPS_LIST' | 'BYPASS_APPS_LIST' = mode === 'whitelist' ? 'PROXY_APPS_LIST' : 'BYPASS_APPS_LIST';
  const checked = useMemo(() => new Set(String(config[key] || '').split(/\s+/).filter(Boolean)), [config, key]);
  const apps = useMemo(() => appList.filter(app => {
    if (filter === 'user' && app.isSystem) return false;
    if (filter === 'system' && !app.isSystem) return false;
    const q = search.trim().toLowerCase();
    return !q || app.appLabel.toLowerCase().includes(q) || app.packageName.toLowerCase().includes(q);
  }), [appList, filter, search]);

  const toggle = (pkg: string) => {
    if (!enabled) return;
    const next = new Set(checked);
    if (next.has(pkg)) next.delete(pkg); else next.add(pkg);
    handleChange(key, [...next].join(' '));
  };

  return <div className="space-y-4 px-4 pb-28 pt-3">
    <section className="rounded-[28px] bg-[#e8def8] p-5 text-[#1d192b] dark:bg-[#4a4458] dark:text-[#e8def8]">
      <div className="flex items-center justify-between gap-4">
        <div><h2 className="text-xl font-black">Приложения</h2><p className="mt-1 text-xs opacity-70">Выбери, какие приложения идут через прокси.</p></div>
        <button onClick={() => handleToggle('APP_PROXY_ENABLE', !enabled)} className={`relative h-8 w-14 rounded-full p-1 transition ${enabled ? 'bg-[#6750a4]' : 'bg-[#79747e]'}`}><span className={`block h-6 w-6 rounded-full bg-white transition ${enabled ? 'translate-x-6' : ''}`} /></button>
      </div>
    </section>

    <section className={`space-y-3 rounded-[28px] bg-white p-4 shadow-sm dark:bg-[#211f26] ${enabled ? '' : 'opacity-50'}`}>
      <div className="grid grid-cols-2 gap-2 rounded-2xl bg-[#f3edf7] p-1 dark:bg-[#2b2930]">
        <button disabled={!enabled} onClick={() => handleChange('APP_PROXY_MODE','blacklist')} className={`rounded-xl px-3 py-2 text-xs font-bold ${mode === 'blacklist' ? 'bg-white text-[#6750a4] shadow dark:bg-[#36323c]' : 'opacity-60'}`}>Все, кроме выбранных</button>
        <button disabled={!enabled} onClick={() => handleChange('APP_PROXY_MODE','whitelist')} className={`rounded-xl px-3 py-2 text-xs font-bold ${mode === 'whitelist' ? 'bg-white text-[#6750a4] shadow dark:bg-[#36323c]' : 'opacity-60'}`}>Только выбранные</button>
      </div>
      <div className="relative"><Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 opacity-50"/><input disabled={!enabled} value={search} onChange={(e: ChangeEvent<HTMLInputElement>)=>setSearch(e.target.value)} placeholder="Поиск по названию или package" className="w-full rounded-2xl bg-[#f3edf7] py-3 pl-11 pr-4 text-sm outline-none focus:ring-2 focus:ring-[#6750a4]/30 dark:bg-[#2b2930]"/></div>
      <div className="flex gap-2">{(['user','system','all'] as const).map(v=><button key={v} disabled={!enabled} onClick={()=>setFilter(v)} className={`rounded-full px-3 py-1.5 text-xs font-bold ${filter===v?'bg-[#6750a4] text-white':'bg-[#f3edf7] dark:bg-[#2b2930]'}`}>{v==='user'?'Пользовательские':v==='system'?'Системные':'Все'}</button>)}</div>
      <div className="text-xs opacity-60">Выбрано: {checked.size}</div>
    </section>

    <section className="overflow-hidden rounded-[28px] bg-white shadow-sm dark:bg-[#211f26]">
      {apps.length === 0 ? <div className="p-8 text-center text-sm opacity-50">Приложения не найдены</div> : apps.map(app => {
        const on = checked.has(app.packageName);
        return <button key={app.packageName} disabled={!enabled} onClick={()=>toggle(app.packageName)} className="flex w-full items-center gap-3 border-b border-black/5 px-4 py-3 text-left last:border-0 dark:border-white/5">
          <div className="h-11 w-11 overflow-hidden rounded-2xl bg-[#f3edf7] dark:bg-[#2b2930]"><img src={`ksu://icon/${app.packageName}`} className="h-full w-full object-cover" alt="" /></div>
          <div className="min-w-0 flex-1"><div className="truncate text-sm font-bold">{app.appLabel}</div><div className="truncate text-[11px] opacity-50">{app.packageName}</div></div>
          <div className={`flex h-7 w-7 items-center justify-center rounded-full border ${on?'border-[#6750a4] bg-[#6750a4] text-white':'border-black/20 dark:border-white/20'}`}>{on&&<Check size={16}/>}</div>
        </button>;
      })}
    </section>
  </div>;
}
