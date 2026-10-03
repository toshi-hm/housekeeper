import { describe, expect, test } from "bun:test";

import { getHouseholdDestinationPath } from "./householdStoragePaths";

const row = {
  id: "item-1",
  user_id: "user-1",
  household_id: "household-1",
};

describe("getHouseholdDestinationPath", () => {
  test("user pathをhousehold pathに変換する", () => {
    expect(
      getHouseholdDestinationPath({ ...row, image_path: "user-1/item-1.webp" }, "image_path"),
    ).toBe("household-1/item-1.webp");
  });

  test("user prefixやentity IDが一致しないpathを拒否する", () => {
    expect(
      getHouseholdDestinationPath({ ...row, photo_path: "other-user/item-1.jpg" }, "photo_path"),
    ).toBeNull();
    expect(
      getHouseholdDestinationPath({ ...row, photo_path: "user-1/other-item.jpg" }, "photo_path"),
    ).toBeNull();
  });

  test("nested pathと参照なしを移行対象にしない", () => {
    expect(
      getHouseholdDestinationPath(
        { ...row, image_path: "user-1/item-1/original.jpg" },
        "image_path",
      ),
    ).toBeNull();
    expect(getHouseholdDestinationPath({ ...row, image_path: null }, "image_path")).toBeNull();
  });
});
