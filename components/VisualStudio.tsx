import React, { useState } from 'react';
import { GoogleGenAI } from "@google/genai";
import { Image as ImageIcon, Video, Wand2, Edit, Check, AlertCircle, Loader2, Download, Save, Film } from 'lucide-react';
import { ImageGenerationConfig } from '../types';

interface VisualStudioProps {
  apiKey: string;
}

export const VisualStudio: React.FC<VisualStudioProps> = ({ apiKey }) => {
  const [tab, setTab] = useState<'gen' | 'edit' | 'video'>('gen');
  
  // Image Gen State
  const [genPrompt, setGenPrompt] = useState('');
  const [genConfig, setGenConfig] = useState<ImageGenerationConfig>({
    aspectRatio: '1:1',
    size: '1K',
    count: 1
  });
  const [generatedImages, setGeneratedImages] = useState<string[]>([]);

  // Edit State
  const [editPrompt, setEditPrompt] = useState('');
  const [editFile, setEditFile] = useState<File | null>(null);
  const [editedImage, setEditedImage] = useState<string | null>(null);

  // Video State
  const [videoPrompt, setVideoPrompt] = useState('');
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoAspectRatio, setVideoAspectRatio] = useState<'16:9' | '9:16'>('16:9');

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ASPECT_RATIOS = ["1:1", "2:3", "3:2", "3:4", "4:3", "9:16", "16:9", "21:9"];

  // Handlers
  const handleGenerateImage = async () => {
    setIsLoading(true);
    setError(null);
    setGeneratedImages([]);
    const ai = new GoogleGenAI({ apiKey });
    
    try {
      // Try Pro model first
      const response = await ai.models.generateContent({
        model: 'gemini-3-pro-image-preview',
        contents: { parts: [{ text: genPrompt }] },
        config: {
          imageConfig: {
            aspectRatio: genConfig.aspectRatio,
            imageSize: genConfig.size
          }
        }
      });
      processImageResponse(response);
    } catch (e: any) {
      if (e.message && e.message.includes("429")) {
        // Fallback to Flash Image if Pro quota exceeded
        try {
            console.log("Fallback to Flash Image due to quota");
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash-image',
                contents: { parts: [{ text: genPrompt }] },
                config: {
                    imageConfig: { aspectRatio: genConfig.aspectRatio }
                    // Note: Flash image doesn't support 'imageSize' config
                }
            });
            processImageResponse(response);
        } catch (e2: any) {
            setError("服务繁忙，请稍后再试 (429 Quota Exceeded)。");
        }
      } else if (e.message && (e.message.includes("403") || e.message.includes("API key not valid"))) {
         setError("⚠️ API Key 无效或已失效（可能已泄露）。请在设置中更新 Key。");
      } else {
        setError(e.message);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const processImageResponse = (response: any) => {
    const images: string[] = [];
    if (response.candidates?.[0]?.content?.parts) {
         for (const part of response.candidates[0].content.parts) {
            if (part.inlineData) {
                images.push(`data:image/png;base64,${part.inlineData.data}`);
            }
         }
    }
    setGeneratedImages(images);
    if (images.length === 0) setError("未生成图像，请检查提示词。");
  };

  const handleEditImage = async () => {
    if (!editFile || !editPrompt) return;
    setIsLoading(true);
    setError(null);
    setEditedImage(null);
    try {
      const ai = new GoogleGenAI({ apiKey });
      const base64 = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
          reader.readAsDataURL(editFile);
      });

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image', 
        contents: {
          parts: [
            { inlineData: { data: base64, mimeType: editFile.type } },
            { text: editPrompt }
          ]
        }
      });

       if (response.candidates?.[0]?.content?.parts) {
         for (const part of response.candidates[0].content.parts) {
            if (part.inlineData) {
                setEditedImage(`data:image/png;base64,${part.inlineData.data}`);
                break;
            }
         }
      } else {
          setError("未返回编辑后的图像。");
      }

    } catch (e: any) {
      if (e.message && (e.message.includes("403") || e.message.includes("API key not valid"))) {
         setError("⚠️ API Key 无效或已失效（可能已泄露）。请在设置中更新 Key。");
      } else {
         setError(e.message);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleGenerateVideo = async () => {
    setIsLoading(true);
    setError(null);
    setVideoUrl(null);

    try {
      // Key Selection Check for Veo
      const aiStudio = (window as any).aistudio;
      if (aiStudio && await aiStudio.hasSelectedApiKey()) {
         // Good to go
      } else if (aiStudio) {
          const success = await aiStudio.openSelectKey();
          if (!success) {
            throw new Error("请先选择 API Key 以使用视频生成功能。");
          }
      }

      const ai = new GoogleGenAI({ apiKey });

      let operation;
      const model = 'veo-3.1-fast-generate-preview';
      
      if (videoFile) {
        // Image to video
         const base64 = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
          reader.readAsDataURL(videoFile);
        });

        operation = await ai.models.generateVideos({
            model,
            prompt: videoPrompt || "Animate this scene naturally", 
            image: {
                imageBytes: base64,
                mimeType: videoFile.type === 'image/jpeg' ? 'image/jpeg' : 'image/png'
            },
            config: {
                numberOfVideos: 1,
                resolution: '720p', 
                aspectRatio: videoAspectRatio
            }
        });
      } else {
        // Text to video
        operation = await ai.models.generateVideos({
            model,
            prompt: videoPrompt,
            config: {
                numberOfVideos: 1,
                resolution: '1080p',
                aspectRatio: videoAspectRatio
            }
        });
      }

      // Poll
      while (!operation.done) {
          await new Promise(resolve => setTimeout(resolve, 5000));
          // @ts-ignore
          operation = await ai.operations.getVideosOperation({operation: operation});
      }

      const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
      if (downloadLink) {
         const vidRes = await fetch(`${downloadLink}&key=${apiKey}`);
         const blob = await vidRes.blob();
         setVideoUrl(URL.createObjectURL(blob));
      } else {
        throw new Error("生成完成，但未返回视频地址。");
      }

    } catch (e: any) {
        if (e.message && e.message.includes("Requested entity was not found")) {
             setError("API Key 验证失败，请重新选择 Key。");
             if((window as any).aistudio) (window as any).aistudio.openSelectKey();
        } else if (e.message && (e.message.includes("403") || e.message.includes("API key not valid"))) {
             setError("⚠️ API Key 无效或已失效（可能已泄露）。请在设置中更新 Key。");
        } else {
             setError(e.message);
        }
    } finally {
        setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-stone-950 rounded-none md:rounded-lg border-0 md:border border-stone-800 overflow-hidden font-serif">
      {/* Tabs */}
      <div className="flex border-b border-stone-800 bg-[#141210] overflow-x-auto">
        <button onClick={() => setTab('gen')} className={`flex-1 p-4 flex items-center justify-center gap-2 min-w-[100px] whitespace-nowrap transition-colors text-sm tracking-widest ${tab === 'gen' ? 'text-amber-500 border-b-2 border-amber-600 bg-stone-900' : 'text-stone-500 hover:text-stone-300'}`}>
            <Wand2 size={16} /> 意境重绘
        </button>
        <button onClick={() => setTab('edit')} className={`flex-1 p-4 flex items-center justify-center gap-2 min-w-[100px] whitespace-nowrap transition-colors text-sm tracking-widest ${tab === 'edit' ? 'text-amber-500 border-b-2 border-amber-600 bg-stone-900' : 'text-stone-500 hover:text-stone-300'}`}>
            <Edit size={16} /> 影像修整
        </button>
        <button onClick={() => setTab('video')} className={`flex-1 p-4 flex items-center justify-center gap-2 min-w-[100px] whitespace-nowrap transition-colors text-sm tracking-widest ${tab === 'video' ? 'text-amber-500 border-b-2 border-amber-600 bg-stone-900' : 'text-stone-500 hover:text-stone-300'}`}>
            <Film size={16} /> 动态记录
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 md:p-8">
        {error && (
            <div className="bg-red-900/20 border border-red-900/50 text-red-400 p-4 rounded-sm mb-6 flex items-center gap-3">
                <AlertCircle size={20} />
                <span className="text-sm">{error}</span>
            </div>
        )}

        {/* --- TAB: GENERATE --- */}
        {tab === 'gen' && (
            <div className="max-w-xl mx-auto space-y-8">
                <div className="space-y-4">
                    <label className="block text-stone-500 text-xs tracking-widest uppercase">创作意图 (Prompt)</label>
                    <textarea 
                        value={genPrompt}
                        onChange={(e) => setGenPrompt(e.target.value)}
                        placeholder="描述您想生成的画面，例如：黄龙溪古镇的清晨，水雾弥漫，石板路..."
                        className="w-full bg-stone-900 border border-stone-800 rounded-sm p-4 text-stone-300 focus:outline-none focus:border-amber-900/50 h-32 resize-none placeholder:text-stone-600"
                    />
                </div>

                <div className="grid grid-cols-2 gap-4">
                     <div>
                        <label className="block text-stone-500 text-xs tracking-widest uppercase mb-2">画幅比例</label>
                        <select 
                            value={genConfig.aspectRatio}
                            onChange={(e) => setGenConfig({...genConfig, aspectRatio: e.target.value})}
                            className="w-full bg-stone-900 border border-stone-800 rounded-sm p-3 text-stone-300 focus:outline-none"
                        >
                            {ASPECT_RATIOS.map(r => <option key={r} value={r}>{r}</option>)}
                        </select>
                     </div>
                     <div>
                        <label className="block text-stone-500 text-xs tracking-widest uppercase mb-2">精细度</label>
                        <select 
                            value={genConfig.size}
                            onChange={(e) => setGenConfig({...genConfig, size: e.target.value as any})}
                            className="w-full bg-stone-900 border border-stone-800 rounded-sm p-3 text-stone-300 focus:outline-none"
                        >
                            <option value="1K">标准 (1K)</option>
                            <option value="2K">高清 (2K)</option>
                            <option value="4K">超清 (4K)</option>
                        </select>
                     </div>
                </div>

                <button 
                    onClick={handleGenerateImage}
                    disabled={isLoading || !genPrompt}
                    className="w-full bg-stone-800 hover:bg-stone-700 text-amber-500 py-4 rounded-sm font-bold tracking-widest flex items-center justify-center gap-2 transition disabled:opacity-50 disabled:cursor-not-allowed border border-stone-700"
                >
                    {isLoading ? <Loader2 className="animate-spin" /> : <Wand2 size={20} />} 
                    开始创作
                </button>

                {generatedImages.length > 0 && (
                    <div className="grid grid-cols-1 gap-4 mt-8">
                        {generatedImages.map((img, idx) => (
                            <div key={idx} className="relative group">
                                <img src={img} alt="Generated" className="w-full rounded-sm border border-stone-800 shadow-2xl" />
                                <a 
                                    href={img} 
                                    download={`huanglongxi-gen-${Date.now()}.png`}
                                    className="absolute bottom-4 right-4 bg-black/50 hover:bg-black/80 text-white p-2 rounded backdrop-blur-sm transition opacity-0 group-hover:opacity-100"
                                >
                                    <Download size={20} />
                                </a>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        )}

        {/* --- TAB: EDIT --- */}
        {tab === 'edit' && (
            <div className="max-w-xl mx-auto space-y-8">
                 <div className="space-y-4">
                    <label className="block text-stone-500 text-xs tracking-widest uppercase">原片上传</label>
                    <div className="border border-dashed border-stone-700 rounded-sm p-8 text-center hover:bg-stone-900 transition cursor-pointer" onClick={() => (document.querySelector('#edit-upload') as HTMLInputElement)?.click()}>
                        {editFile ? (
                            <div className="text-stone-300 flex items-center justify-center gap-2">
                                <Check size={16} className="text-green-500" /> {editFile.name}
                            </div>
                        ) : (
                            <div className="text-stone-500">点击上传照片</div>
                        )}
                        <input id="edit-upload" type="file" className="hidden" accept="image/*" onChange={(e) => setEditFile(e.target.files?.[0] || null)} />
                    </div>
                </div>

                <div className="space-y-4">
                    <label className="block text-stone-500 text-xs tracking-widest uppercase">修整指令</label>
                    <textarea 
                        value={editPrompt}
                        onChange={(e) => setEditPrompt(e.target.value)}
                        placeholder="例如：把背景中的现代建筑移除，或添加一种胶片质感..."
                        className="w-full bg-stone-900 border border-stone-800 rounded-sm p-4 text-stone-300 focus:outline-none focus:border-amber-900/50 h-32 resize-none placeholder:text-stone-600"
                    />
                </div>

                <button 
                    onClick={handleEditImage}
                    disabled={isLoading || !editPrompt || !editFile}
                    className="w-full bg-stone-800 hover:bg-stone-700 text-amber-500 py-4 rounded-sm font-bold tracking-widest flex items-center justify-center gap-2 transition disabled:opacity-50 disabled:cursor-not-allowed border border-stone-700"
                >
                    {isLoading ? <Loader2 className="animate-spin" /> : <Edit size={20} />} 
                    执行修整
                </button>

                {editedImage && (
                    <div className="mt-8 relative group">
                        <img src={editedImage} alt="Edited" className="w-full rounded-sm border border-stone-800 shadow-2xl" />
                         <a 
                            href={editedImage} 
                            download={`huanglongxi-edit-${Date.now()}.png`}
                            className="absolute bottom-4 right-4 bg-black/50 hover:bg-black/80 text-white p-2 rounded backdrop-blur-sm transition opacity-0 group-hover:opacity-100"
                        >
                            <Download size={20} />
                        </a>
                    </div>
                )}
            </div>
        )}

        {/* --- TAB: VIDEO --- */}
        {tab === 'video' && (
             <div className="max-w-xl mx-auto space-y-8">
                 <div className="bg-amber-900/10 border border-amber-900/30 p-4 rounded-sm text-amber-600 text-xs leading-relaxed">
                    <p className="font-bold mb-1">注意：</p>
                    Veo 视频生成需要使用您个人的付费 API Key。在生成前，系统可能会请求您选择 Key。
                 </div>

                 <div className="space-y-4">
                    <label className="block text-stone-500 text-xs tracking-widest uppercase">参考图片 (可选)</label>
                    <div className="border border-dashed border-stone-700 rounded-sm p-8 text-center hover:bg-stone-900 transition cursor-pointer" onClick={() => (document.querySelector('#video-upload') as HTMLInputElement)?.click()}>
                        {videoFile ? (
                            <div className="text-stone-300 flex items-center justify-center gap-2">
                                <Check size={16} className="text-green-500" /> {videoFile.name}
                            </div>
                        ) : (
                            <div className="text-stone-500">点击上传参考图 (图生视频)</div>
                        )}
                        <input id="video-upload" type="file" className="hidden" accept="image/*" onChange={(e) => setVideoFile(e.target.files?.[0] || null)} />
                    </div>
                </div>

                <div className="space-y-4">
                    <label className="block text-stone-500 text-xs tracking-widest uppercase">动态描述</label>
                    <textarea 
                        value={videoPrompt}
                        onChange={(e) => setVideoPrompt(e.target.value)}
                        placeholder="描述视频的动态内容..."
                        className="w-full bg-stone-900 border border-stone-800 rounded-sm p-4 text-stone-300 focus:outline-none focus:border-amber-900/50 h-32 resize-none placeholder:text-stone-600"
                    />
                </div>

                 <div className="space-y-4">
                    <label className="block text-stone-500 text-xs tracking-widest uppercase">画幅比例</label>
                    <div className="flex gap-4">
                        <button 
                            onClick={() => setVideoAspectRatio('16:9')}
                            className={`flex-1 py-3 rounded-sm border transition text-sm ${videoAspectRatio === '16:9' ? 'bg-stone-800 border-amber-900/50 text-amber-500' : 'border-stone-800 text-stone-500 hover:bg-stone-900'}`}
                        >
                            16:9 (横屏)
                        </button>
                        <button 
                            onClick={() => setVideoAspectRatio('9:16')}
                            className={`flex-1 py-3 rounded-sm border transition text-sm ${videoAspectRatio === '9:16' ? 'bg-stone-800 border-amber-900/50 text-amber-500' : 'border-stone-800 text-stone-500 hover:bg-stone-900'}`}
                        >
                            9:16 (竖屏)
                        </button>
                    </div>
                </div>

                <button 
                    onClick={handleGenerateVideo}
                    disabled={isLoading || (!videoPrompt && !videoFile)}
                    className="w-full bg-stone-800 hover:bg-stone-700 text-amber-500 py-4 rounded-sm font-bold tracking-widest flex items-center justify-center gap-2 transition disabled:opacity-50 disabled:cursor-not-allowed border border-stone-700"
                >
                    {isLoading ? <Loader2 className="animate-spin" /> : <Film size={20} />} 
                    生成视频 (Veo)
                </button>
                
                {isLoading && (
                    <div className="text-center text-xs text-stone-500 animate-pulse">
                        视频生成可能需要 1-2 分钟，请耐心等待...
                    </div>
                )}

                {videoUrl && (
                    <div className="mt-8">
                        <video src={videoUrl} controls autoPlay loop className="w-full rounded-sm border border-stone-800 shadow-2xl" />
                         <a 
                            href={videoUrl} 
                            download={`huanglongxi-video-${Date.now()}.mp4`}
                            className="block mt-4 text-center text-stone-400 hover:text-white text-sm"
                        >
                            下载视频
                        </a>
                    </div>
                )}
            </div>
        )}
      </div>
    </div>
  );
};