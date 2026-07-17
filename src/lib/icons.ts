import {
  Apple,
  Archive,
  Beef,
  Box,
  Carrot,
  Coffee,
  Cookie,
  Egg,
  Fish,
  IceCreamCone,
  type LucideIcon,
  Martini,
  Milk,
  Package,
  Pill,
  Refrigerator,
  Salad,
  Shirt,
  ShoppingBasket,
  Snowflake,
  Sparkles,
  Utensils,
  WashingMachine,
  Wheat,
} from "lucide-react";

/**
 * Curated set of lucide-react icons offered when picking a category/storage
 * location icon. Keep this list small so the picker stays scannable — add
 * more only if there's a clear household-inventory use case.
 */
export const MASTER_DATA_ICON_NAMES = [
  "Refrigerator",
  "Snowflake",
  "Archive",
  "Box",
  "Package",
  "ShoppingBasket",
  "Utensils",
  "Coffee",
  "Milk",
  "Egg",
  "Apple",
  "Carrot",
  "Beef",
  "Fish",
  "Wheat",
  "Cookie",
  "IceCreamCone",
  "Martini",
  "Salad",
  "Pill",
  "Shirt",
  "WashingMachine",
  "Sparkles",
] as const;

type MasterDataIconName = (typeof MASTER_DATA_ICON_NAMES)[number];

const ICON_COMPONENTS: Record<MasterDataIconName, LucideIcon> = {
  Refrigerator,
  Snowflake,
  Archive,
  Box,
  Package,
  ShoppingBasket,
  Utensils,
  Coffee,
  Milk,
  Egg,
  Apple,
  Carrot,
  Beef,
  Fish,
  Wheat,
  Cookie,
  IceCreamCone,
  Martini,
  Salad,
  Pill,
  Shirt,
  WashingMachine,
  Sparkles,
};

const isMasterDataIconName = (name: string): name is MasterDataIconName =>
  Object.hasOwn(ICON_COMPONENTS, name);

/** Resolves a stored icon name to its lucide-react component, or null if the
 *  name is empty/unknown (e.g. an icon removed from the curated list). */
export const getMasterDataIcon = (name?: string | null): LucideIcon | null => {
  if (!name) return null;
  return isMasterDataIconName(name) ? ICON_COMPONENTS[name] : null;
};
