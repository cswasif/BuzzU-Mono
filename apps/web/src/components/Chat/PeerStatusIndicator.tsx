import React from 'react';
import { usePeerStatus, PeerStatus } from '../../hooks/usePeerStatus';

interface PeerStatusIndicatorProps {
  targetPeerId?: string;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
  className?: string;
}

const STATUS_COLORS: Record<PeerStatus, { bg: string; ring: string; text: string; label: string }> = {
  online: {
    bg: 'bg-green-500',
    ring: 'ring-green-500/30',
    text: 'text-green-400',
    label: 'Online',
  },
  idle: {
    bg: 'bg-yellow-500',
    ring: 'ring-yellow-500/30',
    text: 'text-yellow-400',
    label: 'Idle',
  },
  offline: {
    bg: 'bg-gray-500',
    ring: 'ring-gray-500/30',
    text: 'text-gray-400',
    label: 'Offline',
  },
};

const SIZE_CLASSES = {
  sm: {
    indicator: 'w-2 h-2',
    ring: 'ring-2',
  },
  md: {
    indicator: 'w-3 h-3',
    ring: 'ring-2',
  },
  lg: {
    indicator: 'w-4 h-4',
    ring: 'ring-3',
  },
};

export function PeerStatusIndicator({ 
  targetPeerId, 
  size = 'md', 
  showLabel = false,
  className = '',
}: PeerStatusIndicatorProps) {
  const { status, lastSeen } = usePeerStatus(targetPeerId);
  const colors = STATUS_COLORS[status];
  const sizeClasses = SIZE_CLASSES[size];

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div className={`relative ${sizeClasses.indicator} ${colors.bg} rounded-full ${sizeClasses.ring} ${colors.ring} transition-all duration-300`}>
        <div className={`absolute inset-0 ${colors.bg} rounded-full animate-ping opacity-75 ${status === 'online' ? '' : 'hidden'}`} />
      </div>
      {showLabel && (
        <span className={`text-xs font-medium ${colors.text}`}>
          {colors.label}
        </span>
      )}
      {status === 'offline' && lastSeen && (
        <span className="text-xs text-gray-400">
          Last seen {lastSeen}
        </span>
      )}
    </div>
  );
}
