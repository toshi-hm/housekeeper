import { describe, expect, test } from "bun:test";

import {
  BACKUP_EXPORT_REMINDER_DAYS,
  computeConsumption,
  DEFAULT_EXPIRY_WARNING_DAYS,
  DEFAULT_STOCKTAKE_ALERT_DAYS,
  dropExpiryForDailyGoods,
  formatRemaining,
  getExpiryApprox,
  getExpirySeverity,
  getExpiryStatus,
  getLotRemainingAmount,
  isAlreadyInStock,
  isBackupExportOverdue,
  isItemUnverified,
  isOpenedAlertDue,
  itemFormSchema,
  itemLotSchema,
  resolveItemType,
  resolveOpenedAlertThresholdDays,
  roundFloat,
  STOCKTAKE_NEW_ITEM_GRACE_DAYS,
  targetsExistingItem,
} from "./item";

// --- itemFormSchema ---

describe("itemFormSchema", () => {
  const validForm = {
    name: "テスト商品",
    units: 1,
    content_amount: 1,
    content_unit: "個",
  };

  test("valid form parses correctly", () => {
    const result = itemFormSchema.safeParse(validForm);
    expect(result.success).toBe(true);
  });

  test("units=1 is valid", () => {
    const result = itemFormSchema.safeParse({ ...validForm, units: 1 });
    expect(result.success).toBe(true);
  });

  test("units=0 fails", () => {
    const result = itemFormSchema.safeParse({ ...validForm, units: 0 });
    expect(result.success).toBe(false);
  });

  test("units=-1 fails", () => {
    const result = itemFormSchema.safeParse({ ...validForm, units: -1 });
    expect(result.success).toBe(false);
  });

  test("units=2 is valid", () => {
    const result = itemFormSchema.safeParse({ ...validForm, units: 2 });
    expect(result.success).toBe(true);
  });

  test("empty name fails", () => {
    const result = itemFormSchema.safeParse({ ...validForm, name: "" });
    expect(result.success).toBe(false);
  });
});

// --- itemLotSchema ---

describe("itemLotSchema", () => {
  // Zod v4 requires version nibble [1-8] and variant nibble [89abAB]
  const validLot = {
    id: "00000000-0000-4000-8000-000000000001",
    user_id: "00000000-0000-4000-8000-000000000002",
    item_id: "00000000-0000-4000-8000-000000000003",
    units: 2,
    opened_remaining: null,
    purchase_date: null,
    expiry_date: "2099-12-31",
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
  };

  test("valid lot parses correctly", () => {
    const result = itemLotSchema.safeParse(validLot);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.units).toBe(2);
      expect(result.data.opened_remaining).toBeNull();
    }
  });

  test("units=0 is allowed", () => {
    const result = itemLotSchema.safeParse({ ...validLot, units: 0 });
    expect(result.success).toBe(true);
  });

  test("negative units fail", () => {
    const result = itemLotSchema.safeParse({ ...validLot, units: -1 });
    expect(result.success).toBe(false);
  });

  test("opened_remaining as number is valid", () => {
    const result = itemLotSchema.safeParse({ ...validLot, opened_remaining: 350 });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.opened_remaining).toBe(350);
  });

  test("negative opened_remaining fails", () => {
    const result = itemLotSchema.safeParse({ ...validLot, opened_remaining: -1 });
    expect(result.success).toBe(false);
  });

  test("missing required fields fail", () => {
    const withoutId: Record<string, unknown> = { ...validLot };
    delete withoutId["id"];
    const result = itemLotSchema.safeParse(withoutId);
    expect(result.success).toBe(false);
  });
});

// --- formatRemaining ---

describe("formatRemaining", () => {
  test("all sealed: units × content_amount", () => {
    expect(formatRemaining(3, 1000, null)).toBe("3000");
  });

  test("one opened unit: (units-1) × amount + opened_remaining", () => {
    expect(formatRemaining(3, 1000, 350)).toBe("2350");
  });

  test("single unit fully sealed", () => {
    expect(formatRemaining(1, 500, null)).toBe("500");
  });

  test("single unit opened", () => {
    expect(formatRemaining(1, 500, 200)).toBe("200");
  });

  test("count unit (個) with content_amount=1", () => {
    expect(formatRemaining(5, 1, null)).toBe("5");
  });

  test("decimal content_amount strips trailing zeros", () => {
    // 2 × 1.5 = 3.0 → "3"
    expect(formatRemaining(2, 1.5, null)).toBe("3");
  });

  test("decimal result keeps significant digits", () => {
    // 1 × 1.5 opened=0.75 → (0 × 1.5) + 0.75 = 0.75
    expect(formatRemaining(1, 1.5, 0.75)).toBe("0.75");
  });
});

// --- getLotRemainingAmount ---

describe("getLotRemainingAmount", () => {
  test("all sealed: units × content_amount", () => {
    expect(getLotRemainingAmount(3, 1000, null)).toBe(3000);
  });

  test("one opened unit: (units-1) × amount + opened_remaining", () => {
    expect(getLotRemainingAmount(3, 1000, 350)).toBe(2350);
  });

  test("units=0 and opened_remaining=null => 0 (fully depleted)", () => {
    expect(getLotRemainingAmount(0, 500, null)).toBe(0);
  });

  test("units=1 and opened_remaining=0 => 0 (opened package used up)", () => {
    expect(getLotRemainingAmount(1, 500, 0)).toBe(0);
  });

  test("units=2 and opened_remaining=0 => remaining sealed unit still counts", () => {
    expect(getLotRemainingAmount(2, 500, 0)).toBe(500);
  });
});

// --- getExpiryStatus ---

describe("getExpiryStatus", () => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const fmt = (d: Date) => d.toISOString().split("T")[0] as string;
  const addDays = (n: number) => {
    const d = new Date(today);
    d.setDate(d.getDate() + n);
    return d;
  };

  test("null => unknown", () => {
    expect(getExpiryStatus(null)).toBe("unknown");
    expect(getExpiryStatus(undefined)).toBe("unknown");
  });

  test("past date => expired", () => {
    expect(getExpiryStatus(fmt(addDays(-1)))).toBe("expired");
    expect(getExpiryStatus("2000-01-01")).toBe("expired");
  });

  test("today => expiring-soon (within warning days)", () => {
    expect(getExpiryStatus(fmt(today))).toBe("expiring-soon");
  });

  test("within warning days => expiring-soon", () => {
    expect(getExpiryStatus(fmt(addDays(DEFAULT_EXPIRY_WARNING_DAYS)))).toBe("expiring-soon");
    expect(getExpiryStatus(fmt(addDays(1)))).toBe("expiring-soon");
  });

  test("beyond warning days => ok", () => {
    expect(getExpiryStatus(fmt(addDays(DEFAULT_EXPIRY_WARNING_DAYS + 1)))).toBe("ok");
    expect(getExpiryStatus("2099-12-31")).toBe("ok");
  });

  test("custom warningDays", () => {
    expect(getExpiryStatus(fmt(addDays(5)), 7)).toBe("expiring-soon");
    expect(getExpiryStatus(fmt(addDays(8)), 7)).toBe("ok");
  });
});

// --- getExpirySeverity (#714) ---

describe("getExpirySeverity", () => {
  test("expired + use_by => danger", () => {
    expect(getExpirySeverity("expired", "use_by")).toBe("danger");
  });

  test("expired + best_before => caution (softer, not a safety issue)", () => {
    expect(getExpirySeverity("expired", "best_before")).toBe("caution");
  });

  test("expired + null/undefined (no distinction) => danger (preserves existing behavior)", () => {
    expect(getExpirySeverity("expired", null)).toBe("danger");
    expect(getExpirySeverity("expired", undefined)).toBe("danger");
    expect(getExpirySeverity("expired")).toBe("danger");
  });

  test("expiring-soon is always warning regardless of expiry_type", () => {
    expect(getExpirySeverity("expiring-soon", "use_by")).toBe("warning");
    expect(getExpirySeverity("expiring-soon", "best_before")).toBe("warning");
    expect(getExpirySeverity("expiring-soon", null)).toBe("warning");
  });

  test("ok and unknown pass through unchanged", () => {
    expect(getExpirySeverity("ok", "best_before")).toBe("ok");
    expect(getExpirySeverity("unknown", "use_by")).toBe("unknown");
  });
});

// --- roundFloat ---

describe("roundFloat", () => {
  test("removes native floating-point noise", () => {
    expect(0.1 * 3).not.toBe(0.3);
    expect(roundFloat(0.1 * 3)).toBe(0.3);
  });

  test("leaves already-precise values unchanged", () => {
    expect(roundFloat(1.5)).toBe(1.5);
    expect(roundFloat(0)).toBe(0);
  });
});

// --- resolveOpenedAlertThresholdDays / isOpenedAlertDue (#752) ---

describe("resolveItemType", () => {
  test("アイテム個別の上書きがカテゴリ既定より優先される", () => {
    expect(resolveItemType({ item_type: "daily_goods" }, { kind: "food" })).toBe("daily_goods");
    expect(resolveItemType({ item_type: "food" }, { kind: "daily_goods" })).toBe("food");
  });

  test("アイテム個別が未設定ならカテゴリ既定に従う", () => {
    expect(resolveItemType({ item_type: null }, { kind: "daily_goods" })).toBe("daily_goods");
    expect(resolveItemType({}, { kind: "daily_goods" })).toBe("daily_goods");
  });

  test("カテゴリ未設定・カテゴリのkind未設定なら食料品にフォールバックする（既存データ互換）", () => {
    expect(resolveItemType({ item_type: null }, null)).toBe("food");
    expect(resolveItemType({ item_type: null })).toBe("food");
    expect(resolveItemType({ item_type: null }, {})).toBe("food");
  });
});

describe("dropExpiryForDailyGoods (#937)", () => {
  test("実効種別が日用品のアイテムはexpiry_date/expiry_typeをnullに落とす", () => {
    const items = [
      {
        item_type: null,
        category_id: "cat-goods",
        expiry_date: "2026-01-01",
        expiry_type: "best_before" as const,
      },
    ];
    const result = dropExpiryForDailyGoods(items, { "cat-goods": { kind: "daily_goods" } });
    expect(result[0]!.expiry_date).toBeNull();
    expect(result[0]!.expiry_type).toBeNull();
  });

  test("実効種別が食料品のアイテムはexpiry_date/expiry_typeをそのまま保つ", () => {
    const items = [
      {
        item_type: null,
        category_id: "cat-food",
        expiry_date: "2026-01-01",
        expiry_type: "use_by" as const,
      },
    ];
    const result = dropExpiryForDailyGoods(items, { "cat-food": { kind: "food" } });
    expect(result[0]!.expiry_date).toBe("2026-01-01");
    expect(result[0]!.expiry_type).toBe("use_by");
  });

  test("アイテム個別のitem_typeがカテゴリより優先される", () => {
    const items = [
      {
        item_type: "daily_goods" as const,
        category_id: "cat-food",
        expiry_date: "2026-01-01",
        expiry_type: null,
      },
    ];
    const result = dropExpiryForDailyGoods(items, { "cat-food": { kind: "food" } });
    expect(result[0]!.expiry_date).toBeNull();
  });

  test("expiry_date/expiry_typeが両方とも無いアイテムはそのまま返す（不要な複製を避ける）", () => {
    const items = [
      { item_type: null, category_id: "cat-goods", expiry_date: null, expiry_type: null },
    ];
    const result = dropExpiryForDailyGoods(items, { "cat-goods": { kind: "daily_goods" } });
    expect(result[0]).toBe(items[0]);
  });
});

describe("resolveOpenedAlertThresholdDays", () => {
  test("item-level override takes precedence over the category default", () => {
    expect(
      resolveOpenedAlertThresholdDays(
        { days_use_after_opening: 5 },
        { days_use_after_opening: 30 },
      ),
    ).toBe(5);
  });

  test("falls back to the category default when the item has none set", () => {
    expect(
      resolveOpenedAlertThresholdDays(
        { days_use_after_opening: null },
        { days_use_after_opening: 14 },
      ),
    ).toBe(14);
  });

  test("returns null when neither item nor category has a value", () => {
    expect(
      resolveOpenedAlertThresholdDays(
        { days_use_after_opening: null },
        { days_use_after_opening: null },
      ),
    ).toBeNull();
    expect(resolveOpenedAlertThresholdDays({ days_use_after_opening: null }, null)).toBeNull();
    expect(resolveOpenedAlertThresholdDays({ days_use_after_opening: null })).toBeNull();
  });
});

describe("isOpenedAlertDue", () => {
  const daysAgo = (days: number) => new Date(Date.now() - days * 86400000).toISOString();

  test("false when never opened", () => {
    expect(isOpenedAlertDue(null, 7)).toBe(false);
    expect(isOpenedAlertDue(undefined, 7)).toBe(false);
  });

  test("false when no threshold is configured", () => {
    expect(isOpenedAlertDue(daysAgo(30), null)).toBe(false);
    expect(isOpenedAlertDue(daysAgo(30), undefined)).toBe(false);
  });

  test("false before the threshold has elapsed", () => {
    expect(isOpenedAlertDue(daysAgo(2), 7)).toBe(false);
  });

  test("true once the threshold has elapsed, inclusive of the exact day", () => {
    expect(isOpenedAlertDue(daysAgo(7), 7)).toBe(true);
    expect(isOpenedAlertDue(daysAgo(10), 7)).toBe(true);
  });

  test("false for an invalid opened_at string", () => {
    expect(isOpenedAlertDue("not-a-date", 7)).toBe(false);
  });
});

// --- computeConsumption ---

describe("computeConsumption", () => {
  const baseItem = {
    units: 3,
    content_amount: 500,
    content_unit: "mL",
    opened_remaining: null,
  };

  test("unopened: consume less than one unit", () => {
    const r = computeConsumption(baseItem, 200);
    expect(r.units_after).toBe(3);
    expect(r.opened_remaining_after).toBe(300);
    expect(r.error).toBeUndefined();
  });

  test("unopened: consume exactly one unit", () => {
    const r = computeConsumption(baseItem, 500);
    expect(r.units_after).toBe(2);
    expect(r.opened_remaining_after).toBeNull();
  });

  test("opened: consume less than remaining", () => {
    const r = computeConsumption({ ...baseItem, opened_remaining: 300 }, 100);
    expect(r.units_after).toBe(3);
    expect(r.opened_remaining_after).toBe(200);
  });

  test("opened: consume across unit boundary", () => {
    const r = computeConsumption({ ...baseItem, opened_remaining: 100 }, 200);
    expect(r.units_after).toBe(2);
    expect(r.opened_remaining_after).toBe(400);
  });

  test("consume more than total stock => error with null opened_remaining_after", () => {
    const r = computeConsumption({ ...baseItem, units: 1, opened_remaining: 200 }, 800);
    expect(r.error).toBeDefined();
    expect(r.units_after).toBe(0);
    expect(r.opened_remaining_after).toBeNull();
  });

  test("units=0 consume => error with null opened_remaining_after", () => {
    const r = computeConsumption({ ...baseItem, units: 0, opened_remaining: 0 }, 1);
    expect(r.error).toBeDefined();
    expect(r.opened_remaining_after).toBeNull();
  });

  test("consume exact total (single unit, full)", () => {
    const r = computeConsumption({ ...baseItem, units: 1, opened_remaining: null }, 500);
    expect(r.units_after).toBe(0);
    expect(r.opened_remaining_after).toBeNull();
  });

  test("consuming across multiple units with remainder=0", () => {
    // units=5, opened=100, consume 1100: 100 + 500 + 500 = 1100, uses 3 slots
    const r = computeConsumption({ ...baseItem, units: 5, opened_remaining: 100 }, 1100);
    expect(r.units_after).toBe(2);
    expect(r.opened_remaining_after).toBeNull();
    expect(r.error).toBeUndefined();
  });

  test("opened: consume more than opened with no sealed units left => error with null opened_remaining_after", () => {
    // units=1 (the open unit), opened=200, delta=300: only 200 available, not 800
    const r = computeConsumption({ ...baseItem, units: 1, opened_remaining: 200 }, 300);
    expect(r.error).toBeDefined();
    expect(r.opened_remaining_after).toBeNull();
  });

  test("floating-point noise does not block consuming the full remaining amount (#910)", () => {
    // units=3, content_amount=0.29, opened_remaining=0.29 =>
    // totalBefore = (3-1)*0.29 + 0.29 = 0.8699999999999999 in raw JS float math,
    // while the UI rounds the displayed total to 0.87 and feeds that back as delta.
    const item = { ...baseItem, content_amount: 0.29, units: 3, opened_remaining: 0.29 };
    const r = computeConsumption(item, 0.87);
    expect(r.error).toBeUndefined();
    expect(r.units_after).toBe(0);
    expect(r.opened_remaining_after).toBeNull();
  });
});

// --- isItemUnverified (#375) ---

describe("isItemUnverified", () => {
  const now = new Date("2026-07-20T00:00:00Z");
  const daysAgo = (n: number) => new Date(now.getTime() - n * 24 * 60 * 60 * 1000).toISOString();

  describe("never verified (last_verified_at = null)", () => {
    test("created less than grace period ago => not unverified", () => {
      const item = {
        last_verified_at: null,
        created_at: daysAgo(STOCKTAKE_NEW_ITEM_GRACE_DAYS - 1),
      };
      expect(isItemUnverified(item, DEFAULT_STOCKTAKE_ALERT_DAYS, now)).toBe(false);
    });

    test("created exactly at grace period => unverified", () => {
      const item = { last_verified_at: null, created_at: daysAgo(STOCKTAKE_NEW_ITEM_GRACE_DAYS) };
      expect(isItemUnverified(item, DEFAULT_STOCKTAKE_ALERT_DAYS, now)).toBe(true);
    });

    test("created well beyond grace period => unverified", () => {
      const item = { last_verified_at: null, created_at: daysAgo(365) };
      expect(isItemUnverified(item, DEFAULT_STOCKTAKE_ALERT_DAYS, now)).toBe(true);
    });

    test("created just now => not unverified", () => {
      const item = { last_verified_at: null, created_at: now.toISOString() };
      expect(isItemUnverified(item, DEFAULT_STOCKTAKE_ALERT_DAYS, now)).toBe(false);
    });
  });

  describe("previously verified (last_verified_at set)", () => {
    test("verified less than alert threshold ago => not unverified", () => {
      const item = { last_verified_at: daysAgo(89), created_at: daysAgo(400) };
      expect(isItemUnverified(item, 90, now)).toBe(false);
    });

    test("verified exactly at alert threshold => unverified", () => {
      const item = { last_verified_at: daysAgo(90), created_at: daysAgo(400) };
      expect(isItemUnverified(item, 90, now)).toBe(true);
    });

    test("verified well beyond alert threshold => unverified", () => {
      const item = { last_verified_at: daysAgo(200), created_at: daysAgo(400) };
      expect(isItemUnverified(item, 90, now)).toBe(true);
    });

    test("verified just now => not unverified, even if created long ago", () => {
      const item = { last_verified_at: now.toISOString(), created_at: daysAgo(1000) };
      expect(isItemUnverified(item, 90, now)).toBe(false);
    });

    test("custom stocktakeAlertDays is respected", () => {
      const item = { last_verified_at: daysAgo(31), created_at: daysAgo(400) };
      expect(isItemUnverified(item, 30, now)).toBe(true);
      expect(isItemUnverified(item, 60, now)).toBe(false);
    });
  });

  test("defaults stocktakeAlertDays to DEFAULT_STOCKTAKE_ALERT_DAYS (90) when omitted", () => {
    const item = { last_verified_at: daysAgo(91), created_at: daysAgo(400) };
    expect(isItemUnverified(item, undefined, now)).toBe(true);
    const notYet = { last_verified_at: daysAgo(89), created_at: daysAgo(400) };
    expect(isItemUnverified(notYet, undefined, now)).toBe(false);
  });
});

// --- isBackupExportOverdue (#815) ---

describe("isBackupExportOverdue", () => {
  const now = new Date("2026-07-20T00:00:00Z");
  const daysAgo = (n: number) => new Date(now.getTime() - n * 24 * 60 * 60 * 1000).toISOString();

  describe("never exported (last_backup_export_at = null)", () => {
    test("account created less than reminder period ago => not overdue", () => {
      const settings = {
        last_backup_export_at: null,
        created_at: daysAgo(BACKUP_EXPORT_REMINDER_DAYS - 1),
      };
      expect(isBackupExportOverdue(settings, BACKUP_EXPORT_REMINDER_DAYS, now)).toBe(false);
    });

    test("account created exactly at reminder period => overdue", () => {
      const settings = {
        last_backup_export_at: null,
        created_at: daysAgo(BACKUP_EXPORT_REMINDER_DAYS),
      };
      expect(isBackupExportOverdue(settings, BACKUP_EXPORT_REMINDER_DAYS, now)).toBe(true);
    });

    test("account created well beyond reminder period => overdue", () => {
      const settings = { last_backup_export_at: null, created_at: daysAgo(365) };
      expect(isBackupExportOverdue(settings, BACKUP_EXPORT_REMINDER_DAYS, now)).toBe(true);
    });
  });

  describe("previously exported", () => {
    test("exported recently => not overdue even if account is old", () => {
      const settings = { last_backup_export_at: daysAgo(1), created_at: daysAgo(400) };
      expect(isBackupExportOverdue(settings, BACKUP_EXPORT_REMINDER_DAYS, now)).toBe(false);
    });

    test("exported beyond reminder period ago => overdue", () => {
      const settings = { last_backup_export_at: daysAgo(31), created_at: daysAgo(400) };
      expect(isBackupExportOverdue(settings, 30, now)).toBe(true);
    });

    test("custom reminderDays is respected", () => {
      const settings = { last_backup_export_at: daysAgo(31), created_at: daysAgo(400) };
      expect(isBackupExportOverdue(settings, 30, now)).toBe(true);
      expect(isBackupExportOverdue(settings, 60, now)).toBe(false);
    });
  });

  test("defaults reminderDays to BACKUP_EXPORT_REMINDER_DAYS (30) when omitted", () => {
    const settings = { last_backup_export_at: daysAgo(31), created_at: daysAgo(400) };
    expect(isBackupExportOverdue(settings, undefined, now)).toBe(true);
    const notYet = { last_backup_export_at: daysAgo(29), created_at: daysAgo(400) };
    expect(isBackupExportOverdue(notYet, undefined, now)).toBe(false);
  });
});

// --- isAlreadyInStock (#559) ---

describe("isAlreadyInStock", () => {
  test("units > 0 and no opened_remaining => in stock", () => {
    expect(isAlreadyInStock({ units: 2, opened_remaining: null })).toBe(true);
  });

  test("units > 0 with opened_remaining set => in stock", () => {
    expect(isAlreadyInStock({ units: 2, opened_remaining: 300 })).toBe(true);
  });

  test("units = 0 but opened_remaining > 0 => still in stock (opened package remains)", () => {
    expect(isAlreadyInStock({ units: 0, opened_remaining: 150 })).toBe(true);
  });

  test("units = 0 and opened_remaining = null => used up, not in stock", () => {
    expect(isAlreadyInStock({ units: 0, opened_remaining: null })).toBe(false);
  });

  test("units = 0 and opened_remaining = 0 => used up, not in stock", () => {
    expect(isAlreadyInStock({ units: 0, opened_remaining: 0 })).toBe(false);
  });

  test("units = 0 and opened_remaining undefined => treated as used up", () => {
    expect(isAlreadyInStock({ units: 0, opened_remaining: undefined })).toBe(false);
  });
});

// --- targetsExistingItem (#650) ---

describe("targetsExistingItem", () => {
  test("plain new item (no flags) => false", () => {
    expect(targetsExistingItem({})).toBe(false);
  });

  test("stacked onto an active item => true", () => {
    expect(targetsExistingItem({ _stacked: true })).toBe(true);
  });

  test("revived from soft-delete => true", () => {
    expect(targetsExistingItem({ _revived: true })).toBe(true);
  });

  test("explicitly false flags => false", () => {
    expect(targetsExistingItem({ _stacked: false, _revived: false })).toBe(false);
  });
});

// --- getExpiryApprox (#559) ---

describe("getExpiryApprox", () => {
  const now = new Date("2026-07-23T00:00:00");
  const fmt = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };
  const addDays = (n: number) => {
    const d = new Date(now);
    d.setDate(d.getDate() + n);
    return d;
  };

  test("a couple months out => month unit, ~2 months, future", () => {
    const result = getExpiryApprox(fmt(addDays(61)), now);
    expect(result.unit).toBe("month");
    expect(result.value).toBe(2);
    expect(result.isPast).toBe(false);
  });

  test("well within 60 days => day unit, future", () => {
    const result = getExpiryApprox(fmt(addDays(10)), now);
    expect(result.unit).toBe("day");
    expect(result.value).toBe(10);
    expect(result.isPast).toBe(false);
  });

  test("today => 0 days, not past", () => {
    const result = getExpiryApprox(fmt(now), now);
    expect(result.unit).toBe("day");
    expect(result.value).toBe(0);
    expect(result.isPast).toBe(false);
  });

  test("past date within 60 days => day unit, past", () => {
    const result = getExpiryApprox(fmt(addDays(-5)), now);
    expect(result.unit).toBe("day");
    expect(result.value).toBe(5);
    expect(result.isPast).toBe(true);
  });

  test("past date beyond 60 days => month unit, past", () => {
    const result = getExpiryApprox(fmt(addDays(-90)), now);
    expect(result.unit).toBe("month");
    expect(result.value).toBe(3);
    expect(result.isPast).toBe(true);
  });

  test("value is never rounded down to 0 months once in month territory", () => {
    const result = getExpiryApprox(fmt(addDays(60)), now);
    expect(result.unit).toBe("month");
    expect(result.value).toBeGreaterThanOrEqual(1);
  });
});
