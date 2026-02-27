
import React from 'react';
import { HappeningNow } from './HappeningNow';
import { AuthButtons } from './AuthButtons';
import { FooterLinks } from './FooterLinks';

export const SocialAuthLanding = () => {
    return (
        <div id="react-root" style={{ height: '100%', display: 'flex', flexDirection: 'column', backgroundColor: 'rgb(0,0,0)' }}>
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
                    <div dir="ltr" className="css-175oi2r r-1f2l425 r-13qz1uu r-417010" aria-hidden="false">
                        <main role="main" className="css-175oi2r r-16y2uox r-1wbh5a2">
                            <div className="css-175oi2r r-150rngu r-16y2uox r-1wbh5a2">
                                <div className="css-175oi2r r-13awgt0">
                                    <div className="css-175oi2r r-tv6buo r-791edh r-1euycsn">
                                        <div className="css-175oi2r r-1777fci r-nsbfu8 r-1qmwkkh">
                                            <div className="css-175oi2r r-1pcd2l5 r-13qz1uu r-jjmaes r-1nz9sz9">

                                                <HappeningNow />

                                                <div className="css-175oi2r">
                                                    <AuthButtons />
                                                </div>

                                            </div>
                                        </div>
                                        <div className="css-175oi2r r-1777fci r-1udh08x r-13awgt0 r-12zvaga r-t60dpp">
                                            <div className="css-175oi2r r-1p0dtai r-13awgt0 r-1777fci r-1d2f490 r-u8s1d r-zchlnj r-ipm5af">
                                                <svg viewBox="0 0 24 24" aria-hidden="true" className="r-4qtqp9 r-yyyyoo r-dnmrzs r-bnwqim r-lrvibr r-m6rgpd r-1nao33i r-rxcuwo r-1777fci r-m327ed r-494qqr">
                                                    <g>
                                                        <path d="M21.742 21.75l-7.563-11.179 7.056-8.321h-2.456l-5.691 6.714-4.54-6.714H2.359l7.29 10.776L2.25 21.75h2.456l6.035-7.118 4.818 7.118h6.191-.008zM7.739 3.818L18.81 20.182h-2.447L5.29 3.818h2.447z"></path>
                                                    </g>
                                                </svg>
                                            </div>
                                        </div>
                                    </div>

                                    <FooterLinks />

                                </div>
                            </div>
                        </main>
                        <div className="css-175oi2r" data-testid="google_sign_in_container"></div>
                    </div>
                </div>
            </div>
            <div id="give-freely-root-mbnbehikldjhnfehhnaidhjhoofhpehk" className="give-freely-root" data-extension-id="mbnbehikldjhnfehhnaidhjhoofhpehk" data-extension-name="CSS Peeper" style={{ display: 'block' }}></div>
        </div>
    );
};
