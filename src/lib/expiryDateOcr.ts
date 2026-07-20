/**
 * Pure parsing helpers for the "賞味期限印字のカメラOCR自動読み取り" feature (#493).
 *
 * `parseExpiryDateFromOcrText` takes the raw text returned by tesseract.js and
 * tries to find a plausible expiry-date printed on a Japanese food package,
 * returning a normalized ISO date string (`YYYY-MM-DD`) or `null` when no
 * plausible date could be found. It is intentionally free of any camera/OCR
 * I/O so it can be unit tested in isolation from the (hard to test) camera
 * capture flow.
 *
 * Supported formats (with `.` / `-` / `/` / 年月日 separators):
 *   - YYYY-MM-DD / YYYY/MM/DD / YYYY.MM.DD
 *   - YYYY年MM月DD日 / YY年MM月DD日
 *   - YY.MM.DD / YY/MM/DD / YY-MM-DD  (2桁年、印字でよくある表記)
 *   - Compact digits: YYYYMMDD / YYMMDD (最終手段、有効な日付のみ採用)
 *
 * Common single-character OCR misreads (O→0, I/L→1, S→5, B→8) are corrected
 * inside candidate digit tokens before parsing.
 */

/** Character class matching a digit, or a letter commonly OCR'd in place of one. */
const DIGIT_CLASS = "[0-9OoIlLSsBb]";

/** Corrects common OCR letter/digit confusions (O→0, I/L→1, S→5, B→8). */
const correctOcrDigitConfusions = (token: string): string =>
  token.replace(/[OoIlLSsBb]/g, (ch) => {
    switch (ch.toLowerCase()) {
      case "o":
        return "0";
      case "i":
      case "l":
        return "1";
      case "s":
        return "5";
      case "b":
        return "8";
      default:
        return ch;
    }
  });

/** Parses a (possibly OCR-mangled) numeric token into an integer, or null if invalid. */
const toNumber = (token: string): number | null => {
  const corrected = correctOcrDigitConfusions(token);
  if (!/^\d+$/.test(corrected)) return null;
  return parseInt(corrected, 10);
};

/** 2桁年を4桁に変換する（70以上は1900年代、それ未満は2000年代とみなす、一般的なヒューリスティック） */
const expandTwoDigitYear = (yy: number): number => (yy >= 70 ? 1900 + yy : 2000 + yy);

const isValidCalendarDate = (year: number, month: number, day: number): boolean => {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false;
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  if (year < 1900 || year > 2200) return false;
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
};

const toIso = (year: number, month: number, day: number): string =>
  `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

interface DateCandidate {
  iso: string;
  index: number;
  /** Lower is preferred. */
  priority: number;
}

/** Builds a year/month/day candidate from raw regex capture groups; null if implausible. */
const buildCandidate = (
  yearToken: string,
  monthToken: string,
  dayToken: string,
  index: number,
  basePriority: number,
): DateCandidate | null => {
  const monthNum = toNumber(monthToken);
  const dayNum = toNumber(dayToken);
  const yearRaw = toNumber(yearToken);
  if (monthNum === null || dayNum === null || yearRaw === null) return null;

  const yearNum = yearToken.length <= 2 ? expandTwoDigitYear(yearRaw) : yearRaw;
  if (yearToken.length === 3) return null; // ambiguous 3-digit year, reject

  if (!isValidCalendarDate(yearNum, monthNum, dayNum)) return null;

  return { iso: toIso(yearNum, monthNum, dayNum), index, priority: basePriority };
};

interface PatternDef {
  regex: RegExp;
  priority: number;
}

const PATTERNS: PatternDef[] = [
  // 2025-12-31 / 2025/12/31 / 2025.12.31
  {
    regex: new RegExp(
      `(${DIGIT_CLASS}{4})[./\\-](${DIGIT_CLASS}{1,2})[./\\-](${DIGIT_CLASS}{1,2})`,
      "g",
    ),
    priority: 0,
  },
  // 2025年12月31日 / 25年12月31日
  {
    regex: new RegExp(
      `(${DIGIT_CLASS}{2,4})年(${DIGIT_CLASS}{1,2})月(${DIGIT_CLASS}{1,2})日?`,
      "g",
    ),
    priority: 1,
  },
  // 25.12.31 / 25/12/31 / 25-12-31 (2桁年、区切り文字の前後が数字で連続していないもの)
  {
    regex: new RegExp(
      `(?<!${DIGIT_CLASS})(${DIGIT_CLASS}{2})[./\\-](${DIGIT_CLASS}{1,2})[./\\-](${DIGIT_CLASS}{1,2})(?!${DIGIT_CLASS})`,
      "g",
    ),
    priority: 2,
  },
  // 20251231 (区切り無し8桁、最終手段)
  {
    regex: new RegExp(
      `(?<!${DIGIT_CLASS})(${DIGIT_CLASS}{4})(${DIGIT_CLASS}{2})(${DIGIT_CLASS}{2})(?!${DIGIT_CLASS})`,
      "g",
    ),
    priority: 3,
  },
  // 251231 (区切り無し6桁、最終手段)
  {
    regex: new RegExp(
      `(?<!${DIGIT_CLASS})(${DIGIT_CLASS}{2})(${DIGIT_CLASS}{2})(${DIGIT_CLASS}{2})(?!${DIGIT_CLASS})`,
      "g",
    ),
    priority: 4,
  },
];

/** キーワード近傍（30文字以内）に見つかった候補を優先するためのラベル一覧。 */
const EXPIRY_KEYWORDS = ["賞味期限", "消費期限", "BESTBEFORE", "EXPIRY", "EXPIRES", "EXP"];

const hasNearbyExpiryKeyword = (compactText: string, index: number): boolean => {
  const windowStart = Math.max(0, index - 30);
  const window = compactText.slice(windowStart, index).toUpperCase();
  return EXPIRY_KEYWORDS.some((kw) => window.includes(kw));
};

/**
 * Extracts the most plausible expiry date from raw OCR text.
 * Returns an ISO `YYYY-MM-DD` string, or `null` if nothing plausible was found.
 */
export const parseExpiryDateFromOcrText = (rawText: string): string | null => {
  if (!rawText || !rawText.trim()) return null;

  // OCRが挿入しがちな空白を除去して連続した数字列として扱う
  const compact = rawText.replace(/\s+/g, "");

  const candidates: DateCandidate[] = [];

  for (const { regex, priority } of PATTERNS) {
    for (const match of compact.matchAll(regex)) {
      const [, a, b, c] = match;
      if (a === undefined || b === undefined || c === undefined) continue;
      const index = match.index ?? 0;
      const candidate = buildCandidate(a, b, c, index, priority);
      if (candidate) candidates.push(candidate);
    }
  }

  if (candidates.length === 0) return null;

  candidates.sort((x, y) => {
    const xScore = x.priority - (hasNearbyExpiryKeyword(compact, x.index) ? 10 : 0);
    const yScore = y.priority - (hasNearbyExpiryKeyword(compact, y.index) ? 10 : 0);
    if (xScore !== yScore) return xScore - yScore;
    return x.index - y.index;
  });

  return candidates[0]?.iso ?? null;
};
