import React, { useState } from 'react';
import { GoogleGenAI } from "@google/genai";
import { Image as ImageIcon, Video, Wand2, Edit, Check, AlertCircle, Loader2, Download, Save } from 'lucide-react';
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
    try {
      const ai = new GoogleGenAI({ apiKey });
      
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

    } catch (e: any) {
      setError(e.message);
    } finally {
      setIsLoading(false);
    }
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
      setError(e.message);
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
            throw new Error("API Key selection cancelled.");
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
            prompt: videoPrompt || "Animate this", 
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
        throw new Error("No video URI returned");
      }

    } catch (e: any) {
        if (e.message.includes("Requested entity was not found")) {
             setError("API Key issue. Please re-select key.");
             if((window as any).aistudio) (window as any).aistudio.openSelectKey();
        } else {
             setError(e.message);
        }
    } finally {
        setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-900 rounded-none md:rounded-lg border-0 md:border border-slate-700 overflow-hidden">
      {/* Tabs */}
      <div className="flex border-b border-slate-700 bg-slate-800 overflow-x-auto">
        <button onClick={() => setTab('gen')} className={`flex-1 p-3 flex items-center justify-center gap-2 min-w-[100px] whitespace-nowrap ${tab === 'gen' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}`}>
            <Wand2 size={18} /> 文生图
        </button>
        <button onClick={() => setTab('edit')} className={`flex-1 p-3 flex items-center justify-center gap-2 min-w-[100px] whitespace-nowrap ${tab === 'edit' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}`}>
            <Edit size={18} /> 智能修图
        </button>
        <button onClick={() => setTab('video')} className={`flex-1 p-3 flex items-center justify-center gap-2 min-w-[100px] whitespace-nowrap ${tab === 'video' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}`}>
            <Video size={18} /> Veo视频
        </button>
      </div>

      <div className="p-4 md:p-6 flex-1 overflow-y-auto">
        
        {error && (
            <div className="bg-red-900/50 border border-red-500 text-red-200 p-3 rounded-lg mb-4 flex items-center gap-2 text-sm">
                <AlertCircle size={18} /> {error}
            </div>
        )}

        {/* IMAGE GENERATION */}
        {tab === 'gen' && (
            <div className="space-y-4 max-w-2xl mx-auto">
                <textarea 
                    className="w-full bg-slate-800 border border-slate-600 rounded-lg p-3 text-white focus:ring-2 focus:ring-indigo-500 outline-none h-32 resize-none"
                    placeholder="描述你想要生成的图像 (例如：'黄龙溪古镇的水墨画风格，石板路，老茶馆')..."
                    value={genPrompt}
                    onChange={(e) => setGenPrompt(e.target.value)}
                />
                
                <div className="grid grid-cols-2 gap-4">
                     <div>
                        <label className="block text-slate-400 text-sm mb-1">比例</label>
                        <select 
                            value={genConfig.aspectRatio}
                            onChange={(e) => setGenConfig({...genConfig, aspectRatio: e.target.value})}
                            className="w-full bg-slate-800 border border-slate-600 rounded p-2 text-white"
                        >
                            {ASPECT_RATIOS.map(r => <option key={r} value={r}>{r}</option>)}
                        </select>
                     </div>
                     <div>
                        <label className="block text-slate-400 text-sm mb-1">画质</label>
                        <select 
                            value={genConfig.size}
                            onChange={(e) => setGenConfig({...genConfig, size: e.target.value as any})}
                            className="w-full bg-slate-800 border border-slate-600 rounded p-2 text-white"
                        >
                            <option value="1K">1K</option>
                            <option value="2K">2K</option>
                            <option value="4K">4K</option>
                        </select>
                     </div>
                </div>

                <button 
                    onClick={handleGenerateImage}
                    disabled={isLoading || !genPrompt}
                    className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 rounded-lg font-bold text-white transition flex justify-center items-center gap-2 shadow-lg shadow-indigo-500/30"
                >
                    {isLoading ? <Loader2 className="animate-spin" /> : <Wand2 />} 开始生成
                </button>

                {generatedImages.length > 0 && (
                    <div className="grid grid-cols-1 gap-4 mt-6">
                        {generatedImages.map((src, i) => (
                            <div key={i} className="relative group">
                                <img src={src} className="w-full rounded-lg border border-slate-700 shadow-xl" alt="Generated" />
                                <a 
                                    href={src} 
                                    download={`huanglongxi_gen_${Date.now()}.png`}
                                    className="absolute bottom-4 right-4 bg-black/60 hover:bg-black/80 text-white p-2 rounded-full backdrop-blur-sm transition"
                                >
                                    <Download size={20} />
                                </a>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        )}

        {/* IMAGE EDITING */}
        {tab === 'edit' && (
            <div className="space-y-4 max-w-2xl mx-auto">
                 <div className="border-2 border-dashed border-slate-600 rounded-lg p-6 md:p-8 text-center bg-slate-800/50">
                    <input 
                        type="file" 
                        accept="image/*"
                        onChange={(e) => setEditFile(e.target.files?.[0] || null)}
                        className="hidden"
                        id="edit-upload"
                    />
                    <label htmlFor="edit-upload" className="cursor-pointer flex flex-col items-center">
                        {editFile ? (
                            <>
                                <img src={URL.createObjectURL(editFile)} className="h-40 md:h-48 object-contain mb-2 rounded" alt="Preview" />
                                <span className="text-green-400 text-sm flex items-center gap-1"><Check size={14} /> {editFile.name} 已选择</span>
                            </>
                        ) : (
                            <>
                                <ImageIcon className="text-slate-400 mb-2" size={48} />
                                <span className="text-slate-300">点击上传需要修改的图片</span>
                            </>
                        )}
                    </label>
                 </div>

                 <input 
                    type="text"
                    className="w-full bg-slate-800 border border-slate-600 rounded-lg p-3 text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                    placeholder="如何修改? (例如：'添加复古滤镜', '移除背景路人')"
                    value={editPrompt}
                    onChange={(e) => setEditPrompt(e.target.value)}
                 />

                 <button 
                    onClick={handleEditImage}
                    disabled={isLoading || !editFile || !editPrompt}
                    className="w-full py-3 bg-green-600 hover:bg-green-500 rounded-lg font-bold text-white transition flex justify-center items-center gap-2 shadow-lg shadow-green-500/30"
                >
                    {isLoading ? <Loader2 className="animate-spin" /> : <Edit />} 智能修改
                </button>

                {editedImage && (
                    <div className="mt-6 relative">
                        <h3 className="text-white mb-2 font-medium">结果:</h3>
                        <img src={editedImage} className="w-full rounded-lg border border-slate-700 shadow-xl" alt="Edited" />
                        <a 
                            href={editedImage} 
                            download={`huanglongxi_edit_${Date.now()}.png`}
                            className="absolute bottom-4 right-4 bg-black/60 hover:bg-black/80 text-white p-2 rounded-full backdrop-blur-sm transition"
                        >
                            <Download size={20} />
                        </a>
                    </div>
                )}
            </div>
        )}

        {/* VEO VIDEO */}
        {tab === 'video' && (
            <div className="space-y-4 max-w-2xl mx-auto">
                 <div className="bg-blue-900/20 border border-blue-500/30 p-4 rounded-lg text-sm text-blue-200">
                    <p className="font-bold mb-1">注意:</p>
                    <p>Veo 视频生成需要付费 API Key。如果提示，请选择您的 Key。</p>
                 </div>

                 <div className="border-2 border-dashed border-slate-600 rounded-lg p-6 text-center bg-slate-800/50">
                    <input 
                        type="file" 
                        accept="image/*"
                        onChange={(e) => setVideoFile(e.target.files?.[0] || null)}
                        className="hidden"
                        id="video-upload"
                    />
                     <label htmlFor="video-upload" className="cursor-pointer flex flex-col items-center">
                        {videoFile ? (
                            <>
                                <img src={URL.createObjectURL(videoFile)} className="h-32 object-contain mb-2 rounded" alt="Preview" />
                                <span className="text-green-400 text-sm flex items-center gap-1"><Check size={14} /> {videoFile.name} 已选择 (可选)</span>
                                <button onClick={(e) => { e.preventDefault(); setVideoFile(null); }} className="text-xs text-red-400 mt-1 hover:underline">移除</button>
                            </>
                        ) : (
                            <>
                                <ImageIcon className="text-slate-400 mb-2" size={32} />
                                <span className="text-slate-300 text-sm">上传起始图片 (可选，用于图生视频)</span>
                            </>
                        )}
                    </label>
                 </div>

                 <textarea 
                    className="w-full bg-slate-800 border border-slate-600 rounded-lg p-3 text-white focus:ring-2 focus:ring-indigo-500 outline-none h-24 resize-none"
                    placeholder="描述视频内容 (例如：'黄龙溪古镇的日落延时摄影')..."
                    value={videoPrompt}
                    onChange={(e) => setVideoPrompt(e.target.value)}
                />

                <div className="flex gap-4">
                     <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
                        <input type="radio" name="aspect" value="16:9" checked={videoAspectRatio === '16:9'} onChange={() => setVideoAspectRatio('16:9')} />
                        16:9 (横屏)
                     </label>
                     <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
                        <input type="radio" name="aspect" value="9:16" checked={videoAspectRatio === '9:16'} onChange={() => setVideoAspectRatio('9:16')} />
                        9:16 (竖屏)
                     </label>
                </div>

                 <button 
                    onClick={handleGenerateVideo}
                    disabled={isLoading || (!videoPrompt && !videoFile)}
                    className="w-full py-3 bg-pink-600 hover:bg-pink-500 rounded-lg font-bold text-white transition flex justify-center items-center gap-2 shadow-lg shadow-pink-500/30"
                >
                    {isLoading ? <Loader2 className="animate-spin" /> : <Video />} 生成 Veo 视频
                </button>
                
                {isLoading && <p className="text-center text-slate-400 text-sm animate-pulse">正在生成视频...这可能需要几分钟。</p>}

                {videoUrl && (
                    <div className="mt-6 relative">
                        <video controls autoPlay loop className="w-full rounded-lg border border-slate-700 shadow-xl">
                            <source src={videoUrl} type="video/mp4" />
                            您的浏览器不支持 video 标签。
                        </video>
                        <a 
                            href={videoUrl} 
                            download={`huanglongxi_veo_${Date.now()}.mp4`}
                            className="block text-center bg-indigo-600 text-white mt-3 py-2 rounded-lg font-medium hover:bg-indigo-500"
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