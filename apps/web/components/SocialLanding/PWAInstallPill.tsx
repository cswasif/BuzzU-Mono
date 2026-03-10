
import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { usePWA } from '../../src/hooks/usePWA';
import { useTheme } from '../ThemeContext';

export const PWAInstallPill = () => {
    const { isInstallable, installApp } = usePWA();
    const { colors } = useTheme();

    return (
        <AnimatePresence>
            {isInstallable && (
                <motion.div
                    initial={{ opacity: 0, scale: 0.9, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.9, y: 20 }}
                    className="fixed bottom-24 right-6 md:bottom-8 md:right-8 z-[10000]"
                >
                    <button
                        onClick={installApp}
                        className="group flex items-center space-x-3 px-6 py-3 bg-white/10 hover:bg-white/15 border border-white/20 backdrop-blur-2xl rounded-full shadow-[0_8px_32px_rgba(0,0,0,0.3)] transition-all duration-300 active:scale-95 border-b-2 overflow-hidden relative"
                        style={{ borderBottomColor: colors.accent + '40' }}
                    >
                        {/* Premium Exotic Hover Background */}
                        <div className="absolute inset-0 bg-mesh-aurora opacity-0 group-hover:opacity-100 transition-opacity duration-500 z-0 pointer-events-none mix-blend-screen" />

                        {/* Icon */}
                        <div
                            className="w-10 h-10 rounded-full flex items-center justify-center shadow-lg transition-transform duration-300 group-hover:scale-110 relative z-10"
                            style={{ backgroundColor: colors.accent }}
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                                <polyline points="7 10 12 15 17 10"></polyline>
                                <line x1="12" y1="15" x2="12" y2="3"></line>
                            </svg>
                        </div>

                        {/* Content */}
                        <div className="flex flex-col items-start pr-2 relative z-10">
                            <span className="text-white font-bold text-sm tracking-tight leading-none mb-1 group-hover:text-shadow-sm transition-all duration-300">Install BuzzU</span>
                            <div className="flex items-center space-x-1">
                                <span className="text-[10px] text-white/50 font-black uppercase tracking-[0.1em] group-hover:text-white/80 transition-colors duration-300">Instant App</span>
                                <div className="w-1 h-1 rounded-full bg-green-500 animate-pulse" />
                            </div>
                        </div>

                        {/* Reflection Effect */}
                        <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-white/10 to-transparent pointer-events-none z-10" />
                    </button>
                </motion.div>
            )}
        </AnimatePresence>
    );
};
