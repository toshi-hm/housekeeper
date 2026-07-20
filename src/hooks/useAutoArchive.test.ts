import { beforeEach, describe, expect, mock, test } from "bun:test";

interface RpcResponse {
  data: unknown;
  error: unknown;
}

const rpcMock = mock((name: string, args?: unknown): Promise<RpcResponse> => {
  void name;
  void args;
  return Promise.resolve({ data: null, error: null });
});

mock.module("@/lib/supabase", () => ({
  supabase: { rpc: rpcMock },
}));

const { autoArchiveExpiredItems, undoAutoArchive } = await import("./useAutoArchive");

beforeEach(() => {
  rpcMock.mockReset();
  Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
});

describe("autoArchiveExpiredItems", () => {
  test("returns the exact IDs and server archive marker from the atomic RPC", async () => {
    rpcMock.mockResolvedValue({
      data: [
        { id: "item-1", archived_at: "2026-07-20T11:00:00.000Z" },
        { id: "item-2", archived_at: "2026-07-20T11:00:00.000Z" },
      ],
      error: null,
    });

    await expect(autoArchiveExpiredItems()).resolves.toEqual({
      ids: ["item-1", "item-2"],
      archivedAt: "2026-07-20T11:00:00.000Z",
    });
    expect(rpcMock).toHaveBeenCalledWith("auto_archive_expired_items");
  });

  test("returns null when no row still satisfies the server-side conditions", async () => {
    rpcMock.mockResolvedValue({ data: [], error: null });
    await expect(autoArchiveExpiredItems()).resolves.toBeNull();
  });

  test("propagates an RPC error", async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: "failed" } });
    await expect(autoArchiveExpiredItems()).rejects.toMatchObject({ message: "failed" });
  });
});

describe("undoAutoArchive", () => {
  test("passes both IDs and the exact archive marker so later deletes are not restored", async () => {
    rpcMock.mockResolvedValue({ data: 2, error: null });
    const batch = {
      ids: ["item-1", "item-2"],
      archivedAt: "2026-07-20T11:00:00.000Z",
    };

    await expect(undoAutoArchive(batch)).resolves.toBe(2);
    expect(rpcMock).toHaveBeenCalledWith("undo_auto_archive", {
      p_item_ids: batch.ids,
      p_archived_at: batch.archivedAt,
    });
  });

  test("propagates an undo RPC error", async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: "undo failed" } });
    await expect(
      undoAutoArchive({ ids: ["item-1"], archivedAt: "2026-07-20T11:00:00.000Z" }),
    ).rejects.toMatchObject({ message: "undo failed" });
  });
});
