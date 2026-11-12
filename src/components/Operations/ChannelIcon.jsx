import React from 'react';
import {
  MessageCircle,
  Smartphone,
  Mail,
  MessagesSquare,
  Globe,
  Camera,
  Briefcase,
  Phone,
  Building2,
  Upload,
  Download,
  Zap,
  Bot,
  Activity,
} from 'lucide-react';

const channelConfig = {
  whatsapp: { icon: MessageCircle, color: '#22c55e', label: 'WhatsApp' },
  sms: { icon: Smartphone, color: '#3b82f6', label: 'SMS' },
  email: { icon: Mail, color: '#a855f7', label: 'Email' },
  rcs: { icon: MessagesSquare, color: '#14b8a6', label: 'RCS' },
  facebook: { icon: Globe, color: '#3b82f6', label: 'Facebook' },
  instagram: { icon: Camera, color: '#ec4899', label: 'Instagram' },
  linkedin: { icon: Briefcase, color: '#1d4ed8', label: 'LinkedIn' },
  voice: { icon: Phone, color: '#22c55e', label: 'Voice Call' },
  ai_calling: { icon: Phone, color: '#22c55e', label: 'AI Calling' },
  portal: { icon: Building2, color: '#f59e0b', label: 'Portal' },
  import: { icon: Upload, color: '#6366f1', label: 'Import' },
  export: { icon: Download, color: '#10b981', label: 'Export' },
  automation: { icon: Zap, color: '#eab308', label: 'Automation' },
  ai: { icon: Bot, color: '#8b5cf6', label: 'AI' },
};

const defaultConfig = { icon: Activity, color: '#6b7280', label: 'Unknown' };

export function getChannelLabel(channel) {
  if (!channel) return defaultConfig.label;
  const config = channelConfig[channel.toLowerCase()];
  return config ? config.label : channel.charAt(0).toUpperCase() + channel.slice(1);
}

export default function ChannelIcon({ channel, size = 16, className = '' }) {
  const key = channel ? channel.toLowerCase() : '';
  const config = channelConfig[key] || defaultConfig;
  const IconComponent = config.icon;

  return (
    <IconComponent
      size={size}
      className={className}
      style={{ color: config.color }}
    />
  );
}
