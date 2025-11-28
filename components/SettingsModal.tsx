import React, { useState, useEffect } from 'react';
import { X, Key, Save, ExternalLink } from 'lucide-react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (key: string) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, onSave }) => {
  const [key, setKey] = useState('');

  useEffect(() => {
    const stored = localStorage.getItem('user_api_key');
    if (stored) setKey(stored);
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSave = () => {
    onSave(key);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 font-serif">
      <div className="bg-[#1c1917] border border-stone-800 w-full max-w-md rounded-sm shadow-2xl p-6 relative">
        <button onClick={onClose} className="absolute top-4 right-4 text-stone-500 hover:text-stone-300 transition">
          <X size={20} />
        </button>

        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-full bg-stone-900 flex items-center justify-center border border-stone-800">
            <Key size={18} className="text-amber-600" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-stone-200 tracking-wider">系统设置</h2>
            <p className="text-xs text-stone-600 uppercase tracking-widest mt-0.5">Configuration</p>
          </div>
        </div>

        <div className="space-y-6">
          <div>
            <label className="block text-xs text-stone-500 mb-2 tracking-widest uppercase">API 密钥 (API Key)</label>
            <input
              type="password"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="输入您的 Gemini API Key..."
              className="w-full bg-stone-950 border border-stone-800 rounded-sm p-3 text-stone-300 focus:outline-none focus:border-amber-900/50 focus:ring-1 focus:ring-amber-900/50 transition font-mono text-sm placeholder:text-stone-700"
            />
          </div>

          <div className="bg-stone-900/30 p-4 rounded-sm border border-stone-800/50 text-xs text-stone-500 leading-relaxed">
            <p className="mb-2">⚠️ 如果遇到 "429 Quota Exceeded" 错误，是因为公共 Key 配额耗尽。建议使用自己的付费 Key。</p>
            <a
              href="https://aistudio.google.com/app/apikey"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-amber-700 hover:text-amber-600 transition"
            >
              获取 Key <ExternalLink size={10} />
            </a>
          </div>

          <button
            onClick={handleSave}
            className="w-full bg-stone-800 hover:bg-stone-700 text-stone-200 py-3 rounded-sm font-medium tracking-widest flex items-center justify-center gap-2 transition border border-stone-700 mt-2"
          >
            <Save size={16} /> 保存配置
          </button>
        </div>
      </div>
    </div>
  );
};