import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Flag, ChevronDown, Check, X, Sparkles, Circle, CircleHelp, Crown } from 'lucide-react';

interface PartnerSkippedViewProps {
    onReport?: () => void;
    onGetPremium?: () => void;
}

export const PartnerSkippedView: React.FC<PartnerSkippedViewProps> = ({
    onReport,
    onGetPremium
}) => {
    const [isInterestsOpen, setIsInterestsOpen] = useState(false);
    const [isGenderFilterOpen, setIsGenderFilterOpen] = useState(false);
    const [interestsEnabled, setInterestsEnabled] = useState(true);
    const [maxWait, setMaxWait] = useState('5s');
    const [genderFilter, setGenderFilter] = useState('both');

    return (
        <div className="w-full flex justify-center py-8" id="component">
            <div className="w-full max-w-lg px-4 pb-2">
                {/* Skipping Status */}
                <div className="flex flex-col items-start md:items-center md:flex-row gap-2 font-bold text-foreground">
                    <span className="flex items-center gap-1">💔 Your chat partner has skipped this chat.</span>
                    <button
                        onClick={onReport}
                        className="inline-flex items-center justify-center text-sm font-medium bg-destructive text-destructive-foreground hover:bg-destructive/90 h-6 rounded-md px-2 transition-colors"
                    >
                        <Flag className="mr-1 h-3.5 w-3.5" />
                        Report
                    </button>
                </div>

                {/* Divider */}
                <div className="shrink-0 bg-border h-[1px] w-full my-3"></div>

                {/* Interests Accordion */}
                <div className="bg-popover rounded-lg mt-4 px-2 w-full max-w-lg overflow-hidden transition-all duration-200">
                    <div className="border-b border-none">
                        <div className="flex relative select-none items-center justify-between py-4">
                            <button
                                type="button"
                                onClick={() => setIsInterestsOpen(!isInterestsOpen)}
                                className="flex flex-1 items-center justify-between font-bold text-foreground hover:no-underline text-left"
                            >
                                <div className="flex items-center gap-2">
                                    <span className="rounded-full bg-muted aspect-square w-10 h-10 flex items-center justify-center">
                                        <svg stroke="currentColor" fill="currentColor" stroke-width="0" viewBox="0 0 24 24" height="20" width="20" xmlns="http://www.w3.org/2000/svg">
                                            <path d="M10 2a3 3 0 0 1 2.995 2.824l.005 .176v1h3a2 2 0 0 1 1.995 1.85l.005 .15v3h1a3 3 0 0 1 .176 5.995l-.176 .005h-1v3a2 2 0 0 1 -1.85 1.995l-.15 .005h-3a2 2 0 0 1 -1.995 -1.85l-.005 -.15v-1a1 1 0 0 0 -1.993 -.117l-.007 .117v1a2 2 0 0 1 -1.85 1.995l-.15 .005h-3a2 2 0 0 1 -1.995 -1.85l-.005 -.15v-3a2 2 0 0 1 1.85 -1.995l.15 -.005h1a1 1 0 0 0 .117 -1.993l-.117 -.007h-1a2 2 0 0 1 -1.995 -1.85l-.005 -.15v-3a2 2 0 0 1 1.85 -1.995l.15 -.005h3v-1a3 3 0 0 1 3 -3z"></path>
                                        </svg>
                                    </span>
                                    Interests
                                    <span className={`text-sm font-bold uppercase transition-colors ${interestsEnabled ? 'text-success' : 'text-muted-foreground'}`}>
                                        ({interestsEnabled ? 'ON' : 'OFF'})
                                    </span>
                                </div>
                                <ChevronDown className={`h-4 w-4 shrink-0 transition-transform duration-200 ${isInterestsOpen ? 'rotate-180' : ''}`} />
                            </button>

                            {/* Toggle Switch */}
                            <button
                                type="button"
                                role="switch"
                                onClick={() => setInterestsEnabled(!interestsEnabled)}
                                className={`peer inline-flex h-[24px] w-[44px] shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 absolute right-6 inset-y-0 my-auto ${interestsEnabled ? 'bg-primary' : 'bg-muted'}`}
                            >
                                <span
                                    className={`pointer-events-none relative block h-5 w-5 rounded-full bg-white shadow-lg transition-transform duration-200 flex items-center justify-center ${interestsEnabled ? 'translate-x-5' : 'translate-x-0'}`}
                                >
                                    {interestsEnabled ? (
                                        <Check className="h-3 w-3 text-primary" strokeWidth={3} />
                                    ) : (
                                        <X className="h-3 w-3 text-muted-foreground" strokeWidth={3} />
                                    )}
                                </span>
                            </button>
                        </div>

                        <AnimatePresence>
                            {isInterestsOpen && (
                                <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: 'auto', opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    className="overflow-hidden text-sm"
                                >
                                    <div className="pb-4 pt-0 select-none">
                                        <div className="flex flex-wrap gap-2 bg-muted rounded-md p-2 py-4 mb-4">
                                            <input
                                                className="w-32 select-auto text-sm rounded-md bg-popover p-1 focus-visible:outline-none inline-flex"
                                                maxLength={32}
                                                placeholder="Add an interest..."
                                                type="text"
                                            />
                                        </div>

                                        <div className="flex flex-col gap-2.5 pt-2.5 pr-2 bg-card py-3 rounded-md px-2">
                                            <label className="text-sm font-medium leading-none flex items-center gap-1">
                                                Max Wait Duration
                                                <CircleHelp className="h-4 w-4 cursor-pointer text-muted-foreground hover:text-foreground transition-colors" />
                                            </label>

                                            <div className="flex flex-row gap-1.5 sm:gap-3">
                                                {['5s', '10s', '30s', '10m'].map((val) => (
                                                    <div key={val} className="flex-shrink-0">
                                                        <button
                                                            onClick={() => setMaxWait(val)}
                                                            className={`inline-flex items-center justify-center text-sm font-medium h-9 rounded-md px-3 cursor-pointer transition-all ${maxWait === val ? 'bg-primary text-primary-foreground' : 'bg-background hover:bg-accent border border-input'}`}
                                                        >
                                                            {val === '10m' ? 'Forever' : val === '5s' ? '5 sec' : val === '10s' ? '10 sec' : '30 sec'}
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                </div>

                {/* Gender Filter Accordion */}
                <div className="bg-popover rounded-lg my-4 px-2 w-full max-w-lg overflow-hidden transition-all duration-200">
                    <div className="border-b border-none">
                        <button
                            type="button"
                            onClick={() => setIsGenderFilterOpen(!isGenderFilterOpen)}
                            className="flex w-full items-center justify-between py-4 font-bold text-foreground hover:no-underline text-left"
                        >
                            <div className="flex items-center gap-2">
                                <span className="rounded-full bg-muted aspect-square w-10 h-10 flex items-center justify-center">
                                    <Sparkles className="h-5 w-5" />
                                </span>
                                Gender Filter
                            </div>
                            <ChevronDown className={`h-4 w-4 shrink-0 transition-transform duration-200 ${isGenderFilterOpen ? 'rotate-180' : ''}`} />
                        </button>

                        <AnimatePresence>
                            {isGenderFilterOpen && (
                                <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: 'auto', opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    className="overflow-hidden text-sm"
                                >
                                    <div className="pb-4 pt-0">
                                        <p className="mb-3 text-muted-foreground">Choose the gender you wish to match with.</p>
                                        <div className="flex flex-wrap gap-2.5 justify-center">
                                            {[
                                                { id: 'male', label: 'Male', val: 'M', color: 'text-blue-600 dark:text-blue-300' },
                                                { id: 'both', label: 'Both', val: 'both', color: 'text-foreground' },
                                                { id: 'female', label: 'Female', val: 'F', color: 'text-pink-600 dark:text-pink-300' }
                                            ].map((item) => (
                                                <div key={item.id} className="relative flex-1 min-w-[100px] sm:min-w-[120px]">
                                                    <button
                                                        onClick={() => setGenderFilter(item.val)}
                                                        className={`w-full relative flex flex-col items-center justify-center gap-2 p-3 rounded-lg border transition-all ${genderFilter === item.val ? 'bg-muted border-primary ring-1 ring-primary' : 'bg-popover border-border hover:bg-muted'}`}
                                                    >
                                                        {item.id === 'both' && (
                                                            <div className="absolute inset-0 bg-gradient-to-r from-blue-400/10 to-pink-400/10 blur-xl opacity-50 pointer-events-none rounded-lg" />
                                                        )}

                                                        {/* Premium Locked state simulation */}
                                                        {(item.id === 'male' || item.id === 'female') && (
                                                            <div className="absolute top-0 right-0 transform translate-x-1/3 -translate-y-1/3 flex bg-orange-600 text-white w-5 h-5 rounded-full items-center justify-center z-10 shadow-sm">
                                                                <Crown className="w-3 h-3" />
                                                            </div>
                                                        )}

                                                        <span className={`text-2xl ${item.color}`}>
                                                            {item.id === 'male' ? '♂️' : item.id === 'female' ? '♀️' : '👫'}
                                                        </span>
                                                        <span className={`font-bold ${item.color}`}>{item.label}</span>
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                </div>

                {/* Premium Banner */}
                <div className="py-2">
                    <p className="text-sm sm:text-base text-fuchsia-700 dark:text-yellow-300 font-semibold mb-3">
                        Get premium to unlock the gender filter and to send and receive media! 🎉
                    </p>
                    <div className="flex flex-row gap-4 items-center">
                        <button
                            type="button"
                            onClick={onGetPremium}
                            className="group h-10 relative uppercase text-sm px-6 font-bold text-white rounded-md bg-gradient-to-r from-purple-500 via-pink-500 to-red-500 shadow-lg transition-all duration-300 hover:scale-105 active:scale-95 overflow-hidden flex items-center gap-2"
                        >
                            <Crown className="h-4 w-4 text-yellow-300 fill-yellow-300" />
                            <span className="relative z-10">Get Premium</span>
                            <div className="absolute left-[-50%] top-0 h-full w-1/2 -skew-x-12 transform bg-gradient-to-r from-transparent via-white/30 to-transparent opacity-40 transition-all duration-500 ease-linear group-hover:left-[150%]"></div>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
