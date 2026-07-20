export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface Database {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      categories: {
        Row: {
          color: string | null;
          created_at: string;
          icon: string | null;
          id: string;
          name: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          color?: string | null;
          created_at?: string;
          icon?: string | null;
          id?: string;
          name: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          color?: string | null;
          created_at?: string;
          icon?: string | null;
          id?: string;
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
      item_lots: {
        Row: {
          created_at: string;
          expiry_date: string | null;
          id: string;
          item_id: string;
          opened_remaining: number | null;
          unit_price: number | null;
          purchase_date: string | null;
          purchased_units: number;
          units: number;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          expiry_date?: string | null;
          id?: string;
          item_id: string;
          opened_remaining?: number | null;
          unit_price?: number | null;
          purchase_date?: string | null;
          purchased_units?: number;
          units?: number;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          expiry_date?: string | null;
          id?: string;
          item_id?: string;
          opened_remaining?: number | null;
          unit_price?: number | null;
          purchase_date?: string | null;
          purchased_units?: number;
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
      items: {
        Row: {
          auto_reorder: boolean;
          barcode: string | null;
          category_id: string | null;
          content_amount: number;
          content_unit: string;
          created_at: string | null;
          deleted_at: string | null;
          deletion_reason: string | null;
          expiry_date: string | null;
          id: string;
          image_path: string | null;
          last_verified_at: string | null;
          name: string;
          notes: string | null;
          opened_remaining: number | null;
          purchase_date: string | null;
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
          deleted_at?: string | null;
          deletion_reason?: string | null;
          expiry_date?: string | null;
          id?: string;
          image_path?: string | null;
          last_verified_at?: string | null;
          name: string;
          notes?: string | null;
          opened_remaining?: number | null;
          purchase_date?: string | null;
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
          deleted_at?: string | null;
          deletion_reason?: string | null;
          expiry_date?: string | null;
          id?: string;
          image_path?: string | null;
          last_verified_at?: string | null;
          name?: string;
          notes?: string | null;
          opened_remaining?: number | null;
          purchase_date?: string | null;
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
      notification_preferences: {
        Row: {
          email_address: string | null;
          email_enabled: boolean;
          notify_at: string;
          push_enabled: boolean;
          threshold_days: number;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          email_address?: string | null;
          email_enabled?: boolean;
          notify_at?: string;
          push_enabled?: boolean;
          threshold_days?: number;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          email_address?: string | null;
          email_enabled?: boolean;
          notify_at?: string;
          push_enabled?: boolean;
          threshold_days?: number;
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
          created_at: string;
          created_item_id: string | null;
          desired_units: number;
          id: string;
          linked_item_id: string | null;
          auto_added: boolean;
          name: string;
          note: string | null;
          purchased_at: string | null;
          status: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          created_item_id?: string | null;
          desired_units?: number;
          id?: string;
          linked_item_id?: string | null;
          auto_added?: boolean;
          name: string;
          note?: string | null;
          purchased_at?: string | null;
          status?: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          created_item_id?: string | null;
          desired_units?: number;
          id?: string;
          linked_item_id?: string | null;
          auto_added?: boolean;
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
      storage_locations: {
        Row: {
          created_at: string;
          icon: string | null;
          id: string;
          name: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          icon?: string | null;
          id?: string;
          name: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          icon?: string | null;
          id?: string;
          name?: string;
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
      auto_archive_expired_items: {
        Args: Record<PropertyKey, never>;
        Returns: Array<{ id: string; archived_at: string }>;
      };
      undo_auto_archive: {
        Args: { p_item_ids: string[]; p_archived_at: string };
        Returns: number;
      };
      archive_purchased_shopping_items: {
        Args: Record<PropertyKey, never>;
        Returns: number;
      };
    };
    Enums: {
      [_ in never]: never;
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
  public: {
    Enums: {},
  },
} as const;
