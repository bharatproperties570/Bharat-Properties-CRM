import React, { useState, useEffect } from 'react';
import { 
  Facebook, 
  Instagram, 
  Linkedin, 
  Sparkles, 
  Send, 
  X, 
  Image as ImageIcon,
  CheckCircle2,
  AlertCircle,
  Loader2
} from 'lucide-react';
import { socialAPI, marketingAPI } from '../utils/api';
import toast from 'react-hot-toast';

const SocialPostModal = ({ isOpen, onClose, initialData = null }) => {
  const [platform, setPlatform] = useState('facebook');
  const [content, setContent] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [status, setStatus] = useState('idle'); // idle | success | error

  useEffect(() => {
    if (initialData) {
      const defaultText = `🏠 ${initialData.name || initialData.title}\n📍 Location: ${initialData.location || ''}\n💰 Price: ${initialData.price || ''}\n\n${initialData.description || ''}`;
      setContent(defaultText);
      setImageUrl(initialData.imageUrl || initialData.primaryImage || '');
    }
  }, [initialData]);

  if (!isOpen) return null;

  const handleGenerateAI = async () => {
    if (!initialData?.id && !initialData?._id) {
      toast.error('Property ID missing for AI generation');
      return;
    }
    
    setIsGenerating(true);
    try {
      const res = await marketingAPI.generateSocial(initialData.id || initialData._id, platform);
      if (res?.success) {
        setContent(res.content);
        toast.success('AI Caption Generated! ✨');
      }
    } catch (error) {
      toast.error('AI Generation failed. Using fallback.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handlePublish = async () => {
    if (!content.trim()) {
      toast.error('Please add some content');
      return;
    }

    setIsPublishing(true);
    setStatus('idle');
    
    // Check for localhost image URL as it will fail on Meta/LinkedIn
    if (imageUrl && (imageUrl.includes('localhost') || imageUrl.includes('127.0.0.1'))) {
      toast.error('Image is on localhost! Social networks need a public URL to fetch the image.', { duration: 5000 });
      // We still try to post as text-only or hope the user knows what they're doing
    }
    
    try {
      const res = await socialAPI.postContent({
        platform,
        text: content,
        imageUrl: imageUrl || 'https://via.placeholder.com/800x600?text=Bharat+Properties' // Fallback
      });

      if (res?.success) {
        setStatus('success');
        toast.success(`Successfully posted to ${platform}! 🚀`);
        setTimeout(() => {
          onClose();
          setStatus('idle');
        }, 2000);
      } else {
        throw new Error(res.error || 'Publishing failed');
      }
    } catch (error) {
      setStatus('error');
      toast.error(error.message);
    } finally {
      setIsPublishing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl overflow-hidden flex flex-col md:flex-row h-[90vh] md:h-auto max-h-[800px] animate-in fade-in zoom-in duration-200">
        
        {/* Left: Input Area */}
        <div className="flex-1 p-6 md:p-8 border-r border-slate-100 flex flex-col gap-6 overflow-y-auto">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-2xl font-bold text-slate-900">Share to Social</h2>
              <p className="text-slate-500 text-sm">Post updates directly to your pages</p>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-slate-50 rounded-full transition-colors">
              <X size={20} className="text-slate-400" />
            </button>
          </div>

          {/* Platform Selector */}
          <div className="flex gap-3">
            {[
              { id: 'facebook', icon: Facebook, color: '#1877F2', label: 'Facebook' },
              { id: 'instagram', icon: Instagram, color: '#E4405F', label: 'Instagram' },
              { id: 'linkedin', icon: Linkedin, color: '#0A66C2', label: 'LinkedIn' }
            ].map((p) => (
              <button
                key={p.id}
                onClick={() => setPlatform(p.id)}
                className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border-2 transition-all ${
                  platform === p.id 
                    ? 'border-indigo-600 bg-indigo-50/50 text-indigo-700 shadow-sm' 
                    : 'border-slate-100 bg-slate-50 text-slate-400 grayscale hover:grayscale-0'
                }`}
              >
                <p.icon size={18} style={{ color: platform === p.id ? p.color : 'inherit' }} />
                <span className="font-semibold text-sm hidden sm:inline">{p.label}</span>
              </button>
            ))}
          </div>

          {/* Content Area */}
          <div className="flex flex-col gap-2">
            <div className="flex justify-between items-center px-1">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Caption content</label>
              <button 
                onClick={handleGenerateAI}
                disabled={isGenerating}
                className="flex items-center gap-1.5 text-xs font-bold text-indigo-600 hover:text-indigo-700 transition-colors"
              >
                {isGenerating ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                {isGenerating ? 'Generating...' : 'AI Enhance'}
              </button>
            </div>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="w-full h-40 p-4 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none resize-none text-slate-700 leading-relaxed"
              placeholder="Write something professional..."
            />
          </div>

          {/* Media Section */}
          <div className="flex flex-col gap-2">
            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Attached Media</label>
            <div className="relative group rounded-xl overflow-hidden aspect-video bg-slate-100 border border-slate-200">
              {imageUrl ? (
                <img src={imageUrl} alt="Preview" className="w-full h-full object-cover" />
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-2">
                  <ImageIcon size={32} />
                  <span className="text-xs">No image selected</span>
                </div>
              )}
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
                <button className="px-4 py-2 bg-white text-slate-900 rounded-lg text-xs font-bold hover:bg-slate-50">Replace</button>
                {imageUrl && <button onClick={() => setImageUrl('')} className="px-4 py-2 bg-red-500 text-white rounded-lg text-xs font-bold hover:bg-red-600">Remove</button>}
              </div>
            </div>
          </div>
        </div>

        {/* Right: Social Preview */}
        <div className="w-full md:w-[380px] bg-slate-50 p-6 md:p-8 flex flex-col gap-6">
          <label className="text-xs font-bold text-slate-400 uppercase tracking-wider text-center">Live Preview</label>
          
          {/* Platform Mockup */}
          <div className="bg-white rounded-xl shadow-md border border-slate-100 overflow-hidden max-w-[320px] mx-auto">
            {/* Header */}
            <div className="p-3 flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-xs font-bold text-slate-500">BP</div>
              <div>
                <div className="text-[11px] font-bold text-slate-900">Bharat Properties</div>
                <div className="text-[9px] text-slate-400">Sponsored · Just now</div>
              </div>
            </div>
            
            {/* Post Content */}
            <div className="px-3 pb-3 text-[11px] text-slate-700 whitespace-pre-wrap line-clamp-4">
              {content || 'Your post preview will appear here...'}
            </div>

            {/* Image */}
            <div className="aspect-square bg-slate-100 overflow-hidden">
               {imageUrl ? (
                 <img src={imageUrl} alt="Preview" className="w-full h-full object-cover" />
               ) : (
                 <div className="w-full h-full flex items-center justify-center text-slate-300">
                   <ImageIcon size={48} />
                 </div>
               )}
            </div>

            {/* Actions */}
            <div className="p-3 flex items-center justify-between border-t border-slate-50">
              <div className="flex gap-4">
                <div className="w-4 h-4 rounded-full border border-slate-200" />
                <div className="w-4 h-4 rounded-full border border-slate-200" />
                <div className="w-4 h-4 rounded-full border border-slate-200" />
              </div>
              <div className="w-4 h-4 rounded-sm border border-slate-200" />
            </div>
          </div>

          <div className="mt-auto flex flex-col gap-3">
            <button
              onClick={handlePublish}
              disabled={isPublishing || status === 'success'}
              className={`w-full py-4 rounded-xl flex items-center justify-center gap-2 font-bold text-white transition-all shadow-lg shadow-indigo-200/50 ${
                status === 'success' 
                  ? 'bg-green-500 scale-95' 
                  : 'bg-indigo-600 hover:bg-indigo-700 active:scale-95'
              }`}
            >
              {isPublishing ? (
                <Loader2 size={18} className="animate-spin" />
              ) : status === 'success' ? (
                <CheckCircle2 size={18} />
              ) : (
                <Send size={18} />
              )}
              {isPublishing ? 'Publishing...' : status === 'success' ? 'Published!' : `Post to ${platform.charAt(0).toUpperCase() + platform.slice(1)}`}
            </button>
            <p className="text-[10px] text-slate-400 text-center leading-relaxed">
              {platform === 'linkedin' 
                ? "Post will be shared to your linked LinkedIn Organization's feed."
                : "Post will be shared to the linked Facebook Page / Instagram Account instantly."
              }
              <br/>
              <span className="text-amber-500 font-semibold">Note:</span> Images must be publicly accessible for social networks to fetch them.
            </p>
          </div>
        </div>

      </div>
    </div>
  );
};

export default SocialPostModal;
