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
          /** 開封後使用推奨日数（既定値）。items.days_use_after_opening が
           *  未設定のアイテムはこの値にフォールバックする（#752）。 */
          days_use_after_opening: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          color?: string | null;
          icon?: string | null;
          days_use_after_opening?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          color?: string | null;
          icon?: string | null;
          days_use_after_opening?: number | null;
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
          photo_path: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          icon?: string | null;
          photo_path?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          icon?: string | null;
          photo_path?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      floor_plans: {
        Row: {
          id: string;
          user_id: string;
          storage_location_id: string;
          name: string;
          schema_version: number;
          document: unknown;
          revision: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          storage_location_id: string;
          name: string;
          schema_version?: number;
          document: unknown;
          revision?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          storage_location_id?: string;
          name?: string;
          schema_version?: number;
          document?: unknown;
          revision?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      floor_plan_item_placements: {
        Row: {
          id: string;
          user_id: string;
          floor_plan_id: string;
          item_id: string;
          object_id: string | null;
          x: number;
          y: number;
          z: number;
          rotation: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          floor_plan_id: string;
          item_id: string;
          object_id?: string | null;
          x: number;
          y: number;
          z?: number;
          rotation?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          floor_plan_id?: string;
          item_id?: string;
          object_id?: string | null;
          x?: number;
          y?: number;
          z?: number;
          rotation?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      custom_units: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
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
          minimum_stock: number | null;
          auto_reorder: boolean;
          reorder_threshold: number | null;
          last_verified_at: string | null;
          deleted_at: string | null;
          deletion_reason: "consumed" | "expired_waste" | "other" | null;
          expiry_type: "best_before" | "use_by" | null;
          pin_x: number | null;
          pin_y: number | null;
          /** item_lots からの集計値: 現在開封中のロットのうち最も古い開封日時
           *  （複数ロットが同時に開封中の場合は最古を採用）。未開封なら null（#752）。 */
          opened_at: string | null;
          /** 開封後使用推奨日数（個別上書き）。null = categories.days_use_after_opening
           *  にフォールバック（#752）。 */
          days_use_after_opening: number | null;
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
          minimum_stock?: number | null;
          auto_reorder?: boolean;
          reorder_threshold?: number | null;
          last_verified_at?: string | null;
          deleted_at?: string | null;
          deletion_reason?: "consumed" | "expired_waste" | "other" | null;
          expiry_type?: "best_before" | "use_by" | null;
          pin_x?: number | null;
          pin_y?: number | null;
          opened_at?: string | null;
          days_use_after_opening?: number | null;
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
          minimum_stock?: number | null;
          auto_reorder?: boolean;
          reorder_threshold?: number | null;
          last_verified_at?: string | null;
          deleted_at?: string | null;
          deletion_reason?: "consumed" | "expired_waste" | "other" | null;
          expiry_type?: "best_before" | "use_by" | null;
          pin_x?: number | null;
          pin_y?: number | null;
          opened_at?: string | null;
          days_use_after_opening?: number | null;
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
          note: string | null;
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
          note?: string | null;
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
          note?: string | null;
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
          auto_archive_after_days: number | null;
          low_stock_forecast_days: number;
          stocktake_alert_enabled: boolean;
          stocktake_alert_days: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          language?: "ja" | "en";
          expiry_warning_days?: number;
          default_unit?: string;
          notify_at?: string;
          auto_archive_after_days?: number | null;
          low_stock_forecast_days?: number;
          stocktake_alert_enabled?: boolean;
          stocktake_alert_days?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          user_id?: string;
          language?: "ja" | "en";
          expiry_warning_days?: number;
          default_unit?: string;
          notify_at?: string;
          auto_archive_after_days?: number | null;
          low_stock_forecast_days?: number;
          stocktake_alert_enabled?: boolean;
          stocktake_alert_days?: number;
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
          timezone: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          push_enabled?: boolean;
          email_enabled?: boolean;
          email_address?: string | null;
          threshold_days?: number;
          notify_at?: string;
          timezone?: string;
          updated_at?: string;
        };
        Update: {
          user_id?: string;
          push_enabled?: boolean;
          email_enabled?: boolean;
          email_address?: string | null;
          threshold_days?: number;
          notify_at?: string;
          timezone?: string;
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
          purchased_units: number;
          opened_remaining: number | null;
          unit_price: number | null;
          purchase_date: string | null;
          expiry_date: string | null;
          store_name: string | null;
          /** このロットが最初に開封された日時。トリガーが opened_remaining の
           *  null <-> 非null 遷移から自動的に設定/クリアする（#752）。 */
          opened_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          item_id: string;
          units?: number;
          purchased_units?: number;
          opened_remaining?: number | null;
          unit_price?: number | null;
          purchase_date?: string | null;
          expiry_date?: string | null;
          store_name?: string | null;
          opened_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          item_id?: string;
          units?: number;
          purchased_units?: number;
          opened_remaining?: number | null;
          unit_price?: number | null;
          purchase_date?: string | null;
          expiry_date?: string | null;
          store_name?: string | null;
          opened_at?: string | null;
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
          auto_added: boolean;
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
          auto_added?: boolean;
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
          auto_added?: boolean;
          status?: "planned" | "purchased";
          purchased_at?: string | null;
          created_item_id?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      shopping_list_templates: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      shopping_list_template_items: {
        Row: {
          id: string;
          template_id: string;
          user_id: string;
          name: string;
          desired_units: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          template_id: string;
          user_id: string;
          name: string;
          desired_units?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          template_id?: string;
          user_id?: string;
          name?: string;
          desired_units?: number;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "shopping_list_template_items_template_id_fkey";
            columns: ["template_id"];
            referencedRelation: "shopping_list_templates";
            referencedColumns: ["id"];
          },
        ];
      };
      shopping_list_archive: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          desired_units: number;
          note: string | null;
          archived_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          desired_units?: number;
          note?: string | null;
          archived_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          desired_units?: number;
          note?: string | null;
          archived_at?: string;
        };
        Relationships: [];
      };
      item_tags: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          color: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          color?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          color?: string | null;
        };
        Relationships: [];
      };
      items_to_tags: {
        Row: {
          item_id: string;
          tag_id: string;
          user_id: string;
        };
        Insert: {
          item_id: string;
          tag_id: string;
          user_id: string;
        };
        Update: {
          item_id?: string;
          tag_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "items_to_tags_item_id_fkey";
            columns: ["item_id"];
            referencedRelation: "items";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "items_to_tags_tag_id_fkey";
            columns: ["tag_id"];
            referencedRelation: "item_tags";
            referencedColumns: ["id"];
          },
        ];
      };
      recipes: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      recipe_items: {
        Row: {
          id: string;
          recipe_id: string;
          item_id: string;
          amount: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          recipe_id: string;
          item_id: string;
          amount: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          recipe_id?: string;
          item_id?: string;
          amount?: number;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "recipe_items_recipe_id_fkey";
            columns: ["recipe_id"];
            referencedRelation: "recipes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "recipe_items_item_id_fkey";
            columns: ["item_id"];
            referencedRelation: "items";
            referencedColumns: ["id"];
          },
        ];
      };
      meal_plans: {
        Row: {
          id: string;
          user_id: string;
          planned_date: string;
          recipe_id: string | null;
          note: string | null;
          executed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          planned_date: string;
          recipe_id?: string | null;
          note?: string | null;
          executed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          planned_date?: string;
          recipe_id?: string | null;
          note?: string | null;
          executed_at?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "meal_plans_recipe_id_fkey";
            columns: ["recipe_id"];
            referencedRelation: "recipes";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: Record<string, never>;
    Functions: {
      auto_archive_expired_items: {
        Args: Record<PropertyKey, never>;
        Returns: Array<{ id: string; archived_at: string }>;
      };
      archive_purchased_shopping_items: {
        Args: Record<string, never>;
        Returns: number;
      };
      // #491: atomic "delete only if unused" RPCs — see
      // supabase/migrations/20260716000001_atomic_delete_master_data.sql
      delete_category_if_unused: {
        Args: { p_id: string };
        Returns: void;
      };
      delete_storage_location_if_unused: {
        Args: { p_id: string };
        Returns: void;
      };
      undo_auto_archive: {
        Args: { p_item_ids: string[]; p_archived_at: string };
        Returns: number;
      };
      // #573: atomic template upsert + item replacement — see
      // supabase/migrations/20260724000001_atomic_save_shopping_template.sql
      save_shopping_list_template: {
        Args: {
          p_id: string | null;
          p_name: string;
          p_items: { name: string; desired_units: number }[];
        };
        Returns: string;
      };
      // #694: atomic batch import — see
      // supabase/migrations/20260731000001_atomic_import_items.sql
      import_items_batch: {
        Args: {
          p_items: unknown;
          p_duplicate_strategy: string;
        };
        Returns: Array<{ item_id: string; action: "created" | "updated" | "skipped" }>;
      };
      // #743: atomic bulk consume (log insert + lot delete + item reset) — see
      // supabase/migrations/20260805000002_atomic_bulk_consume_items.sql
      bulk_consume_items: {
        Args: { p_item_ids: string[] };
        Returns: void;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}

export const supabase = createClient<Database>(supabaseUrl, supabasePublishableKey);
