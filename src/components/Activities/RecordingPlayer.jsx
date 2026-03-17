import React, { useState, useRef } from 'react';
import { Play, Pause, Volume2, Download, ExternalLink, Clock } from 'lucide-react';

const RecordingPlayer = ({ url, duration }) => {
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [isMuted, setIsMuted] = useState(false);
    const audioRef = useRef(null);

    const togglePlay = () => {
        if (isPlaying) {
            audioRef.current.pause();
        } else {
            audioRef.current.play();
        }
        setIsPlaying(!isPlaying);
    };

    const onTimeUpdate = () => {
        setCurrentTime(audioRef.current.currentTime);
    };

    const formatTime = (time) => {
        if (isNaN(time)) return "0:00";
        const minutes = Math.floor(time / 60);
        const seconds = Math.floor(time % 60);
        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    };

    const handleProgressChange = (e) => {
        const time = e.target.value;
        audioRef.current.currentTime = time;
        setCurrentTime(time);
    };

    return (
        <div style={{
            marginTop: '12px',
            background: 'rgba(248, 250, 252, 0.5)',
            borderRadius: '12px',
            padding: '12px 16px',
            border: '1px solid rgba(226, 232, 240, 0.8)',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px'
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <button 
                    onClick={togglePlay}
                    style={{
                        width: '36px',
                        height: '36px',
                        borderRadius: '50%',
                        background: 'var(--premium-blue)',
                        color: '#fff',
                        border: 'none',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                        boxShadow: '0 4px 6px rgba(79, 70, 229, 0.2)'
                    }}
                >
                    {isPlaying ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" style={{ marginLeft: '2px' }} />}
                </button>

                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', fontWeight: 700, color: '#64748b' }}>
                        <span>Call Recording</span>
                        <span>{formatTime(currentTime)} / {formatTime(audioRef.current?.duration || duration)}</span>
                    </div>
                    <input 
                        type="range"
                        min="0"
                        max={audioRef.current?.duration || duration || 0}
                        value={currentTime}
                        onChange={handleProgressChange}
                        style={{
                            width: '100%',
                            height: '4px',
                            background: '#e2e8f0',
                            borderRadius: '2px',
                            appearance: 'none',
                            cursor: 'pointer',
                            outline: 'none'
                        }}
                    />
                </div>

                <div style={{ display: 'flex', gap: '8px' }}>
                    <a 
                        href={url} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        style={{ color: '#94a3b8', hover: { color: '#64748b' } }}
                        title="Open external"
                    >
                        <ExternalLink size={16} />
                    </a>
                </div>
            </div>

            <audio 
                ref={audioRef} 
                src={url} 
                onTimeUpdate={onTimeUpdate}
                onEnded={() => setIsPlaying(false)}
                hidden
            />
        </div>
    );
};

export default RecordingPlayer;
