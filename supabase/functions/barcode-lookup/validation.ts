// JAN/EAN/UPC barcodes are 8-14 numeric digits.
const BARCODE_PATTERN = /^\d{8,14}$/;

export const isValidBarcode = (barcode: string): boolean => BARCODE_PATTERN.test(barcode);
