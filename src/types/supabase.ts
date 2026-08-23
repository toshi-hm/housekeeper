export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface Database {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  graphql_public: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      graphql: {
        Args: {
          extensions?: Json;
          operationName?: string;
          query?: string;
          variables?: Json;
        };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      barcode_rate_limits: {
        Row: {
          request_count: number;
          user_id: string;
          window_start: string;
        };
        Insert: {
          request_count?: number;
          user_id: string;
          window_start?: string;
        };
        Update: {
          request_count?: number;
          user_id?: string;
          window_start?: string;
        };
        Relationships: [];
      };
      categories: {
        Row: {
          color: string | null;
          created_at: string;
          days_use_after_opening: number | null;
          icon: string | null;
          id: string;
          kind: string;
          name: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          color?: string | null;
          created_at?: string;
          days_use_after_opening?: number | null;
          icon?: string | null;
          id?: string;
          kind?: string;
          name: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          color?: string | null;
          created_at?: string;
          days_use_after_opening?: number | null;
          icon?: string | null;
          id?: string;
          kind?: string;
          name?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      chat_rate_limits: {
        Row: {
          request_count: number;
          user_id: string;
          window_start: string;
        };
        Insert: {
          request_count?: number;
          user_id: string;
          window_start?: string;
        };
        Update: {
          request_count?: number;
          user_id?: string;
          window_start?: string;
        };
        Relationships: [];
      };
      consumption_logs: {
        Row: {
          delta_amount: number;
          delta_unit: string;
          id: string;
          item_id: string;
          note: string | null;
          occurred_at: string;
          opened_remaining_after: number | null;
          opened_remaining_before: number | null;
          units_after: number;
          units_before: number;
          user_id: string;
        };
        Insert: {
          delta_amount: number;
          delta_unit: string;
          id?: string;
          item_id: string;
          note?: string | null;
          occurred_at?: string;
          opened_remaining_after?: number | null;
          opened_remaining_before?: number | null;
          units_after: number;
          units_before: number;
          user_id: string;
        };
        Update: {
          delta_amount?: number;
          delta_unit?: string;
          id?: string;
          item_id?: string;
          note?: string | null;
          occurred_at?: string;
          opened_remaining_after?: number | null;
          opened_remaining_before?: number | null;
          units_after?: number;
          units_before?: number;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "consumption_logs_item_id_fkey";
            columns: ["item_id"];
            isOneToOne: false;
            referencedRelation: "items";
            referencedColumns: ["id"];
          },
        ];
      };
      custom_units: {
        Row: {
          created_at: string;
          id: string;
          name: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          name: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          name?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      floor_plan_item_placements: {
        Row: {
          created_at: string;
          floor_plan_id: string;
          id: string;
          item_id: string;
          object_id: string | null;
          rotation: number;
          updated_at: string;
          user_id: string;
          x: number;
          y: number;
          z: number;
        };
        Insert: {
          created_at?: string;
          floor_plan_id: string;
          id?: string;
          item_id: string;
          object_id?: string | null;
          rotation?: number;
          updated_at?: string;
          user_id: string;
          x: number;
          y: number;
          z?: number;
        };
        Update: {
          created_at?: string;
          floor_plan_id?: string;
          id?: string;
          item_id?: string;
          object_id?: string | null;
          rotation?: number;
          updated_at?: string;
          user_id?: string;
          x?: number;
          y?: number;
          z?: number;
        };
        Relationships: [
          {
            foreignKeyName: "floor_plan_item_placements_shared_floor_plan_id_fkey";
            columns: ["floor_plan_id"];
            isOneToOne: false;
            referencedRelation: "floor_plans";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "floor_plan_item_placements_shared_item_id_fkey";
            columns: ["item_id"];
            isOneToOne: false;
            referencedRelation: "items";
            referencedColumns: ["id"];
          },
        ];
      };
      floor_plan_storage_location_markers: {
        Row: {
          created_at: string;
          floor_plan_id: string;
          id: string;
          object_id: string | null;
          rotation: number;
          storage_location_id: string;
          updated_at: string;
          user_id: string;
          x: number;
          y: number;
          z: number;
        };
        Insert: {
          created_at?: string;
          floor_plan_id: string;
          id?: string;
          object_id?: string | null;
          rotation?: number;
          storage_location_id: string;
          updated_at?: string;
          user_id: string;
          x: number;
          y: number;
          z?: number;
        };
        Update: {
          created_at?: string;
          floor_plan_id?: string;
          id?: string;
          object_id?: string | null;
          rotation?: number;
          storage_location_id?: string;
          updated_at?: string;
          user_id?: string;
          x?: number;
          y?: number;
          z?: number;
        };
        Relationships: [
          {
            foreignKeyName: "floor_plan_storage_location_markers_floor_plan_id_fkey";
            columns: ["floor_plan_id"];
            isOneToOne: false;
            referencedRelation: "floor_plans";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "floor_plan_storage_location_markers_storage_location_id_fkey";
            columns: ["storage_location_id"];
            isOneToOne: false;
            referencedRelation: "storage_locations";
            referencedColumns: ["id"];
          },
        ];
      };
      floor_plans: {
        Row: {
          created_at: string;
          document: Json;
          id: string;
          name: string;
          revision: number;
          schema_version: number;
          storage_location_id: string | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          document: Json;
          id?: string;
          name: string;
          revision?: number;
          schema_version?: number;
          storage_location_id?: string | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          document?: Json;
          id?: string;
          name?: string;
          revision?: number;
          schema_version?: number;
          storage_location_id?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "floor_plans_shared_storage_location_id_fkey";
            columns: ["storage_location_id"];
            isOneToOne: false;
            referencedRelation: "storage_locations";
            referencedColumns: ["id"];
          },
        ];
      };
      household_invite_attempts: {
        Row: {
          attempt_count: number;
          first_attempt_at: string;
          last_attempt_at: string;
          locked_until: string | null;
          user_id: string;
        };
        Insert: {
          attempt_count?: number;
          first_attempt_at?: string;
          last_attempt_at?: string;
          locked_until?: string | null;
          user_id: string;
        };
        Update: {
          attempt_count?: number;
          first_attempt_at?: string;
          last_attempt_at?: string;
          locked_until?: string | null;
          user_id?: string;
        };
        Relationships: [];
      };
      household_invites: {
        Row: {
          code: string;
          created_at: string;
          created_by: string;
          expires_at: string;
          household_id: string;
          id: string;
          redeemed_at: string | null;
          redeemed_by: string | null;
        };
        Insert: {
          code: string;
          created_at?: string;
          created_by: string;
          expires_at: string;
          household_id: string;
          id?: string;
          redeemed_at?: string | null;
          redeemed_by?: string | null;
        };
        Update: {
          code?: string;
          created_at?: string;
          created_by?: string;
          expires_at?: string;
          household_id?: string;
          id?: string;
          redeemed_at?: string | null;
          redeemed_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "household_invites_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: false;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
        ];
      };
      household_members: {
        Row: {
          household_id: string;
          joined_at: string;
          role: Database["public"]["Enums"]["household_role"];
          user_id: string;
        };
        Insert: {
          household_id: string;
          joined_at?: string;
          role?: Database["public"]["Enums"]["household_role"];
          user_id: string;
        };
        Update: {
          household_id?: string;
          joined_at?: string;
          role?: Database["public"]["Enums"]["household_role"];
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "household_members_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: false;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
        ];
      };
      households: {
        Row: {
          created_at: string;
          created_by: string;
          id: string;
          name: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          created_by: string;
          id?: string;
          name: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          created_by?: string;
          id?: string;
          name?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      item_lots: {
        Row: {
          created_at: string;
          expiry_date: string | null;
          id: string;
          item_id: string;
          opened_at: string | null;
          opened_remaining: number | null;
          purchase_date: string | null;
          purchased_units: number;
          store_name: string | null;
          unit_price: number | null;
          units: number;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          expiry_date?: string | null;
          id?: string;
          item_id: string;
          opened_at?: string | null;
          opened_remaining?: number | null;
          purchase_date?: string | null;
          purchased_units: number;
          store_name?: string | null;
          unit_price?: number | null;
          units?: number;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          expiry_date?: string | null;
          id?: string;
          item_id?: string;
          opened_at?: string | null;
          opened_remaining?: number | null;
          purchase_date?: string | null;
          purchased_units?: number;
          store_name?: string | null;
          unit_price?: number | null;
          units?: number;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "item_lots_item_id_fkey";
            columns: ["item_id"];
            isOneToOne: false;
            referencedRelation: "items";
            referencedColumns: ["id"];
          },
        ];
      };
      item_tags: {
        Row: {
          color: string | null;
          created_at: string;
          id: string;
          name: string;
          user_id: string;
        };
        Insert: {
          color?: string | null;
          created_at?: string;
          id?: string;
          name: string;
          user_id: string;
        };
        Update: {
          color?: string | null;
          created_at?: string;
          id?: string;
          name?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      items: {
        Row: {
          auto_reorder: boolean;
          barcode: string | null;
          category_id: string | null;
          content_amount: number;
          content_unit: string;
          created_at: string | null;
          days_use_after_opening: number | null;
          deleted_at: string | null;
          deletion_reason: string | null;
          expiry_date: string | null;
          expiry_type: string | null;
          id: string;
          image_path: string | null;
          item_type: string | null;
          last_verified_at: string | null;
          minimum_stock: number | null;
          name: string;
          notes: string | null;
          opened_at: string | null;
          opened_remaining: number | null;
          pin_x: number | null;
          pin_y: number | null;
          purchase_date: string | null;
          reorder_lead_days: number | null;
          reorder_threshold: number | null;
          storage_location_id: string | null;
          units: number;
          updated_at: string | null;
          user_id: string;
        };
        Insert: {
          auto_reorder?: boolean;
          barcode?: string | null;
          category_id?: string | null;
          content_amount?: number;
          content_unit?: string;
          created_at?: string | null;
          days_use_after_opening?: number | null;
          deleted_at?: string | null;
          deletion_reason?: string | null;
          expiry_date?: string | null;
          expiry_type?: string | null;
          id?: string;
          image_path?: string | null;
          item_type?: string | null;
          last_verified_at?: string | null;
          minimum_stock?: number | null;
          name: string;
          notes?: string | null;
          opened_at?: string | null;
          opened_remaining?: number | null;
          pin_x?: number | null;
          pin_y?: number | null;
          purchase_date?: string | null;
          reorder_lead_days?: number | null;
          reorder_threshold?: number | null;
          storage_location_id?: string | null;
          units?: number;
          updated_at?: string | null;
          user_id: string;
        };
        Update: {
          auto_reorder?: boolean;
          barcode?: string | null;
          category_id?: string | null;
          content_amount?: number;
          content_unit?: string;
          created_at?: string | null;
          days_use_after_opening?: number | null;
          deleted_at?: string | null;
          deletion_reason?: string | null;
          expiry_date?: string | null;
          expiry_type?: string | null;
          id?: string;
          image_path?: string | null;
          item_type?: string | null;
          last_verified_at?: string | null;
          minimum_stock?: number | null;
          name?: string;
          notes?: string | null;
          opened_at?: string | null;
          opened_remaining?: number | null;
          pin_x?: number | null;
          pin_y?: number | null;
          purchase_date?: string | null;
          reorder_lead_days?: number | null;
          reorder_threshold?: number | null;
          storage_location_id?: string | null;
          units?: number;
          updated_at?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "items_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "categories";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "items_storage_location_id_fkey";
            columns: ["storage_location_id"];
            isOneToOne: false;
            referencedRelation: "storage_locations";
            referencedColumns: ["id"];
          },
        ];
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
            isOneToOne: false;
            referencedRelation: "items";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "items_to_tags_tag_id_fkey";
            columns: ["tag_id"];
            isOneToOne: false;
            referencedRelation: "item_tags";
            referencedColumns: ["id"];
          },
        ];
      };
      meal_plans: {
        Row: {
          created_at: string;
          executed_at: string | null;
          id: string;
          note: string | null;
          planned_date: string;
          recipe_id: string | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          executed_at?: string | null;
          id?: string;
          note?: string | null;
          planned_date: string;
          recipe_id?: string | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          executed_at?: string | null;
          id?: string;
          note?: string | null;
          planned_date?: string;
          recipe_id?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "meal_plans_recipe_id_fkey";
            columns: ["recipe_id"];
            isOneToOne: false;
            referencedRelation: "recipes";
            referencedColumns: ["id"];
          },
        ];
      };
      notification_logs: {
        Row: {
          created_at: string;
          id: string;
          item_count: number;
          sent_on: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          item_count?: number;
          sent_on?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          item_count?: number;
          sent_on?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      notification_preferences: {
        Row: {
          email_address: string | null;
          email_enabled: boolean;
          notify_at: string;
          push_enabled: boolean;
          threshold_days: number;
          timezone: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          email_address?: string | null;
          email_enabled?: boolean;
          notify_at?: string;
          push_enabled?: boolean;
          threshold_days?: number;
          timezone?: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          email_address?: string | null;
          email_enabled?: boolean;
          notify_at?: string;
          push_enabled?: boolean;
          threshold_days?: number;
          timezone?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      push_subscriptions: {
        Row: {
          auth: string;
          created_at: string;
          endpoint: string;
          id: string;
          p256dh: string;
          user_agent: string | null;
          user_id: string;
        };
        Insert: {
          auth: string;
          created_at?: string;
          endpoint: string;
          id?: string;
          p256dh: string;
          user_agent?: string | null;
          user_id: string;
        };
        Update: {
          auth?: string;
          created_at?: string;
          endpoint?: string;
          id?: string;
          p256dh?: string;
          user_agent?: string | null;
          user_id?: string;
        };
        Relationships: [];
      };
      receipt_scan_rate_limits: {
        Row: {
          request_count: number;
          user_id: string;
          window_start: string;
        };
        Insert: {
          request_count?: number;
          user_id: string;
          window_start?: string;
        };
        Update: {
          request_count?: number;
          user_id?: string;
          window_start?: string;
        };
        Relationships: [];
      };
      recipe_items: {
        Row: {
          amount: number;
          created_at: string;
          id: string;
          item_id: string;
          recipe_id: string;
        };
        Insert: {
          amount: number;
          created_at?: string;
          id?: string;
          item_id: string;
          recipe_id: string;
        };
        Update: {
          amount?: number;
          created_at?: string;
          id?: string;
          item_id?: string;
          recipe_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "recipe_items_item_id_fkey";
            columns: ["item_id"];
            isOneToOne: false;
            referencedRelation: "items";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "recipe_items_recipe_id_fkey";
            columns: ["recipe_id"];
            isOneToOne: false;
            referencedRelation: "recipes";
            referencedColumns: ["id"];
          },
        ];
      };
      recipe_rate_limits: {
        Row: {
          request_count: number;
          user_id: string;
          window_start: string;
        };
        Insert: {
          request_count?: number;
          user_id: string;
          window_start?: string;
        };
        Update: {
          request_count?: number;
          user_id?: string;
          window_start?: string;
        };
        Relationships: [];
      };
      recipes: {
        Row: {
          created_at: string;
          id: string;
          name: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          name: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          name?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      security_reset_attempts: {
        Row: {
          attempt_count: number;
          first_attempt_at: string;
          identifier: string;
          last_attempt_at: string;
          locked_until: string | null;
          scope: string;
        };
        Insert: {
          attempt_count?: number;
          first_attempt_at?: string;
          identifier: string;
          last_attempt_at?: string;
          locked_until?: string | null;
          scope: string;
        };
        Update: {
          attempt_count?: number;
          first_attempt_at?: string;
          identifier?: string;
          last_attempt_at?: string;
          locked_until?: string | null;
          scope?: string;
        };
        Relationships: [];
      };
      shopping_list_archive: {
        Row: {
          archived_at: string;
          desired_units: number;
          id: string;
          name: string;
          note: string | null;
          user_id: string;
        };
        Insert: {
          archived_at?: string;
          desired_units?: number;
          id?: string;
          name: string;
          note?: string | null;
          user_id: string;
        };
        Update: {
          archived_at?: string;
          desired_units?: number;
          id?: string;
          name?: string;
          note?: string | null;
          user_id?: string;
        };
        Relationships: [];
      };
      shopping_list_items: {
        Row: {
          auto_added: boolean;
          created_at: string;
          created_item_id: string | null;
          desired_units: number;
          id: string;
          linked_item_id: string | null;
          name: string;
          note: string | null;
          purchased_at: string | null;
          status: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          auto_added?: boolean;
          created_at?: string;
          created_item_id?: string | null;
          desired_units?: number;
          id?: string;
          linked_item_id?: string | null;
          name: string;
          note?: string | null;
          purchased_at?: string | null;
          status?: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          auto_added?: boolean;
          created_at?: string;
          created_item_id?: string | null;
          desired_units?: number;
          id?: string;
          linked_item_id?: string | null;
          name?: string;
          note?: string | null;
          purchased_at?: string | null;
          status?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "shopping_list_items_created_item_id_fkey";
            columns: ["created_item_id"];
            isOneToOne: false;
            referencedRelation: "items";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "shopping_list_items_linked_item_id_fkey";
            columns: ["linked_item_id"];
            isOneToOne: false;
            referencedRelation: "items";
            referencedColumns: ["id"];
          },
        ];
      };
      shopping_list_template_items: {
        Row: {
          created_at: string;
          desired_units: number;
          id: string;
          name: string;
          template_id: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          desired_units?: number;
          id?: string;
          name: string;
          template_id: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          desired_units?: number;
          id?: string;
          name?: string;
          template_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "shopping_list_template_items_template_id_fkey";
            columns: ["template_id"];
            isOneToOne: false;
            referencedRelation: "shopping_list_templates";
            referencedColumns: ["id"];
          },
        ];
      };
      shopping_list_templates: {
        Row: {
          created_at: string;
          id: string;
          name: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          name: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          name?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      storage_locations: {
        Row: {
          created_at: string;
          icon: string | null;
          id: string;
          name: string;
          photo_path: string | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          icon?: string | null;
          id?: string;
          name: string;
          photo_path?: string | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          icon?: string | null;
          id?: string;
          name?: string;
          photo_path?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      user_security_questions: {
        Row: {
          answer_hash: string;
          created_at: string;
          email: string;
          question: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          answer_hash: string;
          created_at?: string;
          email: string;
          question: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          answer_hash?: string;
          created_at?: string;
          email?: string;
          question?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      user_settings: {
        Row: {
          auto_archive_after_days: number | null;
          created_at: string;
          default_unit: string;
          expiry_warning_days: number;
          language: string;
          last_backup_export_at: string | null;
          low_stock_forecast_days: number;
          notify_at: string;
          stocktake_alert_days: number;
          stocktake_alert_enabled: boolean;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          auto_archive_after_days?: number | null;
          created_at?: string;
          default_unit?: string;
          expiry_warning_days?: number;
          language?: string;
          last_backup_export_at?: string | null;
          low_stock_forecast_days?: number;
          notify_at?: string;
          stocktake_alert_days?: number;
          stocktake_alert_enabled?: boolean;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          auto_archive_after_days?: number | null;
          created_at?: string;
          default_unit?: string;
          expiry_warning_days?: number;
          language?: string;
          last_backup_export_at?: string | null;
          low_stock_forecast_days?: number;
          notify_at?: string;
          stocktake_alert_days?: number;
          stocktake_alert_enabled?: boolean;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      archive_purchased_shopping_items: { Args: never; Returns: number };
      auto_archive_expired_items: {
        Args: never;
        Returns: {
          archived_at: string;
          id: string;
        }[];
      };
      bulk_consume_items: { Args: { p_item_ids: string[] }; Returns: undefined };
      check_barcode_rate_limit: {
        Args: never;
        Returns: {
          allowed: boolean;
          retry_after_seconds: number;
        }[];
      };
      check_chat_rate_limit: {
        Args: never;
        Returns: {
          allowed: boolean;
          retry_after_seconds: number;
        }[];
      };
      check_household_invite_rate_limit: {
        Args: never;
        Returns: {
          allowed: boolean;
          retry_after_seconds: number;
        }[];
      };
      check_receipt_scan_rate_limit: {
        Args: never;
        Returns: {
          allowed: boolean;
          retry_after_seconds: number;
        }[];
      };
      check_recipe_rate_limit: {
        Args: never;
        Returns: {
          allowed: boolean;
          retry_after_seconds: number;
        }[];
      };
      check_security_reset_rate_limit: {
        Args: {
          p_base_lockout_minutes?: number;
          p_identifier: string;
          p_max_attempts?: number;
          p_max_lockout_minutes?: number;
          p_scope: string;
          p_window_minutes?: number;
        };
        Returns: {
          allowed: boolean;
          retry_after_seconds: number;
        }[];
      };
      create_household: { Args: { p_name: string }; Returns: string };
      delete_category_if_unused: { Args: { p_id: string }; Returns: undefined };
      delete_storage_location_if_unused: {
        Args: { p_id: string };
        Returns: undefined;
      };
      import_items_batch: {
        Args: { p_duplicate_strategy: string; p_items: Json };
        Returns: {
          action: string;
          item_id: string;
        }[];
      };
      redeem_household_invite: {
        Args: { p_code: string };
        Returns: {
          error_code: string;
          household_id: string;
        }[];
      };
      save_shopping_list_template: {
        Args: { p_id: string; p_items: Json; p_name: string };
        Returns: string;
      };
      undo_auto_archive: {
        Args: { p_archived_at: string; p_item_ids: string[] };
        Returns: number;
      };
    };
    Enums: {
      household_role: "owner" | "member";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      household_role: ["owner", "member"],
    },
  },
} as const;
