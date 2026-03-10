import React from 'react';
import { useSessionStore } from '../../stores/sessionStore';
import Banner from './Banner';

interface ProfilePopoverProps {
    onClose: () => void;
    onEditProfile: () => void;
}

const ProfilePopover: React.FC<ProfilePopoverProps> = ({ onClose, onEditProfile }) => {
    const { displayName, peerId, avatarSeed, avatarUrl, interests, joinedAt } = useSessionStore();
    const dicebearUrl = `https://api.dicebear.com/5.x/thumbs/png?shapeColor=FD8A8A,F1F7B5,82AAE3,9EA1D4,A084CA,EBC7E8,A7D2CB,F07DEA,EC7272,FFDBA4,59CE8F,ABC270,FF74B1,31C6D4&backgroundColor=554994,594545,495579,395144,3F3B6C,2B3A55,404258,344D67&translateY=5&seed=${avatarSeed}&scale=110&eyesColor=000000,ffffff&faceOffsetY=0&size=80`;
    const avatarSrc = avatarUrl || dicebearUrl;
    const formattedJoinDate = (() => {
        const parsed = new Date(joinedAt);
        if (Number.isNaN(parsed.getTime())) return 'Unknown';
        return parsed.toLocaleDateString('en-GB');
    })();
    return (
        <div
            className="fixed z-50 bg-popover rounded-lg bottom-14 left-2 w-64 border border-border shadow-lg overflow-hidden"
            onClick={(e) => e.stopPropagation()}
        >
            <div className="bg-popover relative pb-1 max-h-[75vh] overflow-y-auto">
                <div className="relative">
                    {/* Banner Background */}
                    <div className="absolute top-0 left-0 right-0 h-32 rounded-t-lg overflow-hidden z-0">
                        <Banner />
                    </div>

                    {/* Spacer for Banner */}
                    <div className="h-16"></div>

                    {/* Avatar Container */}
                    <div className="relative z-10 px-5 flex flex-col items-center">
                        <span className="flex shrink-0 overflow-hidden relative h-24 w-24 rounded-[2rem] ring-4 ring-popover bg-popover rounded-3xl shadow-sm">
                            <img className="aspect-square h-full w-full object-cover" alt={displayName} src={avatarSrc} />
                        </span>

                        <div className="bg-action/90 backdrop-blur-sm rounded-xl mt-3 py-3 w-full flex items-center justify-center flex-col px-4 shadow-sm border border-border/50">
                            <span className="flex items-center gap-1 font-semibold w-full justify-center text-brightness text-lg">{displayName}</span>
                            <div className="flex flex-col items-center justify-center w-full">
                                <code className="text-muted-foreground rounded-md text-xs mt-1 mb-3">ID: {peerId.split('_').pop()}</code>

                                <div className="w-full flex items-center justify-center rounded-md">
                                    <button
                                        onClick={onEditProfile}
                                        className="inline-flex disabled:select-none items-center justify-center text-sm font-medium ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-secondary text-secondary-foreground hover:bg-secondary/80 h-9 rounded-md px-3 w-full transition-colors"
                                    >
                                        Edit Profile
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="pt-2">
                        <div className="bg-action rounded-md py-2.5 my-2.5 mx-5 flex items-center justify-center flex-col px-2">
                            <div className="mb-1 text-xs text-brightness/90 font-bold uppercase">BuzzU JOIN DATE</div>
                            <div className="text-xs">{formattedJoinDate}</div>
                            <div className="text-xs text-brightness/90 mt-3 mb-1 font-bold uppercase">Interests</div>
                            <div className="mt-1 w-full max-w-xs rounded-md bg-panel px-4 py-2 text-center cursor-default max-h-64 overflow-y-auto scrollbar-thin scrollbar-t !px-6">
                                <div id="parent" className="relative">
                                    <div className="">
                                        {interests.length === 0 ? (
                                            <div className="inline-flex items-center justify-center px-2.5 py-1 text-sm font-medium rounded-full my-2 mr-1 bg-placeholder" color="secondary">No interests</div>
                                        ) : (
                                            interests.map((interest) => (
                                                <div key={interest} className="inline-flex items-center justify-center px-2.5 py-1 text-sm font-medium rounded-full my-2 mr-1 bg-placeholder" color="secondary">{interest}</div>
                                            ))
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            <button
                type="button"
                className="absolute right-2 top-2 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none bg-black/20 p-1 text-white"
                onClick={onClose}
            >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-x" aria-hidden="true"><path d="M18 6 6 18"></path><path d="m6 6 12 12"></path></svg>
                <span className="sr-only">Close</span>
            </button>
        </div>
    );
};

export default ProfilePopover;
