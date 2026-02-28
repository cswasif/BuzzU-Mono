import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
    UserIcon, CogIcon, ShieldIcon, Settings2Icon, BanIcon,
    XIcon, CheckIcon, ChevronDownIcon, CircleQuestionIcon,
    DeleteAccountIcon, SolidCheckCircleIcon, LockIcon, UserXIcon
} from './Icons';

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
            <div className="bg-[#181818] border border-white/10 p-4 rounded-xl shadow-xl w-[300px] flex flex-col gap-4" onClick={e => e.stopPropagation()}>
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
                            className="w-6 h-6 rounded-full border border-white/10"
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
    const [confirmation, setConfirmation] = useState('');

    if (!isOpen) return null;

    return createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
            <div className="bg-background border border-border p-6 rounded-lg shadow-lg w-full max-w-md flex flex-col gap-4 animate-in fade-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
                <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2 text-destructive font-bold text-lg">
                        <UserXIcon className="w-6 h-6" />
                        <h2>Delete Account</h2>
                    </div>
                    <p className="text-sm text-muted-foreground">Note: If you want to take a break, you can log out instead.</p>
                    <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                        <li>Your account will be scheduled for deletion and will be deleted before 14 days</li>
                        <li>You can cancel the deletion process within 14 days by logging in.</li>
                        <li>After 14 days, your user data will be permanently deleted. You won't be able to recover it.</li>
                    </ul>
                </div>

                <input
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    placeholder="Type 'DELETE MY ACCOUNT' to confirm"
                    value={confirmation}
                    onChange={(e) => setConfirmation(e.target.value)}
                />

                <div className="flex justify-end gap-2">
                    <button
                        onClick={() => {
                            if (confirmation === 'DELETE MY ACCOUNT') {
                                onDelete();
                            }
                        }}
                        disabled={confirmation !== 'DELETE MY ACCOUNT'}
                        className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-destructive text-destructive-foreground hover:bg-destructive/90 h-10 px-4 py-2"
                    >
                        Delete My Account
                    </button>
                    <button
                        onClick={onClose}
                        className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-10 px-4 py-2"
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
    const [matchEnabled, setMatchEnabled] = useState(true);
    const [selectedDuration, setSelectedDuration] = useState('30s');

    return (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm">
            <div
                role="dialog"
                id="radix-_r_8g_"
                aria-describedby="radix-_r_8i_"
                aria-labelledby="radix-_r_8h_"
                data-state="open"
                className="relative z-50 grid w-full gap-4 border bg-background p-6 shadow-lg duration-200 animate-in fade-in zoom-in-95 slide-in-from-bottom-4 sm:max-w-lg sm:rounded-lg md:w-full select-text"
                tabIndex={-1}
                style={{ pointerEvents: 'auto' }}
            >
                <div className="flex flex-col space-y-1.5 text-center sm:text-left">
                    <h2 id="radix-_r_8h_" className="font-semibold tracking-tight flex flex-row text-start gap-2 text-2xl">Manage Interests</h2>
                    <p id="radix-_r_8i_" className="text-sm text-muted-foreground text-start">Add and remove interests to help us find better matches for you.</p>
                </div>
                <div className="w-full flex flex-row items-center justify-between font-semibold bg-card p-3 rounded-md border border-border/10">
                    <span className="text-sm font-bold text-card-foreground uppercase tracking-tight">Match with interests</span>
                    <button
                        type="button"
                        role="switch"
                        aria-checked={matchEnabled}
                        className="peer inline-flex h-[24px] w-[44px] shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50"
                        style={{ backgroundColor: matchEnabled ? 'hsl(var(--primary))' : 'hsl(var(--input))' }}
                        onClick={() => setMatchEnabled(!matchEnabled)}
                    >
                        <span
                            className="pointer-events-none relative block h-5 w-5 rounded-full bg-background shadow-lg ring-0 transition-transform flex items-center justify-center"
                            style={{ transform: matchEnabled ? 'translateX(20px)' : 'translateX(0px)' }}
                        >
                            {matchEnabled ? (
                                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-primary"><path d="M20 6 9 17l-5-5"></path></svg>
                            ) : (
                                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground"><path d="M18 6 6 18"></path><path d="m6 6 12 12"></path></svg>
                            )}
                        </span>
                    </button>
                </div>
                <div>
                    <div className="flex flex-wrap gap-2 bg-muted rounded-md p-2 py-4 mb-4">
                        <input className="w-32 select-auto sm:text-sm text-sm rounded-md bg-[hsl(var(--input-bg))] p-1 focus-visible:outline-none inline-flex" maxLength={32} placeholder="Add an interest..." type="text" />
                    </div>
                    <div className="flex flex-col gap-2.5 pt-2.5 pr-2 bg-card py-3 rounded-md px-2">
                        <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 inline-flex items-center gap-1 space-y-1" htmlFor="necessary">
                            Max Wait Duration
                            <span className="max-lg:hidden" data-state="closed">
                                <svg xmlns="http://www.w3.org/2000/svg" width="16.5" height="16.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-circle-question-mark cursor-pointer focus:outline-primary max-lg:hidden" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path><path d="M12 17h.01"></path></svg>
                            </span>
                        </label>
                        <div role="radiogroup" aria-required="false" dir="ltr" className="flex flex-row gap-1.5 sm:gap-3" tabIndex={0} style={{ outline: 'none' }}>
                            <div className="flex-shrink-0 flex-wrap">
                                <button
                                    type="button"
                                    role="radio"
                                    aria-checked={selectedDuration === '5s'}
                                    data-state={selectedDuration === '5s' ? "checked" : "unchecked"}
                                    value="5s"
                                    className="aspect-square h-4 w-4 rounded-full border border-primary text-primary ring-offset-background focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 peer sr-only"
                                    id="5s"
                                    tabIndex={-1}
                                    data-radix-collection-item=""
                                    onClick={() => setSelectedDuration('5s')}
                                >
                                    <span data-state={selectedDuration === '5s' ? "checked" : "unchecked"} className="flex items-center justify-center">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-circle h-2.5 w-2.5 fill-current text-current" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle></svg>
                                    </span>
                                </button>
                                <label
                                    className="peer-disabled:cursor-not-allowed peer-disabled:opacity-70 inline-flex disabled:select-none items-center justify-center text-sm font-medium ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-9 rounded-md px-3 cursor-pointer peer-data-[state=checked]:text-primary-foreground peer-data-[state=checked]:bg-primary [&:has([data-state=checked])]:bg-primary [&:has([data-state=checked])]:text-primary-foreground"
                                    htmlFor="5s"
                                    onClick={() => setSelectedDuration('5s')}
                                >
                                    5 sec
                                </label>
                            </div>
                            <div className="flex-shrink-0 flex-wrap">
                                <button
                                    type="button"
                                    role="radio"
                                    aria-checked={selectedDuration === '10s'}
                                    data-state={selectedDuration === '10s' ? "checked" : "unchecked"}
                                    value="10s"
                                    className="aspect-square h-4 w-4 rounded-full border border-primary text-primary ring-offset-background focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 peer sr-only"
                                    id="10s"
                                    tabIndex={-1}
                                    data-radix-collection-item=""
                                    onClick={() => setSelectedDuration('10s')}
                                >
                                    <span data-state={selectedDuration === '10s' ? "checked" : "unchecked"} className="flex items-center justify-center">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-circle h-2.5 w-2.5 fill-current text-current" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle></svg>
                                    </span>
                                </button>
                                <label
                                    className="peer-disabled:cursor-not-allowed peer-disabled:opacity-70 inline-flex disabled:select-none items-center justify-center text-sm font-medium ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-9 rounded-md px-3 cursor-pointer peer-data-[state=checked]:text-primary-foreground peer-data-[state=checked]:bg-primary [&:has([data-state=checked])]:bg-primary [&:has([data-state=checked])]:text-primary-foreground"
                                    htmlFor="10s"
                                    onClick={() => setSelectedDuration('10s')}
                                >
                                    10 sec
                                </label>
                            </div>
                            <div className="flex-shrink-0 flex-wrap">
                                <button
                                    type="button"
                                    role="radio"
                                    aria-checked={selectedDuration === '30s'}
                                    data-state={selectedDuration === '30s' ? "checked" : "unchecked"}
                                    value="30s"
                                    className="aspect-square h-4 w-4 rounded-full border border-primary text-primary ring-offset-background focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 peer sr-only"
                                    id="30s"
                                    tabIndex={-1}
                                    data-radix-collection-item=""
                                    onClick={() => setSelectedDuration('30s')}
                                >
                                    <span data-state={selectedDuration === '30s' ? "checked" : "unchecked"} className="flex items-center justify-center">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-circle h-2.5 w-2.5 fill-current text-current" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle></svg>
                                    </span>
                                </button>
                                <label
                                    className="peer-disabled:cursor-not-allowed peer-disabled:opacity-70 inline-flex disabled:select-none items-center justify-center text-sm font-medium ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-9 rounded-md px-3 cursor-pointer peer-data-[state=checked]:text-primary-foreground peer-data-[state=checked]:bg-primary [&:has([data-state=checked])]:bg-primary [&:has([data-state=checked])]:text-primary-foreground"
                                    htmlFor="30s"
                                    onClick={() => setSelectedDuration('30s')}
                                >
                                    30 sec
                                </label>
                            </div>
                            <div>
                                <button
                                    type="button"
                                    role="radio"
                                    aria-checked={selectedDuration === '10m'}
                                    data-state={selectedDuration === '10m' ? "checked" : "unchecked"}
                                    value="10m"
                                    className="aspect-square h-4 w-4 rounded-full border border-primary text-primary ring-offset-background focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 peer sr-only"
                                    id="10m"
                                    tabIndex={-1}
                                    data-radix-collection-item=""
                                    onClick={() => setSelectedDuration('10m')}
                                >
                                    <span data-state={selectedDuration === '10m' ? "checked" : "unchecked"} className="flex items-center justify-center">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-circle h-2.5 w-2.5 fill-current text-current" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle></svg>
                                    </span>
                                </button>
                                <label
                                    className="peer-disabled:cursor-not-allowed peer-disabled:opacity-70 inline-flex disabled:select-none items-center justify-center text-sm font-medium ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-9 rounded-md px-3 cursor-pointer peer-data-[state=checked]:text-primary-foreground peer-data-[state=checked]:bg-primary [&:has([data-state=checked])]:bg-primary [&:has([data-state=checked])]:text-primary-foreground"
                                    htmlFor="10m"
                                    onClick={() => setSelectedDuration('10m')}
                                >
                                    Forever
                                </label>
                            </div>
                        </div>
                    </div>
                </div>
                <div className="flex flex-col-reverse max-md:gap-3 sm:flex-row sm:justify-end sm:space-x-2">
                    <button onClick={onClose} className="inline-flex disabled:select-none items-center justify-center rounded-md text-sm font-medium ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-secondary text-secondary-foreground hover:bg-secondary/80 h-10 px-4 py-2">
                        Done
                    </button>
                </div>
            </div>
        </div>
    );
};

// --- Settings Modal ---
export const SettingsModal: React.FC<SettingsModalProps> = ({ onClose, onOpenInterests, theme = 'light' }) => {
    const [activeTab, setActiveTab] = useState('Profile');
    const [username, setUsername] = useState('brand-new olive');
    const [isEditingUsername, setIsEditingUsername] = useState(false);
    const [tempUsername, setTempUsername] = useState(username);
    const [bannerType, setBannerType] = useState<'Simple' | 'Gradient'>('Simple');
    const [showColorPicker, setShowColorPicker] = useState(false);
    const [bannerColor, setBannerColor] = useState('#5B21B6');
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [openDropdown, setOpenDropdown] = useState<string | null>(null);

    // Preferences State
    const [convertEmoticons, setConvertEmoticons] = useState(true);
    const [blurImages, setBlurImages] = useState(true);
    const [notificationSound, setNotificationSound] = useState(true);
    const [pushNotifications, setPushNotifications] = useState(false);
    const [darkMode, setDarkMode] = useState(true);
    const [friendRequests, setFriendRequests] = useState(true);
    const [badgeVisibility, setBadgeVisibility] = useState('Everyone');
    const [interestsVisibility, setInterestsVisibility] = useState('Friends');

    const handleSaveUsername = () => {
        setUsername(tempUsername);
        setIsEditingUsername(false);
    };

    const renderSwitch = (checked: boolean, onChange: (val: boolean) => void) => (
        <button
            type="button"
            role="switch"
            aria-checked={checked}
            value="on"
            className="peer inline-flex h-[24px] w-[44px] shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50"
            style={{ backgroundColor: checked ? 'hsl(var(--primary))' : 'hsl(var(--input))' }}
            onClick={() => onChange(!checked)}
        >
            <span
                className="pointer-events-none block h-5 w-5 rounded-full bg-background shadow-lg ring-0 transition-transform"
                style={{ transform: checked ? 'translateX(20px)' : 'translateX(0px)' }}
            />
        </button>
    );

    const visibilityOptions = ['Everyone', 'Friends', 'Nobody'];

    const renderDropdown = (id: string, value: string, onChange: (val: string) => void, options: string[]) => (
        <div className="relative">
            <button
                className="flex h-9 items-center justify-between rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50 w-[140px]"
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

    return (
        <>
            <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" onClick={onClose} />
            <div className={`chitchat-dashboard-theme settings-modal-theme ${theme === 'dark' ? 'dark' : ''}`}>
                <div
                    role="dialog"
                    id="radix-_r_49_"
                    aria-describedby="radix-_r_4b_"
                    aria-labelledby="radix-_r_4a_"
                    data-state="open"
                    className="fixed inset-0 z-50 m-auto w-full max-h-[90vh] gap-4 border bg-background p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 sm:data-[state=closed]:zoom-out-95 sm:data-[state=open]:zoom-in-95 sm:max-w-lg sm:rounded-lg md:w-full select-text md:min-w-[620px] md:max-h-[450px] flex flex-col max-md:px-3.5 border-none sm:h-fit max-sm:mt-auto max-sm:rounded-t-lg max-sm:rounded-b-none"
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
                                        <div className="flex w-full gap-1 min-w-full justify-between items-center py-1 pb-2">
                                            <span className="relative flex shrink-0 overflow-hidden rounded-full w-16 h-16">
                                                <img className="aspect-square h-full w-full" alt={username} src={`https://api.dicebear.com/5.x/thumbs/png?seed=${username}&backgroundColor=554994,594545,495579,395144,3F3B6C,2B3A55,404258,344D67`} />
                                            </span>
                                            <div className="flex flex-row gap-1">
                                                <button className="inline-flex disabled:select-none items-center justify-center text-sm font-medium ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-secondary text-secondary-foreground hover:bg-secondary/80 h-9 rounded-md px-3">Change</button>
                                                <button className="inline-flex disabled:select-none items-center justify-center text-sm font-medium ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 underline-offset-4 hover:underline h-9 rounded-md px-3 text-brightness">Remove</button>
                                            </div>
                                            <input className="hidden" id="_r_av_mobile" type="file" />
                                        </div>
                                        <span className="text-xs text-card-foreground">Avatars are reviewed before displaying. Do not upload inappropriate avatars. Limit: 3 changes daily. Max 8MB.</span>

                                        <div data-orientation="horizontal" role="none" className="shrink-0 bg-border h-[1px] w-full my-2.5"></div>

                                        <span className="text-sm font-bold text-card-foreground">Banner</span>
                                        <span></span>
                                        <div className="flex flex-row gap-2 items-center">
                                            <div className="flex items-center flex-col gap-0.5">
                                                <button
                                                    onClick={() => {
                                                        setBannerType('Simple');
                                                        setShowColorPicker(true);
                                                    }}
                                                    className="disabled:select-none items-center justify-center text-sm font-medium ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 hover:bg-accent hover:text-accent-foreground h-12 w-14 rounded-md bg-muted relative flex flex-col p-0 m-0"
                                                    style={{ backgroundColor: bannerColor }}
                                                >
                                                    {bannerType === 'Simple' && (
                                                        <svg stroke="currentColor" fill="currentColor" strokeWidth="0" viewBox="0 0 20 20" aria-hidden="true" className="absolute right-0 top-0 mr-1 mt-1" color="white" height="1em" width="1em" xmlns="http://www.w3.org/2000/svg" style={{ color: 'white' }}><path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z"></path></svg>
                                                    )}
                                                </button>
                                                <span className="text-xs">Simple</span>
                                            </div>
                                            <div>
                                                <div className="flex items-center flex-col gap-0.5">
                                                    <button
                                                        onClick={() => setBannerType('Gradient')}
                                                        className="disabled:select-none items-center justify-center text-sm font-medium ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 hover:bg-accent hover:text-accent-foreground h-12 w-14 rounded-md bg-muted relative flex flex-col p-0 m-0"
                                                        style={{ backgroundImage: 'linear-gradient(45deg, rgb(213, 63, 140), rgb(79, 70, 229))' }}
                                                    >
                                                        {bannerType === 'Gradient' && (
                                                            <svg stroke="currentColor" fill="currentColor" strokeWidth="0" viewBox="0 0 20 20" aria-hidden="true" className="absolute right-0 top-0 mr-1 mt-1" color="white" height="1em" width="1em" xmlns="http://www.w3.org/2000/svg" style={{ color: 'white' }}><path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z"></path></svg>
                                                        )}
                                                    </button>
                                                    <span className="text-xs">Gradient</span>
                                                </div>
                                            </div>
                                        </div>

                                        <div data-orientation="horizontal" role="none" className="shrink-0 bg-border h-[1px] w-full my-2.5"></div>

                                        <div className="relative flex w-full basis-0 flex-col gap-1 min-w-full">
                                            <form className="space-y-6" onSubmit={(e) => { e.preventDefault(); handleSaveUsername(); }}>
                                                <input hidden autoComplete="username" type="text" />
                                                <div className="space-y-2">
                                                    <label className="peer-disabled:cursor-not-allowed peer-disabled:opacity-70 text-xs font-bold text-card-foreground" htmlFor="_r_b1_-form-item-mobile">USERNAME</label>
                                                    <div className="flex flex-col !mt-1" id="_r_b1_-form-item-mobile">
                                                        {isEditingUsername ? (
                                                            <div className="w-full max-w-sm items-center space-x-2 flex">
                                                                <input
                                                                    className="flex h-10 w-full rounded-md border border-input bg-field px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                                                    placeholder="username"
                                                                    value={tempUsername}
                                                                    name="username"
                                                                    onChange={(e) => setTempUsername(e.target.value)}
                                                                />
                                                                <button type="submit" className="inline-flex disabled:select-none items-center justify-center rounded-md text-sm font-medium ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-10 w-10">
                                                                    <CheckIcon className="h-4 w-4" />
                                                                </button>
                                                                <button type="button" onClick={() => setIsEditingUsername(false)} className="inline-flex disabled:select-none items-center justify-center rounded-md text-sm font-medium ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-destructive text-destructive-foreground hover:bg-destructive/90 h-10 w-10">
                                                                    <XIcon className="h-4 w-4" />
                                                                </button>
                                                            </div>
                                                        ) : (
                                                            <div className="w-full flex flex-row items-center justify-between">
                                                                <span className="text-brightness/65">{username}</span>
                                                                <button onClick={() => setIsEditingUsername(true)} className="inline-flex disabled:select-none items-center justify-center text-sm font-medium ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-secondary text-secondary-foreground hover:bg-secondary/80 h-9 rounded-md px-3" type="button">Edit</button>
                                                            </div>
                                                        )}
                                                    </div>
                                                    <p id="_r_b1_-form-item-description-mobile" className="text-muted-foreground text-xs">You have <b>3</b> name changes left for today.</p>
                                                </div>
                                            </form>
                                        </div>

                                        <div data-orientation="horizontal" role="none" className="shrink-0 bg-border h-[1px] w-full my-2.5"></div>

                                        <label className="text-sm font-bold text-card-foreground"> INTERESTS (ON)</label>
                                        <div className="relative flex w-full basis-0 flex-row items-center justify-between gap-1 min-w-full">
                                            <label className="text-xs text-muted-foreground">You have 0 interests</label>
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
                                                className="inline-flex items-center justify-center text-sm font-medium border border-destructive text-destructive hover:bg-destructive/10 h-9 rounded-md px-3 gap-2"
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
                                            {renderSwitch(darkMode, setDarkMode)}
                                        </div>
                                    </div>
                                </div>
                            )}
                            {activeTab === 'Blocked' && (
                                <div data-state="active" data-orientation="horizontal" role="tabpanel" className="mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 w-full">
                                    <div className="flex items-center justify-center h-full text-muted-foreground">
                                        <p className="text-sm">You haven't blocked anyone yet.</p>
                                    </div>
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
                                <div style={{ minWidth: '100%', display: 'table' }}>
                                    {activeTab === 'Profile' && (
                                        <div className="flex flex-col w-full animate-in fade-in slide-in-from-right-4 duration-200">
                                            <label className="text-sm font-bold text-card-foreground" htmlFor="_r_av_"> Avatar </label>
                                            <div className="flex w-full gap-1 min-w-full justify-between items-center py-1 pb-2">
                                                <span className="relative flex shrink-0 overflow-hidden rounded-full w-16 h-16">
                                                    <img className="aspect-square h-full w-full" alt={username} src={`https://api.dicebear.com/5.x/thumbs/png?seed=${username}&backgroundColor=554994,594545,495579,395144,3F3B6C,2B3A55,404258,344D67`} />
                                                </span>
                                                <div className="flex flex-row gap-1">
                                                    <button className="inline-flex disabled:select-none items-center justify-center text-sm font-medium ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-secondary text-secondary-foreground hover:bg-secondary/80 h-9 rounded-md px-3">Change</button>
                                                    <button className="inline-flex disabled:select-none items-center justify-center text-sm font-medium ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 underline-offset-4 hover:underline h-9 rounded-md px-3 text-brightness">Remove</button>
                                                </div>
                                                <input className="hidden" id="_r_av_" type="file" />
                                            </div>
                                            <span className="text-xs text-card-foreground">Avatars are reviewed before displaying. Do not upload inappropriate avatars. Limit: 3 changes daily. Max 8MB.</span>

                                            <div data-orientation="horizontal" role="none" className="shrink-0 bg-border h-[1px] w-full my-2.5"></div>

                                            <span className="text-sm font-bold text-card-foreground">Banner</span>
                                            <span></span>
                                            <div className="flex flex-row gap-2 items-center">
                                                <div className="flex items-center flex-col gap-0.5">
                                                    <button
                                                        onClick={() => {
                                                            setBannerType('Simple');
                                                            setShowColorPicker(true);
                                                        }}
                                                        className="disabled:select-none items-center justify-center text-sm font-medium ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 hover:bg-accent hover:text-accent-foreground h-12 w-14 rounded-md bg-muted relative flex flex-col p-0 m-0"
                                                        style={{ backgroundColor: bannerColor }}
                                                    >
                                                        {bannerType === 'Simple' && (
                                                            <svg stroke="currentColor" fill="currentColor" strokeWidth="0" viewBox="0 0 20 20" aria-hidden="true" className="absolute right-0 top-0 mr-1 mt-1" color="white" height="1em" width="1em" xmlns="http://www.w3.org/2000/svg" style={{ color: 'white' }}><path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z"></path></svg>
                                                        )}
                                                    </button>
                                                    <span className="text-xs">Simple</span>
                                                </div>
                                                <div>
                                                    <div className="flex items-center flex-col gap-0.5">
                                                        <button
                                                            onClick={() => setBannerType('Gradient')}
                                                            className="disabled:select-none items-center justify-center text-sm font-medium ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 hover:bg-accent hover:text-accent-foreground h-12 w-14 rounded-md bg-muted relative flex flex-col p-0 m-0"
                                                            style={{ backgroundImage: 'linear-gradient(45deg, rgb(213, 63, 140), rgb(79, 70, 229))' }}
                                                        >
                                                            {bannerType === 'Gradient' && (
                                                                <svg stroke="currentColor" fill="currentColor" strokeWidth="0" viewBox="0 0 20 20" aria-hidden="true" className="absolute right-0 top-0 mr-1 mt-1" color="white" height="1em" width="1em" xmlns="http://www.w3.org/2000/svg" style={{ color: 'white' }}><path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z"></path></svg>
                                                            )}
                                                        </button>
                                                        <span className="text-xs">Gradient</span>
                                                    </div>
                                                </div>
                                            </div>

                                            <div data-orientation="horizontal" role="none" className="shrink-0 bg-border h-[1px] w-full my-2.5"></div>

                                            <div className="relative flex w-full basis-0 flex-col gap-1 min-w-full">
                                                <form className="space-y-6" onSubmit={(e) => { e.preventDefault(); handleSaveUsername(); }}>
                                                    <input hidden autoComplete="username" type="text" />
                                                    <div className="space-y-2">
                                                        <label className="peer-disabled:cursor-not-allowed peer-disabled:opacity-70 text-xs font-bold text-card-foreground" htmlFor="_r_b1_-form-item">USERNAME</label>
                                                        <div className="flex flex-col !mt-1" id="_r_b1_-form-item">
                                                            {isEditingUsername ? (
                                                                <div className="w-full max-w-sm items-center space-x-2 flex">
                                                                    <input
                                                                        className="flex h-10 w-full rounded-md border border-input bg-field px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                                                        placeholder="username"
                                                                        value={tempUsername}
                                                                        name="username"
                                                                        onChange={(e) => setTempUsername(e.target.value)}
                                                                    />
                                                                    <button type="submit" className="inline-flex disabled:select-none items-center justify-center rounded-md text-sm font-medium ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-10 w-10">
                                                                        <CheckIcon className="h-4 w-4" />
                                                                    </button>
                                                                    <button type="button" onClick={() => setIsEditingUsername(false)} className="inline-flex disabled:select-none items-center justify-center rounded-md text-sm font-medium ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-destructive text-destructive-foreground hover:bg-destructive/90 h-10 w-10">
                                                                        <XIcon className="h-4 w-4" />
                                                                    </button>
                                                                </div>
                                                            ) : (
                                                                <div className="w-full flex flex-row items-center justify-between">
                                                                    <span className="text-brightness/65">{username}</span>
                                                                    <button onClick={() => setIsEditingUsername(true)} className="inline-flex disabled:select-none items-center justify-center text-sm font-medium ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-secondary text-secondary-foreground hover:bg-secondary/80 h-9 rounded-md px-3" type="button">Edit</button>
                                                                </div>
                                                            )}
                                                        </div>
                                                        <p id="_r_b1_-form-item-description" className="text-muted-foreground text-xs">You have <b>3</b> name changes left for today.</p>
                                                    </div>
                                                </form>
                                            </div>

                                            <div data-orientation="horizontal" role="none" className="shrink-0 bg-border h-[1px] w-full my-2.5"></div>

                                            <label className="text-sm font-bold text-card-foreground"> INTERESTS (ON)</label>
                                            <div className="relative flex w-full basis-0 flex-row items-center justify-between gap-1 min-w-full">
                                                <label className="text-xs text-muted-foreground">You have 0 interests</label>
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
                                                    className="inline-flex items-center justify-center text-sm font-medium border border-destructive text-destructive hover:bg-destructive/10 h-9 rounded-md px-3 gap-2"
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
                                                {renderSwitch(darkMode, setDarkMode)}
                                            </div>
                                        </div>
                                    )}

                                    {activeTab === 'Blocked' && (
                                        <div className="flex items-center justify-center h-full text-muted-foreground">
                                            <p className="text-sm">You haven't blocked anyone yet.</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>

                    <button
                        type="button"
                        className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none"
                        onClick={onClose}
                    >
                        <XIcon className="h-4 w-4" />
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
                        setShowDeleteModal(false);
                        onClose();
                    }}
                />
            </div>
        </>
    );
};