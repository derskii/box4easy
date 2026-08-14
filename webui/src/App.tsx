import { Moon, RefreshCw, Smartphone, Sun } from 'lucide-react';
import { useBoxController } from '@/hooks/useBoxController';
import { useTheme } from '@/hooks/useTheme';
import { TabEasy } from '@/tabs/TabEasy';
import '@/index.css';

export default function App() {
  const { theme, isDark, cycleTheme } = useTheme();
  const { loading, status, config, actionLoading, handleServiceAction } = useBoxController();

  if (loading) {
    return <div className={`flex min-h-dvh items-center justify-center ${isDark ? 'bg-[#101014]' : 'bg-[#f7f7ff]'}`}><RefreshCw size={28} className="animate-spin text-indigo-600" /></div>;
  }

  return <div className={`mx-auto h-dvh max-w-md overflow-hidden font-sans shadow-2xl ${isDark ? 'bg-[#101014] text-slate-100' : 'bg-[#f7f7ff] text-slate-900'} relative`}>
    <header className="absolute right-3 top-3 z-40">
      <button onClick={cycleTheme} className="rounded-full bg-white/85 p-2.5 text-slate-600 shadow-sm backdrop-blur dark:bg-[#24242a]/90 dark:text-slate-300" title="Тема">
        {theme === 'system' ? <Smartphone size={17}/> : theme === 'dark' ? <Moon size={17}/> : <Sun size={17}/>} 
      </button>
    </header>
    <main className="scrollbar-hide h-dvh overflow-y-auto">
      <TabEasy status={status} config={config} actionLoading={actionLoading} handleServiceAction={handleServiceAction} />
    </main>
  </div>;
}
