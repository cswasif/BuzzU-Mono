export function AnimatedBackground() {
  return (
    <div className="relative w-full h-full rounded-sm md:rounded-xl">
      <svg
        preserveAspectRatio="xMidYMid slice"
        viewBox="10 10 80 80"
        role="img"
        aria-label="Decorative animated background"
        className="absolute inset-0 w-full h-full bg-black/95 rounded-sm md:rounded-xl"
      >
        <defs>
          <radialGradient id="gradient1" cx="50%" cy="50%" r="50%" fx="50%" fy="50%">
            <stop offset="0%" stopColor="#9370db" />
            <stop offset="100%" stopColor="#4b0082" />
          </radialGradient>
          <radialGradient id="gradient2" cx="50%" cy="50%" r="50%" fx="50%" fy="50%">
            <stop offset="0%" stopColor="#ba55d3" />
            <stop offset="100%" stopColor="#6a0dad" />
          </radialGradient>
        </defs>
        <path
          fill="url(#gradient1)"
          d="M37-5C25.1-14.7 5.7-19.1-9.2-10-28.5 1.8-32.7 31.1-19.8 49c15.5 21.5 52.6 22 67.2 2.3C59.4 35 53.7 8.5 37-5Z"
          opacity="0.8"
          className="cc-blob-1"
        />
        <path
          fill="url(#gradient2)"
          d="M20.6 4.1C11.6 1.5-1.9 2.5-8 11.2-16.3 23.1-8.2 45.6 7.4 50S42.1 38.9 41 24.5C40.2 14.1 29.4 6.6 20.6 4.1Z"
          opacity="0.8"
          className="cc-blob-2"
        />
        <path
          fill="url(#gradient1)"
          d="M105.9 48.6c-12.4-8.2-29.3-4.8-39.4.8-23.4 12.8-37.7 51.9-19.1 74.1s63.9 15.3 76-5.6c7.6-13.3 1.8-31.1-2.3-43.8-3.5-10.8-6.4-19.8-15.2-25.5Z"
          opacity="0.8"
          className="cc-blob-3"
        />
        <path
          fill="url(#gradient2)"
          d="M102 67.1c-9.6-6.1-22-3.1-29.5 2-15.4 10.7-19.6 37.5-7.6 47.8s35.9 3.9 44.5-12.5c6.1-11.8 4.5-29.8-7.4-37.3Z"
          opacity="0.8"
          className="cc-blob-4"
        />
      </svg>
      <div className="absolute inset-0 backdrop-blur-xl bg-black/30 rounded-sm md:rounded-xl" />
    </div>
  );
}
