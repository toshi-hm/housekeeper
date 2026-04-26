import { useRef, useEffect, useState, useCallback } from 'react'
import { BrowserMultiFormatReader } from '@zxing/browser'
import { NotFoundException } from '@zxing/library'
import type { IScannerControls } from '@zxing/browser'
import { Camera, X } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface BarcodeScannerProps {
  onScan: (barcode: string) => void
  onClose: () => void
}

export function BarcodeScanner({ onScan, onClose }: BarcodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const controlsRef = useRef<IScannerControls | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isStarting, setIsStarting] = useState(true)

  const startScanning = useCallback(async () => {
    try {
      const reader = new BrowserMultiFormatReader()
      const videoInputDevices = await BrowserMultiFormatReader.listVideoInputDevices()
      // Prefer rear camera on mobile
      const rearCamera = videoInputDevices.find(
        (d) =>
          d.label.toLowerCase().includes('back') ||
          d.label.toLowerCase().includes('rear') ||
          d.label.toLowerCase().includes('environment'),
      )
      const deviceId = rearCamera?.deviceId ?? videoInputDevices[0]?.deviceId ?? undefined

      if (!videoRef.current) return

      const controls = await reader.decodeFromVideoDevice(deviceId, videoRef.current, (result, err) => {
        if (result) {
          onScan(result.getText())
        }
        if (err && !(err instanceof NotFoundException)) {
          // ignore NotFoundException (no barcode in frame yet)
        }
      })
      controlsRef.current = controls
      setIsStarting(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Camera access denied')
      setIsStarting(false)
    }
  }, [onScan])

  useEffect(() => {
    void startScanning()
    return () => {
      controlsRef.current?.stop()
    }
  }, [startScanning])

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      <div className="flex items-center justify-between p-4">
        <div className="flex items-center gap-2 text-white">
          <Camera className="h-5 w-5" />
          <span className="font-medium">Scan Barcode</span>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} className="text-white hover:bg-white/20">
          <X className="h-5 w-5" />
        </Button>
      </div>

      <div className="relative flex-1">
        {error ? (
          <div className="flex h-full items-center justify-center p-8 text-center text-white">
            <div>
              <p className="text-lg font-medium">Camera Error</p>
              <p className="mt-2 text-sm text-white/70">{error}</p>
              <Button className="mt-4" onClick={onClose} variant="outline">
                Close
              </Button>
            </div>
          </div>
        ) : (
          <>
            <video ref={videoRef} className="h-full w-full object-cover" muted playsInline />
            {isStarting && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                <span className="text-white">Starting camera…</span>
              </div>
            )}
            {/* Scanning frame overlay */}
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="relative h-48 w-72">
                <div className="absolute left-0 top-0 h-8 w-8 border-l-4 border-t-4 border-white" />
                <div className="absolute right-0 top-0 h-8 w-8 border-r-4 border-t-4 border-white" />
                <div className="absolute bottom-0 left-0 h-8 w-8 border-b-4 border-l-4 border-white" />
                <div className="absolute bottom-0 right-0 h-8 w-8 border-b-4 border-r-4 border-white" />
              </div>
            </div>
          </>
        )}
      </div>

      <div className="p-4 text-center text-sm text-white/70">
        Point the camera at a barcode to scan
      </div>
    </div>
  )
}
