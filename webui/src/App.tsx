import { useState } from 'react';
import { RefreshCw, Save, Home, Layers, Settings, Smartphone, Moon, Sun, Server } from 'lucide-react';
import { NavItem } from '@/components/ui';
import { useBoxController } from '@/hooks/useBoxController';
import { useTheme } from '@/hooks/useTheme';
import { TabEasy } from '@/tabs/TabEasy';
import { TabProxies } from '@/tabs/TabProxies';
import { TabApps } from '@/tabs/TabApps';
import { TabAdvanced } from '@/tabs/TabAdvanced';
import '@/index.css';

export default function App() {
  const [activeTab, setActiveTab] = useState('easy');
  const { theme, isDark, cycleTheme } = useTheme();
  const {
    loading,
    status,
    config,
    appList,
    actionLoading,
    hasChanges,
    handleServiceAction,
    handleToggle,
    handleChange,
    handleSaveAndApply,
  } = useBoxController();

  if (loading) {
    return (
      <div className={`flex min-h-dvh items-center justify-center ${isDark ? 'bg-slate-950' : 'bg-slate-50'}`}>
        <div className="animate-spin text-indigo-500"><RefreshCw size={28} /></div>
      </div>
    );
  }

  return (
    <div className={`mx-auto h-dvh max-w-md overflow-hidden font-sans shadow-2xl transition-colors duration-300 ${isDark ? 'bg-slate-950 text-slate-200' : 'bg-slate-50 text-slate-800'} relative`}>
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/80 backdrop-blur-md transition-colors dark:border-slate-800 dark:bg-slate-900/80">
        <div className="flex items-center justify-between px-5 py-3.5">
          <div className="flex items-center space-x-2.5">
            <div className={`h-2.5 w-2.5 rounded-full ${status.running ? 'animate-pulse bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-rose-500'}`} />
            <h1 className="text-lg font-bold tracking-tight text-slate-900 transition-colors dark:text-slate-100">Box4Easy</h1>
            <div className="flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500 transition-colors dark:bg-slate-800 dark:text-slate-400">
              {status.running ? status.bin_name : 'STOPPED'}
            </div>
          </div>
          <button onClick={cycleTheme} className="rounded-full bg-slate-100 p-1.5 text-slate-500 transition-colors hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700" title="Тема">
            {theme === 'system' ? <Smartphone size={16} /> : theme === 'dark' ? <Moon size={16} /> : <Sun size={16} />}
          </button>
        </div>
      </header>

      <main className="scrollbar-hide h-[calc(100dvh-53px)] overflow-y-auto pb-32 pt-2">
        {activeTab === 'easy' && <TabEasy status={status} config={config} actionLoading={actionLoading} handleServiceAction={handleServiceAction} />}
        {activeTab === 'proxies' && <TabProxies status={status} />}
        {activeTab === 'apps' && <TabApps config={config} handleToggle={handleToggle} handleChange={handleChange} appList={appList} />}
        {activeTab === 'advanced' && <TabAdvanced status={status} config={config} handleToggle={handleToggle} handleChange={handleChange} />}
      </main>

      {hasChanges && activeTab !== 'easy' && (
        <div className="absolute bottom-16 right-6 z-40 animate-in slide-in-from-bottom-4 zoom-in duration-300">
          <button onClick={handleSaveAndApply} disabled={actionLoading === 'save'} className="flex items-center space-x-2 rounded-full bg-indigo-600 px-5 py-3.5 font-bold text-white shadow-[0_4px_16px_rgba(79,70,229,0.4)] transition-all hover:bg-indigo-700 active:scale-95">
            {actionLoading === 'save' ? <RefreshCw size={20} className="animate-spin" /> : <Save size={20} />}
            <span>{actionLoading === 'save' ? 'Применяю…' : 'Сохранить'}</span>
          </button>
        </div>
      )}

      <nav className="pb-safe absolute bottom-0 z-30 flex w-full items-center justify-between border-t border-slate-200 bg-white px-6 py-2 transition-colors dark:border-slate-800 dark:bg-slate-900">
        <NavItem icon={<Home size={24} />} label="Easy" active={activeTab === 'easy'} onClick={() => setActiveTab('easy')} />
        <NavItem icon={<Server size={24} />} label="Узлы" active={activeTab === 'proxies'} onClick={() => setActiveTab('proxies')} />
        <NavItem icon={<Layers size={24} />} label="Приложения" active={activeTab === 'apps'} onClick={() => setActiveTab('apps')} />
        <NavItem icon={<Settings size={24} />} label="Ещё" active={activeTab === 'advanced'} onClick={() => setActiveTab('advanced')} />
      </nav>
    </div>
  );
}
