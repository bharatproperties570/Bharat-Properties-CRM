import { useState } from 'react';
import { useParsing } from '../../../context/ParsingContext';

import { parseDealContent } from '../../../utils/dealParser';

const ParsingRulesPage = ({ isEmbedded = false }) => {
    const { cities, locations, types: parserTypes, addKeyword, removeKeyword } = useParsing();

    const [newCity, setNewCity] = useState('');
    const [newLocation, setNewLocation] = useState('');
    const [activeTab, setActiveTab] = useState('GEOGRAPHY'); // GEOGRAPHY | TYPES | TEST

    // Test Lab State
    const [testText, setTestText] = useState('');
    const [testResult, setTestResult] = useState(null);
    const { customPatterns } = useParsing();

    const handleRunTest = () => {
        if (!testText) return;
        const result = parseDealContent(testText, customPatterns);
        setTestResult(result);
    };

    const handleAddCity = (e) => {
        e.preventDefault();
        if (newCity.trim()) {
            addKeyword('CITY', newCity.trim());
            setNewCity('');
        }
    };

    const handleAddLocation = (e) => {
        e.preventDefault();
        if (newLocation.trim()) {
            addKeyword('LOCATION', newLocation.trim());
            setNewLocation('');
        }
    };

    const categoryOrder = ['Residential', 'Commercial', 'Industrial', 'Agricultural', 'Institutional'];

    return (
        <div className="animate-fade-in" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            {!isEmbedded && (
                <div style={{ marginBottom: '24px' }}>
                    <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-main)', marginBottom: '8px' }}>Parsing Intelligence</h2>
                    <p style={{ color: 'var(--text-muted)' }}>Configure the keywords and patterns used by the AI Deal Parser.</p>
                </div>
            )}

            <div style={{ background: 'var(--bg-card)', borderRadius: '12px', border: '1px solid var(--border-color)', overflow: 'hidden', flex: 1, display: 'flex', flexDirection: 'column' }}>
                {/* Tabs */}
                <div style={{ display: 'flex', borderBottom: '1px solid var(--border-color)', background: 'var(--bg-light)' }}>
                    <button
                        onClick={() => setActiveTab('GEOGRAPHY')}
                        style={{
                            padding: '16px 24px',
                            border: 'none',
                            background: activeTab === 'GEOGRAPHY' ? 'var(--bg-card)' : 'transparent',
                            color: activeTab === 'GEOGRAPHY' ? '#3b82f6' : 'var(--text-muted)',
                            fontWeight: 700,
                            borderBottom: activeTab === 'GEOGRAPHY' ? '2px solid #3b82f6' : 'none',
                            cursor: 'pointer'
                        }}
                    >
                        <i className="fas fa-map-marked-alt" style={{ marginRight: '8px' }}></i> Geography
                    </button>
                    {/* Placeholder for future expansion */}
                    <button
                        onClick={() => setActiveTab('TYPES')}
                        style={{
                            padding: '16px 24px',
                            border: 'none',
                            background: activeTab === 'TYPES' ? 'var(--bg-card)' : 'transparent',
                            color: activeTab === 'TYPES' ? '#3b82f6' : 'var(--text-muted)',
                            fontWeight: 700,
                            borderBottom: activeTab === 'TYPES' ? '2px solid #3b82f6' : 'none',
                            cursor: 'pointer',
                            opacity: 1
                        }}
                    >
                        <i className="fas fa-home" style={{ marginRight: '8px' }}></i> Property Types
                    </button>
                    <button
                        onClick={() => setActiveTab('TEST')}
                        style={{
                            padding: '16px 24px',
                            border: 'none',
                            background: activeTab === 'TEST' ? 'var(--bg-card)' : 'transparent',
                            color: activeTab === 'TEST' ? '#8b5cf6' : 'var(--text-muted)',
                            fontWeight: 700,
                            borderBottom: activeTab === 'TEST' ? '2px solid #8b5cf6' : 'none',
                            cursor: 'pointer'
                        }}
                    >
                        <i className="fas fa-flask" style={{ marginRight: '8px' }}></i> Test Lab
                    </button>
                </div>

                <div style={{ padding: '32px', overflowY: 'auto', flex: 1 }}>
                    {activeTab === 'GEOGRAPHY' && (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '40px' }}>
                            {/* Cities Column */}
                            <div>
                                <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: '16px' }}>Target Cities</h3>
                                <form onSubmit={handleAddCity} style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                                    <input
                                        type="text"
                                        value={newCity}
                                        onChange={(e) => setNewCity(e.target.value)}
                                        placeholder="Add new city..."
                                        style={{ flex: 1, padding: '10px 12px', border: '1px solid var(--border-color)', borderRadius: '6px' }}
                                    />
                                    <button type="submit" style={{ padding: '0 16px', background: '#3b82f6', color: 'var(--bg-card)', border: 'none', borderRadius: '6px', fontWeight: 700, cursor: 'pointer' }}>
                                        Add
                                    </button>
                                </form>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                    {cities.map((city, idx) => (
                                        <div key={idx} style={{ padding: '6px 12px', background: 'var(--bg-light)', borderRadius: '20px', fontSize: '0.9rem', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            {city}
                                            <button
                                                onClick={() => removeKeyword('CITY', city)}
                                                style={{ border: 'none', background: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 0, fontSize: '0.8rem' }}
                                            >
                                                <i className="fas fa-times"></i>
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Locations Column */}
                            <div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                                    <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-main)', margin: 0 }}>Hubs, Projects & Localities</h3>
                                    <span style={{ fontSize: '0.75rem', padding: '2px 8px', background: '#dcfce7', color: '#166534', borderRadius: '4px', fontWeight: 700 }}>Dynamic Regex</span>
                                </div>
                                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '16px' }}>
                                    Add known projects or localities (e.g. "Green Lotus", "Aerocity"). The parser will automatically recognize these in text messages.
                                </p>

                                <form onSubmit={handleAddLocation} style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                                    <input
                                        type="text"
                                        value={newLocation}
                                        onChange={(e) => setNewLocation(e.target.value)}
                                        placeholder="Add project or locality..."
                                        style={{ flex: 1, padding: '10px 12px', border: '1px solid var(--border-color)', borderRadius: '6px' }}
                                    />
                                    <button type="submit" style={{ padding: '0 16px', background: '#10b981', color: 'var(--bg-card)', border: 'none', borderRadius: '6px', fontWeight: 700, cursor: 'pointer' }}>
                                        Add Pattern
                                    </button>
                                </form>

                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', maxHeight: '300px', overflowY: 'auto' }}>
                                    {locations.map((loc, idx) => (
                                        <div key={idx} style={{ padding: '6px 12px', background: 'var(--stat-property-bg)', border: '1px solid #bbf7d0', borderRadius: '20px', fontSize: '0.9rem', color: '#166534', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            {loc}
                                            <button
                                                onClick={() => removeKeyword('LOCATION', loc)}
                                                style={{ border: 'none', background: 'none', color: '#86efac', cursor: 'pointer', padding: 0, fontSize: '0.8rem' }}
                                            >
                                                <i className="fas fa-times"></i>
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'TYPES' && (
                        <div>
                            <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '24px' }}>
                                Manage the keywords that trigger specific property type classifications.
                                For example, adding "Studio" to "Flat" will make the parser recognize "Studio" as a Flat.
                            </p>

                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '24px' }}>
                                {categoryOrder.map(category => (
                                    parserTypes[category] && (
                                        <div key={category} style={{ background: 'var(--bg-light)', padding: '20px', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
                                            <h4 style={{ margin: '0 0 16px 0', fontSize: '1rem', fontWeight: 800, color: 'var(--text-main)' }}>{category} Keywords</h4>

                                            <form
                                                onSubmit={(e) => {
                                                    e.preventDefault();
                                                    const val = e.target.elements.newKeyword.value.trim();
                                                    if (val) {
                                                        addKeyword('TYPE', { category, word: val.toLowerCase() });
                                                        e.target.elements.newKeyword.value = '';
                                                    }
                                                }}
                                                style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}
                                            >
                                                <input
                                                    name="newKeyword"
                                                    type="text"
                                                    placeholder={`Add ${category} keyword...`}
                                                    style={{ flex: 1, padding: '8px 12px', border: '1px solid var(--border-color)', borderRadius: '6px', fontSize: '0.85rem' }}
                                                />
                                                <button type="submit" style={{ padding: '0 12px', background: '#3b82f6', color: 'var(--bg-card)', border: 'none', borderRadius: '6px', fontWeight: 700, cursor: 'pointer', fontSize: '0.85rem' }}>
                                                    Add
                                                </button>
                                            </form>

                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                                {parserTypes[category].map((word, idx) => (
                                                    <div key={idx} style={{ padding: '4px 10px', background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '16px', fontSize: '0.8rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                        {word}
                                                        <button
                                                            onClick={() => removeKeyword('TYPE', { category, word })}
                                                            style={{ border: 'none', background: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 0, fontSize: '0.7rem' }}
                                                        >
                                                            <i className="fas fa-times"></i>
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )
                                ))}
                            </div>
                        </div>
                    )}

                    {activeTab === 'TEST' && (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '32px' }}>
                            <div>
                                <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: '16px' }}>Input Text</h3>
                                <textarea
                                    value={testText}
                                    onChange={(e) => setTestText(e.target.value)}
                                    placeholder="Paste a WhatsApp message here to test parsing..."
                                    style={{ width: '100%', height: '200px', padding: '16px', border: '1px solid var(--border-color)', borderRadius: '8px', fontFamily: 'monospace', fontSize: '0.9rem', resize: 'vertical' }}
                                />
                                <div style={{ display: 'flex', gap: '12px', marginTop: '16px' }}>
                                    <button
                                        onClick={handleRunTest}
                                        style={{ flex: 2, padding: '10px 24px', background: '#8b5cf6', color: 'var(--bg-card)', border: 'none', borderRadius: '6px', fontWeight: 700, cursor: 'pointer' }}
                                    >
                                        Run Analysis
                                    </button>
                                    <button
                                        onClick={() => { setTestText(''); setTestResult(null); }}
                                        style={{ flex: 1, padding: '10px 16px', background: 'var(--bg-card)', color: 'var(--text-muted)', border: '1px solid var(--border-color)', borderRadius: '6px', fontWeight: 600, cursor: 'pointer' }}
                                    >
                                        Clear
                                    </button>
                                </div>
                            </div>

                            <div style={{ background: 'var(--bg-light)', padding: '24px', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
                                <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: '16px' }}>Live Extraction Results</h3>

                                {!testResult ? (
                                    <div style={{ color: 'var(--text-muted)', fontStyle: 'italic', textAlign: 'center', marginTop: '60px' }}>
                                        Results will appear here...
                                    </div>
                                ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                        {/* Status Tag */}
                                        <div style={{ display: 'flex', gap: '8px' }}>
                                            <span style={{
                                                background: testResult.intent === 'BUYER' ? '#dcfce7' : '#dbeafe',
                                                color: testResult.intent === 'BUYER' ? '#166534' : '#1e40af',
                                                padding: '4px 12px', borderRadius: '4px', fontWeight: 800, fontSize: '0.8rem'
                                            }}>
                                                {testResult.intent} INTENT
                                            </span>
                                            {testResult.confidence === 'High' && (
                                                <span style={{ background: '#fef3c7', color: '#92400e', padding: '4px 8px', borderRadius: '4px', fontWeight: 700, fontSize: '0.75rem' }}>
                                                    HIGH CONFIDENCE
                                                </span>
                                            )}
                                        </div>

                                        {/* Main Fields */}
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', fontSize: '0.9rem' }}>
                                            <div style={{ padding: '8px', background: 'var(--bg-card)', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                                                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>Location</div>
                                                <div style={{ fontWeight: 600, color: 'var(--text-main)' }}>{testResult.location}</div>
                                            </div>
                                            <div style={{ padding: '8px', background: 'var(--bg-card)', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                                                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>Unit</div>
                                                <div style={{ fontWeight: 600, color: 'var(--text-main)' }}>{testResult.address.unitNo || testResult.address.unitNumber || '-'}</div>
                                            </div>
                                            <div style={{ padding: '8px', background: 'var(--bg-card)', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                                                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>Type</div>
                                                <div style={{ fontWeight: 600, color: 'var(--text-main)' }}>{testResult.type} ({testResult.category})</div>
                                            </div>
                                            <div style={{ padding: '8px', background: 'var(--bg-card)', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                                                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>Price</div>
                                                <div style={{ fontWeight: 600, color: 'var(--text-main)' }}>{testResult.specs.price || '-'}</div>
                                            </div>
                                        </div>

                                        {/* Smart Tags */}
                                        {testResult.tags && testResult.tags.length > 0 && (
                                            <div>
                                                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '8px' }}>DETECTED TAGS</div>
                                                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                                    {testResult.tags.map(t => (
                                                        <span key={t} style={{ background: '#f3e8ff', color: '#6b21a8', padding: '2px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 700 }}>{t}</span>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {/* Contacts */}
                                        {testResult.allContacts && testResult.allContacts.length > 0 && (
                                            <div>
                                                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '8px' }}>CONTACTS EXTRACTED</div>
                                                {testResult.allContacts.map((c, i) => (
                                                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', marginBottom: '4px' }}>
                                                        <i className="fas fa-phone-alt" style={{ color: '#22c55e', fontSize: '0.7rem' }}></i>
                                                        <span style={{ fontWeight: 600 }}>{c.mobile}</span>
                                                        <span style={{ color: 'var(--text-muted)' }}>({typeof c.role === 'object' ? c.role?.name : c.role})</span>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ParsingRulesPage;
