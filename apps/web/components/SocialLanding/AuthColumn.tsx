import React, { useState, useCallback } from 'react';
import { AppleIcon, GoogleIcon, GrokIcon, BuzzULogoIcon } from './Icons.tsx';
import { useTheme } from '../ThemeContext';
import { VideoBackground, VideoSegment } from './VideoBackground';
import { createPortal } from 'react-dom';
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion';

const VIDEOS: VideoSegment[] = [
  { videoId: "1FVF-9KQiPo", start: 200, end: 260 }, // Taylor Swift - Wildest Dreams (Default)
  { videoId: "IpFX2vq8HKw", start: 30, end: 110 }, // yung kai - blue
  { videoId: "3tmd-ClpJxA", start: 72, end: 190, aspectRatio: "21:9" }, // Taylor Swift - Look What You Made Me Do
  { videoId: "c8zq4kAn_O0", start: 36, end: 107 }, // Sombr - Back to Friends
  { videoId: "H5v3kku4y6Q", start: 30, end: 110 }, // Harry Styles - As It Was
  { videoId: "Z4-g8UXa944", start: 45, end: 125 }, // Damiano David - Born With a Broken Heart
  { videoId: "vBHild0PiTE", start: 50, end: 130 }, // Lana Del Rey - Chemtrails
  { videoId: "V9PVRfjEBTI", start: 45, end: 120 }, // Billie Eilish - BIRDS OF A FEATHER
  { videoId: "wycjnCCgUes", start: 75, end: 145 }, // Tame Impala - Feels Like We Only Go Backwards
  { videoId: "b55LT-tmGxE", start: 237, end: 292 }  // The Weeknd - Call Out My Name
];

// Create an offset version for the mirrored background to make it look like a "different" video
const MIRRORED_VIDEOS: VideoSegment[] = VIDEOS.map(v => ({
  ...v,
  start: v.start + 30,
  end: v.end + 30
}));

export const AuthColumn = ({ onVideoReady }: { onVideoReady?: () => void }) => {
  const { colors, theme } = useTheme();
  const [currentIndex, setCurrentIndex] = useState(() => 0);
  const [isMuted, setIsMuted] = useState(true);
  const [isMobile, setIsMobile] = useState(false);

  // Hardware-accelerated Motion Values for tilt
  const mouseX = useMotionValue(0.5);
  const mouseY = useMotionValue(0.5);

  // Smooth springs for high-end feel
  const springConfig = { stiffness: 150, damping: 20, mass: 0.5 };
  const rotateX = useSpring(useTransform(mouseY, [0, 1], [3, -3]), springConfig);
  const rotateY = useSpring(useTransform(mouseX, [0, 1], [-3, 3]), springConfig);

  // Mouse tilt logic
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isMobile) return;
    const { clientX, clientY } = e;
    const { innerWidth, innerHeight } = window;
    mouseX.set(clientX / innerWidth);
    mouseY.set(clientY / innerHeight);
  }, [isMobile, mouseX, mouseY]);

  const handleMouseLeave = useCallback(() => {
    mouseX.set(0.5);
    mouseY.set(0.5);
  }, [mouseX, mouseY]);

  // Responsive check
  React.useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const handleVideoEnd = useCallback(() => {
    setCurrentIndex((prevIndex) => {
      let nextIndex;
      do {
        nextIndex = Math.floor(Math.random() * VIDEOS.length);
      } while (nextIndex === prevIndex && VIDEOS.length > 1);
      return nextIndex;
    });
  }, []);

  const toggleMute = () => setIsMuted(!isMuted);

  const muteButton = (
    <button
      className="mute-btn"
      onClick={toggleMute}
      aria-label={isMuted ? "Unmute video" : "Mute video"}
    >
      {isMuted ? (
        <svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
          <line x1="23" y1="9" x2="17" y2="15"></line>
          <line x1="17" y1="9" x2="23" y2="15"></line>
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
          <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>
        </svg>
      )}
    </button>
  );

  return (
    <div
      className="css-175oi2r r-tv6buo r-791edh r-1euycsn"
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      {/* Right Column: Content */}
      <motion.div
        className="css-175oi2r r-1777fci r-nsbfu8 r-1qmwkkh glass-panel"
        style={{
          rotateX: !isMobile ? rotateX : 0,
          rotateY: !isMobile ? rotateY : 0,
          perspective: 1000,
          willChange: 'transform'
        }}
      >
        {/* Mirrored Background Video specifically for the right side - Desktop Only */}
        {!isMobile && (
          <div className="mirrored-video-container">
            <VideoBackground
              videos={MIRRORED_VIDEOS}
              currentIndex={currentIndex}
              isMuted={true}
              onVideoEnd={handleVideoEnd}
              mirrored={true}
              fallbackImage="/assets/buzzu_fallback_right.jpg"
              cropBlackBars={true}
              filterSide="none"
            />
          </div>
        )}

        <div className="css-175oi2r r-1pcd2l5 r-13qz1uu r-jjmaes r-1nz9sz9 fade-in-up">
          <div dir="ltr" className="css-146c3p1 r-bcqeeo r-1ttztb7 r-qvutc0 r-fm7h5w r-b88u0q r-19oahor r-nm9kes r-1ncnki0 r-8g1505">
            <span className="css-1jxf684 r-bcqeeo r-1ttztb7 r-qvutc0 r-poiln3">Buzzing now</span>
          </div>
          <div dir="ltr" className="css-146c3p1 r-bcqeeo r-1ttztb7 r-qvutc0 r-fm7h5w r-1yjpyg1 r-ueyrd6 r-b88u0q r-zd98yo">
            <span className="css-1jxf684 r-bcqeeo r-1ttztb7 r-qvutc0 r-poiln3">Join today.</span>
          </div>

          {/* Privacy Banner */}
          <div dir="ltr" className="css-146c3p1 r-bcqeeo r-1ttztb7 r-qvutc0 r-fm7h5w r-1inkyih r-rjixqe r-b88u0q r-13awgt0 r-117bsoe r-17w48nw" style={{ marginBottom: '28px', borderLeft: `4px solid ${colors.accent}`, paddingLeft: '16px' }}>
            <span className="css-1jxf684 r-bcqeeo r-1ttztb7 r-qvutc0 r-poiln3" style={{ fontSize: '18px', fontWeight: 900, letterSpacing: '-0.5px', textTransform: 'uppercase', opacity: 1, color: 'inherit' }}>No Sign Up. No Logs.</span>
          </div>

          <div className="css-175oi2r">
            {/* Create Account Button (Renamed to Start Buzzing) */}
            <a href="/verify" role="link" className={`css-175oi2r r-sdzlij r-1phboty r-rs99b7 r-lrvibr r-17w48nw r-a9p05 r-eu3ka r-1ifxtd0 r-1ipicw7 r-2yi16 r-1qi8awa r-3pj75a r-o7ynqc r-6416eg r-1ny4l3l r-1loqt21 btn-hover-accent`} data-testid="signupButton" style={{ backgroundColor: colors.accent, borderColor: 'rgba(0, 0, 0, 0)', marginBottom: '8px' }}>
              <div dir="ltr" className="css-146c3p1 r-qvutc0 r-1qd0xha r-q4m81j r-a023e6 r-rjixqe r-b88u0q r-1awozwy r-6koalj r-18u37iz r-16y2uox r-bcqeeo r-1777fci" style={{ color: (theme === 'light' || theme === 'lavender') ? '#fff' : '#000', backgroundColor: 'transparent' }}>
                <div className="css-175oi2r r-xoduu5">
                  <span className="css-1jxf684 r-dnmrzs r-1udh08x r-1udbk01 r-3s2u2q r-bcqeeo r-1ttztb7 r-qvutc0 r-poiln3 r-a023e6 r-rjixqe" style={{ fontWeight: 700 }}><span className="css-1jxf684 r-bcqeeo r-1ttztb7 r-qvutc0 r-poiln3">Start Buzzing</span></span>
                </div>
              </div>
            </a>

            <div dir="ltr" className="css-146c3p1 r-bcqeeo r-1ttztb7 r-qvutc0 r-1qd0xha r-1gkfh8e r-56xrmm r-16dba41 r-13awgt0 r-117bsoe r-17w48nw" style={{ color: colors.textSecondary, fontSize: '11px', lineHeight: '12px', marginBottom: '20px' }}>
              By signing up, you agree to the <a href="https://x.com/tos" rel="noopener noreferrer nofollow" target="_blank" role="link" className="css-1jxf684 r-bcqeeo r-1ttztb7 r-qvutc0 r-poiln3 r-1loqt21" style={{ color: colors.accent }}><span className="css-1jxf684 r-bcqeeo r-1ttztb7 r-qvutc0 r-poiln3">Terms of Service</span></a>
              and <a href="https://x.com/privacy" rel="noopener noreferrer nofollow" target="_blank" role="link" className="css-1jxf684 r-bcqeeo r-1ttztb7 r-qvutc0 r-poiln3 r-1loqt21" style={{ color: colors.accent }}><span className="css-1jxf684 r-bcqeeo r-1ttztb7 r-qvutc0 r-poiln3">Privacy Policy</span></a>,
              including <a href="https://help.x.com/rules-and-policies/twitter-cookies" rel="noopener noreferrer nofollow" target="_blank" role="link" className="css-1jxf684 r-bcqeeo r-1ttztb7 r-qvutc0 r-poiln3 r-1loqt21" style={{ color: colors.accent }}><span className="css-1jxf684 r-bcqeeo r-1ttztb7 r-qvutc0 r-poiln3">Cookie Use.</span></a>
            </div>

            <div className="css-175oi2r r-2o02ov" style={{ marginTop: '32px', gap: '12px', display: 'flex', flexDirection: 'column' }}>
              {/* Safety & Guidelines Group */}
              <a href="/safety" role="link" className="css-175oi2r r-sdzlij r-1phboty r-rs99b7 r-lrvibr r-17w48nw r-a9p05 r-eu3ka r-1ifxtd0 r-1ipicw7 r-2yi16 r-1qi8awa r-3pj75a r-o7ynqc r-6416eg r-1ny4l3l r-1loqt21 btn-hover-outline" data-testid="safetyButton" style={{ backgroundColor: 'rgba(0, 0, 0, 0)', borderColor: colors.buttonBorder }}>
                <div dir="ltr" className="css-146c3p1 r-qvutc0 r-1qd0xha r-q4m81j r-a023e6 r-rjixqe r-b88u0q r-1awozwy r-6koalj r-18u37iz r-16y2uox r-bcqeeo r-1777fci" style={{ color: colors.accent, backgroundColor: 'transparent' }}>
                  <div className="css-175oi2r r-xoduu5">
                    <span className="css-1jxf684 r-dnmrzs r-1udh08x r-1udbk01 r-3s2u2q r-bcqeeo r-1ttztb7 r-qvutc0 r-poiln3 r-a023e6 r-rjixqe" style={{ fontWeight: 700 }}><span className="css-1jxf684 r-bcqeeo r-1ttztb7 r-qvutc0 r-poiln3">Safety Center</span></span>
                  </div>
                </div>
              </a>

              <a href="/guidelines" role="link" className={`css-175oi2r r-sdzlij r-1phboty r-rs99b7 r-lrvibr r-17w48nw r-a9p05 r-eu3ka r-1ifxtd0 r-1ipicw7 r-2yi16 r-1qi8awa r-3pj75a r-o7ynqc r-6416eg r-1ny4l3l r-1loqt21 btn-hover-outline`} style={{ backgroundColor: 'rgba(0, 0, 0, 0)', alignSelf: 'flex-start', borderColor: colors.buttonBorder }}>
                <div dir="ltr" className="css-146c3p1 r-qvutc0 r-1qd0xha r-q4m81j r-a023e6 r-rjixqe r-b88u0q r-1awozwy r-6koalj r-18u37iz r-16y2uox r-bcqeeo r-1777fci" style={{ backgroundColor: 'transparent' }}>
                  <div className="css-175oi2r r-xoduu5">
                    <span className="css-1jxf684 r-dnmrzs r-1udh08x r-1udbk01 r-3s2u2q r-bcqeeo r-1ttztb7 r-qvutc0 r-poiln3 r-a023e6 r-rjixqe"><span className="css-1jxf684 r-bcqeeo r-1ttztb7 r-qvutc0 r-poiln3 r-majxgm r-1noe1sz"><span className="css-1jxf684 r-bcqeeo r-1ttztb7 r-qvutc0 r-poiln3">Community Guidelines</span></span></span>
                  </div>
                </div>
              </a>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Left Column: Logo & Primary Video */}
      <div className="css-175oi2r r-1777fci r-1udh08x r-13awgt0 r-12zvaga r-t60dpp">
        <VideoBackground
          videos={VIDEOS}
          currentIndex={currentIndex}
          isMuted={isMuted}
          onVideoEnd={handleVideoEnd}
          onReady={onVideoReady}
          fallbackImage="/assets/buzzu_fallback_left.png"
          cropBlackBars={true}
          filterSide="none"
        />
        <div className="hero-background-image" />
        <div className="css-175oi2r r-1p0dtai r-13awgt0 r-1777fci r-1d2f490 r-u8s1d r-zchlnj r-ipm5af mobile-hero-logo">
          <BuzzULogoIcon style={{ color: colors.accent, height: '100%', width: '100%' }} />
        </div>
      </div>

      {!isMobile && typeof document !== 'undefined' && createPortal(muteButton, document.body)}
    </div>
  );
};
