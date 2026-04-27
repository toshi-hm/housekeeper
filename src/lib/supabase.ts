import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

export type Database = {
  public: {
    Tables: {
      items: {
        Row: {
          id: string
          user_id: string
          name: string
          barcode: string | null
          category: string | null
          quantity: number
          storage_location: string | null
          purchase_date: string | null
          expiry_date: string | null
          notes: string | null
          image_url: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          name: string
          barcode?: string | null
          category?: string | null
          quantity?: number
          storage_location?: string | null
          purchase_date?: string | null
          expiry_date?: string | null
          notes?: string | null
          image_url?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          name?: string
          barcode?: string | null
          category?: string | null
          quantity?: number
          storage_location?: string | null
          purchase_date?: string | null
          expiry_date?: string | null
          notes?: string | null
          image_url?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey)
