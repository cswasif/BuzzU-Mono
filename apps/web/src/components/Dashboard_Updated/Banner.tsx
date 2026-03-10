
import React from 'react';
import { useSessionStore } from '../../stores/sessionStore';

interface BannerProps {
  className?: string;
  style?: React.CSSProperties;
  isPartner?: boolean;
  partnerBannerType?: 'Simple' | 'Gradient' | 'Mesh';
  partnerBannerColor?: string;
  partnerBannerGradient?: string;
}

const Banner: React.FC<BannerProps> = ({
  className = "",
  style = {},
  isPartner = false,
  partnerBannerType,
  partnerBannerColor,
  partnerBannerGradient
}) => {
  const { bannerType, bannerColor, bannerGradient } = useSessionStore();

  const type = isPartner ? partnerBannerType || 'Simple' : bannerType;
  const color = isPartner ? partnerBannerColor || '#5B21B6' : bannerColor;
  const gradient = isPartner ? partnerBannerGradient || 'linear-gradient(45deg, #d53f8c, #4f46e5)' : bannerGradient;

  const bannerStyle: React.CSSProperties = {
    width: '100%',
    height: '100%',
    ...style
  };

  if (type === 'Simple') {
    bannerStyle.backgroundColor = color;
  } else if (type === 'Gradient' || type === 'Mesh') {
    bannerStyle.backgroundImage = gradient;
  }

  return (
    <div className={`w-full h-full relative overflow-hidden ${className}`} style={bannerStyle}>
      {/* Cinematic Grain Overlay */}
      <div className="absolute inset-0 opacity-[0.03] pointer-events-none mix-blend-overlay bg-[url('https://grainy-gradients.vercel.app/noise.svg')]"></div>

      {/* Mesh Polish: Subtle luminosity layer */}
      {type === 'Mesh' && (
        <div className="absolute inset-0 bg-white/5 backdrop-blur-[2px] mix-blend-soft-light"></div>
      )}

      {/* Depth Shadow */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/20 to-transparent"></div>
    </div>
  );
};

export default Banner;
