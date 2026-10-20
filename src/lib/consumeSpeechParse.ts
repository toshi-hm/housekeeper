/**
 * 消費フォーム（`src/routes/_auth.items.$itemId.consume.tsx`）向けの音声入力
 * パース処理（issue #1010）。
 *
 * このページは既に対象アイテムが確定した状態（itemIdがURLパラメータ）で開かれる
 * ため、発話からアイテム名を特定する必要は無く、「数量」と「単位」だけを抽出すれば
 * よい。`ExpiryDateScanner`のOCRと同じ方針で、抽出結果はフォームの入力欄へ反映する
 * だけで自動送信はしない（ユーザーが値を確認してから消費ボタンを押す）。
 *
 * 数量は半角/全角の算用数字（整数・小数）を優先し、見つからない場合のみ
 * 小さな位取り無しの漢数字（一〜十）にフォールバックする。単位は呼び出し側が
 * 渡す候補（そのアイテムで換算可能な単位一覧）とその読み仮名（`UNIT_PHONETIC_ALIASES`）
 * のうち、発話に含まれる最長一致を採用する。
 */

const KANJI_DIGITS: Readonly<Record<string, number>> = {
  一: 1,
  二: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
  十: 10,
};

// 全角算用数字（U+FF10-FF19）と半角（U+0030-0039）のコードポイント差。
const FULL_WIDTH_DIGIT_PATTERN = /[０-９]/g;
const FULL_WIDTH_TO_HALF_WIDTH_OFFSET = 0xfee0;

/** 全角算用数字（０-９）を半角に正規化する。 */
const normalizeDigits = (input: string): string =>
  input.replace(FULL_WIDTH_DIGIT_PATTERN, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - FULL_WIDTH_TO_HALF_WIDTH_OFFSET),
  );

/**
 * `CONTENT_UNITS`（`src/types/item.ts`）のうちラテン文字の単位は、音声認識では
 * 略号ではなくカタカナ読みでテキスト化される（例: "mL"ではなく"ミリリットル"）。
 * "ミリリットル"は"リットル"を部分文字列として含むため、必ず長い読みを先に
 * 照合する（後段のソートに委ねる）。カスタム単位（`custom_units`）はここに
 * 無く、その場合は単位名そのものの部分一致のみを試みる。
 */
const UNIT_PHONETIC_ALIASES: Readonly<Record<string, readonly string[]>> = {
  mL: ["ミリリットル", "ミリ"],
  L: ["リットル"],
  g: ["グラム"],
  kg: ["キログラム", "キロ"],
};

/**
 * 発話中の最初の漢数字列（一〜九・十）を数値に変換する。「十二」「二十」「二十五」
 * のように「十」を含む 2 桁（10〜99）に対応する。「十」を含まない場合は先頭の 1 文字のみ
 * を採用する。見つからなければ null。
 */
const parseKanjiNumber = (input: string): number | null => {
  const run = input.match(/[一二三四五六七八九十]+/)?.[0];
  if (!run) return null;
  const tenIndex = run.indexOf("十");
  if (tenIndex === -1) return KANJI_DIGITS[run[0] as string] ?? null;
  const tens = tenIndex === 0 ? 1 : (KANJI_DIGITS[run[tenIndex - 1] as string] ?? 1);
  const onesChar = run[tenIndex + 1];
  const ones = onesChar && onesChar !== "十" ? (KANJI_DIGITS[onesChar] ?? 0) : 0;
  return tens * 10 + ones;
};

export interface ParsedConsumeSpeech {
  /** 抽出できた数量。見つからない場合は null。 */
  amount: number | null;
  /** 抽出できた単位（`candidateUnits` のいずれか）。見つからない場合は null。 */
  unit: string | null;
}

/**
 * 発話テキストから消費数量と単位を抽出する。
 *
 * @param transcript Web Speech API から得られた確定済みテキスト（例: "たまごを2個使った"）
 * @param candidateUnits そのアイテムで選択可能な単位一覧（`getConvertibleUnits` の結果等）。
 *   長い単位から先に照合するため、事前ソートは不要。
 */
export const parseConsumeSpeech = (
  transcript: string,
  candidateUnits: readonly string[],
): ParsedConsumeSpeech => {
  const normalized = normalizeDigits(transcript.trim());

  const arabicMatch = normalized.match(/\d+(?:\.\d+)?/);
  let amount: number | null = arabicMatch ? parseFloat(arabicMatch[0]) : null;

  if (amount === null) {
    amount = parseKanjiNumber(normalized);
  }

  const aliasPairs = candidateUnits
    .filter((u) => u.length > 0)
    .flatMap((unit) =>
      [unit, ...(UNIT_PHONETIC_ALIASES[unit] ?? [])].map((alias) => ({ unit, alias })),
    )
    .sort((a, b) => b.alias.length - a.alias.length);
  const unit = aliasPairs.find((p) => normalized.includes(p.alias))?.unit ?? null;

  return { amount, unit };
};
