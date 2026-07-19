import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

/**
 * Web Speech API (`SpeechRecognition` / `webkitSpeechRecognition`) は標準化されておらず
 * TypeScript の DOM lib にも含まれないため、実際に使う範囲だけを手書きの narrow interface
 * として宣言する（`any` は使わない）。
 */
interface SpeechRecognitionAlternative {
  readonly transcript: string;
}

interface SpeechRecognitionResult {
  readonly length: number;
  readonly [index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionResultList {
  readonly length: number;
  readonly [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionEvent extends Event {
  readonly results: SpeechRecognitionResultList;
}

interface SpeechRecognitionErrorEvent extends Event {
  readonly error: string;
}

interface SpeechRecognitionInstance extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionInstance;

interface SpeechRecognitionWindow {
  SpeechRecognition?: SpeechRecognitionConstructor;
  webkitSpeechRecognition?: SpeechRecognitionConstructor;
}

const getSpeechRecognitionConstructor = (): SpeechRecognitionConstructor | null => {
  if (typeof window === "undefined") return null;
  const w = window as unknown as SpeechRecognitionWindow;
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
};

/**
 * 現在の環境で音声入力（Web Speech API）が利用可能かどうか。
 * 対応: Chrome (Android/Desktop)・Safari (iOS 14.5+) / 非対応: Firefox など。
 * 非対応環境では呼び出し側でボタン自体を非表示にする（フォールバックなし）。
 */
export const isSpeechInputSupported = (): boolean => getSpeechRecognitionConstructor() !== null;

const SPEECH_LANG_BY_LANGUAGE = {
  ja: "ja-JP",
  en: "en-US",
} as const satisfies Record<string, string>;

const resolveSpeechLang = (language: string): string => {
  const base = language.split("-")[0]?.toLowerCase();
  if (base === "en") return SPEECH_LANG_BY_LANGUAGE.en;
  return SPEECH_LANG_BY_LANGUAGE.ja;
};

export interface UseSpeechInputResult {
  /** この環境で音声入力を利用できるか（feature detection） */
  isSupported: boolean;
  /** 現在音声認識中かどうか */
  isListening: boolean;
  /** 音声認識を開始する。非対応環境では何もしない */
  start: () => void;
  /** 音声認識を中断する */
  stop: () => void;
}

/**
 * Web Speech API を使ったハンズフリー音声入力フック。
 *
 * `continuous: false`, `interimResults: false` で1発話ぶんの確定結果のみを受け取り、
 * `onResult` に渡す。`recognition.lang` は `i18n.language` に応じて `ja-JP` / `en-US` を
 * 自動選択する。`SpeechRecognition` が存在しない環境（Firefox 等）では `isSupported` が
 * `false` になり、`start` は安全に no-op となる。
 */
export const useSpeechInput = (onResult: (transcript: string) => void): UseSpeechInputResult => {
  const { i18n } = useTranslation();
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const onResultRef = useRef(onResult);

  const isSupported = isSpeechInputSupported();

  useEffect(() => {
    onResultRef.current = onResult;
  }, [onResult]);

  useEffect(() => {
    return () => {
      recognitionRef.current?.abort();
      recognitionRef.current = null;
    };
  }, []);

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
  }, []);

  const start = useCallback(() => {
    const SpeechRecognitionCtor = getSpeechRecognitionConstructor();
    if (!SpeechRecognitionCtor) return;
    if (recognitionRef.current) return; // 既に認識中

    const recognition = new SpeechRecognitionCtor();
    recognition.lang = resolveSpeechLang(i18n.language);
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript;
      if (transcript) onResultRef.current(transcript);
    };
    recognition.onerror = () => {
      recognitionRef.current = null;
      setIsListening(false);
    };
    recognition.onend = () => {
      recognitionRef.current = null;
      setIsListening(false);
    };

    recognitionRef.current = recognition;
    setIsListening(true);
    recognition.start();
  }, [i18n.language]);

  return { isSupported, isListening, start, stop };
};
