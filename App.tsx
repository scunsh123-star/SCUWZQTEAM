import React, { useState, useEffect } from 'react';
import { Layout } from './components/Layout';
import { ChatInterface } from './components/ChatInterface';
import { VisualStudio } from './components/VisualStudio';
import { AudioLive } from './components/AudioLive';
import { SettingsModal } from './components/SettingsModal';
import { AppMode } from './types';

const App: React.FC = () => {
  const [mode, setMode] = useState<AppMode>(AppMode.CHAT);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [customKey, setCustomKey] = useState<string>('');
  
  // Default fallback key - Updated as per user request
  // Note: 'sk-' keys are typically from 3rd party providers. 
  // If this fails, ensure the environment supports the provider's Base URL if needed.
  const defaultKey = 'sk-eeO0gYNqO3cGgSFjf8S3n0bdkrSTtAm9IcQwVvo8JHU9ZWD1';

  useEffect(() => {
    const stored = localStorage.getItem('user_api_key');
    if (stored) setCustomKey(stored);
  }, []);

  const handleSaveKey = (key: string) => {
    if (key.trim()) {
      localStorage.setItem('user_api_key', key.trim());
      setCustomKey(key.trim());
    } else {
      localStorage.removeItem('user_api_key');
      setCustomKey('');
    }
  };

  const finalKey = customKey || defaultKey;

  return (
    <Layout currentMode={mode} setMode={setMode} onOpenSettings={() => setIsSettingsOpen(true)}>
      {mode === AppMode.CHAT && <ChatInterface apiKey={finalKey} />}
      {(mode === AppMode.IMAGES || mode === AppMode.VIDEO) && <VisualStudio apiKey={finalKey} />}
      {(mode === AppMode.LIVE || mode === AppMode.AUDIO) && <AudioLive apiKey={finalKey} />}
      
      <SettingsModal 
        isOpen={isSettingsOpen} 
        onClose={() => setIsSettingsOpen(false)} 
        onSave={handleSaveKey} 
      />
    </Layout>
  );
};

export default App;