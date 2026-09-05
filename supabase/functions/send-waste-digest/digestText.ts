// #925: send-expiry-notifications/index.ts の EXPIRY_NOTIFICATION_TEXT と同じ理由
// (Edge Functionはreact-i18nextを使えない) で、通知本文を小さな静的な言語別マップに
// 保持する。

export interface WasteDigestInput {
  currentWeekCount: number;
  changePercent: number | null;
  topWasted: Array<{ name: string; count: number }>;
  /** この週の評価後（送信対象週を含む）のストリーク週数。0ならストリーク行は出さない。 */
  streakWeeksAfterUpdate: number;
}

export interface WasteDigestMessage {
  title: string;
  body: string;
  emailSubject: string;
  emailBody: string;
}

type Lang = "ja" | "en";

const formatChangePercent = (
  changePercent: number | null,
  fmt: (sign: "" | "+" | "±", value: number) => string,
): string | null => {
  if (changePercent === null) return null;
  if (changePercent > 0) return fmt("+", changePercent);
  if (changePercent < 0) return fmt("", changePercent);
  return fmt("±", 0);
};

const WASTE_DIGEST_TEXT: Record<
  Lang,
  {
    title: (count: number) => string;
    changeLine: (changePercent: number | null) => string | null;
    topLine: (topWasted: WasteDigestInput["topWasted"]) => string | null;
    streakLine: (streakWeeks: number) => string | null;
    emailIntro: string;
  }
> = {
  ja: {
    title: (count) =>
      count === 0 ? "先週は食品ロスゼロでした！" : `先週は${count}件の食材を廃棄しました`,
    changeLine: (changePercent) =>
      formatChangePercent(changePercent, (sign, value) => `前週比${sign}${value}%`),
    topLine: (topWasted) =>
      topWasted.length === 0
        ? null
        : `よく廃棄した食材: ${topWasted.map((w) => w.name).join("、")}`,
    streakLine: (streakWeeks) =>
      streakWeeks > 0 ? `現在${streakWeeks}週連続ロスゼロ中です` : null,
    emailIntro: "週次食品ロスダイジェスト",
  },
  en: {
    title: (count) =>
      count === 0 ? "Zero food waste last week!" : `You discarded ${count} item(s) last week`,
    changeLine: (changePercent) =>
      formatChangePercent(changePercent, (sign, value) => `${sign}${value}% vs. the week before`),
    topLine: (topWasted) =>
      topWasted.length === 0
        ? null
        : `Most-wasted items: ${topWasted.map((w) => w.name).join(", ")}`,
    streakLine: (streakWeeks) =>
      streakWeeks > 0 ? `You're on a ${streakWeeks}-week zero-waste streak` : null,
    emailIntro: "Weekly food-waste digest",
  },
};

const isSupportedLanguage = (value: unknown): value is Lang => value === "ja" || value === "en";

export const resolveWasteDigestLanguage = (value: unknown): Lang =>
  isSupportedLanguage(value) ? value : "ja";

/** ダイジェストのプッシュ/メール本文を組み立てる（純粋関数、テスト容易性のため分離）。 */
export const buildWasteDigestMessage = (
  lang: Lang,
  input: WasteDigestInput,
): WasteDigestMessage => {
  const text = WASTE_DIGEST_TEXT[lang];
  const title = text.title(input.currentWeekCount);
  const lines = [
    text.changeLine(input.changePercent),
    text.topLine(input.topWasted),
    text.streakLine(input.streakWeeksAfterUpdate),
  ].filter((line): line is string => line !== null);

  return {
    title,
    body: lines.join(" / "),
    emailSubject: title,
    emailBody: `${text.emailIntro}\n${title}\n${lines.join("\n")}`,
  };
};
