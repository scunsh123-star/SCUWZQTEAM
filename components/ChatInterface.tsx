import React, { useState, useRef, useEffect } from 'react';
import { GoogleGenAI } from "@google/genai";
import { Send, MapPin, Search, Brain, Zap, Image as ImageIcon, Mic, Loader2, StopCircle, Feather } from 'lucide-react';
import { ChatMessage, ChatModelType } from '../types';
import { arrayBufferToBase64 } from '../services/audioUtils';

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
                  { text: "请准确转录这段田野调查录音的内容，保持口语原貌。" }
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

      const responseText = response.text || "已记录，但未生成文本响应。";
      
      const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
      const searchLinks = groundingChunks
        ?.filter((c: any) => c.web?.uri)
        .map((c: any) => ({ uri: c.web.uri, title: c.web.title || '参考资料' }));
      
      const mapLinks = groundingChunks
        ?.filter((c: any) => c.maps?.uri)
        .map((c: any) => ({ uri: c.maps.uri, title: c.maps.title || '位置信息' }));

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
        text: `Error: ${err.message || '系统繁忙，请重试。'}`
      }]);
    } finally {
      setIsLoading(false);
      setFiles([]);
    }
  };

  return (
    <div className="flex flex-col h-full bg-stone-950 rounded-none md:rounded-lg overflow-hidden border-0 md:border border-stone-800">
      {/* Header / Config */}
      <div className="p-3 md:p-4 bg-[#141210] border-b border-stone-800 flex flex-col md:flex-row gap-3 items-start md:items-center justify-between">
        <div className="flex gap-2 w-full md:w-auto overflow-x-auto pb-1 md:pb-0 no-scrollbar">
            <button 
              onClick={() => { setSelectedModel(ChatModelType.SMART); setUseSearch(false); setUseMaps(false); }}
              className={`px-3 py-1.5 rounded-sm text-xs tracking-wider flex items-center gap-2 transition whitespace-nowrap border ${selectedModel === ChatModelType.SMART && !useSearch && !useMaps ? 'bg-stone-800 text-amber-500 border-amber-900/30' : 'border-transparent text-stone-500 hover:text-stone-300'}`}
            >
              <Brain size={12} /> 深度分析 (Pro)
            </button>
            <button 
              onClick={() => { setSelectedModel(ChatModelType.FAST); setUseSearch(false); setUseMaps(false); }}
              className={`px-3 py-1.5 rounded-sm text-xs tracking-wider flex items-center gap-2 transition whitespace-nowrap border ${selectedModel === ChatModelType.FAST ? 'bg-stone-800 text-stone-200 border-stone-700' : 'border-transparent text-stone-500 hover:text-stone-300'}`}
            >
              <Zap size={12} /> 快速记录 (Lite)
            </button>
            <button 
              onClick={() => { setSelectedModel(ChatModelType.THINKING); setUseSearch(false); setUseMaps(false); }}
              className={`px-3 py-1.5 rounded-sm text-xs tracking-wider flex items-center gap-2 transition whitespace-nowrap border ${selectedModel === ChatModelType.THINKING ? 'bg-stone-800 text-purple-400 border-purple-900/30' : 'border-transparent text-stone-500 hover:text-stone-300'}`}
            >
              <Brain size={12} /> 深度思考
            </button>
        </div>
        <div className="flex gap-2 w-full md:w-auto pt-2 md:pt-0 md:border-l border-stone-800 md:pl-4 overflow-x-auto pb-1 md:pb-0">
             <button 
              onClick={() => { setUseSearch(!useSearch); setUseMaps(false); setSelectedModel(ChatModelType.SMART); }}
              className={`px-3 py-1.5 rounded-sm text-xs tracking-wider flex items-center gap-2 transition whitespace-nowrap border ${useSearch ? 'bg-blue-900/20 text-blue-400 border-blue-900/30' : 'border-transparent text-stone-500 hover:text-stone-300'}`}
            >
              <Search size={12} /> 资料库
            </button>
             <button 
              onClick={() => { setUseMaps(!useMaps); setUseSearch(false); setSelectedModel(ChatModelType.SMART); }}
              className={`px-3 py-1.5 rounded-sm text-xs tracking-wider flex items-center gap-2 transition whitespace-nowrap border ${useMaps ? 'bg-green-900/20 text-green-400 border-green-900/30' : 'border-transparent text-stone-500 hover:text-stone-300'}`}
            >
              <MapPin size={12} /> 地理志
            </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6 bg-stone-950">
        {messages.length === 0 && (
          <div className="text-center text-stone-600 mt-24 px-6">
            <div className="w-16 h-16 rounded-full bg-stone-900 flex items-center justify-center mx-auto mb-6 border border-stone-800">
               <Feather size={24} className="text-amber-700/50" />
            </div>
            <p className="text-xl font-serif text-stone-400">黄龙溪调研助手</p>
            <p className="text-xs mt-3 tracking-widest uppercase opacity-50">Field Research Assistant</p>
            <p className="text-sm mt-6 text-stone-600 max-w-xs mx-auto leading-relaxed">请上传照片分析建筑肌理，或录入访谈内容。我将协助您整理田野资料。</p>
          </div>
        )}
        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[90%] md:max-w-[80%] p-4 md:p-6 rounded-sm border ${
                msg.role === 'user' 
                  ? 'bg-stone-800 border-stone-700 text-stone-100' 
                  : 'bg-stone-925 border-stone-800 text-stone-300'
              }`}>
              {msg.images && msg.images.length > 0 && (
                <div className="flex gap-2 mb-4 overflow-x-auto pb-2">
                    {msg.images.map((img, i) => (
                        <img key={i} src={img} alt="Uploaded" className="h-32 w-auto rounded-sm object-cover border border-stone-700 grayscale-[0.2]" />
                    ))}
                </div>
              )}
              {msg.thinking && (
                 <div className="text-xs text-purple-400 mb-3 flex items-center gap-2 opacity-75 border-b border-purple-900/30 pb-2">
                    <Brain size={12} /> 思维链分析中...
                 </div>
              )}
              <div className="whitespace-pre-wrap text-sm md:text-base leading-7 font-serif">{msg.text}</div>
              
              {/* Grounding Sources */}
              {msg.grounding && (msg.grounding.search?.length || msg.grounding.maps?.length) ? (
                <div className="mt-4 pt-4 border-t border-dashed border-stone-800 flex flex-wrap gap-2">
                   {msg.grounding.search?.map((s, idx) => (
                      <a key={idx} href={s.uri} target="_blank" rel="noreferrer" className="text-[10px] bg-stone-900 hover:bg-stone-800 px-2 py-1 border border-stone-800 rounded-sm flex items-center gap-1 text-blue-400 truncate max-w-[150px] transition">
                        <Search size={10} /> {s.title}
                      </a>
                   ))}
                   {msg.grounding.maps?.map((m, idx) => (
                      <a key={idx} href={m.uri} target="_blank" rel="noreferrer" className="text-[10px] bg-stone-900 hover:bg-stone-800 px-2 py-1 border border-stone-800 rounded-sm flex items-center gap-1 text-green-400 truncate max-w-[150px] transition">
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
                <div className="bg-stone-900 border border-stone-800 rounded-sm p-4 flex items-center gap-3">
                    <Loader2 className="animate-spin text-amber-700" size={16} />
                    <span className="text-stone-500 text-sm font-serif">正在整理资料...</span>
                </div>
            </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-3 md:p-5 bg-[#141210] border-t border-stone-800">
        <div className="flex gap-3 items-end">
             {/* Upload Button */}
            <button 
                onClick={() => fileInputRef.current?.click()}
                className="p-3 rounded-full hover:bg-stone-800 text-stone-500 hover:text-stone-300 transition shrink-0"
                title="上传田野照片/视频"
            >
                <ImageIcon size={20} strokeWidth={1.5} />
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
                className={`p-3 rounded-full transition shrink-0 border ${isRecording ? 'bg-red-900/20 text-red-500 border-red-900/50 animate-pulse' : 'hover:bg-stone-800 text-stone-500 hover:text-stone-300 border-transparent'}`}
                title="口述录入"
            >
                {isRecording ? <StopCircle size={20} /> : <Mic size={20} strokeWidth={1.5} />}
            </button>
            
            <div className="flex-1 bg-stone-900 rounded-lg border border-stone-800 flex flex-col min-h-[50px] focus-within:border-stone-600 transition">
                 {files.length > 0 && (
                    <div className="p-2 flex gap-2 overflow-x-auto border-b border-stone-800 scrollbar-hide">
                        {files.map((f, i) => (
                            <div key={i} className="text-xs bg-stone-800 px-2 py-1 rounded text-stone-300 flex items-center gap-2 whitespace-nowrap font-serif">
                                {f.name}
                                <button onClick={() => setFiles(files.filter((_, idx) => idx !== i))} className="hover:text-red-400">×</button>
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
                    placeholder={isRecording ? "正在聆听..." : "输入调研记录..."}
                    className="w-full bg-transparent text-stone-200 p-3 focus:outline-none resize-none max-h-[120px] placeholder:text-stone-600"
                    rows={1}
                />
            </div>

            <button 
                onClick={handleSend}
                disabled={isLoading || (!input.trim() && files.length === 0)}
                className="p-3 rounded-full bg-stone-800 hover:bg-stone-700 text-amber-600 disabled:opacity-50 disabled:cursor-not-allowed transition shrink-0 border border-stone-700"
            >
                <Send size={20} strokeWidth={1.5} />
            </button>
        </div>
      </div>
    </div>
  );
};