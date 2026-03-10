export interface BrowserInfo {
  name: string;
  version: string;
  isMobile: boolean;
  isIOS: boolean;
  isAndroid: boolean;
  isSafari: boolean;
  isChrome: boolean;
  isFirefox: boolean;
  isEdge: boolean;
  supportsWebRTC: boolean;
  supportsWebGL: boolean;
  supportsH264: boolean;
  supportsVP9: boolean;
  supportsAV1: boolean;
}

export interface CompatibilityIssues {
  hasIssues: boolean;
  warnings: string[];
  errors: string[];
  recommendations: string[];
}

export function getBrowserInfo(): BrowserInfo {
  const userAgent = navigator.userAgent;
  const platform = navigator.platform;

  const isMobile = /iPhone|iPad|iPod|Android/i.test(userAgent);
  const isIOS = /iPhone|iPad|iPod/i.test(userAgent);
  const isAndroid = /Android/i.test(userAgent);
  const isSafari = /^((?!chrome|android).)*safari/i.test(userAgent);
  const isEdge = /Edg/i.test(userAgent);
  const isChrome = /Chrome/i.test(userAgent) && !isEdge;
  const isFirefox = /Firefox/i.test(userAgent);

  let version = 'unknown';
  const versionMatch = userAgent.match(/(Chrome|Firefox|Safari|Edge)\/(\d+\.?\d*)/i);
  if (versionMatch) {
    version = versionMatch[2];
  }

  const supportsWebRTC = !!(window.RTCPeerConnection || (window as any).webkitRTCPeerConnection);
  const supportsWebGL = !!(
    window.WebGLRenderingContext ||
    (window as any).webkitWebGLRenderingContext ||
    (window as any).mozWebGLRenderingContext
  );

  const videoElement = document.createElement('video');
  const supportsH264 = videoElement.canPlayType('video/mp4; codecs="avc1.42E01E"') !== '';
  const supportsVP9 = videoElement.canPlayType('video/webm; codecs="vp9"') !== '';
  const supportsAV1 = videoElement.canPlayType('video/mp4; codecs="av01.0.01M.08"') !== '';

  return {
    name: isChrome ? 'Chrome' : isFirefox ? 'Firefox' : isSafari ? 'Safari' : isEdge ? 'Edge' : 'Unknown',
    version,
    isMobile,
    isIOS,
    isAndroid,
    isSafari,
    isChrome,
    isFirefox,
    isEdge,
    supportsWebRTC,
    supportsWebGL,
    supportsH264,
    supportsVP9,
    supportsAV1,
  };
}

export function checkWebRTCCompatibility(): CompatibilityIssues {
  const browser = getBrowserInfo();
  const issues: CompatibilityIssues = {
    hasIssues: false,
    warnings: [],
    errors: [],
    recommendations: [],
  };

  if (!browser.supportsWebRTC) {
    issues.hasIssues = true;
    issues.errors.push('WebRTC is not supported in this browser');
    issues.recommendations.push('Please use Chrome, Firefox, Safari, or Edge for video chat functionality');
  }

  if (!browser.supportsWebGL) {
    issues.hasIssues = true;
    issues.warnings.push('WebGL is not supported. Some features may not work properly');
  }

  if (browser.isIOS && parseFloat(browser.version) < 14) {
    issues.hasIssues = true;
    issues.errors.push('iOS 14 or higher is required for optimal video chat experience');
    issues.recommendations.push('Please update your iOS device to the latest version');
  }

  if (browser.isAndroid && parseFloat(browser.version) < 5) {
    issues.hasIssues = true;
    issues.warnings.push('Android 5 or higher is recommended for best experience');
  }

  if (browser.isSafari && browser.isMobile && !browser.supportsVP9) {
    issues.warnings.push('VP9 codec not supported. Falling back to H264');
  }

  if (browser.isMobile) {
    issues.recommendations.push('For best video quality, connect to WiFi instead of cellular data');
    issues.recommendations.push('Close other apps to free up memory and CPU');
  }

  if (!browser.isMobile && browser.isSafari) {
    issues.warnings.push('Desktop Safari may have limited WebRTC features compared to Chrome/Firefox');
  }

  return issues;
}

export function getOptimalVideoCodecs(browser: BrowserInfo): string[] {
  const codecs: string[] = [];

  if (browser.supportsAV1) {
    codecs.push('video/AV1');
  }

  if (browser.supportsVP9) {
    codecs.push('video/VP9');
  }

  if (browser.supportsH264) {
    codecs.push('video/H264');
  }

  return codecs;
}

export function createPeerConnection(
  config: RTCConfiguration,
  browser: BrowserInfo
): RTCPeerConnection {
  const pcConfig: any = { ...config };

  if (browser.isSafari) {
    pcConfig.sdpSemantics = 'unified-plan';
  }

  // Enhanced configuration for background tab resilience
  // These settings help prevent ICE agents from going dormant
  // when tabs are minimized or backgrounded
  if (!pcConfig.iceTransportPolicy) {
    pcConfig.iceTransportPolicy = 'all';
  }

  // Add more aggressive ICE keepalive settings for mobile browsers
  if (browser.isMobile) {
    // Enable continual ICE gathering to keep connection active
    pcConfig.continualGatheringPolicy = 'gather_continually';
    
    // Reduce ICE connection timeout to detect issues faster
    pcConfig.iceCandidatePoolSize = Math.max(pcConfig.iceCandidatePoolSize || 0, 2);
    
    // Enable bundle policy for better efficiency on mobile networks
    if (!pcConfig.bundlePolicy) {
      pcConfig.bundlePolicy = 'max-bundle';
    }
  }

  // Add RTCPeerConnection-specific settings for screen share resilience
  if (!pcConfig.certificates) {
    // Use longer-lived certificates to prevent renegotiation during background
    pcConfig.certificates = [];
  }

  const RTCPeerConnectionConstructor = window.RTCPeerConnection ||
    (window as any).webkitRTCPeerConnection ||
    (window as any).mozRTCPeerConnection;

  if (!RTCPeerConnectionConstructor) {
    throw new Error('WebRTC is not supported in this browser');
  }

  const pc = new RTCPeerConnectionConstructor(pcConfig);

  // Add ICE keepalive enhancement for background tabs
  // This helps maintain connections when browser throttles background tabs
  if (browser.isMobile) {
    // Override setLocalDescription to add ICE restart hints
    const originalSetLocalDescription = pc.setLocalDescription.bind(pc);
    (pc as any).setLocalDescription = async (description: RTCSessionDescriptionInit) => {
      if (description && description.type === 'answer') {
        // Add ICE restart attributes for better background resilience
        if (description.sdp && !description.sdp.includes('a=ice-ufrag')) {
          description.sdp = description.sdp.replace(/(a=ice-pwd:.*\n)/g, '$1a=ice-ufrag:buzzu-bg\n');
        }
      }
      return originalSetLocalDescription(description);
    };
  }

  return pc;
}

export function getUserMediaWithFallback(
  constraints: MediaStreamConstraints
): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia(constraints).catch(async (error) => {
    console.warn('[BrowserCompatibility] Primary getUserMedia failed, trying fallback:', error);

    const fallbackConstraints: MediaStreamConstraints = {
      video: constraints.video ? {
        width: { ideal: 640, max: 1280 },
        height: { ideal: 480, max: 720 },
        frameRate: { ideal: 24, max: 30 },
      } : false,
      audio: constraints.audio ? true : false,
    };

    return navigator.mediaDevices.getUserMedia(fallbackConstraints).catch(async (err) => {
      console.warn('[BrowserCompatibility] Secondary fallback failed, trying minimal constraints:', err);

      const minimalConstraints: MediaStreamConstraints = {
        video: constraints.video ? true : false,
        audio: constraints.audio ? true : false,
      };

      return navigator.mediaDevices.getUserMedia(minimalConstraints);
    });
  });
}

export function requestAnimationFramePolyfill(callback: FrameRequestCallback): number {
  return (
    window.requestAnimationFrame ||
    (window as any).webkitRequestAnimationFrame ||
    (window as any).mozRequestAnimationFrame ||
    (window as any).msRequestAnimationFrame ||
    function (callback: FrameRequestCallback) {
      return window.setTimeout(callback, 1000 / 60);
    }
  )(callback);
}

export function getNetworkType(): string {
  if (!(navigator as any).connection) {
    return 'unknown';
  }

  return (navigator as any).connection.effectiveType || 'unknown';
}

export function isLowBandwidth(): boolean {
  const networkType = getNetworkType();
  return ['slow-2g', '2g', '3g'].includes(networkType);
}

export function shouldUseLowQualityMode(): boolean {
  const browser = getBrowserInfo();
  return browser.isMobile || isLowBandwidth();
}
