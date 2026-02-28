import React, { useState } from 'react';
import { BuzzULogoIcon } from '../../components/SocialLanding/Icons';

interface GenderDialogProps {
    onSelect: (gender: string) => void;
}

export const GenderDialog: React.FC<GenderDialogProps> = ({ onSelect }) => {
    const [selected, setSelected] = useState<string | null>(null);
    const [isExiting, setIsExiting] = useState(false);

    const handleConfirm = () => {
        if (!selected) return;
        setIsExiting(true);
        // Animate out, then commit
        setTimeout(() => onSelect(selected), 350);
    };

    return (
        <div className={`gender-dialog-overlay ${isExiting ? 'exiting' : ''}`}>
            <div className={`gender-dialog-card ${isExiting ? 'exiting' : ''}`}>
                {/* Header */}
                <div className="gender-dialog-header">
                    <BuzzULogoIcon
                        className="gender-dialog-logo text-primary drop-shadow-md"
                    />
                    <h2 className="gender-dialog-title">Welcome to BuzzU</h2>
                    <p className="gender-dialog-subtitle">
                        Select your gender to start matching with strangers
                    </p>
                </div>

                {/* Gender Options */}
                <div className="gender-dialog-options">
                    <button
                        className={`gender-option ${selected === 'M' ? 'selected' : ''}`}
                        onClick={() => setSelected('M')}
                    >
                        <span className="gender-option-icon">♂</span>
                        <span className="gender-option-label">Male</span>
                    </button>

                    <button
                        className={`gender-option ${selected === 'F' ? 'selected' : ''}`}
                        onClick={() => setSelected('F')}
                    >
                        <span className="gender-option-icon">♀</span>
                        <span className="gender-option-label">Female</span>
                    </button>
                </div>

                {/* Privacy Notice */}
                <p className="gender-dialog-privacy">
                    🔒 Stored locally only · Never sent to any server
                </p>

                {/* Confirm Button */}
                <button
                    className={`gender-dialog-confirm ${selected ? 'enabled' : ''}`}
                    onClick={handleConfirm}
                    disabled={!selected}
                >
                    Continue
                </button>
            </div>
        </div>
    );
};

export default GenderDialog;
