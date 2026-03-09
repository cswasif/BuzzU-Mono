import { useState, useCallback, useRef, useEffect } from 'react';
import { getBrowserInfo, getUserMediaWithFallback, shouldUseLowQualityMode } from '../utils/browserCompatibility';

export interface CameraDevice {
  deviceId: string;
  label: string;
  kind: 'videoinput' | 'audioinput' | 'audiooutput';
}

export interface CameraConstraints {
  video?: boolean | MediaTrackConstraints;
  audio?: boolean | MediaTrackConstraints;
}

export interface UseCameraResult {
  localStream: MediaStream | null;
  isCameraOn: boolean;
  isMuted: boolean;
  isMirrored: boolean;
  audioLevel: number;
  isCameraLoading: boolean;
  cameraError: string | null;
  availableCameras: CameraDevice[];
  availableMicrophones: CameraDevice[];
  currentCameraId: string | null;
  currentMicrophoneId: string | null;
  startCamera: (constraints?: CameraConstraints) => Promise<MediaStream>;
  stopCamera: () => void;
  toggleCamera: () => void;
  toggleMute: () => void;
  toggleMirror: () => void;
  switchCamera: (deviceId: string) => Promise<void>;
  switchMicrophone: (deviceId: string) => Promise<void>;
  refreshDevices: () => Promise<void>;
  getOptimalConstraints: (isMobile?: boolean) => CameraConstraints;
}

export function useCamera(): UseCameraResult {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [isCameraOn, setIsCameraOn] = useState(true);
  const [isMuted, setIsMuted] = useState(false);
  const [isMirrored, setIsMirrored] = useState(true);
  const [audioLevel, setAudioLevel] = useState(0);
  const [isCameraLoading, setIsCameraLoading] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [availableCameras, setAvailableCameras] = useState<CameraDevice[]>([]);
  const [availableMicrophones, setAvailableMicrophones] = useState<CameraDevice[]>([]);
  const [currentCameraId, setCurrentCameraId] = useState<string | null>(null);
  const [currentMicrophoneId, setCurrentMicrophoneId] = useState<string | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyzerRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const retryCountRef = useRef<number>(0);
  const MAX_RETRIES = 3;

  const stopAudioAnalysis = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    setAudioLevel(0);
  }, []);

  const startAudioAnalysis = useCallback((stream: MediaStream) => {
    stopAudioAnalysis();
    if (stream.getAudioTracks().length === 0) return;

    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const source = audioContext.createMediaStreamSource(stream);
      const analyzer = audioContext.createAnalyser();
      analyzer.fftSize = 256;
      source.connect(analyzer);

      audioContextRef.current = audioContext;
      analyzerRef.current = analyzer;

      const bufferLength = analyzer.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      const updateLevel = () => {
        if (!analyzerRef.current) return;
        analyzerRef.current.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
          sum += dataArray[i];
        }
        const average = sum / bufferLength;
        setAudioLevel(average / 128);
        animationFrameRef.current = requestAnimationFrame(updateLevel);
      };
      updateLevel();
    } catch (err) {
      console.error('[useCamera] Failed to start audio analysis:', err);
    }
  }, [stopAudioAnalysis]);

  const detectMobile = useCallback((): boolean => {
    const browser = getBrowserInfo();
    return browser.isMobile;
  }, []);

  const getOptimalConstraints = useCallback((isMobile?: boolean): CameraConstraints => {
    const browser = getBrowserInfo();
    const mobile = isMobile ?? detectMobile();
    const lowQualityMode = shouldUseLowQualityMode();

    const baseAudioConstraints = {
      echoCancellation: { ideal: true },
      noiseSuppression: { ideal: true },
      autoGainControl: { ideal: true },
      channelCount: { ideal: 1, max: 2 },
      sampleRate: { ideal: 48000, max: 48000 },
    };

    const baseVideoConstraints = {
      facingMode: { ideal: 'user' },
      aspectRatio: { ideal: 16 / 9, min: 1.33, max: 1.78 },
    };

    if (mobile || lowQualityMode) {
      return {
        video: {
          ...baseVideoConstraints,
          width: { min: 320, ideal: 480, max: 640 },
          height: { min: 240, ideal: 360, max: 480 },
          frameRate: { min: 15, ideal: 24, max: 30 },
          deviceId: currentCameraId ? { ideal: currentCameraId } : undefined,
        },
        audio: baseAudioConstraints,
      };
    }

    if (browser.isSafari && browser.isMobile) {
      return {
        video: {
          ...baseVideoConstraints,
          width: { min: 480, ideal: 640, max: 720 },
          height: { min: 360, ideal: 480, max: 540 },
          frameRate: { min: 20, ideal: 30, max: 30 },
          deviceId: currentCameraId ? { ideal: currentCameraId } : undefined,
        },
        audio: baseAudioConstraints,
      };
    }

    return {
      video: {
        ...baseVideoConstraints,
        width: { min: 640, ideal: 1280, max: 1920 },
        height: { min: 360, ideal: 720, max: 1080 },
        frameRate: { min: 24, ideal: 30, max: 60 },
        deviceId: currentCameraId ? { ideal: currentCameraId } : undefined,
      },
      audio: baseAudioConstraints,
    };
  }, [detectMobile, currentCameraId]);

  const refreshDevices = useCallback(async (): Promise<void> => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const cameras = devices
        .filter(device => device.kind === 'videoinput')
        .map(device => ({
          deviceId: device.deviceId,
          label: device.label || `Camera ${availableCameras.length + 1}`,
          kind: device.kind as 'videoinput',
        }));

      const microphones = devices
        .filter(device => device.kind === 'audioinput')
        .map(device => ({
          deviceId: device.deviceId,
          label: device.label || `Microphone ${availableMicrophones.length + 1}`,
          kind: device.kind as 'audioinput',
        }));

      setAvailableCameras(cameras);
      setAvailableMicrophones(microphones);
    } catch (err) {
      console.error('[useCamera] Failed to enumerate devices:', err);
    }
  }, [availableCameras.length, availableMicrophones.length]);

  const startCamera = useCallback(async (constraints?: CameraConstraints): Promise<MediaStream> => {
    setIsCameraLoading(true);
    setCameraError(null);

    const optimalConstraints = constraints || getOptimalConstraints();

    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }

      const stream = await getUserMediaWithFallback(optimalConstraints);
      streamRef.current = stream;
      setLocalStream(stream);
      setIsCameraOn(true);
      setIsMuted(false);
      retryCountRef.current = 0;

      const videoTrack = stream.getVideoTracks()[0];
      const audioTrack = stream.getAudioTracks()[0];

      if (videoTrack) {
        setCurrentCameraId(videoTrack.getSettings().deviceId || null);
      }
      if (audioTrack) {
        setCurrentMicrophoneId(audioTrack.getSettings().deviceId || null);
        startAudioAnalysis(stream);
      }

      await refreshDevices();

      return stream;
    } catch (err) {
      console.error('[useCamera] Failed to get media stream:', err);

      if (retryCountRef.current < MAX_RETRIES) {
        retryCountRef.current += 1;
        console.log(`[useCamera] Retrying (${retryCountRef.current}/${MAX_RETRIES})...`);

        const fallbackConstraints: CameraConstraints = {
          video: { facingMode: 'user' },
          audio: true,
        };

        await new Promise(resolve => setTimeout(resolve, 1000));
        return startCamera(fallbackConstraints);
      }

      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setCameraError(`Failed to access camera/microphone: ${errorMessage}`);
      setIsCameraOn(false);
      throw err;
    } finally {
      setIsCameraLoading(false);
    }
  }, [getOptimalConstraints, refreshDevices, startAudioAnalysis]);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    stopAudioAnalysis();
    setLocalStream(null);
    setIsCameraOn(false);
    setCurrentCameraId(null);
    setCurrentMicrophoneId(null);
  }, [stopAudioAnalysis]);

  const toggleCamera = useCallback(() => {
    if (streamRef.current) {
      const videoTracks = streamRef.current.getVideoTracks();
      videoTracks.forEach(track => {
        track.enabled = !track.enabled;
      });
      setIsCameraOn(prev => !prev);
    }
  }, []);

  const toggleMute = useCallback(() => {
    if (streamRef.current) {
      const audioTracks = streamRef.current.getAudioTracks();
      audioTracks.forEach(track => {
        track.enabled = !track.enabled;
      });
      setIsMuted(prev => !prev);
      if (!isMuted) {
        setAudioLevel(0);
      }
    }
  }, [isMuted]);

  const toggleMirror = useCallback(() => {
    setIsMirrored(prev => !prev);
  }, []);

  const switchCamera = useCallback(async (deviceId: string): Promise<void> => {
    if (!streamRef.current) return;

    try {
      const videoTracks = streamRef.current.getVideoTracks();
      const optimalConstraints = getOptimalConstraints();
      const videoConstraints = typeof optimalConstraints.video === 'object' ? optimalConstraints.video : {};
      const audioConstraints = typeof optimalConstraints.audio === 'object' ? optimalConstraints.audio : {};

      const newStream = await navigator.mediaDevices.getUserMedia({
        video: {
          deviceId: { exact: deviceId },
          ...videoConstraints,
        },
        audio: {
          deviceId: currentMicrophoneId ? { exact: currentMicrophoneId } : undefined,
          ...audioConstraints,
        },
      });

      // Stop ALL old tracks — getUserMedia returns a full new stream
      // with both video and audio, so the old audio tracks also leak
      // if we only stop video tracks.
      streamRef.current.getTracks().forEach(track => track.stop());

      streamRef.current = newStream;
      setLocalStream(newStream);
      setCurrentCameraId(deviceId);

      if (!isCameraOn) {
        const videoTrack = newStream.getVideoTracks()[0];
        if (videoTrack) {
          videoTrack.enabled = false;
        }
      }

      if (newStream.getAudioTracks().length > 0 && !isMuted) {
        startAudioAnalysis(newStream);
      }
    } catch (err) {
      console.error('[useCamera] Failed to switch camera:', err);
      setCameraError('Failed to switch camera');
      throw err;
    }
  }, [currentMicrophoneId, getOptimalConstraints, isCameraOn, isMuted, startAudioAnalysis]);

  const switchMicrophone = useCallback(async (deviceId: string): Promise<void> => {
    if (!streamRef.current) return;

    try {
      const audioTracks = streamRef.current.getAudioTracks();
      const optimalConstraints = getOptimalConstraints();
      const videoConstraints = typeof optimalConstraints.video === 'object' ? optimalConstraints.video : {};
      const audioConstraints = typeof optimalConstraints.audio === 'object' ? optimalConstraints.audio : {};

      const newStream = await navigator.mediaDevices.getUserMedia({
        video: {
          deviceId: currentCameraId ? { exact: currentCameraId } : undefined,
          ...videoConstraints,
        },
        audio: {
          deviceId: { exact: deviceId },
          ...audioConstraints,
        },
      });

      // Stop ALL old tracks — getUserMedia returns a full new stream
      streamRef.current.getTracks().forEach(track => track.stop());

      streamRef.current = newStream;
      setLocalStream(newStream);
      setCurrentMicrophoneId(deviceId);

      if (!isMuted) {
        startAudioAnalysis(newStream);
      } else {
        const audioTrack = newStream.getAudioTracks()[0];
        if (audioTrack) {
          audioTrack.enabled = false;
        }
      }
    } catch (err) {
      console.error('[useCamera] Failed to switch microphone:', err);
      setCameraError('Failed to switch microphone');
      throw err;
    }
  }, [currentCameraId, getOptimalConstraints, isMuted, startAudioAnalysis]);

  useEffect(() => {
    const handleDeviceChange = async () => {
      await refreshDevices();
    };

    navigator.mediaDevices.addEventListener('devicechange', handleDeviceChange);
    return () => {
      navigator.mediaDevices.removeEventListener('devicechange', handleDeviceChange);
    };
  }, [refreshDevices]);

  useEffect(() => {
    return () => {
      stopAudioAnalysis();
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, [stopAudioAnalysis]);

  return {
    localStream,
    isCameraOn,
    isMuted,
    isMirrored,
    audioLevel,
    isCameraLoading,
    cameraError,
    availableCameras,
    availableMicrophones,
    currentCameraId,
    currentMicrophoneId,
    startCamera,
    stopCamera,
    toggleCamera,
    toggleMute,
    toggleMirror,
    switchCamera,
    switchMicrophone,
    refreshDevices,
    getOptimalConstraints,
  };
}
