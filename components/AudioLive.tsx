import React, { useState, useRef, useEffect } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality } from "@google/genai";
import { Mic, MicOff, Volume2, Play, Square, Loader2 } from 'lucide-react';
import { createPcmBlob, decodeAudioData } from '../services/audioUtils';

interface AudioLiveProps {
  apiKey: string;
}

export const AudioLive: React.FC<AudioLiveProps> = ({ apiKey }) => {
  // Live State
  const [isLive, setIsLive] = useState(false);
  const [liveStatus, setLiveStatus] = useState("未连接");
  
  // Audio Refs
  const inputContextRef = useRef<AudioContext | null>(null);
  const outputContextRef = useRef<AudioContext | null>(null);
  const sessionRef = useRef<any>(null);
  const nextStartTimeRef = useRef<number>(0);
  
  // TTS State
  const [ttsText, setTtsText] = useState("");
  const [isTtsLoading, setIsTtsLoading] = useState(false);

  useEffect(() => {
    return () => {
       stopLiveSession();
    };
  }, []);

  const stopLiveSession = () => {
     if (sessionRef.current) {
         try { sessionRef.current.close(); } catch(e){}
         sessionRef.current = null;
     }
     if (inputContextRef.current) inputContextRef.current.close();
     if (outputContextRef.current) outputContextRef.current.close();
     inputContextRef.current = null;
     outputContextRef.current = null;
     setIsLive(false);
     setLiveStatus("未连接");
  };

  const startLiveSession = async () => {
    setLiveStatus("正在连接...");
    try {
        const ai = new GoogleGenAI({ apiKey });
        
        inputContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
        outputContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
        
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        
        const sessionPromise = ai.live.connect({
            model: 'gemini-2.5-flash-native-audio-preview-09-2025',
            config: {
                responseModalities: [Modality.AUDIO],
                speechConfig: {
                    voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } }
                }
            },
            callbacks: {
                onopen: () => {
                    setLiveStatus("通话中");
                    setIsLive(true);
                    
                    if (!inputContextRef.current) return;

                    const source = inputContextRef.current.createMediaStreamSource(stream);
                    const scriptProcessor = inputContextRef.current.createScriptProcessor(4096, 1, 1);
                    
                    scriptProcessor.onaudioprocess = (e) => {
                        const inputData = e.inputBuffer.getChannelData(0);
                        const pcmBlob = createPcmBlob(inputData);
                        sessionPromise.then(session => {
                             session.sendRealtimeInput({ media: pcmBlob });
                        });
                    };
                    
                    source.connect(scriptProcessor);
                    scriptProcessor.connect(inputContextRef.current.destination);
                },
                onmessage: async (msg: LiveServerMessage) => {
                     const base64Audio = msg.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
                     if (base64Audio && outputContextRef.current) {
                        const ctx = outputContextRef.current;
                        const buffer = await decodeAudioData(
                            new Uint8Array(atob(base64Audio).split('').map(c => c.charCodeAt(0))),
                            ctx,
                            24000,
                            1
                        );
                        
                        nextStartTimeRef.current = Math.max(nextStartTimeRef.current, ctx.currentTime);
                        const source = ctx.createBufferSource();
                        source.buffer = buffer;
                        source.connect(ctx.destination);
                        source.start(nextStartTimeRef.current);
                        nextStartTimeRef.current += buffer.duration;
                     }
                },
                onclose: () => {
                    setLiveStatus("已断开");
                    setIsLive(false);
                },
                onerror: (e) => {
                    console.error(e);
                    setLiveStatus("连接错误");
                }
            }
        });

        sessionRef.current = await sessionPromise;

    } catch (e: any) {
        console.error(e);
        setLiveStatus(`错误: ${e.message}`);
        setIsLive(false);
    }
  };

  const handleTts = async () => {
    if (!ttsText) return;
    setIsTtsLoading(true);
    try {
        const ai = new GoogleGenAI({ apiKey });
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash-preview-tts',
            contents: { parts: [{ text: ttsText }] },
            config: {
                responseModalities: [Modality.AUDIO],
                speechConfig: {
                    voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } }
                }
            }
        });

        const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
        if (base64Audio) {
            const ctx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
            const buffer = await decodeAudioData(
                 new Uint8Array(atob(base64Audio).split('').map(c => c.charCodeAt(0))),
                 ctx,
                 24000,
                 1
            );
            const source = ctx.createBufferSource();
            source.buffer = buffer;
            source.connect(ctx.destination);
            source.start();
        }
    } catch (e) {
        console.error(e);
    } finally {
        setIsTtsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-900 rounded-none md:rounded-lg border-0 md:border border-slate-700 overflow-y-auto p-4 md:p-6 gap-6">
       {/* LIVE SECTION */}
       <div className="bg-slate-800 rounded-xl p-6 border border-slate-600 shadow-lg">
            <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                <Mic className="text-red-500" /> 实时语音 (Live API)
            </h2>
            <p className="text-slate-400 mb-6 text-sm md:text-base">与 Gemini 进行即时语音对话，就像打电话一样自然。</p>
            
            <div className="flex flex-col items-center justify-center p-8 bg-slate-900/50 rounded-full w-40 h-40 md:w-48 md:h-48 mx-auto mb-6 border-4 border-slate-700 transition-all duration-300" 
                 style={{ borderColor: isLive ? '#ef4444' : '#334155', boxShadow: isLive ? '0 0 30px rgba(239,68,68,0.3)' : 'none' }}>
                {isLive ? <Mic size={48} className="text-red-500 animate-pulse" /> : <MicOff size={48} className="text-slate-500" />}
            </div>

            <div className="text-center mb-6">
                <span className={`inline-block px-3 py-1 rounded-full text-xs font-bold ${isLive ? 'bg-red-900 text-red-100' : 'bg-slate-700 text-slate-300'}`}>
                    状态: {liveStatus}
                </span>
            </div>

            <div className="flex justify-center gap-4">
                {!isLive ? (
                    <button onClick={startLiveSession} className="bg-red-600 hover:bg-red-700 text-white px-8 py-3 rounded-full font-bold flex items-center gap-2 transition shadow-lg shadow-red-500/30">
                        <Play size={18} /> 开始通话
                    </button>
                ) : (
                    <button onClick={stopLiveSession} className="bg-slate-600 hover:bg-slate-700 text-white px-8 py-3 rounded-full font-bold flex items-center gap-2 transition">
                        <Square size={18} /> 结束通话
                    </button>
                )}
            </div>
       </div>

       {/* TTS SECTION */}
       <div className="bg-slate-800 rounded-xl p-6 border border-slate-600 flex-1 shadow-lg">
            <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                <Volume2 className="text-blue-500" /> 语音合成 (TTS)
            </h2>
             <textarea 
                value={ttsText}
                onChange={(e) => setTtsText(e.target.value)}
                placeholder="输入想让 Gemini 朗读的文字..."
                className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-white focus:outline-none focus:border-blue-500 h-32 resize-none mb-4"
            />
            <button 
                onClick={handleTts} 
                disabled={isTtsLoading || !ttsText}
                className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-3 rounded-lg font-bold flex items-center gap-2 transition disabled:opacity-50 shadow-lg shadow-blue-500/30"
            >
                {isTtsLoading ? <Loader2 className="animate-spin" /> : <Volume2 />} 朗读
            </button>
       </div>
    </div>
  );
};