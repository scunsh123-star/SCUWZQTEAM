import React, { useState, useRef, useEffect } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality } from "@google/genai";
import { Mic, MicOff, Volume2, Play, Square, Loader2, Radio } from 'lucide-react';
import { createPcmBlob, decodeAudioData } from '../services/audioUtils';

interface AudioLiveProps {
  apiKey: string;
}

export const AudioLive: React.FC<AudioLiveProps> = ({ apiKey }) => {
  // Live State
  const [isLive, setIsLive] = useState(false);
  const [liveStatus, setLiveStatus] = useState("准备就绪");
  
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
     setLiveStatus("已结束");
  };

  const startLiveSession = async () => {
    setLiveStatus("正在建立连接...");
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
                },
                systemInstruction: "你是一位专业的人类学田野调查助手，语气温和、客观。请帮助用户记录和梳理他们在黄龙溪古镇的见闻。"
            },
            callbacks: {
                onopen: () => {
                    setLiveStatus("通话中 - 正在记录");
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
                    setLiveStatus("连接已断开");
                    setIsLive(false);
                },
                onerror: (e) => {
                    console.error(e);
                    setLiveStatus("连接发生错误");
                }
            }
        });

        sessionRef.current = await sessionPromise;

    } catch (e: any) {
        console.error(e);
        setLiveStatus(`连接失败: ${e.message}`);
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
    <div className="flex flex-col h-full bg-stone-950 rounded-none md:rounded-lg border-0 md:border border-stone-800 overflow-y-auto p-4 md:p-8 gap-8 font-serif">
       {/* LIVE SECTION */}
       <div className="bg-[#141210] rounded-sm p-6 border border-stone-800 relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-10">
                <Radio size={120} />
            </div>
            
            <h2 className="text-xl font-bold text-stone-200 mb-2 flex items-center gap-3">
                <Mic className="text-amber-600" size={24} /> 
                <span className="tracking-widest">口述历史访谈</span>
            </h2>
            <p className="text-stone-500 mb-8 text-sm">与 AI 助手进行实时对话，记录访谈内容或整理思路。</p>
            
            <div className="flex flex-col items-center justify-center py-8">
                 <div className={`w-40 h-40 md:w-48 md:h-48 rounded-full border-[1px] flex items-center justify-center transition-all duration-1000 ${isLive ? 'border-amber-900 bg-amber-900/10 shadow-[0_0_50px_rgba(180,83,9,0.2)]' : 'border-stone-800 bg-stone-900'}`}>
                    {isLive ? <Mic size={48} className="text-amber-600 animate-pulse" /> : <MicOff size={48} className="text-stone-600" />}
                 </div>
                 
                 <div className="mt-8 flex flex-col items-center gap-4">
                     <span className={`text-xs tracking-widest uppercase ${isLive ? 'text-amber-500' : 'text-stone-600'}`}>
                         {liveStatus}
                     </span>
                     
                    {!isLive ? (
                        <button onClick={startLiveSession} className="bg-stone-200 hover:bg-white text-stone-900 px-8 py-3 rounded-full font-bold flex items-center gap-2 transition tracking-wider">
                            <Play size={16} fill="currentColor" /> 开始记录
                        </button>
                    ) : (
                        <button onClick={stopLiveSession} className="bg-stone-800 hover:bg-stone-700 text-stone-300 px-8 py-3 rounded-full font-bold flex items-center gap-2 transition border border-stone-700 tracking-wider">
                            <Square size={16} fill="currentColor" /> 结束记录
                        </button>
                    )}
                 </div>
            </div>
       </div>

       {/* TTS SECTION */}
       <div className="bg-[#141210] rounded-sm p-6 border border-stone-800">
            <h2 className="text-xl font-bold text-stone-200 mb-4 flex items-center gap-3">
                <Volume2 className="text-stone-500" size={24} /> 
                <span className="tracking-widest">语音回读 (TTS)</span>
            </h2>
             <textarea 
                value={ttsText}
                onChange={(e) => setTtsText(e.target.value)}
                placeholder="输入文本，将调研笔记转化为语音..."
                className="w-full bg-stone-900 border border-stone-800 rounded-sm p-4 text-stone-300 focus:outline-none focus:border-stone-600 h-32 resize-none mb-4 font-serif placeholder:text-stone-600"
            />
            <button 
                onClick={handleTts} 
                disabled={isTtsLoading || !ttsText}
                className="bg-stone-800 hover:bg-stone-700 text-stone-300 px-6 py-3 rounded-sm font-medium flex items-center gap-2 transition disabled:opacity-50 border border-stone-700"
            >
                {isTtsLoading ? <Loader2 className="animate-spin text-stone-400" /> : <Volume2 size={18} />} 
                <span className="tracking-widest">朗读文本</span>
            </button>
       </div>
    </div>
  );
};