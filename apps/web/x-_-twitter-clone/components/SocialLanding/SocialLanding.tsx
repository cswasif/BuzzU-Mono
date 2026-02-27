
import React, { useEffect, useState } from 'react';
import { AuthColumn } from './AuthColumn';
import { Footer } from './Footer';
import { SplashScreen } from './SplashScreen';
import { useTheme } from '../ThemeContext';

export default function SocialLanding() {
  const { colors, theme, toggleTheme } = useTheme();
  const [loading, setLoading] = useState(true);

  // Ensure body background and native color-scheme match current theme
  useEffect(() => {
    document.body.style.backgroundColor = colors.background;
    document.body.style.color = colors.textPrimary;
    
    // Set CSS variables for dynamic hover effects
    document.documentElement.style.setProperty('--accent-hover-bg', colors.accentHoverBg);
    document.documentElement.style.setProperty('--button-hover-bg', colors.buttonHoverBg);
    
    // Updates scrollbars and system UI
    document.documentElement.style.colorScheme = theme === 'light' ? 'light' : 'dark';
  }, [colors, theme]);

  // Disable scroll while loading
  useEffect(() => {
      if (loading) {
          document.body.style.overflow = 'hidden';
      } else {
          document.body.style.overflow = '';
      }
  }, [loading]);

  return (
    <>
      {loading && <SplashScreen onFinish={() => setLoading(false)} />}
      
      <div id="react-root" style={{minHeight: '100vh', width: '100%', display: 'flex', backgroundColor: colors.background, color: colors.textPrimary, transition: 'background-color 0.2s ease, color 0.2s ease' }}>
         {/* Theme Toggle Button */}
        <button
          onClick={toggleTheme}
          style={{
            position: 'absolute',
            top: '20px',
            right: '20px',
            zIndex: 9999,
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: '8px',
            borderRadius: '50%',
            backgroundColor: theme === 'light' ? 'rgba(0, 0, 0, 0.05)' : 'rgba(255, 255, 255, 0.1)',
            color: colors.textPrimary,
            opacity: loading ? 0 : 1, // Hide toggle during splash
            transition: 'opacity 0.5s ease',
            pointerEvents: loading ? 'none' : 'auto'
          }}
          title="Toggle Theme"
          aria-label="Toggle Theme"
        >
          {theme === 'light' ? (
             // Sun Icon
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
             // Moon Icon
            <svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
            </svg>
          ) : theme === 'yellow' ? (
            // Star Icon for Default/Yellow
            <svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
            </svg>
          ) : (
             // Flower/Feather-like Icon for Lavender
             <svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"></path>
             </svg>
          )}
        </button>
  
        <div className="css-175oi2r r-13awgt0 r-12vffkv">
          <div className="css-175oi2r r-13awgt0 r-12vffkv">
            <div className="r-zchlnj r-1d2f490 r-u8s1d r-ipm5af" id="layers" style={{zIndex: 1}}>
              <div className="css-175oi2r r-aqfbo4 r-zchlnj r-1d2f490 r-1xcajam r-1p0dtai r-12vffkv">
                <div className="css-175oi2r r-12vffkv" style={{position: 'absolute', bottom: '0px', width: '100%', transition: 'transform 200ms ease-out', transform: 'translateY(0px)'}}>
                  <div className="css-175oi2r r-12vffkv">
                    <div className="css-175oi2r" data-testid="BottomBar"></div>
                  </div>
                </div>
              </div>
            </div>
            <div dir="ltr" className="css-175oi2r r-1f2l425 r-13qz1uu r-417010" aria-hidden={false}>
              <main role="main" className="css-175oi2r r-16y2uox r-1wbh5a2">
                <div className="css-175oi2r r-150rngu r-16y2uox r-1wbh5a2">
                  <div className="css-175oi2r r-13awgt0" style={{minHeight: '100vh', display: 'flex', flexDirection: 'column'}}>
                    
                    <AuthColumn />
                    
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
