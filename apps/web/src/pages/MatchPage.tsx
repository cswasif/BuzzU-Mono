import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSessionStore } from '../stores/sessionStore';
import { useMatching, MatchResult } from '../hooks/useMatching';
import { BuzzULogoIcon } from '../../components/SocialLanding/Icons';
import { GenderDialog } from '../components/GenderDialog';

const MATCHMAKER_URL = process.env.MATCHMAKER_URL || 'wss://buzzu-matchmaker.md-wasif-faisal.workers.dev';

const SUGGESTED_INTERESTS = [
    'Gaming', 'Music', 'Movies', 'Anime', 'Coding', 'Sports',
    'Photography', 'Art', 'Travel', 'Food', 'Fashion', 'Books',
    'Tech', 'Science', 'Memes', 'K-Pop', 'Fitness', 'BracU',
];

export const MatchPage: React.FC = () => {
    const navigate = useNavigate();
    const {
        peerId,
        interests,
        gender,
        genderFilter,
        chatMode,
        setInterests,
        setGender,
        setGenderFilter,
        setChatMode,
        joinRoom,
        initSession,
    } = useSessionStore();

    // Show gender dialog if gender is unset
    const [showGenderDialog, setShowGenderDialog] = useState(gender === 'U');

    const [interestInput, setInterestInput] = useState('');

    useEffect(() => { initSession(); }, [initSession]);

    const handleGenderSelect = (selectedGender: string) => {
        setGender(selectedGender);
        setShowGenderDialog(false);
    };

    const handleMatch = useCallback((result: MatchResult) => {
        joinRoom(result.roomId, result.partnerId);
        navigate(`/chat/${result.roomId}`);
    }, [joinRoom, navigate]);

    const { isSearching, waitPosition, findMatch, cancelSearch } = useMatching({
        matchmakerUrl: MATCHMAKER_URL,
        peerId,
        onMatch: handleMatch,
    });

    const addInterest = (tag: string) => {
        if (tag && !interests.includes(tag) && interests.length < 10) {
            setInterests([...interests, tag]);
        }
        setInterestInput('');
    };

    const removeInterest = (tag: string) => {
        setInterests(interests.filter(i => i !== tag));
    };

    const handleStartChat = () => {
        findMatch(interests, gender, genderFilter);
    };

    return (
        <div className="match-page">
            {showGenderDialog && <GenderDialog onSelect={handleGenderSelect} />}
            <div className="match-container">
                <div className="match-header">
                    <div className="flex items-center justify-center gap-2 mb-2">
                        <BuzzULogoIcon
                            className="w-10 h-10"
                            style={{ color: '#f5a623', filter: 'drop-shadow(0 0 8px rgba(245, 166, 35, 0.3))' }}
                        />
                        <h1 style={{ margin: 0 }}>BuzzU</h1>
                    </div>
                    <p className="match-subtitle">Talk to strangers from BracU — anonymously</p>
                </div>

                {!isSearching ? (
                    <div className="match-setup">
                        {/* Chat Mode Toggle */}
                        <div className="mode-toggle">
                            <button
                                className={`mode-btn ${chatMode === 'video' ? 'active' : ''}`}
                                onClick={() => setChatMode('video')}
                            >
                                📹 Video
                            </button>
                            <button
                                className={`mode-btn ${chatMode === 'text' ? 'active' : ''}`}
                                onClick={() => setChatMode('text')}
                            >
                                💬 Text
                            </button>
                        </div>

                        {/* Gender Selection */}
                        <div className="setting-group">
                            <label>I am</label>
                            <div className="gender-buttons">
                                {[
                                    { value: 'M', label: '♂ Male' },
                                    { value: 'F', label: '♀ Female' },
                                    { value: 'U', label: '⚡ Other' },
                                ].map(opt => (
                                    <button
                                        key={opt.value}
                                        className={`gender-btn ${gender === opt.value ? 'active' : ''}`}
                                        onClick={() => setGender(opt.value)}
                                    >
                                        {opt.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Gender Filter */}
                        <div className="setting-group">
                            <label>Talk to</label>
                            <div className="gender-buttons">
                                {[
                                    { value: 'both', label: '🌐 Everyone' },
                                    { value: 'male', label: '♂ Male' },
                                    { value: 'female', label: '♀ Female' },
                                ].map(opt => (
                                    <button
                                        key={opt.value}
                                        className={`gender-btn ${genderFilter === opt.value ? 'active' : ''}`}
                                        onClick={() => setGenderFilter(opt.value)}
                                    >
                                        {opt.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Interests */}
                        <div className="setting-group">
                            <label>Interests</label>
                            <div className="interest-input-row">
                                <input
                                    type="text"
                                    value={interestInput}
                                    onChange={e => setInterestInput(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && addInterest(interestInput.trim())}
                                    placeholder="Add an interest..."
                                    maxLength={30}
                                />
                                <button onClick={() => addInterest(interestInput.trim())} disabled={!interestInput.trim()}>
                                    Add
                                </button>
                            </div>

                            {interests.length > 0 && (
                                <div className="interest-tags">
                                    {interests.map(tag => (
                                        <span key={tag} className="interest-tag">
                                            {tag}
                                            <button onClick={() => removeInterest(tag)}>×</button>
                                        </span>
                                    ))}
                                </div>
                            )}

                            <div className="suggested-interests">
                                {SUGGESTED_INTERESTS.filter(s => !interests.includes(s)).slice(0, 8).map(tag => (
                                    <button key={tag} className="suggestion-btn" onClick={() => addInterest(tag)}>
                                        + {tag}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Start Button */}
                        <button className="start-chat-btn" onClick={handleStartChat}>
                            ⚡ Talk to Stranger
                        </button>

                        <p className="privacy-note">
                            🔒 End-to-end encrypted • No chat history stored • Fully anonymous
                        </p>
                    </div>
                ) : (
                    <div className="searching-state">
                        <div className="searching-animation">
                            <div className="pulse-ring" />
                            <div className="pulse-ring delay-1" />
                            <div className="pulse-ring delay-2" />
                            <span className="searching-icon">
                                <BuzzULogoIcon className="w-12 h-12 text-[#f5a623]" />
                            </span>
                        </div>
                        <h2>Finding your match...</h2>
                        {waitPosition && <p className="wait-position">Position in queue: {waitPosition}</p>}
                        <p className="searching-hint">
                            Looking for someone with similar interests
                        </p>
                        <button className="cancel-btn" onClick={cancelSearch}>
                            Cancel
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default MatchPage;
