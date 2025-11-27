import React from 'react';
import { MessageSquare, Image, Mic, Menu, X, Video } from 'lucide-react';
import { AppMode } from '../types';

interface LayoutProps {
  currentMode: AppMode;
  setMode: (mode: AppMode) => void;
  children: React.ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({ currentMode, setMode, children }) => {
  
  const NavItem = ({ mode, icon: Icon, label, mobileOnly = false }: { mode: AppMode, icon: any, label: string, mobileOnly?: boolean }) => (
    <button
      onClick={() => setMode(mode)}
      className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 w-full md:w-auto
        ${currentMode === mode 
          ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/30' 
          : 'text-slate-400 hover:bg-slate-800 hover:text-white'}
        ${mobileOnly ? 'flex-col gap-1 py-2 text-xs md:flex-row md:text-base md:gap-3 md:py-3' : ''}
      `}
    >
      <Icon size={mobileOnly ? 24 : 20} />
      <span className={mobileOnly ? "text-[10px] md:text-base font-medium" : "font-medium"}>{label}</span>
    </button>
  );

  return (
    <div className="flex h-screen bg-slate-950 text-slate-100 overflow-hidden flex-col md:flex-row">
      {/* Sidebar - Desktop */}
      <aside className="hidden md:flex flex-col w-64 p-4 border-r border-slate-800 bg-slate-900/50 backdrop-blur-xl">
        <div className="mb-8 px-4 py-2">
          <h1 className="text-2xl font-bold bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">
            黄龙溪调研助手
          </h1>
          <p className="text-xs text-slate-500 mt-1">Powered by Gemini 3.0 & 2.5</p>
        </div>
        
        <nav className="flex-1 space-y-2">
          <NavItem mode={AppMode.CHAT} icon={MessageSquare} label="智能对话" />
          <NavItem mode={AppMode.IMAGES} icon={Image} label="视觉创作" />
          <NavItem mode={AppMode.LIVE} icon={Mic} label="实时语音" />
        </nav>

        <div className="p-4 text-xs text-slate-600 border-t border-slate-800">
           Gemini Omni-Studio v2.0
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-full overflow-hidden relative">
        <div className="flex-1 overflow-hidden relative">
            {children}
        </div>
      </main>

      {/* Mobile Bottom Navigation */}
      <div className="md:hidden bg-slate-900 border-t border-slate-800 pb-safe z-50">
        <div className="flex justify-around items-center p-2">
            <NavItem mode={AppMode.CHAT} icon={MessageSquare} label="对话" mobileOnly />
            <NavItem mode={AppMode.IMAGES} icon={Image} label="视觉" mobileOnly />
            <NavItem mode={AppMode.LIVE} icon={Mic} label="语音" mobileOnly />
        </div>
      </div>
    </div>
  );
};