                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {/* Channel Select Toggles */}
                        {['whatsapp', 'email', 'sms'].map(ch => (
                            <div key={ch} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                <button 
                                    disabled={!channelAvailability[ch]}
                                    onClick={() => setBlastChannels(prev => ({...prev, [ch]: !prev[ch]}))}
                                    style={{ 
                                        padding: '6px 12px', borderRadius: '20px', fontSize: '0.8rem', fontWeight: 600, transition: 'all 0.2s', border: 'none',
                                        background: blastChannels[ch] ? (ch === 'whatsapp' ? '#10b981' : ch === 'email' ? '#3b82f6' : '#8b5cf6') : '#334155', 
                                        color: blastChannels[ch] ? '#fff' : '#94a3b8', 
                                        opacity: channelAvailability[ch] ? 1 : 0.4, cursor: channelAvailability[ch] ? 'pointer' : 'not-allowed',
                                        display: 'flex', alignItems: 'center', gap: '6px', 
                                        outline: blastChannels[ch] ? `2px solid ${ch === 'whatsapp' ? '#059669' : ch === 'email' ? '#2563eb' : '#7c3aed'}` : 'none'
                                    }}>
                                    <i className={`fa${ch==='whatsapp'?'b':'s'} fa-${ch==='whatsapp'?'whatsapp':ch==='email'?'envelope':'comment-dots'}`}></i> {ch === 'whatsapp' ? 'WA API' : ch.toUpperCase()}
                                </button>
                                {blastChannels[ch] && (
                                    <div style={{ display: 'flex', gap: '4px' }}>
                                        <select 
                                            value={channelSchedules[ch] ? 'schedule' : 'now'}
                                            onChange={(e) => {
                                                if (e.target.value === 'now') {
                                                    setChannelSchedules(prev => ({...prev, [ch]: ''}));
                                                } else {
                                                    const date = new Date();
                                                    date.setHours(date.getHours() + 1);
                                                    setChannelSchedules(prev => ({...prev, [ch]: date.toISOString().slice(0, 16)}));
                                                }
                                            }}
                                            style={{ padding: '2px 4px', borderRadius: '4px', border: '1px solid #475569', background: '#1e293b', color: '#e2e8f0', fontSize: '0.7rem' }}
                                        >
                                            <option value="now">Send Now</option>
                                            <option value="schedule">Schedule Later</option>
                                        </select>
                                        {channelSchedules[ch] && (
                                            <input 
                                                type="datetime-local"
                                                value={channelSchedules[ch]}
                                                onChange={(e) => setChannelSchedules(prev => ({...prev, [ch]: e.target.value}))}
                                                style={{ padding: '2px 4px', borderRadius: '4px', border: '1px solid #475569', background: '#1e293b', color: '#e2e8f0', fontSize: '0.7rem' }}
                                            />
                                        )}
                                    </div>
                                )}
                            </div>
                        ))}

                        <button 
                            disabled={!channelAvailability.rcs}
                            onClick={() => setBlastChannels(prev => ({...prev, rcs: !prev.rcs}))}
                            style={{ 
                                padding: '6px 12px', borderRadius: '20px', fontSize: '0.8rem', fontWeight: 600, transition: 'all 0.2s', border: 'none',
                                background: blastChannels.rcs ? '#0ea5e9' : '#334155', color: blastChannels.rcs ? '#fff' : '#94a3b8', 
                                opacity: channelAvailability.rcs ? (blastChannels.rcs ? 1 : 0.6) : 0.4, cursor: channelAvailability.rcs ? 'pointer' : 'not-allowed',
                                display: 'flex', alignItems: 'center', gap: '6px', outline: blastChannels.rcs ? '2px solid #0284c7' : 'none'
                            }}>
                            <i className="fas fa-mobile-alt"></i> RCS
                        </button>
                        
                        <button 
                            disabled={!channelAvailability.whatsapp_app}
                            onClick={() => setBlastChannels(prev => ({...prev, whatsapp_app: !prev.whatsapp_app}))}
                            style={{ 
                                padding: '6px 12px', borderRadius: '20px', fontSize: '0.8rem', fontWeight: 600, transition: 'all 0.2s', border: 'none',
                                background: blastChannels.whatsapp_app ? '#059669' : '#334155', color: blastChannels.whatsapp_app ? '#fff' : '#94a3b8', 
                                opacity: channelAvailability.whatsapp_app ? (blastChannels.whatsapp_app ? 1 : 0.6) : 0.4, cursor: channelAvailability.whatsapp_app ? 'pointer' : 'not-allowed',
                                display: 'flex', alignItems: 'center', gap: '6px', outline: blastChannels.whatsapp_app ? '2px solid #047857' : 'none'
                            }}>
                            <i className="fas fa-comment"></i> WA App
                        </button>

                        <div style={{ width: '1px', height: '24px', background: '#475569', margin: '0 8px' }}></div>

                        <button 
                            className="btn-primary"
                            onClick={handleSendBlast}
                            disabled={isBlasting || isSendingPortfolio || (!blastChannels.whatsapp && !blastChannels.email && !blastChannels.sms && !blastChannels.whatsapp_app)}
                            style={{ 
                                padding: '8px 24px', borderRadius: '20px', background: 'linear-gradient(135deg, #ec4899 0%, #f43f5e 100%)', 
                                color: '#fff', border: 'none', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer',
                                opacity: (isBlasting || isSendingPortfolio) ? 0.7 : 1, transition: 'all 0.2s', boxShadow: '0 4px 15px rgba(236, 72, 153, 0.4)'
                            }}
                            onMouseOver={(e) => { if(!isBlasting) e.currentTarget.style.transform = 'translateY(-2px)'; }}
                            onMouseOut={(e) => e.currentTarget.style.transform = 'translateY(0)'}
                        >
                            {isBlasting ? <i className="fas fa-circle-notch fa-spin"></i> : <i className="fas fa-paper-plane"></i>}
                            SEND
                        </button>
                    </div>
