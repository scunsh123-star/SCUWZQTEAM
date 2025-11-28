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

      <div className="p-4 md:p-8 flex-1 overflow-y-auto bg-stone-950">
        
        {error && (
            <div className="bg-red-900/20 border border-red-900/50 text-red-400 p-4 rounded-sm mb-6 flex items-center gap-2 text-sm">
                <AlertCircle size={18} /> {error}
            </div>
        )}

        {/* IMAGE GENERATION */}
        {tab === 'gen' && (
            <div className="space-y-6 max-w-2xl mx-auto">
                <div className="relative">
                    <textarea 
                        className="w-full bg-stone-900 border border-stone-800 rounded-sm p-4 text-stone-200 focus:border-amber-700 outline-none h-40 resize-none placeholder:text-stone-600 font-serif leading-relaxed"
                        placeholder="描述你想要重建的历史场景或艺术画面 (例如：'清晨薄雾中的黄龙溪古镇，石板路湿润，两旁是明清风格的木质建筑，水墨画风格')..."
                        value={genPrompt}
                        onChange={(e) => setGenPrompt(e.target.value)}
                    />
                    <div className="absolute bottom-3 right-3 text-stone-600 text-xs">Gemini 3.0 Pro</div>
                </div>
                
                <div className="grid grid-cols-2 gap-6">
                     <div>
                        <label className="block text-stone-500 text-xs mb-2 tracking-widest uppercase">画幅比例</label>
                        <select 
                            value={genConfig.aspectRatio}
                            onChange={(e) => setGenConfig({...genConfig, aspectRatio: e.target.value})}
                            className="w-full bg-stone-900 border border-stone-800 rounded-sm p-2 text-stone-300 focus:border-amber-700 outline-none"
                        >
                            {ASPECT_RATIOS.map(r => <option key={r} value={r}>{r}</option>)}
                        </select>
                     </div>
                     <div>
                        <label className="block text-stone-500 text-xs mb-2 tracking-widest uppercase">清晰度</label>
                        <select 
                            value={genConfig.size}
                            onChange={(e) => setGenConfig({...genConfig, size: e.target.value as any})}
                            className="w-full bg-stone-900 border border-stone-800 rounded-sm p-2 text-stone-300 focus:border-amber-700 outline-none"
                        >
                            <option value="1K">1K (标准)</option>
                            <option value="2K">2K (高清)</option>
                            <option value="4K">4K (超清)</option>
                        </select>
                     </div>
                </div>

                <button 
                    onClick={handleGenerateImage}
                    disabled={isLoading || !genPrompt}
                    className="w-full py-4 bg-stone-800 hover:bg-stone-700 border border-stone-700 text-amber-500 rounded-sm font-medium transition flex justify-center items-center gap-2 disabled:opacity-50"
                >
                    {isLoading ? <Loader2 className="animate-spin text-amber-600" /> : <Wand2 size={18} />} 
                    <span className="tracking-widest">开始创作</span>
                </button>

                {generatedImages.length > 0 && (
                    <div className="grid grid-cols-1 gap-6 mt-8">
                        {generatedImages.map((src, i) => (
                            <div key={i} className="relative group p-2 bg-white/5 border border-stone-800 rounded-sm">
                                <img src={src} className="w-full rounded-sm shadow-2xl" alt="Generated" />
                                <a 
                                    href={src} 
                                    download={`huanglongxi_sketch_${Date.now()}.png`}
                                    className="absolute bottom-6 right-6 bg-stone-900/80 hover:bg-stone-800 text-stone-200 p-3 rounded-full backdrop-blur-sm transition border border-stone-700"
                                    title="保存到设备"
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
            <div className="space-y-6 max-w-2xl mx-auto">
                 <div className="border border-dashed border-stone-700 rounded-sm p-8 text-center bg-stone-900 hover:bg-stone-900/80 transition cursor-pointer">
                    <input 
                        type="file" 
                        accept="image/*"
                        onChange={(e) => setEditFile(e.target.files?.[0] || null)}
                        className="hidden"
                        id="edit-upload"
                    />
                    <label htmlFor="edit-upload" className="cursor-pointer flex flex-col items-center w-full h-full">
                        {editFile ? (
                            <>
                                <img src={URL.createObjectURL(editFile)} className="h-48 object-contain mb-4 rounded-sm border border-stone-800" alt="Preview" />
                                <span className="text-emerald-500 text-sm flex items-center gap-2"><Check size={14} /> {editFile.name} 已就绪</span>
                            </>
                        ) : (
                            <>
                                <ImageIcon className="text-stone-600 mb-4" size={40} strokeWidth={1} />
                                <span className="text-stone-400 font-serif">点击上传田野照片</span>
                            </>
                        )}
                    </label>
                 </div>

                 <input 
                    type="text"
                    className="w-full bg-stone-900 border border-stone-800 rounded-sm p-4 text-stone-200 focus:border-amber-700 outline-none font-serif placeholder:text-stone-600"
                    placeholder="修图指令 (例如：'移除背景中的游客', '将天空改为阴天')"
                    value={editPrompt}
                    onChange={(e) => setEditPrompt(e.target.value)}
                 />

                 <button 
                    onClick={handleEditImage}
                    disabled={isLoading || !editFile || !editPrompt}
                    className="w-full py-4 bg-stone-800 hover:bg-stone-700 border border-stone-700 text-emerald-500 rounded-sm font-medium transition flex justify-center items-center gap-2 disabled:opacity-50"
                >
                    {isLoading ? <Loader2 className="animate-spin text-emerald-600" /> : <Edit size={18} />} 
                    <span className="tracking-widest">执行修改</span>
                </button>

                {editedImage && (
                    <div className="mt-8 p-2 bg-white/5 border border-stone-800 rounded-sm relative">
                        <img src={editedImage} className="w-full rounded-sm shadow-xl" alt="Edited" />
                        <a 
                            href={editedImage} 
                            download={`huanglongxi_edit_${Date.now()}.png`}
                            className="absolute bottom-6 right-6 bg-stone-900/80 hover:bg-stone-800 text-stone-200 p-3 rounded-full backdrop-blur-sm transition border border-stone-700"
                            title="保存到设备"
                        >
                            <Download size={20} />
                        </a>
                    </div>
                )}
            </div>
        )}

        {/* VEO VIDEO */}
        {tab === 'video' && (
            <div className="space-y-6 max-w-2xl mx-auto">
                 <div className="bg-amber-900/10 border border-amber-900/30 p-4 rounded-sm text-sm text-amber-600/80 flex items-start gap-3">
                    <AlertCircle size={16} className="mt-0.5 shrink-0" />
                    <p>Veo 视频生成需消耗较高算力，建议仅用于关键场景复原。请确保已在弹窗中选择了付费 API Key。</p>
                 </div>

                 <div className="border border-dashed border-stone-700 rounded-sm p-6 text-center bg-stone-900">
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
                                <img src={URL.createObjectURL(videoFile)} className="h-32 object-contain mb-2 rounded-sm border border-stone-800" alt="Preview" />
                                <span className="text-emerald-500 text-xs flex items-center gap-1"><Check size={12} /> {videoFile.name} 已选择</span>
                                <button onClick={(e) => { e.preventDefault(); setVideoFile(null); }} className="text-xs text-stone-500 mt-2 hover:text-stone-300 border-b border-stone-600">清除图片</button>
                            </>
                        ) : (
                            <>
                                <ImageIcon className="text-stone-600 mb-2" size={24} strokeWidth={1} />
                                <span className="text-stone-500 text-sm font-serif">上传参考图片 (可选)</span>
                            </>
                        )}
                    </label>
                 </div>

                 <textarea 
                    className="w-full bg-stone-900 border border-stone-800 rounded-sm p-4 text-stone-200 focus:border-amber-700 outline-none h-32 resize-none placeholder:text-stone-600 font-serif"
                    placeholder="视频脚本描述 (例如：'镜头缓慢推进，展示古镇茶馆内人们喝茶聊天的场景，光影斑驳')..."
                    value={videoPrompt}
                    onChange={(e) => setVideoPrompt(e.target.value)}
                />

                <div className="flex gap-6 justify-center">
                     <label className="flex items-center gap-2 text-stone-400 cursor-pointer hover:text-stone-200 transition">
                        <input type="radio" name="aspect" value="16:9" checked={videoAspectRatio === '16:9'} onChange={() => setVideoAspectRatio('16:9')} className="accent-amber-600" />
                        <span className="text-sm">16:9 (横屏)</span>
                     </label>
                     <label className="flex items-center gap-2 text-stone-400 cursor-pointer hover:text-stone-200 transition">
                        <input type="radio" name="aspect" value="9:16" checked={videoAspectRatio === '9:16'} onChange={() => setVideoAspectRatio('9:16')} className="accent-amber-600" />
                        <span className="text-sm">9:16 (竖屏)</span>
                     </label>
                </div>

                 <button 
                    onClick={handleGenerateVideo}
                    disabled={isLoading || (!videoPrompt && !videoFile)}
                    className="w-full py-4 bg-stone-800 hover:bg-stone-700 border border-stone-700 text-pink-500 rounded-sm font-medium transition flex justify-center items-center gap-2 disabled:opacity-50"
                >
                    {isLoading ? <Loader2 className="animate-spin text-pink-600" /> : <Film size={18} />} 
                    <span className="tracking-widest">生成动态影像</span>
                </button>
                
                {isLoading && <p className="text-center text-stone-500 text-xs animate-pulse font-serif mt-2">正在渲染 Veo 视频，这可能需要几分钟...</p>}

                {videoUrl && (
                    <div className="mt-8 p-2 bg-white/5 border border-stone-800 rounded-sm relative">
                        <video controls autoPlay loop className="w-full rounded-sm shadow-2xl">
                            <source src={videoUrl} type="video/mp4" />
                            不支持播放。
                        </video>
                        <a 
                            href={videoUrl} 
                            download={`huanglongxi_veo_${Date.now()}.mp4`}
                            className="block text-center bg-stone-800 text-stone-200 mt-2 py-3 rounded-sm text-sm border border-stone-700 hover:bg-stone-700 transition"
                        >
                            保存视频到本地
                        </a>
                    </div>
                )}
            </div>
        )}
      </div>
    </div>
  );
};