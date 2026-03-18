import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Flag, ChevronDown, Check, X, Sparkles, CircleHelp } from 'lucide-react';
import { LightningIcon, MaleIcon, FemaleIcon, BothIcon } from '../Dashboard_Updated/Icons';
import { useSessionStore } from '../../stores/sessionStore';

interface PartnerSkippedViewProps {
    onReport?: () => void;
    isSelfSkip?: boolean;
}

export const PartnerSkippedView: React.FC<PartnerSkippedViewProps> = ({
    onReport,
    isSelfSkip = false,
}) => {
    const [isInterestsOpen, setIsInterestsOpen] = useState(false);
    const [isGenderFilterOpen, setIsGenderFilterOpen] = useState(false);
    const [newInterest, setNewInterest] = useState('');
    const interests = useSessionStore((state) => state.interests);
    const matchWithInterests = useSessionStore((state) => state.matchWithInterests);
    const interestTimeoutSec = useSessionStore((state) => state.interestTimeoutSec);
    const genderFilter = useSessionStore((state) => state.genderFilter);
    const setInterests = useSessionStore((state) => state.setInterests);
    const setMatchWithInterests = useSessionStore((state) => state.setMatchWithInterests);
    const setInterestTimeoutSec = useSessionStore((state) => state.setInterestTimeoutSec);
    const setGenderFilter = useSessionStore((state) => state.setGenderFilter);
    const maxWait = interestTimeoutSec <= 5 ? '5s' : interestTimeoutSec <= 10 ? '10s' : interestTimeoutSec <= 30 ? '30s' : '10m';

    const addInterest = () => {
        const trimmed = newInterest.trim();
        if (!trimmed) return;
        const normalized = trimmed.toLowerCase();
        const exists = interests.some((interest) => interest.trim().toLowerCase() === normalized);
        if (!exists && interests.length < 20) {
            setInterests([...interests, trimmed]);
        }
        setNewInterest('');
    };

    const removeInterest = (value: string) => {
        setInterests(interests.filter((interest) => interest !== value));
    };

    return (
        <div className="w-full flex justify-center py-8" id="component">
            <div className="w-full max-w-lg px-4 pb-2">
                {/* Skipping Status */}
                <div className="flex flex-col items-start md:items-center md:flex-row gap-2 font-bold text-foreground">
                    <span className="flex items-center gap-1">
                        {isSelfSkip ? '⏭️ You have skipped this chat.' : '💔 Your chat partner has skipped this chat.'}
                    </span>
                    {!isSelfSkip && (
                        <button
                            onClick={onReport}
                            className="inline-flex items-center justify-center text-sm font-medium bg-destructive text-destructive-foreground hover:bg-destructive/90 h-6 rounded-md px-2 transition-colors"
                        >
                            <Flag className="mr-1 h-3.5 w-3.5" />
                            Report
                        </button>
                    )}
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
                                        <svg stroke="currentColor" fill="currentColor" strokeWidth="0" viewBox="0 0 24 24" height="20" width="20" xmlns="http://www.w3.org/2000/svg">
                                            <path d="M10 2a3 3 0 0 1 2.995 2.824l.005 .176v1h3a2 2 0 0 1 1.995 1.85l.005 .15v3h1a3 3 0 0 1 .176 5.995l-.176 .005h-1v3a2 2 0 0 1 -1.85 1.995l-.15 .005h-3a2 2 0 0 1 -1.995 -1.85l-.005 -.15v-1a1 1 0 0 0 -1.993 -.117l-.007 .117v1a2 2 0 0 1 -1.85 1.995l-.15 .005h-3a2 2 0 0 1 -1.995 -1.85l-.005 -.15v-3a2 2 0 0 1 1.85 -1.995l.15 -.005h1a1 1 0 0 0 .117 -1.993l-.117 -.007h-1a2 2 0 0 1 -1.995 -1.85l-.005 -.15v-3a2 2 0 0 1 1.85 -1.995l.15 -.005h3v-1a3 3 0 0 1 3 -3z"></path>
                                        </svg>
                                    </span>
                                    Interests
                                    <span className={`text-sm font-bold uppercase transition-colors ${matchWithInterests ? 'text-success' : 'text-muted-foreground'}`}>
                                        ({matchWithInterests ? 'ON' : 'OFF'})
                                    </span>
                                </div>
                                <ChevronDown className={`h-4 w-4 shrink-0 transition-transform duration-200 ${isInterestsOpen ? 'rotate-180' : ''}`} />
                            </button>

                            {/* Toggle Switch */}
                            <button
                                type="button"
                                role="switch"
                                onClick={() => setMatchWithInterests(!matchWithInterests)}
                                className={`peer inline-flex h-[24px] w-[44px] shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 absolute right-6 inset-y-0 my-auto ${matchWithInterests ? 'bg-primary' : 'bg-muted'}`}
                            >
                                <span
                                    className={`pointer-events-none relative block h-5 w-5 rounded-full bg-white shadow-lg transition-transform duration-200 flex items-center justify-center ${matchWithInterests ? 'translate-x-5' : 'translate-x-0'}`}
                                >
                                    {matchWithInterests ? (
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
                                            {interests.map((interest) => (
                                                <button
                                                    key={interest}
                                                    type="button"
                                                    onClick={() => removeInterest(interest)}
                                                    className="group inline-flex items-center justify-center gap-1.5 rounded-full bg-popover px-2.5 py-1 text-xs font-medium text-foreground hover:bg-popover/80"
                                                >
                                                    <span>{interest}</span>
                                                    <span className="text-muted-foreground group-hover:text-foreground">×</span>
                                                </button>
                                            ))}
                                            <input
                                                className="w-32 select-auto text-sm rounded-md bg-popover p-1 focus-visible:outline-none inline-flex"
                                                maxLength={32}
                                                placeholder="Add an interest..."
                                                type="text"
                                                value={newInterest}
                                                onChange={(e) => setNewInterest(e.target.value)}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter') {
                                                        e.preventDefault();
                                                        addInterest();
                                                    }
                                                }}
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
                                                            onClick={() => setInterestTimeoutSec(val === '5s' ? 5 : val === '10s' ? 10 : val === '30s' ? 30 : 600)}
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
                                        <p className="mb-3 text-muted-foreground text-center">Choose the gender you wish to match with.</p>
                                        <div className="flex justify-center">
                                            <div role="radiogroup" className="flex justify-center gap-3 sm:gap-6 w-full" style={{ outline: 'none' }}>

                                                {/* Male Option */}
                                                <div className="max-sm:w-full relative group">
                                                    <button type="button" role="radio" aria-checked={genderFilter === 'male'} onClick={() => setGenderFilter('male')} className="sr-only" />
                                                    <div className="p-0.5">
                                                        <label
                                                            className={`font-bold w-full min-w-[76px] sm:w-24 relative flex select-none flex-col items-center justify-between rounded-xl p-3 cursor-pointer text-sm border-2 transition-all duration-300 ease-out
                                        ${genderFilter === 'male'
                                                                    ? 'bg-blue-500/15 border-blue-500 text-blue-400 shadow-[0_0_20px_rgba(59,130,246,0.25)] scale-[1.05]'
                                                                    : 'bg-background/50 border-transparent text-muted-foreground hover:bg-muted opacity-50 hover:opacity-100 hover:scale-100'}`}
                                                            onClick={() => setGenderFilter('male')}
                                                        >
                                                            {genderFilter === 'male' && (
                                                                <div className="absolute -top-2 -right-2 items-center justify-center flex bg-blue-500 text-white w-5 h-5 rounded-full shadow-lg shadow-blue-500/50 animate-in zoom-in duration-200">
                                                                    <LightningIcon className="w-3 h-3" />
                                                                </div>
                                                            )}
                                                            <MaleIcon className="mb-2 w-7 h-7 text-inherit transition-transform group-hover:scale-110" />
                                                            Male
                                                        </label>
                                                    </div>
                                                </div>

                                                {/* Both Option */}
                                                <div className="max-sm:w-full relative group">
                                                    <button type="button" role="radio" aria-checked={genderFilter === 'both'} onClick={() => setGenderFilter('both')} className="sr-only" />
                                                    <div className="p-0.5">
                                                        <label
                                                            className={`font-bold w-full min-w-[76px] sm:w-24 relative flex select-none flex-col items-center justify-between rounded-xl p-3 cursor-pointer text-sm border-2 transition-all duration-300 ease-out
                                        ${genderFilter === 'both'
                                                                    ? 'bg-emerald-500/15 border-emerald-500 text-emerald-400 shadow-[0_0_20px_rgba(16,185,129,0.25)] scale-[1.05]'
                                                                    : 'bg-background/50 border-transparent text-muted-foreground hover:bg-muted opacity-50 hover:opacity-100 hover:scale-100'}`}
                                                            onClick={() => setGenderFilter('both')}
                                                        >
                                                            {genderFilter === 'both' && (
                                                                <div className="absolute -top-2 -right-2 items-center justify-center flex bg-emerald-500 text-white w-5 h-5 rounded-full shadow-lg shadow-emerald-500/50 animate-in zoom-in duration-200">
                                                                    <LightningIcon className="w-3 h-3" />
                                                                </div>
                                                            )}
                                                            <BothIcon className="mb-2 w-7 h-7 text-inherit transition-transform group-hover:scale-110" />
                                                            Both
                                                        </label>
                                                    </div>
                                                </div>

                                                {/* Female Option */}
                                                <div className="max-sm:w-full relative group">
                                                    <button type="button" role="radio" aria-checked={genderFilter === 'female'} onClick={() => setGenderFilter('female')} className="sr-only" />
                                                    <div className="p-0.5">
                                                        <label
                                                            className={`font-bold w-full min-w-[76px] sm:w-24 relative flex select-none flex-col items-center justify-between rounded-xl p-3 cursor-pointer text-sm border-2 transition-all duration-300 ease-out
                                        ${genderFilter === 'female'
                                                                    ? 'bg-pink-500/15 border-pink-500 text-pink-400 shadow-[0_0_20px_rgba(236,72,153,0.25)] scale-[1.05]'
                                                                    : 'bg-background/50 border-transparent text-muted-foreground hover:bg-muted opacity-50 hover:opacity-100 hover:scale-100'}`}
                                                            onClick={() => setGenderFilter('female')}
                                                        >
                                                            {genderFilter === 'female' && (
                                                                <div className="absolute -top-2 -right-2 items-center justify-center flex bg-pink-500 text-white w-5 h-5 rounded-full shadow-lg shadow-pink-500/50 animate-in zoom-in duration-200">
                                                                    <LightningIcon className="w-3 h-3" />
                                                                </div>
                                                            )}
                                                            <FemaleIcon className="mb-2 w-7 h-7 text-inherit transition-transform group-hover:scale-110" />
                                                            Female
                                                        </label>
                                                    </div>
                                                </div>

                                            </div>
                                        </div>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                </div>
            </div>
        </div>
    );
};
