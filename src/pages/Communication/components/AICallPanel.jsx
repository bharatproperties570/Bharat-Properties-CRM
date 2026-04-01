import React, { useState, useEffect } from 'react';

const AICallPanel = () => {
    const [isListening, setIsListening] = useState(true);
    const [transcript, setTranscript] = useState([
        { speaker: 'AI', text: "Namaste, Bharat Properties se bol rahe hain. Aap property buy, sell ya rent ke liye call kar rahe hain?", time: "0:02" },
        { speaker: 'User', text: "Haan namaste, mujhe ek ghar kharidna hai.", time: "0:08" }
    ]);

    // Simulate AI speaking
    useEffect(() => {
        if (!isListening) return;
        
        const timer = setTimeout(() => {
            setTranscript(prev => [...prev, { 
                speaker: 'AI', 
                text: "Zaroor sir, aap kis area me dekh rahe hain aur apka budget kya rahega?", 
                time: "0:12" 
            }]);
        }, 3000);

        return () => clearTimeout(timer);
    }, [isListening]);

    const handleTakeOver = () => {
        setIsListening(false);
    };

    return (
        <div style={{ padding: '20px', display: 'flex', justifyContent: 'center' }}>
            <div style={{
                background: '#fff',
                border: '1px solid #e2e8f0',
                borderRadius: '16px',
                width: '100%',
                maxWidth: '800px',
                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden'
            }}>
                {/* Header */}
                <div style={{
                    padding: '15px 25px',
                    background: '#0f172a',
                    color: '#fff',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                        <div style={{ position: 'relative' }}>
                            <i className="fas fa-phone-alt" style={{ fontSize: '1.2rem', color: '#38bdf8' }}></i>
                            {isListening && (
                                <span style={{
                                    position: 'absolute',
                                    top: '-5px',
                                    right: '-5px',
                                    width: '8px',
                                    height: '8px',
                                    backgroundColor: '#10b981',
                                    borderRadius: '50%',
                                    animation: 'pulse 1.5s infinite'
                                }}></span>
                            )}
                        </div>
                        <div>
                            <div style={{ fontWeight: 700, fontSize: '1.1rem' }}>Live AI Voice Call</div>
                            <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Powered by ElevenLabs & Whisper</div>
                        </div>
                    </div>

                    <button
                        onClick={handleTakeOver}
                        disabled={!isListening}
                        style={{
                            padding: '8px 20px',
                            background: isListening ? '#ef4444' : '#334155',
                            color: '#fff',
                            border: 'none',
                            borderRadius: '8px',
                            fontWeight: 600,
                            cursor: isListening ? 'pointer' : 'not-allowed',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            transition: 'background 0.2s'
                        }}
                    >
                        <i className={isListening ? "fas fa-headset" : "fas fa-user-check"}></i>
                        {isListening ? 'Take Over Call' : 'Human Operator Active'}
                    </button>
                </div>

                {/* Status Bar */}
                <div style={{
                    padding: '8px 25px',
                    background: '#1e293b',
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: '0.8rem',
                    color: '#94a3b8'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ 
                            display: 'inline-block', 
                            width: '10px', 
                            height: '10px', 
                            borderRadius: '50%', 
                            background: isListening ? '#0ea5e9' : '#64748b' 
                        }}></span>
                        AI Engine: {isListening ? 'Listening & Speaking' : 'Paused / Standby'}
                    </div>
                    <div>Call Duration: 00:15</div>
                </div>

                {/* Live Transcript Area */}
                <div style={{
                    padding: '25px',
                    height: '400px',
                    overflowY: 'auto',
                    background: '#f8fafc',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '20px'
                }}>
                    <div style={{ textAlign: 'center', marginBottom: '10px' }}>
                        <span style={{ background: '#e2e8f0', color: '#64748b', padding: '4px 12px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 600 }}>
                            Call Connected - Recording Started
                        </span>
                    </div>

                    {transcript.map((line, idx) => (
                        <div key={idx} style={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: line.speaker === 'User' ? 'flex-end' : 'flex-start',
                            width: '100%'
                        }}>
                            <div style={{
                                maxWidth: '75%',
                                padding: '15px 20px',
                                borderRadius: '16px',
                                background: line.speaker === 'User' ? '#fff' : '#0ea5e9',
                                color: line.speaker === 'User' ? '#1e293b' : '#fff',
                                boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
                                borderBottomLeftRadius: line.speaker === 'User' ? '4px' : '16px',
                                borderBottomRightRadius: line.speaker === 'AI' ? '4px' : '16px',
                            }}>
                                <div style={{ 
                                    fontSize: '0.75rem', 
                                    fontWeight: 700, 
                                    marginBottom: '5px',
                                    color: line.speaker === 'User' ? '#64748b' : '#e0f2fe'
                                }}>
                                    {line.speaker === 'AI' ? <><i className="fas fa-robot"></i> AI Response</> : 'User Speech (Transcribed)'}
                                </div>
                                <div style={{ fontSize: '1rem', lineHeight: '1.5' }}>
                                    {line.text}
                                </div>
                            </div>
                            <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: '5px' }}>{line.time}</div>
                        </div>
                    ))}

                    {isListening && transcript.length === 3 && (
                        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', alignSelf: 'flex-end', marginTop: '10px', color: '#94a3b8' }}>
                            <div className="typing-indicator" style={{ display: 'flex', gap: '4px' }}>
                                <span style={{ width: '6px', height: '6px', background: '#94a3b8', borderRadius: '50%' }}></span>
                                <span style={{ width: '6px', height: '6px', background: '#94a3b8', borderRadius: '50%' }}></span>
                                <span style={{ width: '6px', height: '6px', background: '#94a3b8', borderRadius: '50%' }}></span>
                            </div>
                            <span style={{ fontSize: '0.8rem' }}>User is speaking... (Whisper mapping)</span>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default AICallPanel;
