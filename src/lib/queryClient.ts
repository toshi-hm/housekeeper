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
      networkMode: "online",
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
