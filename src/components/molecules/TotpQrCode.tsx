import QRCode from "qrcode";
import { useEffect, useRef } from "react";

interface TotpQrCodeProps {
  uri: string;
  label?: string;
}

export const TotpQrCode = ({ uri, label }: TotpQrCodeProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    void QRCode.toCanvas(canvasRef.current, uri, { width: 200, margin: 2 });
  }, [uri]);

  return (
    <div className="flex justify-center">
      <canvas ref={canvasRef} role="img" aria-label={label} />
    </div>
  );
};
