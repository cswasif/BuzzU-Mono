import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
    UserIcon, CogIcon, ShieldIcon, Settings2Icon, BanIcon,
    XIcon, CheckIcon, ChevronDownIcon, CircleQuestionIcon,
    DeleteAccountIcon, SolidCheckCircleIcon, LockIcon, UserXIcon, CloseIcon
} from './Icons';
import { useSessionStore } from '../../stores/sessionStore';
import { useWasm } from '../../hooks/useWasm';
import { AvatarCropModal } from '../AvatarCropModal';
import { deepCleanAccountData } from '../../utils/accountUtils';

interface ModalProps {
    onClose: () => void;
}

interface SettingsModalProps extends ModalProps {
    onOpenInterests?: () => void;
    theme?: 'light' | 'dark';
}

// --- Helper Functions for Color Picker ---
function hsvToHex(h: number, s: number, v: number): string {
    s /= 100;
    v /= 100;
    let c = v * s;
    let x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    let m = v - c;
    let r = 0, g = 0, b = 0;

    if (0 <= h && h < 60) { r = c; g = x; b = 0; }
    else if (60 <= h && h < 120) { r = x; g = c; b = 0; }
    else if (120 <= h && h < 180) { r = 0; g = c; b = x; }
    else if (180 <= h && h < 240) { r = 0; g = x; b = c; }
    else if (240 <= h && h < 300) { r = x; g = 0; b = c; }
    else if (300 <= h && h < 360) { r = c; g = 0; b = x; }

    const toHex = (n: number) => {
        const hex = Math.round((n + m) * 255).toString(16);
        return hex.length === 1 ? "0" + hex : hex;
    };

    return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
}

function hexToHsv(hex: string): { h: number, s: number, v: number } {
    let r = 0, g = 0, b = 0;
    if (hex.length === 4) {
        r = parseInt("0x" + hex[1] + hex[1]);
        g = parseInt("0x" + hex[2] + hex[2]);
        b = parseInt("0x" + hex[3] + hex[3]);
    } else if (hex.length === 7) {
        r = parseInt("0x" + hex[1] + hex[2]);
        g = parseInt("0x" + hex[3] + hex[4]);
        b = parseInt("0x" + hex[5] + hex[6]);
    }
    r /= 255;
    g /= 255;
    b /= 255;
    let cmin = Math.min(r, g, b),
        cmax = Math.max(r, g, b),
        delta = cmax - cmin,
        h = 0,
        s = 0,
        v = 0;

    if (delta === 0) h = 0;
    else if (cmax === r) h = ((g - b) / delta) % 6;
    else if (cmax === g) h = (b - r) / delta + 2;
    else h = (r - g) / delta + 4;

    h = Math.round(h * 60);
    if (h < 0) h += 360;

    v = Math.round(cmax * 100);
    s = cmax === 0 ? 0 : Math.round((delta / cmax) * 100);

    return { h, s, v };
}

const ColorPickerModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    onApply: (color: string) => void;
    initialColor: string;
}> = ({ isOpen, onClose, onApply, initialColor }) => {
    const [color, setColor] = useState(initialColor);
    const [hsv, setHsv] = useState({ h: 0, s: 0, v: 100 });
    const presets = ['#FF6900', '#FCB900', '#7BDCB5', '#00D084', '#8ED1FC', '#0693E3', '#ABB8C3', '#EB144C', '#F78DA7', '#9900EF'];

    useEffect(() => {
        if (isOpen) {
            setColor(initialColor);
            setHsv(hexToHsv(initialColor));
        }
    }, [isOpen, initialColor]);

    const handleSaturationChange = (e: React.MouseEvent<HTMLDivElement>) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
        const newS = Math.round(x * 100);
        const newV = Math.round((1 - y) * 100);
        setHsv(prev => {
            const newHsv = { ...prev, s: newS, v: newV };
            setColor(hsvToHex(newHsv.h, newHsv.s, newHsv.v));
            return newHsv;
        });
    };

    const handleHueChange = (e: React.MouseEvent<HTMLDivElement>) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        const newH = Math.round(x * 360);
        setHsv(prev => {
            const newHsv = { ...prev, h: newH };
            setColor(hsvToHex(newHsv.h, newHsv.s, newHsv.v));
            return newHsv;
        });
    };

    if (!isOpen) return null;

    return createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
            <div className="bg-[#181818] border border-border p-4 rounded-xl shadow-xl w-[300px] flex flex-col gap-4" onClick={e => e.stopPropagation()}>
                <h3 className="text-white font-semibold">Pick a Color</h3>
                <div className="bg-[#2a2a2a] rounded-md p-2 flex items-center gap-2">
                    <span className="text-white/50">#</span>
                    <input
                        value={color.replace('#', '')}
                        onChange={(e) => {
                            const val = '#' + e.target.value;
                            setColor(val);
                            if (/^#[0-9A-F]{6}$/i.test(val)) {
                                setHsv(hexToHsv(val));
                            }
                        }}
                        className="bg-transparent text-white outline-none w-full uppercase"
                    />
                </div>

                <div className="flex flex-wrap gap-2">
                    {presets.map(p => (
                        <button
                            key={p}
                            className="w-6 h-6 rounded-full border border-border"
                            style={{ backgroundColor: p }}
                            onClick={() => {
                                setColor(p);
                                setHsv(hexToHsv(p));
                            }}
                        />
                    ))}
                </div>

                <div
                    className="w-full h-40 rounded-lg relative cursor-crosshair"
                    style={{
                        backgroundColor: `hsl(${hsv.h}, 100%, 50%)`,
                        backgroundImage: 'linear-gradient(to right, #fff, transparent), linear-gradient(to top, #000, transparent)'
                    }}
                    onMouseDown={(e) => {
                        if (e.buttons === 1) handleSaturationChange(e);
                    }}
                    onMouseMove={(e) => {
                        if (e.buttons === 1) handleSaturationChange(e);
                    }}
                    onClick={handleSaturationChange}
                >
                    <div
                        className="absolute w-4 h-4 border-2 border-white rounded-full -ml-2 -mt-2 pointer-events-none shadow-sm"
                        style={{ left: `${hsv.s}%`, top: `${100 - hsv.v}%` }}
                    />
                </div>

                <div
                    className="w-full h-4 rounded-full relative cursor-pointer"
                    style={{ background: 'linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)' }}
                    onMouseDown={(e) => {
                        if (e.buttons === 1) handleHueChange(e);
                    }}
                    onMouseMove={(e) => {
                        if (e.buttons === 1) handleHueChange(e);
                    }}
                    onClick={handleHueChange}
                >
                    <div
                        className="absolute w-4 h-4 border-2 border-white rounded-full -ml-2 top-0 pointer-events-none shadow-sm bg-white"
                        style={{ left: `${(hsv.h / 360) * 100}%` }}
                    />
                </div>

                <div className="flex justify-end gap-2 mt-2">
                    <button onClick={onClose} className="px-4 py-2 rounded-md text-white hover:bg-white/10 text-sm font-medium">Cancel</button>
                    <button onClick={() => { onApply(color); onClose(); }} className="px-4 py-2 rounded-md bg-primary text-white text-sm font-medium">Apply</button>
                </div>
            </div>
        </div>,
        document.body
    );
};

const DeleteAccountModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    onDelete: () => void;
}> = ({ isOpen, onClose, onDelete }) => {

    if (!isOpen) return null;

    return createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
            <div
                className="bg-background text-foreground border border-border p-6 shadow-lg duration-200 animate-in fade-in zoom-in-95 sm:rounded-lg w-full max-w-md flex flex-col gap-4 select-text"
                onClick={e => e.stopPropagation()}
            >
                <div className="flex flex-col space-y-1.5 text-center sm:text-left">
                    <div className="flex items-center gap-2 text-destructive font-semibold leading-none tracking-tight text-lg mb-1">
                        <UserXIcon className="w-5 h-5" />
                        <h2>Delete Account</h2>
                    </div>
                    <p className="text-sm text-muted-foreground text-start">Note: If you want to take a break, you can log out instead.</p>
                </div>

                <div className="flex flex-col gap-3 py-2">
                    <ul className="list-disc list-inside text-sm text-muted-foreground/90 space-y-2">
                        <li>This clears all BuzzU data stored in this browser (localStorage, sessionStorage, IndexedDB, caches).</li>
                        <li>You will be signed out and the app will immediately reload.</li>
                        <li>This does not delete any server-side account data.</li>
                    </ul>
                </div>

                <div className="flex flex-row gap-2 justify-end pt-2">
                    <button
                        onClick={onDelete}
                        className="inline-flex disabled:select-none items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-[#ef4444] text-white hover:bg-[#dc2626] h-10 px-4 active:scale-95 shadow-sm"
                    >
                        Delete My Account
                    </button>
                    <button
                        onClick={onClose}
                        className="inline-flex disabled:select-none items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-secondary text-secondary-foreground hover:bg-secondary/80 h-10 px-4 active:scale-95"
                    >
                        Cancel
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
};

// --- Interests Modal ---
export const InterestsModal: React.FC<ModalProps> = ({ onClose }) => {
    const { interests, setInterests, verifiedOnly, setVerifiedOnly, genderFilter, setGenderFilter, isVerified } = useSessionStore();
    const [matchEnabled, setMatchEnabled] = useState(true);
    const [selectedDuration, setSelectedDuration] = useState('10s');
    const [newInterest, setNewInterest] = useState('');

    const handleAddInterest = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter' && newInterest.trim()) {
            if (!interests.includes(newInterest.trim())) {
                setInterests([...interests, newInterest.trim()]);
            }
            setNewInterest('');
        }
    };

    const removeInterest = (interest: string) => {
        setInterests(interests.filter(i => i !== interest));
    };

    return (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm">
            <div
                role="dialog"
                id="radix-_r_6a_"
                aria-describedby="radix-_r_6c_"
                aria-labelledby="radix-_r_6b_"
                data-state="open"
                className="fixed left-[50%] sm:top-[50%] max-sm:bottom-0 z-50 grid w-full translate-x-[-50%] gap-4 border bg-background p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 sm:data-[state=closed]:zoom-out-95 sm:data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=open]:slide-in-from-left-1/2 sm:data-[state=closed]:slide-out-to-top-[48%] data-[state=closed]:slide-out-to-bottom-[48%] sm:data-[state=open]:slide-in-from-top-[48%] data-[state=open]:slide-in-from-bottom-[48%] sm:max-w-lg sm:translate-y-[-50%] sm:rounded-lg md:w-full select-text"
                tabIndex={-1}
                style={{ pointerEvents: 'auto' }}
            >
                <div className="flex flex-col space-y-1.5 text-center sm:text-left">
                    <h2 id="radix-_r_6b_" className="font-semibold tracking-tight flex flex-row text-start gap-2 text-2xl">Manage Interests</h2>
                    <p id="radix-_r_6c_" className="text-sm text-muted-foreground text-start">Add and remove interests to help us find better matches for you.</p>
                </div>
                <div className="w-full flex flex-row justify-between font-semibold bg-card p-2 rounded-md items-center">
                    Match with interests
                    <button
                        type="button"
                        role="switch"
                        aria-checked={matchEnabled}
                        data-state={matchEnabled ? "checked" : "unchecked"}
                        value="on"
                        className="peer inline-flex h-[24px] w-[44px] shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50"
                        style={{ backgroundColor: matchEnabled ? 'hsl(var(--primary))' : 'hsl(var(--input))' }}
                        onClick={() => setMatchEnabled(!matchEnabled)}
                    >
                        <span
                            data-state={matchEnabled ? "checked" : "unchecked"}
                            className="pointer-events-none block h-5 w-5 rounded-full bg-background shadow-lg ring-0 transition-transform"
                            style={{ transform: matchEnabled ? 'translateX(20px)' : 'translateX(0px)' }}
                        />
                    </button>
                </div>

                <div className="w-full flex flex-row justify-between font-semibold bg-card p-2 rounded-md items-center">
                    Verified Users Only
                    <button
                        type="button"
                        role="switch"
                        aria-checked={verifiedOnly}
                        data-state={verifiedOnly ? "checked" : "unchecked"}
                        disabled={!isVerified}
                        className="peer inline-flex h-[24px] w-[44px] shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50"
                        style={{ backgroundColor: (verifiedOnly && isVerified) ? 'hsl(var(--primary))' : 'hsl(var(--input))' }}
                        onClick={() => setVerifiedOnly(!verifiedOnly)}
                    >
                        <span
                            data-state={verifiedOnly ? "checked" : "unchecked"}
                            className="pointer-events-none block h-5 w-5 rounded-full bg-background shadow-lg ring-0 transition-transform"
                            style={{ transform: verifiedOnly ? 'translateX(20px)' : 'translateX(0px)' }}
                        />
                    </button>
                </div>

                <div className="w-full flex flex-col font-semibold bg-card p-2 rounded-md gap-2">
                    <span className="text-sm">Gender Filter</span>
                    <div className="flex flex-row gap-2">
                        {['both', 'male', 'female'].map((filter) => (
                            <button
                                key={filter}
                                onClick={() => setGenderFilter(filter)}
                                className={`flex-1 px-2 py-1.5 text-xs rounded-md transition-colors border ${genderFilter === filter
                                    ? 'bg-primary text-primary-foreground border-primary'
                                    : 'bg-muted text-muted-foreground border-border hover:bg-accent'
                                    }`}
                            >
                                {filter.charAt(0).toUpperCase() + filter.slice(1)}
                            </button>
                        ))}
                    </div>
                </div>
                <div>
                    <div className="mb-4 flex flex-wrap items-center gap-2 rounded-md border border-border/20 bg-card p-3">
                        {interests.map(interest => (
                            <div key={interest} className="group inline-flex items-center justify-center gap-1.5 rounded-full bg-muted px-3 py-1.5 text-sm font-medium text-foreground">
                                {interest}
                                <button
                                    type="button"
                                    onClick={() => removeInterest(interest)}
                                    className="ml-1 inline-flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full bg-foreground/15 text-foreground/80 hover:bg-foreground/25"
                                >
                                    <span className="sr-only">Remove</span>
                                    <svg stroke="currentColor" fill="currentColor" strokeWidth="0" viewBox="0 0 20 20" aria-hidden="true" height="10" width="10" xmlns="http://www.w3.org/2000/svg">
                                        <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd"></path>
                                    </svg>
                                </button>
                            </div>
                        ))}
                        <input
                            className="inline-flex h-8 min-w-[10rem] select-auto rounded-md border border-border/20 bg-muted px-3 text-sm text-foreground placeholder:text-muted-foreground/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                            maxLength={32}
                            placeholder="Add an interest..."
                            type="text"
                            value={newInterest}
                            onChange={(e) => setNewInterest(e.target.value)}
                            onKeyDown={handleAddInterest}
                        />
                    </div>
                    <div className="flex flex-col gap-2.5 pt-2.5 pr-2 bg-card py-3 rounded-md px-2">
                        <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 inline-flex items-center gap-1 space-y-1" htmlFor="necessary">
                            Max Wait Duration
                            <span className="max-lg:hidden" data-state="closed">
                                <svg xmlns="http://www.w3.org/2000/svg" width="16.5" height="16.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-circle-question-mark cursor-pointer focus:outline-primary max-lg:hidden" aria-hidden="true">
                                    <circle cx="12" cy="12" r="10"></circle>
                                    <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path>
                                    <path d="M12 17h.01"></path>
                                </svg>
                            </span>
                        </label>
                        <div role="radiogroup" aria-required="false" dir="ltr" className="flex flex-row gap-1.5 sm:gap-3" tabIndex={0} style={{ outline: 'none' }}>
                            {[
                                { id: '5s', label: '5 sec', value: '5s' },
                                { id: '10s', label: '10 sec', value: '10s' },
                                { id: '30s', label: '30 sec', value: '30s' },
                                { id: '10m', label: 'Forever', value: '10m' }
                            ].map((option) => (
                                <div key={option.id} className="flex-shrink-0 flex-wrap">
                                    <button
                                        type="button"
                                        role="radio"
                                        aria-checked={selectedDuration === option.value}
                                        data-state={selectedDuration === option.value ? "checked" : "unchecked"}
                                        value={option.value}
                                        className="aspect-square h-4 w-4 rounded-full border border-primary text-primary ring-offset-background focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 peer sr-only"
                                        id={option.id}
                                        tabIndex={-1}
                                        onClick={() => setSelectedDuration(option.value)}
                                    >
                                        <span data-state={selectedDuration === option.value ? "checked" : "unchecked"} className="flex items-center justify-center">
                                            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-circle h-2.5 w-2.5 fill-current text-current" aria-hidden="true">
                                                <circle cx="12" cy="12" r="10"></circle>
                                            </svg>
                                        </span>
                                    </button>
                                    <label
                                        className="peer-disabled:cursor-not-allowed peer-disabled:opacity-70 inline-flex disabled:select-none items-center justify-center text-sm font-medium ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-9 rounded-md px-3 cursor-pointer peer-data-[state=checked]:text-primary-foreground peer-data-[state=checked]:bg-primary [&:has([data-state=checked])]:bg-primary [&:has([data-state=checked])]:text-primary-foreground"
                                        htmlFor={option.id}
                                        onClick={() => setSelectedDuration(option.value)}
                                    >
                                        {option.label}
                                    </label>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
                <div className="flex flex-col-reverse max-md:gap-3 sm:flex-row sm:justify-end sm:space-x-2">
                    <button
                        onClick={onClose}
                        className="inline-flex disabled:select-none items-center justify-center rounded-md text-sm font-medium ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-secondary text-secondary-foreground hover:bg-secondary/80 h-10 px-4 py-2"
                    >
                        Done
                    </button>
                </div>
            </div>
        </div>
    );
};

// --- Settings Modal ---
export const SettingsModal: React.FC<SettingsModalProps> = ({ onClose, onOpenInterests, theme: propTheme = 'light' }) => {
    const {
        displayName, setDisplayName,
        theme, setTheme,
        interests, avatarSeed, avatarUrl, setAvatarUrl,
        bannerType, setBannerType,
        bannerColor, setBannerColor,
        bannerGradient, setBannerGradient,
        blockedUsers, unblockUser
    } = useSessionStore();
    const { wasm } = useWasm();
    const [activeTab, setActiveTab] = useState('Profile');
    const [isEditingUsername, setIsEditingUsername] = useState(false);
    const [tempUsername, setTempUsername] = useState(displayName);
    const [showColorPicker, setShowColorPicker] = useState(false);

    const gradients = [
        'linear-gradient(45deg, #d53f8c, #4f46e5)', // Default/Lavender-ish
        'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', // Deep Purple
        'linear-gradient(to right, #00c6ff, #0072ff)', // Ocean Blue
        'linear-gradient(to right, #f83600 0%, #f9d423 100%)', // Sunset
        'linear-gradient(to right, #11998e, #38ef7d)', // Emerald
        'linear-gradient(to right, #ff00cc, #3333ff)', // Neon
        'linear-gradient(to right, #000000, #434343)', // Pitch Black / Carbon
    ];

    const exoticGradients = [
        { name: 'Aurora', class: 'bg-mesh-aurora' },
        { name: 'Midnight', class: 'bg-mesh-midnight' },
        { name: 'Velvet', class: 'bg-mesh-velvet' },
        { name: 'Cyber', class: 'bg-mesh-cyber' }
    ];
    const mobileAvatarInputRef = useRef<HTMLInputElement>(null);
    const desktopAvatarInputRef = useRef<HTMLInputElement>(null);
    const [avatarBusy, setAvatarBusy] = useState(false);
    const [avatarError, setAvatarError] = useState<string | null>(null);
    const [showAvatarCropModal, setShowAvatarCropModal] = useState(false);
    const [selectedImageSrc, setSelectedImageSrc] = useState<string>('');

    // Sync temp username when displayName changes
    useEffect(() => {
        setTempUsername(displayName);
    }, [displayName]);

    const dicebearUrl = `https://api.dicebear.com/5.x/thumbs/png?shapeColor=FD8A8A,F1F7B5,82AAE3,9EA1D4,A084CA,EBC7E8,A7D2CB,F07DEA,EC7272,FFDBA4,59CE8F,ABC270,FF74B1,31C6D4&backgroundColor=554994,594545,495579,395144,3F3B6C,2B3A55,404258,344D67&translateY=5&seed=${avatarSeed}&scale=110&eyesColor=000000,ffffff&faceOffsetY=0&size=80`;
    const avatarSrc = avatarUrl || dicebearUrl;

    const isWasmReady = Boolean(wasm?.ImageCompressor);

    const getImageDimensions = useCallback(async (file: File) => {
        if (typeof createImageBitmap !== 'function') return null;
        let bitmap: ImageBitmap | null = null;
        try {
            bitmap = await createImageBitmap(file);
            return { width: bitmap.width, height: bitmap.height };
        } catch (err) {
            return null;
        } finally {
            if (bitmap) {
                try {
                    bitmap.close();
                } catch (e) {
                }
            }
        }
    }, []);

    const compressAvatar = useCallback(async (file: File): Promise<Blob> => {
        if (!isWasmReady) {
            throw new Error('Image compressor not ready');
        }
        const arrayBuffer = await file.arrayBuffer();
        const uint8Array = new Uint8Array(arrayBuffer);
        const compressor = new wasm.ImageCompressor();
        try {
            const sizes = [160, 128, 96];
            let lastBlob: Blob | null = null;
            for (const size of sizes) {
                const compressed = compressor.compress_to_webp(uint8Array, size, size);
                const blob = new Blob([compressed], { type: 'image/webp' });
                lastBlob = blob;
                // Aim for under 30KB for signaling health
                if (blob.size <= 30 * 1024) {
                    return blob;
                }
            }
            return lastBlob || file;
        } finally {
            try {
                compressor.free();
            } catch (err) {
            }
        }
    }, [isWasmReady, wasm]);

    const readBlobAsDataUrl = useCallback((blob: Blob) => (
        new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = () => reject(new Error('Failed to read file'));
            reader.readAsDataURL(blob);
        })
    ), []);

    const handleAvatarFile = useCallback(async (file: File) => {
        setAvatarError(null);
        if (!file.type.startsWith('image/')) {
            setAvatarError('Please select an image file.');
            return;
        }
        if (file.size > 8 * 1024 * 1024) {
            setAvatarError('Image exceeds 8MB limit.');
            return;
        }
        const dimensions = await getImageDimensions(file);
        if (dimensions && (dimensions.width < 256 || dimensions.height < 256)) {
            setAvatarError('Image resolution is too low. Minimum 256x256.');
            return;
        }
        if (!isWasmReady) {
            setAvatarError('Image compressor is still loading.');
            return;
        }
        setAvatarBusy(true);
        try {
            const processed = await compressAvatar(file);
            if (processed.size > 100 * 1024) {
                setAvatarError('Image is still too large after optimization (>100KB).');
                return;
            }
            const dataUrl = await readBlobAsDataUrl(processed);
            setAvatarUrl(dataUrl);
        } catch (err) {
            setAvatarError('Failed to process image.');
        } finally {
            setAvatarBusy(false);
        }
    }, [compressAvatar, getImageDimensions, isWasmReady, readBlobAsDataUrl, setAvatarUrl]);

    const handleAvatarInputChange = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        setAvatarError(null);
        if (!file.type.startsWith('image/')) {
            setAvatarError('Please select an image file.');
            event.target.value = '';
            return;
        }

        const reader = new FileReader();
        reader.onloadend = () => {
            setSelectedImageSrc(reader.result as string);
            setShowAvatarCropModal(true);
        };
        reader.readAsDataURL(file);
        event.target.value = '';
    }, []);

    const handleCropComplete = useCallback(async (blob: Blob) => {
        setShowAvatarCropModal(false);
        const file = new File([blob], 'avatar.jpg', { type: 'image/jpeg' });
        await handleAvatarFile(file);
    }, [handleAvatarFile]);

    const triggerMobileAvatarPicker = useCallback(() => {
        setAvatarError(null);
        mobileAvatarInputRef.current?.click();
    }, []);

    const triggerDesktopAvatarPicker = useCallback(() => {
        setAvatarError(null);
        desktopAvatarInputRef.current?.click();
    }, []);

    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [openDropdown, setOpenDropdown] = useState<string | null>(null);

    // Preferences State (Local for now, until added to sessionStore)
    const [convertEmoticons, setConvertEmoticons] = useState(true);
    const [blurImages, setBlurImages] = useState(true);
    const [notificationSound, setNotificationSound] = useState(true);
    const [pushNotifications, setPushNotifications] = useState(false);
    const [friendRequests, setFriendRequests] = useState(true);
    const [badgeVisibility, setBadgeVisibility] = useState('Everyone');
    const [interestsVisibility, setInterestsVisibility] = useState('Friends');

    const handleSaveUsername = () => {
        setDisplayName(tempUsername);
        setIsEditingUsername(false);
    };

    const handleDeleteAccount = async () => {
        await deepCleanAccountData();
    };

    const renderSwitch = (checked: boolean, onChange: (val: boolean) => void) => (
        <button
            type="button"
            role="switch"
            aria-checked={checked}
            data-state={checked ? 'checked' : 'unchecked'}
            value="on"
            className="peer inline-flex h-[24px] w-[44px] shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50"
            style={{ backgroundColor: checked ? 'hsl(var(--primary))' : 'hsl(var(--input))' }}
            onClick={() => onChange(!checked)}
        >
            <span
                data-state={checked ? 'checked' : 'unchecked'}
                className="pointer-events-none relative block h-5 w-5 rounded-full shadow-lg ring-0 transition-transform"
                style={{
                    backgroundColor: checked ? 'hsl(var(--primary-foreground))' : 'hsl(var(--background))',
                    transform: checked ? 'translateX(20px)' : 'translateX(0px)'
                }}
            >
                {checked ? (
                    <SolidCheckCircleIcon className="w-4 h-4 absolute inset-0 m-auto text-primary" />
                ) : (
                    <span className="absolute inset-0 m-auto h-2.5 w-2.5 text-foreground">
                        <svg stroke="currentColor" fill="currentColor" strokeWidth="3" viewBox="0 0 384 512" className="h-2.5 w-2.5">
                            <path d="M376.6 84.5c11.3-13.6 9.5-33.8-4.1-45.1s-33.8-9.5-45.1 4.1L192 206 56.6 43.5C45.3 29.9 25.1 28.1 11.5 39.4S-3.9 70.9 7.4 84.5L150.3 256 7.4 427.5c-11.3 13.6-9.5 33.8 4.1 45.1s33.8 9.5 45.1-4.1L192 306 327.4 468.5c11.3 13.6 31.5 15.4 45.1 4.1s15.4-31.5 4.1-45.1L233.7 256 376.6 84.5z" />
                        </svg>
                    </span>
                )}
            </span>
        </button>
    );

    const visibilityOptions = ['Everyone', 'Friends', 'Nobody'];

    const renderDropdown = (id: string, value: string, onChange: (val: string) => void, options: string[]) => (
        <div className="relative">
            <button
                className="flex h-9 items-center justify-between rounded-md bg-secondary text-secondary-foreground hover:bg-secondary/80 px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50 w-[140px]"
                onClick={() => setOpenDropdown(openDropdown === id ? null : id)}
            >
                <span>{value}</span>
                <ChevronDownIcon className="h-4 w-4 opacity-50" />
            </button>
            {openDropdown === id && (
                <div className="absolute right-0 top-full mt-1 z-50 w-[140px] rounded-md border border-border bg-popover p-1 shadow-lg">
                    {options.map(opt => (
                        <button
                            key={opt}
                            className={`w-full text-left px-3 py-1.5 text-sm rounded-sm hover:bg-accent hover:text-accent-foreground transition-colors ${opt === value ? 'bg-accent text-accent-foreground font-medium' : ''}`}
                            onClick={() => { onChange(opt); setOpenDropdown(null); }}
                        >
                            {opt}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );

    const renderBlockedUsersContent = () => (
        <div className="w-full">
            {blockedUsers.length === 0 ? (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                    <p className="text-sm">You haven't blocked anyone yet.</p>
                </div>
            ) : (
                <div className="space-y-3">
                    <p className="text-sm text-muted-foreground">You have blocked {blockedUsers.length} {blockedUsers.length === 1 ? 'user' : 'users'}.</p>
                    {blockedUsers.map((user) => {
                        const fallback = `https://api.dicebear.com/5.x/thumbs/png?shapeColor=FD8A8A,F1F7B5,82AAE3,9EA1D4,A084CA,EBC7E8,A7D2CB,F07DEA,EC7272,FFDBA4,59CE8F,ABC270,FF74B1,31C6D4&backgroundColor=554994,594545,495579,395144,3F3B6C,2B3A55,404258,344D67&translateY=5&seed=${user.avatarSeed || user.id}&scale=110&eyesColor=000000,ffffff&faceOffsetY=0&size=80`;
                        return (
                            <div key={user.id} className="flex items-center justify-between rounded-md border border-border/40 bg-action px-3 py-2.5">
                                <div className="flex items-center gap-3 min-w-0">
                                    <span className="relative flex shrink-0 overflow-hidden rounded-full h-10 w-10">
                                        <img className="aspect-square h-full w-full" alt={user.username} src={user.avatarUrl || fallback} />
                                    </span>
                                    <div className="min-w-0">
                                        <p className="text-sm font-semibold truncate">{user.username}</p>
                                        <p className="text-xs text-muted-foreground truncate">Blocked at {new Date(user.blockedAt).toLocaleDateString('en-US')}</p>
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    className="inline-flex disabled:select-none items-center justify-center rounded-md text-sm font-medium ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-9 px-3 py-2"
                                    onClick={() => unblockUser(user.id)}
                                >
                                    Unblock
                                </button>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );

    return (
        <>
            <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" onClick={onClose} />
            <div className={`chitchat-dashboard-theme settings-modal-theme ${theme === 'dark' ? 'theme-dark' : ''}`}>
                <div
                    role="dialog"
                    id="radix-_r_49_"
                    aria-describedby="radix-_r_4b_"
                    aria-labelledby="radix-_r_4a_"
                    data-state="open"
                    className="fixed left-[50%] sm:top-[50%] max-sm:bottom-0 z-50 w-full translate-x-[-50%] gap-4 border bg-background p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 sm:data-[state=closed]:zoom-out-95 sm:data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=open]:slide-in-from-left-1/2 sm:data-[state=closed]:slide-out-to-top-[48%] data-[state=closed]:slide-out-to-bottom-[48%] sm:data-[state=open]:slide-in-from-top-[48%] data-[state=open]:slide-in-from-bottom-[48%] sm:max-w-lg sm:translate-y-[-50%] sm:rounded-lg md:w-full select-text md:min-w-[620px] md:h-[450px] flex flex-col max-md:px-3.5 border-none"
                    tabIndex={-1}
                    style={{ pointerEvents: 'auto' }}
                >
                    <div className="flex flex-col space-y-1.5 text-center sm:text-left">
                        <h2 id="radix-_r_4a_" className="text-lg font-semibold leading-none tracking-tight">Settings</h2>
                    </div>

                    {/* Mobile Navigation */}
                    <nav className="w-full flex-row gap-2 flex md:hidden">
                        <div dir="ltr" data-orientation="horizontal" className="h-[400px] overflow-auto max-md:gap-2.5 max-md:content-start max-md:flex max-md:flex-wrap max-md:justify-center ">
                            <div role="tablist" aria-orientation="horizontal" className="h-10 items-center rounded-md bg-muted p-1 text-muted-foreground overflow-x-auto flex justify-normal" tabIndex={0} data-orientation="horizontal" style={{ outline: 'none' }}>
                                {['Profile', 'Account', 'Privacy', 'Preferences', 'Blocked'].map(tab => (
                                    <button
                                        key={tab}
                                        type="button"
                                        role="tab"
                                        aria-selected={activeTab === tab}
                                        data-state={activeTab === tab ? "active" : "inactive"}
                                        className="inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm"
                                        tabIndex={-1}
                                        data-orientation="horizontal"
                                        onClick={() => setActiveTab(tab)}
                                    >
                                        {tab}
                                    </button>
                                ))}
                            </div>
                            {/* Mobile Content Rendering would go here, mirroring desktop content logic */}
                            {activeTab === 'Profile' && (
                                <div data-state="active" data-orientation="horizontal" role="tabpanel" className="mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 w-full">
                                    <div className="flex flex-col w-full animate-in fade-in slide-in-from-right-4 duration-200">
                                        <label className="text-sm font-bold text-card-foreground" htmlFor="_r_av_mobile"> Avatar </label>
                                        <div className="flex w-full gap-1 justify-between items-center py-1 pb-2">
                                            <span className="relative flex shrink-0 overflow-hidden rounded-full w-16 h-16">
                                                <img className="aspect-square h-full w-full" alt={displayName} src={avatarSrc} />
                                            </span>
                                            <div className="flex flex-row gap-1">
                                                <button onClick={triggerMobileAvatarPicker} className="inline-flex disabled:select-none items-center justify-center text-sm font-medium ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-secondary text-secondary-foreground hover:bg-secondary/80 h-9 rounded-md px-3" type="button" disabled={avatarBusy || !isWasmReady}>Change</button>
                                                <button onClick={() => { setAvatarUrl(null); setAvatarError(null); }} className="inline-flex disabled:select-none items-center justify-center text-sm font-medium ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-secondary text-secondary-foreground hover:bg-secondary/80 h-9 rounded-md px-3" type="button" disabled={avatarBusy || !avatarUrl}>Remove</button>
                                            </div>
                                            <input ref={mobileAvatarInputRef} className="hidden" id="_r_av_mobile" type="file" accept="image/*" onChange={handleAvatarInputChange} />
                                        </div>
                                        {avatarError ? (
                                            <span className="text-xs text-destructive">{avatarError}</span>
                                        ) : (
                                            <span className="text-xs text-card-foreground">
                                                {avatarBusy ? 'Optimizing image...' : !isWasmReady ? 'Image compressor loading...' : 'Avatars are reviewed before displaying. Do not upload inappropriate avatars. Limit: 3 changes daily. Max 8MB.'}
                                            </span>
                                        )}

                                        <div data-orientation="horizontal" role="none" className="shrink-0 bg-border h-[1px] w-full my-2.5"></div>

                                        <span className="text-sm font-bold text-card-foreground">Banner</span>
                                        <span></span>
                                        <div className="flex flex-row gap-3 items-center">
                                            <div className="flex items-center flex-col gap-1.5">
                                                <button
                                                    onClick={() => {
                                                        setBannerType('Simple');
                                                        setShowColorPicker(true);
                                                    }}
                                                    className="disabled:select-none items-center justify-center text-sm font-medium ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 hover:brightness-110 h-10 w-12 rounded-lg bg-muted relative flex flex-col p-0 m-0 transition-all border-2"
                                                    style={{
                                                        backgroundColor: bannerColor,
                                                        borderColor: bannerType === 'Simple' ? 'white' : 'transparent'
                                                    }}
                                                >
                                                    <svg stroke="currentColor" fill="currentColor" strokeWidth="0" viewBox="0 0 20 20" aria-hidden="true" className="text-white drop-shadow-sm" height="14" width="14" xmlns="http://www.w3.org/2000/svg"><path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z"></path></svg>
                                                </button>
                                                <span className="text-[10px] font-bold text-muted-foreground uppercase">Simple</span>
                                            </div>

                                            <div className="w-px h-8 bg-border"></div>

                                            <div className="flex flex-row gap-1.5 overflow-x-auto pb-1 max-w-[120px] scrollbar-none">
                                                {gradients.map((grad, i) => (
                                                    <div key={i} className="flex items-center flex-col gap-1.5">
                                                        <button
                                                            onClick={() => {
                                                                setBannerType('Gradient');
                                                                setBannerGradient(grad);
                                                            }}
                                                            className="disabled:select-none items-center justify-center text-sm font-medium ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 hover:brightness-110 h-10 w-12 rounded-lg relative flex flex-col p-0 m-0 transition-all border-2 shrink-0"
                                                            style={{
                                                                backgroundImage: grad,
                                                                borderColor: (bannerType === 'Gradient' && bannerGradient === grad) ? 'white' : 'transparent'
                                                            }}
                                                        >
                                                            {(bannerType === 'Gradient' && bannerGradient === grad) && (
                                                                <svg stroke="currentColor" fill="currentColor" strokeWidth="0" viewBox="0 0 20 20" aria-hidden="true" className="text-white drop-shadow-sm" height="14" width="14" xmlns="http://www.w3.org/2000/svg"><path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z"></path></svg>
                                                            )}
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>

                                            <div className="w-px h-8 bg-border"></div>

                                            <div className="flex flex-row gap-1.5 overflow-x-auto pb-1 max-w-[120px] scrollbar-none">
                                                {exoticGradients.map((mesh, i) => (
                                                    <div key={i} className="flex items-center flex-col gap-1.5">
                                                        <button
                                                            onClick={() => {
                                                                setBannerType('Mesh');
                                                                setBannerGradient(mesh.class);
                                                            }}
                                                            className={`disabled:select-none items-center justify-center text-sm font-medium ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 hover:brightness-110 h-10 w-12 rounded-lg relative flex flex-col p-0 m-0 transition-all border-2 shrink-0 overflow-hidden ${mesh.class}`}
                                                            style={{
                                                                borderColor: (bannerType === 'Mesh' && bannerGradient === mesh.class) ? 'white' : 'transparent'
                                                            }}
                                                        >
                                                            {(bannerType === 'Mesh' && bannerGradient === mesh.class) && (
                                                                <svg stroke="currentColor" fill="currentColor" strokeWidth="0" viewBox="0 0 20 20" aria-hidden="true" className="text-white drop-shadow-sm z-10" height="14" width="14" xmlns="http://www.w3.org/2000/svg"><path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z"></path></svg>
                                                            )}
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>

                                        <div data-orientation="horizontal" role="none" className="shrink-0 bg-border h-[1px] w-full my-2.5"></div>

                                        <div className="space-y-2">
                                            <label className="peer-disabled:cursor-not-allowed peer-disabled:opacity-70 text-xs font-bold text-card-foreground" htmlFor="nickname-mobile">NICKNAME</label>
                                            <div className="flex flex-col !mt-1">
                                                {isEditingUsername ? (
                                                    <form
                                                        className="w-full max-w-sm items-center space-x-2 flex"
                                                        onSubmit={(e) => { e.preventDefault(); handleSaveUsername(); }}
                                                    >
                                                        <input
                                                            id="nickname-mobile"
                                                            className="flex h-10 w-full rounded-md border border-input bg-field px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                                            placeholder="nickname"
                                                            value={tempUsername}
                                                            name="username"
                                                            onChange={(e) => setTempUsername(e.target.value)}
                                                            autoFocus
                                                        />
                                                        <button type="submit" className="inline-flex disabled:select-none items-center justify-center rounded-md text-sm font-medium ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-10 w-10">
                                                            <CheckIcon className="h-4 w-4" />
                                                        </button>
                                                        <button type="button" onClick={() => setIsEditingUsername(false)} className="inline-flex disabled:select-none items-center justify-center rounded-md text-sm font-medium ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-destructive text-destructive-foreground hover:bg-destructive/90 h-10 w-10">
                                                            <XIcon className="h-4 w-4" />
                                                        </button>
                                                    </form>
                                                ) : (
                                                    <div className="w-full flex flex-row items-center justify-between">
                                                        <span className="text-brightness/65 translate-y-0.5">{displayName}</span>
                                                        <button
                                                            onClick={() => setIsEditingUsername(true)}
                                                            className="inline-flex disabled:select-none items-center justify-center text-sm font-medium ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-secondary text-secondary-foreground hover:bg-secondary/80 h-9 rounded-md px-3"
                                                            type="button"
                                                        >
                                                            Edit
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                            <p className="text-muted-foreground text-xs">You have <b>3</b> name changes left for today.</p>
                                        </div>

                                        <div data-orientation="horizontal" role="none" className="shrink-0 bg-border h-[1px] w-full my-2.5"></div>

                                        <label className="text-sm font-bold text-card-foreground"> INTERESTS (ON)</label>
                                        <div className="relative flex w-full flex-row items-center justify-between gap-1">
                                            <label className="text-xs text-muted-foreground">You have {interests.length} interests</label>
                                            <button onClick={onOpenInterests} className="inline-flex disabled:select-none items-center justify-center text-sm font-medium ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-secondary text-secondary-foreground hover:bg-secondary/80 h-9 rounded-md px-3">Edit</button>
                                        </div>
                                    </div>
                                </div>
                            )}
                            {activeTab === 'Account' && (
                                <div data-state="active" data-orientation="horizontal" role="tabpanel" className="mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 w-full">
                                    <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-200">
                                        <div className="flex items-center justify-between space-x-2">
                                            <label className="text-sm font-medium leading-none flex flex-col space-y-1">
                                                <span>Account Removal</span>
                                                <span className="font-normal leading-snug text-muted-foreground">Permanently delete your account.</span>
                                            </label>
                                            <button
                                                onClick={() => setShowDeleteModal(true)}
                                                className="inline-flex items-center justify-center text-sm font-medium bg-destructive text-destructive-foreground hover:bg-destructive/90 h-9 rounded-md px-3 gap-2"
                                            >
                                                <DeleteAccountIcon className="w-4 h-4" /> Delete
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}
                            {activeTab === 'Privacy' && (
                                <div data-state="active" data-orientation="horizontal" role="tabpanel" className="mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 w-full">
                                    <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-200">
                                        <div className="flex items-center justify-between space-x-2">
                                            <label className="text-sm font-medium leading-none flex flex-col space-y-1">
                                                <span>Badge Visibility <span className="text-xs text-muted-foreground">(Premium Only)</span></span>
                                                <span className="font-normal leading-snug text-muted-foreground">Set who can see your profile badges.</span>
                                            </label>
                                            {renderDropdown('badge-mobile', badgeVisibility, setBadgeVisibility, visibilityOptions)}
                                        </div>
                                        <div className="shrink-0 bg-border h-[1px] w-full my-2.5"></div>
                                        <div className="flex items-center justify-between space-x-2">
                                            <label className="text-sm font-medium leading-none flex flex-col space-y-1">
                                                <span>Interests Visibility</span>
                                                <span className="font-normal leading-snug text-muted-foreground">Set who can see your interests.</span>
                                            </label>
                                            {renderDropdown('interests-mobile', interestsVisibility, setInterestsVisibility, visibilityOptions)}
                                        </div>
                                        <div className="shrink-0 bg-border h-[1px] w-full my-2.5"></div>
                                        <div className="flex items-center justify-between space-x-2">
                                            <label className="text-sm font-medium leading-none flex flex-col space-y-1">
                                                <span>Friend Requests</span>
                                                <span className="font-normal leading-snug text-muted-foreground">Allow strangers to send you friend requests.</span>
                                            </label>
                                            {renderSwitch(friendRequests, setFriendRequests)}
                                        </div>
                                    </div>
                                </div>
                            )}
                            {activeTab === 'Preferences' && (
                                <div data-state="active" data-orientation="horizontal" role="tabpanel" className="mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 w-full">
                                    <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-200">
                                        <div className="flex items-center justify-between space-x-2">
                                            <label className="text-sm font-medium leading-none flex flex-col space-y-1">
                                                <span>Automatically convert emoticons to emojis</span>
                                                <span className="font-normal leading-snug text-muted-foreground">For example, :) turns into 😃.</span>
                                            </label>
                                            {renderSwitch(convertEmoticons, setConvertEmoticons)}
                                        </div>
                                        <div className="shrink-0 bg-border h-[1px] w-full my-2.5"></div>
                                        <div className="flex items-center justify-between space-x-2">
                                            <label className="text-sm font-medium leading-none flex flex-col space-y-1">
                                                <span>Blur Images</span>
                                                <span className="font-normal leading-snug text-muted-foreground">Blur images received from other users by default.</span>
                                            </label>
                                            {renderSwitch(blurImages, setBlurImages)}
                                        </div>
                                        <div className="shrink-0 bg-border h-[1px] w-full my-2.5"></div>
                                        <div className="flex items-center justify-between space-x-2">
                                            <label className="text-sm font-medium leading-none flex flex-col space-y-1">
                                                <span>Notification Sound</span>
                                                <span className="font-normal leading-snug text-muted-foreground">Toggle the notification sound for new messages.</span>
                                            </label>
                                            {renderSwitch(notificationSound, setNotificationSound)}
                                        </div>
                                        <div className="shrink-0 bg-border h-[1px] w-full my-2.5"></div>
                                        <div className="flex items-center justify-between space-x-2">
                                            <label className="text-sm font-medium leading-none flex flex-col space-y-1">
                                                <span>Push Notifications</span>
                                                <span className="font-normal leading-snug text-muted-foreground">Receive site notifications.</span>
                                            </label>
                                            {renderSwitch(pushNotifications, setPushNotifications)}
                                        </div>
                                        <div className="shrink-0 bg-border h-[1px] w-full my-2.5"></div>
                                        <div className="flex items-center justify-between space-x-2">
                                            <label className="text-sm font-medium leading-none flex flex-col space-y-1">
                                                <span>Dark Mode</span>
                                                <span className="font-normal leading-snug text-muted-foreground">Toggle the dark mode for the app.</span>
                                            </label>
                                            {renderSwitch(theme === 'dark', (val) => setTheme(val ? 'dark' : 'light'))}
                                        </div>
                                    </div>
                                </div>
                            )}
                            {activeTab === 'Blocked' && (
                                <div data-state="active" data-orientation="horizontal" role="tabpanel" className="mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 w-full">
                                    {renderBlockedUsersContent()}
                                </div>
                            )}
                        </div>
                    </nav>

                    {/* Desktop Navigation & Content */}
                    <div className="flex-row gap-4 overflow-y-hidden py-1.5 hidden select-text md:flex h-full">
                        <nav className="flex [&>button]:w-full [&>button]:gap-2 [&>button]:justify-start flex-col gap-1.5 w-48 shrink-0">
                            <button onClick={() => setActiveTab('Profile')} className={`inline-flex disabled:select-none items-center justify-center rounded-md text-sm font-medium ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 h-10 px-4 py-2 ${activeTab === 'Profile' ? 'bg-secondary text-secondary-foreground hover:bg-secondary/80' : 'hover:bg-accent hover:text-accent-foreground'}`}>
                                <UserIcon className="w-4 h-4" />Profile
                            </button>
                            <button onClick={() => setActiveTab('Account')} className={`inline-flex disabled:select-none items-center justify-center rounded-md text-sm font-medium ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 h-10 px-4 py-2 ${activeTab === 'Account' ? 'bg-secondary text-secondary-foreground hover:bg-secondary/80' : 'hover:bg-accent hover:text-accent-foreground'}`}>
                                <CogIcon className="w-4 h-4" />Account
                            </button>
                            <button onClick={() => setActiveTab('Privacy')} className={`inline-flex disabled:select-none items-center justify-center rounded-md text-sm font-medium ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 h-10 px-4 py-2 ${activeTab === 'Privacy' ? 'bg-secondary text-secondary-foreground hover:bg-secondary/80' : 'hover:bg-accent hover:text-accent-foreground'}`}>
                                <ShieldIcon className="w-4 h-4" />Privacy
                            </button>
                            <button onClick={() => setActiveTab('Preferences')} className={`inline-flex disabled:select-none items-center justify-center rounded-md text-sm font-medium ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 h-10 px-4 py-2 ${activeTab === 'Preferences' ? 'bg-secondary text-secondary-foreground hover:bg-secondary/80' : 'hover:bg-accent hover:text-accent-foreground'}`}>
                                <Settings2Icon className="w-4 h-4" />Preferences
                            </button>
                            <button onClick={() => setActiveTab('Blocked')} className={`inline-flex disabled:select-none items-center justify-center rounded-md text-sm font-medium ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 h-10 px-4 py-2 ${activeTab === 'Blocked' ? 'bg-secondary text-secondary-foreground hover:bg-secondary/80' : 'hover:bg-accent hover:text-accent-foreground'}`}>
                                <BanIcon className="w-4 h-4" />Blocked
                            </button>
                        </nav>

                        <div dir="ltr" className="relative overflow-hidden pr-3 w-full [&>*]:pb-1 [&>*]:pr-1" style={{ position: 'relative', '--radix-scroll-area-corner-width': '0px', '--radix-scroll-area-corner-height': '0px' } as React.CSSProperties}>
                            <div data-radix-scroll-area-viewport="" className="h-full w-full rounded-[inherit]" style={{ overflow: 'hidden scroll' }}>
                                <div className="w-full block">
                                    {activeTab === 'Profile' && (
                                        <div className="flex flex-col w-full animate-in fade-in slide-in-from-right-4 duration-200">
                                            <label className="text-sm font-bold text-card-foreground" htmlFor="_r_av_"> Avatar </label>
                                            <div className="flex w-full gap-1 justify-between items-center py-1 pb-2 pr-6">
                                                <span className="relative flex shrink-0 overflow-hidden rounded-full w-16 h-16">
                                                    <img className="aspect-square h-full w-full" alt={displayName} src={avatarSrc} />
                                                </span>
                                                <div className="flex flex-row gap-1">
                                                    <button onClick={triggerDesktopAvatarPicker} className="inline-flex disabled:select-none items-center justify-center text-sm font-medium ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-secondary text-secondary-foreground hover:bg-secondary/80 h-9 rounded-md px-3" type="button" disabled={avatarBusy || !isWasmReady}>Change</button>
                                                    <button onClick={() => { setAvatarUrl(null); setAvatarError(null); }} className="inline-flex disabled:select-none items-center justify-center text-sm font-medium ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-secondary text-secondary-foreground hover:bg-secondary/80 h-9 rounded-md px-3" type="button" disabled={avatarBusy || !avatarUrl}>Remove</button>
                                                </div>
                                                <input ref={desktopAvatarInputRef} className="hidden" id="_r_av_" type="file" accept="image/*" onChange={handleAvatarInputChange} />
                                            </div>
                                            {avatarError ? (
                                                <span className="text-xs text-destructive">{avatarError}</span>
                                            ) : (
                                                <span className="text-xs text-card-foreground">
                                                    {avatarBusy ? 'Optimizing image...' : !isWasmReady ? 'Image compressor loading...' : 'Avatars are reviewed before displaying. Do not upload inappropriate avatars. Limit: 3 changes daily. Max 8MB.'}
                                                </span>
                                            )}

                                            <div data-orientation="horizontal" role="none" className="shrink-0 bg-border h-[1px] w-full my-2.5"></div>

                                            <span className="text-sm font-bold text-card-foreground">Banner</span>
                                            <span></span>
                                            <div className="flex flex-row gap-3 items-center">
                                                <div className="flex items-center flex-col gap-1.5">
                                                    <button
                                                        onClick={() => {
                                                            setBannerType('Simple');
                                                            setShowColorPicker(true);
                                                        }}
                                                        className="disabled:select-none items-center justify-center text-sm font-medium ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 hover:brightness-110 h-10 w-12 rounded-lg bg-muted relative flex flex-col p-0 m-0 transition-all border-2"
                                                        style={{
                                                            backgroundColor: bannerColor,
                                                            borderColor: bannerType === 'Simple' ? 'white' : 'transparent'
                                                        }}
                                                    >
                                                        <svg stroke="currentColor" fill="currentColor" strokeWidth="0" viewBox="0 0 20 20" aria-hidden="true" className="text-white drop-shadow-sm" height="14" width="14" xmlns="http://www.w3.org/2000/svg"><path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z"></path></svg>
                                                    </button>
                                                    <span className="text-[10px] font-bold text-muted-foreground uppercase">Simple</span>
                                                </div>

                                                <div className="w-px h-8 bg-border"></div>

                                                <div className="flex flex-row gap-1.5 overflow-x-auto pb-1 max-w-[150px] scrollbar-none">
                                                    {gradients.map((grad, i) => (
                                                        <div key={i} className="flex items-center flex-col gap-1.5">
                                                            <button
                                                                onClick={() => {
                                                                    setBannerType('Gradient');
                                                                    setBannerGradient(grad);
                                                                }}
                                                                className="disabled:select-none items-center justify-center text-sm font-medium ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 hover:brightness-110 h-10 w-12 rounded-lg relative flex flex-col p-0 m-0 transition-all border-2 shrink-0"
                                                                style={{
                                                                    backgroundImage: grad,
                                                                    borderColor: (bannerType === 'Gradient' && bannerGradient === grad) ? 'white' : 'transparent'
                                                                }}
                                                            >
                                                                {(bannerType === 'Gradient' && bannerGradient === grad) && (
                                                                    <svg stroke="currentColor" fill="currentColor" strokeWidth="0" viewBox="0 0 20 20" aria-hidden="true" className="text-white drop-shadow-sm" height="14" width="14" xmlns="http://www.w3.org/2000/svg"><path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z"></path></svg>
                                                                )}
                                                            </button>
                                                        </div>
                                                    ))}
                                                </div>

                                                <div className="w-px h-8 bg-border"></div>

                                                <div className="flex flex-row gap-1.5 overflow-x-auto pb-1 max-w-[150px] scrollbar-none">
                                                    {exoticGradients.map((mesh, i) => (
                                                        <div key={i} className="flex items-center flex-col gap-1.5">
                                                            <button
                                                                onClick={() => {
                                                                    setBannerType('Mesh');
                                                                    setBannerGradient(mesh.class);
                                                                }}
                                                                className={`disabled:select-none items-center justify-center text-sm font-medium ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 hover:brightness-110 h-10 w-12 rounded-lg relative flex flex-col p-0 m-0 transition-all border-2 shrink-0 overflow-hidden ${mesh.class}`}
                                                                style={{
                                                                    borderColor: (bannerType === 'Mesh' && bannerGradient === mesh.class) ? 'white' : 'transparent'
                                                                }}
                                                            >
                                                                {(bannerType === 'Mesh' && bannerGradient === mesh.class) && (
                                                                    <svg stroke="currentColor" fill="currentColor" strokeWidth="0" viewBox="0 0 20 20" aria-hidden="true" className="text-white drop-shadow-sm z-10" height="14" width="14" xmlns="http://www.w3.org/2000/svg"><path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z"></path></svg>
                                                                )}
                                                            </button>
                                                        </div>
                                                    ))}
                                                </div>

                                            </div>

                                            <div data-orientation="horizontal" role="none" className="shrink-0 bg-border h-[1px] w-full my-2.5"></div>

                                            <div className="relative flex w-full flex-col gap-1 pr-6">
                                                <div className="space-y-2">
                                                    <label className="peer-disabled:cursor-not-allowed peer-disabled:opacity-70 text-xs font-bold text-card-foreground" htmlFor="nickname-desktop">NICKNAME</label>
                                                    <div className="flex flex-col !mt-1">
                                                        {isEditingUsername ? (
                                                            <form
                                                                className="w-full max-w-sm items-center space-x-2 flex"
                                                                onSubmit={(e) => { e.preventDefault(); handleSaveUsername(); }}
                                                            >
                                                                <input
                                                                    id="nickname-desktop"
                                                                    className="flex h-10 w-full rounded-md border border-input bg-field px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                                                    placeholder="nickname"
                                                                    value={tempUsername}
                                                                    name="username"
                                                                    onChange={(e) => setTempUsername(e.target.value)}
                                                                    autoFocus
                                                                />
                                                                <button type="submit" className="inline-flex disabled:select-none items-center justify-center rounded-md text-sm font-medium ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-10 w-10">
                                                                    <CheckIcon className="h-4 w-4" />
                                                                </button>
                                                                <button type="button" onClick={() => setIsEditingUsername(false)} className="inline-flex disabled:select-none items-center justify-center rounded-md text-sm font-medium ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-destructive text-destructive-foreground hover:bg-destructive/90 h-10 w-10">
                                                                    <XIcon className="h-4 w-4" />
                                                                </button>
                                                            </form>
                                                        ) : (
                                                            <div className="w-full flex flex-row items-center justify-between">
                                                                <span className="text-brightness/65 translate-y-0.5">{displayName}</span>
                                                                <button
                                                                    onClick={() => setIsEditingUsername(true)}
                                                                    className="inline-flex disabled:select-none items-center justify-center rounded-md text-sm font-medium ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-secondary text-secondary-foreground hover:bg-secondary/80 h-9 rounded-md px-3"
                                                                    type="button"
                                                                >
                                                                    Edit
                                                                </button>
                                                            </div>
                                                        )}
                                                    </div>
                                                    <p className="text-muted-foreground text-xs">You have <b>3</b> name changes left for today.</p>
                                                </div>
                                            </div>

                                            <div data-orientation="horizontal" role="none" className="shrink-0 bg-border h-[1px] w-full my-2.5"></div>

                                            <label className="text-sm font-bold text-card-foreground"> INTERESTS (ON)</label>
                                            <div className="relative flex w-full flex-row items-center justify-between gap-1 pr-6">
                                                <label className="text-xs text-muted-foreground">You have {interests.length} interests</label>
                                                <button onClick={onOpenInterests} className="inline-flex disabled:select-none items-center justify-center text-sm font-medium ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-secondary text-secondary-foreground hover:bg-secondary/80 h-9 rounded-md px-3">Edit</button>
                                            </div>
                                        </div>
                                    )}

                                    {activeTab === 'Account' && (
                                        <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-200">
                                            <div className="flex items-center justify-between space-x-2">
                                                <label className="text-sm font-medium leading-none flex flex-col space-y-1">
                                                    <span>Account Removal</span>
                                                    <span className="font-normal leading-snug text-muted-foreground">Permanently delete your account.</span>
                                                </label>
                                                <button
                                                    onClick={() => setShowDeleteModal(true)}
                                                    className="inline-flex items-center justify-center text-sm font-medium bg-destructive text-destructive-foreground hover:bg-destructive/90 h-9 rounded-md px-3 gap-2"
                                                >
                                                    <DeleteAccountIcon className="w-4 h-4" /> Delete
                                                </button>
                                            </div>
                                        </div>
                                    )}

                                    {activeTab === 'Privacy' && (
                                        <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-200">
                                            <div className="flex items-center justify-between space-x-2">
                                                <label className="text-sm font-medium leading-none flex flex-col space-y-1">
                                                    <span>Badge Visibility <span className="text-xs text-muted-foreground">(Premium Only)</span></span>
                                                    <span className="font-normal leading-snug text-muted-foreground">Set who can see your profile badges.</span>
                                                </label>
                                                {renderDropdown('badge-desktop', badgeVisibility, setBadgeVisibility, visibilityOptions)}
                                            </div>
                                            <div className="shrink-0 bg-border h-[1px] w-full my-2.5"></div>
                                            <div className="flex items-center justify-between space-x-2">
                                                <label className="text-sm font-medium leading-none flex flex-col space-y-1">
                                                    <span>Interests Visibility</span>
                                                    <span className="font-normal leading-snug text-muted-foreground">Set who can see your interests.</span>
                                                </label>
                                                {renderDropdown('interests-desktop', interestsVisibility, setInterestsVisibility, visibilityOptions)}
                                            </div>
                                            <div className="shrink-0 bg-border h-[1px] w-full my-2.5"></div>
                                            <div className="flex items-center justify-between space-x-2">
                                                <label className="text-sm font-medium leading-none flex flex-col space-y-1">
                                                    <span>Friend Requests</span>
                                                    <span className="font-normal leading-snug text-muted-foreground">Allow strangers to send you friend requests.</span>
                                                </label>
                                                {renderSwitch(friendRequests, setFriendRequests)}
                                            </div>
                                        </div>
                                    )}

                                    {activeTab === 'Preferences' && (
                                        <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-200">
                                            <div className="flex items-center justify-between space-x-2">
                                                <label className="text-sm font-medium leading-none flex flex-col space-y-1">
                                                    <span>Automatically convert emoticons to emojis</span>
                                                    <span className="font-normal leading-snug text-muted-foreground">For example, :) turns into 😃.</span>
                                                </label>
                                                {renderSwitch(convertEmoticons, setConvertEmoticons)}
                                            </div>
                                            <div className="shrink-0 bg-border h-[1px] w-full my-2.5"></div>
                                            <div className="flex items-center justify-between space-x-2">
                                                <label className="text-sm font-medium leading-none flex flex-col space-y-1">
                                                    <span>Blur Images</span>
                                                    <span className="font-normal leading-snug text-muted-foreground">Blur images received from other users by default.</span>
                                                </label>
                                                {renderSwitch(blurImages, setBlurImages)}
                                            </div>
                                            <div className="shrink-0 bg-border h-[1px] w-full my-2.5"></div>
                                            <div className="flex items-center justify-between space-x-2">
                                                <label className="text-sm font-medium leading-none flex flex-col space-y-1">
                                                    <span>Notification Sound</span>
                                                    <span className="font-normal leading-snug text-muted-foreground">Toggle the notification sound for new messages.</span>
                                                </label>
                                                {renderSwitch(notificationSound, setNotificationSound)}
                                            </div>
                                            <div className="shrink-0 bg-border h-[1px] w-full my-2.5"></div>
                                            <div className="flex items-center justify-between space-x-2">
                                                <label className="text-sm font-medium leading-none flex flex-col space-y-1">
                                                    <span>Push Notifications</span>
                                                    <span className="font-normal leading-snug text-muted-foreground">Receive site notifications.</span>
                                                </label>
                                                {renderSwitch(pushNotifications, setPushNotifications)}
                                            </div>
                                            <div className="shrink-0 bg-border h-[1px] w-full my-2.5"></div>
                                            <div className="flex items-center justify-between space-x-2">
                                                <label className="text-sm font-medium leading-none flex flex-col space-y-1">
                                                    <span>Dark Mode</span>
                                                    <span className="font-normal leading-snug text-muted-foreground">Toggle the dark mode for the app.</span>
                                                </label>
                                                {renderSwitch(theme === 'dark', (val) => setTheme(val ? 'dark' : 'light'))}
                                            </div>
                                        </div>
                                    )}

                                    {activeTab === 'Blocked' && (
                                        <div className="pr-3">
                                            {renderBlockedUsersContent()}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>

                    <button
                        type="button"
                        className="absolute right-4 top-4 inline-flex h-8 w-8 items-center justify-center rounded-md border border-input bg-background/90 text-foreground/70 ring-offset-background transition-colors hover:bg-accent hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none"
                        onClick={onClose}
                    >
                        <CloseIcon className="h-4 w-4" />
                        <span className="sr-only">Close</span>
                    </button>
                </div>
                <ColorPickerModal
                    isOpen={showColorPicker}
                    onClose={() => setShowColorPicker(false)}
                    onApply={(color) => setBannerColor(color)}
                    initialColor={bannerColor}
                />
                <DeleteAccountModal
                    isOpen={showDeleteModal}
                    onClose={() => setShowDeleteModal(false)}
                    onDelete={() => {
                        handleDeleteAccount();
                    }}
                />
                <AvatarCropModal
                    isOpen={showAvatarCropModal}
                    imageSrc={selectedImageSrc}
                    onClose={() => setShowAvatarCropModal(false)}
                    onCropComplete={handleCropComplete}
                />
            </div>
        </>
    );
};
