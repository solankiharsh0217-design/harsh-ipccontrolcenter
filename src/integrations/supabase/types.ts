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
      attribution_media_buyers: {
        Row: {
          ad_spend: number
          conversion_rate: number
          cpl: number
          created_at: string
          id: string
          matched_sales: number
          media_buyer_name: string
          revenue: number
          roas_value: number
          session_id: string
          source_sheet_id: string | null
          source_tab_gid: string | null
          source_tab_name: string | null
          source_type: string
          total_leads: number
        }
        Insert: {
          ad_spend?: number
          conversion_rate?: number
          cpl?: number
          created_at?: string
          id?: string
          matched_sales?: number
          media_buyer_name: string
          revenue?: number
          roas_value?: number
          session_id: string
          source_sheet_id?: string | null
          source_tab_gid?: string | null
          source_tab_name?: string | null
          source_type?: string
          total_leads?: number
        }
        Update: {
          ad_spend?: number
          conversion_rate?: number
          cpl?: number
          created_at?: string
          id?: string
          matched_sales?: number
          media_buyer_name?: string
          revenue?: number
          roas_value?: number
          session_id?: string
          source_sheet_id?: string | null
          source_tab_gid?: string | null
          source_tab_name?: string | null
          source_type?: string
          total_leads?: number
        }
        Relationships: [
          {
            foreignKeyName: "attribution_media_buyers_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "attribution_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      attribution_sales_detail: {
        Row: {
          attributed_to: string | null
          buyer_name: string | null
          competing_matches: Json | null
          confidence_score: number | null
          created_at: string
          email: string | null
          id: string
          match_method: string | null
          match_reason: string | null
          matched_lead_email: string | null
          matched_lead_id: string | null
          matched_lead_name: string | null
          matched_lead_phone: string | null
          needs_review: boolean | null
          phone: string | null
          revenue: number
          sale_id: string | null
          session_id: string
          source_media_buyer: string | null
          source_row_index: number | null
          source_sales_sheet_id: string | null
          source_sales_tab_gid: string | null
          source_sales_tab_name: string | null
          source_type: string
          webinar_date: string | null
        }
        Insert: {
          attributed_to?: string | null
          buyer_name?: string | null
          competing_matches?: Json | null
          confidence_score?: number | null
          created_at?: string
          email?: string | null
          id?: string
          match_method?: string | null
          match_reason?: string | null
          matched_lead_email?: string | null
          matched_lead_id?: string | null
          matched_lead_name?: string | null
          matched_lead_phone?: string | null
          needs_review?: boolean | null
          phone?: string | null
          revenue?: number
          sale_id?: string | null
          session_id: string
          source_media_buyer?: string | null
          source_row_index?: number | null
          source_sales_sheet_id?: string | null
          source_sales_tab_gid?: string | null
          source_sales_tab_name?: string | null
          source_type?: string
          webinar_date?: string | null
        }
        Update: {
          attributed_to?: string | null
          buyer_name?: string | null
          competing_matches?: Json | null
          confidence_score?: number | null
          created_at?: string
          email?: string | null
          id?: string
          match_method?: string | null
          match_reason?: string | null
          matched_lead_email?: string | null
          matched_lead_id?: string | null
          matched_lead_name?: string | null
          matched_lead_phone?: string | null
          needs_review?: boolean | null
          phone?: string | null
          revenue?: number
          sale_id?: string | null
          session_id?: string
          source_media_buyer?: string | null
          source_row_index?: number | null
          source_sales_sheet_id?: string | null
          source_sales_tab_gid?: string | null
          source_sales_tab_name?: string | null
          source_type?: string
          webinar_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "attribution_sales_detail_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "attribution_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      attribution_sessions: {
        Row: {
          attribution_engine_version: string | null
          calculation_display_method: string | null
          calculation_id: string | null
          calculation_method: string
          column_mapping: Json | null
          column_mappings_used: Json | null
          created_at: string
          created_by: string | null
          duplicate_conflicts_count: number | null
          fetch_log_id: string | null
          id: string
          input_snapshot_hash: string | null
          master_sheet_id: string | null
          master_sheet_title: string | null
          master_sheet_url: string | null
          media_buyer_order: Json | null
          output_hash: string | null
          overall_roas: number
          result_status: string | null
          saved_from_draft_id: string | null
          session_slot: string | null
          tab_role_mapping: Json | null
          total_ad_spend: number
          total_leads: number
          total_revenue: number
          total_sales: number
          unmatched_count: number
          webinar_date: string | null
          webinar_date_mode: string | null
          webinar_dates: Json | null
          webinar_end_date: string | null
          webinar_format: string | null
          webinar_name: string
          webinar_notes: string | null
          webinar_operator: string | null
          webinar_platform: string | null
          webinar_single_date: string | null
          webinar_start_date: string | null
          webinar_timing: Json | null
          webinar_type: string | null
          zoom_account_used: string | null
        }
        Insert: {
          attribution_engine_version?: string | null
          calculation_display_method?: string | null
          calculation_id?: string | null
          calculation_method?: string
          column_mapping?: Json | null
          column_mappings_used?: Json | null
          created_at?: string
          created_by?: string | null
          duplicate_conflicts_count?: number | null
          fetch_log_id?: string | null
          id?: string
          input_snapshot_hash?: string | null
          master_sheet_id?: string | null
          master_sheet_title?: string | null
          master_sheet_url?: string | null
          media_buyer_order?: Json | null
          output_hash?: string | null
          overall_roas?: number
          result_status?: string | null
          saved_from_draft_id?: string | null
          session_slot?: string | null
          tab_role_mapping?: Json | null
          total_ad_spend?: number
          total_leads?: number
          total_revenue?: number
          total_sales?: number
          unmatched_count?: number
          webinar_date?: string | null
          webinar_date_mode?: string | null
          webinar_dates?: Json | null
          webinar_end_date?: string | null
          webinar_format?: string | null
          webinar_name: string
          webinar_notes?: string | null
          webinar_operator?: string | null
          webinar_platform?: string | null
          webinar_single_date?: string | null
          webinar_start_date?: string | null
          webinar_timing?: Json | null
          webinar_type?: string | null
          zoom_account_used?: string | null
        }
        Update: {
          attribution_engine_version?: string | null
          calculation_display_method?: string | null
          calculation_id?: string | null
          calculation_method?: string
          column_mapping?: Json | null
          column_mappings_used?: Json | null
          created_at?: string
          created_by?: string | null
          duplicate_conflicts_count?: number | null
          fetch_log_id?: string | null
          id?: string
          input_snapshot_hash?: string | null
          master_sheet_id?: string | null
          master_sheet_title?: string | null
          master_sheet_url?: string | null
          media_buyer_order?: Json | null
          output_hash?: string | null
          overall_roas?: number
          result_status?: string | null
          saved_from_draft_id?: string | null
          session_slot?: string | null
          tab_role_mapping?: Json | null
          total_ad_spend?: number
          total_leads?: number
          total_revenue?: number
          total_sales?: number
          unmatched_count?: number
          webinar_date?: string | null
          webinar_date_mode?: string | null
          webinar_dates?: Json | null
          webinar_end_date?: string | null
          webinar_format?: string | null
          webinar_name?: string
          webinar_notes?: string | null
          webinar_operator?: string | null
          webinar_platform?: string | null
          webinar_single_date?: string | null
          webinar_start_date?: string | null
          webinar_timing?: Json | null
          webinar_type?: string | null
          zoom_account_used?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "attribution_sessions_fetch_log_id_fkey"
            columns: ["fetch_log_id"]
            isOneToOne: false
            referencedRelation: "roas_fetch_logs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attribution_sessions_master_sheet_id_fkey"
            columns: ["master_sheet_id"]
            isOneToOne: false
            referencedRelation: "roas_master_sheets"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_custom_metrics: {
        Row: {
          aggregation_method: string
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          metric_key: string
          metric_name: string
          metric_type: string
          show_in_exports: boolean
          show_in_whatsapp: boolean
          updated_at: string
        }
        Insert: {
          aggregation_method?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          metric_key: string
          metric_name: string
          metric_type: string
          show_in_exports?: boolean
          show_in_whatsapp?: boolean
          updated_at?: string
        }
        Update: {
          aggregation_method?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          metric_key?: string
          metric_name?: string
          metric_type?: string
          show_in_exports?: boolean
          show_in_whatsapp?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      daily_lead_report_ad_accounts: {
        Row: {
          ad_account_name: string
          ad_spend: number
          created_at: string
          id: string
          metrics: Json | null
          report_media_buyer_id: string
          updated_at: string
        }
        Insert: {
          ad_account_name: string
          ad_spend?: number
          created_at?: string
          id?: string
          metrics?: Json | null
          report_media_buyer_id: string
          updated_at?: string
        }
        Update: {
          ad_account_name?: string
          ad_spend?: number
          created_at?: string
          id?: string
          metrics?: Json | null
          report_media_buyer_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "daily_lead_report_ad_accounts_report_media_buyer_id_fkey"
            columns: ["report_media_buyer_id"]
            isOneToOne: false
            referencedRelation: "daily_lead_report_media_buyers"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_lead_report_media_buyers: {
        Row: {
          cpl: number
          created_at: string
          date_column: string | null
          fetch_metadata: Json | null
          id: string
          lead_count_source: string
          lead_source_url: string | null
          media_buyer_key: string | null
          media_buyer_name: string
          report_id: string
          sheet_id: string | null
          spreadsheet_id: string | null
          spreadsheet_title: string | null
          status: string
          tab_name: string | null
          total_ad_spend: number
          total_leads: number
          updated_at: string
        }
        Insert: {
          cpl?: number
          created_at?: string
          date_column?: string | null
          fetch_metadata?: Json | null
          id?: string
          lead_count_source?: string
          lead_source_url?: string | null
          media_buyer_key?: string | null
          media_buyer_name: string
          report_id: string
          sheet_id?: string | null
          spreadsheet_id?: string | null
          spreadsheet_title?: string | null
          status?: string
          tab_name?: string | null
          total_ad_spend?: number
          total_leads?: number
          updated_at?: string
        }
        Update: {
          cpl?: number
          created_at?: string
          date_column?: string | null
          fetch_metadata?: Json | null
          id?: string
          lead_count_source?: string
          lead_source_url?: string | null
          media_buyer_key?: string | null
          media_buyer_name?: string
          report_id?: string
          sheet_id?: string | null
          spreadsheet_id?: string | null
          spreadsheet_title?: string | null
          status?: string
          tab_name?: string | null
          total_ad_spend?: number
          total_leads?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "daily_lead_report_media_buyers_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "daily_lead_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_lead_reports: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          input_hash: string | null
          is_deleted: boolean
          metric_template_id: string | null
          notes: string | null
          overall_cpl: number
          report_date: string
          report_name: string | null
          total_ad_spend: number
          total_leads: number
          updated_at: string
          whatsapp_message: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          input_hash?: string | null
          is_deleted?: boolean
          metric_template_id?: string | null
          notes?: string | null
          overall_cpl?: number
          report_date: string
          report_name?: string | null
          total_ad_spend?: number
          total_leads?: number
          updated_at?: string
          whatsapp_message?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          input_hash?: string | null
          is_deleted?: boolean
          metric_template_id?: string | null
          notes?: string | null
          overall_cpl?: number
          report_date?: string
          report_name?: string | null
          total_ad_spend?: number
          total_leads?: number
          updated_at?: string
          whatsapp_message?: string | null
        }
        Relationships: []
      }
      daily_lead_source_mappings: {
        Row: {
          created_at: string
          created_by: string | null
          date_column: string | null
          id: string
          is_active: boolean
          is_default: boolean
          lead_source_name: string | null
          media_buyer_name: string
          sheet_id: string | null
          sheet_url: string
          spreadsheet_id: string | null
          spreadsheet_title: string | null
          tab_name: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          date_column?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          lead_source_name?: string | null
          media_buyer_name: string
          sheet_id?: string | null
          sheet_url: string
          spreadsheet_id?: string | null
          spreadsheet_title?: string | null
          tab_name?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          date_column?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          lead_source_name?: string | null
          media_buyer_name?: string
          sheet_id?: string | null
          sheet_url?: string
          spreadsheet_id?: string | null
          spreadsheet_title?: string | null
          tab_name?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      daily_metric_templates: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean
          is_default: boolean
          metrics: Json
          template_name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          metrics?: Json
          template_name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          metrics?: Json
          template_name?: string
          updated_at?: string
        }
        Relationships: []
      }
      data_sources: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          last_fetched: string | null
          row_count: number | null
          sheet_url: string | null
          source_name: string
          source_type: string | null
          status: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          last_fetched?: string | null
          row_count?: number | null
          sheet_url?: string | null
          source_name: string
          source_type?: string | null
          status?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          last_fetched?: string | null
          row_count?: number | null
          sheet_url?: string | null
          source_name?: string
          source_type?: string | null
          status?: string | null
          updated_at?: string
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
          mode: number | null
          registrants: number | null
          registration_file_name: string | null
          total_duration: number | null
          true_absentee_count: number | null
          uploaded_by: string | null
          viewers: number | null
          webinar_date: string | null
          webinar_name: string
          zoom_file_name: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          mode?: number | null
          registrants?: number | null
          registration_file_name?: string | null
          total_duration?: number | null
          true_absentee_count?: number | null
          uploaded_by?: string | null
          viewers?: number | null
          webinar_date?: string | null
          webinar_name: string
          zoom_file_name?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          mode?: number | null
          registrants?: number | null
          registration_file_name?: string | null
          total_duration?: number | null
          true_absentee_count?: number | null
          uploaded_by?: string | null
          viewers?: number | null
          webinar_date?: string | null
          webinar_name?: string
          zoom_file_name?: string | null
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
          lead_source_type: string | null
          lead_type: Database["public"]["Enums"]["lead_type"]
          phone: string | null
          pipeline_id: string | null
          program_name: string
          score: number
          sessions_count: number
          sort_order: number
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
          lead_source_type?: string | null
          lead_type?: Database["public"]["Enums"]["lead_type"]
          phone?: string | null
          pipeline_id?: string | null
          program_name?: string
          score?: number
          sessions_count?: number
          sort_order?: number
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
          lead_source_type?: string | null
          lead_type?: Database["public"]["Enums"]["lead_type"]
          phone?: string | null
          pipeline_id?: string | null
          program_name?: string
          score?: number
          sessions_count?: number
          sort_order?: number
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
      media_buyer_attribution: {
        Row: {
          ad_spend: number | null
          conversion_rate: number | null
          cpl: number | null
          created_at: string
          created_by: string | null
          id: string
          matched_sales: number | null
          media_buyer_name: string
          revenue: number | null
          roas_value: number | null
          session_id: string
          total_leads: number | null
          webinar_date: string | null
          webinar_name: string | null
          webinar_type: string | null
        }
        Insert: {
          ad_spend?: number | null
          conversion_rate?: number | null
          cpl?: number | null
          created_at?: string
          created_by?: string | null
          id?: string
          matched_sales?: number | null
          media_buyer_name: string
          revenue?: number | null
          roas_value?: number | null
          session_id: string
          total_leads?: number | null
          webinar_date?: string | null
          webinar_name?: string | null
          webinar_type?: string | null
        }
        Update: {
          ad_spend?: number | null
          conversion_rate?: number | null
          cpl?: number | null
          created_at?: string
          created_by?: string | null
          id?: string
          matched_sales?: number | null
          media_buyer_name?: string
          revenue?: number | null
          roas_value?: number | null
          session_id?: string
          total_leads?: number | null
          webinar_date?: string | null
          webinar_name?: string | null
          webinar_type?: string | null
        }
        Relationships: []
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
      quick_save_entries: {
        Row: {
          created_at: string
          created_by: string | null
          field_key: string
          id: string
          is_active: boolean
          sort_order: number
          updated_at: string
          value: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          field_key: string
          id?: string
          is_active?: boolean
          sort_order?: number
          updated_at?: string
          value: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          field_key?: string
          id?: string
          is_active?: boolean
          sort_order?: number
          updated_at?: string
          value?: string
        }
        Relationships: []
      }
      roas_ad_spends: {
        Row: {
          created_at: string
          entered_by: string | null
          id: string
          media_buyer_id: string
          remarks: string | null
          spend_amount: number
          spend_date: string
          updated_at: string
          webinar_date: string | null
          webinar_id: string | null
        }
        Insert: {
          created_at?: string
          entered_by?: string | null
          id?: string
          media_buyer_id: string
          remarks?: string | null
          spend_amount?: number
          spend_date: string
          updated_at?: string
          webinar_date?: string | null
          webinar_id?: string | null
        }
        Update: {
          created_at?: string
          entered_by?: string | null
          id?: string
          media_buyer_id?: string
          remarks?: string | null
          spend_amount?: number
          spend_date?: string
          updated_at?: string
          webinar_date?: string | null
          webinar_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "roas_ad_spends_media_buyer_id_fkey"
            columns: ["media_buyer_id"]
            isOneToOne: false
            referencedRelation: "roas_media_buyers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "roas_ad_spends_webinar_id_fkey"
            columns: ["webinar_id"]
            isOneToOne: false
            referencedRelation: "roas_webinars"
            referencedColumns: ["id"]
          },
        ]
      }
      roas_attribution_audit_logs: {
        Row: {
          attribution_session_id: string | null
          audit_rows: Json
          calculation_id: string
          column_mappings_used: Json | null
          created_at: string
          created_by: string | null
          duplicate_conflicts: Json | null
          id: string
          input_snapshot_hash: string | null
          media_buyer_order: Json | null
          output_hash: string | null
        }
        Insert: {
          attribution_session_id?: string | null
          audit_rows?: Json
          calculation_id: string
          column_mappings_used?: Json | null
          created_at?: string
          created_by?: string | null
          duplicate_conflicts?: Json | null
          id?: string
          input_snapshot_hash?: string | null
          media_buyer_order?: Json | null
          output_hash?: string | null
        }
        Update: {
          attribution_session_id?: string | null
          audit_rows?: Json
          calculation_id?: string
          column_mappings_used?: Json | null
          created_at?: string
          created_by?: string | null
          duplicate_conflicts?: Json | null
          id?: string
          input_snapshot_hash?: string | null
          media_buyer_order?: Json | null
          output_hash?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "roas_attribution_audit_logs_attribution_session_id_fkey"
            columns: ["attribution_session_id"]
            isOneToOne: false
            referencedRelation: "attribution_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      roas_attribution_logs: {
        Row: {
          change_reason: string | null
          changed_by: string | null
          created_at: string
          enrollment_id: string | null
          id: string
          new_media_buyer_id: string | null
          new_status: string | null
          old_media_buyer_id: string | null
          old_status: string | null
        }
        Insert: {
          change_reason?: string | null
          changed_by?: string | null
          created_at?: string
          enrollment_id?: string | null
          id?: string
          new_media_buyer_id?: string | null
          new_status?: string | null
          old_media_buyer_id?: string | null
          old_status?: string | null
        }
        Update: {
          change_reason?: string | null
          changed_by?: string | null
          created_at?: string
          enrollment_id?: string | null
          id?: string
          new_media_buyer_id?: string | null
          new_status?: string | null
          old_media_buyer_id?: string | null
          old_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "roas_attribution_logs_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "roas_enrollments"
            referencedColumns: ["id"]
          },
        ]
      }
      roas_calculation_drafts: {
        Row: {
          active_step: string | null
          ad_spend_data: Json | null
          calculation_method: string
          column_mappings: Json | null
          created_at: string
          detected_tabs: Json | null
          draft_name: string | null
          id: string
          is_completed: boolean
          master_sheet_title: string | null
          master_sheet_url: string | null
          result_snapshot: Json | null
          result_status: string | null
          saved_attribution_session_id: string | null
          spreadsheet_id: string | null
          tab_roles: Json | null
          updated_at: string
          user_id: string | null
          webinar_details: Json | null
        }
        Insert: {
          active_step?: string | null
          ad_spend_data?: Json | null
          calculation_method: string
          column_mappings?: Json | null
          created_at?: string
          detected_tabs?: Json | null
          draft_name?: string | null
          id?: string
          is_completed?: boolean
          master_sheet_title?: string | null
          master_sheet_url?: string | null
          result_snapshot?: Json | null
          result_status?: string | null
          saved_attribution_session_id?: string | null
          spreadsheet_id?: string | null
          tab_roles?: Json | null
          updated_at?: string
          user_id?: string | null
          webinar_details?: Json | null
        }
        Update: {
          active_step?: string | null
          ad_spend_data?: Json | null
          calculation_method?: string
          column_mappings?: Json | null
          created_at?: string
          detected_tabs?: Json | null
          draft_name?: string | null
          id?: string
          is_completed?: boolean
          master_sheet_title?: string | null
          master_sheet_url?: string | null
          result_snapshot?: Json | null
          result_status?: string | null
          saved_attribution_session_id?: string | null
          spreadsheet_id?: string | null
          tab_roles?: Json | null
          updated_at?: string
          user_id?: string | null
          webinar_details?: Json | null
        }
        Relationships: []
      }
      roas_data_sources: {
        Row: {
          column_mapping_json: Json
          created_at: string
          id: string
          last_duplicates_skipped: number | null
          last_rows_fetched: number | null
          last_rows_imported: number | null
          last_sync_error: string | null
          last_sync_status: string | null
          last_synced_at: string | null
          media_buyer_id: string | null
          published_sheet_url: string
          source_name: string
          source_type: string
          status: string
          updated_at: string
        }
        Insert: {
          column_mapping_json?: Json
          created_at?: string
          id?: string
          last_duplicates_skipped?: number | null
          last_rows_fetched?: number | null
          last_rows_imported?: number | null
          last_sync_error?: string | null
          last_sync_status?: string | null
          last_synced_at?: string | null
          media_buyer_id?: string | null
          published_sheet_url: string
          source_name: string
          source_type: string
          status?: string
          updated_at?: string
        }
        Update: {
          column_mapping_json?: Json
          created_at?: string
          id?: string
          last_duplicates_skipped?: number | null
          last_rows_fetched?: number | null
          last_rows_imported?: number | null
          last_sync_error?: string | null
          last_sync_status?: string | null
          last_synced_at?: string | null
          media_buyer_id?: string | null
          published_sheet_url?: string
          source_name?: string
          source_type?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "roas_data_sources_media_buyer_id_fkey"
            columns: ["media_buyer_id"]
            isOneToOne: false
            referencedRelation: "roas_media_buyers"
            referencedColumns: ["id"]
          },
        ]
      }
      roas_enrollments: {
        Row: {
          amount_paid: number | null
          attributed_media_buyer_id: string | null
          attributed_webinar_id: string | null
          attribution_confidence: string | null
          attribution_method: string | null
          attribution_status: string | null
          buyer_name: string | null
          clean_email: string | null
          clean_phone: string | null
          cycle_attribution_flag: string | null
          cycle_window_end: string | null
          cycle_window_start: string | null
          data_flags: Json | null
          data_source_id: string | null
          gst_amount: number | null
          id: string
          imported_at: string
          manual_override: boolean | null
          manual_override_at: string | null
          manual_override_by: string | null
          manual_override_reason: string | null
          matched_lead_id: string | null
          net_revenue: number | null
          payment_date: string | null
          payment_gateway: string | null
          payment_status: string | null
          program_price: number | null
          raw_email: string | null
          raw_phone: string | null
          remarks: string | null
          salesperson: string | null
          source_row_hash: string
          total_invoice_value: number | null
          transaction_id: string | null
          updated_at: string
          webinar_date: string | null
        }
        Insert: {
          amount_paid?: number | null
          attributed_media_buyer_id?: string | null
          attributed_webinar_id?: string | null
          attribution_confidence?: string | null
          attribution_method?: string | null
          attribution_status?: string | null
          buyer_name?: string | null
          clean_email?: string | null
          clean_phone?: string | null
          cycle_attribution_flag?: string | null
          cycle_window_end?: string | null
          cycle_window_start?: string | null
          data_flags?: Json | null
          data_source_id?: string | null
          gst_amount?: number | null
          id?: string
          imported_at?: string
          manual_override?: boolean | null
          manual_override_at?: string | null
          manual_override_by?: string | null
          manual_override_reason?: string | null
          matched_lead_id?: string | null
          net_revenue?: number | null
          payment_date?: string | null
          payment_gateway?: string | null
          payment_status?: string | null
          program_price?: number | null
          raw_email?: string | null
          raw_phone?: string | null
          remarks?: string | null
          salesperson?: string | null
          source_row_hash: string
          total_invoice_value?: number | null
          transaction_id?: string | null
          updated_at?: string
          webinar_date?: string | null
        }
        Update: {
          amount_paid?: number | null
          attributed_media_buyer_id?: string | null
          attributed_webinar_id?: string | null
          attribution_confidence?: string | null
          attribution_method?: string | null
          attribution_status?: string | null
          buyer_name?: string | null
          clean_email?: string | null
          clean_phone?: string | null
          cycle_attribution_flag?: string | null
          cycle_window_end?: string | null
          cycle_window_start?: string | null
          data_flags?: Json | null
          data_source_id?: string | null
          gst_amount?: number | null
          id?: string
          imported_at?: string
          manual_override?: boolean | null
          manual_override_at?: string | null
          manual_override_by?: string | null
          manual_override_reason?: string | null
          matched_lead_id?: string | null
          net_revenue?: number | null
          payment_date?: string | null
          payment_gateway?: string | null
          payment_status?: string | null
          program_price?: number | null
          raw_email?: string | null
          raw_phone?: string | null
          remarks?: string | null
          salesperson?: string | null
          source_row_hash?: string
          total_invoice_value?: number | null
          transaction_id?: string | null
          updated_at?: string
          webinar_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "roas_enrollments_attributed_media_buyer_id_fkey"
            columns: ["attributed_media_buyer_id"]
            isOneToOne: false
            referencedRelation: "roas_media_buyers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "roas_enrollments_attributed_webinar_id_fkey"
            columns: ["attributed_webinar_id"]
            isOneToOne: false
            referencedRelation: "roas_webinars"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "roas_enrollments_data_source_id_fkey"
            columns: ["data_source_id"]
            isOneToOne: false
            referencedRelation: "roas_data_sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "roas_enrollments_matched_lead_id_fkey"
            columns: ["matched_lead_id"]
            isOneToOne: false
            referencedRelation: "roas_leads"
            referencedColumns: ["id"]
          },
        ]
      }
      roas_fetch_logs: {
        Row: {
          attribution_session_id: string | null
          created_at: string
          error_summary: string | null
          failed_tabs_count: number
          fetch_status: string
          fetched_by: string | null
          fetched_tabs_count: number
          id: string
          master_sheet_id: string | null
        }
        Insert: {
          attribution_session_id?: string | null
          created_at?: string
          error_summary?: string | null
          failed_tabs_count?: number
          fetch_status: string
          fetched_by?: string | null
          fetched_tabs_count?: number
          id?: string
          master_sheet_id?: string | null
        }
        Update: {
          attribution_session_id?: string | null
          created_at?: string
          error_summary?: string | null
          failed_tabs_count?: number
          fetch_status?: string
          fetched_by?: string | null
          fetched_tabs_count?: number
          id?: string
          master_sheet_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "roas_fetch_logs_master_sheet_id_fkey"
            columns: ["master_sheet_id"]
            isOneToOne: false
            referencedRelation: "roas_master_sheets"
            referencedColumns: ["id"]
          },
        ]
      }
      roas_history: {
        Row: {
          campaign_name: string
          created_at: string
          created_by: string | null
          id: string
          roas_value: number | null
          total_ad_spend: number
          total_revenue: number | null
          total_sales: number | null
          webinar_date: string | null
        }
        Insert: {
          campaign_name: string
          created_at?: string
          created_by?: string | null
          id?: string
          roas_value?: number | null
          total_ad_spend?: number
          total_revenue?: number | null
          total_sales?: number | null
          webinar_date?: string | null
        }
        Update: {
          campaign_name?: string
          created_at?: string
          created_by?: string | null
          id?: string
          roas_value?: number | null
          total_ad_spend?: number
          total_revenue?: number | null
          total_sales?: number | null
          webinar_date?: string | null
        }
        Relationships: []
      }
      roas_leads: {
        Row: {
          ad_name: string | null
          adset_name: string | null
          campaign_name: string | null
          city: string | null
          clean_email: string | null
          clean_phone: string | null
          created_at_from_sheet: string | null
          data_flags: Json | null
          data_source_id: string | null
          duplicate_status: string | null
          id: string
          imported_at: string
          landing_page: string | null
          lead_name: string | null
          lead_status: string | null
          media_buyer_id: string | null
          notes: string | null
          raw_email: string | null
          raw_phone: string | null
          source_row_hash: string
          state: string | null
          updated_at: string
          utm_campaign: string | null
          utm_content: string | null
          utm_source: string | null
          webinar_date: string | null
        }
        Insert: {
          ad_name?: string | null
          adset_name?: string | null
          campaign_name?: string | null
          city?: string | null
          clean_email?: string | null
          clean_phone?: string | null
          created_at_from_sheet?: string | null
          data_flags?: Json | null
          data_source_id?: string | null
          duplicate_status?: string | null
          id?: string
          imported_at?: string
          landing_page?: string | null
          lead_name?: string | null
          lead_status?: string | null
          media_buyer_id?: string | null
          notes?: string | null
          raw_email?: string | null
          raw_phone?: string | null
          source_row_hash: string
          state?: string | null
          updated_at?: string
          utm_campaign?: string | null
          utm_content?: string | null
          utm_source?: string | null
          webinar_date?: string | null
        }
        Update: {
          ad_name?: string | null
          adset_name?: string | null
          campaign_name?: string | null
          city?: string | null
          clean_email?: string | null
          clean_phone?: string | null
          created_at_from_sheet?: string | null
          data_flags?: Json | null
          data_source_id?: string | null
          duplicate_status?: string | null
          id?: string
          imported_at?: string
          landing_page?: string | null
          lead_name?: string | null
          lead_status?: string | null
          media_buyer_id?: string | null
          notes?: string | null
          raw_email?: string | null
          raw_phone?: string | null
          source_row_hash?: string
          state?: string | null
          updated_at?: string
          utm_campaign?: string | null
          utm_content?: string | null
          utm_source?: string | null
          webinar_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "roas_leads_data_source_id_fkey"
            columns: ["data_source_id"]
            isOneToOne: false
            referencedRelation: "roas_data_sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "roas_leads_media_buyer_id_fkey"
            columns: ["media_buyer_id"]
            isOneToOne: false
            referencedRelation: "roas_media_buyers"
            referencedColumns: ["id"]
          },
        ]
      }
      roas_master_sheet_mappings: {
        Row: {
          column_mappings: Json | null
          created_at: string
          created_by: string | null
          id: string
          ignored_tabs: Json | null
          is_active: boolean
          last_confirmed_at: string | null
          last_confirmed_by: string | null
          mapping_name: string | null
          master_sheet_url: string
          media_buyer_mappings: Json
          sales_sheet_id: string | null
          sales_tab_name: string | null
          spreadsheet_id: string
          spreadsheet_title: string | null
          updated_at: string
        }
        Insert: {
          column_mappings?: Json | null
          created_at?: string
          created_by?: string | null
          id?: string
          ignored_tabs?: Json | null
          is_active?: boolean
          last_confirmed_at?: string | null
          last_confirmed_by?: string | null
          mapping_name?: string | null
          master_sheet_url: string
          media_buyer_mappings?: Json
          sales_sheet_id?: string | null
          sales_tab_name?: string | null
          spreadsheet_id: string
          spreadsheet_title?: string | null
          updated_at?: string
        }
        Update: {
          column_mappings?: Json | null
          created_at?: string
          created_by?: string | null
          id?: string
          ignored_tabs?: Json | null
          is_active?: boolean
          last_confirmed_at?: string | null
          last_confirmed_by?: string | null
          mapping_name?: string | null
          master_sheet_url?: string
          media_buyer_mappings?: Json
          sales_sheet_id?: string | null
          sales_tab_name?: string | null
          spreadsheet_id?: string
          spreadsheet_title?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      roas_master_sheet_tabs: {
        Row: {
          column_mapping: Json | null
          created_at: string
          csv_url: string | null
          id: string
          is_active: boolean
          master_sheet_id: string
          media_buyer_name: string | null
          tab_gid: string | null
          tab_name: string | null
          tab_role: string
          tab_url: string | null
          updated_at: string
        }
        Insert: {
          column_mapping?: Json | null
          created_at?: string
          csv_url?: string | null
          id?: string
          is_active?: boolean
          master_sheet_id: string
          media_buyer_name?: string | null
          tab_gid?: string | null
          tab_name?: string | null
          tab_role: string
          tab_url?: string | null
          updated_at?: string
        }
        Update: {
          column_mapping?: Json | null
          created_at?: string
          csv_url?: string | null
          id?: string
          is_active?: boolean
          master_sheet_id?: string
          media_buyer_name?: string | null
          tab_gid?: string | null
          tab_name?: string | null
          tab_role?: string
          tab_url?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "roas_master_sheet_tabs_master_sheet_id_fkey"
            columns: ["master_sheet_id"]
            isOneToOne: false
            referencedRelation: "roas_master_sheets"
            referencedColumns: ["id"]
          },
        ]
      }
      roas_master_sheets: {
        Row: {
          created_at: string
          created_by: string | null
          fetch_method: string
          id: string
          master_sheet_url: string
          source_name: string
          spreadsheet_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          fetch_method?: string
          id?: string
          master_sheet_url: string
          source_name: string
          spreadsheet_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          fetch_method?: string
          id?: string
          master_sheet_url?: string
          source_name?: string
          spreadsheet_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      roas_media_buyers: {
        Row: {
          created_at: string
          id: string
          name: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      roas_sync_logs: {
        Row: {
          created_at: string
          data_source_id: string | null
          duplicate_rows_skipped: number | null
          error_message: string | null
          id: string
          rows_fetched: number | null
          rows_imported: number | null
          rows_updated: number | null
          sync_completed_at: string | null
          sync_started_at: string
          sync_status: string
          triggered_by: string | null
        }
        Insert: {
          created_at?: string
          data_source_id?: string | null
          duplicate_rows_skipped?: number | null
          error_message?: string | null
          id?: string
          rows_fetched?: number | null
          rows_imported?: number | null
          rows_updated?: number | null
          sync_completed_at?: string | null
          sync_started_at?: string
          sync_status?: string
          triggered_by?: string | null
        }
        Update: {
          created_at?: string
          data_source_id?: string | null
          duplicate_rows_skipped?: number | null
          error_message?: string | null
          id?: string
          rows_fetched?: number | null
          rows_imported?: number | null
          rows_updated?: number | null
          sync_completed_at?: string | null
          sync_started_at?: string
          sync_status?: string
          triggered_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "roas_sync_logs_data_source_id_fkey"
            columns: ["data_source_id"]
            isOneToOne: false
            referencedRelation: "roas_data_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      roas_webinars: {
        Row: {
          created_at: string
          gst_rate: number
          id: string
          landing_page_url: string | null
          offer_name: string | null
          program_price: number
          status: string
          updated_at: string
          webinar_end_date: string | null
          webinar_name: string
          webinar_start_date: string | null
        }
        Insert: {
          created_at?: string
          gst_rate?: number
          id?: string
          landing_page_url?: string | null
          offer_name?: string | null
          program_price?: number
          status?: string
          updated_at?: string
          webinar_end_date?: string | null
          webinar_name: string
          webinar_start_date?: string | null
        }
        Update: {
          created_at?: string
          gst_rate?: number
          id?: string
          landing_page_url?: string | null
          offer_name?: string | null
          program_price?: number
          status?: string
          updated_at?: string
          webinar_end_date?: string | null
          webinar_name?: string
          webinar_start_date?: string | null
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
      webinar_templates: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      webinars: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
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
        | "true-absentee"
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
        "true-absentee",
      ],
      lead_type: ["paid", "unpaid"],
      pipeline_type: ["unpaid", "paid", "custom"],
      user_status: ["pending", "active"],
    },
  },
} as const
