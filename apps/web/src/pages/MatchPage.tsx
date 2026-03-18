import React, { useState, useEffect, useCallback } from 'react';
import '../chat-styles.css';
import { useNavigate } from 'react-router-dom';
import { useSessionStore } from '../stores/sessionStore';
import { useMatching } from '../hooks/useMatching';
import { BuzzULogoIcon } from '../../components/SocialLanding/Icons';
import { GenderDialog } from '../components/GenderDialog';

const MATCHMAKER_URL = process.env.MATCHMAKER_URL || 'wss://buzzu-matchmaker.cswasif.workers.dev';

const SUGGESTED_INTERESTS = [
    'Gaming', 'Music', 'Movies', 'Anime', 'Coding', 'Sports',
    'Photography', 'Art', 'Travel', 'Food', 'Fashion', 'Books',
    'Tech', 'Science', 'Memes', 'K-Pop', 'Fitness', 'BracU',
];
const MAX_UI_INTERESTS = 20;

const normalizeInterestKey = (value: string) => value.trim().toLowerCase().replace(/\s+/g, ' ');

export const MatchPage: React.FC = () => {
    const navigate = useNavigate();
    const { peerId,
        interests,
        matchWithInterests,
        interestTimeoutSec,
        gender,
        genderFilter,
        chatMode,
        setInterests,
        setMatchWithInterests,
        setInterestTimeoutSec,
        setGender,
        setGenderFilter,
        setChatMode,
        joinRoom,
        initSession,
        avatarSeed
    } = useSessionStore();

    // Show gender dialog if gender is unset
    const [showGenderDialog, setShowGenderDialog] = useState(gender === 'U');

    const [interestInput, setInterestInput] = useState('');

    useEffect(() => { initSession(); }, [initSession]);

    const handleGenderSelect = (selectedGender: string) => {
        setGender(selectedGender);
        setShowGenderDialog(false);
    };

    const { isMatching, waitPosition, matchData, startMatching, stopMatching } = useMatching();

    useEffect(() => {
        if (matchData) {
            navigate(`/chat/${matchData.room_id}`);
        }
    }, [matchData, navigate]);

    const addInterest = (tag: string) => {
        const trimmed = tag.trim().replace(/\s+/g, ' ');
        const normalized = normalizeInterestKey(trimmed);
        const exists = interests.some((interest) => normalizeInterestKey(interest) === normalized);
        if (trimmed && !exists && interests.length < MAX_UI_INTERESTS) {
            setInterests([...interests, trimmed]);
        }
        setInterestInput('');
    };

    const removeInterest = (tag: string) => {
        setInterests(interests.filter(i => i !== tag));
    };

    const handleStartChat = () => {
        startMatching();
    };

    return (
        <div className="match-page">
            {showGenderDialog && <GenderDialog onSelect={handleGenderSelect} />}
            <div className="match-container">
                <div className="match-header">
                    <div className="flex items-center justify-center gap-2 mb-2">
                        <BuzzULogoIcon
                            className="w-10 h-10 text-primary drop-shadow-md"
                        />
                        <h1 style={{ margin: 0 }}>BuzzU</h1>
                    </div>
                    <p className="match-subtitle">Talk to strangers from BracU — anonymously</p>
                </div>

                {!isMatching ? (
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
                            <div className="gender-buttons" style={{ marginBottom: '8px' }}>
                                <button
                                    className={`gender-btn ${matchWithInterests ? 'active' : ''}`}
                                    onClick={() => setMatchWithInterests(true)}
                                >
                                    🎯 Match by interests
                                </button>
                                <button
                                    className={`gender-btn ${!matchWithInterests ? 'active' : ''}`}
                                    onClick={() => setMatchWithInterests(false)}
                                >
                                    🌐 Ignore interests
                                </button>
                            </div>
                            <div className="interest-input-row">
                                <input
                                    type="text"
                                    value={interestInput}
                                    onChange={e => setInterestInput(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && addInterest(interestInput.trim())}
                                    placeholder="Add an interest..."
                                    maxLength={30}
                                />
                                <button onClick={() => addInterest(interestInput.trim())} disabled={!interestInput.trim() || interests.length >= MAX_UI_INTERESTS}>
                                    Add
                                </button>
                            </div>
                            <div className="gender-buttons" style={{ marginTop: '8px' }}>
                                {[5, 10, 30, 600].map((seconds) => (
                                    <button
                                        key={seconds}
                                        className={`gender-btn ${interestTimeoutSec === seconds ? 'active' : ''}`}
                                        onClick={() => setInterestTimeoutSec(seconds)}
                                    >
                                        {seconds === 600 ? '10m' : `${seconds}s`}
                                    </button>
                                ))}
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
                                {SUGGESTED_INTERESTS.filter(s => !interests.some((interest) => normalizeInterestKey(interest) === normalizeInterestKey(s))).slice(0, 8).map(tag => (
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
                                <BuzzULogoIcon className="w-12 h-12 text-primary drop-shadow-md" />
                            </span>
                        </div>
                        <h2>Finding your match...</h2>
                        {waitPosition && <p className="wait-position">Position in queue: {waitPosition}</p>}
                        <p className="searching-hint">
                            {matchWithInterests ? 'Looking for someone with similar interests' : 'Looking for the fastest available match'}
                        </p>
                        <button className="cancel-btn" onClick={() => stopMatching()}>
                            Cancel
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default MatchPage;
