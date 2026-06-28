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
      access_readiness_logs: {
        Row: {
          action: string
          blocker_reason: string | null
          channel: string | null
          created_at: string
          id: string
          metadata: Json | null
          new_status: string | null
          note: string | null
          paid_pipeline_lead_id: string
          performed_by: string | null
          performed_by_name: string | null
          previous_status: string | null
        }
        Insert: {
          action: string
          blocker_reason?: string | null
          channel?: string | null
          created_at?: string
          id?: string
          metadata?: Json | null
          new_status?: string | null
          note?: string | null
          paid_pipeline_lead_id: string
          performed_by?: string | null
          performed_by_name?: string | null
          previous_status?: string | null
        }
        Update: {
          action?: string
          blocker_reason?: string | null
          channel?: string | null
          created_at?: string
          id?: string
          metadata?: Json | null
          new_status?: string | null
          note?: string | null
          paid_pipeline_lead_id?: string
          performed_by?: string | null
          performed_by_name?: string | null
          previous_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "access_readiness_logs_paid_pipeline_lead_id_fkey"
            columns: ["paid_pipeline_lead_id"]
            isOneToOne: false
            referencedRelation: "paid_pipeline_leads"
            referencedColumns: ["id"]
          },
        ]
      }
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
      app_settings: {
        Row: {
          business_unit: string | null
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          is_deleted: boolean
          setting_group: string
          setting_key: string
          setting_value: Json | null
          updated_at: string
        }
        Insert: {
          business_unit?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          is_deleted?: boolean
          setting_group: string
          setting_key: string
          setting_value?: Json | null
          updated_at?: string
        }
        Update: {
          business_unit?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          is_deleted?: boolean
          setting_group?: string
          setting_key?: string
          setting_value?: Json | null
          updated_at?: string
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
          ad_spend_tax_mode: string | null
          conversion_rate: number
          cpl: number
          created_at: string
          entered_ad_spend: number | null
          gross_ad_spend: number | null
          gst_amount: number | null
          gst_rate: number | null
          id: string
          matched_sales: number
          media_buyer_name: string
          net_ad_spend: number | null
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
          ad_spend_tax_mode?: string | null
          conversion_rate?: number
          cpl?: number
          created_at?: string
          entered_ad_spend?: number | null
          gross_ad_spend?: number | null
          gst_amount?: number | null
          gst_rate?: number | null
          id?: string
          matched_sales?: number
          media_buyer_name: string
          net_ad_spend?: number | null
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
          ad_spend_tax_mode?: string | null
          conversion_rate?: number
          cpl?: number
          created_at?: string
          entered_ad_spend?: number | null
          gross_ad_spend?: number | null
          gst_amount?: number | null
          gst_rate?: number | null
          id?: string
          matched_sales?: number
          media_buyer_name?: string
          net_ad_spend?: number | null
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
          ad_spend_tax_mode: string | null
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
          gst_rate: number | null
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
          roas_spend_basis: string | null
          saved_from_draft_id: string | null
          session_slot: string | null
          tab_role_mapping: Json | null
          total_ad_spend: number
          total_gross_ad_spend: number | null
          total_gst_amount: number | null
          total_leads: number
          total_net_ad_spend: number | null
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
          ad_spend_tax_mode?: string | null
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
          gst_rate?: number | null
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
          roas_spend_basis?: string | null
          saved_from_draft_id?: string | null
          session_slot?: string | null
          tab_role_mapping?: Json | null
          total_ad_spend?: number
          total_gross_ad_spend?: number | null
          total_gst_amount?: number | null
          total_leads?: number
          total_net_ad_spend?: number | null
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
          ad_spend_tax_mode?: string | null
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
          gst_rate?: number | null
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
          roas_spend_basis?: string | null
          saved_from_draft_id?: string | null
          session_slot?: string | null
          tab_role_mapping?: Json | null
          total_ad_spend?: number
          total_gross_ad_spend?: number | null
          total_gst_amount?: number | null
          total_leads?: number
          total_net_ad_spend?: number | null
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
      audit_logs: {
        Row: {
          action_label: string | null
          action_type: string
          actor_email: string | null
          actor_name: string | null
          actor_user_id: string | null
          created_at: string
          entity_id: string | null
          entity_label: string | null
          entity_type: string | null
          id: string
          is_deleted: boolean
          metadata: Json | null
          module_key: string | null
          module_label: string | null
          new_values: Json | null
          old_values: Json | null
          severity: string
          source: string
          summary: string | null
          target_name: string | null
          target_user_id: string | null
        }
        Insert: {
          action_label?: string | null
          action_type: string
          actor_email?: string | null
          actor_name?: string | null
          actor_user_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_label?: string | null
          entity_type?: string | null
          id?: string
          is_deleted?: boolean
          metadata?: Json | null
          module_key?: string | null
          module_label?: string | null
          new_values?: Json | null
          old_values?: Json | null
          severity?: string
          source?: string
          summary?: string | null
          target_name?: string | null
          target_user_id?: string | null
        }
        Update: {
          action_label?: string | null
          action_type?: string
          actor_email?: string | null
          actor_name?: string | null
          actor_user_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_label?: string | null
          entity_type?: string | null
          id?: string
          is_deleted?: boolean
          metadata?: Json | null
          module_key?: string | null
          module_label?: string | null
          new_values?: Json | null
          old_values?: Json | null
          severity?: string
          source?: string
          summary?: string | null
          target_name?: string | null
          target_user_id?: string | null
        }
        Relationships: []
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
      code_of_conduct_automation_events: {
        Row: {
          created_at: string
          created_by: string | null
          crm_lead_id: string | null
          error_message: string | null
          event_type: string
          id: string
          metadata: Json | null
          new_pipeline_id: string | null
          new_stage_id: string | null
          old_pipeline_id: string | null
          old_stage_id: string | null
          paid_pipeline_lead_id: string | null
          request_id: string | null
          rule_id: string | null
          skip_reason: string | null
          status: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          crm_lead_id?: string | null
          error_message?: string | null
          event_type: string
          id?: string
          metadata?: Json | null
          new_pipeline_id?: string | null
          new_stage_id?: string | null
          old_pipeline_id?: string | null
          old_stage_id?: string | null
          paid_pipeline_lead_id?: string | null
          request_id?: string | null
          rule_id?: string | null
          skip_reason?: string | null
          status: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          crm_lead_id?: string | null
          error_message?: string | null
          event_type?: string
          id?: string
          metadata?: Json | null
          new_pipeline_id?: string | null
          new_stage_id?: string | null
          old_pipeline_id?: string | null
          old_stage_id?: string | null
          paid_pipeline_lead_id?: string | null
          request_id?: string | null
          rule_id?: string | null
          skip_reason?: string | null
          status?: string
        }
        Relationships: []
      }
      code_of_conduct_automation_rules: {
        Row: {
          allow_repeat: boolean
          also_update_paid_pipeline_stage: boolean
          created_at: string
          created_by: string | null
          current_pipeline_id: string | null
          current_stage_id: string | null
          destination_paid_pipeline_stage: string | null
          destination_pipeline_id: string
          destination_stage_id: string
          event_type: string
          id: string
          is_active: boolean
          name: string
          source_type: string
          template_id: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          allow_repeat?: boolean
          also_update_paid_pipeline_stage?: boolean
          created_at?: string
          created_by?: string | null
          current_pipeline_id?: string | null
          current_stage_id?: string | null
          destination_paid_pipeline_stage?: string | null
          destination_pipeline_id: string
          destination_stage_id: string
          event_type?: string
          id?: string
          is_active?: boolean
          name: string
          source_type?: string
          template_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          allow_repeat?: boolean
          also_update_paid_pipeline_stage?: boolean
          created_at?: string
          created_by?: string | null
          current_pipeline_id?: string | null
          current_stage_id?: string | null
          destination_paid_pipeline_stage?: string | null
          destination_pipeline_id?: string
          destination_stage_id?: string
          event_type?: string
          id?: string
          is_active?: boolean
          name?: string
          source_type?: string
          template_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      code_of_conduct_events: {
        Row: {
          created_at: string
          created_by: string | null
          event_type: string
          id: string
          metadata: Json | null
          request_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          event_type: string
          id?: string
          metadata?: Json | null
          request_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          event_type?: string
          id?: string
          metadata?: Json | null
          request_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "code_of_conduct_events_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "code_of_conduct_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      code_of_conduct_guide_progress: {
        Row: {
          completed_at: string | null
          created_at: string
          id: string
          last_event_at: string
          metadata: Json
          percent_watched: number
          request_id: string
          updated_at: string
          video_id: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          id?: string
          last_event_at?: string
          metadata?: Json
          percent_watched?: number
          request_id: string
          updated_at?: string
          video_id?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          id?: string
          last_event_at?: string
          metadata?: Json
          percent_watched?: number
          request_id?: string
          updated_at?: string
          video_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "code_of_conduct_guide_progress_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: true
            referencedRelation: "code_of_conduct_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      code_of_conduct_requests: {
        Row: {
          acknowledgement_checkbox: boolean
          acknowledgement_checklist: Json | null
          acknowledgement_email: string | null
          acknowledgement_ip: string | null
          acknowledgement_user_agent: string | null
          admin_copy_email_sent_at: string | null
          cancelled_at: string | null
          cancelled_reason: string | null
          corrected_contact_email: string | null
          created_at: string
          created_by: string | null
          crm_lead_id: string | null
          deal_value: number | null
          email_change_history: Json
          email_error: string | null
          id: string
          last_email_attempt_at: string | null
          last_email_error: string | null
          last_email_error_code: string | null
          member_copy_email_sent_at: string | null
          member_email: string
          member_name: string
          member_phone: string | null
          paid_pipeline_lead_id: string | null
          program_name: string | null
          provider_message_id: string | null
          sent_at: string | null
          signature_data_url: string | null
          signature_name: string | null
          signed_at: string | null
          signed_html_url: string | null
          signed_member_email: string | null
          signed_member_name: string | null
          signed_pdf_generated_at: string | null
          signed_pdf_generation_error: string | null
          signed_pdf_url: string | null
          signed_receipt_generated_at: string | null
          signed_receipt_url: string | null
          status: string
          template_id: string | null
          template_version: string | null
          token_expires_at: string | null
          token_hash: string | null
          updated_at: string
          viewed_at: string | null
          whatsapp_redirect_opened_at: string | null
        }
        Insert: {
          acknowledgement_checkbox?: boolean
          acknowledgement_checklist?: Json | null
          acknowledgement_email?: string | null
          acknowledgement_ip?: string | null
          acknowledgement_user_agent?: string | null
          admin_copy_email_sent_at?: string | null
          cancelled_at?: string | null
          cancelled_reason?: string | null
          corrected_contact_email?: string | null
          created_at?: string
          created_by?: string | null
          crm_lead_id?: string | null
          deal_value?: number | null
          email_change_history?: Json
          email_error?: string | null
          id?: string
          last_email_attempt_at?: string | null
          last_email_error?: string | null
          last_email_error_code?: string | null
          member_copy_email_sent_at?: string | null
          member_email: string
          member_name: string
          member_phone?: string | null
          paid_pipeline_lead_id?: string | null
          program_name?: string | null
          provider_message_id?: string | null
          sent_at?: string | null
          signature_data_url?: string | null
          signature_name?: string | null
          signed_at?: string | null
          signed_html_url?: string | null
          signed_member_email?: string | null
          signed_member_name?: string | null
          signed_pdf_generated_at?: string | null
          signed_pdf_generation_error?: string | null
          signed_pdf_url?: string | null
          signed_receipt_generated_at?: string | null
          signed_receipt_url?: string | null
          status?: string
          template_id?: string | null
          template_version?: string | null
          token_expires_at?: string | null
          token_hash?: string | null
          updated_at?: string
          viewed_at?: string | null
          whatsapp_redirect_opened_at?: string | null
        }
        Update: {
          acknowledgement_checkbox?: boolean
          acknowledgement_checklist?: Json | null
          acknowledgement_email?: string | null
          acknowledgement_ip?: string | null
          acknowledgement_user_agent?: string | null
          admin_copy_email_sent_at?: string | null
          cancelled_at?: string | null
          cancelled_reason?: string | null
          corrected_contact_email?: string | null
          created_at?: string
          created_by?: string | null
          crm_lead_id?: string | null
          deal_value?: number | null
          email_change_history?: Json
          email_error?: string | null
          id?: string
          last_email_attempt_at?: string | null
          last_email_error?: string | null
          last_email_error_code?: string | null
          member_copy_email_sent_at?: string | null
          member_email?: string
          member_name?: string
          member_phone?: string | null
          paid_pipeline_lead_id?: string | null
          program_name?: string | null
          provider_message_id?: string | null
          sent_at?: string | null
          signature_data_url?: string | null
          signature_name?: string | null
          signed_at?: string | null
          signed_html_url?: string | null
          signed_member_email?: string | null
          signed_member_name?: string | null
          signed_pdf_generated_at?: string | null
          signed_pdf_generation_error?: string | null
          signed_pdf_url?: string | null
          signed_receipt_generated_at?: string | null
          signed_receipt_url?: string | null
          status?: string
          template_id?: string | null
          template_version?: string | null
          token_expires_at?: string | null
          token_hash?: string | null
          updated_at?: string
          viewed_at?: string | null
          whatsapp_redirect_opened_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "code_of_conduct_requests_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "code_of_conduct_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      code_of_conduct_rules: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          link_expiry_days: number
          mode: string
          name: string
          notify_admin: boolean
          notify_owner: boolean
          pipeline_id: string
          source: string
          stage_id: string
          stage_id_after_signed: string | null
          tag_id_after_signed: string | null
          template_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          link_expiry_days?: number
          mode?: string
          name: string
          notify_admin?: boolean
          notify_owner?: boolean
          pipeline_id: string
          source: string
          stage_id: string
          stage_id_after_signed?: string | null
          tag_id_after_signed?: string | null
          template_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          link_expiry_days?: number
          mode?: string
          name?: string
          notify_admin?: boolean
          notify_owner?: boolean
          pipeline_id?: string
          source?: string
          stage_id?: string
          stage_id_after_signed?: string | null
          tag_id_after_signed?: string | null
          template_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "code_of_conduct_rules_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "pipelines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "code_of_conduct_rules_stage_id_after_signed_fkey"
            columns: ["stage_id_after_signed"]
            isOneToOne: false
            referencedRelation: "stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "code_of_conduct_rules_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "code_of_conduct_rules_tag_id_after_signed_fkey"
            columns: ["tag_id_after_signed"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "code_of_conduct_rules_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "code_of_conduct_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      code_of_conduct_suggestion_ignores: {
        Row: {
          crm_lead_id: string | null
          id: string
          ignored_at: string
          ignored_by: string | null
          paid_pipeline_lead_id: string | null
          rule_id: string
          stage_id: string | null
        }
        Insert: {
          crm_lead_id?: string | null
          id?: string
          ignored_at?: string
          ignored_by?: string | null
          paid_pipeline_lead_id?: string | null
          rule_id: string
          stage_id?: string | null
        }
        Update: {
          crm_lead_id?: string | null
          id?: string
          ignored_at?: string
          ignored_by?: string | null
          paid_pipeline_lead_id?: string | null
          rule_id?: string
          stage_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "code_of_conduct_suggestion_ignores_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "code_of_conduct_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      code_of_conduct_templates: {
        Row: {
          created_at: string
          created_by: string | null
          document_title: string
          email_body: string | null
          email_subject: string | null
          expiry_days: number
          from_email: string | null
          from_name: string | null
          html_content: string | null
          id: string
          is_active: boolean
          name: string
          party_a_name: string
          pdf_signature_date_x: number | null
          pdf_signature_date_y: number | null
          pdf_signature_font_size: number | null
          pdf_signature_image_height: number | null
          pdf_signature_image_width: number | null
          pdf_signature_image_x: number | null
          pdf_signature_image_y: number | null
          pdf_signature_name_x: number | null
          pdf_signature_name_y: number | null
          pdf_signature_page_number: number | null
          program_name: string | null
          reply_to_email: string | null
          send_signed_copy_to_member: boolean
          signed_copy_recipient_emails: string[] | null
          success_page_message: string | null
          template_pdf_url: string | null
          test_recipient_email: string | null
          updated_at: string
          version: string
          whatsapp_redirect_url: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          document_title?: string
          email_body?: string | null
          email_subject?: string | null
          expiry_days?: number
          from_email?: string | null
          from_name?: string | null
          html_content?: string | null
          id?: string
          is_active?: boolean
          name: string
          party_a_name?: string
          pdf_signature_date_x?: number | null
          pdf_signature_date_y?: number | null
          pdf_signature_font_size?: number | null
          pdf_signature_image_height?: number | null
          pdf_signature_image_width?: number | null
          pdf_signature_image_x?: number | null
          pdf_signature_image_y?: number | null
          pdf_signature_name_x?: number | null
          pdf_signature_name_y?: number | null
          pdf_signature_page_number?: number | null
          program_name?: string | null
          reply_to_email?: string | null
          send_signed_copy_to_member?: boolean
          signed_copy_recipient_emails?: string[] | null
          success_page_message?: string | null
          template_pdf_url?: string | null
          test_recipient_email?: string | null
          updated_at?: string
          version?: string
          whatsapp_redirect_url?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          document_title?: string
          email_body?: string | null
          email_subject?: string | null
          expiry_days?: number
          from_email?: string | null
          from_name?: string | null
          html_content?: string | null
          id?: string
          is_active?: boolean
          name?: string
          party_a_name?: string
          pdf_signature_date_x?: number | null
          pdf_signature_date_y?: number | null
          pdf_signature_font_size?: number | null
          pdf_signature_image_height?: number | null
          pdf_signature_image_width?: number | null
          pdf_signature_image_x?: number | null
          pdf_signature_image_y?: number | null
          pdf_signature_name_x?: number | null
          pdf_signature_name_y?: number | null
          pdf_signature_page_number?: number | null
          program_name?: string | null
          reply_to_email?: string | null
          send_signed_copy_to_member?: boolean
          signed_copy_recipient_emails?: string[] | null
          success_page_message?: string | null
          template_pdf_url?: string | null
          test_recipient_email?: string | null
          updated_at?: string
          version?: string
          whatsapp_redirect_url?: string | null
        }
        Relationships: []
      }
      company_settings: {
        Row: {
          accent_color: string | null
          address: string | null
          bank_account_name: string | null
          bank_account_number: string | null
          bank_account_type: string | null
          bank_branch: string | null
          bank_ifsc: string | null
          bank_name: string | null
          brand_name: string | null
          business_type: string | null
          city: string | null
          company_id: string | null
          country: string | null
          created_at: string
          email: string | null
          gstin: string | null
          guide_video_id: string | null
          guide_video_is_active: boolean
          guide_video_provider: string
          guide_video_required_percent: number
          guide_video_title: string | null
          id: string
          legal_name: string | null
          logo_path: string | null
          logo_url: string | null
          pan: string | null
          phone: string | null
          reply_to_email: string | null
          sender_email: string | null
          sender_name: string | null
          signature_path: string | null
          signature_url: string | null
          stamp_path: string | null
          stamp_url: string | null
          state: string | null
          state_code: string | null
          support_email: string | null
          updated_at: string
          updated_by: string | null
          upi_id: string | null
          website: string | null
          workspace: string
        }
        Insert: {
          accent_color?: string | null
          address?: string | null
          bank_account_name?: string | null
          bank_account_number?: string | null
          bank_account_type?: string | null
          bank_branch?: string | null
          bank_ifsc?: string | null
          bank_name?: string | null
          brand_name?: string | null
          business_type?: string | null
          city?: string | null
          company_id?: string | null
          country?: string | null
          created_at?: string
          email?: string | null
          gstin?: string | null
          guide_video_id?: string | null
          guide_video_is_active?: boolean
          guide_video_provider?: string
          guide_video_required_percent?: number
          guide_video_title?: string | null
          id?: string
          legal_name?: string | null
          logo_path?: string | null
          logo_url?: string | null
          pan?: string | null
          phone?: string | null
          reply_to_email?: string | null
          sender_email?: string | null
          sender_name?: string | null
          signature_path?: string | null
          signature_url?: string | null
          stamp_path?: string | null
          stamp_url?: string | null
          state?: string | null
          state_code?: string | null
          support_email?: string | null
          updated_at?: string
          updated_by?: string | null
          upi_id?: string | null
          website?: string | null
          workspace?: string
        }
        Update: {
          accent_color?: string | null
          address?: string | null
          bank_account_name?: string | null
          bank_account_number?: string | null
          bank_account_type?: string | null
          bank_branch?: string | null
          bank_ifsc?: string | null
          bank_name?: string | null
          brand_name?: string | null
          business_type?: string | null
          city?: string | null
          company_id?: string | null
          country?: string | null
          created_at?: string
          email?: string | null
          gstin?: string | null
          guide_video_id?: string | null
          guide_video_is_active?: boolean
          guide_video_provider?: string
          guide_video_required_percent?: number
          guide_video_title?: string | null
          id?: string
          legal_name?: string | null
          logo_path?: string | null
          logo_url?: string | null
          pan?: string | null
          phone?: string | null
          reply_to_email?: string | null
          sender_email?: string | null
          sender_name?: string | null
          signature_path?: string | null
          signature_url?: string | null
          stamp_path?: string | null
          stamp_url?: string | null
          state?: string | null
          state_code?: string | null
          support_email?: string | null
          updated_at?: string
          updated_by?: string | null
          upi_id?: string | null
          website?: string | null
          workspace?: string
        }
        Relationships: []
      }
      crm_batch_archives: {
        Row: {
          affected_lead_count: number
          archive_reason: string | null
          archived_at: string
          archived_by: string | null
          batch_date: string | null
          batch_name: string
          id: string
          pipeline_id: string | null
          restored_at: string | null
          restored_by: string | null
        }
        Insert: {
          affected_lead_count?: number
          archive_reason?: string | null
          archived_at?: string
          archived_by?: string | null
          batch_date?: string | null
          batch_name: string
          id?: string
          pipeline_id?: string | null
          restored_at?: string | null
          restored_by?: string | null
        }
        Update: {
          affected_lead_count?: number
          archive_reason?: string | null
          archived_at?: string
          archived_by?: string | null
          batch_date?: string | null
          batch_name?: string
          id?: string
          pipeline_id?: string | null
          restored_at?: string | null
          restored_by?: string | null
        }
        Relationships: []
      }
      crm_conversion_rules: {
        Row: {
          create_paid_buyer: boolean
          created_at: string
          created_by: string | null
          deassign_original: boolean
          default_owner_id: string | null
          destination_pipeline_id: string | null
          destination_stage_id: string | null
          followup_default: string
          hide_from_sales_workload: boolean
          id: string
          is_active: boolean
          name: string
          owner_policy: string
          source_pipeline_id: string | null
          tag_after_conversion: string | null
          trigger_stage_ids: string[]
          trigger_stage_names: string[]
          updated_at: string
        }
        Insert: {
          create_paid_buyer?: boolean
          created_at?: string
          created_by?: string | null
          deassign_original?: boolean
          default_owner_id?: string | null
          destination_pipeline_id?: string | null
          destination_stage_id?: string | null
          followup_default?: string
          hide_from_sales_workload?: boolean
          id?: string
          is_active?: boolean
          name?: string
          owner_policy?: string
          source_pipeline_id?: string | null
          tag_after_conversion?: string | null
          trigger_stage_ids?: string[]
          trigger_stage_names?: string[]
          updated_at?: string
        }
        Update: {
          create_paid_buyer?: boolean
          created_at?: string
          created_by?: string | null
          deassign_original?: boolean
          default_owner_id?: string | null
          destination_pipeline_id?: string | null
          destination_stage_id?: string | null
          followup_default?: string
          hide_from_sales_workload?: boolean
          id?: string
          is_active?: boolean
          name?: string
          owner_policy?: string
          source_pipeline_id?: string | null
          tag_after_conversion?: string | null
          trigger_stage_ids?: string[]
          trigger_stage_names?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_conversion_rules_destination_pipeline_id_fkey"
            columns: ["destination_pipeline_id"]
            isOneToOne: false
            referencedRelation: "pipelines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_conversion_rules_destination_stage_id_fkey"
            columns: ["destination_stage_id"]
            isOneToOne: false
            referencedRelation: "stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_conversion_rules_source_pipeline_id_fkey"
            columns: ["source_pipeline_id"]
            isOneToOne: false
            referencedRelation: "pipelines"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_lead_conversions: {
        Row: {
          assigned_owner_id: string | null
          balance_pending: number | null
          conversion_type: string
          created_at: string
          created_by: string | null
          deal_value: number | null
          destination_crm_lead_id: string | null
          destination_pipeline_id: string | null
          destination_stage_id: string | null
          id: string
          metadata_json: Json | null
          paid_pipeline_lead_id: string | null
          program_name: string | null
          source_lead_id: string
          source_pipeline_id: string | null
          source_stage_id: string | null
          status: string
          token_amount: number | null
          total_collected: number | null
        }
        Insert: {
          assigned_owner_id?: string | null
          balance_pending?: number | null
          conversion_type: string
          created_at?: string
          created_by?: string | null
          deal_value?: number | null
          destination_crm_lead_id?: string | null
          destination_pipeline_id?: string | null
          destination_stage_id?: string | null
          id?: string
          metadata_json?: Json | null
          paid_pipeline_lead_id?: string | null
          program_name?: string | null
          source_lead_id: string
          source_pipeline_id?: string | null
          source_stage_id?: string | null
          status?: string
          token_amount?: number | null
          total_collected?: number | null
        }
        Update: {
          assigned_owner_id?: string | null
          balance_pending?: number | null
          conversion_type?: string
          created_at?: string
          created_by?: string | null
          deal_value?: number | null
          destination_crm_lead_id?: string | null
          destination_pipeline_id?: string | null
          destination_stage_id?: string | null
          id?: string
          metadata_json?: Json | null
          paid_pipeline_lead_id?: string | null
          program_name?: string | null
          source_lead_id?: string
          source_pipeline_id?: string | null
          source_stage_id?: string | null
          status?: string
          token_amount?: number | null
          total_collected?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_lead_conversions_destination_crm_lead_id_fkey"
            columns: ["destination_crm_lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_lead_conversions_paid_pipeline_lead_id_fkey"
            columns: ["paid_pipeline_lead_id"]
            isOneToOne: false
            referencedRelation: "paid_pipeline_leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_lead_conversions_source_lead_id_fkey"
            columns: ["source_lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
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
      invoice_events: {
        Row: {
          created_at: string
          created_by: string | null
          event_type: string
          id: string
          invoice_id: string
          metadata_json: Json | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          event_type: string
          id?: string
          invoice_id: string
          metadata_json?: Json | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          event_type?: string
          id?: string
          invoice_id?: string
          metadata_json?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "invoice_events_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_item_categories: {
        Row: {
          created_at: string
          default_gst_rate: number | null
          default_hsn_sac: string | null
          default_taxable_status: string | null
          id: string
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          default_gst_rate?: number | null
          default_hsn_sac?: string | null
          default_taxable_status?: string | null
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          default_gst_rate?: number | null
          default_hsn_sac?: string | null
          default_taxable_status?: string | null
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      invoice_items: {
        Row: {
          category_id: string | null
          created_at: string
          created_by: string | null
          default_gst_rate: number
          default_price: number | null
          default_rate: number
          description: string | null
          hsn_sac: string | null
          id: string
          is_active: boolean
          item_name: string
          taxable_status: string | null
          unit: string | null
          updated_at: string
        }
        Insert: {
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          default_gst_rate?: number
          default_price?: number | null
          default_rate?: number
          description?: string | null
          hsn_sac?: string | null
          id?: string
          is_active?: boolean
          item_name: string
          taxable_status?: string | null
          unit?: string | null
          updated_at?: string
        }
        Update: {
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          default_gst_rate?: number
          default_price?: number | null
          default_rate?: number
          description?: string | null
          hsn_sac?: string | null
          id?: string
          is_active?: boolean
          item_name?: string
          taxable_status?: string | null
          unit?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_items_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "invoice_item_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_line_items: {
        Row: {
          amount: number
          cgst_amount: number
          created_at: string
          description: string | null
          hsn_sac: string | null
          id: string
          igst_amount: number
          invoice_id: string
          item_name: string
          quantity: number
          rate: number
          sgst_amount: number
          sort_order: number
          tax_rate: number
        }
        Insert: {
          amount?: number
          cgst_amount?: number
          created_at?: string
          description?: string | null
          hsn_sac?: string | null
          id?: string
          igst_amount?: number
          invoice_id: string
          item_name: string
          quantity?: number
          rate?: number
          sgst_amount?: number
          sort_order?: number
          tax_rate?: number
        }
        Update: {
          amount?: number
          cgst_amount?: number
          created_at?: string
          description?: string | null
          hsn_sac?: string | null
          id?: string
          igst_amount?: number
          invoice_id?: string
          item_name?: string
          quantity?: number
          rate?: number
          sgst_amount?: number
          sort_order?: number
          tax_rate?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoice_line_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_settings: {
        Row: {
          allow_invoice_level_gst_choice: boolean
          created_at: string
          default_email_body: string | null
          default_email_subject: string | null
          default_gst_rate: number
          default_hsn_sac: string | null
          default_invoice_type: string
          default_notes: string | null
          default_place_of_supply: string | null
          default_tax_mode: string
          default_tax_split: string
          default_terms: string | null
          fy_format: string | null
          gst_enabled_default: boolean
          hsn_sac_required: boolean
          id: string
          invoice_prefix: string
          last_reset_fy: string | null
          next_invoice_number: number
          number_padding: number
          require_authorized_signature: boolean
          reset_yearly: boolean
          updated_at: string
          updated_by: string | null
          workspace: string
        }
        Insert: {
          allow_invoice_level_gst_choice?: boolean
          created_at?: string
          default_email_body?: string | null
          default_email_subject?: string | null
          default_gst_rate?: number
          default_hsn_sac?: string | null
          default_invoice_type?: string
          default_notes?: string | null
          default_place_of_supply?: string | null
          default_tax_mode?: string
          default_tax_split?: string
          default_terms?: string | null
          fy_format?: string | null
          gst_enabled_default?: boolean
          hsn_sac_required?: boolean
          id?: string
          invoice_prefix?: string
          last_reset_fy?: string | null
          next_invoice_number?: number
          number_padding?: number
          require_authorized_signature?: boolean
          reset_yearly?: boolean
          updated_at?: string
          updated_by?: string | null
          workspace?: string
        }
        Update: {
          allow_invoice_level_gst_choice?: boolean
          created_at?: string
          default_email_body?: string | null
          default_email_subject?: string | null
          default_gst_rate?: number
          default_hsn_sac?: string | null
          default_invoice_type?: string
          default_notes?: string | null
          default_place_of_supply?: string | null
          default_tax_mode?: string
          default_tax_split?: string
          default_terms?: string | null
          fy_format?: string | null
          gst_enabled_default?: boolean
          hsn_sac_required?: boolean
          id?: string
          invoice_prefix?: string
          last_reset_fy?: string | null
          next_invoice_number?: number
          number_padding?: number
          require_authorized_signature?: boolean
          reset_yearly?: boolean
          updated_at?: string
          updated_by?: string | null
          workspace?: string
        }
        Relationships: []
      }
      invoices: {
        Row: {
          adjustment_amount: number
          amount_in_words: string | null
          balance_due: number
          billing_address: string | null
          billing_city: string | null
          billing_country: string | null
          billing_email: string | null
          billing_gstin: string | null
          billing_name: string | null
          billing_phone: string | null
          billing_state: string | null
          billing_state_code: string | null
          buyer_snapshot_json: Json | null
          cancel_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          cgst_amount: number
          created_at: string
          created_by: string | null
          crm_lead_id: string | null
          discount_amount: number
          due_date: string | null
          id: string
          igst_amount: number
          invoice_context_type: string
          invoice_date: string | null
          invoice_mode: string
          invoice_number: string | null
          invoice_number_mode: string
          invoice_type: string
          issued_at: string | null
          last_generated_at: string | null
          linked_client_email: string | null
          linked_client_name: string | null
          linked_client_phone: string | null
          manual_invoice_number: string | null
          member_email: string | null
          member_name: string | null
          member_phone: string | null
          notes: string | null
          paid_pipeline_lead_id: string | null
          payment_made: number
          place_of_supply: string | null
          salesperson_id: string | null
          seller_snapshot_json: Json | null
          sent_at: string | null
          sent_to: string | null
          sgst_amount: number
          show_bank_details: boolean
          show_payment_instructions: boolean
          show_signature: boolean
          show_stamp: boolean
          status: string
          subject: string | null
          subtotal: number
          tax_snapshot_json: Json | null
          taxable_amount: number
          terms: string | null
          terms_and_conditions: string | null
          total_amount: number
          updated_at: string
        }
        Insert: {
          adjustment_amount?: number
          amount_in_words?: string | null
          balance_due?: number
          billing_address?: string | null
          billing_city?: string | null
          billing_country?: string | null
          billing_email?: string | null
          billing_gstin?: string | null
          billing_name?: string | null
          billing_phone?: string | null
          billing_state?: string | null
          billing_state_code?: string | null
          buyer_snapshot_json?: Json | null
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          cgst_amount?: number
          created_at?: string
          created_by?: string | null
          crm_lead_id?: string | null
          discount_amount?: number
          due_date?: string | null
          id?: string
          igst_amount?: number
          invoice_context_type?: string
          invoice_date?: string | null
          invoice_mode?: string
          invoice_number?: string | null
          invoice_number_mode?: string
          invoice_type?: string
          issued_at?: string | null
          last_generated_at?: string | null
          linked_client_email?: string | null
          linked_client_name?: string | null
          linked_client_phone?: string | null
          manual_invoice_number?: string | null
          member_email?: string | null
          member_name?: string | null
          member_phone?: string | null
          notes?: string | null
          paid_pipeline_lead_id?: string | null
          payment_made?: number
          place_of_supply?: string | null
          salesperson_id?: string | null
          seller_snapshot_json?: Json | null
          sent_at?: string | null
          sent_to?: string | null
          sgst_amount?: number
          show_bank_details?: boolean
          show_payment_instructions?: boolean
          show_signature?: boolean
          show_stamp?: boolean
          status?: string
          subject?: string | null
          subtotal?: number
          tax_snapshot_json?: Json | null
          taxable_amount?: number
          terms?: string | null
          terms_and_conditions?: string | null
          total_amount?: number
          updated_at?: string
        }
        Update: {
          adjustment_amount?: number
          amount_in_words?: string | null
          balance_due?: number
          billing_address?: string | null
          billing_city?: string | null
          billing_country?: string | null
          billing_email?: string | null
          billing_gstin?: string | null
          billing_name?: string | null
          billing_phone?: string | null
          billing_state?: string | null
          billing_state_code?: string | null
          buyer_snapshot_json?: Json | null
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          cgst_amount?: number
          created_at?: string
          created_by?: string | null
          crm_lead_id?: string | null
          discount_amount?: number
          due_date?: string | null
          id?: string
          igst_amount?: number
          invoice_context_type?: string
          invoice_date?: string | null
          invoice_mode?: string
          invoice_number?: string | null
          invoice_number_mode?: string
          invoice_type?: string
          issued_at?: string | null
          last_generated_at?: string | null
          linked_client_email?: string | null
          linked_client_name?: string | null
          linked_client_phone?: string | null
          manual_invoice_number?: string | null
          member_email?: string | null
          member_name?: string | null
          member_phone?: string | null
          notes?: string | null
          paid_pipeline_lead_id?: string | null
          payment_made?: number
          place_of_supply?: string | null
          salesperson_id?: string | null
          seller_snapshot_json?: Json | null
          sent_at?: string | null
          sent_to?: string | null
          sgst_amount?: number
          show_bank_details?: boolean
          show_payment_instructions?: boolean
          show_signature?: boolean
          show_stamp?: boolean
          status?: string
          subject?: string | null
          subtotal?: number
          tax_snapshot_json?: Json | null
          taxable_amount?: number
          terms?: string | null
          terms_and_conditions?: string | null
          total_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_crm_lead_id_fkey"
            columns: ["crm_lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_paid_pipeline_lead_id_fkey"
            columns: ["paid_pipeline_lead_id"]
            isOneToOne: false
            referencedRelation: "paid_pipeline_leads"
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
      lead_hotness_scores: {
        Row: {
          avg_attendance_percentage: number
          cumulative_attendance_percentage: number
          current_hotness: string
          highest_attendance_percentage: number
          id: string
          last_attended_at: string | null
          lead_id: string
          manual_grade: string | null
          manual_override: boolean
          overridden_at: string | null
          overridden_by: string | null
          override_reason: string | null
          score_numeric: number
          score_reason: Json
          total_attended_minutes: number
          total_possible_minutes: number
          total_sessions_attended: number
          total_webinars_attended: number
          updated_at: string
        }
        Insert: {
          avg_attendance_percentage?: number
          cumulative_attendance_percentage?: number
          current_hotness?: string
          highest_attendance_percentage?: number
          id?: string
          last_attended_at?: string | null
          lead_id: string
          manual_grade?: string | null
          manual_override?: boolean
          overridden_at?: string | null
          overridden_by?: string | null
          override_reason?: string | null
          score_numeric?: number
          score_reason?: Json
          total_attended_minutes?: number
          total_possible_minutes?: number
          total_sessions_attended?: number
          total_webinars_attended?: number
          updated_at?: string
        }
        Update: {
          avg_attendance_percentage?: number
          cumulative_attendance_percentage?: number
          current_hotness?: string
          highest_attendance_percentage?: number
          id?: string
          last_attended_at?: string | null
          lead_id?: string
          manual_grade?: string | null
          manual_override?: boolean
          overridden_at?: string | null
          overridden_by?: string | null
          override_reason?: string | null
          score_numeric?: number
          score_reason?: Json
          total_attended_minutes?: number
          total_possible_minutes?: number
          total_sessions_attended?: number
          total_webinars_attended?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_hotness_scores_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: true
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_notes: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          lead_id: string
          note_text: string
          note_type: string
          paid_pipeline_lead_id: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          lead_id: string
          note_text: string
          note_type?: string
          paid_pipeline_lead_id?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          lead_id?: string
          note_text?: string
          note_type?: string
          paid_pipeline_lead_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_notes_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_notes_paid_pipeline_lead_id_fkey"
            columns: ["paid_pipeline_lead_id"]
            isOneToOne: false
            referencedRelation: "paid_pipeline_leads"
            referencedColumns: ["id"]
          },
        ]
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
      lead_session_attendance: {
        Row: {
          attendance_grade: string
          attendance_percentage: number
          attended_minutes_capped: number
          attended_minutes_raw: number
          batch_id: string | null
          created_at: string
          first_joined_at: string | null
          id: string
          join_count: number
          last_left_at: string | null
          lead_id: string
          metadata_json: Json
          normalized_email: string | null
          normalized_phone: string | null
          raw_identity_key: string | null
          session_date: string | null
          session_day: number | null
          session_duration_minutes: number
          session_key: string
          session_name: string | null
          source: string
          updated_at: string
          webinar_id: string | null
          webinar_name: string | null
        }
        Insert: {
          attendance_grade?: string
          attendance_percentage?: number
          attended_minutes_capped?: number
          attended_minutes_raw?: number
          batch_id?: string | null
          created_at?: string
          first_joined_at?: string | null
          id?: string
          join_count?: number
          last_left_at?: string | null
          lead_id: string
          metadata_json?: Json
          normalized_email?: string | null
          normalized_phone?: string | null
          raw_identity_key?: string | null
          session_date?: string | null
          session_day?: number | null
          session_duration_minutes?: number
          session_key?: string
          session_name?: string | null
          source?: string
          updated_at?: string
          webinar_id?: string | null
          webinar_name?: string | null
        }
        Update: {
          attendance_grade?: string
          attendance_percentage?: number
          attended_minutes_capped?: number
          attended_minutes_raw?: number
          batch_id?: string | null
          created_at?: string
          first_joined_at?: string | null
          id?: string
          join_count?: number
          last_left_at?: string | null
          lead_id?: string
          metadata_json?: Json
          normalized_email?: string | null
          normalized_phone?: string | null
          raw_identity_key?: string | null
          session_date?: string | null
          session_day?: number | null
          session_duration_minutes?: number
          session_key?: string
          session_name?: string | null
          source?: string
          updated_at?: string
          webinar_id?: string | null
          webinar_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_session_attendance_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_tag_assignments: {
        Row: {
          assigned_by: string | null
          created_at: string
          crm_lead_id: string | null
          id: string
          paid_pipeline_lead_id: string | null
          tag_id: string
        }
        Insert: {
          assigned_by?: string | null
          created_at?: string
          crm_lead_id?: string | null
          id?: string
          paid_pipeline_lead_id?: string | null
          tag_id: string
        }
        Update: {
          assigned_by?: string | null
          created_at?: string
          crm_lead_id?: string | null
          id?: string
          paid_pipeline_lead_id?: string | null
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_tag_assignments_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          archive_reason: string | null
          archived_at: string | null
          archived_by: string | null
          assigned_agent_id: string | null
          attendance_pct: number
          code_of_conduct_request_id: string | null
          code_of_conduct_sent_at: string | null
          code_of_conduct_signed_at: string | null
          code_of_conduct_status: string | null
          conversion_status: string
          converted_at: string | null
          converted_by: string | null
          converted_to_crm_lead_id: string | null
          country: string | null
          created_at: string
          deal_value: number
          delete_reason: string | null
          deleted_at: string | null
          deleted_by: string | null
          email: string | null
          first_join_time: string | null
          full_name: string | null
          grade: Database["public"]["Enums"]["lead_grade"]
          hide_from_sales_workload: boolean
          id: string
          is_super_hot: boolean
          lead_source_type: string | null
          lead_type: Database["public"]["Enums"]["lead_type"]
          paid_pipeline_lead_id: string | null
          phone: string | null
          pipeline_id: string | null
          program_name: string
          score: number
          service_package_id: string | null
          service_package_snapshot: Json | null
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
          archive_reason?: string | null
          archived_at?: string | null
          archived_by?: string | null
          assigned_agent_id?: string | null
          attendance_pct?: number
          code_of_conduct_request_id?: string | null
          code_of_conduct_sent_at?: string | null
          code_of_conduct_signed_at?: string | null
          code_of_conduct_status?: string | null
          conversion_status?: string
          converted_at?: string | null
          converted_by?: string | null
          converted_to_crm_lead_id?: string | null
          country?: string | null
          created_at?: string
          deal_value?: number
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          email?: string | null
          first_join_time?: string | null
          full_name?: string | null
          grade?: Database["public"]["Enums"]["lead_grade"]
          hide_from_sales_workload?: boolean
          id?: string
          is_super_hot?: boolean
          lead_source_type?: string | null
          lead_type?: Database["public"]["Enums"]["lead_type"]
          paid_pipeline_lead_id?: string | null
          phone?: string | null
          pipeline_id?: string | null
          program_name?: string
          score?: number
          service_package_id?: string | null
          service_package_snapshot?: Json | null
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
          archive_reason?: string | null
          archived_at?: string | null
          archived_by?: string | null
          assigned_agent_id?: string | null
          attendance_pct?: number
          code_of_conduct_request_id?: string | null
          code_of_conduct_sent_at?: string | null
          code_of_conduct_signed_at?: string | null
          code_of_conduct_status?: string | null
          conversion_status?: string
          converted_at?: string | null
          converted_by?: string | null
          converted_to_crm_lead_id?: string | null
          country?: string | null
          created_at?: string
          deal_value?: number
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          email?: string | null
          first_join_time?: string | null
          full_name?: string | null
          grade?: Database["public"]["Enums"]["lead_grade"]
          hide_from_sales_workload?: boolean
          id?: string
          is_super_hot?: boolean
          lead_source_type?: string | null
          lead_type?: Database["public"]["Enums"]["lead_type"]
          paid_pipeline_lead_id?: string | null
          phone?: string | null
          pipeline_id?: string | null
          program_name?: string
          score?: number
          service_package_id?: string | null
          service_package_snapshot?: Json | null
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
            foreignKeyName: "leads_converted_to_crm_lead_id_fkey"
            columns: ["converted_to_crm_lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "pipelines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_service_package_id_fkey"
            columns: ["service_package_id"]
            isOneToOne: false
            referencedRelation: "service_packages"
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
      media_buyer_aliases: {
        Row: {
          alias_name: string
          canonical_name: string
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          is_deleted: boolean
          reason: string | null
          updated_at: string
        }
        Insert: {
          alias_name: string
          canonical_name: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          is_deleted?: boolean
          reason?: string | null
          updated_at?: string
        }
        Update: {
          alias_name?: string
          canonical_name?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          is_deleted?: boolean
          reason?: string | null
          updated_at?: string
        }
        Relationships: []
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
      media_buyer_case_emails: {
        Row: {
          body: string
          case_id: string
          created_at: string
          created_by: string | null
          email_type: string
          error_message: string | null
          id: string
          is_deleted: boolean
          provider_message_id: string | null
          recipient_email: string | null
          sent_at: string | null
          status: string
          subject: string
        }
        Insert: {
          body: string
          case_id: string
          created_at?: string
          created_by?: string | null
          email_type: string
          error_message?: string | null
          id?: string
          is_deleted?: boolean
          provider_message_id?: string | null
          recipient_email?: string | null
          sent_at?: string | null
          status?: string
          subject: string
        }
        Update: {
          body?: string
          case_id?: string
          created_at?: string
          created_by?: string | null
          email_type?: string
          error_message?: string | null
          id?: string
          is_deleted?: boolean
          provider_message_id?: string | null
          recipient_email?: string | null
          sent_at?: string | null
          status?: string
          subject?: string
        }
        Relationships: [
          {
            foreignKeyName: "media_buyer_case_emails_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "media_buyer_cases"
            referencedColumns: ["id"]
          },
        ]
      }
      media_buyer_case_events: {
        Row: {
          case_id: string
          created_at: string
          created_by: string | null
          event_date: string
          event_label: string | null
          event_type: string
          id: string
          is_deleted: boolean
          metadata: Json | null
          new_status: string | null
          notes: string | null
          old_status: string | null
        }
        Insert: {
          case_id: string
          created_at?: string
          created_by?: string | null
          event_date?: string
          event_label?: string | null
          event_type: string
          id?: string
          is_deleted?: boolean
          metadata?: Json | null
          new_status?: string | null
          notes?: string | null
          old_status?: string | null
        }
        Update: {
          case_id?: string
          created_at?: string
          created_by?: string | null
          event_date?: string
          event_label?: string | null
          event_type?: string
          id?: string
          is_deleted?: boolean
          metadata?: Json | null
          new_status?: string | null
          notes?: string | null
          old_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "media_buyer_case_events_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "media_buyer_cases"
            referencedColumns: ["id"]
          },
        ]
      }
      media_buyer_cases: {
        Row: {
          access_notes: string | null
          active_days_remaining: number | null
          active_days_used: number
          ad_access_status: string
          ad_account_access: boolean
          ad_account_access_received_at: string | null
          ad_account_name: string | null
          ads_launch_date: string | null
          ads_start_date: string | null
          ads_status: string
          ads_stop_date: string | null
          assigned_at: string | null
          assigned_by: string | null
          assigned_media_buyer_email: string | null
          assigned_media_buyer_id: string | null
          assigned_media_buyer_name: string | null
          assignment_method: string
          business_manager_access: boolean
          call_status: string
          campaign_setup_status: string | null
          case_stage: string
          created_at: string
          created_by: string | null
          creative_status: string | null
          current_pause_started_at: string | null
          email_followup_sent_at: string | null
          first_call_due_at: string | null
          first_called_at: string | null
          id: string
          is_active: boolean
          is_deleted: boolean
          last_call_outcome: string | null
          last_called_at: string | null
          notes: string | null
          page_access: boolean
          pause_reason: string | null
          pixel_domain_access: boolean
          priority: string
          program_name: string | null
          projected_service_end_date: string | null
          resume_reason: string | null
          service_duration_days: number | null
          service_duration_months: number | null
          service_duration_type: string
          source_crm_lead_id: string | null
          source_lead_id: string | null
          source_module: string | null
          source_paid_pipeline_lead_id: string | null
          stop_reason: string | null
          student_email: string | null
          student_name: string
          student_phone: string | null
          total_call_attempts: number
          updated_at: string
        }
        Insert: {
          access_notes?: string | null
          active_days_remaining?: number | null
          active_days_used?: number
          ad_access_status?: string
          ad_account_access?: boolean
          ad_account_access_received_at?: string | null
          ad_account_name?: string | null
          ads_launch_date?: string | null
          ads_start_date?: string | null
          ads_status?: string
          ads_stop_date?: string | null
          assigned_at?: string | null
          assigned_by?: string | null
          assigned_media_buyer_email?: string | null
          assigned_media_buyer_id?: string | null
          assigned_media_buyer_name?: string | null
          assignment_method?: string
          business_manager_access?: boolean
          call_status?: string
          campaign_setup_status?: string | null
          case_stage?: string
          created_at?: string
          created_by?: string | null
          creative_status?: string | null
          current_pause_started_at?: string | null
          email_followup_sent_at?: string | null
          first_call_due_at?: string | null
          first_called_at?: string | null
          id?: string
          is_active?: boolean
          is_deleted?: boolean
          last_call_outcome?: string | null
          last_called_at?: string | null
          notes?: string | null
          page_access?: boolean
          pause_reason?: string | null
          pixel_domain_access?: boolean
          priority?: string
          program_name?: string | null
          projected_service_end_date?: string | null
          resume_reason?: string | null
          service_duration_days?: number | null
          service_duration_months?: number | null
          service_duration_type?: string
          source_crm_lead_id?: string | null
          source_lead_id?: string | null
          source_module?: string | null
          source_paid_pipeline_lead_id?: string | null
          stop_reason?: string | null
          student_email?: string | null
          student_name: string
          student_phone?: string | null
          total_call_attempts?: number
          updated_at?: string
        }
        Update: {
          access_notes?: string | null
          active_days_remaining?: number | null
          active_days_used?: number
          ad_access_status?: string
          ad_account_access?: boolean
          ad_account_access_received_at?: string | null
          ad_account_name?: string | null
          ads_launch_date?: string | null
          ads_start_date?: string | null
          ads_status?: string
          ads_stop_date?: string | null
          assigned_at?: string | null
          assigned_by?: string | null
          assigned_media_buyer_email?: string | null
          assigned_media_buyer_id?: string | null
          assigned_media_buyer_name?: string | null
          assignment_method?: string
          business_manager_access?: boolean
          call_status?: string
          campaign_setup_status?: string | null
          case_stage?: string
          created_at?: string
          created_by?: string | null
          creative_status?: string | null
          current_pause_started_at?: string | null
          email_followup_sent_at?: string | null
          first_call_due_at?: string | null
          first_called_at?: string | null
          id?: string
          is_active?: boolean
          is_deleted?: boolean
          last_call_outcome?: string | null
          last_called_at?: string | null
          notes?: string | null
          page_access?: boolean
          pause_reason?: string | null
          pixel_domain_access?: boolean
          priority?: string
          program_name?: string | null
          projected_service_end_date?: string | null
          resume_reason?: string | null
          service_duration_days?: number | null
          service_duration_months?: number | null
          service_duration_type?: string
          source_crm_lead_id?: string | null
          source_lead_id?: string | null
          source_module?: string | null
          source_paid_pipeline_lead_id?: string | null
          stop_reason?: string | null
          student_email?: string | null
          student_name?: string
          student_phone?: string | null
          total_call_attempts?: number
          updated_at?: string
        }
        Relationships: []
      }
      media_buyer_service_periods: {
        Row: {
          case_id: string
          created_at: string
          created_by: string | null
          ended_at: string | null
          id: string
          is_deleted: boolean
          period_type: string
          reason: string | null
          started_at: string
          total_days: number | null
        }
        Insert: {
          case_id: string
          created_at?: string
          created_by?: string | null
          ended_at?: string | null
          id?: string
          is_deleted?: boolean
          period_type: string
          reason?: string | null
          started_at: string
          total_days?: number | null
        }
        Update: {
          case_id?: string
          created_at?: string
          created_by?: string | null
          ended_at?: string | null
          id?: string
          is_deleted?: boolean
          period_type?: string
          reason?: string | null
          started_at?: string
          total_days?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "media_buyer_service_periods_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "media_buyer_cases"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_preferences: {
        Row: {
          created_at: string
          email_enabled: boolean
          id: string
          in_app_enabled: boolean
          module_key: string | null
          notification_type: string | null
          team_member_id: string | null
          updated_at: string
          user_id: string | null
          whatsapp_enabled: boolean
        }
        Insert: {
          created_at?: string
          email_enabled?: boolean
          id?: string
          in_app_enabled?: boolean
          module_key?: string | null
          notification_type?: string | null
          team_member_id?: string | null
          updated_at?: string
          user_id?: string | null
          whatsapp_enabled?: boolean
        }
        Update: {
          created_at?: string
          email_enabled?: boolean
          id?: string
          in_app_enabled?: boolean
          module_key?: string | null
          notification_type?: string | null
          team_member_id?: string | null
          updated_at?: string
          user_id?: string | null
          whatsapp_enabled?: boolean
        }
        Relationships: []
      }
      notification_rules: {
        Row: {
          conditions: Json | null
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          is_deleted: boolean
          module_key: string | null
          priority: string
          recipient_config: Json | null
          recipient_type: string | null
          rule_key: string
          rule_name: string
          trigger_type: string | null
          updated_at: string
        }
        Insert: {
          conditions?: Json | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          is_deleted?: boolean
          module_key?: string | null
          priority?: string
          recipient_config?: Json | null
          recipient_type?: string | null
          rule_key: string
          rule_name: string
          trigger_type?: string | null
          updated_at?: string
        }
        Update: {
          conditions?: Json | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          is_deleted?: boolean
          module_key?: string | null
          priority?: string
          recipient_config?: Json | null
          recipient_type?: string | null
          rule_key?: string
          rule_name?: string
          trigger_type?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          action_label: string | null
          action_url: string | null
          created_at: string
          dismissed_at: string | null
          entity_id: string | null
          entity_label: string | null
          entity_type: string | null
          id: string
          is_deleted: boolean
          message: string | null
          metadata: Json | null
          module_key: string | null
          notification_type: string | null
          priority: string
          read_at: string | null
          recipient_role: string | null
          recipient_team_member_id: string | null
          recipient_user_id: string | null
          source: string
          status: string
          title: string
          triggered_by_name: string | null
          triggered_by_user_id: string | null
        }
        Insert: {
          action_label?: string | null
          action_url?: string | null
          created_at?: string
          dismissed_at?: string | null
          entity_id?: string | null
          entity_label?: string | null
          entity_type?: string | null
          id?: string
          is_deleted?: boolean
          message?: string | null
          metadata?: Json | null
          module_key?: string | null
          notification_type?: string | null
          priority?: string
          read_at?: string | null
          recipient_role?: string | null
          recipient_team_member_id?: string | null
          recipient_user_id?: string | null
          source?: string
          status?: string
          title: string
          triggered_by_name?: string | null
          triggered_by_user_id?: string | null
        }
        Update: {
          action_label?: string | null
          action_url?: string | null
          created_at?: string
          dismissed_at?: string | null
          entity_id?: string | null
          entity_label?: string | null
          entity_type?: string | null
          id?: string
          is_deleted?: boolean
          message?: string | null
          metadata?: Json | null
          module_key?: string | null
          notification_type?: string | null
          priority?: string
          read_at?: string | null
          recipient_role?: string | null
          recipient_team_member_id?: string | null
          recipient_user_id?: string | null
          source?: string
          status?: string
          title?: string
          triggered_by_name?: string | null
          triggered_by_user_id?: string | null
        }
        Relationships: []
      }
      offer_items: {
        Row: {
          category: string | null
          created_at: string
          created_by: string | null
          default_duration_unit: string | null
          default_duration_value: number | null
          default_quantity: number | null
          description: string | null
          id: string
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          created_by?: string | null
          default_duration_unit?: string | null
          default_duration_value?: number | null
          default_quantity?: number | null
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          category?: string | null
          created_at?: string
          created_by?: string | null
          default_duration_unit?: string | null
          default_duration_value?: number | null
          default_quantity?: number | null
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      offer_preset_items: {
        Row: {
          created_at: string
          duration_unit: string | null
          duration_value: number | null
          id: string
          notes: string | null
          offer_item_id: string | null
          preset_id: string
          quantity: number | null
          title: string | null
        }
        Insert: {
          created_at?: string
          duration_unit?: string | null
          duration_value?: number | null
          id?: string
          notes?: string | null
          offer_item_id?: string | null
          preset_id: string
          quantity?: number | null
          title?: string | null
        }
        Update: {
          created_at?: string
          duration_unit?: string | null
          duration_value?: number | null
          id?: string
          notes?: string | null
          offer_item_id?: string | null
          preset_id?: string
          quantity?: number | null
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "offer_preset_items_offer_item_id_fkey"
            columns: ["offer_item_id"]
            isOneToOne: false
            referencedRelation: "offer_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offer_preset_items_preset_id_fkey"
            columns: ["preset_id"]
            isOneToOne: false
            referencedRelation: "offer_presets"
            referencedColumns: ["id"]
          },
        ]
      }
      offer_presets: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      offline_seminar_reports: {
        Row: {
          break_even_sales_required: number | null
          business_unit: string | null
          city: string | null
          complimentary_passes: number
          cost_breakdown: Json | null
          cost_per_attendee: number | null
          cost_per_sale: number | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          deleted_by: string | null
          event_date: string | null
          event_month: string | null
          event_name: string
          event_roas: number | null
          event_type: string | null
          id: string
          is_deleted: boolean
          media_buyer_breakdown: Json | null
          net_profit: number
          net_profit_margin: number | null
          no_show_count: number
          notes: string | null
          profit_roi: number | null
          program_booked_revenue: number
          program_name: string | null
          program_price: number
          program_revenue_collected: number
          program_revenue_pending: number
          program_sales_count: number
          realized_roas: number | null
          refunds_adjustments: number
          sales_source_metadata: Json | null
          ticket_price: number
          ticket_revenue: number
          ticket_source_metadata: Json | null
          tickets_sold: number
          total_ad_spend: number
          total_attendees: number
          total_cost: number
          total_event_cost: number
          total_gross_revenue: number
          total_pending_revenue: number
          total_realized_revenue: number
          updated_at: string
          venue_name: string | null
        }
        Insert: {
          break_even_sales_required?: number | null
          business_unit?: string | null
          city?: string | null
          complimentary_passes?: number
          cost_breakdown?: Json | null
          cost_per_attendee?: number | null
          cost_per_sale?: number | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          event_date?: string | null
          event_month?: string | null
          event_name: string
          event_roas?: number | null
          event_type?: string | null
          id?: string
          is_deleted?: boolean
          media_buyer_breakdown?: Json | null
          net_profit?: number
          net_profit_margin?: number | null
          no_show_count?: number
          notes?: string | null
          profit_roi?: number | null
          program_booked_revenue?: number
          program_name?: string | null
          program_price?: number
          program_revenue_collected?: number
          program_revenue_pending?: number
          program_sales_count?: number
          realized_roas?: number | null
          refunds_adjustments?: number
          sales_source_metadata?: Json | null
          ticket_price?: number
          ticket_revenue?: number
          ticket_source_metadata?: Json | null
          tickets_sold?: number
          total_ad_spend?: number
          total_attendees?: number
          total_cost?: number
          total_event_cost?: number
          total_gross_revenue?: number
          total_pending_revenue?: number
          total_realized_revenue?: number
          updated_at?: string
          venue_name?: string | null
        }
        Update: {
          break_even_sales_required?: number | null
          business_unit?: string | null
          city?: string | null
          complimentary_passes?: number
          cost_breakdown?: Json | null
          cost_per_attendee?: number | null
          cost_per_sale?: number | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          event_date?: string | null
          event_month?: string | null
          event_name?: string
          event_roas?: number | null
          event_type?: string | null
          id?: string
          is_deleted?: boolean
          media_buyer_breakdown?: Json | null
          net_profit?: number
          net_profit_margin?: number | null
          no_show_count?: number
          notes?: string | null
          profit_roi?: number | null
          program_booked_revenue?: number
          program_name?: string | null
          program_price?: number
          program_revenue_collected?: number
          program_revenue_pending?: number
          program_sales_count?: number
          realized_roas?: number | null
          refunds_adjustments?: number
          sales_source_metadata?: Json | null
          ticket_price?: number
          ticket_revenue?: number
          ticket_source_metadata?: Json | null
          tickets_sold?: number
          total_ad_spend?: number
          total_attendees?: number
          total_cost?: number
          total_event_cost?: number
          total_gross_revenue?: number
          total_pending_revenue?: number
          total_realized_revenue?: number
          updated_at?: string
          venue_name?: string | null
        }
        Relationships: []
      }
      operations_communication_templates: {
        Row: {
          body: string
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          is_seed: boolean
          name: string
          subject: string | null
          template_type: string
          updated_at: string
        }
        Insert: {
          body: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          is_seed?: boolean
          name: string
          subject?: string | null
          template_type: string
          updated_at?: string
        }
        Update: {
          body?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          is_seed?: boolean
          name?: string
          subject?: string | null
          template_type?: string
          updated_at?: string
        }
        Relationships: []
      }
      operations_conversion_reports: {
        Row: {
          campaign_name: string | null
          client_name: string | null
          conversion_count: number
          conversion_date: string
          conversion_value: number | null
          created_at: string
          id: string
          media_buyer_id: string | null
          notes: string | null
          operations_lead_id: string
          proof_url: string | null
          updated_at: string
          verification_note: string | null
          verification_status: string
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          campaign_name?: string | null
          client_name?: string | null
          conversion_count?: number
          conversion_date?: string
          conversion_value?: number | null
          created_at?: string
          id?: string
          media_buyer_id?: string | null
          notes?: string | null
          operations_lead_id: string
          proof_url?: string | null
          updated_at?: string
          verification_note?: string | null
          verification_status?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          campaign_name?: string | null
          client_name?: string | null
          conversion_count?: number
          conversion_date?: string
          conversion_value?: number | null
          created_at?: string
          id?: string
          media_buyer_id?: string | null
          notes?: string | null
          operations_lead_id?: string
          proof_url?: string | null
          updated_at?: string
          verification_note?: string | null
          verification_status?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "operations_conversion_reports_media_buyer_id_fkey"
            columns: ["media_buyer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operations_conversion_reports_operations_lead_id_fkey"
            columns: ["operations_lead_id"]
            isOneToOne: false
            referencedRelation: "operations_leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operations_conversion_reports_verified_by_fkey"
            columns: ["verified_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      operations_handoff_rules: {
        Row: {
          created_at: string
          created_by: string | null
          default_assignment_method: string
          default_service_days: number | null
          default_service_package: string | null
          default_single_buyer_id: string | null
          duplicate_behavior: string
          eligible_buyer_ids: string[]
          eligible_stage_ids: string[]
          id: string
          is_active: boolean
          mode: string
          name: string
          source_pipeline_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          default_assignment_method?: string
          default_service_days?: number | null
          default_service_package?: string | null
          default_single_buyer_id?: string | null
          duplicate_behavior?: string
          eligible_buyer_ids?: string[]
          eligible_stage_ids?: string[]
          id?: string
          is_active?: boolean
          mode?: string
          name: string
          source_pipeline_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          default_assignment_method?: string
          default_service_days?: number | null
          default_service_package?: string | null
          default_single_buyer_id?: string | null
          duplicate_behavior?: string
          eligible_buyer_ids?: string[]
          eligible_stage_ids?: string[]
          id?: string
          is_active?: boolean
          mode?: string
          name?: string
          source_pipeline_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "operations_handoff_rules_source_pipeline_id_fkey"
            columns: ["source_pipeline_id"]
            isOneToOne: false
            referencedRelation: "pipelines"
            referencedColumns: ["id"]
          },
        ]
      }
      operations_intake_imports: {
        Row: {
          created_at: string
          created_by: string | null
          file_name: string | null
          id: string
          imported_count: number
          raw_summary: Json | null
          sheet_url: string | null
          skipped_count: number
          source: string
          total_rows: number
          updated_count: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          file_name?: string | null
          id?: string
          imported_count?: number
          raw_summary?: Json | null
          sheet_url?: string | null
          skipped_count?: number
          source: string
          total_rows?: number
          updated_count?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          file_name?: string | null
          id?: string
          imported_count?: number
          raw_summary?: Json | null
          sheet_url?: string | null
          skipped_count?: number
          source?: string
          total_rows?: number
          updated_count?: number
        }
        Relationships: []
      }
      operations_lead_checklist_state: {
        Row: {
          checked_at: string | null
          checked_by: string | null
          checklist_item_id: string
          created_at: string
          id: string
          is_checked: boolean
          note: string | null
          operations_lead_id: string
          updated_at: string
        }
        Insert: {
          checked_at?: string | null
          checked_by?: string | null
          checklist_item_id: string
          created_at?: string
          id?: string
          is_checked?: boolean
          note?: string | null
          operations_lead_id: string
          updated_at?: string
        }
        Update: {
          checked_at?: string | null
          checked_by?: string | null
          checklist_item_id?: string
          created_at?: string
          id?: string
          is_checked?: boolean
          note?: string | null
          operations_lead_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "operations_lead_checklist_state_checklist_item_id_fkey"
            columns: ["checklist_item_id"]
            isOneToOne: false
            referencedRelation: "operations_template_checklist_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operations_lead_checklist_state_operations_lead_id_fkey"
            columns: ["operations_lead_id"]
            isOneToOne: false
            referencedRelation: "operations_leads"
            referencedColumns: ["id"]
          },
        ]
      }
      operations_lead_custom_values: {
        Row: {
          field_id: string
          id: string
          operations_lead_id: string
          updated_at: string
          updated_by: string | null
          value_bool: boolean | null
          value_date: string | null
          value_number: number | null
          value_text: string | null
        }
        Insert: {
          field_id: string
          id?: string
          operations_lead_id: string
          updated_at?: string
          updated_by?: string | null
          value_bool?: boolean | null
          value_date?: string | null
          value_number?: number | null
          value_text?: string | null
        }
        Update: {
          field_id?: string
          id?: string
          operations_lead_id?: string
          updated_at?: string
          updated_by?: string | null
          value_bool?: boolean | null
          value_date?: string | null
          value_number?: number | null
          value_text?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "operations_lead_custom_values_field_id_fkey"
            columns: ["field_id"]
            isOneToOne: false
            referencedRelation: "operations_template_fields"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operations_lead_custom_values_operations_lead_id_fkey"
            columns: ["operations_lead_id"]
            isOneToOne: false
            referencedRelation: "operations_leads"
            referencedColumns: ["id"]
          },
        ]
      }
      operations_leads: {
        Row: {
          ad_launch_date: string | null
          assigned_media_buyer_id: string | null
          assigned_media_buyer_name: string | null
          batch_name: string | null
          brand_name: string | null
          created_at: string
          created_by: string | null
          crm_lead_id: string | null
          current_active_start_date: string | null
          current_stage: string | null
          deal_value: number | null
          email: string | null
          id: string
          intake_source: string | null
          intake_status: string
          last_paused_at: string | null
          last_resumed_at: string | null
          name: string
          notes: string | null
          onboarding_batch: string | null
          paid_pipeline_lead_id: string | null
          phone: string | null
          pipeline_id: string | null
          priority: string | null
          process_template_id: string | null
          product_name: string | null
          program_name: string | null
          readiness_override_at: string | null
          readiness_override_by: string | null
          readiness_override_reason: string | null
          service_days_committed: number | null
          service_end_target_date: string | null
          service_months: number | null
          service_package_id: string | null
          service_package_name: string | null
          service_package_snapshot: Json | null
          service_status: string
          sort_order: number
          source_stage: string | null
          stage_id: string | null
          tags: Json
          total_active_days: number
          total_paused_days: number
          updated_at: string
        }
        Insert: {
          ad_launch_date?: string | null
          assigned_media_buyer_id?: string | null
          assigned_media_buyer_name?: string | null
          batch_name?: string | null
          brand_name?: string | null
          created_at?: string
          created_by?: string | null
          crm_lead_id?: string | null
          current_active_start_date?: string | null
          current_stage?: string | null
          deal_value?: number | null
          email?: string | null
          id?: string
          intake_source?: string | null
          intake_status?: string
          last_paused_at?: string | null
          last_resumed_at?: string | null
          name: string
          notes?: string | null
          onboarding_batch?: string | null
          paid_pipeline_lead_id?: string | null
          phone?: string | null
          pipeline_id?: string | null
          priority?: string | null
          process_template_id?: string | null
          product_name?: string | null
          program_name?: string | null
          readiness_override_at?: string | null
          readiness_override_by?: string | null
          readiness_override_reason?: string | null
          service_days_committed?: number | null
          service_end_target_date?: string | null
          service_months?: number | null
          service_package_id?: string | null
          service_package_name?: string | null
          service_package_snapshot?: Json | null
          service_status?: string
          sort_order?: number
          source_stage?: string | null
          stage_id?: string | null
          tags?: Json
          total_active_days?: number
          total_paused_days?: number
          updated_at?: string
        }
        Update: {
          ad_launch_date?: string | null
          assigned_media_buyer_id?: string | null
          assigned_media_buyer_name?: string | null
          batch_name?: string | null
          brand_name?: string | null
          created_at?: string
          created_by?: string | null
          crm_lead_id?: string | null
          current_active_start_date?: string | null
          current_stage?: string | null
          deal_value?: number | null
          email?: string | null
          id?: string
          intake_source?: string | null
          intake_status?: string
          last_paused_at?: string | null
          last_resumed_at?: string | null
          name?: string
          notes?: string | null
          onboarding_batch?: string | null
          paid_pipeline_lead_id?: string | null
          phone?: string | null
          pipeline_id?: string | null
          priority?: string | null
          process_template_id?: string | null
          product_name?: string | null
          program_name?: string | null
          readiness_override_at?: string | null
          readiness_override_by?: string | null
          readiness_override_reason?: string | null
          service_days_committed?: number | null
          service_end_target_date?: string | null
          service_months?: number | null
          service_package_id?: string | null
          service_package_name?: string | null
          service_package_snapshot?: Json | null
          service_status?: string
          sort_order?: number
          source_stage?: string | null
          stage_id?: string | null
          tags?: Json
          total_active_days?: number
          total_paused_days?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "operations_leads_assigned_media_buyer_id_fkey"
            columns: ["assigned_media_buyer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operations_leads_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operations_leads_crm_lead_id_fkey"
            columns: ["crm_lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operations_leads_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "pipelines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operations_leads_process_template_id_fkey"
            columns: ["process_template_id"]
            isOneToOne: false
            referencedRelation: "operations_process_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operations_leads_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "stages"
            referencedColumns: ["id"]
          },
        ]
      }
      operations_process_templates: {
        Row: {
          created_at: string
          created_by: string | null
          default_owner_id: string | null
          default_owner_rule: string
          default_service_duration_days: number | null
          description: string | null
          id: string
          is_active: boolean
          is_seed: boolean
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          default_owner_id?: string | null
          default_owner_rule?: string
          default_service_duration_days?: number | null
          description?: string | null
          id?: string
          is_active?: boolean
          is_seed?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          default_owner_id?: string | null
          default_owner_rule?: string
          default_service_duration_days?: number | null
          description?: string | null
          id?: string
          is_active?: boolean
          is_seed?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      operations_reward_progress: {
        Row: {
          achieved_at: string | null
          approved_conversion_count: number
          created_at: string
          id: string
          media_buyer_id: string
          month: string
          paid_at: string | null
          reward_amount: number
          reward_status: string
          rule_id: string | null
          target_count: number
          updated_at: string
        }
        Insert: {
          achieved_at?: string | null
          approved_conversion_count?: number
          created_at?: string
          id?: string
          media_buyer_id: string
          month: string
          paid_at?: string | null
          reward_amount: number
          reward_status?: string
          rule_id?: string | null
          target_count: number
          updated_at?: string
        }
        Update: {
          achieved_at?: string | null
          approved_conversion_count?: number
          created_at?: string
          id?: string
          media_buyer_id?: string
          month?: string
          paid_at?: string | null
          reward_amount?: number
          reward_status?: string
          rule_id?: string | null
          target_count?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "operations_reward_progress_media_buyer_id_fkey"
            columns: ["media_buyer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operations_reward_progress_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "operations_reward_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      operations_reward_rules: {
        Row: {
          active: boolean
          created_at: string
          currency: string
          description: string | null
          id: string
          period: string
          reward_amount: number
          role_scope: string
          rule_name: string
          target_count: number
          target_metric: string
          updated_at: string
          verification_required: boolean
        }
        Insert: {
          active?: boolean
          created_at?: string
          currency?: string
          description?: string | null
          id?: string
          period?: string
          reward_amount?: number
          role_scope?: string
          rule_name: string
          target_count?: number
          target_metric?: string
          updated_at?: string
          verification_required?: boolean
        }
        Update: {
          active?: boolean
          created_at?: string
          currency?: string
          description?: string | null
          id?: string
          period?: string
          reward_amount?: number
          role_scope?: string
          rule_name?: string
          target_count?: number
          target_metric?: string
          updated_at?: string
          verification_required?: boolean
        }
        Relationships: []
      }
      operations_service_events: {
        Row: {
          created_at: string
          created_by: string | null
          event_date: string
          event_type: string
          id: string
          note: string | null
          operations_lead_id: string
          reason: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          event_date?: string
          event_type: string
          id?: string
          note?: string | null
          operations_lead_id: string
          reason?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          event_date?: string
          event_type?: string
          id?: string
          note?: string | null
          operations_lead_id?: string
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "operations_service_events_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operations_service_events_operations_lead_id_fkey"
            columns: ["operations_lead_id"]
            isOneToOne: false
            referencedRelation: "operations_leads"
            referencedColumns: ["id"]
          },
        ]
      }
      operations_template_checklist_items: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          is_required: boolean
          label: string
          note: string | null
          sort_order: number
          template_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          is_required?: boolean
          label: string
          note?: string | null
          sort_order?: number
          template_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          is_required?: boolean
          label?: string
          note?: string | null
          sort_order?: number
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "operations_template_checklist_items_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "operations_process_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      operations_template_fields: {
        Row: {
          created_at: string
          field_key: string
          field_type: string
          id: string
          is_active: boolean
          is_required: boolean
          label: string
          options: Json | null
          sort_order: number
          template_id: string
        }
        Insert: {
          created_at?: string
          field_key: string
          field_type: string
          id?: string
          is_active?: boolean
          is_required?: boolean
          label: string
          options?: Json | null
          sort_order?: number
          template_id: string
        }
        Update: {
          created_at?: string
          field_key?: string
          field_type?: string
          id?: string
          is_active?: boolean
          is_required?: boolean
          label?: string
          options?: Json | null
          sort_order?: number
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "operations_template_fields_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "operations_process_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      paid_lead_offer_items: {
        Row: {
          created_at: string
          created_by: string | null
          crm_lead_id: string | null
          duration_unit: string | null
          duration_value: number | null
          id: string
          notes: string | null
          offer_item_id: string | null
          operations_lead_id: string | null
          paid_pipeline_lead_id: string | null
          quantity: number | null
          source_context: string | null
          source_preset_id: string | null
          title: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          crm_lead_id?: string | null
          duration_unit?: string | null
          duration_value?: number | null
          id?: string
          notes?: string | null
          offer_item_id?: string | null
          operations_lead_id?: string | null
          paid_pipeline_lead_id?: string | null
          quantity?: number | null
          source_context?: string | null
          source_preset_id?: string | null
          title: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          crm_lead_id?: string | null
          duration_unit?: string | null
          duration_value?: number | null
          id?: string
          notes?: string | null
          offer_item_id?: string | null
          operations_lead_id?: string | null
          paid_pipeline_lead_id?: string | null
          quantity?: number | null
          source_context?: string | null
          source_preset_id?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "paid_lead_offer_items_crm_lead_id_fkey"
            columns: ["crm_lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "paid_lead_offer_items_offer_item_id_fkey"
            columns: ["offer_item_id"]
            isOneToOne: false
            referencedRelation: "offer_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "paid_lead_offer_items_operations_lead_id_fkey"
            columns: ["operations_lead_id"]
            isOneToOne: false
            referencedRelation: "operations_leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "paid_lead_offer_items_paid_pipeline_lead_id_fkey"
            columns: ["paid_pipeline_lead_id"]
            isOneToOne: false
            referencedRelation: "paid_pipeline_leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "paid_lead_offer_items_source_preset_id_fkey"
            columns: ["source_preset_id"]
            isOneToOne: false
            referencedRelation: "offer_presets"
            referencedColumns: ["id"]
          },
        ]
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
      paid_pipeline_batches: {
        Row: {
          batch_name: string
          batch_status: string
          business_unit: string | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_deleted: boolean
          product_id: string | null
          product_name_snapshot: string | null
          service_package_id: string | null
          service_package_snapshot: Json | null
          source_webinar_batch_id: string | null
          source_webinar_date: string | null
          source_webinar_name: string | null
          updated_at: string
        }
        Insert: {
          batch_name: string
          batch_status?: string
          business_unit?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_deleted?: boolean
          product_id?: string | null
          product_name_snapshot?: string | null
          service_package_id?: string | null
          service_package_snapshot?: Json | null
          source_webinar_batch_id?: string | null
          source_webinar_date?: string | null
          source_webinar_name?: string | null
          updated_at?: string
        }
        Update: {
          batch_name?: string
          batch_status?: string
          business_unit?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_deleted?: boolean
          product_id?: string | null
          product_name_snapshot?: string | null
          service_package_id?: string | null
          service_package_snapshot?: Json | null
          source_webinar_batch_id?: string | null
          source_webinar_date?: string | null
          source_webinar_name?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "paid_pipeline_batches_service_package_id_fkey"
            columns: ["service_package_id"]
            isOneToOne: false
            referencedRelation: "service_packages"
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
          completed_by: string | null
          created_at: string
          created_by: string | null
          follow_up_date: string
          follow_up_reason: string | null
          follow_up_time: string | null
          follow_up_type: string | null
          id: string
          is_deleted: boolean
          notes: string | null
          paid_pipeline_lead_id: string | null
          priority: string | null
          related_crm_lead_id: string | null
          related_payment_id: string | null
          source_module: string | null
          status: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          created_by?: string | null
          follow_up_date: string
          follow_up_reason?: string | null
          follow_up_time?: string | null
          follow_up_type?: string | null
          id?: string
          is_deleted?: boolean
          notes?: string | null
          paid_pipeline_lead_id?: string | null
          priority?: string | null
          related_crm_lead_id?: string | null
          related_payment_id?: string | null
          source_module?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          created_by?: string | null
          follow_up_date?: string
          follow_up_reason?: string | null
          follow_up_time?: string | null
          follow_up_type?: string | null
          id?: string
          is_deleted?: boolean
          notes?: string | null
          paid_pipeline_lead_id?: string | null
          priority?: string | null
          related_crm_lead_id?: string | null
          related_payment_id?: string | null
          source_module?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      paid_pipeline_leads: {
        Row: {
          access_blocked_at: string | null
          access_blocked_by: string | null
          access_blocker_reason: string | null
          access_channel: string | null
          access_given_at: string | null
          access_given_by: string | null
          access_note: string | null
          access_status: string
          archive_reason: string | null
          archived_at: string | null
          archived_by: string | null
          assigned_sales_executive: string | null
          attributed_media_buyer: string | null
          attribution_sale_id: string | null
          attribution_session_id: string | null
          balance_category: string | null
          balance_description: string | null
          balance_pending: number
          business_unit: string
          code_of_conduct_request_id: string | null
          code_of_conduct_sent_at: string | null
          code_of_conduct_signed_at: string | null
          code_of_conduct_status: string | null
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
          finance_amount_approved: number | null
          finance_amount_disbursed: number | null
          finance_count_as_collected: boolean
          finance_disbursement_date: string | null
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
          paid_batch_id: string | null
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
          service_package_id: string | null
          service_package_snapshot: Json | null
          source_report_date: string | null
          source_unpaid_lead_id: string | null
          source_webinar: string | null
          source_webinar_batch_id: string | null
          token_amount_collected: number
          total_collected: number
          updated_at: string
          webinar_batch_id: string | null
        }
        Insert: {
          access_blocked_at?: string | null
          access_blocked_by?: string | null
          access_blocker_reason?: string | null
          access_channel?: string | null
          access_given_at?: string | null
          access_given_by?: string | null
          access_note?: string | null
          access_status?: string
          archive_reason?: string | null
          archived_at?: string | null
          archived_by?: string | null
          assigned_sales_executive?: string | null
          attributed_media_buyer?: string | null
          attribution_sale_id?: string | null
          attribution_session_id?: string | null
          balance_category?: string | null
          balance_description?: string | null
          balance_pending?: number
          business_unit?: string
          code_of_conduct_request_id?: string | null
          code_of_conduct_sent_at?: string | null
          code_of_conduct_signed_at?: string | null
          code_of_conduct_status?: string | null
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
          finance_amount_approved?: number | null
          finance_amount_disbursed?: number | null
          finance_count_as_collected?: boolean
          finance_disbursement_date?: string | null
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
          paid_batch_id?: string | null
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
          service_package_id?: string | null
          service_package_snapshot?: Json | null
          source_report_date?: string | null
          source_unpaid_lead_id?: string | null
          source_webinar?: string | null
          source_webinar_batch_id?: string | null
          token_amount_collected?: number
          total_collected?: number
          updated_at?: string
          webinar_batch_id?: string | null
        }
        Update: {
          access_blocked_at?: string | null
          access_blocked_by?: string | null
          access_blocker_reason?: string | null
          access_channel?: string | null
          access_given_at?: string | null
          access_given_by?: string | null
          access_note?: string | null
          access_status?: string
          archive_reason?: string | null
          archived_at?: string | null
          archived_by?: string | null
          assigned_sales_executive?: string | null
          attributed_media_buyer?: string | null
          attribution_sale_id?: string | null
          attribution_session_id?: string | null
          balance_category?: string | null
          balance_description?: string | null
          balance_pending?: number
          business_unit?: string
          code_of_conduct_request_id?: string | null
          code_of_conduct_sent_at?: string | null
          code_of_conduct_signed_at?: string | null
          code_of_conduct_status?: string | null
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
          finance_amount_approved?: number | null
          finance_amount_disbursed?: number | null
          finance_count_as_collected?: boolean
          finance_disbursement_date?: string | null
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
          paid_batch_id?: string | null
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
          service_package_id?: string | null
          service_package_snapshot?: Json | null
          source_report_date?: string | null
          source_unpaid_lead_id?: string | null
          source_webinar?: string | null
          source_webinar_batch_id?: string | null
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
            foreignKeyName: "paid_pipeline_leads_service_package_id_fkey"
            columns: ["service_package_id"]
            isOneToOne: false
            referencedRelation: "service_packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "paid_pipeline_leads_source_unpaid_lead_id_fkey"
            columns: ["source_unpaid_lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
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
          active_for_assignment: boolean
          can_receive_calling_crm_leads: boolean
          can_receive_follow_up_tasks: boolean
          can_receive_media_buyer_cases: boolean
          can_receive_operations_leads: boolean
          can_receive_paid_pipeline_leads: boolean
          can_receive_payment_recovery_leads: boolean
          created_at: string
          deactivated_at: string | null
          deactivated_by: string | null
          deactivation_reason: string | null
          department: string | null
          email: string
          full_name: string
          id: string
          include_in_round_robin: boolean
          role: string
          status: Database["public"]["Enums"]["user_status"]
        }
        Insert: {
          active_for_assignment?: boolean
          can_receive_calling_crm_leads?: boolean
          can_receive_follow_up_tasks?: boolean
          can_receive_media_buyer_cases?: boolean
          can_receive_operations_leads?: boolean
          can_receive_paid_pipeline_leads?: boolean
          can_receive_payment_recovery_leads?: boolean
          created_at?: string
          deactivated_at?: string | null
          deactivated_by?: string | null
          deactivation_reason?: string | null
          department?: string | null
          email: string
          full_name: string
          id: string
          include_in_round_robin?: boolean
          role: string
          status?: Database["public"]["Enums"]["user_status"]
        }
        Update: {
          active_for_assignment?: boolean
          can_receive_calling_crm_leads?: boolean
          can_receive_follow_up_tasks?: boolean
          can_receive_media_buyer_cases?: boolean
          can_receive_operations_leads?: boolean
          can_receive_paid_pipeline_leads?: boolean
          can_receive_payment_recovery_leads?: boolean
          created_at?: string
          deactivated_at?: string | null
          deactivated_by?: string | null
          deactivation_reason?: string | null
          department?: string | null
          email?: string
          full_name?: string
          id?: string
          include_in_round_robin?: boolean
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
      service_packages: {
        Row: {
          code: string | null
          created_at: string
          created_by: string | null
          default_process_template_id: string | null
          default_service_duration_days: number | null
          description: string | null
          id: string
          included_services: Json | null
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          code?: string | null
          created_at?: string
          created_by?: string | null
          default_process_template_id?: string | null
          default_service_duration_days?: number | null
          description?: string | null
          id?: string
          included_services?: Json | null
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          code?: string | null
          created_at?: string
          created_by?: string | null
          default_process_template_id?: string | null
          default_service_duration_days?: number | null
          description?: string | null
          id?: string
          included_services?: Json | null
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_packages_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_packages_default_process_template_id_fkey"
            columns: ["default_process_template_id"]
            isOneToOne: false
            referencedRelation: "operations_process_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      stage_sync_rules: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          notes: string | null
          rule_name: string
          sort_order: number
          suggested_field: string
          suggested_module: string
          suggested_value: string
          trigger_field: string
          trigger_module: string
          trigger_value: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          notes?: string | null
          rule_name: string
          sort_order?: number
          suggested_field: string
          suggested_module: string
          suggested_value: string
          trigger_field: string
          trigger_module: string
          trigger_value: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          notes?: string | null
          rule_name?: string
          sort_order?: number
          suggested_field?: string
          suggested_module?: string
          suggested_value?: string
          trigger_field?: string
          trigger_module?: string
          trigger_value?: string
          updated_at?: string
        }
        Relationships: []
      }
      stages: {
        Row: {
          color: string
          created_at: string
          id: string
          is_active: boolean
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
          is_active?: boolean
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
          is_active?: boolean
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
      system_refinement_items: {
        Row: {
          checklist_item: string
          created_at: string
          created_by: string | null
          description: string | null
          evidence_notes: string | null
          fix_notes: string | null
          fixed_at: string | null
          id: string
          is_deleted: boolean
          issue_type: string | null
          module_key: string | null
          module_label: string | null
          owner_name: string | null
          owner_user_id: string | null
          priority: string
          reviewed_at: string | null
          route: string | null
          screenshot_url: string | null
          section: string
          severity: string | null
          status: string
          updated_at: string
        }
        Insert: {
          checklist_item: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          evidence_notes?: string | null
          fix_notes?: string | null
          fixed_at?: string | null
          id?: string
          is_deleted?: boolean
          issue_type?: string | null
          module_key?: string | null
          module_label?: string | null
          owner_name?: string | null
          owner_user_id?: string | null
          priority?: string
          reviewed_at?: string | null
          route?: string | null
          screenshot_url?: string | null
          section: string
          severity?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          checklist_item?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          evidence_notes?: string | null
          fix_notes?: string | null
          fixed_at?: string | null
          id?: string
          is_deleted?: boolean
          issue_type?: string | null
          module_key?: string | null
          module_label?: string | null
          owner_name?: string | null
          owner_user_id?: string | null
          priority?: string
          reviewed_at?: string | null
          route?: string | null
          screenshot_url?: string | null
          section?: string
          severity?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      tags: {
        Row: {
          color: string | null
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          is_deleted: boolean
          module_scope: string
          name: string
          updated_at: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          is_deleted?: boolean
          module_scope?: string
          name: string
          updated_at?: string
        }
        Update: {
          color?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          is_deleted?: boolean
          module_scope?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      task_activity: {
        Row: {
          action: string
          created_at: string
          id: string
          task_id: string
          user_id: string | null
          user_name: string | null
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          task_id: string
          user_id?: string | null
          user_name?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          task_id?: string
          user_id?: string | null
          user_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "task_activity_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_assignee_visibility: {
        Row: {
          created_at: string
          hidden_by: string
          id: string
          is_hidden: boolean
          user_id: string
        }
        Insert: {
          created_at?: string
          hidden_by: string
          id?: string
          is_hidden?: boolean
          user_id: string
        }
        Update: {
          created_at?: string
          hidden_by?: string
          id?: string
          is_hidden?: boolean
          user_id?: string
        }
        Relationships: []
      }
      task_submissions: {
        Row: {
          created_at: string
          id: string
          note: string | null
          submission_url: string
          submitted_by: string
          submitted_by_name: string | null
          task_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          note?: string | null
          submission_url: string
          submitted_by: string
          submitted_by_name?: string | null
          task_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          note?: string | null
          submission_url?: string
          submitted_by?: string
          submitted_by_name?: string | null
          task_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_submissions_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          assigned_initials: string | null
          assigned_name: string | null
          assigned_to: string | null
          created_at: string
          created_by: string | null
          created_by_name: string | null
          due_date: string | null
          id: string
          is_archived: boolean
          note: string | null
          priority: string
          sort_order: number
          status: string
          tag: string
          title: string
          updated_at: string
        }
        Insert: {
          assigned_initials?: string | null
          assigned_name?: string | null
          assigned_to?: string | null
          created_at?: string
          created_by?: string | null
          created_by_name?: string | null
          due_date?: string | null
          id?: string
          is_archived?: boolean
          note?: string | null
          priority?: string
          sort_order?: number
          status?: string
          tag?: string
          title: string
          updated_at?: string
        }
        Update: {
          assigned_initials?: string | null
          assigned_name?: string | null
          assigned_to?: string | null
          created_at?: string
          created_by?: string | null
          created_by_name?: string | null
          due_date?: string | null
          id?: string
          is_archived?: boolean
          note?: string | null
          priority?: string
          sort_order?: number
          status?: string
          tag?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      tax_code_master: {
        Row: {
          category: string | null
          code: string
          created_at: string
          description: string
          gst_rate_default: number | null
          id: string
          is_active: boolean
          keywords: string[] | null
          source: string | null
          type: string
          updated_at: string
        }
        Insert: {
          category?: string | null
          code: string
          created_at?: string
          description: string
          gst_rate_default?: number | null
          id?: string
          is_active?: boolean
          keywords?: string[] | null
          source?: string | null
          type: string
          updated_at?: string
        }
        Update: {
          category?: string | null
          code?: string
          created_at?: string
          description?: string
          gst_rate_default?: number | null
          id?: string
          is_active?: boolean
          keywords?: string[] | null
          source?: string | null
          type?: string
          updated_at?: string
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
          deal_value: number | null
          id: string
          imported_lead_count: number | null
          is_deleted: boolean
          notes: string | null
          offer_name: string | null
          pipeline_id: string | null
          process_template_id: string | null
          product_name: string | null
          service_package_id: string | null
          service_package_snapshot: Json | null
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
          deal_value?: number | null
          id?: string
          imported_lead_count?: number | null
          is_deleted?: boolean
          notes?: string | null
          offer_name?: string | null
          pipeline_id?: string | null
          process_template_id?: string | null
          product_name?: string | null
          service_package_id?: string | null
          service_package_snapshot?: Json | null
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
          deal_value?: number | null
          id?: string
          imported_lead_count?: number | null
          is_deleted?: boolean
          notes?: string | null
          offer_name?: string | null
          pipeline_id?: string | null
          process_template_id?: string | null
          product_name?: string | null
          service_package_id?: string | null
          service_package_snapshot?: Json | null
          source_attribution_report_id?: string | null
          source_attribution_session_id?: string | null
          source_created_from?: string | null
          source_report_type?: string | null
          updated_at?: string
          webinar_date?: string | null
          webinar_name?: string
          webinar_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "webinar_batches_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "pipelines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webinar_batches_process_template_id_fkey"
            columns: ["process_template_id"]
            isOneToOne: false
            referencedRelation: "operations_process_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webinar_batches_service_package_id_fkey"
            columns: ["service_package_id"]
            isOneToOne: false
            referencedRelation: "service_packages"
            referencedColumns: ["id"]
          },
        ]
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
          archived_at: string | null
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          last_used_at: string | null
          name: string
          normalized_name: string | null
          updated_at: string
          updated_by: string | null
          usage_count: number
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          last_used_at?: string | null
          name: string
          normalized_name?: string | null
          updated_at?: string
          updated_by?: string | null
          usage_count?: number
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          last_used_at?: string | null
          name?: string
          normalized_name?: string | null
          updated_at?: string
          updated_by?: string | null
          usage_count?: number
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_hard_wipe_all_lead_data: {
        Args: { _dry_run?: boolean }
        Returns: Json
      }
      admin_wipe_demo_lead_data: { Args: { _dry_run?: boolean }; Returns: Json }
      assign_manual_invoice_number: {
        Args: { _invoice_id: string; _number: string }
        Returns: string
      }
      assign_next_invoice_number: { Args: never; Returns: string }
      can_delete_offer_item: { Args: { _id: string }; Returns: boolean }
      can_manage_invoice_settings: {
        Args: { user_uuid: string }
        Returns: boolean
      }
      get_invoice_assets_storage_diagnostics: { Args: never; Returns: Json }
      has_module_access: {
        Args: { _module_key: string; _user_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_active: { Args: { _user_id: string }; Returns: boolean }
      purge_old_deleted_reports: { Args: never; Returns: Json }
      recalculate_lead_hotness: {
        Args: { _lead_id: string }
        Returns: {
          avg_attendance_percentage: number
          cumulative_attendance_percentage: number
          current_hotness: string
          highest_attendance_percentage: number
          id: string
          last_attended_at: string | null
          lead_id: string
          manual_grade: string | null
          manual_override: boolean
          overridden_at: string | null
          overridden_by: string | null
          override_reason: string | null
          score_numeric: number
          score_reason: Json
          total_attended_minutes: number
          total_possible_minutes: number
          total_sessions_attended: number
          total_webinars_attended: number
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "lead_hotness_scores"
          isOneToOne: true
          isSetofReturn: false
        }
      }
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
      upsert_lead_session_attendance: {
        Args: {
          _attended_minutes_raw: number
          _batch_id: string
          _first_joined_at: string
          _join_count: number
          _last_left_at: string
          _lead_id: string
          _metadata?: Json
          _normalized_email: string
          _normalized_phone: string
          _raw_identity_key: string
          _session_date: string
          _session_day: number
          _session_duration_minutes: number
          _session_name: string
          _source: string
          _webinar_id: string
          _webinar_name: string
        }
        Returns: {
          attendance_grade: string
          attendance_percentage: number
          attended_minutes_capped: number
          attended_minutes_raw: number
          batch_id: string | null
          created_at: string
          first_joined_at: string | null
          id: string
          join_count: number
          last_left_at: string | null
          lead_id: string
          metadata_json: Json
          normalized_email: string | null
          normalized_phone: string | null
          raw_identity_key: string | null
          session_date: string | null
          session_day: number | null
          session_duration_minutes: number
          session_key: string
          session_name: string | null
          source: string
          updated_at: string
          webinar_id: string | null
          webinar_name: string | null
        }
        SetofOptions: {
          from: "*"
          to: "lead_session_attendance"
          isOneToOne: true
          isSetofReturn: false
        }
      }
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
      pipeline_type: "unpaid" | "paid" | "custom" | "operations"
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
      pipeline_type: ["unpaid", "paid", "custom", "operations"],
      user_status: ["pending", "active"],
    },
  },
} as const
