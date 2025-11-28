import React from 'react';
import { MessageSquare, Image, Mic, ScrollText, Settings } from 'lucide-react';
import { AppMode } from '../types';

interface LayoutProps {
  currentMode: AppMode;
  setMode: (mode: AppMode) => void;
  children: React.ReactNode;
  onOpenSettings: () => void;
}

export const Layout: React.FC<LayoutProps> = ({ currentMode, setMode, children, onOpenSettings }) => {
  
  const NavItem = ({ mode, icon: Icon, label, mobileOnly = false }: { mode: AppMode, icon: any, label: string, mobileOnly?: boolean }) => (
    <button
      onClick={() => setMode(mode)}
      className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-300 w-full md:w-auto border
        ${currentMode === mode 
          ? 'bg-stone-800 text-amber-500 border-amber-900/50 shadow-inner' 
          : 'text-stone-500 border-transparent hover:bg-stone-900 hover:text-stone-300'}
        ${mobileOnly ? 'flex-col gap-1 py-2 text-xs md:flex-row md:text-base md:gap-3 md:py-3 border-none' : ''}
      `}
    >
      <Icon size={mobileOnly ? 24 : 18} strokeWidth={1.5} />
      <span className={mobileOnly ? "text-[10px] md:text-base font-serif tracking-widest" : "font-serif tracking-widest text-sm"}>{label}</span>
    </button>
  );

  return (
    <div className="flex h-screen bg-stone-950 text-stone-200 overflow-hidden flex-col md:flex-row font-serif">
      {/* Sidebar - Desktop */}
      <aside className="hidden md:flex flex-col w-72 p-6 border-r border-stone-800 bg-stone-925 relative">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-stone-800 via-amber-900 to-stone-800 opacity-50"></div>
        
        <div className="mb-10 px-2">
          <div className="flex items-center gap-3 mb-2">
             <div className="w-8 h-8 rounded-sm bg-amber-900/20 flex items-center justify-center border border-amber-900/50">
                <ScrollText size={16} className="text-amber-600" />
             </div>
             <h1 className="text-xl font-bold text-stone-100 tracking-widest">
               黄龙溪调研
             </h1>
          </div>
          <p className="text-xs text-stone-600 pl-11">人文 · 空间 · 影像</p>
        </div>
        
        <nav className="flex-1 space-y-3">
          <NavItem mode={AppMode.CHAT} icon={MessageSquare} label="田野笔记 (对话)" />
          <NavItem mode={AppMode.IMAGES} icon={Image} label="影像工坊 (视觉)" />
          <NavItem mode={AppMode.LIVE} icon={Mic} label="口述记录 (语音)" />
        </nav>

        <div className="mt-auto pt-6 border-t border-stone-900 space-y-4">
             <button 
                onClick={onOpenSettings}
                className="w-full flex items-center gap-3 px-4 py-3 text-stone-500 hover:text-stone-300 hover:bg-stone-900 rounded-lg transition text-sm font-serif tracking-widest"
             >
                <Settings size={18} /> 设置
             </button>
            <div className="px-4 flex justify-between items-center text-xs text-stone-700">
                <span>Gemini 3.0 Pro</span>
                <span className="w-2 h-2 rounded-full bg-amber-900/50"></span>
            </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-full overflow-hidden relative bg-[#0c0a09]">
        {/* Mobile Header */}
        <div className="md:hidden h-14 border-b border-stone-800 flex items-center justify-between px-4 bg-stone-925 shrink-0">
            <div className="flex items-center gap-2">
                 <div className="w-6 h-6 rounded-sm bg-amber-900/20 flex items-center justify-center border border-amber-900/50">
                    <ScrollText size={12} className="text-amber-600" />
                 </div>
                 <span className="font-bold text-stone-200 tracking-widest">黄龙溪调研</span>
            </div>
            <button onClick={onOpenSettings} className="text-stone-500 hover:text-stone-300 p-2">
                <Settings size={20} />
            </button>
        </div>

        <div className="flex-1 overflow-hidden relative">
            {children}
        </div>
      </main>

      {/* Mobile Bottom Navigation */}
      <div className="md:hidden bg-stone-950 border-t border-stone-900 pb-safe z-50">
        <div className="flex justify-around items-center p-1">
            <NavItem mode={AppMode.CHAT} icon={MessageSquare} label="笔记" mobileOnly />
            <NavItem mode={AppMode.IMAGES} icon={Image} label="影像" mobileOnly />
            <NavItem mode={AppMode.LIVE} icon={Mic} label="口述" mobileOnly />
        </div>
      </div>
    </div>
  );
};