import React, { useState } from 'react';
import { Layout } from './components/Layout';
import { ChatInterface } from './components/ChatInterface';
import { VisualStudio } from './components/VisualStudio';
import { AudioLive } from './components/AudioLive';
import { AppMode } from './types';

const App: React.FC = () => {
  const [mode, setMode] = useState<AppMode>(AppMode.CHAT);
  
  // In a real environment, this is injected securely. 
  // We use process.env.API_KEY as requested.
  const apiKey = process.env.API_KEY || '';

  if (!apiKey) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-slate-950 text-white">
        <div className="text-center p-8 bg-slate-900 rounded-xl border border-red-500/50">
          <h1 className="text-2xl font-bold mb-2">Configuration Error</h1>
          <p className="text-slate-400">API Key is missing from the environment.</p>
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