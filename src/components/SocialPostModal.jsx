import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useTheme } from '../context/ThemeContext';
import { 
  Facebook, 
  Instagram, 
  Linkedin, 
  Twitter,
  Youtube,
  Store,
  Share2, 
  Sparkles, 
  Send, 
  X, 
  Image as ImageIcon,
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
  Smartphone, 
  Layout, 
  PlayCircle, 
  Zap, 
  ShieldCheck, 
  Eye, 
  Type, 
  Copy,
  Building2,
  Globe,
  Lock,
  Shield,
  Phone,
  MessageSquare,
  Check,
  Calendar,
  Clock,
  Palette,
  Wand2,
  Sliders,
  Camera,
  Layers,
  Film
} from 'lucide-react';
import { socialAPI, marketingAPI, googleSettingsAPI, api } from '../utils/api';
import toast from 'react-hot-toast';
import { brandifyPropertyImage, BRAND_COLORS } from '../utils/brandCanvasEngine';
import {
  hasAuthoritativeTitleVerification,
  hasAuthoritativeReraApproval,
  extractVerificationFacts,
  validateAndSanitizeCopy,
  generateCompliantFallback,
  isAuthoritativelyVerified
} from '../utils/propertyComplianceValidator';

/**
 * SocialPostModal - Enterprise Promote Studio
 * Harmonized with DealBroadcastModal design system & theme.
 * Dual Mode:
 * Tab 1: Social Media Studio (FB, IG, LinkedIn, X, YT, GBP) with AI Copywriting & Phone Mirror
 * Tab 2: Real Estate Portals & Syndication (11 Indian Portals) with Anti-Poaching Privacy Guard
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
  const themeContext = useTheme();
  const isDark = Boolean(themeContext?.isDark);

  // Main Studio Mode Switcher
  const [activeTab, setActiveTab] = useState('social'); // 'social' | 'portals'

  // Live Clock (matching DealBroadcastModal)
  const [currentTime, setCurrentTime] = useState(new Date());
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // --- TAB 1: SOCIAL MEDIA STATE ---
  const [platform, setPlatform] = useState(explicitPlatform || 'facebook');
  const [format, setFormat] = useState('post'); // 'post' | 'story' | 'reel'
  const [content, setContent] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [isUploadingMedia, setIsUploadingMedia] = useState(false);
  const fileInputRef = useRef(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [status, setStatus] = useState('idle');
  const [isScheduled, setIsScheduled] = useState(false);
  const [scheduledTime, setScheduledTime] = useState('');

  // 🎨 --- ENTERPRISE AI COPYWRITER & VISUAL STUDIO STATE ---
  const [aiTone, setAiTone] = useState('urgent'); // 'urgent' | 'luxury' | 'investor' | 'short_hook'
  const [isBrandified, setIsBrandified] = useState(false);
  const [brandedImageUrl, setBrandedImageUrl] = useState('');
  const [isBrandifying, setIsBrandifying] = useState(false);
  const [showPromptLab, setShowPromptLab] = useState(false);
  const [promptAngle, setPromptAngle] = useState('drone'); // 'drone' | 'hero' | 'interior' | 'walking'
  const [promptMood, setPromptMood] = useState('golden_hour'); // 'golden_hour' | 'cinematic' | 'luxury' | 'minimalist'
  const [generatedPrompt, setGeneratedPrompt] = useState('');
  const [isGeneratingPrompt, setIsGeneratingPrompt] = useState(false);
  const [isGeneratingVisual, setIsGeneratingVisual] = useState(false);
  const [previewBrandedMode, setPreviewBrandedMode] = useState(true); // Toggle on phone mirror

  // --- TAB 2: PORTALS & SYNDICATION STATE ---
  const [selectedPortals, setSelectedPortals] = useState([
    '99acres', 'magicbricks', 'housing', 'commonfloor', 'makaan',
    'olx', 'quikr', 'proptiger', 'sulekha', 'propertyguide', 'squareyards'
  ]);
  const [previewPortal, setPreviewPortal] = useState('99acres'); // '99acres' | 'magicbricks' | 'housing' etc.
  const [isSyndicating, setIsSyndicating] = useState(false);
  const [syndicateStatus, setSyndicateStatus] = useState('idle');
  const [customHeadline, setCustomHeadline] = useState('');
  const [portalStatuses, setPortalStatuses] = useState({});
  const [isLoadingStatuses, setIsLoadingStatuses] = useState(false);

  // Anti-Poaching Privacy Guard Matrix
  const [privacy, setPrivacy] = useState({
      hideUnitNo: true,        // Replaces unit # with [CONFIDENTIAL]
      hideLocation: false,     // Replaces exact address with sector/city
      priceOnRequest: false    // Masks price with "Price on Request"
  });

  const [metaStatus, setMetaStatus] = useState(null);
  const [linkedInStatus, setLinkedInStatus] = useState(null);

  const isActuallyOpen = isOpen || show;

  // 🛡️ Fetch Live Meta, LinkedIn & Portal Connection Statuses from Backend
  useEffect(() => {
    if (isActuallyOpen && typeof socialAPI?.getFacebookOAuthStatus === 'function') {
      socialAPI.getFacebookOAuthStatus()
        .then(res => {
          if (res?.success) setMetaStatus(res);
        })
        .catch(e => console.warn('Could not fetch Meta OAuth status', e));
    }

    if (isActuallyOpen && typeof marketingAPI?.getLinkedInStatus === 'function') {
      marketingAPI.getLinkedInStatus()
        .then(res => {
          if (res?.success) setLinkedInStatus(res);
        })
        .catch(e => console.warn('Could not fetch LinkedIn status', e));
    }
  }, [isActuallyOpen]);

  // 🛡️ Enterprise Phase 3: Fetch Live Portal Connection Statuses from Backend
  useEffect(() => {
    if (isActuallyOpen && typeof marketingAPI?.getPortalStatuses === 'function') {
      let isMounted = true;
      setIsLoadingStatuses(true);
      marketingAPI.getPortalStatuses()
        .then(res => {
          if (isMounted && res?.success) {
            if (res.statuses) {
              setPortalStatuses(res.statuses);
            } else if (Array.isArray(res.portals)) {
              const map = {};
              res.portals.forEach(p => { map[p.id] = p; });
              setPortalStatuses(map);
            }
          }
        })
        .catch(err => {
          console.warn('Could not load portal statuses in Promote modal', err);
        })
        .finally(() => {
          if (isMounted) setIsLoadingStatuses(false);
        });
      return () => { isMounted = false; };
    }
  }, [isActuallyOpen]);

  // 🛡️ Canonical statutory verification facts (never trusts generic booleans)
  const verificationFacts = useMemo(() => {
    return extractVerificationFacts(initialData || {});
  }, [initialData]);

  // 🛡️ Secure content setter: validates and sanitizes against canonical verification facts
  const applyCompliantContent = (rawText, contextOverrides = {}) => {
    const sanitized = validateAndSanitizeCopy(rawText, verificationFacts, {
      deal: initialData || {},
      platform,
      tone: aiTone,
      format,
      ...contextOverrides
    });
    setContent(sanitized);
    return sanitized;
  };

  useEffect(() => {
    if (initialData) {
      // 🛡️ Ensure clean, human-readable location — strictly filter out raw 24-character hex ObjectIds, null, undefined
      const rawLocStr = String(initialData.location || initialData.locationSearch || '').trim();
      const isInvalidLoc = !rawLocStr || rawLocStr === 'null' || rawLocStr === 'undefined' || /^[0-9a-fA-F]{24}$/.test(rawLocStr);
      const cleanLoc = !isInvalidLoc ? rawLocStr : (initialData.city && initialData.city !== 'null' ? String(initialData.city).trim() : 'Kurukshetra, Haryana');

      if (initialData.text) {
        // Sanitize any accidental embedded hex ObjectIds or null / undefined in text
        const sanitized = initialData.text
          .replace(/📍 Location: [0-9a-fA-F]{24}/g, `📍 Location: ${cleanLoc}`)
          .replace(/📍 Location: (null|undefined)/g, `📍 Location: ${cleanLoc}`);
        applyCompliantContent(sanitized);
      } else {
        const defaultText = generateCompliantFallback(
          { ...initialData, location: cleanLoc },
          platform,
          { tone: aiTone || 'urgent', format },
          verificationFacts
        );
        applyCompliantContent(defaultText);
      }

      const crmVideoUrl =
        initialData.videoUrl ||
        initialData.builtupVideoUrl ||
        initialData.projectVideos?.find(item => item?.url)?.url ||
        initialData.inventoryVideos?.find(item => item?.url)?.url ||
        initialData.builtupDetails?.find(item => item?.videoUrl)?.videoUrl ||
        (() => {
          const item = initialData.media?.find(entry => {
            const value = typeof entry === 'string' ? entry : entry?.url;
            return value && /\\.(mp4|mov|webm|m4v)(?:[?#].*)?$/i.test(value);
          });
          return typeof item === 'string' ? item : item?.url;
        })();

      if (initialData.mediaUrl) {
        if (/\\.(mp4|mov|webm|m4v)(?:[?#].*)?$/i.test(initialData.mediaUrl) || initialData.format === 'reel') {
          setVideoUrl(initialData.mediaUrl);
          setImageUrl('');
          setFormat('reel');
        } else {
          setImageUrl(initialData.mediaUrl);
        }
      } else if (crmVideoUrl) {
        setVideoUrl(crmVideoUrl);
        setImageUrl('');
        setFormat('reel');
      } else {
        setImageUrl(initialData.imageUrl || initialData.primaryImage || initialData.featuredImage || initialData.images?.[0] || '');
      }

      if (initialData.platform) {
        setPlatform(initialData.platform);
      }
      if (initialData.format) {
        setFormat(initialData.format);
      }

      setCustomHeadline(initialData.name || initialData.title || 'Exclusive Prime Real Estate Opportunity');
    } else if (initialContent || explicitImageUrl) {
      applyCompliantContent(initialContent || '');
      setImageUrl(explicitImageUrl || '');
    }
  }, [initialData, initialContent, explicitImageUrl, isActuallyOpen, verificationFacts]);

  // 🖼️ Resolve image-only CRM media across Deal, Project and Inventory records.
  const galleryImages = useMemo(() => {
    if (!initialData) return [];
    const list = [];
    const addImage = (item) => {
      const candidate = typeof item === 'string'
        ? item
        : (item?.url || item?.path || item?.imageUrl || item?.secureUrl);
      if (typeof candidate !== 'string' || !candidate.trim()) return;
      const normalized = candidate.trim();
      const mediaType = String(item?.mimeType || item?.type || item?.category || '').toLowerCase();
      if (mediaType.includes('video') || mediaType.includes('pdf') || /\\.(pdf|mp4|mov|webm|m4v)(?:[?#].*)?$/i.test(normalized)) return;
      list.push(normalized);
    };

    addImage(initialData.imageUrl);
    addImage(initialData.primaryImage);
    addImage(initialData.featuredImage);
    addImage(initialData.websiteMetadata?.featuredImage);
    (initialData.broadcastMetadata?.images || []).forEach(addImage);
    (initialData.images || []).forEach(addImage);
    (initialData.media || []).forEach(addImage);
    (initialData.photos || []).forEach(addImage);
    (initialData.projectImages || []).forEach(addImage);
    (initialData.inventoryImages || []).forEach(addImage);
    (initialData.builtupDetails || []).forEach(item => addImage(item?.imageUrl));
    return Array.from(new Set(list));
  }, [initialData]);

  if (!isActuallyOpen) return null;

  // ── Enterprise AI Copywriting Generation ──
  const handleGenerateAI = async (overrideTone = aiTone) => {
    const propertyId = initialData?.id || initialData?._id;
    
    setIsGenerating(true);
    try {
      if (propertyId) {
        const res = await marketingAPI.generateSocial(propertyId, platform, overrideTone, format);
        if (res?.success && res.content) {
          applyCompliantContent(res.content, { tone: overrideTone });
          toast.success(`✨ ${overrideTone.toUpperCase()} Narrative Generated!`);
          return;
        }
      }
      // Enterprise Resilient Fallback based on Selected Tone and Canonical Facts
      const cleanLoc = (initialData?.location && !/^[0-9a-fA-F]{24}$/.test(String(initialData.location).trim()))
        ? String(initialData.location).trim()
        : (initialData?.locationSearch && !/^[0-9a-fA-F]{24}$/.test(String(initialData.locationSearch).trim()))
          ? String(initialData.locationSearch).trim()
          : 'Kurukshetra, Haryana';

      const compliantDraft = generateCompliantFallback(
        { ...(initialData || {}), location: cleanLoc },
        platform,
        { tone: overrideTone, format },
        verificationFacts
      );
      applyCompliantContent(compliantDraft, { tone: overrideTone });
      toast.success(`✨ ${overrideTone.toUpperCase()} Narrative Generated!`);
    } catch (error) {
      console.warn('[SocialPostModal] AI generation service fallback:', error);
      const cleanLoc = (initialData?.location && !/^[0-9a-fA-F]{24}$/.test(String(initialData.location).trim()))
        ? String(initialData.location).trim()
        : 'Kurukshetra, Haryana';
      const safeFallback = generateCompliantFallback(
        { ...(initialData || {}), location: cleanLoc },
        platform,
        { tone: overrideTone, format },
        verificationFacts
      );
      applyCompliantContent(safeFallback, { tone: overrideTone });
      toast.success('Narrative Generated! ✨');
    } finally {
      setIsGenerating(false);
    }
  };

  // 🎨 ── Apply Bharat Properties Brand Kit (HTML5 Canvas Engine) ──
  const handleBrandify = async (targetImg = imageUrl) => {
    if (!targetImg) {
      toast.error('Please upload or select an image first');
      return;
    }
    setIsBrandifying(true);
    try {
      const cleanLoc = (initialData?.location && !/^[0-9a-fA-F]{24}$/.test(String(initialData.location).trim()))
        ? String(initialData.location).trim()
        : (initialData?.locationSearch && !/^[0-9a-fA-F]{24}$/.test(String(initialData.locationSearch).trim()))
          ? String(initialData.locationSearch).trim()
          : 'Kurukshetra, Haryana';

      // Pass canonical evidence to brandifyPropertyImage (no spoofable presentation overrides)
      const propData = {
        title: initialData?.name || initialData?.title || initialData?.unitNo || 'Prime Real Estate Opportunity',
        location: cleanLoc,
        price: initialData?.price || 'Price on Request',
        format: format === 'story' || format === 'reel' ? '9:16' : '1:1',
        authorityVerification: initialData?.authorityVerification,
        inventory: initialData?.inventory,
        authorityLink: initialData?.authorityLink || initialData?.propertyAuthorityLink,
        propertyAuthorityLink: initialData?.propertyAuthorityLink,
        approvals: initialData?.approvals,
        reraNumber: initialData?.reraNumber,
        reraStatus: initialData?.reraStatus,
      };

      const result = await brandifyPropertyImage(targetImg, propData);
      setBrandedImageUrl(result.dataUrl);
      setIsBrandified(true);
      setPreviewBrandedMode(true);
      toast.success('Bharat Properties Brand Kit Applied! 🎨✨');
    } catch (err) {
      console.warn('[SocialPostModal] Brandify error:', err);
      toast.error('Could not apply Brand Kit: ' + (err.message || 'Image loading issue'));
    } finally {
      setIsBrandifying(false);
    }
  };

  // 🛸 ── Generate Visual Prompts for DALL-E 3 & Runway v3 ──
  const handleGenerateVisualPrompt = () => {
    setIsGeneratingPrompt(true);
    setTimeout(() => {
      const title = initialData?.name || initialData?.title || initialData?.unitNo || 'Residential Project';
      const cleanLoc = (initialData?.location && !/^[0-9a-fA-F]{24}$/.test(String(initialData.location).trim()))
        ? String(initialData.location).trim()
        : 'Kurukshetra, Haryana';
      const isMohali = cleanLoc.toLowerCase().includes('mohali');
      const phone = isMohali ? '9991000570' : '9991333570';
      const aspect = format === 'story' || format === 'reel' ? '9:16 Vertical Reel' : '1:1 Square Post';

      const angleDesc = promptAngle === 'drone'
        ? 'cinematic 4k overhead drone shot highlighting expansive plots and lush green road connectivity'
        : promptAngle === 'hero'
          ? 'eye-level architectural hero shot showing grand entrance and contemporary facade'
          : promptAngle === 'interior'
            ? 'wide-angle luxury interior shot showcasing sunlit living spaces and high ceilings'
            : 'street-level walking POV tour showcasing serene neighborhood and paved wide roads';

      const moodDesc = promptMood === 'golden_hour'
        ? 'Golden hour warm sunlight casting long dramatic shadows, amber glow'
        : promptMood === 'cinematic'
          ? 'Moody cinematic dusk lighting with elegant warm LED perimeter lights'
          : promptMood === 'luxury'
            ? 'Aspirational crisp daylight, crystal clear sky, vibrant royal ambiance'
            : 'Minimalist clean aesthetic, architectural precision, soft diffused daylight';

      const promptStr = `A stunning ${angleDesc} of ${title} in ${cleanLoc}. ${moodDesc}. Architecture emphasizes clear lines with Bharat Properties brand aesthetic: Deep Navy accents with subtle Gold lighting. [BRAND IDENTITY]: Include Bharat Properties emblem. [CONTACT STRIP]: Display Website: www.bharatproperties.co, Contact: ${phone}. Photorealistic, 8k resolution, Unreal Engine 5 render style, perfectly composed for ${aspect}.`;

      setGeneratedPrompt(promptStr);
      setIsGeneratingPrompt(false);
      toast.success('Visual Prompt Generated by Designer AI! 🎨');
    }, 600);
  };

  // 🎬 ── Generate Actual AI Visual Asset (Image or Video) ──
  const handleGenerateVisualAsset = async (assetType = 'image') => {
    setIsGeneratingVisual(true);
    const propertyId = initialData?.id || initialData?._id;
    const toastId = toast.loading(`Synthesizing AI ${assetType === 'video' ? 'Drone Reel' : 'Property Render'}...`);
    
    try {
      const res = await marketingAPI.generateVisual({
        dealId: propertyId,
        type: assetType,
        angle: promptAngle,
        mood: promptMood,
        format: format,
        customPrompt: generatedPrompt
      });

      if (res?.success && res.url) {
        if (res.assetType === 'video') {
          setVideoUrl(res.url);
          setImageUrl('');
          setFormat('reel');
          setIsBrandified(false);
          setBrandedImageUrl('');
          toast.success('🎬 AI Drone Reel Generated & Attached!', { id: toastId });
        } else {
          setImageUrl(res.url);
          setVideoUrl('');
          // res.url is rendered by Enterprise BrandBannerComposer on backend
          setBrandedImageUrl(res.url);
          setIsBrandified(true);
          setPreviewBrandedMode(true);
          toast.success('✨ High-Resolution Branded Flyer Generated!', { id: toastId });
        }
      } else {
        throw new Error(res?.error || 'Visual generation failed');
      }
    } catch (err) {
      console.warn('[SocialPostModal] Visual generation unavailable:', err);
      // Never attach a stale sample asset or present a failed generation as success.
      setImageUrl('');
      setVideoUrl('');
      setIsBrandified(false);
      setBrandedImageUrl('');
      toast.error(err?.message || 'Visual generation failed. Attach an approved CRM asset or retry.', { id: toastId });
    } finally {
      setIsGeneratingVisual(false);
    }
  };

  // ── Media Upload Handler ──
  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingMedia(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await api.post('/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        _silentError: true
      });
      const uploadedUrl = res.data?.url || res.data?.downloadUrl;
      const isVideo = file.type.startsWith('video/') || file.name.endsWith('.mp4') || file.name.endsWith('.mov');
      if (isVideo) {
        setVideoUrl(uploadedUrl || `/uploads/${file.name}`);
        setImageUrl('');
        toast.success(`Video attached: ${file.name} 🎬`);
      } else {
        setImageUrl(uploadedUrl || `/uploads/${file.name}`);
        setVideoUrl('');
        toast.success(`Photo attached: ${file.name} 📸`);
      }
    } catch (err) {
      console.warn('[SocialPostModal] Server upload fallback to local preview:', err.message);
      const localUrl = URL.createObjectURL(file);
      const isVideo = file.type.startsWith('video/') || file.name.endsWith('.mp4');
      if (isVideo) {
        setVideoUrl(localUrl);
        setImageUrl('');
        toast.success(`Video selected: ${file.name} 🎬`);
      } else {
        setImageUrl(localUrl);
        setVideoUrl('');
        toast.success(`Photo selected: ${file.name} 📸`);
      }
    } finally {
      setIsUploadingMedia(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // ── Social Media Publishing ──
  const handlePublishSocial = async () => {
    if (!content.trim()) {
      toast.error('Please add some content');
      return;
    }

    // 🛡️ Client-Side Validation for YouTube: Check video attachment
    if (platform === 'youtube') {
      const hasVideo = videoUrl || (imageUrl && (imageUrl.endsWith('.mp4') || imageUrl.endsWith('.mov') || imageUrl.includes('video')));
      if (!hasVideo) {
        toast.error('YouTube requires a video file (.mp4). Please click the Visual Media box to upload a video (.mp4), or switch to Instagram, Facebook, or LinkedIn for static photos.', { duration: 6000 });
        return;
      }
    }

    setIsPublishing(true);
    setStatus('idle');
    
    const propertyId = initialData?.id || initialData?._id;
    const entityType = initialData?.type || (initialData?.unitNo ? 'Deal' : 'System');

    try {
      // Resolve Final Media Asset: prefer branded image if enabled, otherwise raw image
      let finalImageUrl = (isBrandified && brandedImageUrl) ? brandedImageUrl : imageUrl;

      // Ensure text strictly conforms to canonical verification facts prior to broadcast
      const sanitizedText = validateAndSanitizeCopy(content, verificationFacts, {
        deal: initialData || {},
        platform,
        tone: aiTone,
        format
      });

      const res = await socialAPI.postContent({
        platform,
        text: sanitizedText,
        imageUrl: finalImageUrl,
        videoUrl: videoUrl,
        videoPath: videoUrl,
        format: format,
        entityId: propertyId,
        entityType: entityType,
        scheduledTime: isScheduled ? scheduledTime : null,
        privacy: {
          hideUnitNo: privacy.hideUnitNo,
          hideLocation: privacy.hideLocation,
          priceOnRequest: privacy.priceOnRequest
        }
      });

      if (res?.success) {
        setStatus('success');
        const successMsg = isScheduled 
          ? `Listing scheduled for ${new Date(scheduledTime).toLocaleString()}! 📅`
          : `Broadcasting ${format} successful on ${platform}! 🚀`;
        
        toast.success(successMsg);
        setTimeout(() => {
          onClose();
          setStatus('idle');
        }, 1800);
      } else {
        throw new Error(res.error || 'Publishing failed');
      }
    } catch (error) {
        setStatus('error');
        const errMsg = error.response?.data?.error || error.response?.data?.message || error.message;
        if (platform === 'google_business' && (errMsg?.includes('quota of 0') || errMsg?.includes('GBP API access') || errMsg?.includes('pending') || errMsg?.includes('RESOURCE_EXHAUSTED'))) {
            toast('Google Business Profile API access request is currently pending Google developer review for Project 322921031715. Meanwhile, your listing can be broadcasted immediately to Facebook, Instagram, or LinkedIn!', {
                icon: '⏳',
                duration: 7000
            });
        } else {
            toast.error(errMsg, { duration: 6000 });
        }
    } finally {
      setIsPublishing(false);
    }
  };

  // ── Portal Syndication Dispatch ──
  const handleSyndicatePortals = async () => {
    if (selectedPortals.length === 0) {
      toast.error('Please select at least one portal or partner network');
      return;
    }

    const propertyId = initialData?.id || initialData?._id;
    const entityType = initialData?.type || 'project';

    setIsSyndicating(true);
    setSyndicateStatus('idle');

    try {
      const platformsPayload = {};
      selectedPortals.forEach(p => {
        platformsPayload[p] = true;
      });

      const res = await marketingAPI.broadcastToHub({
        id: propertyId,
        type: entityType.toLowerCase(),
        platforms: platformsPayload,
        privacy: {
          hideUnitNo: privacy.hideUnitNo,
          hideLocation: privacy.hideLocation,
          priceOnRequest: privacy.priceOnRequest
        }
      });

      if (res?.success) {
        setSyndicateStatus('success');
        const count = selectedPortals.length;
        const unconfiguredCount = res.results?.portals?.unconfigured?.length || 0;
        
        if (unconfiguredCount > 0) {
          toast.success(`Syndicated to active portals. (${unconfiguredCount} pending setup in Settings > Integrations)`, {
            duration: 5000
          });
        } else {
          toast.success(`Successfully syndicated to ${count} property portal${count > 1 ? 's' : ''}! 🚀`, {
            duration: 4000
          });
        }
        setTimeout(() => {
          onClose();
          setSyndicateStatus('idle');
        }, 2000);
      } else {
        throw new Error(res?.message || 'Syndication failed');
      }
    } catch (error) {
      setSyndicateStatus('error');
      toast.error(error.response?.data?.message || error.message || 'Syndication request failed', {
        duration: 5000
      });
    } finally {
      setIsSyndicating(false);
    }
  };

  const togglePortal = (portalKey) => {
    setSelectedPortals(prev => 
      prev.includes(portalKey) ? prev.filter(p => p !== portalKey) : [...prev, portalKey]
    );
  };

  // ── Derived Masked Display Data for Previews ──
  const getMaskedTitle = () => {
    let raw = initialData?.name || initialData?.title || initialData?.unitNo || 'Exclusive Property';
    if (privacy.hideUnitNo) {
      return raw.replace(/#?\d+[A-Za-z]*/g, '[CONFIDENTIAL]').trim() || 'Exclusive Property [CONFIDENTIAL]';
    }
    return raw;
  };

  const getMaskedLocation = () => {
    let raw = initialData?.location || 'Prime Location';
    if (privacy.hideLocation) {
      const parts = raw.split(',');
      return parts.length > 1 ? parts.slice(-2).join(',').trim() : raw;
    }
    return raw;
  };

  const getMaskedPrice = () => {
    if (privacy.priceOnRequest) {
      return 'Price on Request';
    }
    return initialData?.price || 'Price on Request';
  };

  const handlePrivacyToggle = (key) => {
    setPrivacy(prev => {
      const next = { ...prev, [key]: !prev[key] };
      const title = next.hideUnitNo 
        ? (initialData?.name || initialData?.title || initialData?.unitNo || 'Exclusive Property').replace(/#?\d+[A-Za-z]*/g, '[CONFIDENTIAL]').trim() || 'Exclusive Property [CONFIDENTIAL]'
        : (initialData?.name || initialData?.title || initialData?.unitNo || 'Exclusive Property');
      
      const rawLoc = (initialData?.location && !/^[0-9a-fA-F]{24}$/.test(String(initialData.location).trim()))
        ? String(initialData.location).trim()
        : (initialData?.locationSearch && !/^[0-9a-fA-F]{24}$/.test(String(initialData.locationSearch).trim()))
          ? String(initialData.locationSearch).trim()
          : 'Kurukshetra, Haryana';
      
      const cleanLoc = next.hideLocation
        ? (rawLoc.split(',').length > 1 ? rawLoc.split(',').slice(-2).join(',').trim() : rawLoc)
        : rawLoc;
      
      const price = next.priceOnRequest ? 'Price on Request' : (initialData?.price || 'Price on Request');
      const updatedDeal = {
        ...(initialData || {}),
        unitNo: title,
        name: title,
        title,
        location: cleanLoc,
        price
      };
      const updatedDraft = generateCompliantFallback(
        updatedDeal,
        platform,
        { tone: aiTone || 'urgent', format },
        verificationFacts
      );
      applyCompliantContent(updatedDraft);
      return next;
    });
  };

  const PORTALS_LIST = [
    {
      id: '99acres',
      name: '99acres.com',
      badge: 'Feed Ready',
      desc: "India's #1 traffic property search marketplace",
      color: '#005CA8',
      icon: Building2
    },
    {
      id: 'magicbricks',
      name: 'Magicbricks',
      badge: 'API Active',
      desc: 'Times Group high-intent HNI & buyer leads',
      color: '#E40046',
      icon: Building2
    },
    {
      id: 'housing',
      name: 'Housing.com',
      badge: 'Sync Online',
      desc: 'REA India direct listing feed with mobile verified leads',
      color: '#00A65A',
      icon: Building2
    },
    {
      id: 'commonfloor',
      name: 'CommonFloor',
      badge: 'Society Sync',
      desc: 'Gated communities, apartment complexes & RWAs',
      color: '#F97316',
      icon: Building2
    },
    {
      id: 'makaan',
      name: 'Makaan.com',
      badge: 'Smart Discovery',
      desc: 'Seller ratings & algorithm-driven homebuyer reach',
      color: '#8B5CF6',
      icon: Globe
    },
    {
      id: 'olx',
      name: 'OLX India',
      badge: 'Hyper-Local',
      desc: 'High-volume classifieds for resale, land & apartments',
      color: '#002F34',
      icon: Globe
    },
    {
      id: 'quikr',
      name: 'Quikr Homes',
      badge: 'Instant Leads',
      desc: 'Regional buyer network with instant push alerts',
      color: '#0083CA',
      icon: Building2
    },
    {
      id: 'proptiger',
      name: 'PropTiger',
      badge: 'New Launches',
      desc: 'Advisory and institutional primary sales engine',
      color: '#EF4444',
      icon: Building2
    },
    {
      id: 'sulekha',
      name: 'Sulekha NoBroker',
      badge: 'Direct Match',
      desc: 'Direct owner & investor network with SMS alerts',
      color: '#D97706',
      icon: Globe
    },
    {
      id: 'propertyguide',
      name: 'Property Guide Online',
      badge: 'NRI Syndication',
      desc: 'Digital showcase & NRI global investor channel',
      color: '#0284C7',
      icon: Globe
    },
    {
      id: 'squareyards',
      name: 'Square Yards',
      badge: 'PropTech Pro',
      desc: 'Integrated enterprise brokerage & inventory hub',
      color: '#059669',
      icon: Building2
    }
  ];

  const PORTAL_PREVIEW_METAS = {
    '99acres': {
      title: '99acres Verified Listing',
      headerBg: '#005CA8',
      watermark: 'DIRECT XML FEED',
      tag: 'RERA Verified Partner',
      cta1: { label: 'View Agent', icon: 'fa-phone-alt', border: '#005CA8', color: '#005CA8' },
      cta2: { label: 'Contact Seller', icon: 'fab fa-whatsapp', bg: '#25D366', color: '#fff' }
    },
    'magicbricks': {
      title: 'Magicbricks Certified Match',
      headerBg: '#E40046',
      watermark: 'TIMES PROP NETWORK',
      tag: 'Certified Seller',
      cta1: { label: 'Call Agent', icon: 'fa-phone-alt', border: '#E40046', color: '#E40046' },
      cta2: { label: 'Instant Inquiry', icon: 'fa-paper-plane', bg: '#E40046', color: '#fff' }
    },
    'housing': {
      title: 'Housing.com Verified Partner',
      headerBg: '#00A65A',
      watermark: 'REA FEED ACTIVE',
      tag: 'Housing Edge Protected',
      cta1: { label: 'Request Callback', icon: 'fa-phone-alt', border: '#00A65A', color: '#00A65A' },
      cta2: { label: 'Book Site Visit', icon: 'fa-calendar-alt', bg: '#00A65A', color: '#fff' }
    },
    'commonfloor': {
      title: 'CommonFloor Society Listing',
      headerBg: '#F97316',
      watermark: 'RWA VERIFIED',
      tag: 'Community Showcase',
      cta1: { label: 'Connect Society', icon: 'fa-building', border: '#F97316', color: '#F97316' },
      cta2: { label: 'Contact Broker', icon: 'fa-phone-alt', bg: '#F97316', color: '#fff' }
    },
    'makaan': {
      title: 'Makaan.com Seller Rated',
      headerBg: '#8B5CF6',
      watermark: 'MAKAAN IQ',
      tag: 'Top Rated Broker',
      cta1: { label: 'Price Trends', icon: 'fa-chart-line', border: '#8B5CF6', color: '#8B5CF6' },
      cta2: { label: 'View Phone', icon: 'fa-phone-alt', bg: '#8B5CF6', color: '#fff' }
    },
    'olx': {
      title: 'OLX Featured Classified',
      headerBg: '#002F34',
      watermark: 'VERIFIED USER',
      tag: 'Direct Listing',
      cta1: { label: 'Chat with Seller', icon: 'fa-comment-dots', border: '#002F34', color: '#002F34' },
      cta2: { label: 'Call Seller', icon: 'fa-phone-alt', bg: '#23e5db', color: '#002F34' }
    },
    'quikr': {
      title: 'Quikr Homes Verified Feed',
      headerBg: '#0083CA',
      watermark: 'INSTANT ALERTS',
      tag: 'Quikr Assured',
      cta1: { label: 'Get SMS Alerts', icon: 'fa-bell', border: '#0083CA', color: '#0083CA' },
      cta2: { label: 'WhatsApp Inquiry', icon: 'fab fa-whatsapp', bg: '#25D366', color: '#fff' }
    },
    'proptiger': {
      title: 'PropTiger Advisory Showcase',
      headerBg: '#EF4444',
      watermark: 'INSTITUTIONAL DESK',
      tag: 'Primary Market',
      cta1: { label: 'Brochure PDF', icon: 'fa-file-pdf', border: '#EF4444', color: '#EF4444' },
      cta2: { label: 'Consult Advisor', icon: 'fa-user-tie', bg: '#EF4444', color: '#fff' }
    },
    'sulekha': {
      title: 'Sulekha NoBroker Direct Match',
      headerBg: '#D97706',
      watermark: 'ZERO BROKERAGE',
      tag: 'Direct Match',
      cta1: { label: 'SMS Details', icon: 'fa-sms', border: '#D97706', color: '#D97706' },
      cta2: { label: 'Connect Owner', icon: 'fa-handshake', bg: '#D97706', color: '#fff' }
    },
    'propertyguide': {
      title: 'Property Guide Global NRI Feed',
      headerBg: '#0284C7',
      watermark: 'GLOBAL REACH',
      tag: 'NRI Investor Portal',
      cta1: { label: 'NRI Support', icon: 'fa-globe-americas', border: '#0284C7', color: '#0284C7' },
      cta2: { label: 'Virtual Tour', icon: 'fa-video', bg: '#0284C7', color: '#fff' }
    },
    'squareyards': {
      title: 'Square Yards PropTech Network',
      headerBg: '#059669',
      watermark: 'PROPINVENTORY SYNC',
      tag: 'Enterprise Inventory',
      cta1: { label: 'Book Inspection', icon: 'fa-clipboard-check', border: '#059669', color: '#059669' },
      cta2: { label: 'Submit Offer', icon: 'fa-tag', bg: '#059669', color: '#fff' }
    }
  };

  const handleSelectAllPortals = () => {
    setSelectedPortals(PORTALS_LIST.map(p => p.id));
  };

  const handleSelectConnectedPortals = () => {
    const connectedIds = PORTALS_LIST
      .map(p => p.id)
      .filter(id => portalStatuses[id]?.connected);
    if (connectedIds.length === 0) {
      toast('No portals currently active with credentials. Configure in Settings > Integrations.', {
        icon: 'ℹ️',
        duration: 4000
      });
      return;
    }
    setSelectedPortals(connectedIds);
    toast.success(`Selected ${connectedIds.length} connected portal${connectedIds.length > 1 ? 's' : ''}`);
  };

  const handleClearAllPortals = () => {
    setSelectedPortals([]);
  };

  const maxSocialChars = platform === 'twitter' ? 280 : 2200;
  const isOverCharLimit = content.length > maxSocialChars;

  const SOCIAL_PLATFORMS = [
    { id: 'facebook', name: 'Facebook', icon: Facebook, color: '#1877F2', faIcon: 'fab fa-facebook-f' },
    { id: 'instagram', name: 'Instagram', icon: Instagram, color: '#E4405F', faIcon: 'fab fa-instagram' },
    { id: 'linkedin', name: 'LinkedIn', icon: Linkedin, color: '#0A66C2', faIcon: 'fab fa-linkedin-in' },
    { id: 'twitter', name: 'Twitter/X', icon: Twitter, color: '#0f172a', faIcon: 'fab fa-x-twitter' },
    { id: 'youtube', name: 'YouTube', icon: Youtube, color: '#FF0000', faIcon: 'fab fa-youtube' },
    { id: 'google_business', name: 'Google Business', icon: Store, color: '#4285F4', faIcon: 'fab fa-google' }
  ];

  const modalContent = (
    <div 
      style={{ 
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, 
        backgroundColor: 'rgba(15, 23, 42, 0.75)', backdropFilter: 'blur(5px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 99999, padding: '16px', overflowY: 'auto'
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div 
        style={{ 
          background: isDark ? '#0f172a' : '#ffffff',
          border: isDark ? '1px solid rgba(255, 255, 255, 0.12)' : '1px solid #e2e8f0',
          borderRadius: '20px',
          width: '100%', maxWidth: '1080px', maxHeight: '92vh',
          display: 'flex', flexDirection: 'column',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.45)',
          overflow: 'hidden'
        }}
      >
        {/* ── Modal Header (Enterprise Promote Studio) ────────────────────── */}
        <div style={{
            padding: '18px 24px',
            borderBottom: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid #f1f5f9',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            background: isDark ? 'linear-gradient(180deg, #1e293b 0%, #0f172a 100%)' : 'linear-gradient(180deg, #f8fafc 0%, #ffffff 100%)',
            flexShrink: 0
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                <div style={{
                    width: '44px', height: '44px', borderRadius: '12px',
                    background: activeTab === 'social' 
                        ? 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)' 
                        : 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    boxShadow: '0 4px 12px rgba(79, 70, 229, 0.35)', color: '#fff',
                    transition: 'all 0.3s'
                }}>
                    <i className={`fas ${activeTab === 'social' ? 'fa-bullhorn' : 'fa-globe'}`} style={{ fontSize: '18px' }}></i>
                </div>
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: isDark ? '#f8fafc' : '#0f172a' }}>
                            Promote Studio
                        </h3>
                        {initialData?.name && (
                            <span style={{
                                fontSize: '0.72rem', fontWeight: 800, padding: '3px 10px', borderRadius: '12px',
                                background: isDark ? 'rgba(99, 102, 241, 0.15)' : '#e0e7ff',
                                color: isDark ? '#a5b4fc' : '#3730a3',
                                border: isDark ? '1px solid rgba(99, 102, 241, 0.3)' : '1px solid #c7d2fe'
                            }}>
                                <i className="fas fa-building" style={{ marginRight: '5px' }}></i>
                                {initialData.name}
                            </span>
                        )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '3px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.73rem', color: isDark ? '#94a3b8' : '#64748b', fontWeight: 600 }}>
                            <i className="far fa-clock" style={{ color: '#818cf8', fontSize: '11px' }}></i>
                            <span>{currentTime.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
                            <span style={{ opacity: 0.4 }}>•</span>
                            <span style={{ fontFamily: 'monospace', fontWeight: 700, color: isDark ? '#f8fafc' : '#1e293b' }}>
                                {currentTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })}
                            </span>
                        </div>
                        <span style={{ opacity: 0.3 }}>•</span>
                        <span style={{ fontSize: '0.72rem', color: isDark ? '#94a3b8' : '#64748b' }}>
                            {activeTab === 'social' 
                                ? 'Omnichannel Social Media Broadcast & AI Narrative Creator' 
                                : 'Real Estate Portal Syndication & Anti-Poaching Guard (11 Indian Portals)'}
                        </span>
                    </div>
                </div>
            </div>
            
            <button
                onClick={onClose}
                style={{
                    width: '36px', height: '36px', borderRadius: '10px',
                    border: isDark ? '1px solid rgba(255, 255, 255, 0.1)' : '1px solid #e2e8f0',
                    background: isDark ? 'rgba(255, 255, 255, 0.05)' : '#f8fafc',
                    color: isDark ? '#94a3b8' : '#64748b', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '16px', transition: 'all 0.15s'
                }}
                onMouseEnter={e => e.currentTarget.style.color = '#ef4444'}
                onMouseLeave={e => e.currentTarget.style.color = isDark ? '#94a3b8' : '#64748b'}
                title="Close Studio"
            >
                <i className="fas fa-times"></i>
            </button>
        </div>

        {/* ── Studio Mode Switcher Tab Bar (Fixed at Top, Never Hidden) ────────── */}
        <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 24px',
            background: isDark ? '#111827' : '#f8fafc',
            borderBottom: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid #e2e8f0',
            flexShrink: 0
        }}>
            <div style={{ display: 'flex', gap: '8px' }}>
                <button
                    type="button"
                    onClick={() => setActiveTab('social')}
                    style={{
                        padding: '8px 20px',
                        borderRadius: '10px',
                        border: 'none',
                        background: activeTab === 'social' ? '#4f46e5' : (isDark ? 'rgba(255,255,255,0.05)' : '#ffffff'),
                        color: activeTab === 'social' ? '#ffffff' : (isDark ? '#94a3b8' : '#475569'),
                        fontSize: '0.82rem',
                        fontWeight: 800,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        boxShadow: activeTab === 'social' ? '0 2px 8px rgba(79, 70, 229, 0.35)' : '0 1px 2px rgba(0,0,0,0.05)',
                        transition: 'all 0.15s'
                    }}
                >
                    <i className="fas fa-bullhorn"></i>
                    <span>Social Media Studio</span>
                </button>

                <button
                    type="button"
                    onClick={() => setActiveTab('portals')}
                    style={{
                        padding: '8px 20px',
                        borderRadius: '10px',
                        border: 'none',
                        background: activeTab === 'portals' ? '#0284c7' : (isDark ? 'rgba(255,255,255,0.05)' : '#ffffff'),
                        color: activeTab === 'portals' ? '#ffffff' : (isDark ? '#94a3b8' : '#475569'),
                        fontSize: '0.82rem',
                        fontWeight: 800,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        boxShadow: activeTab === 'portals' ? '0 2px 8px rgba(2, 132, 199, 0.35)' : '0 1px 2px rgba(0,0,0,0.05)',
                        transition: 'all 0.15s'
                    }}
                >
                    <i className="fas fa-globe"></i>
                    <span>Portals & Syndication</span>
                    <span style={{
                        fontSize: '0.62rem',
                        fontWeight: 800,
                        padding: '2px 7px',
                        borderRadius: '6px',
                        background: activeTab === 'portals' ? 'rgba(255,255,255,0.2)' : (isDark ? 'rgba(16, 185, 129, 0.15)' : '#dcfce7'),
                        color: activeTab === 'portals' ? '#ffffff' : '#10b981'
                    }}>
                        Anti-Poaching
                    </span>
                </button>
            </div>

            <div style={{ fontSize: '0.75rem', color: isDark ? '#94a3b8' : '#64748b', fontWeight: 600 }}>
                {activeTab === 'social' ? (
                    <span><i className="fab fa-youtube" style={{ color: '#ef4444', marginRight: '5px' }}></i> YouTube, Facebook, Instagram, X, LinkedIn, GBP</span>
                ) : (
                    <span><i className="fas fa-shield-alt" style={{ color: '#10b981', marginRight: '5px' }}></i> 99acres, Magicbricks, Housing.com & 8 More Portals</span>
                )}
            </div>
        </div>

        {/* ── Modal Body (Scrollable, 2-Column Grid) ────────────────────── */}
        <div style={{ padding: '24px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '20px' }}>
            
            {/* ── Section 1: Mode Summary Strip ──────────────────────── */}
            <div style={{
                background: isDark ? 'rgba(255, 255, 255, 0.03)' : '#f8fafc',
                border: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid #e2e8f0',
                borderRadius: '16px', padding: '14px 18px',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{
                        width: '32px', height: '32px', borderRadius: '8px',
                        background: activeTab === 'social' ? (isDark ? 'rgba(79, 70, 229, 0.15)' : '#e0e7ff') : (isDark ? 'rgba(2, 132, 199, 0.15)' : '#e0f2fe'),
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: activeTab === 'social' ? '#4f46e5' : '#0284c7'
                    }}>
                        <i className={`fas ${activeTab === 'social' ? 'fa-bullhorn' : 'fa-network-wired'}`} style={{ fontSize: '15px' }}></i>
                    </div>
                    <div>
                        <div style={{ fontSize: '0.88rem', fontWeight: 800, color: isDark ? '#f8fafc' : '#0f172a' }}>
                            {activeTab === 'social' ? 'Social Media Distribution Hub' : 'Portals & Network Syndication (11 Portals)'}
                        </div>
                        <div style={{ fontSize: '0.72rem', color: isDark ? '#94a3b8' : '#64748b' }}>
                            {activeTab === 'social'
                                ? 'Create AI-crafted narrative & publish across Facebook, Instagram, LinkedIn, X, YouTube, and Google Business.'
                                : 'Syndicate real-time listing feeds to 11 Indian property portals (99acres, Magicbricks, Housing.com, CommonFloor, PropTiger, etc.) with Anti-Poaching Guard.'}
                        </div>
                    </div>
                </div>

                <div style={{
                    fontSize: '0.74rem',
                    fontWeight: 700,
                    color: activeTab === 'social' ? '#4f46e5' : '#0284c7',
                    background: activeTab === 'social' ? (isDark ? 'rgba(79, 70, 229, 0.15)' : '#e0e7ff') : (isDark ? 'rgba(2, 132, 199, 0.15)' : '#e0f2fe'),
                    padding: '4px 12px',
                    borderRadius: '8px'
                }}>
                    {activeTab === 'social' ? '6 Social Channels Available' : '11 Portals Configured'}
                </div>
            </div>

            {/* ── Section 2: 2-Column Grid (Configuration & Live Preview) ────────── */}
            <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr', gap: '20px' }}>
                
                {/* ════════════════════════════════════════════════════════════════
                    LEFT COLUMN: CONFIGURATION & TARGETS
                   ════════════════════════════════════════════════════════════════ */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    
                    {/* ────── TAB 1 (SOCIAL) CONFIGURATION ────── */}
                    {activeTab === 'social' && (
                        <>
                            {/* Target Channels */}
                            <div style={{
                                background: isDark ? 'rgba(255, 255, 255, 0.03)' : '#f8fafc',
                                border: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid #e2e8f0',
                                borderRadius: '14px', padding: '16px'
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                                    <label style={{ fontSize: '0.72rem', fontWeight: 800, color: isDark ? '#94a3b8' : '#64748b', letterSpacing: '0.5px', margin: 0 }}>
                                        TARGET SOCIAL PLATFORMS <span style={{ color: '#ef4444' }}>*</span>
                                    </label>
                                    <span style={{
                                        fontSize: '0.68rem', color: '#4f46e5', fontWeight: 800,
                                        background: isDark ? 'rgba(99, 102, 241, 0.15)' : '#e0e7ff',
                                        padding: '2px 8px', borderRadius: '10px'
                                    }}>
                                        Active: {platform.toUpperCase()}
                                    </span>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                                    {SOCIAL_PLATFORMS.map(p => {
                                        const isSelected = platform === p.id;
                                        return (
                                            <button
                                                key={p.id}
                                                type="button"
                                                onClick={() => setPlatform(p.id)}
                                                style={{
                                                    display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 10px',
                                                    border: `1.5px solid ${isSelected ? '#4f46e5' : (isDark ? 'rgba(255, 255, 255, 0.08)' : '#e2e8f0')}`,
                                                    borderRadius: '10px',
                                                    background: isSelected 
                                                        ? (isDark ? 'rgba(79, 70, 229, 0.15)' : '#eef2ff') 
                                                        : (isDark ? 'rgba(255, 255, 255, 0.02)' : '#ffffff'),
                                                    cursor: 'pointer', transition: 'all 0.15s',
                                                    color: isSelected ? '#4f46e5' : (isDark ? '#f8fafc' : '#334155')
                                                }}
                                            >
                                                <i className={p.faIcon} style={{ fontSize: '15px', color: p.color }}></i>
                                                <span style={{ fontSize: '0.78rem', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                    {p.name}
                                                </span>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Campaign Format */}
                            <div style={{
                                background: isDark ? 'rgba(255, 255, 255, 0.03)' : '#f8fafc',
                                border: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid #e2e8f0',
                                borderRadius: '14px', padding: '16px'
                            }}>
                                <label style={{ fontSize: '0.72rem', fontWeight: 800, color: isDark ? '#94a3b8' : '#64748b', letterSpacing: '0.5px', marginBottom: '8px', display: 'block' }}>
                                    CAMPAIGN FORMAT
                                </label>
                                <div style={{
                                    display: 'flex', gap: '6px',
                                    background: isDark ? '#1e293b' : '#e2e8f0',
                                    padding: '3px', borderRadius: '10px'
                                }}>
                                    {['post', 'story', 'reel'].map(f => {
                                        const isSelected = format === f;
                                        return (
                                            <button
                                                key={f}
                                                type="button"
                                                onClick={() => setFormat(f)}
                                                style={{
                                                    flex: 1, padding: '7px', borderRadius: '8px', border: 'none',
                                                    background: isSelected ? '#4f46e5' : 'transparent',
                                                    color: isSelected ? '#ffffff' : (isDark ? '#94a3b8' : '#64748b'),
                                                    fontSize: '0.78rem', fontWeight: 800, cursor: 'pointer',
                                                    transition: 'all 0.15s'
                                                }}
                                            >
                                                {f.charAt(0).toUpperCase() + f.slice(1)}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Anti-Poaching Privacy Guard Matrix for Social Media Studio */}
                            <div style={{
                                background: isDark ? 'rgba(79, 70, 229, 0.08)' : 'linear-gradient(135deg, #eef2ff 0%, #f5f3ff 100%)',
                                border: isDark ? '1px solid rgba(99, 102, 241, 0.25)' : '1px solid #c7d2fe',
                                borderRadius: '14px', padding: '14px', display: 'flex', flexDirection: 'column', gap: '10px'
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <div style={{
                                            width: '26px', height: '26px', borderRadius: '8px', 
                                            background: '#4f46e5', color: '#fff',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center'
                                        }}>
                                            <i className="fas fa-shield-alt" style={{ fontSize: '12px' }}></i>
                                        </div>
                                        <div>
                                            <h4 style={{ margin: 0, fontSize: '0.84rem', fontWeight: 800, color: isDark ? '#f8fafc' : '#0f172a' }}>
                                                Social Anti-Poaching Privacy Guard
                                            </h4>
                                            <span style={{ fontSize: '0.64rem', color: isDark ? '#94a3b8' : '#64748b' }}>
                                                Conceals exact unit, address and price on social feeds to safeguard your brokerage
                                            </span>
                                        </div>
                                    </div>
                                    <span style={{ 
                                        fontSize: '0.62rem', fontWeight: 800, padding: '2px 8px', borderRadius: '10px',
                                        background: '#10b981', color: '#ffffff', letterSpacing: '0.04em'
                                    }}>
                                        SHIELD ACTIVE
                                    </span>
                                </div>

                                {/* 3 Toggles Matrix */}
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                                    {/* Toggle 1: Mask Unit No */}
                                    <div 
                                        onClick={() => handlePrivacyToggle('hideUnitNo')}
                                        style={{
                                            padding: '8px 10px', borderRadius: '10px',
                                            background: isDark ? '#1e293b' : '#ffffff',
                                            border: `1.5px solid ${privacy.hideUnitNo ? '#4f46e5' : (isDark ? 'rgba(255,255,255,0.08)' : '#e2e8f0')}`,
                                            cursor: 'pointer', transition: 'all 0.2s', display: 'flex', flexDirection: 'column', gap: '3px'
                                        }}
                                    >
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <span style={{ fontSize: '0.74rem', fontWeight: 800, color: isDark ? '#f8fafc' : '#0f172a' }}>Mask Unit #</span>
                                            <input type="checkbox" checked={privacy.hideUnitNo} readOnly style={{ accentColor: '#4f46e5', cursor: 'pointer' }} />
                                        </div>
                                        <span style={{ fontSize: '0.62rem', color: isDark ? '#94a3b8' : '#64748b' }}>
                                            {privacy.hideUnitNo ? 'Shows [CONFIDENTIAL]' : 'Shows Exact Unit #'}
                                        </span>
                                    </div>

                                    {/* Toggle 2: Hide Exact Pin */}
                                    <div 
                                        onClick={() => handlePrivacyToggle('hideLocation')}
                                        style={{
                                            padding: '8px 10px', borderRadius: '10px',
                                            background: isDark ? '#1e293b' : '#ffffff',
                                            border: `1.5px solid ${privacy.hideLocation ? '#4f46e5' : (isDark ? 'rgba(255,255,255,0.08)' : '#e2e8f0')}`,
                                            cursor: 'pointer', transition: 'all 0.2s', display: 'flex', flexDirection: 'column', gap: '3px'
                                        }}
                                    >
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <span style={{ fontSize: '0.74rem', fontWeight: 800, color: isDark ? '#f8fafc' : '#0f172a' }}>Hide Exact Pin</span>
                                            <input type="checkbox" checked={privacy.hideLocation} readOnly style={{ accentColor: '#4f46e5', cursor: 'pointer' }} />
                                        </div>
                                        <span style={{ fontSize: '0.62rem', color: isDark ? '#94a3b8' : '#64748b' }}>
                                            {privacy.hideLocation ? 'Shows Sector/City' : 'Shows Exact Address'}
                                        </span>
                                    </div>

                                    {/* Toggle 3: Price on Request */}
                                    <div 
                                        onClick={() => handlePrivacyToggle('priceOnRequest')}
                                        style={{
                                            padding: '8px 10px', borderRadius: '10px',
                                            background: isDark ? '#1e293b' : '#ffffff',
                                            border: `1.5px solid ${privacy.priceOnRequest ? '#4f46e5' : (isDark ? 'rgba(255,255,255,0.08)' : '#e2e8f0')}`,
                                            cursor: 'pointer', transition: 'all 0.2s', display: 'flex', flexDirection: 'column', gap: '3px'
                                        }}
                                    >
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <span style={{ fontSize: '0.74rem', fontWeight: 800, color: isDark ? '#f8fafc' : '#0f172a' }}>Price on Request</span>
                                            <input type="checkbox" checked={privacy.priceOnRequest} readOnly style={{ accentColor: '#4f46e5', cursor: 'pointer' }} />
                                        </div>
                                        <span style={{ fontSize: '0.62rem', color: isDark ? '#94a3b8' : '#64748b' }}>
                                            {privacy.priceOnRequest ? 'Conceals Numeric Price' : 'Displays Listed Price'}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {/* Narrative Composition & AI Copywriter */}
                            <div style={{
                                background: isDark ? 'rgba(255, 255, 255, 0.03)' : '#f8fafc',
                                border: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid #e2e8f0',
                                borderRadius: '14px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px'
                            }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div>
                                        <label style={{ fontSize: '0.72rem', fontWeight: 800, color: isDark ? '#94a3b8' : '#64748b', letterSpacing: '0.5px', margin: 0, display: 'block' }}>
                                            NARRATIVE COMPOSITION
                                        </label>
                                        <span style={{ fontSize: '0.66rem', color: isDark ? '#64748b' : '#94a3b8' }}>
                                            Optimized for {platform} {format}
                                        </span>
                                    </div>
                                    <div style={{ display: 'flex', gap: '8px' }}>
                                        <button 
                                            type="button"
                                            onClick={handleGenerateAI}
                                            disabled={isGenerating || !initialData}
                                            style={{ 
                                                background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)', 
                                                padding: '6px 14px', borderRadius: '8px', fontSize: '0.74rem', 
                                                fontWeight: 800, color: '#ffffff', display: 'flex', alignItems: 'center', gap: '6px',
                                                cursor: (isGenerating || !initialData) ? 'not-allowed' : 'pointer', border: 'none',
                                                boxShadow: '0 2px 8px rgba(79, 70, 229, 0.25)'
                                            }}
                                        >
                                            {isGenerating ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-sparkles text-amber-300"></i>}
                                            {isGenerating ? 'Synthesizing...' : 'AI Copywriter'}
                                        </button>
                                        <button 
                                            type="button"
                                            title="Copy text to clipboard"
                                            onClick={() => {
                                                navigator.clipboard.writeText(content);
                                                toast.success('Narrative copied! 📋');
                                            }}
                                            style={{ 
                                                background: isDark ? 'rgba(255,255,255,0.05)' : '#ffffff',
                                                border: isDark ? '1px solid rgba(255,255,255,0.1)' : '1px solid #cbd5e1',
                                                padding: '6px 10px', borderRadius: '8px', color: isDark ? '#94a3b8' : '#64748b',
                                                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px',
                                                fontSize: '0.74rem', fontWeight: 700
                                            }}
                                        >
                                            <i className="far fa-copy"></i>
                                            <span>Copy</span>
                                        </button>
                                    </div>
                                </div>

                                {/* ⚡ Enterprise AI Copywriting Tone Selector Chips */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px', flexWrap: 'wrap' }}>
                                    <span style={{ fontSize: '0.64rem', fontWeight: 800, color: isDark ? '#94a3b8' : '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                        AI TONE:
                                    </span>
                                    {[
                                        { id: 'urgent', label: '⚡ Urgent (Hinglish)', desc: 'High-conversion urgency & local appeal' },
                                        { id: 'luxury', label: '💎 Luxury Living', desc: 'Prestige, elegance & aspirational lifestyle' },
                                        { id: 'investor', label: '📈 Investor ROI', desc: 'Financial yields, appreciation & advisory' },
                                        { id: 'short_hook', label: '🎯 Short Hook', desc: 'Punchy social media hook for viral reach' }
                                    ].map(t => {
                                        const isActive = aiTone === t.id;
                                        return (
                                            <button
                                                key={t.id}
                                                type="button"
                                                title={t.desc}
                                                onClick={() => {
                                                    setAiTone(t.id);
                                                    handleGenerateAI(t.id);
                                                }}
                                                style={{
                                                    padding: '3px 9px',
                                                    borderRadius: '6px',
                                                    border: isActive ? '1px solid #6366f1' : (isDark ? '1px solid rgba(255,255,255,0.08)' : '1px solid #e2e8f0'),
                                                    background: isActive 
                                                        ? (isDark ? 'rgba(99, 102, 241, 0.25)' : '#eef2ff') 
                                                        : (isDark ? 'rgba(255,255,255,0.03)' : '#ffffff'),
                                                    color: isActive ? '#6366f1' : (isDark ? '#cbd5e1' : '#475569'),
                                                    fontSize: '0.68rem',
                                                    fontWeight: isActive ? 800 : 600,
                                                    cursor: 'pointer',
                                                    transition: 'all 0.15s ease'
                                                }}
                                            >
                                                {t.label}
                                            </button>
                                        );
                                    })}
                                </div>

                                <div style={{ position: 'relative' }}>
                                    <textarea
                                        value={content}
                                        onChange={(e) => setContent(e.target.value)}
                                        style={{
                                            width: '100%', height: '150px', padding: '14px', borderRadius: '10px',
                                            border: isOverCharLimit 
                                                ? '1.5px solid #ef4444' 
                                                : (isDark ? '1px solid rgba(255, 255, 255, 0.12)' : '1px solid #cbd5e1'),
                                            background: isDark ? '#1e293b' : '#ffffff',
                                            color: isDark ? '#f8fafc' : '#0f172a',
                                            outline: 'none', fontSize: '0.84rem', lineHeight: '1.55',
                                            fontFamily: 'inherit', resize: 'none'
                                        }}
                                        placeholder="Write property description, key highlights, price and call to action..."
                                    />
                                    <div style={{ 
                                        position: 'absolute', bottom: '10px', right: '10px', 
                                        padding: '2px 8px', background: isDark ? 'rgba(15,23,42,0.8)' : 'rgba(241,245,249,0.9)',
                                        borderRadius: '6px', fontSize: '0.66rem',
                                        color: isOverCharLimit ? '#ef4444' : (isDark ? '#94a3b8' : '#64748b'),
                                        fontWeight: 700, 
                                        border: isOverCharLimit ? '1px solid #ef4444' : (isDark ? '1px solid rgba(255,255,255,0.08)' : '1px solid #e2e8f0') 
                                    }}>
                                        {content.length} / {maxSocialChars} {isOverCharLimit ? '⚠️ Exceeds Limit' : (platform === 'twitter' ? '• X Limit' : '')}
                                    </div>
                                </div>

                                {platform === 'youtube' && (
                                    <div style={{
                                        padding: '10px 14px', borderRadius: '10px',
                                        background: isDark ? 'rgba(34, 197, 94, 0.1)' : '#f0fdf4',
                                        border: '1px solid rgba(34, 197, 94, 0.3)',
                                        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', fontSize: '0.72rem',
                                        color: isDark ? '#86efac' : '#15803d'
                                    }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <i className="fab fa-youtube text-red-500" style={{ fontSize: '18px' }}></i>
                                            <div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                    <span style={{ fontWeight: 800 }}>YouTube Channel:</span>
                                                    <span style={{ background: '#22c55e', color: '#fff', fontSize: '0.62rem', fontWeight: 800, padding: '1px 6px', borderRadius: '4px' }}>CONNECTED</span>
                                                    <span style={{ fontWeight: 700, color: isDark ? '#fff' : '#0f172a' }}>Bharat Properties (@bharatproperties7451)</span>
                                                </div>
                                                <div style={{ fontSize: '0.66rem', color: isDark ? '#cbd5e1' : '#64748b', marginTop: '2px' }}>
                                                    Title is taken from line 1; remainder is video Description. Video (.mp4) file required below.
                                                </div>
                                            </div>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={async () => {
                                                try {
                                                    const res = await googleSettingsAPI.getAuthUrl(window.location.origin);
                                                    if (res?.success && res.url) window.location.href = res.url;
                                                } catch (e) {
                                                    toast.error('Could not initiate Google login');
                                                }
                                            }}
                                            style={{
                                                background: isDark ? '#334155' : '#e2e8f0', color: isDark ? '#e2e8f0' : '#475569', border: 'none', padding: '4px 10px',
                                                borderRadius: '6px', fontSize: '0.68rem', fontWeight: 700, cursor: 'pointer',
                                                whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '4px'
                                            }}
                                            title="Click to refresh your Google connection"
                                        >
                                            <i className="fas fa-sync-alt"></i> Refresh
                                        </button>
                                    </div>
                                )}

                                {platform === 'google_business' && (
                                    <div style={{
                                        padding: '10px 14px', borderRadius: '10px',
                                        background: isDark ? 'rgba(66, 133, 244, 0.1)' : '#eff6ff',
                                        border: '1px solid rgba(66, 133, 244, 0.25)',
                                        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', fontSize: '0.72rem',
                                        color: isDark ? '#93c5fd' : '#1d4ed8'
                                    }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <i className="fab fa-google text-blue-500" style={{ fontSize: '18px' }}></i>
                                            <div>
                                                <div>
                                                    <strong>Google Business Profile:</strong> Posts an interactive "Learn More" update on Search & Maps.
                                                </div>
                                                <div style={{ fontSize: '0.66rem', color: isDark ? '#93c5fd' : '#3b82f6', marginTop: '2px' }}>
                                                    ⏳ <strong>GBP Quota Access:</strong> Request submitted for Project <code>322921031715</code>. Pending approval from Google developers review.
                                                </div>
                                            </div>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={async () => {
                                                try {
                                                    const res = await googleSettingsAPI.getAuthUrl(window.location.origin);
                                                    if (res?.success && res.url) window.location.href = res.url;
                                                } catch (e) {
                                                    toast.error('Could not initiate Google login');
                                                }
                                            }}
                                            style={{
                                                background: '#4285F4', color: '#ffffff', border: 'none', padding: '4px 10px',
                                                borderRadius: '6px', fontSize: '0.68rem', fontWeight: 800, cursor: 'pointer',
                                                whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '4px'
                                            }}
                                            title="Click to refresh your Google connection"
                                        >
                                            <i className="fas fa-sync-alt"></i> Reconnect Google
                                        </button>
                                    </div>
                                )}

                                {platform === 'facebook' && (
                                    <div style={{
                                        padding: '10px 14px', borderRadius: '10px',
                                        background: metaStatus?.facebook?.connected 
                                            ? (isDark ? 'rgba(34, 197, 94, 0.1)' : '#f0fdf4')
                                            : (isDark ? 'rgba(24, 119, 242, 0.1)' : '#eff6ff'),
                                        border: metaStatus?.facebook?.connected
                                            ? '1px solid rgba(34, 197, 94, 0.3)'
                                            : '1px solid rgba(24, 119, 242, 0.25)',
                                        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', fontSize: '0.72rem',
                                        color: metaStatus?.facebook?.connected 
                                            ? (isDark ? '#86efac' : '#15803d')
                                            : (isDark ? '#93c5fd' : '#1d4ed8')
                                    }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <i className="fab fa-facebook text-blue-600" style={{ fontSize: '18px' }}></i>
                                            <div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                    {metaStatus?.facebook?.connected && (
                                                        <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#22c55e', display: 'inline-block' }}></span>
                                                    )}
                                                    <strong>{metaStatus?.facebook?.connected ? 'Connected Page:' : 'Facebook Page Hub:'}</strong>
                                                    <span style={{ fontWeight: 800 }}>{metaStatus?.facebook?.connected ? (metaStatus.facebook.pageName || 'Bharat Properties') : 'Publishes to Facebook Page'}</span>
                                                </div>
                                                <div style={{ fontSize: '0.66rem', color: isDark ? '#94a3b8' : '#64748b', marginTop: '2px' }}>
                                                    {metaStatus?.facebook?.connected 
                                                        ? `Page ID: ${metaStatus.facebook.pageId || '1056305730890717'} · Ready for instant 1-click publishing` 
                                                        : 'Connect your Facebook Page via 1-Click Meta Connect in Settings > Integrations.'}
                                                </div>
                                            </div>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={async () => {
                                                try {
                                                    const res = await socialAPI.getFacebookAuthUrl(window.location.origin);
                                                    if (res?.success && res.url) window.location.href = res.url;
                                                } catch (e) {
                                                    toast.error('Could not initiate Meta login');
                                                }
                                            }}
                                            style={{
                                                background: metaStatus?.facebook?.connected ? '#059669' : '#1877F2', 
                                                color: '#ffffff', border: 'none', padding: '4px 10px',
                                                borderRadius: '6px', fontSize: '0.68rem', fontWeight: 800, cursor: 'pointer',
                                                whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '4px'
                                            }}
                                            title="Click to connect or refresh your Facebook connection"
                                        >
                                            <i className="fab fa-facebook-f"></i> {metaStatus?.facebook?.connected ? 'Reconnect' : 'Connect Meta'}
                                        </button>
                                    </div>
                                )}

                                {platform === 'instagram' && (
                                    <div style={{
                                        padding: '10px 14px', borderRadius: '10px',
                                        background: metaStatus?.instagram?.connected
                                            ? (isDark ? 'rgba(34, 197, 94, 0.1)' : '#f0fdf4')
                                            : (isDark ? 'rgba(228, 64, 95, 0.1)' : '#fdf2f8'),
                                        border: metaStatus?.instagram?.connected
                                            ? '1px solid rgba(34, 197, 94, 0.3)'
                                            : '1px solid rgba(228, 64, 95, 0.25)',
                                        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', fontSize: '0.72rem',
                                        color: metaStatus?.instagram?.connected
                                            ? (isDark ? '#86efac' : '#15803d')
                                            : (isDark ? '#f472b6' : '#be185d')
                                    }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <i className="fab fa-instagram text-pink-600" style={{ fontSize: '18px' }}></i>
                                            <div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                    {metaStatus?.instagram?.connected && (
                                                        <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#22c55e', display: 'inline-block' }}></span>
                                                    )}
                                                    <strong>{metaStatus?.instagram?.connected ? 'Connected Instagram:' : 'Instagram Business Hub:'}</strong>
                                                    <span style={{ fontWeight: 800 }}>{metaStatus?.instagram?.connected ? `@${metaStatus.instagram.igUsername || 'bhaaratproperties'}` : 'Publishes to Instagram'}</span>
                                                </div>
                                                <div style={{ fontSize: '0.66rem', color: isDark ? '#94a3b8' : '#64748b', marginTop: '2px' }}>
                                                    {metaStatus?.instagram?.connected
                                                        ? `Linked via Facebook Page · Feed, Stories & Reels ready`
                                                        : 'Connect your Instagram Business account via 1-Click Meta Connect in Settings > Integrations.'}
                                                </div>
                                            </div>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={async () => {
                                                try {
                                                    const res = await socialAPI.getFacebookAuthUrl(window.location.origin);
                                                    if (res?.success && res.url) window.location.href = res.url;
                                                } catch (e) {
                                                    toast.error('Could not initiate Meta login');
                                                }
                                            }}
                                            style={{
                                                background: metaStatus?.instagram?.connected
                                                    ? '#059669'
                                                    : 'linear-gradient(45deg, #f09433 0%,#e6683c 25%,#dc2743 50%,#cc2366 75%,#bc1888 100%)',
                                                color: '#ffffff', border: 'none', padding: '4px 10px',
                                                borderRadius: '6px', fontSize: '0.68rem', fontWeight: 800, cursor: 'pointer',
                                                whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '4px'
                                            }}
                                            title="Click to connect or refresh your Instagram connection"
                                        >
                                            <i className="fab fa-instagram"></i> {metaStatus?.instagram?.connected ? 'Reconnect' : 'Connect Meta'}
                                        </button>
                                    </div>
                                )}

                                {platform === 'linkedin' && (
                                    <div style={{
                                        padding: '10px 14px', borderRadius: '10px',
                                        background: linkedInStatus?.connected 
                                            ? (isDark ? 'rgba(34, 197, 94, 0.1)' : '#f0fdf4')
                                            : (isDark ? 'rgba(10, 102, 194, 0.1)' : '#eff6ff'),
                                        border: linkedInStatus?.connected
                                            ? '1px solid rgba(34, 197, 94, 0.3)'
                                            : '1px solid rgba(10, 102, 194, 0.25)',
                                        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', fontSize: '0.72rem',
                                        color: linkedInStatus?.connected 
                                            ? (isDark ? '#86efac' : '#15803d')
                                            : (isDark ? '#93c5fd' : '#0a66c2')
                                    }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <i className="fab fa-linkedin text-blue-600" style={{ fontSize: '18px' }}></i>
                                            <div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                    {linkedInStatus?.connected && (
                                                        <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#22c55e', display: 'inline-block' }}></span>
                                                    )}
                                                    <strong>{linkedInStatus?.connected ? 'Connected LinkedIn Organization:' : 'LinkedIn Company Page:'}</strong>
                                                    <span style={{ fontWeight: 800 }}>
                                                        {linkedInStatus?.connected 
                                                            ? `Org ID: ${linkedInStatus.orgId || '42752175'}` 
                                                            : 'Bharat Properties'}
                                                    </span>
                                                </div>
                                                <div style={{ fontSize: '0.66rem', color: isDark ? '#94a3b8' : '#64748b', marginTop: '2px' }}>
                                                    {linkedInStatus?.connected 
                                                        ? 'Token Active & Auto-Refreshing · Direct Organization Feed posting ready' 
                                                        : 'Connect your LinkedIn Company Page via 1-Click LinkedIn Connect in Settings > Integrations.'}
                                                </div>
                                            </div>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={async () => {
                                                try {
                                                    const res = await marketingAPI.getLinkedInAuthUrl();
                                                    if (res?.success && res.url) window.location.href = res.url;
                                                } catch (e) {
                                                    toast.error('Could not initiate LinkedIn login');
                                                }
                                            }}
                                            style={{
                                                background: linkedInStatus?.connected ? '#059669' : '#0a66c2', 
                                                color: '#ffffff', border: 'none', padding: '4px 10px',
                                                borderRadius: '6px', fontSize: '0.68rem', fontWeight: 800, cursor: 'pointer',
                                                whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '4px'
                                            }}
                                            title="Click to connect or refresh your LinkedIn connection"
                                        >
                                            <i className="fab fa-linkedin-in"></i> {linkedInStatus?.connected ? 'Reconnect' : 'Connect LinkedIn'}
                                        </button>
                                    </div>
                                )}
                            </div>

                            {/* Visual Media & Scheduling Row */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                {/* Media Box */}
                                <div style={{
                                    background: isDark ? 'rgba(255, 255, 255, 0.03)' : '#f8fafc',
                                    border: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid #e2e8f0',
                                    borderRadius: '14px', padding: '12px'
                                }}>
                                    <input 
                                        type="file"
                                        ref={fileInputRef}
                                        onChange={handleFileUpload}
                                        accept={platform === 'youtube' ? 'video/mp4,video/quicktime' : 'image/*,video/mp4'}
                                        style={{ display: 'none' }}
                                    />
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                        <label style={{ 
                                            fontSize: '0.68rem', fontWeight: 800, 
                                            color: platform === 'youtube' && !videoUrl ? '#ef4444' : (isDark ? '#94a3b8' : '#64748b'), 
                                            letterSpacing: '0.5px', margin: 0, display: 'flex', alignItems: 'center', gap: '4px' 
                                        }}>
                                            {platform === 'youtube' ? 'VISUAL MEDIA (VIDEO .MP4)' : 'VISUAL MEDIA'}
                                            {platform === 'youtube' && !videoUrl && (
                                                <span style={{ fontSize: '0.60rem', color: '#ef4444', fontWeight: 800 }}>• REQUIRED</span>
                                            )}
                                        </label>
                                        {(imageUrl || videoUrl) && (
                                            <button 
                                                type="button"
                                                onClick={() => { setImageUrl(''); setVideoUrl(''); }} 
                                                style={{ background: '#ef4444', color: '#fff', border: 'none', width: '20px', height: '20px', borderRadius: '5px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: '10px' }}
                                                title="Remove media"
                                            >
                                                <i className="fas fa-times"></i>
                                            </button>
                                        )}
                                    </div>
                                    <div 
                                        onClick={() => fileInputRef.current?.click()}
                                        style={{ 
                                            height: '76px', borderRadius: '8px', 
                                            border: platform === 'youtube' && !videoUrl ? '1.5px dashed #f87171' : '1.5px dashed #cbd5e1', 
                                            background: isDark ? '#1e293b' : '#ffffff', overflow: 'hidden', position: 'relative',
                                            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center'
                                        }}
                                        title={platform === 'youtube' ? "Click to upload video (.mp4)" : "Click to upload photo or video"}
                                    >
                                        {isUploadingMedia ? (
                                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', color: '#4f46e5' }}>
                                                <i className="fas fa-spinner fa-spin" style={{ fontSize: '18px' }}></i>
                                                <span style={{ fontSize: '0.68rem', fontWeight: 700 }}>Uploading...</span>
                                            </div>
                                        ) : videoUrl ? (
                                            <div style={{ width: '100%', height: '100%', background: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '4px', color: '#38bdf8' }}>
                                                <i className="fas fa-film" style={{ fontSize: '20px' }}></i>
                                                <span style={{ fontSize: '0.68rem', fontWeight: 800, color: '#f8fafc' }}>Video (.mp4) Ready</span>
                                                <span style={{ fontSize: '0.58rem', color: '#94a3b8' }}>Click to change</span>
                                            </div>
                                        ) : imageUrl ? (
                                            <div style={{ width: '100%', height: '100%', position: 'relative' }}>
                                                <img src={imageUrl} alt="Property" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                                {platform === 'youtube' && (
                                                    <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.65)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '4px', textAlign: 'center' }}>
                                                        <i className="fas fa-exclamation-circle text-amber-400" style={{ fontSize: '14px', marginBottom: '2px' }}></i>
                                                        <span style={{ fontSize: '0.62rem', color: '#fef08a', fontWeight: 800, lineHeight: 1.2 }}>YouTube needs .mp4</span>
                                                        <span style={{ fontSize: '0.58rem', color: '#ffffff', textDecoration: 'underline' }}>Click to upload video</span>
                                                    </div>
                                                )}
                                            </div>
                                        ) : (
                                            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '2px', textAlign: 'center', padding: '4px' }}>
                                                <i className={`fas ${platform === 'youtube' ? 'fa-video text-red-500' : 'fa-upload text-indigo-500'}`} style={{ fontSize: '16px' }}></i>
                                                <span style={{ fontSize: '0.68rem', fontWeight: 700, color: isDark ? '#f8fafc' : '#0f172a' }}>
                                                    {platform === 'youtube' ? 'Upload Video (.mp4)' : 'Upload Photo / Video'}
                                                </span>
                                                <span style={{ fontSize: '0.58rem', color: isDark ? '#94a3b8' : '#64748b' }}>
                                                    {platform === 'youtube' ? 'Click to select .mp4 file' : 'Click to browse files'}
                                                </span>
                                            </div>
                                        )}
                                    </div>

                                    {/* Quick Deal Photo Picker */}
                                    {galleryImages.length > 0 && (
                                        <div style={{ marginTop: '8px', paddingTop: '6px', borderTop: isDark ? '1px solid rgba(255,255,255,0.06)' : '1px solid #e2e8f0' }}>
                                            <div style={{ fontSize: '0.60rem', fontWeight: 800, color: isDark ? '#94a3b8' : '#64748b', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.4px', display: 'flex', justifyContent: 'space-between' }}>
                                                <span>Deal Gallery ({galleryImages.length})</span>
                                                <span style={{ fontSize: '0.56rem', color: '#6366f1' }}>Click to select</span>
                                            </div>
                                            <div style={{ display: 'flex', gap: '5px', overflowX: 'auto', paddingBottom: '3px', scrollbarWidth: 'none' }}>
                                                {galleryImages.map((img, idx) => {
                                                    const isSelected = imageUrl === img;
                                                    return (
                                                        <img
                                                            key={idx}
                                                            src={img}
                                                            alt={`Deal ${idx + 1}`}
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setImageUrl(img);
                                                                setIsBrandified(false);
                                                                setBrandedImageUrl('');
                                                            }}
                                                            style={{
                                                                width: '34px', height: '34px', borderRadius: '5px', objectFit: 'cover',
                                                                cursor: 'pointer',
                                                                border: isSelected ? '2px solid #6366f1' : (isDark ? '1px solid rgba(255,255,255,0.1)' : '1px solid #cbd5e1'),
                                                                opacity: isSelected ? 1 : 0.65,
                                                                flexShrink: 0,
                                                                transition: 'all 0.15s ease'
                                                            }}
                                                        />
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Scheduling Box */}
                                <div style={{
                                    background: isDark ? 'rgba(255, 255, 255, 0.03)' : '#f8fafc',
                                    border: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid #e2e8f0',
                                    borderRadius: '14px', padding: '12px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between'
                                }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <div>
                                            <div style={{ fontSize: '0.74rem', fontWeight: 800, color: isDark ? '#f8fafc' : '#0f172a' }}>Schedule Post</div>
                                            <div style={{ fontSize: '0.64rem', color: isDark ? '#94a3b8' : '#64748b' }}>Queue for peak hours</div>
                                        </div>
                                        <input
                                            type="checkbox"
                                            checked={isScheduled}
                                            onChange={(e) => setIsScheduled(e.target.checked)}
                                            style={{ accentColor: '#4f46e5', width: '16px', height: '16px', cursor: 'pointer' }}
                                        />
                                    </div>
                                    {isScheduled && (
                                        <input 
                                            type="datetime-local" 
                                            value={scheduledTime}
                                            onChange={(e) => setScheduledTime(e.target.value)}
                                            style={{ 
                                                width: '100%', padding: '6px 8px', borderRadius: '6px',
                                                border: isDark ? '1px solid rgba(255,255,255,0.15)' : '1px solid #cbd5e1',
                                                background: isDark ? '#1e293b' : '#ffffff',
                                                color: isDark ? '#f8fafc' : '#0f172a',
                                                fontSize: '0.74rem', fontWeight: 600, outline: 'none'
                                            }}
                                        />
                                    )}
                                </div>
                            </div>

                            {/* 🎨 Visual AI & Brand Studio Suite */}
                            <div style={{
                                background: isDark ? 'rgba(255, 255, 255, 0.03)' : '#f8fafc',
                                border: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid #e2e8f0',
                                borderRadius: '14px', padding: '14px', display: 'flex', flexDirection: 'column', gap: '12px'
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <div style={{
                                            width: '28px', height: '28px', borderRadius: '8px',
                                            background: 'linear-gradient(135deg, #0B1F3A 0%, #1e3a8a 100%)',
                                            border: '1px solid #C9921A',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#FAD87A'
                                        }}>
                                            <Palette size={14} />
                                        </div>
                                        <div>
                                            <div style={{ fontSize: '0.78rem', fontWeight: 800, color: isDark ? '#f8fafc' : '#0f172a', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                Visual AI & Brand Studio
                                                <span style={{ fontSize: '0.60rem', background: '#C9921A', color: '#0B1F3A', padding: '1px 6px', borderRadius: '4px', fontWeight: 900 }}>
                                                    BHARAT BRAND KIT
                                                </span>
                                            </div>
                                            <div style={{ fontSize: '0.64rem', color: isDark ? '#94a3b8' : '#64748b' }}>
                                                Verified Title Badge • RERA Compliant • Gold Price Pill • Regional Contact Footer
                                            </div>
                                        </div>
                                    </div>

                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        {imageUrl && (
                                            <button
                                                type="button"
                                                onClick={() => handleBrandify()}
                                                disabled={isBrandifying}
                                                style={{
                                                    background: isBrandified ? 'linear-gradient(135deg, #059669 0%, #10b981 100%)' : 'linear-gradient(135deg, #C9921A 0%, #E6AF2E 100%)',
                                                    color: isBrandified ? '#ffffff' : '#0B1F3A',
                                                    border: 'none',
                                                    padding: '6px 12px',
                                                    borderRadius: '8px',
                                                    fontSize: '0.72rem',
                                                    fontWeight: 800,
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '5px',
                                                    cursor: isBrandifying ? 'not-allowed' : 'pointer',
                                                    boxShadow: '0 2px 8px rgba(201, 146, 26, 0.25)'
                                                }}
                                            >
                                                {isBrandifying ? (
                                                    <>
                                                        <Loader2 size={13} className="animate-spin" />
                                                        <span>Brandifying...</span>
                                                    </>
                                                ) : isBrandified ? (
                                                    <>
                                                        <CheckCircle2 size={13} />
                                                        <span>Brandified ✓</span>
                                                    </>
                                                ) : (
                                                    <>
                                                        <Wand2 size={13} />
                                                        <span>Apply Brand Kit</span>
                                                    </>
                                                )}
                                            </button>
                                        )}

                                        {isBrandified && (
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setIsBrandified(false);
                                                    setBrandedImageUrl('');
                                                    toast('Reverted to original photo', { icon: '↺' });
                                                }}
                                                style={{
                                                    background: isDark ? 'rgba(255,255,255,0.06)' : '#f1f5f9',
                                                    border: isDark ? '1px solid rgba(255,255,255,0.1)' : '1px solid #cbd5e1',
                                                    padding: '6px 8px', borderRadius: '8px',
                                                    color: isDark ? '#94a3b8' : '#64748b',
                                                    fontSize: '0.68rem', fontWeight: 700, cursor: 'pointer'
                                                }}
                                                title="Revert to original unbranded image"
                                            >
                                                Revert
                                            </button>
                                        )}

                                        <button
                                            type="button"
                                            onClick={() => handleGenerateVisualAsset('image')}
                                            disabled={isGeneratingVisual}
                                            style={{
                                                background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                                                color: '#ffffff',
                                                border: 'none',
                                                padding: '6px 12px',
                                                borderRadius: '8px',
                                                fontSize: '0.72rem',
                                                fontWeight: 800,
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '5px',
                                                cursor: isGeneratingVisual ? 'not-allowed' : 'pointer',
                                                boxShadow: '0 2px 8px rgba(16, 185, 129, 0.25)'
                                            }}
                                            title="Generate photorealistic AI property render & auto-brand with Bharat Kit"
                                        >
                                            {isGeneratingVisual ? (
                                                <>
                                                    <Loader2 size={13} className="animate-spin" />
                                                    <span>Rendering...</span>
                                                </>
                                            ) : (
                                                <>
                                                    <Sparkles size={13} />
                                                    <span>📸 Generate AI Image</span>
                                                </>
                                            )}
                                        </button>

                                        <button
                                            type="button"
                                            onClick={() => handleGenerateVisualAsset('video')}
                                            disabled={isGeneratingVisual}
                                            style={{
                                                background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
                                                color: '#ffffff',
                                                border: 'none',
                                                padding: '6px 12px',
                                                borderRadius: '8px',
                                                fontSize: '0.72rem',
                                                fontWeight: 800,
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '5px',
                                                cursor: isGeneratingVisual ? 'not-allowed' : 'pointer',
                                                boxShadow: '0 2px 8px rgba(99, 102, 241, 0.25)'
                                            }}
                                            title="Generate 4K AI Real Estate Drone Video Reel"
                                        >
                                            <Film size={13} />
                                            <span>🎥 AI Drone Reel</span>
                                        </button>

                                        <button
                                            type="button"
                                            onClick={() => setShowPromptLab(prev => !prev)}
                                            style={{
                                                background: showPromptLab ? (isDark ? 'rgba(99, 102, 241, 0.2)' : '#e0e7ff') : (isDark ? 'rgba(255,255,255,0.05)' : '#ffffff'),
                                                border: showPromptLab ? '1px solid #6366f1' : (isDark ? '1px solid rgba(255,255,255,0.1)' : '1px solid #cbd5e1'),
                                                padding: '6px 10px',
                                                borderRadius: '8px',
                                                color: showPromptLab ? '#6366f1' : (isDark ? '#cbd5e1' : '#475569'),
                                                fontSize: '0.70rem',
                                                fontWeight: 800,
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '5px',
                                                cursor: 'pointer'
                                            }}
                                        >
                                            <Camera size={13} />
                                            <span>Visual Prompt Lab</span>
                                        </button>
                                    </div>
                                </div>

                                {/* Expandable Visual Prompt Lab Drawer */}
                                {showPromptLab && (
                                    <div style={{
                                        background: isDark ? '#0f172a' : '#ffffff',
                                        border: isDark ? '1px solid rgba(255,255,255,0.1)' : '1px solid #cbd5e1',
                                        borderRadius: '10px', padding: '12px',
                                        display: 'flex', flexDirection: 'column', gap: '10px'
                                    }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <div style={{ fontSize: '0.72rem', fontWeight: 800, color: isDark ? '#f8fafc' : '#0f172a', display: 'flex', alignItems: 'center', gap: '5px' }}>
                                                <Layers size={13} className="text-indigo-400" />
                                                <span>DALL-E 3 & Runway v3 Drone Studio Prompt Generator</span>
                                            </div>
                                            <span style={{ fontSize: '0.62rem', color: isDark ? '#94a3b8' : '#64748b' }}>
                                                Engineered for Photorealistic Real Estate Renders
                                            </span>
                                        </div>

                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: '8px', alignItems: 'center' }}>
                                            <div>
                                                <label style={{ fontSize: '0.60rem', fontWeight: 800, color: isDark ? '#94a3b8' : '#64748b', display: 'block', marginBottom: '3px' }}>
                                                    CAMERA PERSPECTIVE
                                                </label>
                                                <select
                                                    value={promptAngle}
                                                    onChange={(e) => setPromptAngle(e.target.value)}
                                                    style={{
                                                        width: '100%', padding: '5px 8px', borderRadius: '6px',
                                                        border: isDark ? '1px solid rgba(255,255,255,0.15)' : '1px solid #cbd5e1',
                                                        background: isDark ? '#1e293b' : '#ffffff',
                                                        color: isDark ? '#f8fafc' : '#0f172a',
                                                        fontSize: '0.70rem', fontWeight: 600, outline: 'none'
                                                    }}
                                                >
                                                    <option value="drone">🛸 4K Overhead Drone Aerial</option>
                                                    <option value="hero">🏛️ Eye-Level Architectural Hero</option>
                                                    <option value="interior">🛋️ Luxury Interior Sunlit Space</option>
                                                    <option value="walking">🚶 Street-Level POV Walkthrough</option>
                                                </select>
                                            </div>

                                            <div>
                                                <label style={{ fontSize: '0.60rem', fontWeight: 800, color: isDark ? '#94a3b8' : '#64748b', display: 'block', marginBottom: '3px' }}>
                                                    LIGHTING & MOOD
                                                </label>
                                                <select
                                                    value={promptMood}
                                                    onChange={(e) => setPromptMood(e.target.value)}
                                                    style={{
                                                        width: '100%', padding: '5px 8px', borderRadius: '6px',
                                                        border: isDark ? '1px solid rgba(255,255,255,0.15)' : '1px solid #cbd5e1',
                                                        background: isDark ? '#1e293b' : '#ffffff',
                                                        color: isDark ? '#f8fafc' : '#0f172a',
                                                        fontSize: '0.70rem', fontWeight: 600, outline: 'none'
                                                    }}
                                                >
                                                    <option value="golden_hour">🌅 Golden Hour Sunset Ambiance</option>
                                                    <option value="cinematic">🌌 Dusk Cinematic with LED Accents</option>
                                                    <option value="luxury">✨ Crisp Luxury High-Noon Daylight</option>
                                                    <option value="minimalist">🏙️ Minimalist Architectural Daylight</option>
                                                </select>
                                            </div>

                                            <button
                                                type="button"
                                                onClick={handleGenerateVisualPrompt}
                                                disabled={isGeneratingPrompt}
                                                style={{
                                                    alignSelf: 'flex-end',
                                                    padding: '6px 12px',
                                                    borderRadius: '6px',
                                                    border: 'none',
                                                    background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
                                                    color: '#ffffff',
                                                    fontSize: '0.70rem',
                                                    fontWeight: 800,
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '5px',
                                                    cursor: isGeneratingPrompt ? 'not-allowed' : 'pointer'
                                                }}
                                            >
                                                {isGeneratingPrompt ? <Loader2 size={12} className="animate-spin" /> : <Wand2 size={12} />}
                                                <span>Synthesize</span>
                                            </button>
                                        </div>

                                        {generatedPrompt && (
                                            <div style={{ position: 'relative', marginTop: '4px' }}>
                                                <textarea
                                                    readOnly
                                                    value={generatedPrompt}
                                                    style={{
                                                        width: '100%', height: '70px', padding: '8px 10px',
                                                        borderRadius: '6px',
                                                        border: isDark ? '1px solid rgba(99, 102, 241, 0.3)' : '1px solid #c7d2fe',
                                                        background: isDark ? '#020617' : '#f8fafc',
                                                        color: isDark ? '#e2e8f0' : '#1e293b',
                                                        fontSize: '0.68rem', lineHeight: '1.45', outline: 'none',
                                                        resize: 'none', fontFamily: 'monospace'
                                                    }}
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        navigator.clipboard.writeText(generatedPrompt);
                                                        toast.success('Visual prompt copied! 🛸');
                                                    }}
                                                    style={{
                                                        position: 'absolute', top: '6px', right: '6px',
                                                        background: '#4f46e5', color: '#fff', border: 'none',
                                                        padding: '3px 8px', borderRadius: '4px',
                                                        fontSize: '0.62rem', fontWeight: 700, cursor: 'pointer',
                                                        display: 'flex', alignItems: 'center', gap: '4px'
                                                    }}
                                                >
                                                    <Copy size={11} />
                                                    <span>Copy</span>
                                                </button>
                                                <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleGenerateVisualAsset('image')}
                                                        disabled={isGeneratingVisual}
                                                        style={{
                                                            flex: 1,
                                                            background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                                                            color: '#ffffff',
                                                            border: 'none',
                                                            padding: '7px 12px',
                                                            borderRadius: '6px',
                                                            fontSize: '0.72rem',
                                                            fontWeight: 800,
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            justifyContent: 'center',
                                                            gap: '6px',
                                                            cursor: isGeneratingVisual ? 'not-allowed' : 'pointer',
                                                            boxShadow: '0 2px 8px rgba(16, 185, 129, 0.25)'
                                                        }}
                                                    >
                                                        {isGeneratingVisual ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                                                        <span>Render AI Visual with this Prompt</span>
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </>
                    )}

                    {/* ────── TAB 2 (PORTALS) CONFIGURATION ────── */}
                    {activeTab === 'portals' && (
                        <>
                            {/* Section 1: Anti-Poaching Privacy Guard */}
                            <div style={{
                                background: isDark ? 'rgba(79, 70, 229, 0.06)' : '#eef2ff',
                                border: isDark ? '1px solid rgba(99, 102, 241, 0.25)' : '1px solid #c7d2fe',
                                borderRadius: '14px', padding: '16px'
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <div style={{ 
                                            width: '28px', height: '28px', borderRadius: '8px', 
                                            background: '#4f46e5', color: '#fff',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center'
                                        }}>
                                            <i className="fas fa-shield-alt" style={{ fontSize: '14px' }}></i>
                                        </div>
                                        <div>
                                            <h4 style={{ margin: 0, fontSize: '0.88rem', fontWeight: 800, color: isDark ? '#f8fafc' : '#0f172a' }}>
                                                Anti-Poaching Privacy Guard
                                            </h4>
                                            <span style={{ fontSize: '0.66rem', color: isDark ? '#94a3b8' : '#64748b' }}>
                                                Prevents buyer/builder bypass to protect broker commission
                                            </span>
                                        </div>
                                    </div>
                                    <span style={{ 
                                        fontSize: '0.65rem', fontWeight: 800, padding: '2px 8px', borderRadius: '10px',
                                        background: '#10b981', color: '#ffffff', letterSpacing: '0.04em'
                                    }}>
                                        SHIELD ACTIVE
                                    </span>
                                </div>

                                {/* 3 Toggles Matrix */}
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                                    
                                    {/* Toggle 1: Mask Unit No */}
                                    <div 
                                        onClick={() => handlePrivacyToggle('hideUnitNo')}
                                        style={{
                                            padding: '8px 10px', borderRadius: '10px',
                                            background: isDark ? '#1e293b' : '#ffffff',
                                            border: `1.5px solid ${privacy.hideUnitNo ? '#4f46e5' : (isDark ? 'rgba(255,255,255,0.08)' : '#e2e8f0')}`,
                                            cursor: 'pointer', transition: 'all 0.2s', display: 'flex', flexDirection: 'column', gap: '4px'
                                        }}
                                    >
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <span style={{ fontSize: '0.74rem', fontWeight: 800, color: isDark ? '#f8fafc' : '#0f172a' }}>Mask Unit #</span>
                                            <input type="checkbox" checked={privacy.hideUnitNo} readOnly style={{ accentColor: '#4f46e5', cursor: 'pointer' }} />
                                        </div>
                                        <span style={{ fontSize: '0.62rem', color: isDark ? '#94a3b8' : '#64748b' }}>
                                            {privacy.hideUnitNo ? 'Shows [CONFIDENTIAL]' : 'Shows Exact Unit #'}
                                        </span>
                                    </div>

                                    {/* Toggle 2: Hide Exact Pin */}
                                    <div 
                                        onClick={() => handlePrivacyToggle('hideLocation')}
                                        style={{
                                            padding: '8px 10px', borderRadius: '10px',
                                            background: isDark ? '#1e293b' : '#ffffff',
                                            border: `1.5px solid ${privacy.hideLocation ? '#4f46e5' : (isDark ? 'rgba(255,255,255,0.08)' : '#e2e8f0')}`,
                                            cursor: 'pointer', transition: 'all 0.2s', display: 'flex', flexDirection: 'column', gap: '4px'
                                        }}
                                    >
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <span style={{ fontSize: '0.74rem', fontWeight: 800, color: isDark ? '#f8fafc' : '#0f172a' }}>Hide Exact Pin</span>
                                            <input type="checkbox" checked={privacy.hideLocation} readOnly style={{ accentColor: '#4f46e5', cursor: 'pointer' }} />
                                        </div>
                                        <span style={{ fontSize: '0.62rem', color: isDark ? '#94a3b8' : '#64748b' }}>
                                            {privacy.hideLocation ? 'Shows Sector/City' : 'Shows Street Address'}
                                        </span>
                                    </div>

                                    {/* Toggle 3: Price on Request */}
                                    <div 
                                        onClick={() => handlePrivacyToggle('priceOnRequest')}
                                        style={{
                                            padding: '8px 10px', borderRadius: '10px',
                                            background: isDark ? '#1e293b' : '#ffffff',
                                            border: `1.5px solid ${privacy.priceOnRequest ? '#4f46e5' : (isDark ? 'rgba(255,255,255,0.08)' : '#e2e8f0')}`,
                                            cursor: 'pointer', transition: 'all 0.2s', display: 'flex', flexDirection: 'column', gap: '4px'
                                        }}
                                    >
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <span style={{ fontSize: '0.74rem', fontWeight: 800, color: isDark ? '#f8fafc' : '#0f172a' }}>Price on Request</span>
                                            <input type="checkbox" checked={privacy.priceOnRequest} readOnly style={{ accentColor: '#4f46e5', cursor: 'pointer' }} />
                                        </div>
                                        <span style={{ fontSize: '0.62rem', color: isDark ? '#94a3b8' : '#64748b' }}>
                                            {privacy.priceOnRequest ? 'Conceals Numeric Price' : 'Displays Listed Price'}
                                        </span>
                                    </div>

                                </div>
                            </div>

                            {/* Section 2: Target Portals & Syndication Network */}
                            <div style={{
                                background: isDark ? 'rgba(255, 255, 255, 0.03)' : '#f8fafc',
                                border: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid #e2e8f0',
                                borderRadius: '14px', padding: '16px'
                            }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', flexWrap: 'wrap', gap: '8px' }}>
                                    <label style={{ fontSize: '0.72rem', fontWeight: 800, color: isDark ? '#94a3b8' : '#64748b', letterSpacing: '0.5px', margin: 0 }}>
                                        TARGET REAL ESTATE PORTALS & SYNDICATION CHANNELS <span style={{ color: '#ef4444' }}>*</span>
                                    </label>
                                    <span style={{
                                        fontSize: '0.68rem', color: '#4f46e5', fontWeight: 800,
                                        background: isDark ? 'rgba(99, 102, 241, 0.15)' : '#e0e7ff',
                                        padding: '2px 8px', borderRadius: '10px'
                                    }}>
                                        {selectedPortals.length} of {PORTALS_LIST.length} Selected
                                    </span>
                                </div>

                                {/* Enterprise Phase 3: Bulk Selection Bar & Settings Gateway */}
                                <div style={{
                                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                    flexWrap: 'wrap', gap: '8px', marginBottom: '12px',
                                    padding: '8px 12px', borderRadius: '10px',
                                    background: isDark ? 'rgba(255, 255, 255, 0.02)' : '#f1f5f9',
                                    border: isDark ? '1px solid rgba(255, 255, 255, 0.05)' : '1px solid #e2e8f0'
                                }}>
                                    <div style={{ display: 'flex', gap: '6px' }}>
                                        <button
                                            type="button"
                                            onClick={handleSelectAllPortals}
                                            style={{
                                                padding: '4px 10px', borderRadius: '6px',
                                                border: isDark ? '1px solid rgba(255,255,255,0.1)' : '1px solid #cbd5e1',
                                                background: isDark ? 'rgba(255,255,255,0.04)' : '#ffffff',
                                                color: isDark ? '#cbd5e1' : '#475569',
                                                fontSize: '0.7rem', fontWeight: 700, cursor: 'pointer',
                                                display: 'flex', alignItems: 'center', gap: '4px'
                                            }}
                                        >
                                            <i className="fas fa-check-double text-indigo-500"></i>
                                            <span>Select All (11)</span>
                                        </button>
                                        <button
                                            type="button"
                                            onClick={handleSelectConnectedPortals}
                                            style={{
                                                padding: '4px 10px', borderRadius: '6px',
                                                border: isDark ? '1px solid rgba(16,185,129,0.3)' : '1px solid #a7f3d0',
                                                background: isDark ? 'rgba(16,185,129,0.1)' : '#ecfdf5',
                                                color: '#059669',
                                                fontSize: '0.7rem', fontWeight: 700, cursor: 'pointer',
                                                display: 'flex', alignItems: 'center', gap: '4px'
                                            }}
                                        >
                                            <i className="fas fa-bolt text-emerald-500"></i>
                                            <span>Connected Only</span>
                                        </button>
                                        <button
                                            type="button"
                                            onClick={handleClearAllPortals}
                                            style={{
                                                padding: '4px 10px', borderRadius: '6px',
                                                border: isDark ? '1px solid rgba(255,255,255,0.1)' : '1px solid #cbd5e1',
                                                background: isDark ? 'rgba(255,255,255,0.04)' : '#ffffff',
                                                color: isDark ? '#94a3b8' : '#64748b',
                                                fontSize: '0.7rem', fontWeight: 700, cursor: 'pointer'
                                            }}
                                        >
                                            Clear All
                                        </button>
                                    </div>

                                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.68rem', color: isDark ? '#94a3b8' : '#64748b' }}>
                                        <i className="fas fa-shield-halved text-indigo-400"></i>
                                        <span>Credentials & Feeds managed in <strong>Settings &gt; Integrations</strong></span>
                                    </div>
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                                    {PORTALS_LIST.map(portal => {
                                        const isSelected = selectedPortals.includes(portal.id);
                                        const isConnected = Boolean(portalStatuses[portal.id]?.connected);
                                        return (
                                            <div 
                                                key={portal.id}
                                                onClick={() => {
                                                    togglePortal(portal.id);
                                                    setPreviewPortal(portal.id);
                                                }}
                                                className={`portal-card ${isSelected ? 'selected' : ''}`}
                                                style={{
                                                    padding: '12px 14px', borderRadius: '12px',
                                                    background: isSelected 
                                                        ? (isDark ? 'rgba(79, 70, 229, 0.1)' : '#f0fdf4') 
                                                        : (isDark ? '#1e293b' : '#ffffff'),
                                                    border: `1.5px solid ${isSelected ? '#4f46e5' : (isDark ? 'rgba(255, 255, 255, 0.08)' : '#e2e8f0')}`,
                                                    display: 'flex', flexDirection: 'column', gap: '6px',
                                                    cursor: 'pointer', transition: 'all 0.15s'
                                                }}
                                            >
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                        <div style={{ 
                                                            width: '26px', height: '26px', borderRadius: '6px', 
                                                            background: `${portal.color}18`, color: portal.color,
                                                            display: 'flex', alignItems: 'center', justifyContent: 'center'
                                                        }}>
                                                            <portal.icon size={14} />
                                                        </div>
                                                        <span style={{ fontSize: '0.84rem', fontWeight: 800, color: isDark ? '#f8fafc' : '#0f172a' }}>
                                                            {portal.name}
                                                        </span>
                                                    </div>

                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                        {/* Live Status Pill: Active vs Setup Needed */}
                                                        {isConnected ? (
                                                            <span style={{
                                                                fontSize: '0.58rem', fontWeight: 800, padding: '2px 6px', borderRadius: '4px',
                                                                background: isDark ? 'rgba(16,185,129,0.15)' : '#dcfce7',
                                                                color: '#10b981', display: 'flex', alignItems: 'center', gap: '3px'
                                                            }}>
                                                                <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#10b981' }}></span>
                                                                ACTIVE
                                                            </span>
                                                        ) : (
                                                            <span style={{
                                                                fontSize: '0.58rem', fontWeight: 700, padding: '2px 6px', borderRadius: '4px',
                                                                background: isDark ? 'rgba(245,158,11,0.12)' : '#fef3c7',
                                                                color: '#d97706'
                                                            }}>
                                                                SETUP NEEDED
                                                            </span>
                                                        )}
                                                        <input 
                                                            type="checkbox" 
                                                            checked={isSelected} 
                                                            readOnly 
                                                            style={{ accentColor: '#4f46e5', width: '15px', height: '15px', cursor: 'pointer' }} 
                                                        />
                                                    </div>
                                                </div>

                                                <p style={{ margin: 0, fontSize: '0.68rem', color: isDark ? '#94a3b8' : '#64748b', lineHeight: '1.3' }}>
                                                    {portal.desc}
                                                </p>

                                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
                                                    <span style={{ 
                                                        fontSize: '0.6rem', fontWeight: 800, padding: '1px 6px', borderRadius: '4px',
                                                        background: `${portal.color}15`, color: portal.color, textTransform: 'uppercase'
                                                    }}>
                                                        {portal.badge}
                                                    </span>
                                                    {portal.id === previewPortal && (
                                                        <span style={{ fontSize: '0.62rem', color: '#6366f1', fontWeight: 700 }}>
                                                            • In Preview
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Section 3: Custom Syndication Headline */}
                            <div style={{
                                background: isDark ? 'rgba(255, 255, 255, 0.03)' : '#f8fafc',
                                border: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid #e2e8f0',
                                borderRadius: '14px', padding: '14px'
                            }}>
                                <label style={{ fontSize: '0.72rem', fontWeight: 800, color: isDark ? '#94a3b8' : '#64748b', letterSpacing: '0.5px', marginBottom: '6px', display: 'block' }}>
                                    PORTAL LISTING HEADLINE
                                </label>
                                <input 
                                    type="text"
                                    value={customHeadline}
                                    onChange={(e) => setCustomHeadline(e.target.value)}
                                    style={{ 
                                        width: '100%', padding: '10px 14px', borderRadius: '8px',
                                        border: isDark ? '1px solid rgba(255, 255, 255, 0.12)' : '1px solid #cbd5e1',
                                        background: isDark ? '#1e293b' : '#ffffff',
                                        color: isDark ? '#f8fafc' : '#0f172a',
                                        fontSize: '0.84rem', fontWeight: 600, outline: 'none'
                                    }}
                                    placeholder="e.g. Ultra Luxury High-Rise Residences on Golf Course Ext Rd"
                                />
                            </div>
                        </>
                    )}

                </div>

                {/* ════════════════════════════════════════════════════════════════
                    RIGHT COLUMN: LIVE HIGH-FIDELITY PREVIEW (Exact DealBroadcast Section 3 Theme)
                   ════════════════════════════════════════════════════════════════ */}
                <div style={{
                    background: isDark ? 'rgba(255, 255, 255, 0.03)' : '#f8fafc',
                    border: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid #e2e8f0',
                    borderRadius: '16px', padding: '18px', display: 'flex', flexDirection: 'column', gap: '14px'
                }}>
                    {/* Preview Header */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div style={{
                                width: '28px', height: '28px', borderRadius: '8px',
                                background: activeTab === 'social' ? '#dbeafe' : '#cffafe',
                                display: 'flex', alignItems: 'center', justifyContent: 'center'
                            }}>
                                <i className={`fas ${activeTab === 'social' ? 'fa-mobile-screen' : 'fa-globe'}`} style={{ color: activeTab === 'social' ? '#2563eb' : '#0891b2', fontSize: '14px' }}></i>
                            </div>
                            <span style={{ fontSize: '0.82rem', fontWeight: 800, color: isDark ? '#f8fafc' : '#0f172a', letterSpacing: '0.5px' }}>
                                {activeTab === 'social' 
                                    ? `LIVE SOCIAL PREVIEW — ${platform.toUpperCase()}` 
                                    : `LIVE PORTAL PREVIEW — ${previewPortal.toUpperCase()}`}
                            </span>
                        </div>

                        {/* Switchers in Preview Header */}
                        {activeTab === 'social' ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                {isBrandified && (
                                    <div style={{
                                        display: 'flex', gap: '2px',
                                        background: isDark ? '#1e293b' : '#e2e8f0',
                                        padding: '2px', borderRadius: '8px'
                                    }}>
                                        <button
                                            type="button"
                                            onClick={() => setPreviewBrandedMode(false)}
                                            style={{
                                                padding: '3px 7px', borderRadius: '6px', border: 'none',
                                                background: !previewBrandedMode ? '#64748b' : 'transparent',
                                                color: !previewBrandedMode ? '#ffffff' : (isDark ? '#94a3b8' : '#64748b'),
                                                fontSize: '0.64rem', fontWeight: 700, cursor: 'pointer'
                                            }}
                                        >
                                            Original
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setPreviewBrandedMode(true)}
                                            style={{
                                                padding: '3px 7px', borderRadius: '6px', border: 'none',
                                                background: previewBrandedMode ? 'linear-gradient(135deg, #C9921A 0%, #E6AF2E 100%)' : 'transparent',
                                                color: previewBrandedMode ? '#0B1F3A' : (isDark ? '#94a3b8' : '#64748b'),
                                                fontSize: '0.64rem', fontWeight: 800, cursor: 'pointer'
                                            }}
                                        >
                                            ✨ Branded
                                        </button>
                                    </div>
                                )}
                                <div style={{
                                    display: 'flex', gap: '3px',
                                    background: isDark ? '#1e293b' : '#e2e8f0',
                                    padding: '2px', borderRadius: '8px'
                                }}>
                                    {['post', 'story', 'reel'].map(f => (
                                        <button
                                            key={f}
                                            type="button"
                                            onClick={() => setFormat(f)}
                                            style={{
                                                padding: '3px 8px', borderRadius: '6px', border: 'none',
                                                background: format === f ? '#4f46e5' : 'transparent',
                                                color: format === f ? '#ffffff' : (isDark ? '#94a3b8' : '#64748b'),
                                                fontSize: '0.68rem', fontWeight: 700, cursor: 'pointer'
                                            }}
                                        >
                                            {f.toUpperCase()}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        ) : (
                            <div style={{
                                display: 'flex', gap: '3px',
                                background: isDark ? '#1e293b' : '#e2e8f0',
                                padding: '2px', borderRadius: '8px',
                                maxWidth: '320px', overflowX: 'auto', scrollbarWidth: 'none'
                            }}>
                                {PORTALS_LIST.map(p => (
                                    <button
                                        key={p.id}
                                        type="button"
                                        onClick={() => setPreviewPortal(p.id)}
                                        style={{
                                            padding: '3px 8px', borderRadius: '6px', border: 'none',
                                            background: previewPortal === p.id ? '#4f46e5' : 'transparent',
                                            color: previewPortal === p.id ? '#ffffff' : (isDark ? '#94a3b8' : '#64748b'),
                                            fontSize: '0.66rem', fontWeight: 700, cursor: 'pointer',
                                            whiteSpace: 'nowrap'
                                        }}
                                        title={`Preview on ${p.name}`}
                                    >
                                        {p.name.replace('.com', '').replace(' India', '')}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Preview Box Body */}
                    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flex: 1, minHeight: '380px' }}>
                        
                        {/* ────── PREVIEW 1: SOCIAL PHONE MIRROR ────── */}
                        {activeTab === 'social' && (
                            <div style={{ 
                                width: '280px', height: '480px', borderRadius: '32px', 
                                background: isDark ? '#020617' : '#ffffff', 
                                border: isDark ? '8px solid #1e293b' : '8px solid #0f172a', 
                                boxShadow: isDark ? '0 15px 35px rgba(0,0,0,0.6)' : '0 15px 35px rgba(15,23,42,0.15)',
                                position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column'
                            }}>
                                {/* Phone Notch */}
                                <div style={{ 
                                    position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)', 
                                    width: '80px', height: '14px', background: isDark ? '#1e293b' : '#0f172a', 
                                    borderRadius: '0 0 10px 10px', zIndex: 100 
                                }}></div>

                                {format === 'post' ? (
                                    /* FEED POST PREVIEW */
                                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflowY: 'auto', background: isDark ? '#0f172a' : '#ffffff' }}>
                                        {/* Post Header */}
                                        <div style={{ padding: '16px 12px 8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: isDark ? '1px solid rgba(255,255,255,0.06)' : '1px solid #f1f5f9' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <div style={{ width: '26px', height: '26px', borderRadius: '50%', background: '#4f46e5', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '9px', fontWeight: 900 }}>BP</div>
                                                <div>
                                                    <div style={{ fontSize: '0.74rem', fontWeight: 800, color: isDark ? '#f8fafc' : '#0f172a' }}>bharat_properties</div>
                                                    <div style={{ fontSize: '0.58rem', color: isDark ? '#94a3b8' : '#64748b' }}>Sponsored • {platform}</div>
                                                </div>
                                            </div>
                                            <span style={{ fontSize: '0.8rem', color: isDark ? '#94a3b8' : '#64748b' }}>•••</span>
                                        </div>

                                        {/* Media Preview Box */}
                                        <div style={{ width: '100%', height: '160px', background: isDark ? '#1e293b' : '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', position: 'relative' }}>
                                            {videoUrl ? (
                                                <div style={{ width: '100%', height: '100%', background: '#020617', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                                                    <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'rgba(79, 70, 229, 0.9)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
                                                        <i className="fas fa-play" style={{ fontSize: '15px', marginLeft: '3px' }}></i>
                                                    </div>
                                                    <span style={{ position: 'absolute', bottom: '6px', left: '8px', background: 'rgba(0,0,0,0.7)', color: '#38bdf8', fontSize: '9px', fontWeight: 800, padding: '2px 6px', borderRadius: '4px' }}>
                                                        <i className="fas fa-video"></i> .MP4 VIDEO
                                                    </span>
                                                </div>
                                            ) : (isBrandified && previewBrandedMode && brandedImageUrl) ? (
                                                <div style={{ width: '100%', height: '100%', position: 'relative' }}>
                                                    <img src={brandedImageUrl} alt="Branded Property Post" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                                    <div style={{ position: 'absolute', top: '6px', right: '6px', background: 'rgba(11, 31, 58, 0.92)', border: '1px solid #C9921A', color: '#FAD87A', fontSize: '8px', fontWeight: 900, padding: '2px 6px', borderRadius: '4px', letterSpacing: '0.4px', display: 'flex', alignItems: 'center', gap: '3px', boxShadow: '0 2px 6px rgba(0,0,0,0.4)' }}>
                                                        <i className="fas fa-certificate text-amber-400"></i> BRANDED
                                                    </div>
                                                </div>
                                            ) : imageUrl ? (
                                                <div style={{ width: '100%', height: '100%', position: 'relative' }}>
                                                    <img src={imageUrl} alt="Preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                                    {platform === 'youtube' && (
                                                        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'rgba(239, 68, 68, 0.85)', color: '#ffffff', fontSize: '8px', fontWeight: 800, padding: '3px 6px', textAlign: 'center' }}>
                                                            ⚠️ YouTube requires video file (.mp4)
                                                        </div>
                                                    )}
                                                </div>
                                            ) : (
                                                <div style={{ textAlign: 'center', color: isDark ? '#64748b' : '#94a3b8' }}>
                                                    <i className="fas fa-image" style={{ fontSize: '24px' }}></i>
                                                </div>
                                            )}
                                        </div>

                                        {/* Content & Actions */}
                                        <div style={{ padding: '10px 12px', flex: 1 }}>
                                            <div style={{ display: 'flex', gap: '10px', marginBottom: '6px', color: isDark ? '#94a3b8' : '#64748b', fontSize: '13px' }}>
                                                <i className="far fa-heart"></i>
                                                <i className="far fa-comment"></i>
                                                <i className="far fa-paper-plane"></i>
                                            </div>
                                            <div style={{ fontSize: '0.74rem', color: isDark ? '#f8fafc' : '#0f172a', lineHeight: '1.4', whiteSpace: 'pre-wrap' }}>
                                                <strong style={{ marginRight: '4px' }}>bharat_properties</strong>
                                                {content || 'Establishing narrative structure...'}
                                            </div>

                                            {/* Masking Status Badges in Social Feed Post Preview */}
                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '8px' }}>
                                                {privacy.hideUnitNo && (
                                                    <span style={{ fontSize: '0.58rem', background: isDark ? 'rgba(59,130,246,0.2)' : '#eff6ff', color: '#2563eb', padding: '1px 5px', borderRadius: '4px', fontWeight: 700 }}>
                                                        🔒 Unit Masked
                                                    </span>
                                                )}
                                                {privacy.hideLocation && (
                                                    <span style={{ fontSize: '0.58rem', background: isDark ? 'rgba(16,185,129,0.2)' : '#f0fdf4', color: '#10b981', padding: '1px 5px', borderRadius: '4px', fontWeight: 700 }}>
                                                        📍 Micro-Market
                                                    </span>
                                                )}
                                                {privacy.priceOnRequest && (
                                                    <span style={{ fontSize: '0.58rem', background: isDark ? 'rgba(124,58,237,0.2)' : '#faf5ff', color: '#7c3aed', padding: '1px 5px', borderRadius: '4px', fontWeight: 700 }}>
                                                        💰 Price on Request
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    /* STORY / REEL PREVIEW */
                                    <div style={{ flex: 1, position: 'relative', background: '#000' }}>
                                        {((isBrandified && previewBrandedMode && brandedImageUrl) ? brandedImageUrl : imageUrl) && (
                                            <img 
                                                src={(isBrandified && previewBrandedMode && brandedImageUrl) ? brandedImageUrl : imageUrl} 
                                                alt="Background" 
                                                style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.8 }} 
                                            />
                                        )}
                                        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, rgba(0,0,0,0.6) 0%, transparent 20%, transparent 75%, rgba(0,0,0,0.85) 100%)' }}></div>
                                        <div style={{ position: 'absolute', top: '24px', left: '10px', right: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            <div style={{ width: '22px', height: '22px', borderRadius: '50%', background: '#4f46e5', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '8px', fontWeight: 900 }}>BP</div>
                                            <span style={{ color: '#fff', fontSize: '0.72rem', fontWeight: 800 }}>bharat_properties</span>
                                            <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.68rem' }}>Just now</span>
                                        </div>
                                        <div style={{ position: 'absolute', bottom: '16px', left: '10px', right: '10px' }}>
                                            <p style={{ color: '#fff', fontSize: '0.74rem', fontWeight: 600, marginBottom: '8px' }}>
                                                {content.length > 90 ? content.substring(0, 90) + '...' : content || 'Establishing visual presence...'}
                                            </p>
                                            <div style={{ height: '30px', borderRadius: '15px', border: '1px solid rgba(255,255,255,0.4)', background: 'rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', padding: '0 10px', color: '#fff', fontSize: '0.68rem' }}>
                                                Send message...
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* ────── PREVIEW 2: REAL ESTATE PORTAL CARD ────── */}
                        {activeTab === 'portals' && (() => {
                            const activeMeta = PORTAL_PREVIEW_METAS[previewPortal] || PORTAL_PREVIEW_METAS['99acres'];
                            return (
                                <div style={{ width: '100%', maxWidth: '380px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                    <div style={{
                                        background: isDark ? '#1e293b' : '#ffffff',
                                        borderRadius: '16px', overflow: 'hidden',
                                        boxShadow: isDark ? '0 12px 30px rgba(0,0,0,0.5)' : '0 12px 30px rgba(0,0,0,0.08)',
                                        border: isDark ? '1px solid rgba(255,255,255,0.1)' : '1px solid #e2e8f0'
                                    }}>
                                        {/* Dynamic Portal Header Watermark */}
                                        <div style={{ 
                                            padding: '8px 14px', 
                                            background: activeMeta.headerBg,
                                            color: '#ffffff', display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                                        }}>
                                            <span style={{ fontSize: '0.72rem', fontWeight: 800 }}>
                                                {activeMeta.title}
                                            </span>
                                            <span style={{ fontSize: '0.6rem', background: 'rgba(255,255,255,0.25)', padding: '2px 6px', borderRadius: '4px', fontWeight: 700 }}>
                                                {activeMeta.watermark}
                                            </span>
                                        </div>

                                        {/* Image Showcase */}
                                        <div style={{ height: '140px', background: isDark ? '#0f172a' : '#f1f5f9', position: 'relative', overflow: 'hidden' }}>
                                            {imageUrl ? (
                                                <img src={imageUrl} alt="Property" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                            ) : (
                                                <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                    <i className="fas fa-building" style={{ fontSize: '32px', color: isDark ? '#64748b' : '#cbd5e1' }}></i>
                                                </div>
                                            )}

                                            {/* Anti-Poaching Indicator on Card */}
                                            <div style={{ 
                                                position: 'absolute', top: '8px', left: '8px',
                                                background: 'rgba(15, 23, 42, 0.85)', backdropFilter: 'blur(4px)',
                                                padding: '3px 7px', borderRadius: '6px', display: 'flex', alignItems: 'center', gap: '4px',
                                                color: '#fff', fontSize: '0.62rem', fontWeight: 700
                                            }}>
                                                <i className="fas fa-shield-alt text-emerald-400"></i>
                                                <span>Protected Listing</span>
                                            </div>

                                            {initialData?.reraNumber && (
                                                <div style={{ 
                                                    position: 'absolute', bottom: '8px', right: '8px',
                                                    background: 'rgba(0,0,0,0.75)', color: '#67e8f9',
                                                    padding: '2px 6px', borderRadius: '4px', fontSize: '0.58rem', fontWeight: 800
                                                }}>
                                                    RERA: {initialData.reraNumber}
                                                </div>
                                            )}
                                        </div>

                                        {/* Card Content & Details */}
                                        <div style={{ padding: '14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                            
                                            {/* Price & Area */}
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                                                <div>
                                                    <span style={{ fontSize: '1.15rem', fontWeight: 800, color: isDark ? '#f8fafc' : '#0f172a' }}>
                                                        {getMaskedPrice()}
                                                    </span>
                                                    {privacy.priceOnRequest && (
                                                        <span style={{ display: 'block', fontSize: '0.62rem', color: '#6366f1', fontWeight: 700 }}>
                                                            🔒 Numeric Price Concealed
                                                        </span>
                                                    )}
                                                </div>
                                                <span style={{ fontSize: '0.72rem', color: isDark ? '#94a3b8' : '#64748b', fontWeight: 600 }}>
                                                    {initialData?.projectType || 'Premium Residential'}
                                                </span>
                                            </div>

                                            {/* Property Title (Masked Unit) */}
                                            <div>
                                                <h5 style={{ margin: 0, fontSize: '0.88rem', fontWeight: 800, color: isDark ? '#f8fafc' : '#0f172a', lineHeight: '1.3' }}>
                                                    {customHeadline || getMaskedTitle()}
                                                </h5>
                                                <p style={{ margin: '3px 0 0', fontSize: '0.74rem', color: isDark ? '#94a3b8' : '#64748b', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                    <i className="fas fa-map-marker-alt text-red-500" style={{ fontSize: '11px' }}></i>
                                                    <span>{getMaskedLocation()}</span>
                                                </p>
                                            </div>

                                            {/* Masking Status Tags */}
                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', paddingTop: '2px' }}>
                                                {privacy.hideUnitNo && (
                                                    <span style={{ fontSize: '0.6rem', background: isDark ? 'rgba(59,130,246,0.15)' : '#eff6ff', color: '#2563eb', padding: '2px 6px', borderRadius: '4px', fontWeight: 700 }}>
                                                        🔒 Unit Masked
                                                    </span>
                                                )}
                                                {privacy.hideLocation && (
                                                    <span style={{ fontSize: '0.6rem', background: isDark ? 'rgba(16,185,129,0.15)' : '#f0fdf4', color: '#10b981', padding: '2px 6px', borderRadius: '4px', fontWeight: 700 }}>
                                                        📍 Micro-Market
                                                    </span>
                                                )}
                                                {privacy.priceOnRequest && (
                                                    <span style={{ fontSize: '0.6rem', background: isDark ? 'rgba(124,58,237,0.15)' : '#faf5ff', color: '#7c3aed', padding: '2px 6px', borderRadius: '4px', fontWeight: 700 }}>
                                                        💰 Price On Request
                                                    </span>
                                                )}
                                            </div>

                                            {/* Broker Dynamic CTA Buttons for Selected Portal */}
                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '4px', paddingTop: '8px', borderTop: isDark ? '1px solid rgba(255,255,255,0.08)' : '1px solid #f1f5f9' }}>
                                                <button style={{
                                                    padding: '6px', borderRadius: '8px', border: `1px solid ${activeMeta.cta1.border}`,
                                                    background: 'transparent', color: activeMeta.cta1.color, fontSize: '0.72rem', fontWeight: 700,
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px'
                                                }}>
                                                    <i className={`fas ${activeMeta.cta1.icon}`}></i> {activeMeta.cta1.label}
                                                </button>
                                                <button style={{
                                                    padding: '6px', borderRadius: '8px', border: 'none',
                                                    background: activeMeta.cta2.bg, color: activeMeta.cta2.color, fontSize: '0.72rem', fontWeight: 700,
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px'
                                                }}>
                                                    <i className={activeMeta.cta2.icon}></i> {activeMeta.cta2.label}
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                    <span style={{ textAlign: 'center', fontSize: '0.66rem', color: isDark ? '#94a3b8' : '#64748b' }}>
                                        Live syndicated card replica for <strong>{activeMeta.title}</strong> with Anti-Poaching Guard applied
                                    </span>
                                </div>
                            );
                        })()}

                    </div>

                    {/* Preview Footnote */}
                    <div style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        fontSize: '0.68rem', color: isDark ? '#94a3b8' : '#64748b',
                        paddingTop: '8px', borderTop: isDark ? '1px solid rgba(255,255,255,0.06)' : '1px solid #f1f5f9'
                    }}>
                        <span>
                            <i className="fas fa-shield-alt text-emerald-500" style={{ marginRight: '4px' }}></i>
                            {activeTab === 'social' ? 'Platform API Ready & Formatted' : 'Anti-Poaching Protection Active'}
                        </span>
                        <span style={{ color: '#4f46e5', fontWeight: 700 }}>
                            {activeTab === 'social' ? `${platform.toUpperCase()} Sync` : 'Syndication Verified'}
                        </span>
                    </div>

                </div>

            </div>

        </div>

        {/* ── Modal Footer (Exact DealBroadcastModal Theme) ────────────────────── */}
        <div style={{
            padding: '16px 24px',
            borderTop: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid #f1f5f9',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            background: isDark ? '#0f172a' : '#ffffff'
        }}>
            <div style={{ fontSize: '0.75rem', color: isDark ? '#94a3b8' : '#64748b', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                {activeTab === 'social' ? (
                    <>
                        <span>
                            Target: <strong style={{ color: '#4f46e5' }}>{platform.toUpperCase()}</strong>
                        </span>
                        <span>•</span>
                        <span>
                            Format: <strong style={{ color: isDark ? '#f8fafc' : '#1e293b' }}>{format.toUpperCase()}</strong>
                        </span>
                        <span>•</span>
                        <span style={{
                            padding: '3px 10px', borderRadius: '8px',
                            background: isDark ? 'rgba(79,70,229,0.15)' : '#e0e7ff',
                            color: '#4f46e5', fontWeight: 800
                        }}>
                            <i className="fas fa-pen-nib" style={{ marginRight: '5px' }}></i>
                            {content.length} Characters
                        </span>
                        {isScheduled && scheduledTime && (
                            <span style={{
                                padding: '3px 10px', borderRadius: '8px',
                                background: isDark ? 'rgba(16,185,129,0.15)' : '#dcfce7',
                                color: '#10b981', fontWeight: 800
                            }}>
                                <i className="far fa-calendar-check" style={{ marginRight: '5px' }}></i>
                                Scheduled: {new Date(scheduledTime).toLocaleDateString()}
                            </span>
                        )}
                    </>
                ) : (
                    <>
                        <span>
                            Portals: <strong style={{ color: '#4f46e5' }}>{selectedPortals.length} Selected</strong>
                        </span>
                        <span>•</span>
                        <span style={{
                            padding: '3px 10px', borderRadius: '8px',
                            background: isDark ? 'rgba(16,185,129,0.15)' : '#dcfce7',
                            color: '#10b981', fontWeight: 800
                        }}>
                            <i className="fas fa-shield-alt" style={{ marginRight: '5px' }}></i>
                            Anti-Poaching Shield Active
                        </span>
                        <span>•</span>
                        <span style={{
                            padding: '3px 10px', borderRadius: '8px',
                            background: isDark ? 'rgba(99,102,241,0.15)' : '#eef2ff',
                            color: '#4f46e5', fontWeight: 800
                        }}>
                            <i className="fas fa-rss" style={{ marginRight: '5px' }}></i>
                            Direct Hub Syndication
                        </span>
                    </>
                )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <button
                    type="button"
                    onClick={onClose}
                    style={{
                        padding: '10px 18px', borderRadius: '10px',
                        border: isDark ? '1px solid rgba(255, 255, 255, 0.12)' : '1px solid #cbd5e1',
                        background: 'transparent',
                        color: isDark ? '#94a3b8' : '#64748b', fontSize: '0.82rem', fontWeight: 700,
                        cursor: 'pointer'
                    }}
                >
                    Cancel
                </button>

                {activeTab === 'social' ? (
                    <button
                        type="button"
                        onClick={handlePublishSocial}
                        disabled={isPublishing || status === 'success' || (isScheduled && !scheduledTime)}
                        style={{
                            padding: '10px 24px', borderRadius: '10px', border: 'none',
                            background: status === 'success' 
                                ? '#10b981' 
                                : 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
                            color: '#ffffff',
                            fontSize: '0.85rem', fontWeight: 800,
                            cursor: (isPublishing || status === 'success' || (isScheduled && !scheduledTime)) ? 'not-allowed' : 'pointer',
                            display: 'flex', alignItems: 'center', gap: '8px',
                            boxShadow: status === 'success' ? '0 4px 14px rgba(16, 185, 129, 0.4)' : '0 4px 14px rgba(79, 70, 229, 0.4)',
                            transition: 'all 0.2s'
                        }}
                    >
                        {isPublishing ? (
                            <>
                                <i className="fas fa-spinner fa-spin"></i>
                                <span>Publishing to {platform}...</span>
                            </>
                        ) : status === 'success' ? (
                            <>
                                <i className="fas fa-check-circle"></i>
                                <span>Broadcast Complete!</span>
                            </>
                        ) : isScheduled ? (
                            <>
                                <i className="fas fa-calendar-plus"></i>
                                <span>Schedule for {platform}</span>
                            </>
                        ) : (
                            <>
                                <i className="fas fa-paper-plane"></i>
                                <span>Launch to {platform}</span>
                            </>
                        )}
                    </button>
                ) : (
                    <button
                        type="button"
                        onClick={handleSyndicatePortals}
                        disabled={isSyndicating || syndicateStatus === 'success' || selectedPortals.length === 0}
                        style={{
                            padding: '10px 24px', borderRadius: '10px', border: 'none',
                            background: syndicateStatus === 'success'
                                ? '#10b981'
                                : 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
                            color: '#ffffff',
                            fontSize: '0.85rem', fontWeight: 800,
                            cursor: (isSyndicating || syndicateStatus === 'success' || selectedPortals.length === 0) ? 'not-allowed' : 'pointer',
                            display: 'flex', alignItems: 'center', gap: '8px',
                            boxShadow: syndicateStatus === 'success' ? '0 4px 14px rgba(16, 185, 129, 0.4)' : '0 4px 14px rgba(79, 70, 229, 0.4)',
                            transition: 'all 0.2s'
                        }}
                    >
                        {isSyndicating ? (
                            <>
                                <i className="fas fa-spinner fa-spin"></i>
                                <span>Syndicating Feeds...</span>
                            </>
                        ) : syndicateStatus === 'success' ? (
                            <>
                                <i className="fas fa-check-circle"></i>
                                <span>Syndication Broadcast Complete!</span>
                            </>
                        ) : (
                            <>
                                <i className="fas fa-globe"></i>
                                <span>Syndicate to Selected Portals ({selectedPortals.length})</span>
                            </>
                        )}
                    </button>
                )}
            </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};

export default SocialPostModal;
