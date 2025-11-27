import React, { useState, useRef, useEffect } from 'react';
import { GoogleGenAI } from "@google/genai";
import { Send, MapPin, Search, Brain, Zap, Image as ImageIcon, Mic, Loader2, StopCircle, FileAudio } from 'lucide-react';
import { ChatMessage, ChatModelType } from '../types';
import { createPcmBlob, arrayBufferToBase64 } from '../services/audioUtils';

interface ChatInterfaceProps {
  apiKey: string;
}

export const ChatInterface: React.FC<ChatInterfaceProps> = ({ apiKey }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [selectedModel, setSelectedModel] = useState<ChatModelType>(ChatModelType.SMART);
  const [useSearch, setUseSearch] = useState(false);
  const [useMaps, setUseMaps] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [location, setLocation] = useState<{ lat: number, lng: number } | null>(null);

  // Audio Recording State
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        (err) => console.warn("Location denied", err)
      );
    }
  }, []);

  const handleTranscribe = async () => {
    if (isRecording) {
      // Stop recording
      mediaRecorderRef.current?.stop();
      setIsRecording(false);
    } else {
      // Start recording
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const mediaRecorder = new MediaRecorder(stream);
        mediaRecorderRef.current = mediaRecorder;
        audioChunksRef.current = [];

        mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            audioChunksRef.current.push(event.data);
          }
        };

        mediaRecorder.onstop = async () => {
          setIsLoading(true);
          const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/wav' }); // or webm depending on browser
          const arrayBuffer = await audioBlob.arrayBuffer();
          const base64Audio = arrayBufferToBase64(arrayBuffer);

          try {
            const ai = new GoogleGenAI({ apiKey });
            const response = await ai.models.generateContent({
              model: 'gemini-2.5-flash',
              contents: {
                parts: [
                  { inlineData: { mimeType: 'audio/wav', data: base64Audio } },
                  { text: "请准确转录这段音频的内容。" }
                ]
              }
            });
            if (response.text) {
              setInput(prev => (prev ? prev + " " + response.text : response.text));
            }
          } catch (e) {
            console.error("Transcription failed", e);
            alert("转录失败，请重试");
          } finally {
            setIsLoading(false);
            stream.getTracks().forEach(track => track.stop());
          }
        };

        mediaRecorder.start();
        setIsRecording(true);
      } catch (err) {
        console.error("Microphone access denied", err);
        alert("无法访问麦克风");
      }
    }
  };

  const handleSend = async () => {
    if ((!input.trim() && files.length === 0) || isLoading) return;

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      text: input,
      images: files.length > 0 ? files.map(f => URL.createObjectURL(f)) : undefined
    };

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    try {
      const ai = new GoogleGenAI({ apiKey });
      
      let modelName: string = selectedModel;
      if (selectedModel === ChatModelType.THINKING) {
        modelName = 'gemini-3-pro-preview';
      }

      // Logic: If searching or maps, use 2.5 flash as per prompt requirements
      if (useSearch || useMaps) {
        modelName = 'gemini-2.5-flash';
      }

      const tools: any[] = [];
      if (useSearch) tools.push({ googleSearch: {} });
      if (useMaps) tools.push({ googleMaps: {} });

      const config: any = { tools: tools.length > 0 ? tools : undefined };
      
      if (useMaps && location) {
         config.toolConfig = {
            retrievalConfig: {
              latLng: {
                latitude: location.lat,
                longitude: location.lng
              }
            }
         };
      }

      if (selectedModel === ChatModelType.THINKING && !useSearch && !useMaps) {
        config.thinkingConfig = { thinkingBudget: 32768 };
      }

      const parts: any[] = [];
      if (input) parts.push({ text: input });

      for (const file of files) {
        const base64 = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
          reader.readAsDataURL(file);
        });
        parts.push({
          inlineData: {
            data: base64,
            mimeType: file.type
          }
        });
      }

      const response = await ai.models.generateContent({
        model: modelName,
        contents: { parts },
        config
      });

      const responseText = response.text || "已处理，但未生成文本响应。";
      
      const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
      const searchLinks = groundingChunks
        ?.filter((c: any) => c.web?.uri)
        .map((c: any) => ({ uri: c.web.uri, title: c.web.title || '来源' }));
      
      const mapLinks = groundingChunks
        ?.filter((c: any) => c.maps?.uri)
        .map((c: any) => ({ uri: c.maps.uri, title: c.maps.title || '地图位置' }));

      const mapSnippets = groundingChunks
          ?.filter((c: any) => c.maps?.placeAnswerSources?.reviewSnippets)
          .flatMap((c: any) => c.maps.placeAnswerSources.reviewSnippets.map((s: any) => ({ uri: s.sourceUri, title: "评论来源" })));

      const finalMapLinks = [...(mapLinks || []), ...(mapSnippets || [])];


      const botMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'model',
        text: responseText,
        grounding: {
          search: searchLinks,
          maps: finalMapLinks
        },
        thinking: selectedModel === ChatModelType.THINKING
      };

      setMessages(prev => [...prev, botMsg]);

    } catch (err: any) {
      console.error(err);
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        role: 'model',
        text: `Error: ${err.message || '发生错误。'}`
      }]);
    } finally {
      setIsLoading(false);
      setFiles([]);
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-900 rounded-none md:rounded-lg overflow-hidden border-0 md:border border-slate-700">
      {/* Header / Config */}
      <div className="p-2 md:p-4 bg-slate-800 border-b border-slate-700 flex flex-col md:flex-row gap-2 items-start md:items-center justify-between">
        <div className="flex gap-2 w-full md:w-auto overflow-x-auto pb-1 md:pb-0 no-scrollbar">
            <button 
              onClick={() => { setSelectedModel(ChatModelType.SMART); setUseSearch(false); setUseMaps(false); }}
              className={`px-3 py-1.5 rounded-full text-xs font-medium flex items-center gap-1 transition whitespace-nowrap ${selectedModel === ChatModelType.SMART && !useSearch && !useMaps ? 'bg-indigo-600 text-white' : 'bg-slate-700 text-slate-300'}`}
            >
              <Brain size={14} /> 智能 (Pro)
            </button>
            <button 
              onClick={() => { setSelectedModel(ChatModelType.FAST); setUseSearch(false); setUseMaps(false); }}
              className={`px-3 py-1.5 rounded-full text-xs font-medium flex items-center gap-1 transition whitespace-nowrap ${selectedModel === ChatModelType.FAST ? 'bg-yellow-600 text-white' : 'bg-slate-700 text-slate-300'}`}
            >
              <Zap size={14} /> 极速 (Lite)
            </button>
            <button 
              onClick={() => { setSelectedModel(ChatModelType.THINKING); setUseSearch(false); setUseMaps(false); }}
              className={`px-3 py-1.5 rounded-full text-xs font-medium flex items-center gap-1 transition whitespace-nowrap ${selectedModel === ChatModelType.THINKING ? 'bg-purple-600 text-white' : 'bg-slate-700 text-slate-300'}`}
            >
              <Brain size={14} /> 深度思考
            </button>
        </div>
        <div className="flex gap-2 w-full md:w-auto pt-1 md:pt-0 md:border-l border-slate-600 md:pl-2 overflow-x-auto pb-1 md:pb-0">
             <button 
              onClick={() => { setUseSearch(!useSearch); setUseMaps(false); setSelectedModel(ChatModelType.SMART); }}
              className={`px-3 py-1.5 rounded-full text-xs font-medium flex items-center gap-1 transition whitespace-nowrap ${useSearch ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-300'}`}
            >
              <Search size={14} /> 谷歌搜索
            </button>
             <button 
              onClick={() => { setUseMaps(!useMaps); setUseSearch(false); setSelectedModel(ChatModelType.SMART); }}
              className={`px-3 py-1.5 rounded-full text-xs font-medium flex items-center gap-1 transition whitespace-nowrap ${useMaps ? 'bg-green-600 text-white' : 'bg-slate-700 text-slate-300'}`}
            >
              <MapPin size={14} /> 地图信息
            </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-900/50">
        {messages.length === 0 && (
          <div className="text-center text-slate-500 mt-12 md:mt-20 px-4">
            <Brain size={48} className="mx-auto mb-4 opacity-50" />
            <p className="text-lg font-medium">你好！我是黄龙溪调研助手。</p>
            <p className="text-sm mt-2">我可以帮你分析视频、查询资料、或进行深度推理。</p>
          </div>
        )}
        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[90%] md:max-w-[85%] rounded-2xl p-4 shadow-sm ${msg.role === 'user' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-100'}`}>
              {msg.images && msg.images.length > 0 && (
                <div className="flex gap-2 mb-2 overflow-x-auto">
                    {msg.images.map((img, i) => (
                        <img key={i} src={img} alt="User upload" className="h-24 w-auto rounded-md object-cover border border-white/20" />
                    ))}
                </div>
              )}
              {msg.thinking && (
                 <div className="text-xs text-purple-300 mb-1 flex items-center gap-1 opacity-75">
                    <Brain size={10} /> 深度思考模式
                 </div>
              )}
              <div className="whitespace-pre-wrap text-sm md:text-base leading-relaxed">{msg.text}</div>
              
              {/* Grounding Sources */}
              {msg.grounding && (msg.grounding.search?.length || msg.grounding.maps?.length) ? (
                <div className="mt-3 pt-3 border-t border-white/10 flex flex-wrap gap-2">
                   {msg.grounding.search?.map((s, idx) => (
                      <a key={idx} href={s.uri} target="_blank" rel="noreferrer" className="text-xs bg-black/20 hover:bg-black/40 px-2 py-1 rounded flex items-center gap-1 text-blue-300 truncate max-w-[150px]">
                        <Search size={10} /> {s.title}
                      </a>
                   ))}
                   {msg.grounding.maps?.map((m, idx) => (
                      <a key={idx} href={m.uri} target="_blank" rel="noreferrer" className="text-xs bg-black/20 hover:bg-black/40 px-2 py-1 rounded flex items-center gap-1 text-green-300 truncate max-w-[150px]">
                        <MapPin size={10} /> {m.title}
                      </a>
                   ))}
                </div>
              ) : null}
            </div>
          </div>
        ))}
        {isLoading && (
            <div className="flex justify-start">
                <div className="bg-slate-800 rounded-2xl p-4 flex items-center gap-2 shadow-sm">
                    <Loader2 className="animate-spin text-indigo-400" size={16} />
                    <span className="text-slate-400 text-sm">正在思考...</span>
                </div>
            </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-3 md:p-4 bg-slate-800 border-t border-slate-700">
        <div className="flex gap-2 items-end">
             {/* Upload Button */}
            <button 
                onClick={() => fileInputRef.current?.click()}
                className="p-3 rounded-full bg-slate-700 hover:bg-slate-600 text-slate-300 transition shrink-0"
                title="上传图片/视频"
            >
                <ImageIcon size={20} />
            </button>
            <input 
                type="file" 
                ref={fileInputRef} 
                className="hidden" 
                onChange={(e) => {
                    if (e.target.files) setFiles(Array.from(e.target.files));
                }}
                accept="image/*,video/*,audio/*"
                multiple
            />

            {/* Mic Button */}
            <button 
                onClick={handleTranscribe}
                className={`p-3 rounded-full transition shrink-0 ${isRecording ? 'bg-red-600 text-white animate-pulse' : 'bg-slate-700 hover:bg-slate-600 text-slate-300'}`}
                title="录音转写"
            >
                {isRecording ? <StopCircle size={20} /> : <Mic size={20} />}
            </button>
            
            <div className="flex-1 bg-slate-900 rounded-2xl border border-slate-700 flex flex-col min-h-[50px]">
                 {files.length > 0 && (
                    <div className="p-2 flex gap-2 overflow-x-auto border-b border-slate-800 scrollbar-hide">
                        {files.map((f, i) => (
                            <div key={i} className="text-xs bg-slate-800 px-2 py-1 rounded text-slate-300 flex items-center gap-1 whitespace-nowrap">
                                {f.name}
                                <button onClick={() => setFiles(files.filter((_, idx) => idx !== i))} className="hover:text-red-400 ml-1">×</button>
                            </div>
                        ))}
                    </div>
                )}
                <textarea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            handleSend();
                        }
                    }}
                    placeholder={isRecording ? "正在听..." : "输入消息..."}
                    className="w-full bg-transparent text-white p-3 focus:outline-none resize-none max-h-[120px]"
                    rows={1}
                />
            </div>

            <button 
                onClick={handleSend}
                disabled={isLoading || (!input.trim() && files.length === 0)}
                className="p-3 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50 disabled:cursor-not-allowed transition shrink-0 shadow-lg shadow-indigo-500/20"
            >
                <Send size={20} />
            </button>
        </div>
      </div>
    </div>
  );
};