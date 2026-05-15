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
      attribution_attendee_lists: {
        Row: {
          column_mapping: Json | null
          file_name: string | null
          file_path: string | null
          file_size_bytes: number | null
          headers: Json | null
          id: string
          notes: string | null
          parsed_rows: Json | null
          row_count: number
          session_id: string
          sheet_id: string | null
          sheet_url: string | null
          slot_date: string | null
          slot_label: string
          slot_order: number
          slot_type: string
          source_kind: string
          tab_gid: string | null
          tab_name: string | null
          uploaded_at: string
          uploaded_by: string | null
        }
        Insert: {
          column_mapping?: Json | null
          file_name?: string | null
          file_path?: string | null
          file_size_bytes?: number | null
          headers?: Json | null
          id?: string
          notes?: string | null
          parsed_rows?: Json | null
          row_count?: number
          session_id: string
          sheet_id?: string | null
          sheet_url?: string | null
          slot_date?: string | null
          slot_label: string
          slot_order?: number
          slot_type: string
          source_kind: string
          tab_gid?: string | null
          tab_name?: string | null
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Update: {
          column_mapping?: Json | null
          file_name?: string | null
          file_path?: string | null
          file_size_bytes?: number | null
          headers?: Json | null
          id?: string
          notes?: string | null
          parsed_rows?: Json | null
          row_count?: number
          session_id?: string
          sheet_id?: string | null
          sheet_url?: string | null
          slot_date?: string | null
          slot_label?: string
          slot_order?: number
          slot_type?: string
          source_kind?: string
          tab_gid?: string | null
          tab_name?: string | null
          uploaded_at?: string
          uploaded_by?: string | null
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
          deleted_at: string | null
          deleted_by: string | null
          duplicate_conflicts_count: number | null
          fetch_log_id: string | null
          id: string
          input_snapshot_hash: string | null
          is_deleted: boolean
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
          updated_at: string | null
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
          deleted_at?: string | null
          deleted_by?: string | null
          duplicate_conflicts_count?: number | null
          fetch_log_id?: string | null
          id?: string
          input_snapshot_hash?: string | null
          is_deleted?: boolean
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
          updated_at?: string | null
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
          deleted_at?: string | null
          deleted_by?: string | null
          duplicate_conflicts_count?: number | null
          fetch_log_id?: string | null
          id?: string
          input_snapshot_hash?: string | null
          is_deleted?: boolean
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
          updated_at?: string | null
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
      business_units: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
        }
        Relationships: []
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
          is_manual_lead_override: boolean
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
          is_manual_lead_override?: boolean
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
          is_manual_lead_override?: boolean
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
          deleted_at: string | null
          deleted_by: string | null
          id: string
          input_hash: string | null
          is_deleted: boolean
          metric_template_id: string | null
          notes: string | null
          overall_cpl: number
          report_date: string
          report_name: string | null
          report_status: string
          total_ad_spend: number
          total_leads: number
          updated_at: string
          whatsapp_message: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          input_hash?: string | null
          is_deleted?: boolean
          metric_template_id?: string | null
          notes?: string | null
          overall_cpl?: number
          report_date: string
          report_name?: string | null
          report_status?: string
          total_ad_spend?: number
          total_leads?: number
          updated_at?: string
          whatsapp_message?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          input_hash?: string | null
          is_deleted?: boolean
          metric_template_id?: string | null
          notes?: string | null
          overall_cpl?: number
          report_date?: string
          report_name?: string | null
          report_status?: string
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
      incentives: {
        Row: {
          amount: number
          business_unit: string | null
          cadence: string | null
          cost_classification: string | null
          created_at: string
          created_by: string | null
          id: string
          incentive_date: string | null
          incentive_type: string | null
          notes: string | null
          reason: string | null
          team_member_id: string | null
          team_member_name_snapshot: string | null
          updated_at: string
        }
        Insert: {
          amount?: number
          business_unit?: string | null
          cadence?: string | null
          cost_classification?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          incentive_date?: string | null
          incentive_type?: string | null
          notes?: string | null
          reason?: string | null
          team_member_id?: string | null
          team_member_name_snapshot?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          business_unit?: string | null
          cadence?: string | null
          cost_classification?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          incentive_date?: string | null
          incentive_type?: string | null
          notes?: string | null
          reason?: string | null
          team_member_id?: string | null
          team_member_name_snapshot?: string | null
          updated_at?: string
        }
        Relationships: []
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
      paid_pipeline_activity_logs: {
        Row: {
          activity_type: string
          created_at: string
          created_by: string | null
          id: string
          new_value: Json | null
          note: string | null
          old_value: Json | null
          paid_pipeline_lead_id: string
        }
        Insert: {
          activity_type: string
          created_at?: string
          created_by?: string | null
          id?: string
          new_value?: Json | null
          note?: string | null
          old_value?: Json | null
          paid_pipeline_lead_id: string
        }
        Update: {
          activity_type?: string
          created_at?: string
          created_by?: string | null
          id?: string
          new_value?: Json | null
          note?: string | null
          old_value?: Json | null
          paid_pipeline_lead_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "paid_pipeline_activity_logs_paid_pipeline_lead_id_fkey"
            columns: ["paid_pipeline_lead_id"]
            isOneToOne: false
            referencedRelation: "paid_pipeline_leads"
            referencedColumns: ["id"]
          },
        ]
      }
      paid_pipeline_finance_details: {
        Row: {
          application_date: string | null
          approval_date: string | null
          created_at: string
          disbursement_date: string | null
          down_payment: number
          finance_partner: string | null
          finance_status: string | null
          id: string
          loan_amount: number
          notes: string | null
          paid_pipeline_lead_id: string
          rejection_reason: string | null
          updated_at: string
        }
        Insert: {
          application_date?: string | null
          approval_date?: string | null
          created_at?: string
          disbursement_date?: string | null
          down_payment?: number
          finance_partner?: string | null
          finance_status?: string | null
          id?: string
          loan_amount?: number
          notes?: string | null
          paid_pipeline_lead_id: string
          rejection_reason?: string | null
          updated_at?: string
        }
        Update: {
          application_date?: string | null
          approval_date?: string | null
          created_at?: string
          disbursement_date?: string | null
          down_payment?: number
          finance_partner?: string | null
          finance_status?: string | null
          id?: string
          loan_amount?: number
          notes?: string | null
          paid_pipeline_lead_id?: string
          rejection_reason?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "paid_pipeline_finance_details_paid_pipeline_lead_id_fkey"
            columns: ["paid_pipeline_lead_id"]
            isOneToOne: true
            referencedRelation: "paid_pipeline_leads"
            referencedColumns: ["id"]
          },
        ]
      }
      paid_pipeline_followups: {
        Row: {
          assigned_to: string | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          follow_up_date: string
          follow_up_reason: string | null
          follow_up_time: string | null
          id: string
          notes: string | null
          paid_pipeline_lead_id: string
          priority: string | null
          status: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          follow_up_date: string
          follow_up_reason?: string | null
          follow_up_time?: string | null
          id?: string
          notes?: string | null
          paid_pipeline_lead_id: string
          priority?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          follow_up_date?: string
          follow_up_reason?: string | null
          follow_up_time?: string | null
          id?: string
          notes?: string | null
          paid_pipeline_lead_id?: string
          priority?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      paid_pipeline_leads: {
        Row: {
          assigned_sales_executive: string | null
          attributed_media_buyer: string | null
          attribution_sale_id: string | null
          attribution_session_id: string | null
          balance_category: string | null
          balance_description: string | null
          balance_pending: number
          business_unit: string
          created_at: string
          created_by: string | null
          created_from_attribution: boolean
          crm_lead_id: string | null
          crm_pipeline_id: string | null
          crm_stage_id: string | null
          deal_value_including_gst: number
          default_token_amount: number
          deleted_at: string | null
          deleted_by: string | null
          email: string | null
          final_revenue_realized: number
          finance_follow_up_date: string | null
          finance_notes: string | null
          finance_owner: string | null
          finance_partner: string | null
          finance_required: boolean
          finance_status: string | null
          follow_up_date: string | null
          follow_up_priority: string | null
          follow_up_reason: string | null
          follow_up_status: string | null
          id: string
          is_deleted: boolean
          is_dropped: boolean
          is_enrolled: boolean
          is_final_sale: boolean
          is_refunded: boolean
          lead_temperature: string | null
          match_method: string | null
          name: string | null
          next_balance_follow_up_date: string | null
          next_follow_up_date: string | null
          next_follow_up_time: string | null
          notes: string | null
          onboarding_batch_name: string | null
          paid_batch_name: string | null
          payment_model: string | null
          payment_status: string | null
          phone: string | null
          pipeline_stage: string | null
          product_id: string | null
          product_name_snapshot: string | null
          revenue_recognition_rule: string | null
          revenue_to_be_realized: number | null
          sent_to_crm: boolean | null
          sent_to_crm_at: string | null
          source_report_date: string | null
          source_webinar: string | null
          token_amount_collected: number
          total_collected: number
          updated_at: string
          webinar_batch_id: string | null
        }
        Insert: {
          assigned_sales_executive?: string | null
          attributed_media_buyer?: string | null
          attribution_sale_id?: string | null
          attribution_session_id?: string | null
          balance_category?: string | null
          balance_description?: string | null
          balance_pending?: number
          business_unit?: string
          created_at?: string
          created_by?: string | null
          created_from_attribution?: boolean
          crm_lead_id?: string | null
          crm_pipeline_id?: string | null
          crm_stage_id?: string | null
          deal_value_including_gst?: number
          default_token_amount?: number
          deleted_at?: string | null
          deleted_by?: string | null
          email?: string | null
          final_revenue_realized?: number
          finance_follow_up_date?: string | null
          finance_notes?: string | null
          finance_owner?: string | null
          finance_partner?: string | null
          finance_required?: boolean
          finance_status?: string | null
          follow_up_date?: string | null
          follow_up_priority?: string | null
          follow_up_reason?: string | null
          follow_up_status?: string | null
          id?: string
          is_deleted?: boolean
          is_dropped?: boolean
          is_enrolled?: boolean
          is_final_sale?: boolean
          is_refunded?: boolean
          lead_temperature?: string | null
          match_method?: string | null
          name?: string | null
          next_balance_follow_up_date?: string | null
          next_follow_up_date?: string | null
          next_follow_up_time?: string | null
          notes?: string | null
          onboarding_batch_name?: string | null
          paid_batch_name?: string | null
          payment_model?: string | null
          payment_status?: string | null
          phone?: string | null
          pipeline_stage?: string | null
          product_id?: string | null
          product_name_snapshot?: string | null
          revenue_recognition_rule?: string | null
          revenue_to_be_realized?: number | null
          sent_to_crm?: boolean | null
          sent_to_crm_at?: string | null
          source_report_date?: string | null
          source_webinar?: string | null
          token_amount_collected?: number
          total_collected?: number
          updated_at?: string
          webinar_batch_id?: string | null
        }
        Update: {
          assigned_sales_executive?: string | null
          attributed_media_buyer?: string | null
          attribution_sale_id?: string | null
          attribution_session_id?: string | null
          balance_category?: string | null
          balance_description?: string | null
          balance_pending?: number
          business_unit?: string
          created_at?: string
          created_by?: string | null
          created_from_attribution?: boolean
          crm_lead_id?: string | null
          crm_pipeline_id?: string | null
          crm_stage_id?: string | null
          deal_value_including_gst?: number
          default_token_amount?: number
          deleted_at?: string | null
          deleted_by?: string | null
          email?: string | null
          final_revenue_realized?: number
          finance_follow_up_date?: string | null
          finance_notes?: string | null
          finance_owner?: string | null
          finance_partner?: string | null
          finance_required?: boolean
          finance_status?: string | null
          follow_up_date?: string | null
          follow_up_priority?: string | null
          follow_up_reason?: string | null
          follow_up_status?: string | null
          id?: string
          is_deleted?: boolean
          is_dropped?: boolean
          is_enrolled?: boolean
          is_final_sale?: boolean
          is_refunded?: boolean
          lead_temperature?: string | null
          match_method?: string | null
          name?: string | null
          next_balance_follow_up_date?: string | null
          next_follow_up_date?: string | null
          next_follow_up_time?: string | null
          notes?: string | null
          onboarding_batch_name?: string | null
          paid_batch_name?: string | null
          payment_model?: string | null
          payment_status?: string | null
          phone?: string | null
          pipeline_stage?: string | null
          product_id?: string | null
          product_name_snapshot?: string | null
          revenue_recognition_rule?: string | null
          revenue_to_be_realized?: number | null
          sent_to_crm?: boolean | null
          sent_to_crm_at?: string | null
          source_report_date?: string | null
          source_webinar?: string | null
          token_amount_collected?: number
          total_collected?: number
          updated_at?: string
          webinar_batch_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "paid_pipeline_leads_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "program_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "paid_pipeline_leads_webinar_batch_id_fkey"
            columns: ["webinar_batch_id"]
            isOneToOne: false
            referencedRelation: "webinar_batches"
            referencedColumns: ["id"]
          },
        ]
      }
      paid_pipeline_payments: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          finance_linked: boolean | null
          id: string
          is_deleted: boolean
          is_final_payment: boolean
          is_token: boolean
          next_payment_expected_date: string | null
          notes: string | null
          paid_pipeline_lead_id: string
          payment_category: string | null
          payment_date: string
          payment_description: string | null
          payment_mode: string | null
          payment_reference: string | null
          payment_type: string
        }
        Insert: {
          amount?: number
          created_at?: string
          created_by?: string | null
          finance_linked?: boolean | null
          id?: string
          is_deleted?: boolean
          is_final_payment?: boolean
          is_token?: boolean
          next_payment_expected_date?: string | null
          notes?: string | null
          paid_pipeline_lead_id: string
          payment_category?: string | null
          payment_date?: string
          payment_description?: string | null
          payment_mode?: string | null
          payment_reference?: string | null
          payment_type: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          finance_linked?: boolean | null
          id?: string
          is_deleted?: boolean
          is_final_payment?: boolean
          is_token?: boolean
          next_payment_expected_date?: string | null
          notes?: string | null
          paid_pipeline_lead_id?: string
          payment_category?: string | null
          payment_date?: string
          payment_description?: string | null
          payment_mode?: string | null
          payment_reference?: string | null
          payment_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "paid_pipeline_payments_paid_pipeline_lead_id_fkey"
            columns: ["paid_pipeline_lead_id"]
            isOneToOne: false
            referencedRelation: "paid_pipeline_leads"
            referencedColumns: ["id"]
          },
        ]
      }
      paid_pipeline_settings: {
        Row: {
          business_unit: string | null
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          is_deleted: boolean
          is_system: boolean
          label: string
          setting_type: string
          sort_order: number
          updated_at: string
          value: string | null
        }
        Insert: {
          business_unit?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          is_deleted?: boolean
          is_system?: boolean
          label: string
          setting_type: string
          sort_order?: number
          updated_at?: string
          value?: string | null
        }
        Update: {
          business_unit?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          is_deleted?: boolean
          is_system?: boolean
          label?: string
          setting_type?: string
          sort_order?: number
          updated_at?: string
          value?: string | null
        }
        Relationships: []
      }
      paid_pipeline_to_crm_links: {
        Row: {
          crm_lead_id: string | null
          crm_pipeline_id: string | null
          crm_stage_id: string | null
          id: string
          notes: string | null
          onboarding_batch_name: string | null
          paid_pipeline_lead_id: string
          sent_at: string
          sent_by: string | null
        }
        Insert: {
          crm_lead_id?: string | null
          crm_pipeline_id?: string | null
          crm_stage_id?: string | null
          id?: string
          notes?: string | null
          onboarding_batch_name?: string | null
          paid_pipeline_lead_id: string
          sent_at?: string
          sent_by?: string | null
        }
        Update: {
          crm_lead_id?: string | null
          crm_pipeline_id?: string | null
          crm_stage_id?: string | null
          id?: string
          notes?: string | null
          onboarding_batch_name?: string | null
          paid_pipeline_lead_id?: string
          sent_at?: string
          sent_by?: string | null
        }
        Relationships: []
      }
      payroll_run_entries: {
        Row: {
          base_monthly_salary: number | null
          calculated_amount: number
          cost_classification: string | null
          created_at: string
          daily_wage: number | null
          excluded: boolean
          exit_date: string | null
          expense_category: string | null
          final_payable_amount: number
          hourly_rate: number | null
          hours_worked: number | null
          id: string
          joining_date: string | null
          manual_adjustment_amount: number
          one_time_pay: number | null
          pay_type: string | null
          payable_days: number | null
          payroll_run_id: string
          period_end: string | null
          period_start: string | null
          reason: string | null
          role_snapshot: string | null
          status: string
          team_member_id: string | null
          team_member_name_snapshot: string | null
          total_period_days: number | null
          updated_at: string
        }
        Insert: {
          base_monthly_salary?: number | null
          calculated_amount?: number
          cost_classification?: string | null
          created_at?: string
          daily_wage?: number | null
          excluded?: boolean
          exit_date?: string | null
          expense_category?: string | null
          final_payable_amount?: number
          hourly_rate?: number | null
          hours_worked?: number | null
          id?: string
          joining_date?: string | null
          manual_adjustment_amount?: number
          one_time_pay?: number | null
          pay_type?: string | null
          payable_days?: number | null
          payroll_run_id: string
          period_end?: string | null
          period_start?: string | null
          reason?: string | null
          role_snapshot?: string | null
          status?: string
          team_member_id?: string | null
          team_member_name_snapshot?: string | null
          total_period_days?: number | null
          updated_at?: string
        }
        Update: {
          base_monthly_salary?: number | null
          calculated_amount?: number
          cost_classification?: string | null
          created_at?: string
          daily_wage?: number | null
          excluded?: boolean
          exit_date?: string | null
          expense_category?: string | null
          final_payable_amount?: number
          hourly_rate?: number | null
          hours_worked?: number | null
          id?: string
          joining_date?: string | null
          manual_adjustment_amount?: number
          one_time_pay?: number | null
          pay_type?: string | null
          payable_days?: number | null
          payroll_run_id?: string
          period_end?: string | null
          period_start?: string | null
          reason?: string | null
          role_snapshot?: string | null
          status?: string
          team_member_id?: string | null
          team_member_name_snapshot?: string | null
          total_period_days?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payroll_run_entries_payroll_run_id_fkey"
            columns: ["payroll_run_id"]
            isOneToOne: false
            referencedRelation: "payroll_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_runs: {
        Row: {
          business_unit: string
          created_at: string
          created_by: string | null
          disbursement_date: string | null
          id: string
          notes: string | null
          period_end: string
          period_start: string
          salary_cycle: string | null
          statement_basis: string
          statement_month: string
          status: string
          total_payroll_amount: number
          updated_at: string
        }
        Insert: {
          business_unit?: string
          created_at?: string
          created_by?: string | null
          disbursement_date?: string | null
          id?: string
          notes?: string | null
          period_end: string
          period_start: string
          salary_cycle?: string | null
          statement_basis?: string
          statement_month: string
          status?: string
          total_payroll_amount?: number
          updated_at?: string
        }
        Update: {
          business_unit?: string
          created_at?: string
          created_by?: string | null
          disbursement_date?: string | null
          id?: string
          notes?: string | null
          period_end?: string
          period_start?: string
          salary_cycle?: string | null
          statement_basis?: string
          statement_month?: string
          status?: string
          total_payroll_amount?: number
          updated_at?: string
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
      profit_statement_lines: {
        Row: {
          amount: number
          bucket: string
          category: string | null
          created_at: string
          id: string
          label: string
          notes: string | null
          profit_statement_id: string
          source_id: string | null
          source_type: string | null
        }
        Insert: {
          amount?: number
          bucket: string
          category?: string | null
          created_at?: string
          id?: string
          label: string
          notes?: string | null
          profit_statement_id: string
          source_id?: string | null
          source_type?: string | null
        }
        Update: {
          amount?: number
          bucket?: string
          category?: string | null
          created_at?: string
          id?: string
          label?: string
          notes?: string | null
          profit_statement_id?: string
          source_id?: string | null
          source_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profit_statement_lines_profit_statement_id_fkey"
            columns: ["profit_statement_id"]
            isOneToOne: false
            referencedRelation: "profit_statements"
            referencedColumns: ["id"]
          },
        ]
      }
      profit_statements: {
        Row: {
          business_unit: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          deleted_by: string | null
          gross_profit: number
          id: string
          is_deleted: boolean
          net_margin: number
          net_profit: number
          notes: string | null
          statement_basis: string
          statement_month: string
          status: string
          total_cogs: number
          total_fixed_expense: number
          total_incentives: number
          total_one_time_expense: number
          total_operating_expense: number
          total_payroll: number
          total_revenue: number
          total_variable_expense: number
          updated_at: string
        }
        Insert: {
          business_unit?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          gross_profit?: number
          id?: string
          is_deleted?: boolean
          net_margin?: number
          net_profit?: number
          notes?: string | null
          statement_basis?: string
          statement_month: string
          status?: string
          total_cogs?: number
          total_fixed_expense?: number
          total_incentives?: number
          total_one_time_expense?: number
          total_operating_expense?: number
          total_payroll?: number
          total_revenue?: number
          total_variable_expense?: number
          updated_at?: string
        }
        Update: {
          business_unit?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          gross_profit?: number
          id?: string
          is_deleted?: boolean
          net_margin?: number
          net_profit?: number
          notes?: string | null
          statement_basis?: string
          statement_month?: string
          status?: string
          total_cogs?: number
          total_fixed_expense?: number
          total_incentives?: number
          total_one_time_expense?: number
          total_operating_expense?: number
          total_payroll?: number
          total_revenue?: number
          total_variable_expense?: number
          updated_at?: string
        }
        Relationships: []
      }
      program_products: {
        Row: {
          business_unit: string
          created_at: string
          created_by: string | null
          currency: string
          default_token_amount: number
          gst_applicable: boolean
          gst_rate: number
          id: string
          is_active: boolean
          is_deleted: boolean
          notes: string | null
          product_name: string
          product_price_including_gst: number
          revenue_recognition_rule: string
          updated_at: string
        }
        Insert: {
          business_unit?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          default_token_amount?: number
          gst_applicable?: boolean
          gst_rate?: number
          id?: string
          is_active?: boolean
          is_deleted?: boolean
          notes?: string | null
          product_name: string
          product_price_including_gst?: number
          revenue_recognition_rule?: string
          updated_at?: string
        }
        Update: {
          business_unit?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          default_token_amount?: number
          gst_applicable?: boolean
          gst_rate?: number
          id?: string
          is_active?: boolean
          is_deleted?: boolean
          notes?: string | null
          product_name?: string
          product_price_including_gst?: number
          revenue_recognition_rule?: string
          updated_at?: string
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
      recurring_expense_templates: {
        Row: {
          amount: number
          business_unit: string | null
          category: string | null
          cost_classification: string | null
          created_at: string
          created_by: string | null
          end_date: string | null
          expense_name: string
          frequency: string
          id: string
          is_active: boolean
          notes: string | null
          start_date: string | null
          updated_at: string
        }
        Insert: {
          amount?: number
          business_unit?: string | null
          category?: string | null
          cost_classification?: string | null
          created_at?: string
          created_by?: string | null
          end_date?: string | null
          expense_name: string
          frequency?: string
          id?: string
          is_active?: boolean
          notes?: string | null
          start_date?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          business_unit?: string | null
          category?: string | null
          cost_classification?: string | null
          created_at?: string
          created_by?: string | null
          end_date?: string | null
          expense_name?: string
          frequency?: string
          id?: string
          is_active?: boolean
          notes?: string | null
          start_date?: string | null
          updated_at?: string
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
      seminar_roas_report_days: {
        Row: {
          created_at: string
          date: string | null
          day_number: number
          drop_rate: number | null
          duration_minutes: number | null
          end_time: string | null
          id: string
          is_sales_day: boolean
          registrations: number
          report_id: string
          show_up: number
          show_up_rate: number | null
          start_time: string | null
          watch_or_offer_present: number
          watch_point_time: string | null
        }
        Insert: {
          created_at?: string
          date?: string | null
          day_number: number
          drop_rate?: number | null
          duration_minutes?: number | null
          end_time?: string | null
          id?: string
          is_sales_day?: boolean
          registrations?: number
          report_id: string
          show_up?: number
          show_up_rate?: number | null
          start_time?: string | null
          watch_or_offer_present?: number
          watch_point_time?: string | null
        }
        Update: {
          created_at?: string
          date?: string | null
          day_number?: number
          drop_rate?: number | null
          duration_minutes?: number | null
          end_time?: string | null
          id?: string
          is_sales_day?: boolean
          registrations?: number
          report_id?: string
          show_up?: number
          show_up_rate?: number | null
          start_time?: string | null
          watch_or_offer_present?: number
          watch_point_time?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "seminar_roas_report_days_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "seminar_roas_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      seminar_roas_report_products: {
        Row: {
          created_at: string
          deal_price_including_gst: number
          id: string
          payment_type: string
          report_id: string
          revenue_counted: number
          sort_order: number
          token_down_payment: number | null
          units_sold: number
        }
        Insert: {
          created_at?: string
          deal_price_including_gst?: number
          id?: string
          payment_type: string
          report_id: string
          revenue_counted?: number
          sort_order?: number
          token_down_payment?: number | null
          units_sold?: number
        }
        Update: {
          created_at?: string
          deal_price_including_gst?: number
          id?: string
          payment_type?: string
          report_id?: string
          revenue_counted?: number
          sort_order?: number
          token_down_payment?: number | null
          units_sold?: number
        }
        Relationships: [
          {
            foreignKeyName: "seminar_roas_report_products_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "seminar_roas_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      seminar_roas_reports: {
        Row: {
          ad_cost_excluding_gst: number
          ad_gst: number
          conversion_rate: number | null
          conversion_rate_basis: string | null
          cpa: number | null
          cpl: number | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          deleted_by: string | null
          id: string
          input_snapshot_json: Json | null
          is_deleted: boolean
          net_gst_payable_to_govt: number
          output_snapshot_json: Json | null
          profit_after_gst: number
          report_name: string | null
          revenue_basis: string
          roas: number | null
          sales_day: number | null
          timing_note: string | null
          total_ad_spend_including_gst: number
          total_conversions: number
          total_revenue_including_gst: number
          total_webinar_days: number
          updated_at: string
          watch_point_percent: number
          watch_point_time: string | null
          webinar_duration_minutes: number | null
          webinar_end_time: string | null
          webinar_mode: string | null
          webinar_name: string
          webinar_start_time: string | null
          whatsapp_summary_text: string | null
        }
        Insert: {
          ad_cost_excluding_gst?: number
          ad_gst?: number
          conversion_rate?: number | null
          conversion_rate_basis?: string | null
          cpa?: number | null
          cpl?: number | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          input_snapshot_json?: Json | null
          is_deleted?: boolean
          net_gst_payable_to_govt?: number
          output_snapshot_json?: Json | null
          profit_after_gst?: number
          report_name?: string | null
          revenue_basis?: string
          roas?: number | null
          sales_day?: number | null
          timing_note?: string | null
          total_ad_spend_including_gst?: number
          total_conversions?: number
          total_revenue_including_gst?: number
          total_webinar_days?: number
          updated_at?: string
          watch_point_percent?: number
          watch_point_time?: string | null
          webinar_duration_minutes?: number | null
          webinar_end_time?: string | null
          webinar_mode?: string | null
          webinar_name: string
          webinar_start_time?: string | null
          whatsapp_summary_text?: string | null
        }
        Update: {
          ad_cost_excluding_gst?: number
          ad_gst?: number
          conversion_rate?: number | null
          conversion_rate_basis?: string | null
          cpa?: number | null
          cpl?: number | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          input_snapshot_json?: Json | null
          is_deleted?: boolean
          net_gst_payable_to_govt?: number
          output_snapshot_json?: Json | null
          profit_after_gst?: number
          report_name?: string | null
          revenue_basis?: string
          roas?: number | null
          sales_day?: number | null
          timing_note?: string | null
          total_ad_spend_including_gst?: number
          total_conversions?: number
          total_revenue_including_gst?: number
          total_webinar_days?: number
          updated_at?: string
          watch_point_percent?: number
          watch_point_time?: string | null
          webinar_duration_minutes?: number | null
          webinar_end_time?: string | null
          webinar_mode?: string | null
          webinar_name?: string
          webinar_start_time?: string | null
          whatsapp_summary_text?: string | null
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
      team_payroll_profiles: {
        Row: {
          business_unit: string | null
          created_at: string
          created_by: string | null
          custom_cycle_end_day: number | null
          custom_cycle_start_day: number | null
          daily_wage: number
          department_snapshot: string | null
          disbursement_end_day: number | null
          disbursement_start_day: number | null
          exit_date: string | null
          full_name_snapshot: string | null
          hourly_rate: number
          id: string
          is_active: boolean
          joining_date: string | null
          monthly_salary: number
          notes: string | null
          one_time_pay: number
          pay_type: string
          payroll_applicable: boolean
          pnl_cost_classification: string | null
          role_snapshot: string | null
          salary_cycle: string | null
          salary_expense_category: string | null
          team_member_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          business_unit?: string | null
          created_at?: string
          created_by?: string | null
          custom_cycle_end_day?: number | null
          custom_cycle_start_day?: number | null
          daily_wage?: number
          department_snapshot?: string | null
          disbursement_end_day?: number | null
          disbursement_start_day?: number | null
          exit_date?: string | null
          full_name_snapshot?: string | null
          hourly_rate?: number
          id?: string
          is_active?: boolean
          joining_date?: string | null
          monthly_salary?: number
          notes?: string | null
          one_time_pay?: number
          pay_type?: string
          payroll_applicable?: boolean
          pnl_cost_classification?: string | null
          role_snapshot?: string | null
          salary_cycle?: string | null
          salary_expense_category?: string | null
          team_member_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          business_unit?: string | null
          created_at?: string
          created_by?: string | null
          custom_cycle_end_day?: number | null
          custom_cycle_start_day?: number | null
          daily_wage?: number
          department_snapshot?: string | null
          disbursement_end_day?: number | null
          disbursement_start_day?: number | null
          exit_date?: string | null
          full_name_snapshot?: string | null
          hourly_rate?: number
          id?: string
          is_active?: boolean
          joining_date?: string | null
          monthly_salary?: number
          notes?: string | null
          one_time_pay?: number
          pay_type?: string
          payroll_applicable?: boolean
          pnl_cost_classification?: string | null
          role_snapshot?: string | null
          salary_cycle?: string | null
          salary_expense_category?: string | null
          team_member_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      team_salary_history: {
        Row: {
          change_reason: string | null
          changed_by: string | null
          created_at: string
          effective_from: string | null
          effective_to: string | null
          id: string
          new_amount: number | null
          new_pay_type: string | null
          old_amount: number | null
          old_pay_type: string | null
          team_member_id: string
        }
        Insert: {
          change_reason?: string | null
          changed_by?: string | null
          created_at?: string
          effective_from?: string | null
          effective_to?: string | null
          id?: string
          new_amount?: number | null
          new_pay_type?: string | null
          old_amount?: number | null
          old_pay_type?: string | null
          team_member_id: string
        }
        Update: {
          change_reason?: string | null
          changed_by?: string | null
          created_at?: string
          effective_from?: string | null
          effective_to?: string | null
          id?: string
          new_amount?: number | null
          new_pay_type?: string | null
          old_amount?: number | null
          old_pay_type?: string | null
          team_member_id?: string
        }
        Relationships: []
      }
      user_module_access: {
        Row: {
          created_at: string
          granted_by: string | null
          id: string
          module_key: string
          user_id: string
        }
        Insert: {
          created_at?: string
          granted_by?: string | null
          id?: string
          module_key: string
          user_id: string
        }
        Update: {
          created_at?: string
          granted_by?: string | null
          id?: string
          module_key?: string
          user_id?: string
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
      webinar_batches: {
        Row: {
          batch_name: string
          business_unit: string
          created_at: string
          created_by: string | null
          id: string
          is_deleted: boolean
          notes: string | null
          offer_name: string | null
          source_attribution_report_id: string | null
          source_attribution_session_id: string | null
          source_created_from: string | null
          source_report_type: string | null
          updated_at: string
          webinar_date: string | null
          webinar_name: string
          webinar_type: string | null
        }
        Insert: {
          batch_name: string
          business_unit?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_deleted?: boolean
          notes?: string | null
          offer_name?: string | null
          source_attribution_report_id?: string | null
          source_attribution_session_id?: string | null
          source_created_from?: string | null
          source_report_type?: string | null
          updated_at?: string
          webinar_date?: string | null
          webinar_name: string
          webinar_type?: string | null
        }
        Update: {
          batch_name?: string
          business_unit?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_deleted?: boolean
          notes?: string | null
          offer_name?: string | null
          source_attribution_report_id?: string | null
          source_attribution_session_id?: string | null
          source_created_from?: string | null
          source_report_type?: string | null
          updated_at?: string
          webinar_date?: string | null
          webinar_name?: string
          webinar_type?: string | null
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
      purge_old_deleted_reports: { Args: never; Returns: Json }
      search_students: {
        Args: { _limit?: number; _q: string }
        Returns: {
          email: string
          full_name: string
          phone: string
          source: string
          tier: string
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
