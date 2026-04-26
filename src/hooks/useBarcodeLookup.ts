import { useState } from 'react'

export interface ProductInfo {
  name: string
  category?: string
  image_url?: string
}

export function useBarcodeLookup() {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function lookup(barcode: string): Promise<ProductInfo | null> {
    setIsLoading(true)
    setError(null)
    try {
      // Lookup via Open Food Facts API (public, no key needed)
      const response = await fetch(
        `https://world.openfoodfacts.org/api/v3/product/${encodeURIComponent(barcode)}.json`,
      )
      if (!response.ok) {
        return null
      }
      const json = (await response.json()) as {
        status: string
        product?: {
          product_name?: string
          categories_tags?: string[]
          image_url?: string
        }
      }
      if (json.status !== 'success' || !json.product) {
        return null
      }
      const product = json.product
      const category = product.categories_tags?.[0]?.replace(/^en:/, '') ?? undefined
      return {
        name: product.product_name ?? '',
        category,
        image_url: product.image_url ?? undefined,
      }
    } catch {
      setError('Failed to look up product')
      return null
    } finally {
      setIsLoading(false)
    }
  }

  return { lookup, isLoading, error }
}
