import React, { useEffect, useState } from 'react';
import { BuzzULogoIcon } from './Icons.tsx';
import { useTheme } from '../ThemeContext';

interface SplashScreenProps {
  onFinish: () => void;
  ready?: boolean;
}

export const SplashScreen: React.FC<SplashScreenProps> = ({ onFinish, ready = false }) => {
  const { colors } = useTheme();
  const [step, setStep] = useState<'idle' | 'shrink' | 'zoom' | 'hidden'>('idle');
  const [hasStartedExit, setHasStartedExit] = useState(false);

  useEffect(() => {
    // Phase 1: Idle (0ms - 600ms)
    // Logo sits still. Wait at least 600ms before doing anything.
    const idleTimer = setTimeout(() => {
      // Just a marker
    }, 200);
    return () => clearTimeout(idleTimer);
  }, []);

  useEffect(() => {
    // Once video is ready OR if we've waited too long (safety), start the exit sequence
    // But don't start it BEFORE the minimum idle time (handled by flow)
    const safetyTimeout = setTimeout(() => {
      if (!hasStartedExit) setHasStartedExit(true);
    }, 3500); // 3.5s max wait for video

    if (ready && !hasStartedExit) {
      setHasStartedExit(true);
    }

    return () => clearTimeout(safetyTimeout);
  }, [ready, hasStartedExit]);

  useEffect(() => {
    if (!hasStartedExit) return;

    // Phase 2: Shrink (built momentum)
    setStep('shrink');

    // Phase 3: Zoom (350ms after shrink)
    const zoomTimer = setTimeout(() => {
      setStep('zoom');
    }, 350);

    // Phase 4: Hidden (400ms after zoom)
    const finishTimer = setTimeout(() => {
      setStep('hidden');
      onFinish();
    }, 750);

    return () => {
      clearTimeout(zoomTimer);
      clearTimeout(finishTimer);
    };
  }, [hasStartedExit, onFinish]);

  if (step === 'hidden') return null;

  // Animation Styles
  const containerStyle: React.CSSProperties = {
    position: 'fixed',
    inset: 0,
    backgroundColor: '#000',
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
    width: '120px',
    height: '120px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    // Animation Logic
    transform:
      step === 'shrink'
        ? 'scale(0.85)'
        : step === 'zoom'
          ? 'scale(100)'
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
        <BuzzULogoIcon style={{ color: colors.accent, width: '100%', height: '100%', fill: 'currentColor' }} />
      </div>
    </div>
  );
};