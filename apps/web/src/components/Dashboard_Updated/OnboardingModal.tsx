import React, { useState } from 'react';
import { MaleIcon, FemaleIcon, LightningIcon } from './Icons';

interface OnboardingModalProps {
    onStart: () => void;
}

const OnboardingModal: React.FC<OnboardingModalProps> = ({ onStart }) => {
    const [gender, setGender] = useState<'M' | 'F' | null>(null);
    const [captchaVerified, setCaptchaVerified] = useState(false);

    const handleStart = () => {
        if (gender && captchaVerified) {
            onStart();
        }
    };

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-300">
            <div className="bg-popover w-full max-w-md rounded-3xl shadow-2xl p-6 md:p-8 space-y-8 relative overflow-hidden border border-border animate-in zoom-in-95 duration-300">

                {/* Header */}
                <div className="text-center space-y-2">
                    <h2 className="text-3xl font-bold text-foreground">Before you start...</h2>
                    <p className="text-muted-foreground">Please select your gender to continue.</p>
                </div>

                {/* Gender Selection */}
                <div className="space-y-4">
                    <div className="flex gap-4 justify-center">
                        {/* Male Button */}
                        <button
                            onClick={() => setGender('M')}
                            className={`group relative flex-1 flex flex-col items-center justify-center p-6 rounded-2xl border-2 transition-all duration-200 ${gender === 'M' ? 'border-blue-500 bg-blue-500/10' : 'border-border bg-card hover:border-blue-500/50 hover:bg-accent'}`}
                        >
                            {gender === 'M' && (
                                <div className="absolute top-2 right-2 bg-blue-500 rounded-full p-1">
                                    <LightningIcon className="w-3 h-3 text-white" />
                                </div>
                            )}
                            <MaleIcon className={`w-12 h-12 mb-3 transition-colors ${gender === 'M' ? 'text-blue-500' : 'text-muted-foreground group-hover:text-blue-500'}`} />
                            <span className={`font-semibold text-lg ${gender === 'M' ? 'text-blue-500' : 'text-foreground'}`}>Male</span>
                        </button>

                        {/* Female Button */}
                        <button
                            onClick={() => setGender('F')}
                            className={`group relative flex-1 flex flex-col items-center justify-center p-6 rounded-2xl border-2 transition-all duration-200 ${gender === 'F' ? 'border-pink-500 bg-pink-500/10' : 'border-border bg-card hover:border-pink-500/50 hover:bg-accent'}`}
                        >
                            {gender === 'F' && (
                                <div className="absolute top-2 right-2 bg-pink-500 rounded-full p-1">
                                    <LightningIcon className="w-3 h-3 text-white" />
                                </div>
                            )}
                            <FemaleIcon className={`w-12 h-12 mb-3 transition-colors ${gender === 'F' ? 'text-pink-500' : 'text-muted-foreground group-hover:text-pink-500'}`} />
                            <span className={`font-semibold text-lg ${gender === 'F' ? 'text-pink-500' : 'text-foreground'}`}>Female</span>
                        </button>
                    </div>
                </div>

                {/* Captcha Placeholder */}
                <div className="flex justify-center">
                    <div className="bg-card p-3 rounded-lg border border-border flex items-center gap-4 w-full max-w-[300px] shadow-sm">
                        <div className="flex items-center h-full">
                            <input
                                type="checkbox"
                                id="captcha"
                                checked={captchaVerified}
                                onChange={(e) => setCaptchaVerified(e.target.checked)}
                                className="w-6 h-6 rounded border-input text-primary focus:ring-primary cursor-pointer accent-indigo-600"
                            />
                        </div>
                        <label htmlFor="captcha" className="text-sm font-medium text-foreground cursor-pointer select-none flex-grow">I am human</label>
                        <div className="flex flex-col items-end justify-center opacity-70">
                            <div className="text-[10px] text-muted-foreground text-right leading-tight">
                                hCaptcha<br />
                                Privacy - Terms
                            </div>
                        </div>
                    </div>
                </div>

                {/* Start Button */}
                <button
                    onClick={handleStart}
                    disabled={!gender || !captchaVerified}
                    className="w-full py-4 rounded-xl font-bold text-lg text-white bg-gradient-to-r from-indigo-600 to-purple-700 hover:from-indigo-500 hover:to-purple-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 active:translate-y-0"
                >
                    Start Chatting
                </button>
            </div>
        </div>
    );
};

export default OnboardingModal;
