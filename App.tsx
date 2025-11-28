import React, { useState } from 'react';
import { Layout } from './components/Layout';
import { ChatInterface } from './components/ChatInterface';
import { VisualStudio } from './components/VisualStudio';
import { AudioLive } from './components/AudioLive';
import { AppMode } from './types';

const App: React.FC = () => {
  const [mode, setMode] = useState<AppMode>(AppMode.CHAT);
  
  // Using the provided key
  const apiKey = 'AIzaSyBXxnsgHGqLRQvomceR1BqQwWPOk2r-X0I';

  if (!apiKey) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-stone-950 text-stone-200">
        <div className="text-center p-8 bg-stone-900 rounded-xl border border-red-900/50">
          <h1 className="text-2xl font-bold mb-2">配置错误</h1>
          <p className="text-stone-500">缺少 API Key。</p>
        </div>
      </div>
    );
  }

  return (
    <Layout currentMode={mode} setMode={setMode}>
      {mode === AppMode.CHAT && <ChatInterface apiKey={apiKey} />}
      {(mode === AppMode.IMAGES || mode === AppMode.VIDEO) && <VisualStudio apiKey={apiKey} />}
      {(mode === AppMode.LIVE || mode === AppMode.AUDIO) && <AudioLive apiKey={apiKey} />}
    </Layout>
  );
};

export default App;