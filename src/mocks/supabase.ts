import { z } from "zod";

const barcodeLookupBodySchema = z.object({
  barcode: z.string().min(1),
});

interface MockProduct {
  name: string;
  category: string;
  image_url: string;
}

const mockProducts: Record<string, MockProduct> = {
  "4901234567890": {
    name: "Organic Milk",
    category: "Food",
    image_url: "https://images.unsplash.com/photo-1563636619-e9143da7973b",
  },
  "4901777285290": {
    name: "Green Tea",
    category: "Beverages",
    image_url: "https://images.unsplash.com/photo-1556679343-c7306c1976bc",
  },
};

interface MockSupabaseError {
  message: string;
}

interface MockInvokeResult<TResponse> {
  data: TResponse | null;
  error: MockSupabaseError | null;
}

interface BarcodeLookupResponse {
  product: {
    name: string;
    category: string | null;
    image_url: string | null;
  } | null;
}

const invokeMockFunction = async <TResponse = unknown>(
  functionName: string,
  options?: { body?: unknown },
): Promise<MockInvokeResult<TResponse>> => {
  if (functionName !== "barcode-lookup") {
    return {
      data: null,
      error: { message: `Mock function is not implemented: ${functionName}` },
    };
  }

  const parsedBody = barcodeLookupBodySchema.safeParse(options?.body);
  if (!parsedBody.success) {
    return {
      data: null,
      error: { message: "Mock barcode lookup requires a barcode." },
    };
  }

  const product = mockProducts[parsedBody.data.barcode] ?? null;
  const response: BarcodeLookupResponse = {
    product:
      product === null
        ? null
        : {
            name: product.name,
            category: product.category,
            image_url: product.image_url,
          },
  };

  return {
    data: response as TResponse,
    error: null,
  };
};

export const supabase = {
  functions: {
    invoke: invokeMockFunction,
  },
};
