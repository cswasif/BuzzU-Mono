import React, { useEffect, useState } from 'react';
import { AuthColumn } from './AuthColumn';
import { Footer } from './Footer';
import { SplashScreen } from './SplashScreen';
import { useTheme } from '../ThemeContext';
import '../../styles.css';

const DESKTOP_IMAGES = ['/desktop1.png', '/desktop3.png'];
const MOBILE_IMAGES = ['/mobile1.png', '/mobile2.png', '/mobile3.png'];
const LANDING_TITLE = "BuzzU. It’s what’s happening at BRACU / BuzzU";
const LANDING_DESCRIPTION = "BuzzU is a BRACU‑born anonymous chat where students share rants, struggles, and campus life, open to everyone worldwide via video, voice, and text.";
const BASE_URL = "https://buzzu.wasif.app";
const LANDING_IMAGE = `${BASE_URL}/desktop1.png`;

export default function SocialLanding() {
  const { colors, theme, toggleTheme } = useTheme();
  const [loading, setLoading] = useState(true);
  const [isVideoReady, setIsVideoReady] = useState(false);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [isMobile, setIsMobile] = useState(typeof window !== 'undefined' ? window.innerWidth < 1000 : false);
  const [isFullscreen, setIsFullscreen] = useState(
    typeof document !== 'undefined' ? !!document.fullscreenElement : false
  );

  useEffect(() => {
    document.documentElement.classList.remove('verify-page');
  }, []);

  // Responsive check
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 1000);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Slideshow logic
  useEffect(() => {
    const images = isMobile ? MOBILE_IMAGES : DESKTOP_IMAGES;
    const interval = setInterval(() => {
      setCurrentImageIndex((prev) => (prev + 1) % images.length);
    }, 5000);
    return () => clearInterval(interval);
  }, [isMobile]);

  // Ensure body background and native color-scheme match current theme
  useEffect(() => {
    // Video background handles the visuals on desktop now.
    // Permanent suppression of legacy background properties on desktop to prevent flicker.
    document.documentElement.style.setProperty('--bg-image-left', 'none');
    if (isMobile) {
      const images = isMobile ? MOBILE_IMAGES : DESKTOP_IMAGES;
      const currentImg = `url("${images[currentImageIndex % images.length]}")`;
      document.documentElement.style.setProperty('--bg-image', currentImg);
    } else {
      document.documentElement.style.setProperty('--bg-image', 'none');
    }
  }, [colors, theme, isMobile, currentImageIndex]);

  // Disable scroll while loading
  useEffect(() => {
    if (loading) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
  }, [loading]);

  useEffect(() => {
    const onFullscreenChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);

  useEffect(() => {
    if (typeof document === 'undefined') {
      return;
    }

    document.title = LANDING_TITLE;

    const setMetaTag = (key: string, value: string, attr: 'name' | 'property') => {
      let tag = document.querySelector(`meta[${attr}="${key}"]`);
      if (!tag) {
        tag = document.createElement('meta');
        tag.setAttribute(attr, key);
        document.head.appendChild(tag);
      }
      tag.setAttribute('content', value);
    };

    setMetaTag('description', LANDING_DESCRIPTION, 'name');
    setMetaTag('og:title', LANDING_TITLE, 'property');
    setMetaTag('og:description', LANDING_DESCRIPTION, 'property');
    setMetaTag('og:url', `${BASE_URL}/`, 'property');
    setMetaTag('og:image', LANDING_IMAGE, 'property');
    setMetaTag('twitter:title', LANDING_TITLE, 'name');
    setMetaTag('twitter:description', LANDING_DESCRIPTION, 'name');
    setMetaTag('twitter:image', LANDING_IMAGE, 'name');

    let canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement('link');
      canonical.setAttribute('rel', 'canonical');
      document.head.appendChild(canonical);
    }
    canonical.setAttribute('href', `${BASE_URL}/`);
  }, []);

  const toggleLandingFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch (error) {
      console.warn('Fullscreen toggle failed', error);
    }
  };

  return (
    <>
      {loading && (
        <SplashScreen
          ready={isVideoReady}
          onFinish={() => setLoading(false)}
        />
      )}

      <div id="react-root" className={`landing-root-bg theme-${theme}`} data-theme={theme}>
        <div
          style={{
            position: 'absolute',
            top: 'calc(12px + env(safe-area-inset-top, 0px))',
            right: 'calc(12px + env(safe-area-inset-right, 0px))',
            zIndex: 9999,
            display: 'flex',
            gap: '8px',
            opacity: loading ? 0 : 1,
            transition: 'opacity 0.5s ease',
            pointerEvents: loading ? 'none' : 'auto'
          }}
        >
          <button
            onClick={toggleLandingFullscreen}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '8px',
              borderRadius: '50%',
              backgroundColor: theme === 'light' ? 'rgba(0, 0, 0, 0.05)' : 'rgba(255, 255, 255, 0.1)',
              color: colors.textPrimary,
            }}
            title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
            aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
          >
            {isFullscreen ? (
              <svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
                <path d="M8 3v3a2 2 0 0 1-2 2H3" />
                <path d="M21 8h-3a2 2 0 0 1-2-2V3" />
                <path d="M3 16h3a2 2 0 0 1 2 2v3" />
                <path d="M16 21v-3a2 2 0 0 1 2-2h3" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
                <path d="M8 3H5a2 2 0 0 0-2 2v3" />
                <path d="M21 8V5a2 2 0 0 0-2-2h-3" />
                <path d="M3 16v3a2 2 0 0 0 2 2h3" />
                <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
              </svg>
            )}
          </button>
          <button
            onClick={toggleTheme}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '8px',
              borderRadius: '50%',
              backgroundColor: theme === 'light' ? 'rgba(0, 0, 0, 0.05)' : 'rgba(255, 255, 255, 0.1)',
              color: colors.textPrimary,
            }}
            title="Toggle Theme"
            aria-label="Toggle Theme"
          >
            {theme === 'light' ? (
              <svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="5"></circle>
                <line x1="12" y1="1" x2="12" y2="3"></line>
                <line x1="12" y1="21" x2="12" y2="23"></line>
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
                <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
                <line x1="1" y1="12" x2="3" y2="12"></line>
                <line x1="21" y1="12" x2="23" y2="12"></line>
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
                <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
              </svg>
            ) : theme === 'dark' ? (
              <svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
              </svg>
            ) : theme === 'yellow' ? (
              <svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
              </svg>
            ) : theme === 'aura' ? (
              <svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2L15 5M12 2L9 5M12 2V10M12 22V14M12 22L15 19M12 22L9 19M2 12L5 15M2 12L5 9M2 12H10M22 12H14M22 12L19 15M22 12L19 9"></path>
                <circle cx="12" cy="12" r="3"></circle>
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"></path>
              </svg>
            )}
          </button>
        </div>

        <div className="css-175oi2r r-13awgt0 r-12vffkv">
          <div className="css-175oi2r r-13awgt0 r-12vffkv">
            <div className="r-zchlnj r-1d2f490 r-u8s1d r-ipm5af" id="layers" style={{ zIndex: 1 }}>
              <div className="css-175oi2r r-aqfbo4 r-zchlnj r-1d2f490 r-1xcajam r-1p0dtai r-12vffkv">
                <div className="css-175oi2r r-12vffkv" style={{ position: 'absolute', bottom: '0px', width: '100%', transition: 'transform 200ms ease-out', transform: 'translateY(0px)' }}>
                  <div className="css-175oi2r r-12vffkv">
                    <div className="css-175oi2r" data-testid="BottomBar"></div>
                  </div>
                </div>
              </div>
            </div>
            <div dir="ltr" className="css-175oi2r r-1f2l425 r-13qz1uu r-417010" aria-hidden={false}>
              <main role="main" className="css-175oi2r r-16y2uox r-1wbh5a2">
                <div className="css-175oi2r r-150rngu r-16y2uox r-1wbh5a2">
                  <div className="css-175oi2r r-13awgt0" style={{ minHeight: 'var(--app-height)', display: 'flex', flexDirection: 'column' }}>

                    <AuthColumn onVideoReady={() => setIsVideoReady(true)} />

                    <Footer />

                  </div>
                </div>
              </main>
              <div className="css-175oi2r" data-testid="google_sign_in_container"></div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
