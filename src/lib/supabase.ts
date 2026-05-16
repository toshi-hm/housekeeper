import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

if (!supabaseUrl || !supabasePublishableKey) {
  throw new Error(
    "Missing required environment variables: VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY must be set.",
  );
}

export interface Database {
  public: {
    Tables: {
      categories: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          color: string | null;
          icon: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          color?: string | null;
          icon?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          color?: string | null;
          icon?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      storage_locations: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          icon: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          icon?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          icon?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      items: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          barcode: string | null;
          category_id: string | null;
          storage_location_id: string | null;
          units: number;
          content_amount: number;
          content_unit: string;
          opened_remaining: number | null;
          purchase_date: string | null;
          expiry_date: string | null;
          notes: string | null;
          image_path: string | null;
          deleted_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          barcode?: string | null;
          category_id?: string | null;
          storage_location_id?: string | null;
          units?: number;
          content_amount?: number;
          content_unit?: string;
          opened_remaining?: number | null;
          purchase_date?: string | null;
          expiry_date?: string | null;
          notes?: string | null;
          image_path?: string | null;
          deleted_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          barcode?: string | null;
          category_id?: string | null;
          storage_location_id?: string | null;
          units?: number;
          content_amount?: number;
          content_unit?: string;
          opened_remaining?: number | null;
          purchase_date?: string | null;
          expiry_date?: string | null;
          notes?: string | null;
          image_path?: string | null;
          deleted_at?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "items_category_id_fkey";
            columns: ["category_id"];
            referencedRelation: "categories";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "items_storage_location_id_fkey";
            columns: ["storage_location_id"];
            referencedRelation: "storage_locations";
            referencedColumns: ["id"];
          },
        ];
      };
      consumption_logs: {
        Row: {
          id: string;
          user_id: string;
          item_id: string;
          delta_amount: number;
          delta_unit: string;
          units_before: number;
          units_after: number;
          opened_remaining_before: number | null;
          opened_remaining_after: number | null;
          occurred_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          item_id: string;
          delta_amount: number;
          delta_unit: string;
          units_before: number;
          units_after: number;
          opened_remaining_before?: number | null;
          opened_remaining_after?: number | null;
          occurred_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          item_id?: string;
          delta_amount?: number;
          delta_unit?: string;
          units_before?: number;
          units_after?: number;
          opened_remaining_before?: number | null;
          opened_remaining_after?: number | null;
          occurred_at?: string;
        };
        Relationships: [];
      };
      user_settings: {
        Row: {
          user_id: string;
          language: "ja" | "en";
          expiry_warning_days: number;
          default_unit: string;
          notify_at: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          language?: "ja" | "en";
          expiry_warning_days?: number;
          default_unit?: string;
          notify_at?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          user_id?: string;
          language?: "ja" | "en";
          expiry_warning_days?: number;
          default_unit?: string;
          notify_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      notification_preferences: {
        Row: {
          user_id: string;
          push_enabled: boolean;
          email_enabled: boolean;
          email_address: string | null;
          threshold_days: number;
          notify_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          push_enabled?: boolean;
          email_enabled?: boolean;
          email_address?: string | null;
          threshold_days?: number;
          notify_at?: string;
          updated_at?: string;
        };
        Update: {
          user_id?: string;
          push_enabled?: boolean;
          email_enabled?: boolean;
          email_address?: string | null;
          threshold_days?: number;
          notify_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      push_subscriptions: {
        Row: {
          id: string;
          user_id: string;
          endpoint: string;
          p256dh: string;
          auth: string;
          user_agent: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          endpoint: string;
          p256dh: string;
          auth: string;
          user_agent?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          endpoint?: string;
          p256dh?: string;
          auth?: string;
          user_agent?: string | null;
        };
        Relationships: [];
      };
      user_security_questions: {
        Row: {
          user_id: string;
          email: string;
          question: string;
          answer_hash: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          email: string;
          question: string;
          answer_hash: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          user_id?: string;
          email?: string;
          question?: string;
          answer_hash?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      item_lots: {
        Row: {
          id: string;
          user_id: string;
          item_id: string;
          units: number;
          opened_remaining: number | null;
          purchase_date: string | null;
          expiry_date: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          item_id: string;
          units?: number;
          opened_remaining?: number | null;
          purchase_date?: string | null;
          expiry_date?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          item_id?: string;
          units?: number;
          opened_remaining?: number | null;
          purchase_date?: string | null;
          expiry_date?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "item_lots_item_id_fkey";
            columns: ["item_id"];
            referencedRelation: "items";
            referencedColumns: ["id"];
          },
        ];
      };
      shopping_list_items: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          desired_units: number;
          note: string | null;
          linked_item_id: string | null;
          status: "planned" | "purchased";
          purchased_at: string | null;
          created_item_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          desired_units?: number;
          note?: string | null;
          linked_item_id?: string | null;
          status?: "planned" | "purchased";
          purchased_at?: string | null;
          created_item_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          desired_units?: number;
          note?: string | null;
          linked_item_id?: string | null;
          status?: "planned" | "purchased";
          purchased_at?: string | null;
          created_item_id?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}

export const supabase = createClient<Database>(supabaseUrl, supabasePublishableKey);
