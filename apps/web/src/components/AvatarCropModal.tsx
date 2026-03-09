import React, { useState, useCallback } from 'react';
import ReactDOM from 'react-dom';
import Cropper, { Area } from 'react-easy-crop';

interface AvatarCropModalProps {
  isOpen: boolean;
  imageSrc: string;
  onClose: () => void;
  onCropComplete: (croppedImageBlob: Blob) => void;
}

// Helper to extract the cropped rectangle from the image and return a Blob
async function getCroppedImg(imageSrc: string, pixelCrop: Area): Promise<Blob | null> {
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.addEventListener('load', () => resolve(img));
    img.addEventListener('error', (err) => reject(err));
    img.src = imageSrc;
  });

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    return null;
  }

  canvas.width = pixelCrop.width;
  canvas.height = pixelCrop.height;

  ctx.drawImage(
    image,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    pixelCrop.width,
    pixelCrop.height
  );

  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      resolve(blob);
    }, 'image/jpeg', 0.9);
  });
}

export const AvatarCropModal: React.FC<AvatarCropModalProps> = ({
  isOpen,
  imageSrc,
  onClose,
  onCropComplete,
}) => {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);

  const onCropCompleteHandler = useCallback((_croppedArea: Area, croppedAreaPixels: Area) => {
    setCroppedAreaPixels(croppedAreaPixels);
  }, []);

  const onDownloadCropClick = useCallback(async () => {
    if (!croppedAreaPixels) return;

    try {
      const croppedBlob = await getCroppedImg(imageSrc, croppedAreaPixels);
      if (croppedBlob) {
        onCropComplete(croppedBlob);
      }
    } catch (e) {
      console.error('Error cropping image', e);
    }
  }, [imageSrc, croppedAreaPixels, onCropComplete]);

  if (!isOpen || !imageSrc) {
    return null;
  }

  return ReactDOM.createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-background border border-border p-4 sm:p-5 rounded-lg shadow-lg w-full max-w-md flex flex-col gap-4 animate-in fade-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div className="flex flex-col">
            <h2 className="text-base font-semibold">Adjust Avatar</h2>
            <p className="text-xs text-muted-foreground">Pinch or scroll to zoom, drag to pan</p>
          </div>
          <button
            aria-label="Close"
            onClick={onClose}
            className="h-8 w-8 inline-flex items-center justify-center rounded-md hover:bg-accent hover:text-accent-foreground"
          >
            ×
          </button>
        </div>

        {/* Cropper Area */}
        <div className="relative w-full h-[320px] sm:h-[360px] bg-black rounded-lg overflow-hidden shrink-0">
          <Cropper
            image={imageSrc}
            crop={crop}
            zoom={zoom}
            aspect={1}
            cropShape="round"
            showGrid={false}
            onCropChange={setCrop}
            onCropComplete={onCropCompleteHandler}
            onZoomChange={setZoom}
          />
        </div>

        {/* Controls */}
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-foreground">Zoom</label>
            <input
              type="range"
              value={zoom}
              min={1}
              max={3}
              step={0.1}
              aria-labelledby="Zoom"
              onChange={(e) => setZoom(Number(e.target.value))}
              className="w-full accent-primary"
            />
          </div>

          <div className="flex justify-between gap-2 pt-2">
            <button
              onClick={() => {
                setCrop({ x: 0, y: 0 });
                setZoom(1);
              }}
              className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background border border-input bg-background hover:bg-accent hover:text-accent-foreground h-9 px-3 transition-colors"
            >
              Reset
            </button>
            <button
              onClick={onClose}
              className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background border border-input bg-background hover:bg-accent hover:text-accent-foreground h-9 px-3 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={onDownloadCropClick}
              disabled={!croppedAreaPixels}
              className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background bg-primary text-primary-foreground hover:bg-primary/90 h-9 px-4 transition-colors disabled:opacity-50 font-semibold"
            >
              Save Avatar
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};
