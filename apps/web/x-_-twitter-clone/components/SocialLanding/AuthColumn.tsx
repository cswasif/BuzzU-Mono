
import React from 'react';
import { AppleIcon, GoogleIcon, GrokIcon, XLogoIcon } from './Icons';
import { useTheme } from '../ThemeContext';

export const AuthColumn = () => {
  const { colors, theme } = useTheme();

  return (
    <div className="css-175oi2r r-tv6buo r-791edh r-1euycsn">
      {/* Right Column: Content */}
      <div className="css-175oi2r r-1777fci r-nsbfu8 r-1qmwkkh">
        <div className="css-175oi2r r-1pcd2l5 r-13qz1uu r-jjmaes r-1nz9sz9">
          <div dir="ltr" className="css-146c3p1 r-bcqeeo r-1ttztb7 r-qvutc0 r-fm7h5w r-b88u0q r-19oahor r-nm9kes r-1ncnki0 r-8g1505">
            <span className="css-1jxf684 r-bcqeeo r-1ttztb7 r-qvutc0 r-poiln3" style={{ color: colors.textPrimary }}>Happening now</span>
          </div>
          <div dir="ltr" className="css-146c3p1 r-bcqeeo r-1ttztb7 r-qvutc0 r-fm7h5w r-1yjpyg1 r-ueyrd6 r-b88u0q r-zd98yo">
            <span className="css-1jxf684 r-bcqeeo r-1ttztb7 r-qvutc0 r-poiln3" style={{ color: colors.textPrimary }}>Join today.</span>
          </div>
          <div className="css-175oi2r">
            {/* Google Button */}
            <button role="button" className="css-175oi2r r-sdzlij r-1phboty r-rs99b7 r-lrvibr r-17w48nw r-a9p05 r-eu3ka r-1ipicw7 r-p1pxzi r-2yi16 r-1qi8awa r-3pj75a r-1loqt21 r-o7ynqc r-6416eg r-1ny4l3l btn-hover-white" data-testid="google_sign_in_button" type="button" style={{borderColor: colors.buttonBorder, backgroundColor: 'rgb(255, 255, 255)', marginBottom: '8px'}}>
              <div dir="ltr" className="css-146c3p1 r-qvutc0 r-1qd0xha r-q4m81j r-a023e6 r-rjixqe r-16dba41 r-1awozwy r-6koalj r-18u37iz r-16y2uox r-bcqeeo r-1777fci" style={{color: 'rgb(15, 20, 25)'}}>
                <div className="r-1gs4q39">
                  <GoogleIcon />
                </div>
                <div className="css-175oi2r r-xoduu5">
                  <span className="css-1jxf684 r-dnmrzs r-1udh08x r-1udbk01 r-3s2u2q r-bcqeeo r-1ttztb7 r-qvutc0 r-poiln3 r-a023e6 r-rjixqe" style={{fontWeight: 500}}><span className="css-1jxf684 r-bcqeeo r-1ttztb7 r-qvutc0 r-poiln3">Sign up with Google</span></span>
                </div>
              </div>
            </button>
            
            {/* Apple Button */}
            <button role="button" className="css-175oi2r r-sdzlij r-1phboty r-rs99b7 r-lrvibr r-17w48nw r-a9p05 r-eu3ka r-1ipicw7 r-p1pxzi r-2yi16 r-1qi8awa r-3pj75a r-1loqt21 btn-hover-white" data-testid="apple_sign_in_button" type="button" style={{borderColor: colors.buttonBorder, backgroundColor: 'rgb(255, 255, 255)', marginBottom: '8px'}}>
              <div dir="ltr" className="css-146c3p1 r-qvutc0 r-1qd0xha r-q4m81j r-a023e6 r-rjixqe r-16dba41 r-1awozwy r-6koalj r-18u37iz r-16y2uox r-bcqeeo r-1777fci" style={{color: 'rgb(15, 20, 25)'}}>
                <AppleIcon />
                <div className="css-175oi2r r-xoduu5">
                  <span className="css-1jxf684 r-dnmrzs r-1udh08x r-1udbk01 r-3s2u2q r-bcqeeo r-1ttztb7 r-qvutc0 r-poiln3 r-a023e6 r-rjixqe" style={{fontWeight: 700}}><span className="css-1jxf684 r-bcqeeo r-1ttztb7 r-qvutc0 r-poiln3">Sign up with Apple</span></span>
                </div>
              </div>
            </button>
            
            {/* Divider */}
            <div className="css-175oi2r r-l00any r-17w48nw r-1ipicw7" style={{marginBottom: '8px'}}>
              <div className="css-175oi2r r-l00any r-18u37iz r-bvopu0 r-1awozwy">
                <div className="css-175oi2r r-13awgt0 r-1777fci r-1iusvr4 r-bcqeeo r-1537yvj">
                  <div className="css-175oi2r r-109y4c4" style={{ backgroundColor: colors.line, height: '1px' }}></div>
                </div>
                <div className="css-175oi2r r-hvzyjp r-bcqeeo r-1537yvj" style={{paddingLeft: '4px', paddingRight: '4px'}}>
                  <div dir="ltr" className="css-146c3p1 r-bcqeeo r-1ttztb7 r-qvutc0 r-1qd0xha r-a023e6 r-rjixqe r-16dba41" style={{color: colors.textPrimary}}>
                    <span className="css-1jxf684 r-bcqeeo r-1ttztb7 r-qvutc0 r-poiln3">OR</span>
                  </div>
                </div>
                <div className="css-175oi2r r-13awgt0 r-1777fci r-1iusvr4 r-bcqeeo r-1537yvj">
                  <div className="css-175oi2r r-109y4c4" style={{ backgroundColor: colors.line, height: '1px' }}></div>
                </div>
              </div>
            </div>

            {/* Create Account Button */}
            <a href="/i/flow/signup" role="link" className={`css-175oi2r r-sdzlij r-1phboty r-rs99b7 r-lrvibr r-17w48nw r-a9p05 r-eu3ka r-1ifxtd0 r-1ipicw7 r-2yi16 r-1qi8awa r-3pj75a r-o7ynqc r-6416eg r-1ny4l3l r-1loqt21 btn-hover-accent`} data-testid="signupButton" style={{backgroundColor: colors.accent, borderColor: 'rgba(0, 0, 0, 0)', marginBottom: '8px'}}>
              <div dir="ltr" className="css-146c3p1 r-qvutc0 r-1qd0xha r-q4m81j r-a023e6 r-rjixqe r-b88u0q r-1awozwy r-6koalj r-18u37iz r-16y2uox r-bcqeeo r-1777fci" style={{color: theme === 'light' ? '#fff' : '#000'}}>
                <div className="css-175oi2r r-xoduu5">
                  <span className="css-1jxf684 r-dnmrzs r-1udh08x r-1udbk01 r-3s2u2q r-bcqeeo r-1ttztb7 r-qvutc0 r-poiln3 r-a023e6 r-rjixqe" style={{fontWeight: 700}}><span className="css-1jxf684 r-bcqeeo r-1ttztb7 r-qvutc0 r-poiln3">Create account</span></span>
                </div>
              </div>
            </a>

            <div dir="ltr" className="css-146c3p1 r-bcqeeo r-1ttztb7 r-qvutc0 r-1qd0xha r-1gkfh8e r-56xrmm r-16dba41 r-13awgt0 r-117bsoe r-17w48nw" style={{color: colors.textSecondary, fontSize: '11px', lineHeight: '12px', marginBottom: '20px'}}>
              By signing up, you agree to the <a href="https://x.com/tos" rel="noopener noreferrer nofollow" target="_blank" role="link" className="css-1jxf684 r-bcqeeo r-1ttztb7 r-qvutc0 r-poiln3 r-1loqt21" style={{color: colors.accent}}><span className="css-1jxf684 r-bcqeeo r-1ttztb7 r-qvutc0 r-poiln3">Terms of Service</span></a>
              and <a href="https://x.com/privacy" rel="noopener noreferrer nofollow" target="_blank" role="link" className="css-1jxf684 r-bcqeeo r-1ttztb7 r-qvutc0 r-poiln3 r-1loqt21" style={{color: colors.accent}}><span className="css-1jxf684 r-bcqeeo r-1ttztb7 r-qvutc0 r-poiln3">Privacy Policy</span></a>,
              including <a href="https://help.x.com/rules-and-policies/twitter-cookies" rel="noopener noreferrer nofollow" target="_blank" role="link" className="css-1jxf684 r-bcqeeo r-1ttztb7 r-qvutc0 r-poiln3 r-1loqt21" style={{color: colors.accent}}><span className="css-1jxf684 r-bcqeeo r-1ttztb7 r-qvutc0 r-poiln3">Cookie Use.</span></a>
            </div>

            <div className="css-175oi2r r-2o02ov" style={{marginTop: '40px', marginBottom: '20px'}}>
              <div dir="ltr" className="css-146c3p1 r-bcqeeo r-1ttztb7 r-qvutc0 r-1qd0xha r-1inkyih r-rjixqe r-b88u0q r-13awgt0 r-117bsoe r-17w48nw" style={{color: colors.textPrimary, marginBottom: '20px'}}>
                <span className="css-1jxf684 r-bcqeeo r-1ttztb7 r-qvutc0 r-poiln3" style={{fontSize: '17px', fontWeight: 700}}>Already have an account?</span>
              </div>

              {/* Sign In Button */}
              <a href="/login" role="link" className="css-175oi2r r-sdzlij r-1phboty r-rs99b7 r-lrvibr r-17w48nw r-a9p05 r-eu3ka r-1ifxtd0 r-1ipicw7 r-2yi16 r-1qi8awa r-3pj75a r-o7ynqc r-6416eg r-1ny4l3l r-1loqt21 btn-hover-outline" data-testid="loginButton" style={{backgroundColor: 'rgba(0, 0, 0, 0)', borderColor: colors.buttonBorder}}>
                <div dir="ltr" className="css-146c3p1 r-qvutc0 r-1qd0xha r-q4m81j r-a023e6 r-rjixqe r-b88u0q r-1awozwy r-6koalj r-18u37iz r-16y2uox r-bcqeeo r-1777fci" style={{color: colors.accent}}>
                  <div className="css-175oi2r r-xoduu5">
                    <span className="css-1jxf684 r-dnmrzs r-1udh08x r-1udbk01 r-3s2u2q r-bcqeeo r-1ttztb7 r-qvutc0 r-poiln3 r-a023e6 r-rjixqe" style={{fontWeight: 700}}><span className="css-1jxf684 r-bcqeeo r-1ttztb7 r-qvutc0 r-poiln3">Sign in</span></span>
                  </div>
                </div>
              </a>
            </div>
          </div>
          
          <a href="https://grok.com/" rel="noopener noreferrer nofollow" target="_blank" role="link" className={`css-175oi2r r-sdzlij r-1phboty r-rs99b7 r-lrvibr r-17w48nw r-a9p05 r-eu3ka r-1ifxtd0 r-1ipicw7 r-l4nmg1 r-vmopo1 r-2yi16 r-1qi8awa r-3pj75a r-o7ynqc r-6416eg r-1ny4l3l r-1loqt21 btn-hover-outline`} style={{backgroundColor: 'rgba(0, 0, 0, 0)', alignSelf: 'flex-start', borderColor: colors.buttonBorder}}>
            <div dir="ltr" className="css-146c3p1 r-qvutc0 r-1qd0xha r-q4m81j r-a023e6 r-rjixqe r-b88u0q r-1awozwy r-6koalj r-18u37iz r-16y2uox r-bcqeeo r-1777fci" style={{color: colors.textPrimary}}>
               <GrokIcon />
              <div className="css-175oi2r r-xoduu5">
                <span className="css-1jxf684 r-dnmrzs r-1udh08x r-1udbk01 r-3s2u2q r-bcqeeo r-1ttztb7 r-qvutc0 r-poiln3 r-a023e6 r-rjixqe"><span className="css-1jxf684 r-bcqeeo r-1ttztb7 r-qvutc0 r-poiln3 r-majxgm r-1noe1sz"><span className="css-1jxf684 r-bcqeeo r-1ttztb7 r-qvutc0 r-poiln3">Get Grok</span></span></span>
              </div>
            </div>
          </a>

        </div>
      </div>

       {/* Left Column: Logo */}
       <div className="css-175oi2r r-1777fci r-1udh08x r-13awgt0 r-12zvaga r-t60dpp">
        <div className="css-175oi2r r-1p0dtai r-13awgt0 r-1777fci r-1d2f490 r-u8s1d r-zchlnj r-ipm5af">
            <XLogoIcon style={{color: colors.textPrimary, height: '100%', width: '100%'}} />
        </div>
      </div>
    </div>
  );
};
