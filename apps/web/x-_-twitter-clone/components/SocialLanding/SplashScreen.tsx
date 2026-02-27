import React, { useEffect, useState } from 'react';
import { XLogoIcon } from './Icons';
import { useTheme } from '../ThemeContext';

interface SplashScreenProps {
  onFinish: () => void;
}

export const SplashScreen: React.FC<SplashScreenProps> = ({ onFinish }) => {
  const { colors } = useTheme();
  const [step, setStep] = useState<'idle' | 'shrink' | 'zoom' | 'hidden'>('idle');

  useEffect(() => {
    // Phase 1: Idle (0ms - 600ms)
    // Logo sits still.

    // Phase 2: Shrink (600ms - 950ms)
    // Logo shrinks slightly to build momentum (Anticipation)
    const shrinkTimer = setTimeout(() => {
      setStep('shrink');
    }, 600);

    // Phase 3: Zoom (950ms+)
    // Logo zooms in massively (flying through) while fading out
    const zoomTimer = setTimeout(() => {
      setStep('zoom');
    }, 950);

    // Phase 4: Hidden (950ms + 400ms transition = 1350ms)
    // Unmount
    const finishTimer = setTimeout(() => {
      setStep('hidden');
      onFinish();
    }, 1350);

    return () => {
      clearTimeout(shrinkTimer);
      clearTimeout(zoomTimer);
      clearTimeout(finishTimer);
    };
  }, [onFinish]);

  if (step === 'hidden') return null;

  // Animation Styles
  const containerStyle: React.CSSProperties = {
    position: 'fixed',
    inset: 0,
    backgroundColor: colors.background,
    zIndex: 99999,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    // Fade out the background container as we zoom through
    opacity: step === 'zoom' ? 0 : 1,
    transition: step === 'zoom' ? 'opacity 0.3s ease-in-out' : 'none',
    pointerEvents: 'none',
  };

  const logoContainerStyle: React.CSSProperties = {
    width: '72px',
    height: '72px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    // Animation Logic
    transform:
      step === 'shrink'
        ? 'scale(0.80)'
        : step === 'zoom'
        ? 'scale(150)'
        : 'scale(1)',
    transition:
      step === 'shrink'
        ? 'transform 0.35s cubic-bezier(0.2, 0, 0, 1)' // Gentle ease-out shrink
        : step === 'zoom'
        ? 'transform 0.4s cubic-bezier(0.85, 0, 0.15, 1)' // Aggressive exponential zoom
        : 'none',
  };

  return (
    <div style={containerStyle}>
      <div style={logoContainerStyle}>
        <XLogoIcon style={{ color: colors.textPrimary, width: '100%', height: '100%', fill: 'currentColor' }} />
      </div>
    </div>
  );
};