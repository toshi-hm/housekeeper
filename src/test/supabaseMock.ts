/**
 * bun:test 用の Supabase クライアントモック。
 *
 * 使い方:
 * ```ts
 * const sb = createSupabaseMock();
 * mock.module("@/lib/supabase", () => ({ supabase: sb.supabase }));
 * const { useItems } = await import("@/hooks/useItems");
 * sb.enqueue("items", { data: [item] });
 * ```
 *
 * `from(table)` へのクエリはテーブルごとの FIFO キュー (`enqueue`) から
 * 応答を返す。キューが空の場合は `{ data: null, error: null, count: 0 }`。
 */

export interface MockQueryResponse {
  data?: unknown;
  error?: { message: string; code?: string } | null;
  count?: number | null;
}

interface RecordedOp {
  method: string;
  args: unknown[];
}

interface RecordedQuery {
  table: string;
  ops: RecordedOp[];
}

interface MockQueryBuilder extends PromiseLike<MockQueryResponse> {
  select: (...args: unknown[]) => MockQueryBuilder;
  insert: (...args: unknown[]) => MockQueryBuilder;
  update: (...args: unknown[]) => MockQueryBuilder;
  delete: (...args: unknown[]) => MockQueryBuilder;
  upsert: (...args: unknown[]) => MockQueryBuilder;
  eq: (...args: unknown[]) => MockQueryBuilder;
  neq: (...args: unknown[]) => MockQueryBuilder;
  not: (...args: unknown[]) => MockQueryBuilder;
  is: (...args: unknown[]) => MockQueryBuilder;
  in: (...args: unknown[]) => MockQueryBuilder;
  lte: (...args: unknown[]) => MockQueryBuilder;
  gte: (...args: unknown[]) => MockQueryBuilder;
  gt: (...args: unknown[]) => MockQueryBuilder;
  lt: (...args: unknown[]) => MockQueryBuilder;
  or: (...args: unknown[]) => MockQueryBuilder;
  order: (...args: unknown[]) => MockQueryBuilder;
  limit: (...args: unknown[]) => MockQueryBuilder;
  range: (...args: unknown[]) => MockQueryBuilder;
  single: () => Promise<MockQueryResponse>;
  maybeSingle: () => Promise<MockQueryResponse>;
}

interface StorageCall {
  bucket: string;
  method: string;
  args: unknown[];
}

interface InvokeResponse {
  data: unknown;
  error: { message: string } | null;
}

export const createSupabaseMock = () => {
  const queues = new Map<string, MockQueryResponse[]>();
  const queries: RecordedQuery[] = [];
  const storageCalls: StorageCall[] = [];
  const invokeCalls: Array<{ name: string; body: unknown }> = [];
  const channelHandlers: Array<() => void> = [];
  const channelNames: string[] = [];

  let user: { id: string } | null = { id: "user-1" };
  let userError: { message: string } | null = null;
  let invokeResponse: InvokeResponse = { data: null, error: null };
  let invokeRejection: unknown = null;
  let signedUrlResponse: {
    data: { signedUrl: string } | null;
    error: { message: string } | null;
  } = { data: { signedUrl: "https://signed.example/url" }, error: null };
  let uploadResponse: { error: { message: string } | null } = { error: null };
  let removeResponse: { error: { message: string } | null } = { error: null };
  let removeChannelCount = 0;

  const enqueue = (table: string, ...responses: MockQueryResponse[]) => {
    const queue = queues.get(table) ?? [];
    queue.push(...responses);
    queues.set(table, queue);
  };

  const nextResponse = (table: string): MockQueryResponse => {
    const queue = queues.get(table);
    const response = queue && queue.length > 0 ? queue.shift() : undefined;
    return response ?? { data: null, error: null, count: 0 };
  };

  const makeBuilder = (table: string): MockQueryBuilder => {
    const record: RecordedQuery = { table, ops: [] };
    queries.push(record);

    // builder 自身を返すチェーンメソッド用 (定義前参照を避けるため Object.assign で構築)
    const builder = {} as MockQueryBuilder;
    const track = (method: string, args: unknown[]): MockQueryBuilder => {
      record.ops.push({ method, args });
      return builder;
    };
    const resolve = (method: string): Promise<MockQueryResponse> => {
      record.ops.push({ method, args: [] });
      return Promise.resolve(nextResponse(table));
    };

    Object.assign(builder, {
      select: (...args) => track("select", args),
      insert: (...args) => track("insert", args),
      update: (...args) => track("update", args),
      delete: (...args) => track("delete", args),
      upsert: (...args) => track("upsert", args),
      eq: (...args) => track("eq", args),
      neq: (...args) => track("neq", args),
      not: (...args) => track("not", args),
      is: (...args) => track("is", args),
      in: (...args) => track("in", args),
      lte: (...args) => track("lte", args),
      gte: (...args) => track("gte", args),
      gt: (...args) => track("gt", args),
      lt: (...args) => track("lt", args),
      or: (...args) => track("or", args),
      order: (...args) => track("order", args),
      limit: (...args) => track("limit", args),
      range: (...args) => track("range", args),
      single: () => resolve("single"),
      maybeSingle: () => resolve("maybeSingle"),
      then: (onFulfilled, onRejected) => {
        record.ops.push({ method: "await", args: [] });
        return Promise.resolve(nextResponse(table)).then(onFulfilled, onRejected);
      },
    } satisfies MockQueryBuilder);
    return builder;
  };

  const makeStorageBucket = (bucket: string) => ({
    createSignedUrl: (...args: unknown[]) => {
      storageCalls.push({ bucket, method: "createSignedUrl", args });
      return Promise.resolve(signedUrlResponse);
    },
    upload: (...args: unknown[]) => {
      storageCalls.push({ bucket, method: "upload", args });
      return Promise.resolve(uploadResponse);
    },
    remove: (...args: unknown[]) => {
      storageCalls.push({ bucket, method: "remove", args });
      return Promise.resolve(removeResponse);
    },
  });

  const channelObj = {
    on: (_event: string, _filter: unknown, callback: () => void) => {
      channelHandlers.push(callback);
      return channelObj;
    },
    subscribe: () => channelObj,
  };

  const supabase = {
    from: (table: string) => makeBuilder(table),
    auth: {
      getUser: () => Promise.resolve({ data: { user }, error: userError }),
    },
    functions: {
      invoke: (name: string, options?: { body?: unknown }) => {
        invokeCalls.push({ name, body: options?.body });
        if (invokeRejection !== null) return Promise.reject(invokeRejection);
        return Promise.resolve(invokeResponse);
      },
    },
    storage: {
      from: (bucket: string) => makeStorageBucket(bucket),
    },
    channel: (name: string) => {
      channelNames.push(name);
      return channelObj;
    },
    removeChannel: () => {
      removeChannelCount += 1;
      return Promise.resolve("ok");
    },
  };

  return {
    supabase,
    enqueue,
    queries,
    storageCalls,
    invokeCalls,
    channelHandlers,
    channelNames,
    /** 指定テーブルへのクエリ (発行順) を返す */
    queriesFor: (table: string) => queries.filter((q) => q.table === table),
    setUser: (nextUser: { id: string } | null) => {
      user = nextUser;
    },
    setUserError: (error: { message: string } | null) => {
      userError = error;
    },
    setInvokeResponse: (response: InvokeResponse) => {
      invokeResponse = response;
    },
    setInvokeRejection: (rejection: unknown) => {
      invokeRejection = rejection;
    },
    setSignedUrlResponse: (response: typeof signedUrlResponse) => {
      signedUrlResponse = response;
    },
    setUploadResponse: (response: typeof uploadResponse) => {
      uploadResponse = response;
    },
    setRemoveResponse: (response: typeof removeResponse) => {
      removeResponse = response;
    },
    getRemoveChannelCount: () => removeChannelCount,
    reset: () => {
      queues.clear();
      queries.length = 0;
      storageCalls.length = 0;
      invokeCalls.length = 0;
      channelHandlers.length = 0;
      channelNames.length = 0;
      user = { id: "user-1" };
      userError = null;
      invokeResponse = { data: null, error: null };
      invokeRejection = null;
      signedUrlResponse = { data: { signedUrl: "https://signed.example/url" }, error: null };
      uploadResponse = { error: null };
      removeResponse = { error: null };
      removeChannelCount = 0;
    },
  };
};

/** navigator.onLine を強制的に上書きする (happy-dom 用) */
export const setNavigatorOnline = (online: boolean) => {
  Object.defineProperty(globalThis.navigator, "onLine", {
    value: online,
    configurable: true,
  });
};
