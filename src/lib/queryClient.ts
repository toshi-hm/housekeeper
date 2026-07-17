import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import { QueryClient } from "@tanstack/react-query";
import { createStore, del, get, set } from "idb-keyval";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      retry: 1,
      gcTime: 1000 * 60 * 60 * 24, // 24h — required for persistence
    },
    mutations: {
      // "online"（デフォルト）だとオフライン時に mutationFn が呼ばれず pause され、
      // 再接続時にユーザーの意図しないタイミングで実行されてしまう（#469）。
      // "always" にして requireOnline() が確実に呼ばれ、即座に「オフライン」トーストを
      // 出せるようにする（docs/specs/features/pwa.md: 編集オフラインキューイングは作らない）。
      networkMode: "always",
    },
  },
});

const idbStorage =
  typeof window !== "undefined"
    ? (() => {
        const idbStore = createStore("housekeeper", "query-cache");
        return {
          getItem: (key: string) => get<string>(key, idbStore),
          setItem: (key: string, value: string) => set(key, value, idbStore),
          removeItem: (key: string) => del(key, idbStore),
        };
      })()
    : undefined;

export const persister = createAsyncStoragePersister({
  storage: idbStorage,
  key: "housekeeper-query-cache",
});
