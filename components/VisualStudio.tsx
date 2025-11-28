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

      