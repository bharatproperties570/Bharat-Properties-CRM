import React, { useState, useEffect, useRef } from 'react';
import { api } from '../../utils/api';
import toast from 'react-hot-toast';
import { MAP_CENTER } from '../../utils/mapUtils';
import { usePropertyConfig } from '../../context/PropertyConfigContext';
import { fixDriveUrl } from '../../utils/helpers';

const labelStyle = { display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '4px' };
const selectStyle = { width: '100%', padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-gray)', color: 'var(--text-main)', fontSize: '0.8rem' };
const inputStyle = { width: '100%', padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-gray)', color: 'var(--text-main)', fontSize: '0.8rem' };

const getRotatableOverlayClass = () => {
    if (window.RotatableOverlay) return window.RotatableOverlay;
    
    class RotatableOverlay extends window.google.maps.OverlayView {
        constructor(bounds, image, map, rotation, opacity) {
            super();
            this.bounds_ = bounds;
            this.image_ = image;
            this.map_ = map;
            this.rotation_ = rotation || 0;
            this.opacity_ = opacity || 1.0;
            this.div_ = null;
            this.img_ = null;
            this.setMap(map);
        }
        
        onAdd() {
            this.div_ = document.createElement('div');
            this.div_.style.borderStyle = 'none';
            this.div_.style.borderWidth = '0px';
            this.div_.style.position = 'absolute';
            this.div_.style.pointerEvents = 'none'; // allow clicking through to map/rectangle
            
            this.img_ = document.createElement('img');
            this.img_.src = this.image_;
            this.img_.onerror = () => {
                console.error("Map Image failed to load:", this.image_);
                window.dispatchEvent(new CustomEvent('map-image-error', { detail: { url: this.image_ } }));
            };
            this.img_.style.width = '100%';
            this.img_.style.height = '100%';
            this.img_.style.position = 'absolute';
            this.img_.style.opacity = this.opacity_;
            this.div_.appendChild(this.img_);
            
            const panes = this.getPanes();
            panes.overlayLayer.appendChild(this.div_);
        }
        
        draw() {
            const overlayProjection = this.getProjection();
            if (!overlayProjection) return;
            const sw = overlayProjection.fromLatLngToDivPixel(new window.google.maps.LatLng(this.bounds_.south, this.bounds_.west));
            const ne = overlayProjection.fromLatLngToDivPixel(new window.google.maps.LatLng(this.bounds_.north, this.bounds_.east));
            
            this.div_.style.left = sw.x + 'px';
            this.div_.style.top = ne.y + 'px';
            this.div_.style.width = (ne.x - sw.x) + 'px';
            this.div_.style.height = (sw.y - ne.y) + 'px';
            this.div_.style.transform = `rotate(${this.rotation_}deg)`;
        }
        
        onRemove() {
            if (this.div_) {
                this.div_.parentNode.removeChild(this.div_);
                this.div_ = null;
            }
        }
        
        setRotation(rotation) {
            this.rotation_ = rotation;
            if (this.div_) {
                this.div_.style.transform = `rotate(${this.rotation_}deg)`;
            }
        }
        
        setBounds(bounds) {
            this.bounds_ = bounds;
            this.draw();
        }

        setOpacity(opacity) {
            this.opacity_ = opacity;
            if (this.img_) this.img_.style.opacity = opacity;
        }
    }
    
    window.RotatableOverlay = RotatableOverlay;
    return RotatableOverlay;
};

const ProjectMasterPlanTab = ({ project, onProjectUpdate }) => {
    const { propertyConfig, sizes, masterFields } = usePropertyConfig();
    const mapRef = useRef(null);
    const googleMapRef = useRef(null);
    const overlayRef = useRef(null);
    const rectRef = useRef(null);
    const clickListenerRef = useRef(null);
    const markersRef = useRef([]);

    const [masterPlan, setMasterPlan] = useState(project?.masterPlan || null);
    const [isUploading, setIsUploading] = useState(false);
    const [isEditMode, setIsEditMode] = useState(masterPlan ? !masterPlan.isLocked : true);
    const [isPlottingMode, setIsPlottingMode] = useState(false);
    
    // Bounds & Rotation state for saving
    const [currentBounds, setCurrentBounds] = useState(masterPlan?.bounds || null);
    const [currentRotation, setCurrentRotation] = useState(masterPlan?.rotation || 0);
    const [currentOpacity, setCurrentOpacity] = useState(masterPlan?.opacity || 0.6);

    // Plotting form state
    const [dynamicBlocks, setDynamicBlocks] = useState([]);
    const [plotConfig, setPlotConfig] = useState({
        block: '',
        category: 'Residential',
        subCategory: 'Plot',
        unitType: '',
        direction: '',
        facing: '',
        roadWidth: '',
        sizeConfig: '',
        startNumber: 1
    });

    const [sessionUnits, setSessionUnits] = useState([]); // Units created in this session
    const [isSavingUnits, setIsSavingUnits] = useState(false);

    // Fetch dynamic blocks (reusing similar logic from BulkInventoryModal)
    useEffect(() => {
        const fetchBlocks = async () => {
            try {
                // For safety, rely on project existing blocks if no specific endpoint
                const pBlocks = (project.blocks || []).map(b => b.name);
                setDynamicBlocks(pBlocks);
            } catch (err) {
                console.error("Error fetching blocks", err);
            }
        };
        fetchBlocks();
    }, [project]);

    // Initialize map
    useEffect(() => {
        if (!masterPlan?.imageUrl) return;
        if (!window.google || !window.google.maps) {
            toast.error("Google Maps API not loaded");
            return;
        }

        let center = MAP_CENTER;
        if (currentBounds && typeof currentBounds.north === 'number' && typeof currentBounds.south === 'number') {
            center = { lat: (currentBounds.north + currentBounds.south) / 2, lng: (currentBounds.east + currentBounds.west) / 2 };
        } else if (project.geoPoint?.coordinates?.length === 2) {
            const lat = parseFloat(project.geoPoint.coordinates[1]);
            const lng = parseFloat(project.geoPoint.coordinates[0]);
            if (!isNaN(lat) && !isNaN(lng)) center = { lat, lng };
        }

        if (!googleMapRef.current && mapRef.current) {
            googleMapRef.current = new window.google.maps.Map(mapRef.current, {
                center: center,
                zoom: 17,
                mapTypeId: 'satellite',
                mapTypeControl: true,
                streetViewControl: false,
                fullscreenControl: true,
            });

            // Render immediately, Google Maps handles projection readiness in draw()
            renderOverlayAndEditor();
        } else {
            renderOverlayAndEditor();
        }

    }, [masterPlan?.imageUrl, isEditMode]); // Re-render when edit mode toggles

    const renderOverlayAndEditor = () => {
        if (!googleMapRef.current || !masterPlan) return;

        // Clear existing
        if (overlayRef.current) overlayRef.current.setMap(null);
        if (rectRef.current) rectRef.current.setMap(null);

        const bounds = currentBounds || {
            north: googleMapRef.current.getCenter().lat() + 0.001,
            south: googleMapRef.current.getCenter().lat() - 0.001,
            east: googleMapRef.current.getCenter().lng() + 0.001,
            west: googleMapRef.current.getCenter().lng() - 0.001,
        };

        setCurrentBounds(bounds);

        const absoluteImageUrl = fixDriveUrl(masterPlan.imageUrl);
        const RotatableOverlayClass = getRotatableOverlayClass();

        // Render Custom Overlay
        overlayRef.current = new RotatableOverlayClass(
            bounds, 
            absoluteImageUrl, 
            googleMapRef.current, 
            currentRotation, 
            currentOpacity
        );

        if (isEditMode) {
            // Render Editable Rectangle
            rectRef.current = new window.google.maps.Rectangle({
                bounds: bounds,
                editable: true,
                draggable: true,
                map: googleMapRef.current,
                fillOpacity: 0,
                strokeColor: '#3b82f6',
                strokeWeight: 2
            });

            rectRef.current.addListener('bounds_changed', () => {
                const newBoundsObj = rectRef.current.getBounds();
                const newBounds = {
                    north: newBoundsObj.getNorthEast().lat(),
                    south: newBoundsObj.getSouthWest().lat(),
                    east: newBoundsObj.getNorthEast().lng(),
                    west: newBoundsObj.getSouthWest().lng(),
                };
                setCurrentBounds(newBounds);
                
                // Update bounds directly without destroying
                if (overlayRef.current) overlayRef.current.setBounds(newBounds);
            });
        }
    };

    // Update rotation and opacity dynamically
    useEffect(() => {
        if (overlayRef.current) {
            overlayRef.current.setRotation(currentRotation);
            overlayRef.current.setOpacity(currentOpacity);
        }
    }, [currentRotation, currentOpacity, isEditMode, masterPlan?.opacity]);

    // Plotting Click Listener
    useEffect(() => {
        if (!googleMapRef.current) return;

        if (isPlottingMode) {
            googleMapRef.current.setOptions({ draggableCursor: 'crosshair' });
            
            clickListenerRef.current = googleMapRef.current.addListener('click', (e) => {
                handleMapClick(e.latLng.lat(), e.latLng.lng());
            });
        } else {
            googleMapRef.current.setOptions({ draggableCursor: '' });
            if (clickListenerRef.current) {
                window.google.maps.event.removeListener(clickListenerRef.current);
            }
        }

        const handleImageError = (e) => {
            toast.error(`Map image failed to load. The URL might be broken or blocked by CORS. URL: ${e.detail?.url}`);
        };
        window.addEventListener('map-image-error', handleImageError);

        return () => {
            if (clickListenerRef.current) {
                window.google.maps.event.removeListener(clickListenerRef.current);
            }
            window.removeEventListener('map-image-error', handleImageError);
        };
    }, [isPlottingMode, plotConfig]); // Depend on plotConfig so click handler uses latest values

    const handleMapClick = (lat, lng) => {
        if (!plotConfig.block) {
            return toast.error("Please select a block first!");
        }

        const unitNumber = `${plotConfig.startNumber}`;
        
        // Extract project team ID safely
        const teamData = project.teams || project.team;
        let teamId = null;
        if (Array.isArray(teamData) && teamData.length > 0) {
            teamId = teamData[0]?._id || teamData[0];
        } else if (teamData && !Array.isArray(teamData)) {
            teamId = teamData._id || teamData;
        }
        
        const newUnit = {
            projectId: project._id,
            projectName: project.name,
            block: plotConfig.block,
            category: plotConfig.category,
            subCategory: plotConfig.subCategory,
            unitType: plotConfig.unitType,
            direction: plotConfig.direction,
            facing: plotConfig.facing,
            roadWidth: plotConfig.roadWidth,
            sizeConfig: plotConfig.sizeConfig,
            unitNo: unitNumber,
            unitNumber: unitNumber,
            status: 'Inactive', 
            isActive: true,
            intent: ['For Sale'],
            latitude: lat.toFixed(6),
            longitude: lng.toFixed(6),
            team: teamId ? [teamId] : [],
            visibleTo: project.visibleTo || 'Everyone'
        };

        setSessionUnits(prev => [...prev, newUnit]);
        setPlotConfig(prev => ({ ...prev, startNumber: prev.startNumber + 1 }));

        // Drop a marker for visual feedback
        const marker = new window.google.maps.Marker({
            position: { lat, lng },
            map: googleMapRef.current,
            label: { text: unitNumber, color: '#fff', fontSize: '10px', fontWeight: 'bold' },
            title: `Unit ${unitNumber} - Click to Undo`,
            icon: {
                path: window.google.maps.SymbolPath.CIRCLE,
                scale: 12,
                fillColor: '#ef4444', // Red to stand out
                fillOpacity: 1,
                strokeColor: '#ffffff',
                strokeWeight: 2,
            }
        });

        // Add Undo functionality on click
        marker.addListener('click', () => {
            marker.setMap(null);
            setSessionUnits(prev => prev.filter(u => u.unitNo !== unitNumber));
            markersRef.current = markersRef.current.filter(m => m !== marker);
            toast.success(`Removed Unit ${unitNumber}`);
        });

        markersRef.current.push(marker);
    };

    const handleImageUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        // Ensure it's an image
        if (!file.type.startsWith('image/')) {
            return toast.error("Please upload an Image file (JPG/PNG), not a PDF.");
        }

        setIsUploading(true);
        const fd = new FormData();
        fd.append('file', file);
        try {
            const res = await api.post('/upload', fd);
            if (res.data?.url) {
                const newPlan = {
                    imageUrl: res.data.url,
                    bounds: null,
                    rotation: 0,
                    isLocked: false
                };
                setMasterPlan(newPlan);
                await api.put(`/projects/${project._id}`, { masterPlan: newPlan });
                toast.success("Layout Map uploaded successfully! Please align it.");
                setIsEditMode(true);
                // Removed onProjectUpdate() here to prevent map component from unmounting and losing local state
            }
        } catch (err) {
            toast.error("Failed to upload image");
            console.error(err);
        } finally {
            setIsUploading(false);
        }
    };

    const handleSaveLayout = async () => {
        if (!currentBounds) return;
        try {
            const newPlan = { ...masterPlan, bounds: currentBounds, rotation: currentRotation, opacity: currentOpacity, isLocked: true };
            
            // Auto update project location based on map center
            const centerLat = (currentBounds.north + currentBounds.south) / 2;
            const centerLng = (currentBounds.east + currentBounds.west) / 2;
            
            await api.put(`/projects/${project._id}`, { 
                masterPlan: newPlan,
                latitude: String(centerLat),
                longitude: String(centerLng)
            });
            
            setMasterPlan(newPlan);
            setIsEditMode(false);
            toast.success("Layout Map configuration saved.");
            // Removed onProjectUpdate() to prevent unmount
        } catch (err) {
            toast.error("Failed to save layout bounds");
            console.error(err);
        }
    };

    const handleSavePlottingSession = async () => {
        if (sessionUnits.length === 0) return toast.error("No units to save");
        setIsSavingUnits(true);
        try {
            const res = await api.post('/inventory/bulk-add', { items: sessionUnits });
            if (res.data?.success) {
                toast.success(`Successfully saved ${sessionUnits.length} units!`);
                setSessionUnits([]);
                // Keep markers but change color to indicate saved
                markersRef.current.forEach(m => m.setIcon({ ...m.getIcon(), fillColor: '#3b82f6' }));
            }
        } catch (err) {
            toast.error("Error saving units");
            console.error(err);
        } finally {
            setIsSavingUnits(false);
        }
    };

    const handleRemoveMap = async () => {
        if (!window.confirm("Are you sure you want to remove the map? This will delete the uploaded image and georeferencing.")) return;
        try {
            await api.put(`/projects/${project._id}`, { masterPlan: null });
            setMasterPlan(null);
            if (overlayRef.current) overlayRef.current.setMap(null);
            if (rectRef.current) rectRef.current.setMap(null);
            setMasterPlan(null);
            setCurrentBounds(null);
            toast.success("Layout Map removed.");
            // Removed onProjectUpdate() to prevent unmount
        } catch (err) {
            toast.error("Failed to remove map");
            console.error(err);
        }
    };

    const clearSession = () => {
        setSessionUnits([]);
        markersRef.current.forEach(m => m.setMap(null));
        markersRef.current = [];
    };

    if (!masterPlan?.imageUrl) {
        return (
            <div style={{ padding: '40px', textAlign: 'center', background: 'var(--bg-card)', borderRadius: '12px', border: '1px dashed var(--border-color)' }}>
                <div style={{ fontSize: '3rem', color: 'var(--primary)', marginBottom: '16px' }}>
                    <i className="fas fa-map"></i>
                </div>
                <h3 style={{ margin: '0 0 12px 0', color: 'var(--text-main)' }}>Upload Master Plan</h3>
                <p style={{ color: 'var(--text-muted)', marginBottom: '24px', maxWidth: '500px', margin: '0 auto 24px auto' }}>
                    Upload a high-quality Image (PNG/JPG) of the project's layout map to georeference it on Google Maps and start rapid bulk plotting.
                </p>
                <input type="file" id="map-upload" accept="image/*" style={{ display: 'none' }} onChange={handleImageUpload} />
                <button 
                    onClick={() => document.getElementById('map-upload').click()} 
                    style={{ padding: '12px 24px', background: 'var(--primary)', color: '#ffffff', borderRadius: '8px', fontWeight: 600, border: 'none', cursor: 'pointer', opacity: isUploading ? 0.7 : 1 }}
                    disabled={isUploading}
                >
                    {isUploading ? <><i className="fas fa-spinner fa-spin" style={{marginRight: '8px', color: '#ffffff'}}></i> Uploading...</> : <><i className="fas fa-upload" style={{marginRight: '8px', color: '#ffffff'}}></i> Choose Image File</>}
                </button>
            </div>
        );
    }

    return (
        <div style={{ position: 'relative', height: '100%', width: '100%', overflow: 'hidden' }}>
            
            {/* Top Toolbar */}
            <div style={{ position: 'absolute', top: '16px', left: '50%', transform: 'translateX(-50%)', zIndex: 10, display: 'flex', gap: '12px', background: 'var(--bg-card)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', padding: '8px 16px', borderRadius: '30px', boxShadow: '0 4px 12px rgba(0,0,0,0.3)', alignItems: 'center', border: '1px solid var(--border-color)' }}>
                {isEditMode ? (
                    <>
                        <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#ef4444' }}><i className="fas fa-arrows-alt" style={{marginRight: '6px'}}></i> Resize box</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: '12px' }}>
                            <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-main)' }}>Rotate:</label>
                            <input 
                                type="range" 
                                min="0" max="360" 
                                value={currentRotation} 
                                onChange={(e) => setCurrentRotation(Number(e.target.value))} 
                                style={{ width: '80px' }}
                            />
                            <span style={{ fontSize: '0.8rem', fontWeight: 600, width: '30px', color: 'var(--text-main)' }}>{currentRotation}°</span>
                        </div>
                        <button onClick={handleSaveLayout} style={{ padding: '6px 16px', background: '#10b981', color: '#fff', border: 'none', borderRadius: '20px', fontWeight: 700, cursor: 'pointer' }}>
                            <i className="fas fa-lock" style={{marginRight: '6px'}}></i> Lock Layout
                        </button>
                    </>
                ) : (
                    <>
                        <button onClick={() => { setIsEditMode(true); setIsPlottingMode(false); }} style={{ padding: '6px 16px', background: 'var(--bg-gray)', color: 'var(--text-main)', border: '1px solid var(--border-color)', borderRadius: '20px', fontWeight: 600, cursor: 'pointer' }}>
                            <i className="fas fa-unlock" style={{marginRight: '6px'}}></i> Adjust Map
                        </button>
                        <button onClick={handleRemoveMap} style={{ padding: '6px 16px', background: '#fee2e2', color: '#ef4444', border: '1px solid #fca5a5', borderRadius: '20px', fontWeight: 600, cursor: 'pointer' }}>
                            <i className="fas fa-trash" style={{marginRight: '6px'}}></i> Remove Map
                        </button>
                        
                        <div style={{ width: '1px', height: '20px', background: 'var(--border-color)', margin: '0 8px' }}></div>
                        
                        <button 
                            onClick={() => setIsPlottingMode(!isPlottingMode)} 
                            style={{ padding: '6px 16px', background: isPlottingMode ? '#ef4444' : 'var(--primary)', color: '#fff', border: 'none', borderRadius: '20px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
                        >
                            {isPlottingMode ? <><i className="fas fa-times"></i> Stop Plotting</> : <><i className="fas fa-bolt"></i> Start Rapid Plotting</>}
                        </button>
                    </>
                )}
                
                <div style={{ width: '1px', height: '20px', background: 'var(--border-color)', margin: '0 8px' }}></div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-main)' }}>Opacity:</label>
                    <input 
                        type="range" 
                        min="0" max="1" step="0.1"
                        value={currentOpacity} 
                        onChange={(e) => setCurrentOpacity(Number(e.target.value))} 
                        style={{ width: '60px' }}
                    />
                    <span style={{ fontSize: '0.8rem', fontWeight: 600, width: '30px', color: 'var(--text-main)' }}>{Math.round(currentOpacity * 100)}%</span>
                </div>
            </div>

            {/* Rapid Plotting Sidebar */}
            {isPlottingMode && (
                <div style={{ position: 'absolute', top: '80px', right: '16px', zIndex: 10, width: '280px', background: 'var(--bg-card)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', borderRadius: '12px', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.5)', padding: '16px', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: 'calc(100% - 100px)', overflowY: 'auto' }}>
                    <h4 style={{ margin: 0, fontSize: '1rem', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <i className="fas fa-bolt" style={{ color: '#f59e0b' }}></i> Plotting Mode
                    </h4>
                    
                    <div style={{ background: '#fef3c7', color: '#92400e', padding: '8px 12px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 600 }}>
                        Click anywhere on the map to instantly drop a unit pin.
                    </div>

                    <div>
                        <label style={labelStyle}>Block / Tower <span style={{color: 'red'}}>*</span></label>
                        <select style={selectStyle} value={plotConfig.block} onChange={e => setPlotConfig({...plotConfig, block: e.target.value})}>
                            <option value="">Select Block</option>
                            {dynamicBlocks.map(b => <option key={b} value={b}>{b}</option>)}
                        </select>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                        <div>
                            <label style={labelStyle}>Category</label>
                            <select style={selectStyle} value={plotConfig.category} onChange={e => setPlotConfig({...plotConfig, category: e.target.value, subCategory: '', unitType: ''})}>
                                <option value="Residential">Residential</option>
                                <option value="Commercial">Commercial</option>
                                <option value="Industrial">Industrial</option>
                                <option value="Agricultural">Agricultural</option>
                                <option value="Institutional">Institutional</option>
                            </select>
                        </div>
                        <div>
                            <label style={labelStyle}>Sub Category</label>
                            <select style={selectStyle} value={plotConfig.subCategory} onChange={e => setPlotConfig({...plotConfig, subCategory: e.target.value})}>
                                <option value="">Select Sub Category</option>
                                {((propertyConfig[plotConfig.category] || {}).subCategories || []).map(sc => (
                                    <option key={sc.name} value={sc.name}>{sc.name}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                        <div>
                            <label style={labelStyle}>Unit Type</label>
                            <select style={selectStyle} value={plotConfig.unitType} onChange={e => setPlotConfig({...plotConfig, unitType: e.target.value})}>
                                <option value="">Select Unit Type</option>
                                {(masterFields?.unitTypes || ['Ordinary', 'Corner', 'Two Side Open', 'Three Side Open']).map(t => {
                                    const val = typeof t === 'object' ? (t.lookup_value || t.name) : t;
                                    const id = typeof t === 'object' ? (t._id || t.id) : t;
                                    return <option key={id} value={val.toLowerCase()}>{val}</option>;
                                })}
                            </select>
                        </div>
                        <div>
                            <label style={labelStyle}>Size / Config</label>
                            <select style={selectStyle} value={plotConfig.sizeConfig} onChange={e => setPlotConfig({...plotConfig, sizeConfig: e.target.value})}>
                                <option value="">Select Size (Optional)</option>
                                {sizes?.filter(s => 
                                    (s.project === project?.name || s.projectId === project?._id) && 
                                    s.block === plotConfig.block
                                ).map(s => (
                                    <option key={s.id || s._id} value={s.value || s._id || s.name}>{s.label || s.name}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <hr style={{ border: 'none', borderTop: '1px solid var(--border-color)', margin: '4px 0' }} />
                    <h4 style={{ margin: '0', fontSize: '0.85rem', color: '#10b981', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <i className="fas fa-compass"></i> Orientation & Features
                    </h4>

                    <div style={{ display: 'flex', gap: '8px' }}>
                        <div style={{ flex: 1 }}>
                            <label style={labelStyle}>Direction</label>
                            <select style={selectStyle} value={plotConfig.direction} onChange={e => setPlotConfig({...plotConfig, direction: e.target.value})}>
                                <option value="">Select</option>
                                <option value="East">East</option>
                                <option value="West">West</option>
                                <option value="North">North</option>
                                <option value="South">South</option>
                                <option value="North-East">North-East</option>
                                <option value="North-West">North-West</option>
                                <option value="South-East">South-East</option>
                                <option value="South-West">South-West</option>
                            </select>
                        </div>
                        <div style={{ flex: 1 }}>
                            <label style={labelStyle}>Facing</label>
                            <select style={selectStyle} value={plotConfig.facing} onChange={e => setPlotConfig({...plotConfig, facing: e.target.value})}>
                                <option value="">Select</option>
                                {masterFields?.facings?.map(f => <option key={f} value={f}>{f}</option>)}
                            </select>
                        </div>
                    </div>
                    
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <div style={{ flex: 1 }}>
                            <label style={labelStyle}>Road W. (ft)</label>
                            <select style={selectStyle} value={plotConfig.roadWidth} onChange={e => setPlotConfig({...plotConfig, roadWidth: e.target.value})}>
                                <option value="">Select</option>
                                {masterFields?.roadWidths?.map(r => <option key={r} value={r}>{r}</option>)}
                            </select>
                        </div>
                        <div style={{ width: '80px' }}>
                            <label style={labelStyle}>Next #</label>
                            <input type="number" style={inputStyle} value={plotConfig.startNumber} onChange={e => setPlotConfig({...plotConfig, startNumber: parseInt(e.target.value) || 1})} />
                        </div>
                    </div>

                    <hr style={{ border: 'none', borderTop: '1px solid var(--border-color)', margin: '4px 0' }} />

                    <div style={{ flex: 1, overflowY: 'auto' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                            <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)' }}>Session Units: {sessionUnits.length}</span>
                            {sessionUnits.length > 0 && <button onClick={clearSession} style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: '0.75rem', cursor: 'pointer' }}>Clear</button>}
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                            {sessionUnits.map((u, i) => (
                                <span key={i} style={{ background: 'var(--bg-gray)', padding: '2px 6px', borderRadius: '4px', fontSize: '0.7rem', color: 'var(--text-main)', border: '1px solid var(--border-color)' }}>
                                    {u.unitNo}
                                </span>
                            ))}
                        </div>
                    </div>

                    <button 
                        onClick={handleSavePlottingSession} 
                        disabled={sessionUnits.length === 0 || isSavingUnits}
                        style={{ width: '100%', padding: '10px', background: sessionUnits.length > 0 ? '#10b981' : 'var(--bg-gray)', color: sessionUnits.length > 0 ? '#fff' : 'var(--text-muted)', border: 'none', borderRadius: '8px', fontWeight: 700, cursor: sessionUnits.length > 0 ? 'pointer' : 'not-allowed', marginTop: 'auto' }}
                    >
                        {isSavingUnits ? <i className="fas fa-spinner fa-spin"></i> : `Save ${sessionUnits.length} Units`}
                    </button>
                </div>
            )}

            {/* Google Map Container */}
            <div ref={mapRef} style={{ width: '100%', height: '100%', background: '#e2e8f0' }}></div>
        </div>
    );
};

export default ProjectMasterPlanTab;
