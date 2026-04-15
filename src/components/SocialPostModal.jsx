import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { 
  Facebook, 
  Instagram, 
  Linkedin, 
  Sparkles, 
  Send, 
  X, 
  Image as ImageIcon,
  Twitter,
  Youtube,
  Store,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Share2,
  Smartphone,
  Layout,
  PlayCircle,
  Layers,
  Zap,
  ShieldCheck,
  Eye,
  Type,
  Copy
} from 'lucide-react';
import { socialAPI, marketingAPI } from '../utils/api';
import toast from 'react-hot-toast';

const MODAL_STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;800&display=swap');
  
  .premium-container {
      animation: modalPop 0.4s cubic-bezier(0.16, 1, 0.3, 1);
      background: linear-gradient(145deg, #ffffff, #f8fafc);
  }

  @keyframes modalPop {
      from { opacity: 0; transform: scale(0.98) translateY(10px); }
      to { opacity: 1; transform: scale(1) translateY(0); }
  }

  .creator-pane {
      background: rgba(255, 255, 255, 0.6);
  }

  .preview-pane {
      background: #0f172a;
      position: relative;
      overflow: hidden;
  }

  .preview-pane::before {
      content: '';
      position: absolute;
      top: -20%; left: -20%; width: 140%; height: 140%;
      background: radial-gradient(circle at center, rgba(79, 70, 229, 0.08), transparent 70%);
      pointer-events: none;
  }

  .platform-chip {
      transition: all 0.3s ease;
      opacity: 0.5;
      filter: grayscale(1);
  }
  .platform-chip:hover {
      opacity: 1;
      filter: grayscale(0);
      transform: translateY(-2px);
  }
  .platform-chip.active {
      opacity: 1;
      filter: grayscale(0);
      background: #ffffff !important;
      border-color: #4f46e5 !important;
      box-shadow: 0 4px 12px rgba(0,0,0,0.05);
  }

  .ai-sparkle-btn {
      position: relative;
      overflow: hidden;
      transition: all 0.3s;
  }
  .ai-sparkle-btn:not(:disabled):hover {
      box-shadow: 0 0 15px rgba(201, 146, 26, 0.3);
      transform: translateY(-1px);
  }

  .blueprint-placeholder {
      background-image: 
          linear-gradient(rgba(79, 70, 229, 0.05) 1px, transparent 1px),
          linear-gradient(90deg, rgba(79, 70, 229, 0.05) 1px, transparent 1px);
      background-size: 20px 20px;
  }

  .custom-scrollbar::-webkit-scrollbar { width: 4px; }
  .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
  .custom-scrollbar::-webkit-scrollbar-thumb { 
      background: rgba(0,0,0,0.1); 
      border-radius: 10px; 
  }

  .glass-input {
      transition: all 0.2s ease;
  }
  .glass-input:focus {
      background: #fff !important;
      border-color: #4f46e5 !important;
  }
`;

/**
 * SocialPostModal - Senior UI Designer Overhaul (Performance Optimized)
 */
const SocialPostModal = ({ 
    isOpen, 
    show, 
    onClose, 
    initialData = null,
    platform: explicitPlatform,
    initialContent,
    imageUrl: explicitImageUrl
}) => {
  const [platform, setPlatform] = useState(explicitPlatform || 'facebook');
  const [format, setFormat] = useState('post'); // 'post' | 'story' | 'reel'
  const [content, setContent] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [status, setStatus] = useState('idle');

  const isActuallyOpen = isOpen || show;

  useEffect(() => {
    if (initialData) {
      if (initialData.text) {
        setContent(initialData.text);
      } else {
        const defaultText = `🏠 ${initialData.name || initialData.title || initialData.unitNo || 'New Property'}\n📍 Location: ${initialData.location || ''}\n💰 Price: ${initialData.price || ''}\n\n${initialData.description || ''}`;
        setContent(defaultText);
      }
      setImageUrl(initialData.imageUrl || initialData.primaryImage || initialData.images?.[0] || '');
    } else if (initialContent || explicitImageUrl) {
      setContent(initialContent || '');
      setImageUrl(explicitImageUrl || '');
    }
  }, [initialData, initialContent, explicitImageUrl, isActuallyOpen]);

  if (!isActuallyOpen) return null;

  const handleGenerateAI = async () => {
    const propertyId = initialData?.id || initialData?._id;
    if (!propertyId) {
      toast.error('Property context missing for AI generation');
      return;
    }
    
    setIsGenerating(true);
    try {
      const res = await marketingAPI.generateSocial(propertyId, platform);
      if (res?.success) {
        setContent(res.content);
        toast.success('Premium AI Caption Generated! ✨');
      }
    } catch (error) {
      toast.error('AI Generation failed. Using standard format.');
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
    
    const propertyId = initialData?.id || initialData?._id;
    const entityType = initialData?.type || (initialData?.unitNo ? 'Deal' : 'System');

    try {
      const res = await socialAPI.postContent({
        platform,
        text: content,
        imageUrl: imageUrl,
        format: format,
        entityId: propertyId,
        entityType: entityType
      });

      if (res?.success) {
        setStatus('success');
        toast.success(`Broadcasting ${format} successful on ${platform}! 🚀`);
        setTimeout(() => {
          onClose();
          setStatus('idle');
        }, 2000);
      } else {
        throw new Error(res.error || 'Publishing failed');
      }
    } catch (error) {
        setStatus('error');
        const errMsg = error.response?.data?.error || error.message;
        toast.error(errMsg, { duration: 6000 });
    } finally {
      setIsPublishing(false);
    }
  };

  // ── DESIGN TOKENS ──
  const THEME = {
    navy: '#0f172a',
    navyGlass: 'rgba(15, 23, 42, 0.85)',
    gold: '#c9921a',
    goldGlow: 'rgba(201, 146, 26, 0.4)',
    white: '#ffffff',
    slate: '#64748b',
    border: 'rgba(255,255,255,0.08)',
    accent: '#4f46e5',
    glass: 'rgba(255, 255, 255, 0.05)',
    glassDeep: 'rgba(2, 6, 23, 0.95)'
  };

  const modalContent = (
    <div 
      style={{ 
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, 
        zIndex: 9999999, background: 'rgba(2, 6, 23, 0.9)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
        padding: '20px', fontFamily: '"Outfit", "Inter", sans-serif'
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <style>{MODAL_STYLES}</style>

      <div 
        className="premium-container"
        style={{ 
          width: '100%', maxWidth: '1200px', 
          height: '850px', maxHeight: '92vh',
          borderRadius: '48px', 
          display: 'flex', overflow: 'hidden',
          boxShadow: '0 60px 120px -20px rgba(0,0,0,0.5)',
          position: 'relative', border: '1px solid rgba(255,255,255,0.1)'
        }}
      >
        {/* LEFT: CREATOR PANE */}
        <div className="creator-pane custom-scrollbar" style={{ flex: '1.2', display: 'flex', flexDirection: 'column', height: '100%', overflowY: 'auto' }}>
            {/* Header Area */}
            <div style={{ padding: '40px 48px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                    <div style={{ 
                        width: '64px', height: '64px', borderRadius: '22px', 
                        background: `linear-gradient(135deg, ${THEME.accent}, #6366f1)`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff',
                        boxShadow: '0 12px 24px rgba(79, 70, 229, 0.25)' 
                    }}>
                        <Share2 size={32} strokeWidth={2.5} />
                    </div>
                    <div>
                        <h2 style={{ margin: 0, fontSize: '2rem', fontWeight: 800, color: THEME.navy, letterSpacing: '-0.04em' }}>Content Creator</h2>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10b981', boxShadow: '0 0 8px #10b981' }}></div>
                            <span style={{ fontSize: '0.85rem', color: THEME.slate, fontWeight: 600 }}>Social Sync Engine Active</span>
                        </div>
                    </div>
                </div>
                <button onClick={onClose} style={{ border: 'none', background: '#f1f5f9', width: '50px', height: '50px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: THEME.slate, transition: '0.2s' }}>
                    <X size={24} strokeWidth={3} />
                </button>
            </div>

            <div style={{ padding: '0 48px 48px', display: 'flex', flexDirection: 'column', gap: '40px' }}>
                
                {/* Format & Style Selectors */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
                    <div>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.75rem', fontWeight: 800, color: THEME.slate, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '12px' }}>
                            <Layout size={14} /> Campaign Format
                        </label>
                        <div style={{ display: 'flex', gap: '8px', background: '#f1f5f9', padding: '6px', borderRadius: '18px', border: '1px solid #e2e8f0' }}>
                           {['post', 'story', 'reel'].map(f => (
                             <button
                                key={f}
                                onClick={() => setFormat(f)}
                                style={{
                                  flex: 1, padding: '10px', borderRadius: '14px', border: 'none',
                                  cursor: 'pointer', fontSize: '0.85rem', fontWeight: 700,
                                  background: format === f ? THEME.navy : 'transparent',
                                  color: format === f ? '#fff' : THEME.slate,
                                  transition: '0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                                  boxShadow: format === f ? '0 8px 16px rgba(15, 23, 42, 0.2)' : 'none'
                                }}
                             >
                               {f.charAt(0).toUpperCase() + f.slice(1)}
                             </button>
                           ))}
                        </div>
                    </div>

                    <div>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.75rem', fontWeight: 800, color: THEME.slate, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '12px' }}>
                            <Smartphone size={14} /> Target Channels
                        </label>
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                           {[
                             { id: 'facebook', icon: Facebook, color: '#1877F2' },
                             { id: 'instagram', icon: Instagram, color: '#E4405F' },
                             { id: 'linkedin', icon: Linkedin, color: '#0A66C2' },
                             { id: 'twitter', icon: Twitter, color: '#14171A' },
                             { id: 'youtube', icon: Youtube, color: '#FF0000' },
                             { id: 'google_business', icon: Store, color: '#4285F4' }
                           ].map(p => (
                             <button
                                key={p.id}
                                onClick={() => setPlatform(p.id)}
                                disabled={p.id === 'linkedin' && (format === 'story' || format === 'reel')}
                                className={`platform-chip ${platform === p.id ? 'active' : ''}`}
                                style={{
                                  width: '44px', height: '44px', borderRadius: '12px', border: '1px solid #e2e8f0',
                                  background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center'
                                }}
                                title={p.id.replace('_', ' ')}
                             >
                                <p.icon size={20} style={{ color: p.color }} />
                             </button>
                           ))}
                        </div>
                    </div>
                </div>

                {/* AI & Content Area */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                        <div>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.75rem', fontWeight: 800, color: THEME.slate, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '4px' }}>
                                <Type size={14} /> Narrative Composition
                            </label>
                            <p style={{ margin: 0, fontSize: '0.85rem', color: THEME.slate, fontWeight: 500 }}>AI will optimize for {platform} {format} standards.</p>
                        </div>
                        <div style={{ display: 'flex', gap: '12px' }}>
                            <button 
                                onClick={handleGenerateAI}
                                disabled={isGenerating || !initialData}
                                className="ai-sparkle-btn"
                                style={{ 
                                    background: `linear-gradient(135deg, ${THEME.navy}, ${THEME.navy}dd)`, 
                                    padding: '12px 24px', borderRadius: '16px', fontSize: '0.85rem', 
                                    fontWeight: 800, color: THEME.white, display: 'flex', alignItems: 'center', gap: '10px',
                                    cursor: 'pointer', border: 'none', transition: '0.3s'
                                }}
                            >
                                {isGenerating ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} style={{ color: THEME.gold }} />}
                                {isGenerating ? 'Crystalizing...' : 'Premium AI Genesis'}
                            </button>
                            <button 
                                title="Copy to clipboard"
                                onClick={() => {
                                    navigator.clipboard.writeText(content);
                                    toast.success('Narrative copied! 📋');
                                }}
                                style={{ 
                                    background: '#f1f5f9', border: '1px solid #e2e8f0',
                                    padding: '12px 18px', borderRadius: '16px', color: THEME.slate,
                                    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px',
                                    fontSize: '0.85rem', fontWeight: 700
                                }}
                            >
                                <Copy size={16} /> Copy
                            </button>
                        </div>
                    </div>

                    <div style={{ position: 'relative' }}>
                        <textarea
                            value={content}
                            onChange={(e) => setContent(e.target.value)}
                            className="glass-input"
                            style={{
                                width: '100%', height: '260px', padding: '32px', borderRadius: '32px',
                                border: '1px solid #e2e8f0', background: 'rgba(248, 250, 252, 0.8)',
                                outline: 'none', fontSize: '1.1rem', color: THEME.navy, lineHeight: '1.7',
                                fontFamily: 'inherit', resize: 'none'
                            }}
                            placeholder="Architect your property narrative here..."
                        />
                        <div style={{ 
                            position: 'absolute', bottom: '24px', right: '24px', 
                            padding: '6px 12px', background: 'rgba(255,255,255,0.8)', borderRadius: '10px',
                            fontSize: '0.75rem', color: THEME.slate, fontWeight: 700, border: '1px solid #e2e8f0' 
                        }}>
                            {content.length} / 2200
                        </div>
                    </div>
                </div>

                {/* Media Management */}
                <div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.75rem', fontWeight: 800, color: THEME.slate, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '16px' }}>
                        <PlayCircle size={14} /> Media Assets
                    </label>
                    <div style={{ 
                        width: '100%', height: '140px', borderRadius: '32px', border: '2px dashed #cbd5e1', 
                        background: '#f8fafc', overflow: 'hidden', position: 'relative'
                    }}>
                        {imageUrl ? (
                            <img src={imageUrl} alt="Property" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : (
                            <div className="blueprint-placeholder" style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '8px' }}>
                                <ImageIcon size={32} style={{ color: THEME.accent, opacity: 0.4 }} />
                                <span style={{ fontSize: '0.85rem', fontWeight: 800, color: THEME.slate, opacity: 0.6 }}>No visual asset detected</span>
                            </div>
                        )}
                        <div style={{ position: 'absolute', top: '16px', right: '16px', display: 'flex', gap: '8px' }}>
                            {imageUrl && <button onClick={() => setImageUrl('')} style={{ background: '#ef4444', color: '#fff', border: 'none', width: '36px', height: '36px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><X size={18} /></button>}
                        </div>
                    </div>
                </div>

                {/* Publication Bar */}
                <div style={{ marginTop: 'auto', display: 'flex', gap: '16px' }}>
                    <button
                        onClick={handlePublish}
                        disabled={isPublishing || status === 'success'}
                        style={{
                            flex: 1, padding: '24px', borderRadius: '24px', border: 'none',
                            background: status === 'success' ? '#10b981' : THEME.navy,
                            color: '#fff', fontSize: '1.2rem', fontWeight: 800, cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '16px',
                            boxShadow: status === 'success' ? '0 20px 40px rgba(16, 185, 129, 0.3)' : '0 20px 40px rgba(15, 23, 42, 0.3)',
                            transition: 'all 0.4s'
                        }}
                    >
                        {isPublishing ? <Loader2 className="animate-spin" /> : status === 'success' ? <CheckCircle2 /> : <Zap size={24} style={{ fill: THEME.gold, color: THEME.gold }} />}
                        {isPublishing ? 'Synchronizing Node...' : status === 'success' ? 'Listing Dispatched' : `Launch to ${platform}`}
                    </button>
                </div>
            </div>
        </div>

        {/* RIGHT: PERSPECTIVE PANE (PREVIEW) */}
        <div className="preview-pane" style={{ flex: '1', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px' }}>
            
            {/* Header / Mode Indicator */}
            <div style={{ position: 'absolute', top: '40px', left: '0', right: '0', textAlign: 'center' }}>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '10px', padding: '10px 24px', borderRadius: '40px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', backdropFilter: 'blur(10px)' }}>
                   <Eye size={16} style={{ color: THEME.gold }} />
                   <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#fff', textTransform: 'uppercase', letterSpacing: '0.15em' }}>High Fidelity Mirror</span>
                </div>
            </div>

            {/* iPhone Mockup Containter */}
            <div style={{ 
                width: '320px', height: '640px', borderRadius: '54px', 
                background: '#000', border: '14px solid #1e293b', 
                boxShadow: `0 40px 80px rgba(0,0,0,0.8), 0 0 100px ${THEME.accent}10`,
                position: 'relative', overflow: 'hidden', padding: '0',
                display: 'flex', flexDirection: 'column'
            }}>
                {/* Notch */}
                <div style={{ position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)', width: '120px', height: '28px', background: '#000', borderRadius: '0 0 16px 16px', zIndex: 100 }}></div>

                {/* Content Area */}
                <div style={{ flex: 1, background: format === 'post' ? '#fff' : '#000', display: 'flex', flexDirection: 'column', overflowY: 'auto' }} className="custom-scrollbar">
                    
                    {format === 'post' ? (
                        /* SOCIAL FEED POST MOCKUP */
                        <>
                            <div style={{ padding: '16px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: THEME.navy, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '10px', fontWeight: 900 }}>BP</div>
                                    <div>
                                        <p style={{ margin: 0, fontSize: '0.8rem', fontWeight: 800, color: THEME.navy }}>bharat_properties</p>
                                        <p style={{ margin: 0, fontSize: '0.6rem', color: THEME.slate, fontWeight: 600 }}>Sponsored</p>
                                    </div>
                                </div>
                                <div style={{ fontSize: '1rem', color: THEME.slate }}>•••</div>
                            </div>

                            <div style={{ width: '100%', aspectRatio: '1/1', background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                                {imageUrl ? (
                                    <img src={imageUrl} alt="Preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                ) : (
                                    <div className="blueprint-placeholder" style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <ImageIcon size={48} style={{ color: THEME.accent, opacity: 0.1 }} />
                                    </div>
                                )}
                            </div>

                            <div style={{ padding: '12px 18px' }}>
                                <div style={{ display: 'flex', gap: '16px', marginBottom: '10px' }}>
                                    <div style={{ width: '24px', height: '24px', border: '2.5px solid #1e293b', borderRadius: '6px' }}></div>
                                    <div style={{ width: '24px', height: '24px', border: '2.5px solid #1e293b', borderRadius: '6px' }}></div>
                                    <div style={{ width: '24px', height: '24px', border: '2.5px solid #1e293b', borderRadius: '6px' }}></div>
                                </div>
                                <div style={{ fontSize: '0.85rem', color: THEME.navy, fontWeight: 500, lineHeight: '1.5', whiteSpace: 'pre-wrap' }}>
                                    <span style={{ fontWeight: 800, marginRight: '6px' }}>bharat_properties</span>
                                    {content || 'Establishing narrative structure...'}
                                </div>
                            </div>
                        </>
                    ) : (
                        /* STORY / REEL FULLSCREEN MOCKUP */
                        <div style={{ width: '100%', height: '100%', position: 'relative' }}>
                            {imageUrl && <img src={imageUrl} alt="Background" style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.8 }} />}
                            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, rgba(0,0,0,0.6) 0%, transparent 15%, transparent 80%, rgba(0,0,0,0.8) 100%)' }}></div>
                            
                            {/* Top Story Bar */}
                            <div style={{ position: 'absolute', top: '24px', left: '16px', right: '16px', display: 'flex', gap: '4px' }}>
                                <div style={{ flex: 1, height: '2px', background: '#fff', borderRadius: '1px' }}></div>
                                <div style={{ flex: 1, height: '2px', background: 'rgba(255,255,255,0.3)', borderRadius: '1px' }}></div>
                            </div>

                            <div style={{ position: 'absolute', top: '40px', left: '16px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#fff', padding: '2px' }}>
                                    <div style={{ width: '100%', height: '100%', borderRadius: '50%', background: THEME.navy, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '9px', fontWeight: 900 }}>BP</div>
                                </div>
                                <span style={{ color: '#fff', fontSize: '0.85rem', fontWeight: 800 }}>bharat_properties</span>
                                <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.85rem' }}>2h</span>
                            </div>

                            <div style={{ position: 'absolute', bottom: '32px', left: '16px', right: '16px' }}>
                                <p style={{ color: '#fff', fontSize: '0.9rem', fontWeight: 600, marginBottom: '20px', textShadow: '0 2px 4px rgba(0,0,0,0.5)' }}>
                                    {content.length > 120 ? content.substring(0, 120) + '...' : content || 'Establishing visual presence...'}
                                </p>
                                <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                                    <div style={{ flex: 1, height: '44px', borderRadius: '22px', border: '2px solid rgba(255,255,255,0.5)', background: 'rgba(255,255,255,0.1)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', padding: '0 16px', color: '#fff', fontSize: '0.8rem' }}>
                                        Send message...
                                    </div>
                                    <div style={{ width: '28px', height: '28px', color: '#fff' }}><Send size={24} /></div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Footer / Safety Indicators */}
            <div style={{ position: 'absolute', bottom: '40px', left: '0', right: '0', textAlign: 'center' }}>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)', fontWeight: 600 }}>
                        <ShieldCheck size={14} style={{ color: '#10b981' }} /> Secure Data Node
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)', fontWeight: 600 }}>
                        <AlertCircle size={14} style={{ color: THEME.gold }} /> Multi-Region Sync
                    </div>
                </div>
            </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};

export default SocialPostModal;
