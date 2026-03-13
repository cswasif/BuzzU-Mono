import React, { useEffect } from 'react';
import { useOutletContext, useNavigate } from 'react-router-dom';
import VideoMatchPage from '../video-match/VideoMatchPage';

/**
 * VideoPage — Dedicated page for video chat at /chat/video.
 * Renders inside DashboardLayout's <Outlet />.
 *
 * Hides the dashboard chrome (sidebar/header) for full-screen video.
 */

interface DashboardOutletContext {
    setHideChrome: (hide: boolean) => void;
    setShowInterestsModal: (show: boolean) => void;
}

export const VideoPage: React.FC = () => {
    const { setHideChrome } = useOutletContext<DashboardOutletContext>();
    const navigate = useNavigate();

    // Hide sidebar/header when in video mode
    useEffect(() => {
        setHideChrome(true);
        return () => setHideChrome(false);
    }, [setHideChrome]);

    return (
        <VideoMatchPage onBack={() => navigate('/chat/new')} />
    );
};

export default VideoPage;
