export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      activity_logs: {
        Row: {
          agent_id: string | null
          agent_name: string | null
          channel: Database["public"]["Enums"]["activity_channel"]
          id: string
          lead_id: string
          logged_at: string
          note: string
        }
        Insert: {
          agent_id?: string | null
          agent_name?: string | null
          channel?: Database["public"]["Enums"]["activity_channel"]
          id?: string
          lead_id: string
          logged_at?: string
          note: string
        }
        Update: {
          agent_id?: string | null
          agent_name?: string | null
          channel?: Database["public"]["Enums"]["activity_channel"]
          id?: string
          lead_id?: string
          logged_at?: string
          note?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_logs_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      announcements: {
        Row: {
          body: string
          created_at: string
          created_by: string | null
          id: string
          tag_type: Database["public"]["Enums"]["announcement_tag"]
          title: string
        }
        Insert: {
          body: string
          created_at?: string
          created_by?: string | null
          id?: string
          tag_type?: Database["public"]["Enums"]["announcement_tag"]
          title: string
        }
        Update: {
          body?: string
          created_at?: string
          created_by?: string | null
          id?: string
          tag_type?: Database["public"]["Enums"]["announcement_tag"]
          title?: string
        }
        Relationships: []
      }
      attendance_logs: {
        Row: {
          full_name: string
          id: string
          login_date: string
          login_time: string
          role: string
          user_id: string
        }
        Insert: {
          full_name: string
          id?: string
          login_date?: string
          login_time?: string
          role: string
          user_id: string
        }
        Update: {
          full_name?: string
          id?: string
          login_date?: string
          login_time?: string
          role?: string
          user_id?: string
        }
        Relationships: []
      }
      follow_up_reminders: {
        Row: {
          agent_id: string | null
          channel: Database["public"]["Enums"]["activity_channel"]
          created_at: string
          id: string
          is_completed: boolean
          lead_id: string
          note: string | null
          reminder_date: string
          reminder_time: string | null
        }
        Insert: {
          agent_id?: string | null
          channel?: Database["public"]["Enums"]["activity_channel"]
          created_at?: string
          id?: string
          is_completed?: boolean
          lead_id: string
          note?: string | null
          reminder_date: string
          reminder_time?: string | null
        }
        Update: {
          agent_id?: string | null
          channel?: Database["public"]["Enums"]["activity_channel"]
          created_at?: string
          id?: string
          is_completed?: boolean
          lead_id?: string
          note?: string | null
          reminder_date?: string
          reminder_time?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "follow_up_reminders_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_entries: {
        Row: {
          ad_spend: number
          created_at: string
          entry_date: string
          id: string
          leads: number
          user_id: string
        }
        Insert: {
          ad_spend: number
          created_at?: string
          entry_date: string
          id?: string
          leads: number
          user_id: string
        }
        Update: {
          ad_spend?: number
          created_at?: string
          entry_date?: string
          id?: string
          leads?: number
          user_id?: string
        }
        Relationships: []
      }
      lead_qualifier_sessions: {
        Row: {
          created_at: string
          id: string
          registrants: number | null
          total_duration: number | null
          uploaded_by: string | null
          viewers: number | null
          webinar_date: string | null
          webinar_name: string
        }
        Insert: {
          created_at?: string
          id?: string
          registrants?: number | null
          total_duration?: number | null
          uploaded_by?: string | null
          viewers?: number | null
          webinar_date?: string | null
          webinar_name: string
        }
        Update: {
          created_at?: string
          id?: string
          registrants?: number | null
          total_duration?: number | null
          uploaded_by?: string | null
          viewers?: number | null
          webinar_date?: string | null
          webinar_name?: string
        }
        Relationships: []
      }
      leads: {
        Row: {
          assigned_agent_id: string | null
          attendance_pct: number
          country: string | null
          created_at: string
          deal_value: number
          email: string | null
          first_join_time: string | null
          full_name: string | null
          grade: Database["public"]["Enums"]["lead_grade"]
          id: string
          is_super_hot: boolean
          lead_type: Database["public"]["Enums"]["lead_type"]
          phone: string | null
          pipeline_id: string | null
          program_name: string
          score: number
          sessions_count: number
          stage_id: string | null
          total_minutes: number
          updated_at: string
          webinar_count: number
          webinar_date: string | null
          webinar_name: string | null
          webinar_source: string | null
        }
        Insert: {
          assigned_agent_id?: string | null
          attendance_pct?: number
          country?: string | null
          created_at?: string
          deal_value?: number
          email?: string | null
          first_join_time?: string | null
          full_name?: string | null
          grade?: Database["public"]["Enums"]["lead_grade"]
          id?: string
          is_super_hot?: boolean
          lead_type?: Database["public"]["Enums"]["lead_type"]
          phone?: string | null
          pipeline_id?: string | null
          program_name?: string
          score?: number
          sessions_count?: number
          stage_id?: string | null
          total_minutes?: number
          updated_at?: string
          webinar_count?: number
          webinar_date?: string | null
          webinar_name?: string | null
          webinar_source?: string | null
        }
        Update: {
          assigned_agent_id?: string | null
          attendance_pct?: number
          country?: string | null
          created_at?: string
          deal_value?: number
          email?: string | null
          first_join_time?: string | null
          full_name?: string | null
          grade?: Database["public"]["Enums"]["lead_grade"]
          id?: string
          is_super_hot?: boolean
          lead_type?: Database["public"]["Enums"]["lead_type"]
          phone?: string | null
          pipeline_id?: string | null
          program_name?: string
          score?: number
          sessions_count?: number
          stage_id?: string | null
          total_minutes?: number
          updated_at?: string
          webinar_count?: number
          webinar_date?: string | null
          webinar_name?: string | null
          webinar_source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leads_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "pipelines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "stages"
            referencedColumns: ["id"]
          },
        ]
      }
      pipelines: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          name: string
          position: number
          type: Database["public"]["Enums"]["pipeline_type"]
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          position?: number
          type?: Database["public"]["Enums"]["pipeline_type"]
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          position?: number
          type?: Database["public"]["Enums"]["pipeline_type"]
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          department: string | null
          email: string
          full_name: string
          id: string
          role: string
          status: Database["public"]["Enums"]["user_status"]
        }
        Insert: {
          created_at?: string
          department?: string | null
          email: string
          full_name: string
          id: string
          role: string
          status?: Database["public"]["Enums"]["user_status"]
        }
        Update: {
          created_at?: string
          department?: string | null
          email?: string
          full_name?: string
          id?: string
          role?: string
          status?: Database["public"]["Enums"]["user_status"]
        }
        Relationships: []
      }
      stages: {
        Row: {
          color: string
          created_at: string
          id: string
          is_lost: boolean
          is_protected: boolean
          is_won: boolean
          name: string
          pipeline_id: string
          position: number
        }
        Insert: {
          color?: string
          created_at?: string
          id?: string
          is_lost?: boolean
          is_protected?: boolean
          is_won?: boolean
          name: string
          pipeline_id: string
          position?: number
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          is_lost?: boolean
          is_protected?: boolean
          is_won?: boolean
          name?: string
          pipeline_id?: string
          position?: number
        }
        Relationships: [
          {
            foreignKeyName: "stages_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "pipelines"
            referencedColumns: ["id"]
          },
        ]
      }
      students: {
        Row: {
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          phone: string | null
          search_text: string
          source: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          phone?: string | null
          search_text: string
          source: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          phone?: string | null
          search_text?: string
          source?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_active: { Args: { _user_id: string }; Returns: boolean }
      search_students: {
        Args: { _limit?: number; _q: string }
        Returns: {
          email: string
          full_name: string
          phone: string
          source: string
        }[]
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      students_count: { Args: never; Returns: number }
    }
    Enums: {
      activity_channel:
        | "call"
        | "whatsapp"
        | "email"
        | "sms"
        | "note"
        | "system"
      announcement_tag: "info" | "update" | "urgent"
      app_role: "admin" | "member"
      lead_grade:
        | "hot"
        | "warm"
        | "cold"
        | "non-attendee"
        | "super-hot"
        | "very-cold"
      lead_type: "paid" | "unpaid"
      pipeline_type: "unpaid" | "paid" | "custom"
      user_status: "pending" | "active"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      activity_channel: ["call", "whatsapp", "email", "sms", "note", "system"],
      announcement_tag: ["info", "update", "urgent"],
      app_role: ["admin", "member"],
      lead_grade: [
        "hot",
        "warm",
        "cold",
        "non-attendee",
        "super-hot",
        "very-cold",
      ],
      lead_type: ["paid", "unpaid"],
      pipeline_type: ["unpaid", "paid", "custom"],
      user_status: ["pending", "active"],
    },
  },
} as const
