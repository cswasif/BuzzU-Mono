import React, { useState, useEffect, useRef, useCallback } from 'react';
import { VenetianMask, Loader2, Sun, Moon } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { BuzzULogoIcon } from '../../components/SocialLanding/Icons';
import { useSessionStore } from '../stores/sessionStore';
import { verifyGoogleIdToken } from '../lib/verifyGoogleToken';
import '../verify.css';

// Google identity services types
declare global {
    interface Window {
        google: any;
    }
}

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;

const GoogleIcon = () => (
    <svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" className="block" aria-hidden="true">
        <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
        <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
        <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
        <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
        <path fill="none" d="M0 0h48v48H0z" />
    </svg>
);

export const VerificationPage: React.FC = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { setVerified, initSession } = useSessionStore();
    const googleBtnRef = useRef<HTMLDivElement>(null);
    const [gsiReady, setGsiReady] = useState(false);
    const [verifyError, setVerifyError] = useState<string | null>(null);
    const [verifying, setVerifying] = useState(false);
    const [isLoading, setIsLoading] = useState(true);

    const [isDarkMode, setIsDarkMode] = useState(() => {
        if (typeof window !== 'undefined') {
            const savedTheme = localStorage.getItem('theme');
            if (savedTheme) {
                return savedTheme === 'dark';
            }
            return window.matchMedia('(prefers-color-scheme: dark)').matches;
        }
        return true;
    });

    /** Cryptographically verify the token using Google's public keys */
    const handleCredential = useCallback(async (token: string) => {
        setVerifying(true);
        setVerifyError(null);
        try {
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
            auto_select: true,
            ux_mode: 'redirect',
            login_uri: window.location.origin + '/verify',
        });

        window.google.accounts.id.prompt();

        if (googleBtnRef.current) {
            const parentWidth = googleBtnRef.current.clientWidth || 320;
            const btnWidth = Math.min(parentWidth, 400);

            window.google.accounts.id.renderButton(googleBtnRef.current, {
                theme: isDarkMode ? 'filled_black' : 'outline',
                size: 'large',
                width: btnWidth,
                text: 'continue_with',
                shape: 'rectangular',
            });
        }
    }, [gsiReady, isDarkMode, handleCallbackResponse]);

    useEffect(() => {
        const timer = setTimeout(() => {
            setIsLoading(false);
        }, 2000);
        return () => clearTimeout(timer);
    }, []);

    useEffect(() => {
        if (isDarkMode) {
            document.documentElement.classList.add('dark');
            localStorage.setItem('theme', 'dark');
        } else {
            document.documentElement.classList.remove('dark');
            localStorage.setItem('theme', 'light');
        }
    }, [isDarkMode]);

    const toggleTheme = () => setIsDarkMode(!isDarkMode);

    const handleGuestMode = () => {
        initSession();
        navigate('/chat/new');
    };

    return (
        <div className="text-foreground bg-background h-[100dvh] font-sans">
            <div data-rht-toaster="" style={{ position: 'fixed', zIndex: 9999, inset: '16px', pointerEvents: 'none' }}></div>

            <button
                onClick={toggleTheme}
                className="absolute top-4 right-4 z-50 p-2 rounded-full bg-card text-foreground shadow-md hover:bg-opacity-80 transition-colors cursor-pointer"
                aria-label="Toggle theme"
            >
                {isDarkMode ? <Sun size={24} /> : <Moon size={24} />}
            </button>

            <div className="relative overflow-hidden w-full h-[100dvh]">
                <div className="bg absolute h-screen w-screen bg-[url('https://proxy.extractcss.dev/https://app.chitchat.gg/middle.svg')] bg-center bg-repeat"></div>
                <motion.div
                    initial={{ scaleY: 0 }}
                    animate={{ scaleY: isLoading ? 0 : 1 }}
                    transition={{ duration: 0.5, ease: 'circOut' }}
                    className="absolute h-screen w-screen bg-[url('https://proxy.extractcss.dev/https://app.chitchat.gg/wave-gd.svg')] bg-contain bg-top bg-no-repeat opacity-80"
                    style={{ transformOrigin: 'top' }}
                ></motion.div>
                <motion.div
                    initial={{ scaleY: 0 }}
                    animate={{ scaleY: isLoading ? 0 : 1 }}
                    transition={{ duration: 0.5, ease: 'circOut' }}
                    className="absolute h-screen w-screen bg-[url('https://proxy.extractcss.dev/https://app.chitchat.gg/wave.svg')] bg-contain bg-bottom bg-no-repeat opacity-80"
                    style={{ transformOrigin: 'bottom' }}
                ></motion.div>

                <main className="flex items-center !justify-center p-8 min-h-screen relative z-10 w-full">
                    <motion.div
                        layout
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.3, ease: 'easeOut' }}
                        className="absolute z-10 flex-row rounded-xl bg-card shadow-2xl sm:w-full sm:max-w-md overflow-hidden"
                        style={{
                            width: isLoading ? 'auto' : undefined,
                            height: isLoading ? 'auto' : undefined,
                        }}
                    >
                        <div className="flex flex-col justify-start gap-4 self-center p-4 text-start">
                            <motion.div layout="position" className="flex flex-row items-center justify-center self-center sm:self-start mb-2">
                                <BuzzULogoIcon className="w-8 h-8 sm:w-10 sm:h-10 mr-2 text-[#f5a623]" />
                                <span className="font-bold text-foreground text-xl tracking-tight">BuzzU</span>
                            </motion.div>

                            <AnimatePresence mode="wait">
                                {isLoading ? (
                                    <motion.div key="loader" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} className="flex justify-center py-8 w-full min-w-[200px]">
                                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                                    </motion.div>
                                ) : (
                                    <motion.div key="content" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.1 }} className="flex flex-col py-1 px-2 gap-1.5">
                                        <h1 className="self-center text-2xl font-semibold sm:self-start">
                                            Welcome Back!
                                        </h1>
                                        <p className="text-center text-sm opacity-80 sm:text-start text-muted-foreground">
                                            Sign in to your account and start chatting with strangers!
                                        </p>

                                        <div className="flex flex-col items-center gap-4 w-full mt-4">

                                            {verifying && <p className="text-sm text-amber-500 animate-pulse font-medium">Verifying your account...</p>}
                                            {verifyError && <p className="text-sm text-red-500 font-medium bg-red-500/10 p-2 rounded-md border border-red-500/20">{verifyError}</p>}

                                            {/* Exact style from your verify template overlaid with Google's native functionality */}
                                            <div className="relative w-full flex justify-center h-[44px] rounded-[4px] overflow-hidden group">

                                                {/* Visual Fake Button matching design perfectly */}
                                                <button type="button" className="gsi-material-button block !w-full h-full absolute inset-0 z-0 select-none">
                                                    <div className="gsi-material-button-state"></div>
                                                    <div className="gsi-material-button-content-wrapper">
                                                        <div className="gsi-material-button-icon"><GoogleIcon /></div>
                                                        <span className="gsi-material-button-contents">Continue with Google</span>
                                                        <span className="hidden">Continue with Google</span>
                                                    </div>
                                                </button>

                                                {/* Invisible real Google Button for click intercept */}
                                                <div className="absolute inset-0 w-full h-full z-10 opacity-0 cursor-pointer" style={{ opacity: 0.01 }}>
                                                    <div ref={googleBtnRef} className="w-full h-full"></div>
                                                </div>
                                            </div>

                                            <div className="flex items-center cursor-default py-0 text-sm w-full text-muted-foreground">
                                                <div className="shrink-0 bg-border h-[1px] flex-grow mr-1.5"></div>
                                                or
                                                <div className="shrink-0 bg-border h-[1px] flex-grow ml-1.5"></div>
                                            </div>

                                            <button
                                                type="button"
                                                onClick={handleGuestMode}
                                                className="bg-primary hover:bg-primary/90 text-primary-foreground text-sm max-h-10 h-10 flex items-center justify-center border border-transparent rounded-md shadow-md px-3 py-2 font-medium focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary w-full max-w-[400px]"
                                            >
                                                <VenetianMask size={20} />
                                                <span className="flex-1 font-semibold">Enter Anonymous Mode</span>
                                            </button>
                                        </div>
                                        <span className="text-sm mt-5 text-center sm:text-start text-foreground">
                                            Want to start chatting anonymously?{' '}
                                            <button onClick={handleGuestMode} className="text-primary hover:underline font-bold text-link cursor-pointer bg-transparent border-none">
                                                Get Started!
                                            </button>
                                        </span>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    </motion.div>
                </main>
            </div>
        </div>
    );
};

export default VerificationPage;
