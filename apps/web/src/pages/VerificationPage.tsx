import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useSessionStore } from '../stores/sessionStore';
import { BuzzULogoIcon } from '../../components/SocialLanding/Icons';
import { verifyGoogleIdToken } from '../lib/verifyGoogleToken';
import '../verify.css';

// Google identity services types
declare global {
    interface Window {
        google: any;
    }
}

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;

export const VerificationPage: React.FC = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { setVerified, initSession } = useSessionStore();
    const googleBtnRef = useRef<HTMLDivElement>(null);
    const [gsiReady, setGsiReady] = useState(false);
    const [verifyError, setVerifyError] = useState<string | null>(null);
    const [verifying, setVerifying] = useState(false);

    /** Cryptographically verify the token using Google's public keys */
    const handleCredential = useCallback(async (token: string) => {
        setVerifying(true);
        setVerifyError(null);
        try {
            // Full RSA-SHA256 signature verification + claim validation
            const identity = await verifyGoogleIdToken(token, GOOGLE_CLIENT_ID);
            console.log('[BuzzU] ✅ Cryptographic verification passed:', identity.email);
            setVerified(identity.email, token);
            navigate('/chat/new');
        } catch (err: any) {
            console.error('[BuzzU] ❌ Cryptographic verification failed:', err.message);
            if (err.message.includes('domain')) {
                setVerifyError('Please use your BracU GSuite account (@g.bracu.ac.bd).');
            } else if (err.message.includes('expired')) {
                setVerifyError('Your session has expired. Please try again.');
            } else if (err.message.includes('SIGNATURE')) {
                setVerifyError('Security verification failed. Token signature is invalid.');
            } else {
                setVerifyError('Verification failed. Please try again.');
            }
        } finally {
            setVerifying(false);
        }
    }, [setVerified, navigate]);

    /** Standard callback handler (for One Tap success) */
    const handleCallbackResponse = useCallback((response: any) => {
        if (response.credential) {
            handleCredential(response.credential);
        }
    }, [handleCredential]);

    /** Recover token from hash (post-redirect) */
    useEffect(() => {
        const hash = window.location.hash;
        if (hash.startsWith('#token=')) {
            const token = hash.substring(7);
            // Clear hash for cleaner URL and security
            window.history.replaceState(null, '', window.location.pathname);
            handleCredential(token);
        }
    }, [handleCredential]);

    /** Wait for GSI library */
    useEffect(() => {
        const checkGsi = setInterval(() => {
            if (window.google?.accounts?.id) {
                clearInterval(checkGsi);
                setGsiReady(true);
            }
        }, 100);
        return () => clearInterval(checkGsi);
    }, []);

    /** Initialize Google Identity Services */
    useEffect(() => {
        if (!gsiReady || !window.google) return;

        window.google.accounts.id.initialize({
            client_id: GOOGLE_CLIENT_ID,
            callback: handleCallbackResponse,
            auto_select: true,            // Auto-select if only one account
            ux_mode: 'redirect',          // Force redirect instead of popup
            login_uri: window.location.origin + '/verify',
        });

        // Trigger One Tap overlay
        window.google.accounts.id.prompt();

        // Render inline button (uses redirect mode, so NO POPUP window)
        if (googleBtnRef.current) {
            // Calculate a safe width for mobile (max 400, but fit container)
            const parentWidth = googleBtnRef.current.clientWidth || 320;
            const btnWidth = Math.min(parentWidth, 400);

            window.google.accounts.id.renderButton(googleBtnRef.current, {
                theme: 'filled_black',
                size: 'large',
                width: btnWidth,
                text: 'continue_with',
                shape: 'pill',
            });
        }
    }, [gsiReady, handleCallbackResponse]);

    const handleGuestMode = () => {
        initSession();
        navigate('/chat/new');
    };

    return (
        <div className="text-foreground bg-background h-full min-h-screen w-full relative overflow-hidden font-sans">
            <div className="bg absolute h-screen w-screen bg-[url('https://proxy.extractcss.dev/https://app.chitchat.gg/middle.svg')] bg-center bg-repeat opacity-50" />
            <div className="absolute h-screen w-screen bg-[url('https://proxy.extractcss.dev/https://app.chitchat.gg/wave-gd.svg')] bg-contain bg-top bg-no-repeat opacity-80" />
            <div className="absolute h-screen w-screen bg-[url('https://proxy.extractcss.dev/https://app.chitchat.gg/wave.svg')] bg-contain bg-bottom bg-no-repeat opacity-80" />

            <main className="flex items-center !justify-center p-4 sm:p-8 min-h-screen relative z-10 w-full">
                <div className="flex-row rounded-xl bg-card shadow-2xl sm:h-auto w-full sm:max-w-md max-w-sm mx-auto border border-white/5 overflow-hidden">
                    <div className="flex flex-col justify-start gap-4 self-center p-4 sm:p-8 text-start">
                        <div className="flex flex-row items-center justify-center self-center sm:self-start mb-2">
                            <BuzzULogoIcon className="w-8 h-8 sm:w-10 sm:h-10 mr-2 text-[#f5a623]" />
                            <span className="font-bold text-foreground text-lg sm:text-xl tracking-tight">BuzzU</span>
                        </div>

                        <div className="flex flex-col py-1 px-2 gap-1.5">
                            <h1 className="self-center text-2xl font-bold sm:self-start text-foreground">Be Yourself.</h1>
                            <p className="text-center text-sm opacity-80 sm:text-start text-foreground/70">
                                Seamlessly verify your <span className="text-[#f5a623] font-semibold">g.bracu.ac.bd</span> email without popups.
                            </p>

                            <div className="flex flex-col items-center gap-4 w-full mt-6">
                                <div ref={googleBtnRef} className="w-full flex justify-center !min-h-[44px]">
                                    {!gsiReady && <div className="w-full h-[44px] bg-zinc-800/50 rounded-full animate-pulse flex items-center justify-center text-xs text-foreground/30">Loading...</div>}
                                </div>

                                {verifyError && (
                                    <p className="text-red-400 text-xs text-center bg-red-500/10 border border-red-500/20 rounded-md px-3 py-2 w-full">
                                        {verifyError}
                                    </p>
                                )}

                                <div className="flex items-center cursor-default py-2 text-sm w-full text-foreground/40">
                                    <div className="shrink-0 bg-white/10 h-[1px] flex-grow mr-1.5" /> or <div className="shrink-0 bg-white/10 h-[1px] flex-grow ml-1.5" />
                                </div>

                                <button
                                    className="bg-zinc-800 text-white text-sm h-12 flex items-center justify-center border border-white/10 rounded-md shadow-lg px-6 py-3 font-bold hover:bg-zinc-700 w-full transition-all hover:scale-[1.02] active:scale-[0.98] uppercase tracking-widest"
                                    onClick={handleGuestMode}
                                >
                                    Enter Guest Mode
                                </button>
                            </div>

                            <p className="text-[11px] text-foreground/40 mt-8 text-center leading-relaxed">
                                Privacy First • Redirect Flow • Zero Popup Experience
                            </p>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
};

export default VerificationPage;
