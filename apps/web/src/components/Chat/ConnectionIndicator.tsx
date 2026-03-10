import React, { useState } from 'react';
import { useConnectionType, ConnectionType } from '../../hooks/useConnectionType';

interface ConnectionIndicatorProps {
  className?: string;
  showTooltip?: boolean;
  size?: 'sm' | 'md' | 'lg';
  tooltipPlacement?: 'top' | 'bottom';
}

export function ConnectionIndicator({ className = '', showTooltip = true, size = 'sm', tooltipPlacement = 'top' }: ConnectionIndicatorProps) {
  const [isTooltipOpen, setIsTooltipOpen] = useState(false);
  const connectionInfo = useConnectionType();

  const getSizeClasses = () => {
    switch (size) {
      case 'sm':
        return 'w-3 h-3';
      case 'md':
        return 'w-4 h-4';
      case 'lg':
        return 'w-5 h-5';
      default:
        return 'w-3 h-3';
    }
  };

  const getIconAndColor = (type: ConnectionType) => {
    switch (type) {
      case 'direct':
        return {
          icon: (
            <svg className={getSizeClasses()} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-green-500" />
              <path d="M2 17L12 22L22 17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-green-500" />
              <path d="M2 12L12 17L22 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-green-500" />
            </svg>
          ),
          color: 'text-green-500',
          bgColor: 'bg-green-500/10',
          label: 'Direct P2P',
          description: 'Direct connection (STUN)'
        };
      case 'turn':
        return {
          icon: (
            <svg className={getSizeClasses()} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" className="text-orange-500" />
              <path d="M12 2C6.48 2 2 6.48 2 12C2 17.52 6.48 22 12 22" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-orange-500" />
              <path d="M12 22C17.52 22 22 17.52 22 12C22 6.48 17.52 2 12 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-orange-500" />
              <circle cx="12" cy="12" r="3" fill="currentColor" className="text-orange-500" />
            </svg>
          ),
          color: 'text-orange-500',
          bgColor: 'bg-orange-500/10',
          label: 'TURN Relay',
          description: 'Relayed through TURN server'
        };
      case 'relay':
        return {
          icon: (
            <svg className={getSizeClasses()} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M2 12H22M12 2V22" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-blue-500" />
              <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="2" fill="none" className="text-blue-500" />
            </svg>
          ),
          color: 'text-blue-500',
          bgColor: 'bg-blue-500/10',
          label: 'Relayed',
          description: 'Relayed connection'
        };
      default:
        return {
          icon: (
            <svg className={getSizeClasses()} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" className="text-gray-400" />
              <path d="M12 16V12M12 8H12.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-gray-400" />
            </svg>
          ),
          color: 'text-gray-400',
          bgColor: 'bg-gray-400/10',
          label: 'Unknown',
          description: 'Connection type unknown'
        };
    }
  };

  const { icon, color, bgColor, label, description } = getIconAndColor(connectionInfo.type);

  const tooltipPositionClass = tooltipPlacement === 'top'
    ? 'bottom-full mb-2'
    : 'top-full mt-2';

  const arrowPositionClass = tooltipPlacement === 'top'
    ? 'bottom-0 translate-y-1/2'
    : 'top-0 -translate-y-1/2';

  if (!showTooltip) {
    return (
      <div className={`${bgColor} rounded-full p-1 ${className}`}>
        <div className={color}>
          {icon}
        </div>
      </div>
    );
  }

  return (
    <div
      className="group relative cursor-pointer"
      onClick={() => setIsTooltipOpen(!isTooltipOpen)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          setIsTooltipOpen(!isTooltipOpen);
        }
      }}
    >
      <div className={`${bgColor} rounded-full p-1 ${className}`}>
        <div className={color}>
          {icon}
        </div>
      </div>

      {/* Tooltip */}
      <div className={`absolute left-1/2 transform -translate-x-1/2 transition-opacity duration-200 pointer-events-none z-50 ${tooltipPositionClass} ${isTooltipOpen ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
        <div className="bg-popover text-popover-foreground border border-border shadow-xl text-xs rounded-lg py-2 px-3 whitespace-nowrap relative">
          <div className="font-medium">{label}</div>
          <div className="text-muted-foreground text-xs mt-1">{description}</div>
          {connectionInfo.rtt && (
            <div className="text-muted-foreground text-xs mt-1">
              RTT: {connectionInfo.rtt.toFixed(0)}ms
            </div>
          )}
          <div className="text-muted-foreground text-xs mt-1">
            Protocol: {connectionInfo.protocol.toUpperCase()}
          </div>
          <div className={`absolute left-1/2 transform -translate-x-1/2 rotate-45 w-2 h-2 bg-popover border-b border-r border-border ${arrowPositionClass}`}></div>
        </div>
      </div>
    </div>
  );
}