import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { jarvisAPI } from '../../utils/api';
import toast from 'react-hot-toast';

export const JarvisWidget = () => {
    const navigate = useNavigate();
    const [isOpen, setIsOpen] = useState(false);
    const [status, setStatus] = useState('idle'); // 'idle' | 'listening' | 'processing' | 'speaking'
    const [transcript, setTranscript] = useState('');
    const [interimText, setInterimText] = useState('');
    const [speechResponse, setSpeechResponse] = useState('');
    const [displayData, setDisplayData] = useState(null);
    const [pendingAction, setPendingAction] = useState(null);
    const [isMuted, setIsMuted] = useState(false);
    const [inputText, setInputText] = useState('');
    const [langMode, setLangMode] = useState('en-IN'); // 'en-IN' (Hinglish/English) | 'hi-IN' (Hindi)
    const [activeTab, setActiveTab] = useState('assistant'); // 'assistant' | 'briefing' | 'call_intel'
    const [callPhone, setCallPhone] = useState('');
    const [callNotes, setCallNotes] = useState('');
    const [isAnalyzingCall, setIsAnalyzingCall] = useState(false);
    const [briefingData, setBriefingData] = useState(null);
    const [isLoadingBriefing, setIsLoadingBriefing] = useState(false);
    const [micBlocked, setMicBlocked] = useState(false);
    const isSafari = typeof navigator !== 'undefined' && /^((?!chrome|android).)*safari/i.test(navigator?.userAgent || '');

    const recognitionRef = useRef(null);
    const mediaRecorderRef = useRef(null);
    const audioChunksRef = useRef([]);
    const mediaStreamRef = useRef(null);
    const isRecordingAudioRef = useRef(false);
    const synthRef = useRef(typeof window !== 'undefined' ? window.speechSynthesis : null);
    const currentAudioRef = useRef(null);
    const handleCommandSubmitRef = useRef(null);
    const accumulatedTextRef = useRef('');
    const hasSubmittedRef = useRef(false);

    // Monitor browser microphone permission changes
    useEffect(() => {
        if (typeof window === 'undefined') return;
        if (navigator.permissions && navigator.permissions.query) {
            navigator.permissions.query({ name: 'microphone' }).then(permissionStatus => {
                if (permissionStatus.state === 'denied') {
                    setMicBlocked(true);
                } else if (permissionStatus.state === 'granted') {
                    setMicBlocked(false);
                }
                permissionStatus.onchange = () => {
                    if (permissionStatus.state === 'granted') {
                        setMicBlocked(false);
                        toast.success('Microphone unblocked! You can now speak to Jarvis.', { icon: '🎙️' });
                    } else if (permissionStatus.state === 'denied') {
                        setMicBlocked(true);
                    }
                };
            }).catch(() => {});
        }
    }, []);

    // Global Keyboard Shortcut: Ctrl+J / Cmd+J to toggle Jarvis HUD
    useEffect(() => {
        const handleKeyDown = (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'j') {
                e.preventDefault();
                setIsOpen(prev => !prev);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    // 🔔 Clean Web Audio API Chime Generator for satisfying auditory feedback
    const playChime = (type = 'start') => {
        try {
            if (typeof window === 'undefined') return;
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            if (!AudioCtx) return;
            const ctx = new AudioCtx();
            if (ctx.state === 'suspended') {
                ctx.resume();
            }
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';

            if (type === 'start') {
                // Ascending melodic ping (440Hz -> 880Hz)
                osc.frequency.setValueAtTime(440, ctx.currentTime);
                osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.12);
                gain.gain.setValueAtTime(0.08, ctx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.22);
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.start();
                osc.stop(ctx.currentTime + 0.22);
            } else if (type === 'success') {
                // Pleasant confirmation chord (587Hz -> 880Hz)
                osc.frequency.setValueAtTime(587.33, ctx.currentTime);
                osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.15);
                gain.gain.setValueAtTime(0.08, ctx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.28);
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.start();
                osc.stop(ctx.currentTime + 0.28);
            }
        } catch (e) {
            // AudioContext silent fallback
        }
    };

    // Stop any active speech synthesis or studio audio playback immediately
    const stopSpeaking = () => {
        if (currentAudioRef.current) {
            try {
                currentAudioRef.current.pause();
                currentAudioRef.current.currentTime = 0;
            } catch (e) {}
            currentAudioRef.current = null;
        }
        if (synthRef.current) {
            try {
                if (synthRef.current.speaking || synthRef.current.pending) {
                    synthRef.current.cancel();
                }
            } catch (e) {}
        }
        setStatus('idle');
    };

    // Fallback: Browser Web Speech API synthesizer (Hardened against Chrome stall bugs)
    const speakLocalTTS = (cleanText) => {
        if (!synthRef.current || isMuted || !cleanText) return;

        try {
            if (synthRef.current.speaking || synthRef.current.pending) {
                synthRef.current.cancel();
            }
            if (synthRef.current.paused) {
                synthRef.current.resume();
            }

            const utterance = new SpeechSynthesisUtterance(cleanText);
            utterance.rate = 1.05;
            utterance.pitch = 1.0;

            const voices = synthRef.current.getVoices() || [];
            const preferredVoice = voices.find(v => v.lang.includes('hi') || v.lang.includes('IN') || v.name.toLowerCase().includes('india')) || voices[0];
            if (preferredVoice) {
                utterance.voice = preferredVoice;
            }

            utterance.onstart = () => setStatus('speaking');
            utterance.onend = () => setStatus('idle');
            utterance.onerror = (e) => {
                console.warn('[Jarvis] Local TTS event error:', e);
                setStatus('idle');
            };

            setTimeout(() => {
                try {
                    synthRef.current?.speak(utterance);
                } catch (e) {
                    setStatus('idle');
                }
            }, 60);
        } catch (e) {
            console.error('[Jarvis] Local TTS error:', e);
            setStatus('idle');
        }
    };

    // 🔊 Primary Speech Output: Plays Studio-grade Gemini 3.8 Flash TTS with seamless local fallback
    const speakVoice = (text, audioBase64 = null) => {
        if (isMuted || !text) return;

        // Stop any currently playing audio before starting new playback
        stopSpeaking();

        const cleanText = text
            .replace(/[*_#`~]/g, '')
            .replace(/https?:\/\/\S+/g, 'link')
            .trim();

        // 1. High-fidelity Gemini 3.8 Flash Studio Audio playback (Natural Hindi pronunciation)
        if (audioBase64) {
            try {
                const audio = new Audio('data:audio/wav;base64,' + audioBase64);
                currentAudioRef.current = audio;

                audio.onplay = () => setStatus('speaking');
                audio.onended = () => {
                    setStatus('idle');
                    currentAudioRef.current = null;
                };
                audio.onerror = (err) => {
                    console.warn('[Jarvis] Studio audio playback error, falling back to local TTS:', err);
                    currentAudioRef.current = null;
                    speakLocalTTS(cleanText);
                };

                const playPromise = audio.play();
                if (playPromise !== undefined) {
                    playPromise.catch((err) => {
                        console.warn('[Jarvis] Autoplay restriction prevented immediate audio, falling back:', err);
                        currentAudioRef.current = null;
                        speakLocalTTS(cleanText);
                    });
                }
                return;
            } catch (err) {
                console.warn('[Jarvis] Studio audio failed to initialize, falling back:', err);
            }
        }

        // 2. Fallback to Web Speech API synthesizer if audioBase64 is absent
        speakLocalTTS(cleanText);
    };

    // 🎙️ Direct Hardware Voice Recording (MediaRecorder + Gemini Multimodal AI)
    // 100% Guaranteed cross-browser reliability (Safari, Chrome, Firefox, iOS, Android)
    const startDirectRecording = async () => {
        stopSpeaking();
        if (recognitionRef.current) {
            try { recognitionRef.current.abort(); } catch (e) {}
            recognitionRef.current = null;
        }

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaStreamRef.current = stream;

            let options = {};
            if (typeof MediaRecorder !== 'undefined') {
                if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
                    options = { mimeType: 'audio/webm;codecs=opus' };
                } else if (MediaRecorder.isTypeSupported('audio/webm')) {
                    options = { mimeType: 'audio/webm' };
                } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
                    options = { mimeType: 'audio/mp4' };
                } else if (MediaRecorder.isTypeSupported('audio/aac')) {
                    options = { mimeType: 'audio/aac' };
                }
            }

            const mediaRecorder = new MediaRecorder(stream, options);
            mediaRecorderRef.current = mediaRecorder;
            audioChunksRef.current = [];
            isRecordingAudioRef.current = true;

            mediaRecorder.ondataavailable = (e) => {
                if (e.data && e.data.size > 0) {
                    audioChunksRef.current.push(e.data);
                }
            };

            mediaRecorder.onstop = async () => {
                isRecordingAudioRef.current = false;
                try {
                    stream.getTracks().forEach(track => track.stop());
                } catch (e) {}

                if (audioChunksRef.current.length === 0) {
                    setStatus('idle');
                    return;
                }

                const audioType = mediaRecorder.mimeType || options.mimeType || 'audio/mp4';
                const recordedBlob = new Blob(audioChunksRef.current, { type: audioType });

                if (recordedBlob.size < 500) {
                    toast('No speech detected. Please speak clearly.', { icon: '🎙️' });
                    setStatus('idle');
                    return;
                }

                setStatus('processing');
                setTranscript('Listening completed. Executing command...');
                playChime('success');

                const reader = new FileReader();
                reader.readAsDataURL(recordedBlob);
                reader.onloadend = async () => {
                    const base64Audio = reader.result;
                    await handleAudioCommandSubmit(base64Audio, audioType);
                };
            };

            mediaRecorder.start(250);
            setStatus('listening');
            setIsOpen(true);
            setMicBlocked(false);
            setInterimText('🎙️ Listening... Bolne ke baad "Done" dabayein.');
            playChime('start');
        } catch (err) {
            console.error('[Jarvis] Failed to start direct audio recording:', err);
            toast.error('Microphone blocked. Please allow microphone in browser.', { duration: 5000 });
            setMicBlocked(true);
            setStatus('idle');
        }
    };

    // Submit base64 voice audio to backend for Gemini AI multimodal transcription & execution
    const handleAudioCommandSubmit = async (base64Audio, mimeType) => {
        setStatus('processing');
        setInputText('');

        try {
            const response = await jarvisAPI.sendCommand({
                audio: base64Audio,
                mimeType: mimeType || 'audio/mp4',
                inputType: 'audio',
                source: 'web'
            });

            if (response?.success) {
                setTranscript(response.transcript || 'Voice command executed');
                setSpeechResponse(response.speechResponse);
                setDisplayData(response.displayData);

                if (response.requiresConfirmation && response.pendingAction) {
                    setPendingAction({
                        actionId: response.actionId,
                        ...response.pendingAction
                    });
                } else {
                    setPendingAction(null);
                }

                speakVoice(response.speechResponse, response.audioBase64);

                if (response.action === 'navigate' && response.targetUrl) {
                    toast.success(`JARVIS: Navigating to ${response.displayData?.page || 'page'}`, {
                        icon: '🚀',
                        style: { background: '#0f172a', color: '#38bdf8', border: '1px solid #0284c7' }
                    });
                    setTimeout(() => {
                        navigate(response.targetUrl);
                    }, 600);
                }
            } else {
                setSpeechResponse(response?.speechResponse || "Sir, command execute nahi ho paayi.");
                speakVoice(response?.speechResponse || "Sir, command execute nahi ho paayi.", response?.audioBase64);
                setStatus('idle');
            }
        } catch (error) {
            console.error('[Jarvis] Audio command error:', error);
            const serverSpeech = error.response?.data?.speechResponse || error.response?.data?.message;
            const isTimeout = error.code === 'ECONNABORTED' || (error.message && error.message.includes('timeout'));
            const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;

            let fallbackMsg = "Sir, connection me thodi issue aayi. Kripya dubara boliye.";
            if (serverSpeech) {
                fallbackMsg = serverSpeech;
            } else if (isOffline) {
                fallbackMsg = "Sir, internet offline lag raha hai. Kripya connection check kijiye.";
            } else if (isTimeout) {
                fallbackMsg = "Sir, response aane me waqt lag raha hai. Kripya dobara try kijiye.";
            }

            setSpeechResponse(fallbackMsg);
            speakVoice(fallbackMsg);
            setStatus('idle');
        }
    };

    // 🎙️ Dynamic Fresh Speech Recognition Starter (Streaming text)
    const startListening = () => {
        stopSpeaking();

        if (recognitionRef.current) {
            try { recognitionRef.current.abort(); } catch (e) {}
            recognitionRef.current = null;
        }

        const SpeechRecognition = typeof window !== 'undefined' ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null;
        if (!SpeechRecognition) {
            startDirectRecording();
            return;
        }

        // Activate HUD and reset buffers immediately
        setIsOpen(true);
        setStatus('listening');
        setInterimText('');
        setTranscript('');
        accumulatedTextRef.current = '';
        hasSubmittedRef.current = false;

        try {
            const recognition = new SpeechRecognition();
            recognition.continuous = false;
            recognition.interimResults = true;
            recognition.maxAlternatives = 1;
            recognition.lang = langMode;

            recognition.onstart = () => {
                setStatus('listening');
                playChime('start');
            };

            recognition.onresult = (event) => {
                let currentInterim = '';
                let finalTranscript = '';

                for (let i = event.resultIndex; i < event.results.length; i++) {
                    const res = event.results[i];
                    if (res.isFinal) {
                        finalTranscript += res[0].transcript;
                    } else {
                        currentInterim += res[0].transcript;
                    }
                }

                const liveText = (finalTranscript || currentInterim).trim();
                if (liveText) {
                    accumulatedTextRef.current = liveText;
                    setInterimText(liveText);
                }

                if (finalTranscript && !hasSubmittedRef.current) {
                    hasSubmittedRef.current = true;
                    setTranscript(finalTranscript);
                    setInterimText('');
                    try { recognition.stop(); } catch (e) {}
                    playChime('success');
                    handleCommandSubmitRef.current?.(finalTranscript);
                }
            };

            recognition.onerror = (event) => {
                console.warn('[Jarvis] Speech recognition event:', event.error);
                if (event.error === 'service-not-allowed' || event.error === 'not-allowed') {
                    // Seamless automatic fallback to Direct Hardware Audio Recording!
                    console.info('[Jarvis] Speech recognition unavailable. Falling back to Direct Audio Recording...');
                    startDirectRecording();
                    return;
                } else if (event.error === 'audio-capture') {
                    toast.error('No microphone hardware detected or mic is in use by another application.', { duration: 5000 });
                    setStatus('idle');
                } else if (event.error === 'no-speech') {
                    if (accumulatedTextRef.current && !hasSubmittedRef.current) {
                        hasSubmittedRef.current = true;
                        playChime('success');
                        handleCommandSubmitRef.current?.(accumulatedTextRef.current);
                    } else {
                        toast('No speech detected. Click the mic again or type your command below.', { icon: '🎙️' });
                        setStatus('idle');
                    }
                } else if (event.error === 'network') {
                    startDirectRecording();
                } else {
                    setStatus('idle');
                }
            };

            recognition.onend = () => {
                if (accumulatedTextRef.current && !hasSubmittedRef.current) {
                    hasSubmittedRef.current = true;
                    setTranscript(accumulatedTextRef.current);
                    setInterimText('');
                    playChime('success');
                    handleCommandSubmitRef.current?.(accumulatedTextRef.current);
                } else {
                    setStatus(prev => prev === 'listening' ? 'idle' : prev);
                }
            };

            recognitionRef.current = recognition;
            recognition.start();
        } catch (err) {
            console.error('[Jarvis] Failed to start recognition, falling back to direct recording:', err);
            startDirectRecording();
        }
    };

    // Stop Listening & Submit whatever was captured (Both modes)
    const stopListening = () => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
            try { mediaRecorderRef.current.stop(); } catch (e) {}
            mediaRecorderRef.current = null;
            return;
        }

        if (recognitionRef.current) {
            try { recognitionRef.current.abort(); } catch (e) {}
            recognitionRef.current = null;
        }

        if (accumulatedTextRef.current && !hasSubmittedRef.current) {
            hasSubmittedRef.current = true;
            playChime('success');
            handleCommandSubmitRef.current?.(accumulatedTextRef.current);
        } else {
            setStatus('idle');
        }
    };

    // Toggle Listening
    const toggleListening = () => {
        if (status === 'speaking') {
            stopSpeaking();
            return;
        }

        if (status === 'listening') {
            stopListening();
            return;
        }

        // On Safari on Mac/iOS: Apple Web Speech engine frequently fails on cloud/localhost.
        // Direct Hardware Recording with Gemini Multimodal AI ensures 100% reliable voice commands!
        if (isSafari) {
            startDirectRecording();
            return;
        }

        // On Chrome / Edge: Native streaming Speech Recognition (with direct recording auto-fallback)
        startListening();
    };

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            stopSpeaking();
            if (recognitionRef.current) {
                try { recognitionRef.current.abort(); } catch (e) {}
            }
            if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
                try { mediaRecorderRef.current.stop(); } catch (e) {}
            }
            if (mediaStreamRef.current) {
                try { mediaStreamRef.current.getTracks().forEach(t => t.stop()); } catch (e) {}
            }
            if (synthRef.current) {
                try { synthRef.current.cancel(); } catch (e) {}
            }
        };
    }, []);

    // Submit command to backend Jarvis API
    const handleCommandSubmit = async (commandText) => {
        const text = (commandText || inputText).trim();
        if (!text) return;

        setStatus('processing');
        setTranscript(text);
        setInputText('');

        try {
            const response = await jarvisAPI.sendCommand({
                transcript: text,
                inputType: commandText ? 'voice' : 'text',
                source: 'web'
            });

            if (response?.success) {
                setSpeechResponse(response.speechResponse);
                setDisplayData(response.displayData);

                // Check for Tier 2 confirmation requirement
                if (response.requiresConfirmation && response.pendingAction) {
                    setPendingAction({
                        actionId: response.actionId,
                        ...response.pendingAction
                    });
                } else {
                    setPendingAction(null);
                }

                // Speak reply with studio audio if available
                speakVoice(response.speechResponse, response.audioBase64);

                // Handle navigation action
                if (response.action === 'navigate' && response.targetUrl) {
                    toast.success(`JARVIS: Navigating to ${response.displayData?.page || 'page'}`, {
                        icon: '🚀',
                        style: { background: '#0f172a', color: '#38bdf8', border: '1px solid #0284c7' }
                    });
                    setTimeout(() => {
                        navigate(response.targetUrl);
                    }, 600);
                }
            } else {
                setSpeechResponse(response?.speechResponse || "Sir, command execute nahi ho paayi.");
                speakVoice(response?.speechResponse || "Sir, command execute nahi ho paayi.", response?.audioBase64);
                setStatus('idle');
            }
        } catch (error) {
            console.error('[Jarvis] Command error:', error);
            const serverSpeech = error.response?.data?.speechResponse || error.response?.data?.message;
            const isTimeout = error.code === 'ECONNABORTED' || (error.message && error.message.includes('timeout'));
            const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;

            let fallbackMsg = "Sir, connection me thodi issue aayi. Kripya dubara boliye.";
            if (serverSpeech) {
                fallbackMsg = serverSpeech;
            } else if (isOffline) {
                fallbackMsg = "Sir, internet offline lag raha hai. Kripya connection check kijiye.";
            } else if (isTimeout) {
                fallbackMsg = "Sir, response aane me waqt lag raha hai. Kripya dobara try kijiye.";
            }

            setSpeechResponse(fallbackMsg);
            speakVoice(fallbackMsg);
            setStatus('idle');
        }
    };
    handleCommandSubmitRef.current = handleCommandSubmit;

    // Confirm Tier 2 Action
    const handleConfirmAction = async (actionId) => {
        setStatus('processing');
        try {
            const res = await jarvisAPI.confirmAction(actionId);
            if (res?.success) {
                setSpeechResponse(res.speechResponse);
                setPendingAction(null);
                speakVoice(res.speechResponse, res.audioBase64);
                toast.success('JARVIS: Action Executed Successfully', {
                    icon: '✅',
                    style: { background: '#0f172a', color: '#10b981', border: '1px solid #059669' }
                });
            } else {
                setSpeechResponse(res?.speechResponse || 'Error executing action');
                speakVoice(res?.speechResponse || 'Error executing action', res?.audioBase64);
            }
        } catch (e) {
            toast.error('Failed to confirm action');
        } finally {
            setStatus('idle');
        }
    };

    // Cancel Tier 2 Action
    const handleCancelAction = async (actionId) => {
        setStatus('processing');
        try {
            const res = await jarvisAPI.cancelAction(actionId);
            setSpeechResponse(res?.speechResponse || 'Action cancelled.');
            setPendingAction(null);
            speakVoice(res?.speechResponse || 'Action cancelled.', res?.audioBase64);
            toast('JARVIS: Action Cancelled', { icon: '🚫' });
        } catch (e) {
            toast.error('Failed to cancel action');
        } finally {
            setStatus('idle');
        }
    };

    const handleFormSubmit = (e) => {
        e.preventDefault();
        handleCommandSubmit();
    };

    const handleProcessCallIntelSubmit = async (e) => {
        if (e) e.preventDefault();
        if (!callNotes.trim()) {
            toast.error('Please enter conversation notes or transcript');
            return;
        }

        setIsAnalyzingCall(true);
        setStatus('processing');
        speakVoice("Sir, call details analyze kar raha hoon...");

        try {
            const res = await jarvisAPI.processCallIntel({
                clientPhone: callPhone.trim() || undefined,
                transcript: callNotes.trim(),
                callType: 'INCOMING',
                source: 'web'
            });

            if (res.success) {
                setDisplayData({
                    type: 'call_intelligence',
                    ...res
                });
                setSpeechResponse(res.speechResponse);
                speakVoice(res.speechResponse, res.audioBase64);
                toast.success('Call Intelligence processed & synchronized!', {
                    icon: '🚀',
                    style: { background: '#0f172a', color: '#38bdf8', border: '1px solid #0284c7' }
                });
                setCallNotes('');
                setCallPhone('');
                setActiveTab('assistant');
            } else {
                toast.error(res.message || 'Call Intelligence processing failed');
            }
        } catch (err) {
            console.error('[Jarvis] Call Intel error:', err);
            toast.error('Failed to process call intelligence');
        } finally {
            setIsAnalyzingCall(false);
            setStatus('idle');
        }
    };

    const loadDailyBriefing = async () => {
        setIsLoadingBriefing(true);
        try {
            const res = await jarvisAPI.getBriefing();
            if (res?.success) {
                setBriefingData(res);
            } else {
                toast.error(res?.message || 'Failed to load briefing');
            }
        } catch (err) {
            console.error('[Jarvis] Error loading briefing:', err);
            toast.error('Failed to load daily briefing');
        } finally {
            setIsLoadingBriefing(false);
        }
    };

    useEffect(() => {
        if (activeTab === 'briefing' && !briefingData && !isLoadingBriefing) {
            loadDailyBriefing();
        }
    }, [activeTab]);

    return (
        <>
            {/* 🌟 HUD POPUP PANEL */}
            {isOpen && (
                <div style={{
                    position: 'fixed',
                    bottom: '96px',
                    right: '28px',
                    width: '410px',
                    maxWidth: 'calc(100vw - 40px)',
                    maxHeight: '560px',
                    background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.96), rgba(8, 47, 73, 0.94))',
                    backdropFilter: 'blur(20px)',
                    WebkitBackdropFilter: 'blur(20px)',
                    border: '1px solid rgba(56, 189, 248, 0.35)',
                    borderRadius: '20px',
                    boxShadow: '0 20px 50px rgba(0, 0, 0, 0.6), 0 0 30px rgba(56, 189, 248, 0.25)',
                    zIndex: 99998,
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden',
                    animation: 'jarvisFadeIn 0.25s cubic-bezier(0.16, 1, 0.3, 1)'
                }}>
                    {/* Header */}
                    <div style={{
                        padding: '16px 20px',
                        borderBottom: '1px solid rgba(56, 189, 248, 0.2)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        background: 'rgba(2, 6, 23, 0.4)'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <div style={{
                                width: '10px',
                                height: '10px',
                                borderRadius: '50%',
                                background: status === 'listening' ? '#ef4444' : status === 'processing' ? '#f59e0b' : '#38bdf8',
                                boxShadow: `0 0 10px ${status === 'listening' ? '#ef4444' : status === 'processing' ? '#f59e0b' : '#38bdf8'}`
                            }}></div>
                            <div>
                                <div style={{ fontSize: '0.85rem', fontWeight: 800, color: '#f8fafc', letterSpacing: '1px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    JARVIS <span style={{ fontSize: '0.65rem', padding: '2px 6px', borderRadius: '4px', background: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8', border: '1px solid rgba(56, 189, 248, 0.3)' }}>AI OS 2.0</span>
                                </div>
                                <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>
                                    {status === 'listening' ? '🎙️ Listening to you...' :
                                     status === 'processing' ? '⚡ Processing command...' :
                                     status === 'speaking' ? '🔊 Speaking...' : 'Ready for voice command'}
                                </div>
                            </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            {/* Voice Language Mode Toggle */}
                            <button
                                type="button"
                                onClick={() => {
                                    const nextLang = langMode === 'en-IN' ? 'hi-IN' : 'en-IN';
                                    setLangMode(nextLang);
                                    toast(`Voice Language: ${nextLang === 'en-IN' ? '🇮🇳 Hinglish / English' : '🇮🇳 Pure Hindi'}`, { icon: '🌐' });
                                }}
                                title="Toggle Speech Language (Hinglish/English or Hindi)"
                                style={{
                                    background: 'rgba(56, 189, 248, 0.1)',
                                    border: '1px solid rgba(56, 189, 248, 0.3)',
                                    color: '#38bdf8',
                                    padding: '4px 8px',
                                    borderRadius: '8px',
                                    cursor: 'pointer',
                                    fontSize: '0.68rem',
                                    fontWeight: 700,
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '4px'
                                }}
                            >
                                <i className="fas fa-globe-asia" style={{ fontSize: '0.7rem' }}></i>
                                {langMode === 'en-IN' ? 'Hinglish' : 'हिंदी'}
                            </button>

                            <button
                                onClick={() => {
                                    setIsMuted(!isMuted);
                                    if (!isMuted) synthRef.current?.cancel();
                                }}
                                title={isMuted ? "Unmute Voice" : "Mute Voice"}
                                style={{
                                    background: isMuted ? 'rgba(239, 68, 68, 0.2)' : 'rgba(56, 189, 248, 0.1)',
                                    border: `1px solid ${isMuted ? 'rgba(239, 68, 68, 0.4)' : 'rgba(56, 189, 248, 0.2)'}`,
                                    color: isMuted ? '#ef4444' : '#38bdf8',
                                    width: '32px',
                                    height: '32px',
                                    borderRadius: '8px',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center'
                                }}
                            >
                                <i className={`fas ${isMuted ? 'fa-volume-mute' : 'fa-volume-up'}`} style={{ fontSize: '0.8rem' }}></i>
                            </button>
                            <button
                                onClick={() => setIsOpen(false)}
                                style={{
                                    background: 'rgba(255, 255, 255, 0.05)',
                                    border: 'none',
                                    color: '#94a3b8',
                                    width: '32px',
                                    height: '32px',
                                    borderRadius: '8px',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center'
                                }}
                            >
                                <i className="fas fa-times" style={{ fontSize: '0.85rem' }}></i>
                            </button>
                        </div>
                    </div>

                    {/* Navigation Mode Tabs */}
                    <div style={{
                        display: 'flex',
                        padding: '6px 14px',
                        background: 'rgba(2, 6, 23, 0.6)',
                        borderBottom: '1px solid rgba(56, 189, 248, 0.15)',
                        gap: '6px'
                    }}>
                        <button
                            type="button"
                            onClick={() => setActiveTab('assistant')}
                            style={{
                                flex: 1,
                                padding: '6px 8px',
                                borderRadius: '8px',
                                background: activeTab === 'assistant' ? 'rgba(56, 189, 248, 0.2)' : 'transparent',
                                border: activeTab === 'assistant' ? '1px solid rgba(56, 189, 248, 0.4)' : '1px solid transparent',
                                color: activeTab === 'assistant' ? '#38bdf8' : '#94a3b8',
                                fontSize: '0.7rem',
                                fontWeight: 700,
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '5px',
                                transition: 'all 0.15s'
                            }}
                        >
                            <i className="fas fa-microphone"></i> Assistant
                        </button>
                        <button
                            type="button"
                            onClick={() => setActiveTab('briefing')}
                            style={{
                                flex: 1,
                                padding: '6px 8px',
                                borderRadius: '8px',
                                background: activeTab === 'briefing' ? 'rgba(56, 189, 248, 0.2)' : 'transparent',
                                border: activeTab === 'briefing' ? '1px solid rgba(56, 189, 248, 0.4)' : '1px solid transparent',
                                color: activeTab === 'briefing' ? '#38bdf8' : '#94a3b8',
                                fontSize: '0.7rem',
                                fontWeight: 700,
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '5px',
                                transition: 'all 0.15s'
                            }}
                        >
                            <i className="fas fa-sun"></i> Briefing
                        </button>
                        <button
                            type="button"
                            onClick={() => setActiveTab('call_intel')}
                            style={{
                                flex: 1,
                                padding: '6px 8px',
                                borderRadius: '8px',
                                background: activeTab === 'call_intel' ? 'rgba(56, 189, 248, 0.2)' : 'transparent',
                                border: activeTab === 'call_intel' ? '1px solid rgba(56, 189, 248, 0.4)' : '1px solid transparent',
                                color: activeTab === 'call_intel' ? '#38bdf8' : '#94a3b8',
                                fontSize: '0.7rem',
                                fontWeight: 700,
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '5px',
                                transition: 'all 0.15s'
                            }}
                        >
                            <i className="fas fa-phone-volume"></i> Call Intel
                        </button>
                    </div>

                    {/* Content Scrollable Area */}
                    <div style={{
                        padding: '16px 20px',
                        overflowY: 'auto',
                        flex: 1,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '14px'
                    }}>
                        {activeTab === 'briefing' ? (
                            /* ☀️ EXECUTIVE DAILY BRIEFING TAB */
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <div style={{ fontSize: '0.8rem', fontWeight: 800, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <span>☀️</span> EXECUTIVE DAILY BRIEFING
                                    </div>
                                    <div style={{ display: 'flex', gap: '6px' }}>
                                        <button
                                            type="button"
                                            onClick={() => loadDailyBriefing()}
                                            disabled={isLoadingBriefing}
                                            title="Refresh Briefing"
                                            style={{
                                                padding: '4px 8px',
                                                borderRadius: '6px',
                                                background: 'rgba(255, 255, 255, 0.08)',
                                                border: '1px solid rgba(255, 255, 255, 0.15)',
                                                color: '#cbd5e1',
                                                fontSize: '0.7rem',
                                                cursor: 'pointer'
                                            }}
                                        >
                                            <i className={`fas fa-sync-alt ${isLoadingBriefing ? 'fa-spin' : ''}`}></i>
                                        </button>
                                        {briefingData?.speechResponse && (
                                            <button
                                                type="button"
                                                onClick={() => speakVoice(briefingData.speechResponse, briefingData.audioBase64)}
                                                style={{
                                                    padding: '4px 8px',
                                                    borderRadius: '6px',
                                                    background: 'rgba(56, 189, 248, 0.2)',
                                                    border: '1px solid rgba(56, 189, 248, 0.4)',
                                                    color: '#38bdf8',
                                                    fontSize: '0.7rem',
                                                    fontWeight: 700,
                                                    cursor: 'pointer',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '4px'
                                                }}
                                            >
                                                <i className="fas fa-volume-up"></i> Listen
                                            </button>
                                        )}
                                    </div>
                                </div>

                                {isLoadingBriefing ? (
                                    <div style={{ textAlign: 'center', padding: '30px 0', color: '#94a3b8' }}>
                                        <i className="fas fa-circle-notch fa-spin fa-2x" style={{ color: '#38bdf8', marginBottom: '10px' }}></i>
                                        <div style={{ fontSize: '0.8rem' }}>Synthesizing schedule & pipeline intelligence...</div>
                                    </div>
                                ) : briefingData?.briefing ? (
                                    <>
                                        {/* Briefing Speech Summary Quote */}
                                        <div style={{
                                            padding: '12px 14px',
                                            borderRadius: '12px',
                                            background: 'linear-gradient(135deg, rgba(8, 47, 73, 0.8), rgba(15, 23, 42, 0.9))',
                                            border: '1px solid rgba(56, 189, 248, 0.3)',
                                            fontSize: '0.82rem',
                                            color: '#f8fafc',
                                            lineHeight: '1.45'
                                        }}>
                                            {briefingData.speechResponse}
                                        </div>

                                        {/* Quick 4-box metrics */}
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
                                            <div style={{ padding: '10px', borderRadius: '10px', background: 'rgba(56, 189, 248, 0.1)', border: '1px solid rgba(56, 189, 248, 0.25)' }}>
                                                <div style={{ fontSize: '0.65rem', color: '#38bdf8', fontWeight: 700 }}>TODAY'S SCHEDULE</div>
                                                <div style={{ fontSize: '1.2rem', fontWeight: 900, color: '#fff', marginTop: '2px' }}>
                                                    {briefingData.briefing.stats?.todayActivitiesCount || 0}
                                                </div>
                                            </div>
                                            <div style={{ padding: '10px', borderRadius: '10px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.25)' }}>
                                                <div style={{ fontSize: '0.65rem', color: '#f87171', fontWeight: 700 }}>OVERDUE TASKS</div>
                                                <div style={{ fontSize: '1.2rem', fontWeight: 900, color: '#fff', marginTop: '2px' }}>
                                                    {briefingData.briefing.stats?.overdueCount || 0}
                                                </div>
                                            </div>
                                            <div style={{ padding: '10px', borderRadius: '10px', background: 'rgba(244, 63, 94, 0.1)', border: '1px solid rgba(244, 63, 94, 0.25)' }}>
                                                <div style={{ fontSize: '0.65rem', color: '#fb7185', fontWeight: 700 }}>HOT PROSPECTS</div>
                                                <div style={{ fontSize: '1.2rem', fontWeight: 900, color: '#fff', marginTop: '2px' }}>
                                                    {briefingData.briefing.stats?.hotProspectsCount || 0}
                                                </div>
                                            </div>
                                            <div style={{ padding: '10px', borderRadius: '10px', background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.25)' }}>
                                                <div style={{ fontSize: '0.65rem', color: '#34d399', fontWeight: 700 }}>ACTIVE DEALS</div>
                                                <div style={{ fontSize: '1.2rem', fontWeight: 900, color: '#fff', marginTop: '2px' }}>
                                                    {briefingData.briefing.stats?.activeDealsCount || 0}
                                                </div>
                                            </div>
                                        </div>

                                        {/* Today's Activities List */}
                                        <div>
                                            <div style={{ fontSize: '0.7rem', color: '#38bdf8', fontWeight: 800, marginBottom: '6px', letterSpacing: '0.5px' }}>
                                                TODAY'S VISITS & MEETINGS ({briefingData.briefing.todayActivities?.length || 0})
                                            </div>
                                            {briefingData.briefing.todayActivities?.length > 0 ? (
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                                    {briefingData.briefing.todayActivities.map((act, i) => (
                                                        <div key={i} style={{
                                                            padding: '8px 10px',
                                                            borderRadius: '8px',
                                                            background: 'rgba(255, 255, 255, 0.04)',
                                                            border: '1px solid rgba(56, 189, 248, 0.2)',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            justifyContent: 'space-between'
                                                        }}>
                                                            <div>
                                                                <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#f8fafc' }}>
                                                                    {act.type === 'Site Visit' ? '🏡' : act.type === 'Call' ? '📞' : '📅'} {act.title || act.type}
                                                                </div>
                                                                <div style={{ fontSize: '0.68rem', color: '#94a3b8' }}>
                                                                    {act.time || 'Today'} {act.leadName ? `• ${act.leadName}` : ''}
                                                                </div>
                                                            </div>
                                                            <span style={{
                                                                fontSize: '0.65rem',
                                                                padding: '2px 6px',
                                                                borderRadius: '4px',
                                                                background: act.status === 'Completed' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(245, 158, 11, 0.2)',
                                                                color: act.status === 'Completed' ? '#34d399' : '#fbbf24'
                                                            }}>
                                                                {act.status}
                                                            </span>
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : (
                                                <div style={{ fontSize: '0.72rem', color: '#64748b', fontStyle: 'italic', padding: '6px 0' }}>
                                                    No scheduled meetings or visits for today.
                                                </div>
                                            )}
                                        </div>

                                        {/* Overdue alert items if any */}
                                        {briefingData.briefing.overdueActivities?.length > 0 && (
                                            <div style={{
                                                padding: '10px 12px',
                                                borderRadius: '10px',
                                                background: 'rgba(239, 68, 68, 0.1)',
                                                border: '1px solid rgba(239, 68, 68, 0.3)'
                                            }}>
                                                <div style={{ fontSize: '0.7rem', color: '#f87171', fontWeight: 800, marginBottom: '4px' }}>
                                                    ⚠️ OVERDUE ACTION ITEMS ({briefingData.briefing.overdueActivities.length})
                                                </div>
                                                {briefingData.briefing.overdueActivities.slice(0, 3).map((act, i) => (
                                                    <div key={i} style={{ fontSize: '0.72rem', color: '#cbd5e1', marginTop: '2px' }}>
                                                        • {act.title} ({act.dueDate ? new Date(act.dueDate).toLocaleDateString('en-IN') : 'Past due'})
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </>
                                ) : (
                                    <div style={{ textAlign: 'center', padding: '20px 0' }}>
                                        <button
                                            type="button"
                                            onClick={loadDailyBriefing}
                                            style={{
                                                padding: '10px 18px',
                                                borderRadius: '8px',
                                                background: 'linear-gradient(135deg, #0284c7, #0369a1)',
                                                color: '#fff',
                                                border: 'none',
                                                fontWeight: 700,
                                                fontSize: '0.8rem',
                                                cursor: 'pointer'
                                            }}
                                        >
                                            Generate Daily Briefing
                                        </button>
                                    </div>
                                )}
                            </div>
                        ) : activeTab === 'call_intel' ? (
                            /* 📞 CALL INTELLIGENCE ANALYZER TAB */
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                <div style={{ fontSize: '0.78rem', color: '#94a3b8', lineHeight: '1.4' }}>
                                    Dictate, type or paste a client conversation. JARVIS automatically extracts requirement, budget, location, intent score, and schedules follow-up visits into CRM.
                                </div>

                                <div>
                                    <label style={{ display: 'block', fontSize: '0.7rem', color: '#38bdf8', fontWeight: 800, marginBottom: '4px', letterSpacing: '0.5px' }}>
                                        CLIENT PHONE (OPTIONAL - AUTO EXTRACTED IF IN NOTES)
                                    </label>
                                    <input
                                        type="text"
                                        value={callPhone}
                                        onChange={(e) => setCallPhone(e.target.value)}
                                        placeholder="e.g. 9812345678"
                                        style={{
                                            width: '100%',
                                            padding: '9px 12px',
                                            borderRadius: '8px',
                                            background: 'rgba(255, 255, 255, 0.06)',
                                            border: '1px solid rgba(56, 189, 248, 0.25)',
                                            color: '#fff',
                                            fontSize: '0.82rem',
                                            outline: 'none',
                                            boxSizing: 'border-box'
                                        }}
                                    />
                                </div>

                                <div>
                                    <label style={{ display: 'block', fontSize: '0.7rem', color: '#38bdf8', fontWeight: 800, marginBottom: '4px', letterSpacing: '0.5px' }}>
                                        CALL CONVERSATION / TRANSCRIPT
                                    </label>
                                    <textarea
                                        rows={6}
                                        value={callNotes}
                                        onChange={(e) => setCallNotes(e.target.value)}
                                        placeholder="e.g. Vikas Sharma ji se baat hui. Sector 68 Mohali me 3BHK flat chahiye budget 85L-1Cr. Wednesday shaam 4 baje site visit fix kardi..."
                                        style={{
                                            width: '100%',
                                            padding: '10px 12px',
                                            borderRadius: '8px',
                                            background: 'rgba(255, 255, 255, 0.06)',
                                            border: '1px solid rgba(56, 189, 248, 0.25)',
                                            color: '#fff',
                                            fontSize: '0.82rem',
                                            outline: 'none',
                                            resize: 'none',
                                            boxSizing: 'border-box',
                                            lineHeight: '1.45'
                                        }}
                                    />
                                </div>

                                <button
                                    type="button"
                                    onClick={handleProcessCallIntelSubmit}
                                    disabled={isAnalyzingCall}
                                    style={{
                                        padding: '12px',
                                        borderRadius: '10px',
                                        background: 'linear-gradient(135deg, #0284c7, #0369a1)',
                                        color: '#fff',
                                        border: 'none',
                                        fontWeight: 800,
                                        fontSize: '0.84rem',
                                        cursor: isAnalyzingCall ? 'not-allowed' : 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        gap: '8px',
                                        boxShadow: '0 4px 15px rgba(2, 132, 199, 0.4)',
                                        opacity: isAnalyzingCall ? 0.7 : 1
                                    }}
                                >
                                    {isAnalyzingCall ? (
                                        <>
                                            <i className="fas fa-spinner fa-spin"></i> Processing with JARVIS Engine...
                                        </>
                                    ) : (
                                        <>
                                            <i className="fas fa-bolt"></i> Extract Intelligence & Sync CRM
                                        </>
                                    )}
                                </button>
                            </div>
                        ) : (
                            /* 🎙️ ASSISTANT HUD VIEW */
                            <>
                                {/* ⚠️ MICROPHONE PERMISSION BLOCKED GUIDE */}
                                {micBlocked && (
                                    <div style={{
                                        padding: '14px 16px',
                                        borderRadius: '14px',
                                        background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.18), rgba(185, 28, 28, 0.28))',
                                        border: '1.5px solid rgba(239, 68, 68, 0.5)',
                                        boxShadow: '0 8px 25px rgba(239, 68, 68, 0.25)',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: '10px',
                                        animation: 'jarvisFadeIn 0.25s ease-out'
                                    }}>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <i className="fas fa-microphone-slash" style={{ color: '#ef4444', fontSize: '1.1rem' }}></i>
                                                <div>
                                                    <div style={{ fontSize: '0.82rem', fontWeight: 800, color: '#fecaca', letterSpacing: '0.5px' }}>
                                                        MICROPHONE ACCESS IS BLOCKED
                                                    </div>
                                                    <div style={{ fontSize: '0.68rem', color: '#fca5a5' }}>
                                                        Browser me mic permission allow karne ke 2 easy steps:
                                                    </div>
                                                </div>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => setMicBlocked(false)}
                                                style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '0.85rem' }}
                                            >
                                                <i className="fas fa-times"></i>
                                            </button>
                                        </div>

                                        <div style={{
                                            background: 'rgba(0, 0, 0, 0.35)',
                                            padding: '10px 14px',
                                            borderRadius: '8px',
                                            fontSize: '0.74rem',
                                            color: '#f8fafc',
                                            lineHeight: '1.55',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            gap: '6px'
                                        }}>
                                            {isSafari ? (
                                                <>
                                                    <div>
                                                        <strong>🍎 Safari on Mac:</strong> Safari Apple Speech engine ko unverified <code>http://localhost</code> par block karta hai (Siri server timeout).
                                                    </div>
                                                    <div>
                                                        <strong>⚡ Instant Fix (Recommended):</strong> CRM ko <strong>Google Chrome</strong> me open karein (aapke Mac Dock me 3rd icon hai). Chrome me voice bina kisi setting ke 100% smoothly chalti hai!
                                                    </div>
                                                    <div>
                                                        <strong>⌨️ Direct Typing:</strong> Ya fir aap neeche diye gaye box me seedha type karke bhi command bhej sakte hain.
                                                    </div>
                                                </>
                                            ) : (
                                                <>
                                                    <div>
                                                        <strong>1. URL Address Bar:</strong> Browser me URL ke left me <strong>Tune / Lock (🔒)</strong> icon par click karein.
                                                    </div>
                                                    <div>
                                                        <strong>2. Toggle Allow:</strong> <strong>Microphone</strong> ko <em>Block</em> se badal kar <strong>Allow (ON)</strong> karein.
                                                    </div>
                                                    <div>
                                                        <strong>3. Mac OS check:</strong> <em>System Settings &gt; Privacy &amp; Security &gt; Microphone &gt; Google Chrome</em> [ON] rakhein.
                                                    </div>
                                                </>
                                            )}
                                        </div>

                                        <div style={{ display: 'flex', gap: '8px' }}>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setMicBlocked(false);
                                                    startListening();
                                                }}
                                                style={{
                                                    flex: 1,
                                                    padding: '7px 10px',
                                                    borderRadius: '8px',
                                                    background: 'linear-gradient(135deg, #0284c7, #0369a1)',
                                                    border: 'none',
                                                    color: '#fff',
                                                    fontSize: '0.74rem',
                                                    fontWeight: 700,
                                                    cursor: 'pointer',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    gap: '5px'
                                                }}
                                            >
                                                <i className="fas fa-redo"></i> Try Mic Again
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    const inputEl = document.querySelector('input[placeholder*="Speak command"]');
                                                    if (inputEl) inputEl.focus();
                                                }}
                                                style={{
                                                    padding: '7px 12px',
                                                    borderRadius: '8px',
                                                    background: 'rgba(255, 255, 255, 0.08)',
                                                    border: '1px solid rgba(255, 255, 255, 0.2)',
                                                    color: '#e2e8f0',
                                                    fontSize: '0.74rem',
                                                    fontWeight: 600,
                                                    cursor: 'pointer'
                                                }}
                                            >
                                                ⌨️ Type Instead
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {/* 🔴 LIVE AUDIO WAVE EQUALIZER WHEN LISTENING */}
                                {status === 'listening' && (
                                    <div style={{
                                        padding: '14px 16px',
                                        borderRadius: '14px',
                                        background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.15), rgba(185, 28, 28, 0.2))',
                                        border: '1.5px solid rgba(239, 68, 68, 0.45)',
                                        boxShadow: '0 4px 20px rgba(239, 68, 68, 0.25)',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        alignItems: 'center',
                                        gap: '10px',
                                        animation: 'jarvisFadeIn 0.2s ease-out'
                                    }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <span style={{
                                                width: '8px',
                                                height: '8px',
                                                borderRadius: '50%',
                                                background: '#ef4444',
                                                boxShadow: '0 0 10px #ef4444',
                                                animation: 'jarvisPulseMic 0.8s infinite'
                                            }}></span>
                                            <span style={{ fontSize: '0.8rem', fontWeight: 800, color: '#fca5a5', letterSpacing: '0.5px' }}>
                                                LISTENING NOW... SPEAK CLEARLY
                                            </span>
                                        </div>

                                        {/* Animated equalizer waves */}
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', height: '26px' }}>
                                            {[14, 26, 12, 30, 18, 34, 16, 28, 14, 24, 10].map((h, i) => (
                                                <div
                                                    key={i}
                                                    style={{
                                                        width: '3.5px',
                                                        height: `${h}px`,
                                                        background: '#ef4444',
                                                        borderRadius: '3px',
                                                        animation: `jarvisWave 0.7s ease-in-out infinite alternate ${i * 0.08}s`
                                                    }}
                                                />
                                            ))}
                                        </div>

                                        <div style={{ fontSize: '0.72rem', color: '#fecaca', textAlign: 'center' }}>
                                            {interimText ? `"${interimText}"` : 'Aap Hindi ya English me command bol sakte hain (e.g. "Daily briefing batao")'}
                                        </div>
                                    </div>
                                )}

                                {/* Live Transcript / Input */}
                                {(transcript || interimText) && (
                                    <div style={{
                                        padding: '12px 14px',
                                        borderRadius: '12px',
                                        background: 'rgba(56, 189, 248, 0.08)',
                                        border: '1px solid rgba(56, 189, 248, 0.2)',
                                        fontSize: '0.85rem',
                                        color: '#e2e8f0',
                                        lineHeight: '1.4'
                                    }}>
                                        <span style={{ fontSize: '0.7rem', color: '#38bdf8', fontWeight: 700, display: 'block', marginBottom: '4px' }}>
                                            YOU SAID:
                                        </span>
                                        "{transcript || interimText}"
                                    </div>
                                )}

                                {/* 🔒 TIER 2 ACTION CONFIRMATION CARD */}
                                {pendingAction && (
                                    <div style={{
                                        padding: '16px',
                                        borderRadius: '14px',
                                        background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.15), rgba(180, 83, 9, 0.2))',
                                        border: '1.5px solid rgba(245, 158, 11, 0.5)',
                                        boxShadow: '0 8px 25px rgba(245, 158, 11, 0.2)',
                                        animation: 'jarvisPulseMic 1.5s infinite'
                                    }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                                            <i className="fas fa-shield-alt" style={{ color: '#fbbf24', fontSize: '1rem' }}></i>
                                            <span style={{ fontSize: '0.75rem', fontWeight: 900, color: '#fbbf24', letterSpacing: '0.5px' }}>
                                                CONFIRMATION REQUIRED (TIER 2)
                                            </span>
                                        </div>

                                        <div style={{ fontSize: '0.88rem', color: '#fff', fontWeight: 600, marginBottom: '14px', lineHeight: '1.4' }}>
                                            {pendingAction.summary}
                                        </div>

                                        <div style={{ display: 'flex', gap: '10px' }}>
                                            <button
                                                onClick={() => handleConfirmAction(pendingAction.actionId)}
                                                style={{
                                                    flex: 1,
                                                    padding: '10px',
                                                    borderRadius: '8px',
                                                    background: 'linear-gradient(135deg, #10b981, #059669)',
                                                    color: '#fff',
                                                    border: 'none',
                                                    fontWeight: 700,
                                                    fontSize: '0.8rem',
                                                    cursor: 'pointer',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    gap: '6px'
                                                }}
                                            >
                                                <i className="fas fa-check-circle"></i> Confirm & Execute
                                            </button>

                                            <button
                                                onClick={() => handleCancelAction(pendingAction.actionId)}
                                                style={{
                                                    padding: '10px 14px',
                                                    borderRadius: '8px',
                                                    background: 'rgba(239, 68, 68, 0.2)',
                                                    color: '#f87171',
                                                    border: '1px solid rgba(239, 68, 68, 0.4)',
                                                    fontWeight: 700,
                                                    fontSize: '0.8rem',
                                                    cursor: 'pointer',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    gap: '6px'
                                                }}
                                            >
                                                <i className="fas fa-times-circle"></i> Cancel
                                            </button>
                                        </div>
                                        <div style={{ fontSize: '0.68rem', color: '#fde68a', textAlign: 'center', marginTop: '8px' }}>
                                            Tip: You can also say "Haan" or "Cancel" aloud.
                                        </div>
                                    </div>
                                )}

                                {/* Jarvis Speech Response */}
                                {speechResponse && (
                                    <div style={{
                                        padding: '14px 16px',
                                        borderRadius: '14px',
                                        background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.7), rgba(15, 23, 42, 0.8))',
                                        border: '1px solid rgba(56, 189, 248, 0.3)',
                                        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.2)'
                                    }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                                            <i className="fas fa-brain" style={{ color: '#38bdf8', fontSize: '0.85rem' }}></i>
                                            <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#38bdf8', letterSpacing: '0.5px' }}>
                                                JARVIS:
                                            </span>
                                        </div>
                                        <p style={{ margin: 0, fontSize: '0.88rem', color: '#f8fafc', lineHeight: '1.45', fontWeight: 500 }}>
                                            {speechResponse}
                                        </p>
                                    </div>
                                )}

                                {/* 🎙️ CALL INTELLIGENCE HUD CARD */}
                                {displayData?.type === 'call_intelligence' && (
                                    <div style={{
                                        padding: '14px',
                                        borderRadius: '14px',
                                        background: 'linear-gradient(135deg, rgba(8, 47, 73, 0.85), rgba(15, 23, 42, 0.95))',
                                        border: '1.5px solid #0284c7',
                                        boxShadow: '0 8px 25px rgba(2, 132, 199, 0.3)',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: '10px'
                                    }}>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <span style={{ fontSize: '1.2rem' }}>📞</span>
                                                <div>
                                                    <div style={{ fontSize: '0.88rem', fontWeight: 800, color: '#f8fafc' }}>
                                                        {displayData.clientName || 'Client'}
                                                    </div>
                                                    <div style={{ fontSize: '0.7rem', color: '#38bdf8' }}>
                                                        {displayData.clientPhone} • {displayData.isNewLead ? 'New Lead Created' : 'Lead Updated'}
                                                    </div>
                                                </div>
                                            </div>
                                            {displayData.extractedEntities?.intentScore !== undefined && (
                                                <div style={{
                                                    padding: '4px 8px',
                                                    borderRadius: '8px',
                                                    background: displayData.extractedEntities.intentScore >= 75 ? 'rgba(16, 185, 129, 0.2)' : 'rgba(245, 158, 11, 0.2)',
                                                    border: `1px solid ${displayData.extractedEntities.intentScore >= 75 ? '#10b981' : '#f59e0b'}`,
                                                    color: displayData.extractedEntities.intentScore >= 75 ? '#10b981' : '#f59e0b',
                                                    fontSize: '0.72rem',
                                                    fontWeight: 800
                                                }}>
                                                    ⚡ {displayData.extractedEntities.intentScore}% Intent
                                                </div>
                                            )}
                                        </div>

                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                            {displayData.extractedEntities?.requirement && (
                                                <span style={{ fontSize: '0.72rem', padding: '3px 8px', borderRadius: '6px', background: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8', border: '1px solid rgba(56, 189, 248, 0.3)' }}>
                                                    🏡 {displayData.extractedEntities.requirement}
                                                </span>
                                            )}
                                            {displayData.extractedEntities?.budget && (
                                                <span style={{ fontSize: '0.72rem', padding: '3px 8px', borderRadius: '6px', background: 'rgba(16, 185, 129, 0.15)', color: '#34d399', border: '1px solid rgba(16, 185, 129, 0.3)' }}>
                                                    💰 {displayData.extractedEntities.budget}
                                                </span>
                                            )}
                                            {displayData.extractedEntities?.location && (
                                                <span style={{ fontSize: '0.72rem', padding: '3px 8px', borderRadius: '6px', background: 'rgba(139, 92, 246, 0.15)', color: '#c084fc', border: '1px solid rgba(139, 92, 246, 0.3)' }}>
                                                    📍 {displayData.extractedEntities.location}
                                                </span>
                                            )}
                                        </div>

                                        {displayData.callSummary && (
                                            <p style={{ margin: 0, fontSize: '0.78rem', color: '#cbd5e1', lineHeight: '1.4', background: 'rgba(0,0,0,0.25)', padding: '8px 10px', borderRadius: '8px' }}>
                                                {displayData.callSummary}
                                            </p>
                                        )}

                                        {displayData.followUp?.scheduled && (
                                            <div style={{
                                                padding: '8px 10px',
                                                borderRadius: '8px',
                                                background: 'rgba(245, 158, 11, 0.12)',
                                                border: '1px solid rgba(245, 158, 11, 0.35)',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '8px',
                                                fontSize: '0.75rem',
                                                color: '#fde68a'
                                            }}>
                                                <i className="fas fa-calendar-check" style={{ color: '#f59e0b' }}></i>
                                                <span>
                                                    <strong>{displayData.followUp.type || 'Follow-up'}:</strong> {displayData.followUp.date} {displayData.followUp.time ? 'at ' + displayData.followUp.time : ''}
                                                </span>
                                            </div>
                                        )}

                                        <div style={{ display: 'flex', gap: '8px', marginTop: '2px' }}>
                                            {displayData.leadId && (
                                                <button
                                                    onClick={() => {
                                                        navigate('/leads');
                                                        setIsOpen(false);
                                                    }}
                                                    style={{
                                                        flex: 1,
                                                        padding: '7px 10px',
                                                        borderRadius: '6px',
                                                        background: 'rgba(56, 189, 248, 0.2)',
                                                        border: '1px solid rgba(56, 189, 248, 0.4)',
                                                        color: '#38bdf8',
                                                        fontSize: '0.74rem',
                                                        fontWeight: 700,
                                                        cursor: 'pointer'
                                                    }}
                                                >
                                                    View Lead Record
                                                </button>
                                            )}
                                            {displayData.taskId && (
                                                <button
                                                    onClick={() => {
                                                        navigate('/activities');
                                                        setIsOpen(false);
                                                    }}
                                                    style={{
                                                        flex: 1,
                                                        padding: '7px 10px',
                                                        borderRadius: '6px',
                                                        background: 'rgba(245, 158, 11, 0.2)',
                                                        border: '1px solid rgba(245, 158, 11, 0.4)',
                                                        color: '#fbbf24',
                                                        fontSize: '0.74rem',
                                                        fontWeight: 700,
                                                        cursor: 'pointer'
                                                    }}
                                                >
                                                    View Scheduled Visit
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {/* Structured Display Data (Metrics / Inventory / Search Cards) */}
                                {displayData?.type === 'dashboard_metrics' && displayData.metrics && (
                                    <div style={{
                                        display: 'grid',
                                        gridTemplateColumns: 'repeat(2, 1fr)',
                                        gap: '10px',
                                        marginTop: '4px'
                                    }}>
                                        <div style={{ padding: '12px', borderRadius: '12px', background: 'rgba(99, 102, 241, 0.12)', border: '1px solid rgba(99, 102, 241, 0.25)' }}>
                                            <div style={{ fontSize: '0.7rem', color: '#818cf8', fontWeight: 600 }}>TOTAL LEADS</div>
                                            <div style={{ fontSize: '1.3rem', fontWeight: 900, color: '#fff', marginTop: '4px' }}>{displayData.metrics.totalLeads}</div>
                                        </div>
                                        <div style={{ padding: '12px', borderRadius: '12px', background: 'rgba(244, 63, 94, 0.12)', border: '1px solid rgba(244, 63, 94, 0.25)' }}>
                                            <div style={{ fontSize: '0.7rem', color: '#fb7185', fontWeight: 600 }}>HOT PROSPECTS</div>
                                            <div style={{ fontSize: '1.3rem', fontWeight: 900, color: '#fff', marginTop: '4px' }}>{displayData.metrics.hotLeads}</div>
                                        </div>
                                        <div style={{ padding: '12px', borderRadius: '12px', background: 'rgba(16, 185, 129, 0.12)', border: '1px solid rgba(16, 185, 129, 0.25)' }}>
                                            <div style={{ fontSize: '0.7rem', color: '#34d399', fontWeight: 600 }}>ACTIVE DEALS</div>
                                            <div style={{ fontSize: '1.3rem', fontWeight: 900, color: '#fff', marginTop: '4px' }}>{displayData.metrics.totalDeals}</div>
                                        </div>
                                        <div style={{ padding: '12px', borderRadius: '12px', background: 'rgba(139, 92, 246, 0.12)', border: '1px solid rgba(139, 92, 246, 0.25)' }}>
                                            <div style={{ fontSize: '0.7rem', color: '#c084fc', fontWeight: 600 }}>INVENTORY</div>
                                            <div style={{ fontSize: '1.3rem', fontWeight: 900, color: '#fff', marginTop: '4px' }}>{displayData.metrics.totalInventory}</div>
                                        </div>
                                    </div>
                                )}

                                {/* Daily Briefing Summary Pill Card */}
                                {displayData?.type === 'daily_briefing' && (
                                    <div style={{
                                        padding: '12px 14px',
                                        borderRadius: '12px',
                                        background: 'linear-gradient(135deg, rgba(8, 47, 73, 0.85), rgba(15, 23, 42, 0.95))',
                                        border: '1.5px solid #0284c7',
                                        boxShadow: '0 8px 25px rgba(2, 132, 199, 0.3)',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: '8px'
                                    }}>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                            <div style={{ fontSize: '0.8rem', fontWeight: 800, color: '#38bdf8', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                <span>☀️</span> DAILY BRIEFING READY
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setBriefingData({ success: true, ...displayData });
                                                    setActiveTab('briefing');
                                                }}
                                                style={{
                                                    padding: '4px 10px',
                                                    borderRadius: '6px',
                                                    background: 'rgba(56, 189, 248, 0.2)',
                                                    border: '1px solid rgba(56, 189, 248, 0.4)',
                                                    color: '#38bdf8',
                                                    fontSize: '0.72rem',
                                                    fontWeight: 700,
                                                    cursor: 'pointer'
                                                }}
                                            >
                                                Open Full Agenda →
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {/* Proactive Suggestions Card */}
                                {displayData?.type === 'proactive_suggestions' && displayData.suggestions && (
                                    <div style={{
                                        padding: '12px 14px',
                                        borderRadius: '12px',
                                        background: 'linear-gradient(135deg, rgba(8, 47, 73, 0.85), rgba(15, 23, 42, 0.95))',
                                        border: '1.5px solid #0284c7',
                                        boxShadow: '0 8px 25px rgba(2, 132, 199, 0.3)',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: '8px'
                                    }}>
                                        <div style={{ fontSize: '0.8rem', fontWeight: 800, color: '#38bdf8', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            <span>⚡</span> PROACTIVE RECOMMENDATIONS ({displayData.suggestions.length})
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                            {displayData.suggestions.map((item, idx) => (
                                                <div key={idx} style={{
                                                    padding: '8px 10px',
                                                    borderRadius: '8px',
                                                    background: 'rgba(255, 255, 255, 0.04)',
                                                    border: `1px solid ${item.priority === 'urgent' ? 'rgba(239, 68, 68, 0.4)' : 'rgba(56, 189, 248, 0.2)'}`,
                                                    fontSize: '0.75rem',
                                                    color: '#e2e8f0'
                                                }}>
                                                    <div style={{ fontWeight: 700, color: item.priority === 'urgent' ? '#f87171' : '#38bdf8', marginBottom: '2px' }}>
                                                        {item.title}
                                                    </div>
                                                    <div style={{ color: '#cbd5e1' }}>{item.reason}</div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Team Performance Intelligence Card */}
                                {displayData?.type === 'team_performance' && displayData.kpis && (
                                    <div style={{
                                        padding: '14px',
                                        borderRadius: '14px',
                                        background: 'linear-gradient(135deg, rgba(8, 47, 73, 0.85), rgba(15, 23, 42, 0.95))',
                                        border: '1.5px solid #0284c7',
                                        boxShadow: '0 8px 25px rgba(2, 132, 199, 0.3)',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: '10px'
                                    }}>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                            <div style={{ fontSize: '0.82rem', fontWeight: 800, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                <span>📊</span> {displayData.teamName?.toUpperCase() || 'TEAM'} PERFORMANCE ({displayData.timeframeLabel || 'This Month'})
                                            </div>
                                            <span style={{ fontSize: '0.68rem', padding: '2px 8px', borderRadius: '6px', background: 'rgba(56, 189, 248, 0.2)', color: '#38bdf8' }}>
                                                Manager View
                                            </span>
                                        </div>

                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
                                            <div style={{ padding: '8px 10px', borderRadius: '8px', background: 'rgba(16, 185, 129, 0.12)', border: '1px solid rgba(16, 185, 129, 0.25)' }}>
                                                <div style={{ fontSize: '0.65rem', color: '#34d399', fontWeight: 700 }}>DEALS WON</div>
                                                <div style={{ fontSize: '1.1rem', fontWeight: 900, color: '#fff', marginTop: '2px' }}>
                                                    {displayData.kpis.dealsWonCount} <span style={{ fontSize: '0.75rem', color: '#10b981' }}>({displayData.kpis.totalWonValueCr})</span>
                                                </div>
                                            </div>
                                            <div style={{ padding: '8px 10px', borderRadius: '8px', background: 'rgba(99, 102, 241, 0.12)', border: '1px solid rgba(99, 102, 241, 0.25)' }}>
                                                <div style={{ fontSize: '0.65rem', color: '#818cf8', fontWeight: 700 }}>LEADS PROCESSED</div>
                                                <div style={{ fontSize: '1.1rem', fontWeight: 900, color: '#fff', marginTop: '2px' }}>
                                                    {displayData.kpis.totalLeadsHandled}
                                                </div>
                                            </div>
                                            <div style={{ padding: '8px 10px', borderRadius: '8px', background: 'rgba(245, 158, 11, 0.12)', border: '1px solid rgba(245, 158, 11, 0.25)' }}>
                                                <div style={{ fontSize: '0.65rem', color: '#fbbf24', fontWeight: 700 }}>SITE VISITS DONE</div>
                                                <div style={{ fontSize: '1.1rem', fontWeight: 900, color: '#fff', marginTop: '2px' }}>
                                                    {displayData.kpis.siteVisitsCount}
                                                </div>
                                            </div>
                                            <div style={{ padding: '8px 10px', borderRadius: '8px', background: 'rgba(56, 189, 248, 0.12)', border: '1px solid rgba(56, 189, 248, 0.25)' }}>
                                                <div style={{ fontSize: '0.65rem', color: '#38bdf8', fontWeight: 700 }}>CALLS LOGGED</div>
                                                <div style={{ fontSize: '1.1rem', fontWeight: 900, color: '#fff', marginTop: '2px' }}>
                                                    {displayData.kpis.callsCount}
                                                </div>
                                            </div>
                                        </div>

                                        {displayData.topPerformers?.length > 0 && (
                                            <div style={{ borderTop: '1px solid rgba(56, 189, 248, 0.2)', paddingTop: '8px' }}>
                                                <div style={{ fontSize: '0.68rem', color: '#94a3b8', fontWeight: 700, marginBottom: '4px' }}>
                                                    🏆 TOP PERFORMERS:
                                                </div>
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                    {displayData.topPerformers.map((p, idx) => (
                                                        <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.74rem', color: '#e2e8f0' }}>
                                                            <span>{idx + 1}. <strong>{p.name}</strong> ({p.role})</span>
                                                            <span style={{ color: '#38bdf8', fontWeight: 700 }}>{p.completedTasks} tasks</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Smart Meeting Notes Card */}
                                {displayData?.type === 'meeting_notes' && (
                                    <div style={{
                                        padding: '14px',
                                        borderRadius: '14px',
                                        background: 'linear-gradient(135deg, rgba(8, 47, 73, 0.85), rgba(15, 23, 42, 0.95))',
                                        border: '1.5px solid #0284c7',
                                        boxShadow: '0 8px 25px rgba(2, 132, 199, 0.3)',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: '8px'
                                    }}>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                            <div style={{ fontSize: '0.82rem', fontWeight: 800, color: '#38bdf8', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                <span>📝</span> SMART MEETING LOGGED
                                            </div>
                                            <span style={{ fontSize: '0.68rem', padding: '2px 8px', borderRadius: '6px', background: 'rgba(16, 185, 129, 0.2)', color: '#34d399' }}>
                                                {displayData.createdTasksCount} Follow-ups Auto-Created
                                            </span>
                                        </div>

                                        <div style={{ fontSize: '0.82rem', color: '#fff', fontWeight: 700 }}>
                                            {displayData.clientName} {displayData.projectName ? `• ${displayData.projectName}` : ''}
                                        </div>

                                        {displayData.meetingSummary && (
                                            <p style={{ margin: 0, fontSize: '0.78rem', color: '#cbd5e1', lineHeight: '1.45', background: 'rgba(0,0,0,0.25)', padding: '8px 10px', borderRadius: '8px' }}>
                                                {displayData.meetingSummary}
                                            </p>
                                        )}

                                        {displayData.keyDecisions?.length > 0 && (
                                            <div>
                                                <div style={{ fontSize: '0.68rem', color: '#38bdf8', fontWeight: 700, marginBottom: '2px' }}>KEY DECISIONS:</div>
                                                {displayData.keyDecisions.map((dec, i) => (
                                                    <div key={i} style={{ fontSize: '0.72rem', color: '#e2e8f0' }}>• {dec}</div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Quick Prompts Suggestions */}
                                {!speechResponse && !pendingAction && !displayData && (
                                    <div style={{ marginTop: 'auto' }}>
                                        <div style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 700, marginBottom: '8px', letterSpacing: '0.5px' }}>
                                            TRY SAYING (PHASE 5 ENTERPRISE READY):
                                        </div>
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                            {[
                                                "Puri sales team ki performance batao",
                                                "Mohali team ka status kya hai?",
                                                "Meeting notes: DLF meeting me 5 plots book hue, 10L advance token",
                                                "Daily briefing batao",
                                                "Naya lead banao Vikas 9876543210 budget 1 Cr"
                                            ].map((prompt, idx) => (
                                                <button
                                                    key={idx}
                                                    onClick={() => handleCommandSubmit(prompt)}
                                                    style={{
                                                        padding: '6px 10px',
                                                        borderRadius: '8px',
                                                        background: 'rgba(56, 189, 248, 0.08)',
                                                        border: '1px solid rgba(56, 189, 248, 0.2)',
                                                        color: '#38bdf8',
                                                        fontSize: '0.72rem',
                                                        fontWeight: 600,
                                                        cursor: 'pointer',
                                                        transition: 'all 0.15s'
                                                    }}
                                                    onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(56, 189, 248, 0.2)'; }}
                                                    onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(56, 189, 248, 0.08)'; }}
                                                >
                                                    "{prompt}"
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </>
                        )}
                    </div>

                    {/* Bottom Input Field */}
                    {activeTab === 'assistant' && (
                        <form
                            onSubmit={handleFormSubmit}
                            style={{
                                padding: '12px 16px',
                                borderTop: '1px solid rgba(56, 189, 248, 0.15)',
                                background: 'rgba(2, 6, 23, 0.6)',
                                display: 'flex',
                                gap: '8px',
                                alignItems: 'center'
                            }}
                        >
                            <input
                                type="text"
                                value={inputText}
                                onChange={(e) => setInputText(e.target.value)}
                                placeholder="Speak command or type e.g. Naya lead banao..."
                                style={{
                                    flex: 1,
                                    padding: '10px 14px',
                                    borderRadius: '10px',
                                    background: 'rgba(255, 255, 255, 0.06)',
                                    border: '1px solid rgba(56, 189, 248, 0.2)',
                                    color: '#fff',
                                    fontSize: '0.82rem',
                                    outline: 'none'
                                }}
                            />

                            {status === 'listening' ? (
                                <button
                                    type="button"
                                    onClick={stopListening}
                                    title="Finish speaking and execute"
                                    style={{
                                        height: '38px',
                                        padding: '0 12px',
                                        borderRadius: '10px',
                                        background: 'linear-gradient(135deg, #10b981, #059669)',
                                        border: 'none',
                                        color: '#fff',
                                        fontSize: '0.78rem',
                                        fontWeight: 800,
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '6px',
                                        boxShadow: '0 0 15px rgba(16, 185, 129, 0.4)',
                                        animation: 'jarvisPulseMic 1s infinite'
                                    }}
                                >
                                    <i className="fas fa-check"></i> Done
                                </button>
                            ) : (
                                <button
                                    type="button"
                                    onClick={toggleListening}
                                    title="Click to speak (Microphone)"
                                    style={{
                                        width: '38px',
                                        height: '38px',
                                        borderRadius: '10px',
                                        background: 'rgba(56, 189, 248, 0.15)',
                                        border: '1px solid rgba(56, 189, 248, 0.3)',
                                        color: '#38bdf8',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        transition: 'all 0.2s'
                                    }}
                                >
                                    <i className="fas fa-microphone" style={{ fontSize: '0.9rem' }}></i>
                                </button>
                            )}

                            <button
                                type="submit"
                                disabled={!inputText.trim() || status === 'processing'}
                                style={{
                                    width: '38px',
                                    height: '38px',
                                    borderRadius: '10px',
                                    background: 'linear-gradient(135deg, #0284c7, #0369a1)',
                                    border: 'none',
                                    color: '#fff',
                                    cursor: (!inputText.trim() || status === 'processing') ? 'not-allowed' : 'pointer',
                                    opacity: (!inputText.trim() || status === 'processing') ? 0.5 : 1,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center'
                                }}
                            >
                                <i className="fas fa-paper-plane" style={{ fontSize: '0.85rem' }}></i>
                            </button>
                        </form>
                    )}
                </div>
            )}

            {/* ⚛️ FLOATING ARC-REACTOR ORB BUTTON */}
            <div
                style={{
                    position: 'fixed',
                    bottom: '24px',
                    right: '24px',
                    zIndex: 99999,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px'
                }}
            >
                {/* Status Pill Tag */}
                {!isOpen && (
                    status === 'listening' ? (
                        <div
                            onClick={() => setIsOpen(true)}
                            style={{
                                padding: '6px 14px',
                                borderRadius: '20px',
                                background: 'rgba(239, 68, 68, 0.95)',
                                backdropFilter: 'blur(10px)',
                                border: '1.5px solid #ef4444',
                                color: '#fff',
                                fontSize: '0.74rem',
                                fontWeight: 800,
                                letterSpacing: '0.5px',
                                boxShadow: '0 0 20px rgba(239, 68, 68, 0.6)',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                animation: 'jarvisPulseMic 1s infinite'
                            }}
                        >
                            <span style={{
                                width: '8px',
                                height: '8px',
                                borderRadius: '50%',
                                background: '#fff',
                                boxShadow: '0 0 8px #fff'
                            }}></span>
                            LISTENING... SPEAK NOW
                        </div>
                    ) : (
                        <div
                            onClick={() => setIsOpen(true)}
                            style={{
                                padding: '6px 12px',
                                borderRadius: '20px',
                                background: 'rgba(15, 23, 42, 0.85)',
                                backdropFilter: 'blur(10px)',
                                border: '1px solid rgba(56, 189, 248, 0.3)',
                                color: '#38bdf8',
                                fontSize: '0.72rem',
                                fontWeight: 800,
                                letterSpacing: '1px',
                                boxShadow: '0 4px 15px rgba(0, 0, 0, 0.3)',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                transition: 'all 0.2s'
                            }}
                        >
                            <span style={{
                                width: '6px',
                                height: '6px',
                                borderRadius: '50%',
                                background: '#38bdf8',
                                boxShadow: '0 0 8px #38bdf8'
                            }}></span>
                            JARVIS AI
                        </div>
                    )
                )}

                {/* Orb Main Trigger */}
                <button
                    onClick={toggleListening}
                    style={{
                        width: '62px',
                        height: '62px',
                        borderRadius: '50%',
                        border: 'none',
                        cursor: 'pointer',
                        position: 'relative',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: 'radial-gradient(circle at 35% 35%, #38bdf8 0%, #0284c7 50%, #0f172a 100%)',
                        boxShadow: status === 'listening'
                            ? '0 0 35px #ef4444, 0 0 60px rgba(239, 68, 68, 0.5)'
                            : status === 'processing'
                            ? '0 0 35px #f59e0b, 0 0 60px rgba(245, 158, 11, 0.5)'
                            : '0 0 25px rgba(56, 189, 248, 0.7), 0 0 50px rgba(2, 132, 199, 0.4)',
                        transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
                        transform: status === 'listening' ? 'scale(1.1)' : 'scale(1)',
                        outline: 'none'
                    }}
                >
                    {/* Concentric Glow Wave Rings */}
                    <div style={{
                        position: 'absolute',
                        inset: '-5px',
                        borderRadius: '50%',
                        border: `1.5px solid ${status === 'listening' ? '#ef4444' : status === 'processing' ? '#f59e0b' : '#38bdf8'}`,
                        animation: status === 'listening' ? 'jarvisRipple 1.2s infinite' : 'jarvisSpinRing 8s linear infinite',
                        opacity: 0.8
                    }}></div>

                    {/* Center Core Icon */}
                    <div style={{
                        width: '42px',
                        height: '42px',
                        borderRadius: '50%',
                        background: 'rgba(15, 23, 42, 0.8)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: status === 'listening' ? '#ef4444' : status === 'processing' ? '#f59e0b' : '#38bdf8',
                        fontSize: '1.2rem',
                        boxShadow: 'inset 0 0 10px rgba(0, 0, 0, 0.8)'
                    }}>
                        {status === 'listening' ? (
                            <i className="fas fa-wave-square" style={{ animation: 'jarvisWave 0.8s infinite' }}></i>
                        ) : status === 'processing' ? (
                            <i className="fas fa-cog fa-spin"></i>
                        ) : status === 'speaking' ? (
                            <i className="fas fa-volume-up" style={{ animation: 'jarvisPulseMic 1s infinite' }}></i>
                        ) : (
                            <i className="fas fa-robot"></i>
                        )}
                    </div>
                </button>
            </div>

            {/* CSS Keyframe Animations */}
            <style>{`
                @keyframes jarvisFadeIn {
                    from { opacity: 0; transform: translateY(15px) scale(0.96); }
                    to { opacity: 1; transform: translateY(0) scale(1); }
                }
                @keyframes jarvisSpinRing {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
                @keyframes jarvisRipple {
                    0% { transform: scale(1); opacity: 0.9; }
                    100% { transform: scale(1.4); opacity: 0; }
                }
                @keyframes jarvisPulseMic {
                    0%, 100% { transform: scale(1); }
                    50% { transform: scale(1.08); }
                }
                @keyframes jarvisWave {
                    0%, 100% { transform: scaleY(1); }
                    50% { transform: scaleY(1.4); }
                }
            `}</style>
        </>
    );
};

export default JarvisWidget;
