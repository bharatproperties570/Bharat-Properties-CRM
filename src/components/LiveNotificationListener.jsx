import React, { useEffect } from 'react';
import toast from 'react-hot-toast';

const LiveNotificationListener = ({ onNavigate }) => {
    useEffect(() => {
        const handleNewNotification = (e) => {
            const { newNotifications } = e.detail || {};
            if (!newNotifications || !Array.isArray(newNotifications)) return;

            newNotifications.forEach(notif => {
                // Focus specifically on WhatsApp Flow feedback for the futuristic toast
                // or any other critical real-time notification
                if (notif.title && notif.title.includes('Flow Feedback Received')) {
                    
                    toast.custom((t) => (
                        <div
                            onClick={() => {
                                toast.dismiss(t.id);
                                if (notif.link && onNavigate) onNavigate(notif.link.replace(/^\//, ''));
                            }}
                            className={`${
                                t.visible ? 'animate-enter' : 'animate-leave'
                            } max-w-md w-full bg-white shadow-2xl rounded-lg pointer-events-auto flex ring-1 ring-black ring-opacity-5 cursor-pointer transform transition-all hover:scale-105`}
                            style={{ 
                                borderLeft: '4px solid #10b981', // green accent
                                overflow: 'hidden',
                                position: 'relative'
                            }}
                        >
                            <div className="flex-1 w-0 p-4 relative z-10">
                                <div className="flex items-start">
                                    <div className="flex-shrink-0 pt-0.5">
                                        <div className="h-10 w-10 rounded-full bg-green-100 flex items-center justify-center shadow-inner">
                                            <i className="fab fa-whatsapp text-green-600 text-xl"></i>
                                        </div>
                                    </div>
                                    <div className="ml-3 flex-1">
                                        <p className="text-sm font-bold text-gray-900 mb-1">
                                            {notif.title}
                                        </p>
                                        <p className="text-sm text-gray-600 whitespace-pre-wrap leading-tight">
                                            {notif.message}
                                        </p>
                                    </div>
                                </div>
                            </div>
                            <div className="flex border-l border-gray-100 relative z-10 bg-gray-50 hover:bg-gray-100 transition-colors">
                                <button
                                    onClick={(evt) => {
                                        evt.stopPropagation();
                                        toast.dismiss(t.id);
                                    }}
                                    className="w-full border border-transparent rounded-none rounded-r-lg p-4 flex items-center justify-center text-sm font-medium text-gray-500 hover:text-gray-700 focus:outline-none"
                                >
                                    Dismiss
                                </button>
                            </div>
                            {/* Futuristic glowing effect overlay */}
                            <div className="absolute inset-0 pointer-events-none" style={{
                                background: 'linear-gradient(90deg, rgba(16,185,129,0) 0%, rgba(16,185,129,0.05) 50%, rgba(16,185,129,0) 100%)',
                                animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite'
                            }}></div>
                        </div>
                    ), {
                        duration: 8000,
                        position: 'top-right',
                    });
                }
            });
        };

        window.addEventListener('new-notification-alert', handleNewNotification);

        return () => {
            window.removeEventListener('new-notification-alert', handleNewNotification);
        };
    }, [onNavigate]);

    return null; // This is a logic-only component
};

export default LiveNotificationListener;
