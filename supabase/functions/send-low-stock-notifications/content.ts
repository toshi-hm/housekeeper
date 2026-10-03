export type Language = "ja" | "en";

const messages: Record<
  Language,
  { title: (count: number) => string; body: (names: string) => string }
> = {
  ja: {
    title: (count) => `日用品の在庫が少ないものが${count}件あります`,
    body: (names) => `${names} の補充を確認してください。`,
  },
  en: {
    title: (count) => `${count} daily goods are low on stock`,
    body: (names) => `Check whether you need to restock: ${names}.`,
  },
};

export const resolveLanguage = (value: unknown): Language => (value === "en" ? "en" : "ja");

export const buildLowStockMessage = (
  language: Language,
  itemNames: string[],
  totalCount = itemNames.length,
): { title: string; body: string; emailText: string } => {
  const copy = messages[language];
  const displayedNames = itemNames.slice(0, 5);
  const suffix =
    totalCount > displayedNames.length ? ` +${totalCount - displayedNames.length}` : "";
  const names = `${displayedNames.join(", ")}${suffix}`;
  const title = copy.title(totalCount);
  const body = copy.body(names);
  return { title, body, emailText: `${title}\n\n${body}` };
};
