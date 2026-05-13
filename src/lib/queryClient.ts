import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import { QueryClient } from "@tanstack/react-query";
import { persistQueryClient } from "@tanstack/react-query-persist-client";
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

const idbStore = createStore("housekeeper", "query-cache");

const persister = createAsyncStoragePersister({
  storage:
    typeof window !== "undefined"
      ? {
          getItem: (key) => get(key, idbStore),
          setItem: (key, value) => set(key, value, idbStore),
          removeItem: (key) => del(key, idbStore),
        }
      : undefined,
  key: "housekeeper-query-cache",
});

persistQueryClient({
  queryClient,
  persister,
  maxAge: 1000 * 60 * 60 * 24, // 24 hours
});
