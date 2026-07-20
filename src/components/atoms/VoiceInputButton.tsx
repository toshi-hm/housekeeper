import { Mic } from "lucide-react";

import { Button } from "@/components/ui/button";

interface VoiceInputButtonProps {
  isSupported: boolean;
  isListening: boolean;
  onStart: () => void;
  label: string;
  listeningLabel: string;
}

/**
 * マイクアイコンの音声入力ボタン。
 * 音声認識の状態は呼び出し元からpropsで受け取り、外部状態には依存しない。
 * Web Speech API 非対応環境では何もレンダリングしない（フォールバックなし）。
 */
export const VoiceInputButton = ({
  isSupported,
  isListening,
  onStart,
  label,
  listeningLabel,
}: VoiceInputButtonProps) => {
  if (!isSupported) return null;

  const buttonLabel = isListening ? listeningLabel : label;

  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      onClick={onStart}
      disabled={isListening}
      aria-label={buttonLabel}
      title={buttonLabel}
    >
      <Mic className={`h-4 w-4 ${isListening ? "animate-pulse text-destructive" : ""}`} />
    </Button>
  );
};
