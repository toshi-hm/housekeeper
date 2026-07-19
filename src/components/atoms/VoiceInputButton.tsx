import { Mic } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { useSpeechInput } from "@/hooks/useSpeechInput";

interface VoiceInputButtonProps {
  /** 音声認識結果（確定テキスト）を受け取るコールバック */
  onResult: (transcript: string) => void;
  /** aria-label / title に使うラベル。省略時は共通の「音声入力」を使う */
  label?: string;
}

/**
 * マイクアイコンの音声入力ボタン。
 * `useSpeechInput` の feature detection により、Web Speech API 非対応環境
 * （Firefox 等）では何もレンダリングしない（フォールバックなし）。
 */
export const VoiceInputButton = ({ onResult, label }: VoiceInputButtonProps) => {
  const { t } = useTranslation("common");
  const { isSupported, isListening, start } = useSpeechInput(onResult);

  if (!isSupported) return null;

  const buttonLabel = label ?? t("voiceInput");

  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      onClick={start}
      disabled={isListening}
      aria-label={isListening ? t("voiceInputListening") : buttonLabel}
      title={isListening ? t("voiceInputListening") : buttonLabel}
    >
      <Mic className={`h-4 w-4 ${isListening ? "animate-pulse text-destructive" : ""}`} />
    </Button>
  );
};
