import React from 'react';
import { ModernImage } from './ModernImage';
import { Message } from './types';

interface ImageGridProps {
    messages: Message[];
}

/**
 * Messenger-style image grid.
 * 1 image  → full width
 * 2 images → side by side (50/50)
 * 3 images → 1 large left + 2 stacked right
 * 4 images → 2×2 grid
 * 5+ images → 2-column masonry with "+N" overlay on last
 */
export const ImageGrid: React.FC<ImageGridProps> = ({ messages }) => {
    const images = messages.map(m => ({
        src: m.content.match(/\((.*?)\)/)?.[1] || '',
        status: m.status,
        progress: m.progress,
        id: m.id,
        isGif: m.content.startsWith('![gif]')
    }));

    const count = images.length;
    const MAX_VISIBLE = 4;
    const visible = images.slice(0, MAX_VISIBLE);
    const overflow = count - MAX_VISIBLE;

    if (count === 1) {
        return (
            <div className="mt-1" style={{ maxWidth: 320 }}>
                <ModernImage
                    src={images[0].src}
                    status={images[0].status}
                    progress={images[0].progress}
                    isGif={images[0].isGif}
                    maxHeight="300px"
                />
            </div>
        );
    }

    if (count === 2) {
        return (
            <div className="mt-1 grid grid-cols-2 gap-1 rounded-xl overflow-hidden" style={{ maxWidth: 380 }}>
                {images.map(img => (
                    <ModernImage
                        key={img.id}
                        src={img.src}
                        status={img.status}
                        progress={img.progress}
                        isGif={img.isGif}
                        maxHeight="200px"
                        className="!rounded-none w-full h-full"
                    />
                ))}
            </div>
        );
    }

    if (count === 3) {
        return (
            <div className="mt-1 grid grid-cols-2 gap-1 rounded-xl overflow-hidden" style={{ maxWidth: 380 }}>
                <div className="row-span-2">
                    <ModernImage
                        src={images[0].src}
                        status={images[0].status}
                        progress={images[0].progress}
                        isGif={images[0].isGif}
                        maxHeight="300px"
                        className="!rounded-none w-full h-full"
                    />
                </div>
                <ModernImage
                    src={images[1].src}
                    status={images[1].status}
                    progress={images[1].progress}
                    isGif={images[1].isGif}
                    maxHeight="148px"
                    className="!rounded-none w-full"
                />
                <ModernImage
                    src={images[2].src}
                    status={images[2].status}
                    progress={images[2].progress}
                    isGif={images[2].isGif}
                    maxHeight="148px"
                    className="!rounded-none w-full"
                />
            </div>
        );
    }

    // 4+ images: 2×2 grid, overflow badge on last cell
    return (
        <div className="mt-1 grid grid-cols-2 gap-1 rounded-xl overflow-hidden" style={{ maxWidth: 380 }}>
            {visible.map((img, i) => (
                <div key={img.id} className="relative">
                    <ModernImage
                        src={img.src}
                        status={img.status}
                        progress={img.progress}
                        isGif={img.isGif}
                        maxHeight="180px"
                        className="!rounded-none w-full"
                    />
                    {i === MAX_VISIBLE - 1 && overflow > 0 && (
                        <div className="absolute inset-0 bg-black/50 flex items-center justify-center pointer-events-none">
                            <span className="text-white text-2xl font-bold">+{overflow}</span>
                        </div>
                    )}
                </div>
            ))}
        </div>
    );
};
