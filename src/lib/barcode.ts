/** 同じ商品を指す UPC-A(12桁) / JAN-13 / GTIN-14 の表記ゆれを吸収するため、
 *  照合に使う候補コードを返す（入力そのものを先頭に含む）。
 *  読み取り機器や登録経路によって桁数が変わっても、以前登録した商品に一致させる。 */
export const barcodeVariants = (barcode: string): string[] => {
  const code = barcode.trim();
  if (!/^\d+$/.test(code)) return [code];
  const variants = new Set([code]);
  if (code.length === 12) variants.add(`0${code}`);
  if (code.length === 13 && code.startsWith("0")) variants.add(code.slice(1));
  if (code.length === 13) variants.add(`0${code}`);
  if (code.length === 14 && code.startsWith("0")) variants.add(code.slice(1));
  return [...variants];
};
