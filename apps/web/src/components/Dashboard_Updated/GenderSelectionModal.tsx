import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MaleIcon, FemaleIcon, LoadingSpinner } from './Icons'; // Assuming generic named icons

// Extracted from the HTML provided by the User
interface GenderSelectionModalProps {
    isOpen: boolean;
    onConfirm: (gender: 'M' | 'F') => void;
}

export const GenderSelectionModal: React.FC<GenderSelectionModalProps> = ({ isOpen, onConfirm }) => {
    const [selectedGender, setSelectedGender] = useState<'M' | 'F' | null>(null);

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            {isOpen && (
                <React.Fragment>
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 bg-black/70 pointer-events-auto"
                        aria-hidden="true"
                    />

                    {/* Modal Content */}
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        transition={{ duration: 0.2 }}
                        role="dialog"
                        className="fixed left-[50%] sm:top-[50%] max-sm:bottom-0 z-50 grid translate-x-[-50%] gap-4 border bg-background p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 sm:data-[state=closed]:zoom-out-95 sm:data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=open]:slide-in-from-left-1/2 sm:data-[state=closed]:slide-out-to-top-[48%] data-[state=closed]:slide-out-to-bottom-[48%] sm:data-[state=open]:slide-in-from-top-[48%] data-[state=open]:slide-in-from-bottom-[48%] sm:max-w-lg sm:translate-y-[-50%] sm:rounded-lg md:w-full select-text sm:!max-w-[400px] w-full overflow-y-auto max-h-full"
                        style={{
                            pointerEvents: 'auto',
                            boxShadow: '0 10px 15px -3px rgba(0, 0, 0, .1), 0 4px 6px -4px rgba(0, 0, 0, .1)'
                        }}
                    >
                        <div className="flex flex-col space-y-1.5 sm:text-left text-start text-2xl font-semibold sm:text-2xl">
                            Before you start...
                        </div>

                        <p className="text-sm p-0 text-foreground">
                            Select your gender so we can match you with the right people.
                        </p>

                        <div className="flex flex-1 justify-start flex-col overflow-hidden overflow-y-auto bg-transparent pb-2 mt-2">
                            <form
                                className="gap-3 flex flex-col"
                                onSubmit={(e) => {
                                    e.preventDefault();
                                    if (selectedGender) onConfirm(selectedGender);
                                }}
                            >
                                <div className="space-y-4">
                                    <label className="font-semibold text-lg">I am:</label>

                                    <div role="radiogroup" dir="ltr" className="flex gap-4 w-full" tabIndex={0} style={{ outline: 'none' }}>

                                        {/* Male Option */}
                                        <div
                                            role="radio"
                                            aria-checked={selectedGender === 'M'}
                                            tabIndex={0}
                                            onClick={() => setSelectedGender('M')}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter' || e.key === ' ') {
                                                    e.preventDefault();
                                                    setSelectedGender('M');
                                                }
                                            }}
                                            className={`flex-1 flex items-center justify-center gap-2 w-full py-2 px-4 cursor-pointer rounded-md border text-sm font-medium leading-none transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${selectedGender === 'M'
                                                ? 'bg-secondary text-white border-primary hover:scale-105 hover:shadow-md'
                                                : 'bg-popover hover:bg-accent hover:scale-105 hover:shadow-md border-input text-foreground'
                                                }`}
                                        >
                                            <MaleIcon className="w-5 h-5" />
                                            Male
                                        </div>

                                        {/* Female Option */}
                                        <div
                                            role="radio"
                                            aria-checked={selectedGender === 'F'}
                                            tabIndex={0}
                                            onClick={() => setSelectedGender('F')}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter' || e.key === ' ') {
                                                    e.preventDefault();
                                                    setSelectedGender('F');
                                                }
                                            }}
                                            className={`flex-1 flex items-center justify-center gap-2 w-full py-2 px-4 cursor-pointer rounded-md border text-sm font-medium leading-none transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${selectedGender === 'F'
                                                ? 'bg-secondary text-white border-primary hover:scale-105 hover:shadow-md'
                                                : 'bg-popover hover:bg-accent hover:scale-105 hover:shadow-md border-input text-foreground'
                                                }`}
                                        >
                                            <FemaleIcon className="w-5 h-5" />
                                            Female
                                        </div>

                                    </div>
                                </div>

                                <span className="text-xs text-muted-foreground mt-2">
                                    *You cannot change your gender after you register.
                                </span>

                                <div role="none" className="shrink-0 bg-border h-[1px] w-full my-2"></div>

                                <span className="text-sm text-foreground/80">
                                    I'm at least <b className="text-warning font-bold">18 years old</b> and have read and agree to the{' '}
                                    <a href="/terms" target="_blank" className="text-blue-500 hover:underline hover:text-blue-400 transition-colors duration-200">Terms of Service</a>{' '}
                                    and <a href="/privacy" target="_blank" className="text-blue-500 hover:underline hover:text-blue-400 transition-colors duration-200">Privacy Policy</a>
                                </span>

                                <div className="flex-col-reverse max-md:gap-3 sm:flex-row sm:justify-end sm:space-x-2 pt-1.5 grid grid-cols-1 gap-2">
                                    <button
                                        disabled={!selectedGender}
                                        className="inline-flex disabled:select-none items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 hover:scale-105 hover:shadow-lg active:scale-95 h-10 px-4 py-2 w-full"
                                        type="submit"
                                    >
                                        I AGREE, LET'S GO!
                                    </button>
                                    <span className="text-xs text-center sm:text-left mt-2 hidden">
                                        Already have an account? <a href="/login" className="text-blue-500 hover:underline hover:text-blue-400 transition-colors duration-200">Login</a>
                                    </span>
                                </div>
                            </form>
                        </div>
                    </motion.div>
                </React.Fragment>
            )}
        </AnimatePresence>
    );
};
