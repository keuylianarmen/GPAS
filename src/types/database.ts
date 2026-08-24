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
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      customers: {
        Row: {
          created_at: string
          id: string
          is_periodic: boolean
          name_ar: string | null
          name_en: string | null
          notes: string | null
          phone: string | null
          source: string | null
          whatsapp_opt_in: boolean
        }
        Insert: {
          created_at?: string
          id?: string
          is_periodic?: boolean
          name_ar?: string | null
          name_en?: string | null
          notes?: string | null
          phone?: string | null
          source?: string | null
          whatsapp_opt_in?: boolean
        }
        Update: {
          created_at?: string
          id?: string
          is_periodic?: boolean
          name_ar?: string | null
          name_en?: string | null
          notes?: string | null
          phone?: string | null
          source?: string | null
          whatsapp_opt_in?: boolean
        }
        Relationships: []
      }
      job_item_parts: {
        Row: {
          condition: string | null
          id: string
          job_item_id: string
          part_id: string
          qty: number
          unit_cost: number
          unit_price: number
        }
        Insert: {
          condition?: string | null
          id?: string
          job_item_id: string
          part_id: string
          qty?: number
          unit_cost?: number
          unit_price?: number
        }
        Update: {
          condition?: string | null
          id?: string
          job_item_id?: string
          part_id?: string
          qty?: number
          unit_cost?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "job_item_parts_job_item_id_fkey"
            columns: ["job_item_id"]
            isOneToOne: false
            referencedRelation: "job_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_item_parts_job_item_id_fkey"
            columns: ["job_item_id"]
            isOneToOne: false
            referencedRelation: "v_job_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_item_parts_job_item_id_fkey"
            columns: ["job_item_id"]
            isOneToOne: false
            referencedRelation: "v_job_items_nocost"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_item_parts_job_item_id_fkey"
            columns: ["job_item_id"]
            isOneToOne: false
            referencedRelation: "v_tire_fitments"
            referencedColumns: ["job_item_id"]
          },
          {
            foreignKeyName: "job_item_parts_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: false
            referencedRelation: "parts_catalog"
            referencedColumns: ["id"]
          },
        ]
      }
      job_items: {
        Row: {
          created_at: string
          description: string | null
          details: Json
          id: string
          installed_by: string | null
          job_id: string
          labor_price: number
          next_due_date: string | null
          next_due_odometer: number | null
          notes: string | null
          part_cost: number
          part_price: number
          service_id: string
          status: Database["public"]["Enums"]["item_status"]
          sub_cost: number
          sub_price: number
          subcontractor_id: string | null
          warranty_months: number | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          details?: Json
          id?: string
          installed_by?: string | null
          job_id: string
          labor_price?: number
          next_due_date?: string | null
          next_due_odometer?: number | null
          notes?: string | null
          part_cost?: number
          part_price?: number
          service_id: string
          status?: Database["public"]["Enums"]["item_status"]
          sub_cost?: number
          sub_price?: number
          subcontractor_id?: string | null
          warranty_months?: number | null
        }
        Update: {
          created_at?: string
          description?: string | null
          details?: Json
          id?: string
          installed_by?: string | null
          job_id?: string
          labor_price?: number
          next_due_date?: string | null
          next_due_odometer?: number | null
          notes?: string | null
          part_cost?: number
          part_price?: number
          service_id?: string
          status?: Database["public"]["Enums"]["item_status"]
          sub_cost?: number
          sub_price?: number
          subcontractor_id?: string | null
          warranty_months?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "job_items_installed_by_fkey"
            columns: ["installed_by"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_items_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_items_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "v_job_totals"
            referencedColumns: ["job_id"]
          },
          {
            foreignKeyName: "job_items_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "v_tire_fitments"
            referencedColumns: ["job_id"]
          },
          {
            foreignKeyName: "job_items_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_items_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "v_reminders_dismissed"
            referencedColumns: ["service_id"]
          },
          {
            foreignKeyName: "job_items_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "v_reminders_live"
            referencedColumns: ["service_id"]
          },
          {
            foreignKeyName: "job_items_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "v_revenue_by_service"
            referencedColumns: ["service_id"]
          },
          {
            foreignKeyName: "job_items_subcontractor_id_fkey"
            columns: ["subcontractor_id"]
            isOneToOne: false
            referencedRelation: "subcontractors"
            referencedColumns: ["id"]
          },
        ]
      }
      jobs: {
        Row: {
          created_at: string
          customer_id: string
          discount: number
          end_date: string | null
          id: string
          invoice_no: string | null
          job_no: number
          job_type: Database["public"]["Enums"]["job_type"]
          notes: string | null
          odometer: number | null
          payment_method: string | null
          receipt_no: string | null
          start_date: string
          status: Database["public"]["Enums"]["job_status"]
          tax_rate: number
          technician_id: string | null
          updated_at: string | null
          updated_by: string | null
          vehicle_id: string | null
        }
        Insert: {
          created_at?: string
          customer_id: string
          discount?: number
          end_date?: string | null
          id?: string
          invoice_no?: string | null
          job_no?: number
          job_type?: Database["public"]["Enums"]["job_type"]
          notes?: string | null
          odometer?: number | null
          payment_method?: string | null
          receipt_no?: string | null
          start_date?: string
          status?: Database["public"]["Enums"]["job_status"]
          tax_rate?: number
          technician_id?: string | null
          updated_at?: string | null
          updated_by?: string | null
          vehicle_id?: string | null
        }
        Update: {
          created_at?: string
          customer_id?: string
          discount?: number
          end_date?: string | null
          id?: string
          invoice_no?: string | null
          job_no?: number
          job_type?: Database["public"]["Enums"]["job_type"]
          notes?: string | null
          odometer?: number | null
          payment_method?: string | null
          receipt_no?: string | null
          start_date?: string
          status?: Database["public"]["Enums"]["job_status"]
          tax_rate?: number
          technician_id?: string | null
          updated_at?: string | null
          updated_by?: string | null
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "jobs_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "v_customer_activity"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "jobs_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "v_customer_contact_health"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "jobs_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "v_lapsed_customers"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "jobs_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "v_reminders_dismissed"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "jobs_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "v_reminders_live"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "jobs_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "v_tire_fitments"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "jobs_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "v_tow_leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_technician_id_fkey"
            columns: ["technician_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "v_reminders_dismissed"
            referencedColumns: ["vehicle_id"]
          },
          {
            foreignKeyName: "jobs_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "v_reminders_live"
            referencedColumns: ["vehicle_id"]
          },
          {
            foreignKeyName: "jobs_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "v_tire_fitments"
            referencedColumns: ["vehicle_id"]
          },
          {
            foreignKeyName: "jobs_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      lookup_values: {
        Row: {
          active: boolean
          id: string
          label_ar: string | null
          label_en: string
          list_key: string
          sort_order: number
          value: string
        }
        Insert: {
          active?: boolean
          id?: string
          label_ar?: string | null
          label_en: string
          list_key: string
          sort_order?: number
          value: string
        }
        Update: {
          active?: boolean
          id?: string
          label_ar?: string | null
          label_en?: string
          list_key?: string
          sort_order?: number
          value?: string
        }
        Relationships: []
      }
      part_cost_history: {
        Row: {
          cost: number
          effective_date: string
          id: string
          notes: string | null
          part_id: string
          supplier_id: string | null
        }
        Insert: {
          cost: number
          effective_date?: string
          id?: string
          notes?: string | null
          part_id: string
          supplier_id?: string | null
        }
        Update: {
          cost?: number
          effective_date?: string
          id?: string
          notes?: string | null
          part_id?: string
          supplier_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "part_cost_history_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: false
            referencedRelation: "parts_catalog"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "part_cost_history_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      parts_catalog: {
        Row: {
          active: boolean
          created_at: string
          default_cost: number | null
          default_price: number | null
          id: string
          name_ar: string | null
          name_en: string
          part_type: Database["public"]["Enums"]["part_type"]
          supplier_id: string | null
          unit: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          default_cost?: number | null
          default_price?: number | null
          id?: string
          name_ar?: string | null
          name_en: string
          part_type?: Database["public"]["Enums"]["part_type"]
          supplier_id?: string | null
          unit?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          default_cost?: number | null
          default_price?: number | null
          id?: string
          name_ar?: string | null
          name_en?: string
          part_type?: Database["public"]["Enums"]["part_type"]
          supplier_id?: string | null
          unit?: string
        }
        Relationships: [
          {
            foreignKeyName: "parts_catalog_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      reminder_mutes: {
        Row: {
          customer_id: string
          id: string
          muted_at: string
          muted_by: string | null
          reason: string | null
          service_id: string | null
        }
        Insert: {
          customer_id: string
          id?: string
          muted_at?: string
          muted_by?: string | null
          reason?: string | null
          service_id?: string | null
        }
        Update: {
          customer_id?: string
          id?: string
          muted_at?: string
          muted_by?: string | null
          reason?: string | null
          service_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reminder_mutes_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reminder_mutes_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "v_customer_activity"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "reminder_mutes_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "v_customer_contact_health"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "reminder_mutes_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "v_lapsed_customers"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "reminder_mutes_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "v_reminders_dismissed"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "reminder_mutes_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "v_reminders_live"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "reminder_mutes_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "v_tire_fitments"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "reminder_mutes_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "v_tow_leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reminder_mutes_muted_by_fkey"
            columns: ["muted_by"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reminder_mutes_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reminder_mutes_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "v_reminders_dismissed"
            referencedColumns: ["service_id"]
          },
          {
            foreignKeyName: "reminder_mutes_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "v_reminders_live"
            referencedColumns: ["service_id"]
          },
          {
            foreignKeyName: "reminder_mutes_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "v_revenue_by_service"
            referencedColumns: ["service_id"]
          },
        ]
      }
      reminder_sends: {
        Row: {
          attempted_at: string
          attempted_by: string | null
          channel: string
          error_code: string | null
          error_detail: string | null
          id: string
          provider_message_id: string | null
          reminder_id: string
          status: string
        }
        Insert: {
          attempted_at?: string
          attempted_by?: string | null
          channel?: string
          error_code?: string | null
          error_detail?: string | null
          id?: string
          provider_message_id?: string | null
          reminder_id: string
          status: string
        }
        Update: {
          attempted_at?: string
          attempted_by?: string | null
          channel?: string
          error_code?: string | null
          error_detail?: string | null
          id?: string
          provider_message_id?: string | null
          reminder_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "reminder_sends_attempted_by_fkey"
            columns: ["attempted_by"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reminder_sends_reminder_id_fkey"
            columns: ["reminder_id"]
            isOneToOne: false
            referencedRelation: "reminders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reminder_sends_reminder_id_fkey"
            columns: ["reminder_id"]
            isOneToOne: false
            referencedRelation: "v_reminders_dismissed"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reminder_sends_reminder_id_fkey"
            columns: ["reminder_id"]
            isOneToOne: false
            referencedRelation: "v_reminders_live"
            referencedColumns: ["id"]
          },
        ]
      }
      reminders: {
        Row: {
          created_at: string
          created_by: string | null
          due_date: string | null
          due_odometer: number | null
          id: string
          job_item_id: string | null
          note: string | null
          sent_at: string | null
          service_id: string
          status: Database["public"]["Enums"]["reminder_status"]
          vehicle_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          due_date?: string | null
          due_odometer?: number | null
          id?: string
          job_item_id?: string | null
          note?: string | null
          sent_at?: string | null
          service_id: string
          status?: Database["public"]["Enums"]["reminder_status"]
          vehicle_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          due_date?: string | null
          due_odometer?: number | null
          id?: string
          job_item_id?: string | null
          note?: string | null
          sent_at?: string | null
          service_id?: string
          status?: Database["public"]["Enums"]["reminder_status"]
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reminders_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reminders_job_item_id_fkey"
            columns: ["job_item_id"]
            isOneToOne: false
            referencedRelation: "job_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reminders_job_item_id_fkey"
            columns: ["job_item_id"]
            isOneToOne: false
            referencedRelation: "v_job_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reminders_job_item_id_fkey"
            columns: ["job_item_id"]
            isOneToOne: false
            referencedRelation: "v_job_items_nocost"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reminders_job_item_id_fkey"
            columns: ["job_item_id"]
            isOneToOne: false
            referencedRelation: "v_tire_fitments"
            referencedColumns: ["job_item_id"]
          },
          {
            foreignKeyName: "reminders_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reminders_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "v_reminders_dismissed"
            referencedColumns: ["service_id"]
          },
          {
            foreignKeyName: "reminders_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "v_reminders_live"
            referencedColumns: ["service_id"]
          },
          {
            foreignKeyName: "reminders_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "v_revenue_by_service"
            referencedColumns: ["service_id"]
          },
          {
            foreignKeyName: "reminders_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "v_reminders_dismissed"
            referencedColumns: ["vehicle_id"]
          },
          {
            foreignKeyName: "reminders_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "v_reminders_live"
            referencedColumns: ["vehicle_id"]
          },
          {
            foreignKeyName: "reminders_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "v_tire_fitments"
            referencedColumns: ["vehicle_id"]
          },
          {
            foreignKeyName: "reminders_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      service_categories: {
        Row: {
          active: boolean
          code: string
          id: number
          name_ar: string
          name_en: string
          sort_order: number
        }
        Insert: {
          active?: boolean
          code: string
          id: number
          name_ar: string
          name_en: string
          sort_order?: number
        }
        Update: {
          active?: boolean
          code?: string
          id?: number
          name_ar?: string
          name_en?: string
          sort_order?: number
        }
        Relationships: []
      }
      service_parts: {
        Row: {
          part_id: string
          service_id: string
        }
        Insert: {
          part_id: string
          service_id: string
        }
        Update: {
          part_id?: string
          service_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_parts_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: false
            referencedRelation: "parts_catalog"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_parts_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_parts_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "v_reminders_dismissed"
            referencedColumns: ["service_id"]
          },
          {
            foreignKeyName: "service_parts_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "v_reminders_live"
            referencedColumns: ["service_id"]
          },
          {
            foreignKeyName: "service_parts_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "v_revenue_by_service"
            referencedColumns: ["service_id"]
          },
        ]
      }
      services: {
        Row: {
          active: boolean
          base_rate: number | null
          category_id: number
          code: string | null
          created_at: string
          default_labor_price: number | null
          est_minutes: number | null
          fluid_grade_list: string | null
          fluid_type_list: string | null
          fluid_unit: string | null
          id: string
          name_ar: string | null
          name_en: string
          per_unit_rate: number | null
          pricing_model: Database["public"]["Enums"]["pricing_model"]
          reminder_km: number | null
          reminder_months: number | null
          tracks_tires: boolean
          triggers_reminder: boolean
        }
        Insert: {
          active?: boolean
          base_rate?: number | null
          category_id: number
          code?: string | null
          created_at?: string
          default_labor_price?: number | null
          est_minutes?: number | null
          fluid_grade_list?: string | null
          fluid_type_list?: string | null
          fluid_unit?: string | null
          id?: string
          name_ar?: string | null
          name_en: string
          per_unit_rate?: number | null
          pricing_model?: Database["public"]["Enums"]["pricing_model"]
          reminder_km?: number | null
          reminder_months?: number | null
          tracks_tires?: boolean
          triggers_reminder?: boolean
        }
        Update: {
          active?: boolean
          base_rate?: number | null
          category_id?: number
          code?: string | null
          created_at?: string
          default_labor_price?: number | null
          est_minutes?: number | null
          fluid_grade_list?: string | null
          fluid_type_list?: string | null
          fluid_unit?: string | null
          id?: string
          name_ar?: string | null
          name_en?: string
          per_unit_rate?: number | null
          pricing_model?: Database["public"]["Enums"]["pricing_model"]
          reminder_km?: number | null
          reminder_months?: number | null
          tracks_tires?: boolean
          triggers_reminder?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "services_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "service_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "services_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "v_revenue_by_category"
            referencedColumns: ["category_id"]
          },
        ]
      }
      settings: {
        Row: {
          key: string
          updated_at: string
          value: string
        }
        Insert: {
          key: string
          updated_at?: string
          value: string
        }
        Update: {
          key?: string
          updated_at?: string
          value?: string
        }
        Relationships: []
      }
      staff: {
        Row: {
          active: boolean
          created_at: string
          id: string
          name_ar: string
          name_en: string | null
          phone: string | null
          role: Database["public"]["Enums"]["staff_role"]
          user_id: string | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          name_ar: string
          name_en?: string | null
          phone?: string | null
          role?: Database["public"]["Enums"]["staff_role"]
          user_id?: string | null
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          name_ar?: string
          name_en?: string | null
          phone?: string | null
          role?: Database["public"]["Enums"]["staff_role"]
          user_id?: string | null
        }
        Relationships: []
      }
      subcontractors: {
        Row: {
          active: boolean
          default_rate: number | null
          id: string
          name: string
          notes: string | null
          phone: string | null
          type: string
        }
        Insert: {
          active?: boolean
          default_rate?: number | null
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          type: string
        }
        Update: {
          active?: boolean
          default_rate?: number | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          type?: string
        }
        Relationships: []
      }
      suppliers: {
        Row: {
          active: boolean
          contact_person: string | null
          id: string
          name: string
          notes: string | null
          payment_terms: string | null
          phone: string | null
        }
        Insert: {
          active?: boolean
          contact_person?: string | null
          id?: string
          name: string
          notes?: string | null
          payment_terms?: string | null
          phone?: string | null
        }
        Update: {
          active?: boolean
          contact_person?: string | null
          id?: string
          name?: string
          notes?: string | null
          payment_terms?: string | null
          phone?: string | null
        }
        Relationships: []
      }
      vehicles: {
        Row: {
          category: string | null
          created_at: string
          current_odometer: number | null
          customer_id: string
          id: string
          make: string | null
          model: string | null
          notes: string | null
          plate: string | null
          vin: string | null
          year: number | null
        }
        Insert: {
          category?: string | null
          created_at?: string
          current_odometer?: number | null
          customer_id: string
          id?: string
          make?: string | null
          model?: string | null
          notes?: string | null
          plate?: string | null
          vin?: string | null
          year?: number | null
        }
        Update: {
          category?: string | null
          created_at?: string
          current_odometer?: number | null
          customer_id?: string
          id?: string
          make?: string | null
          model?: string | null
          notes?: string | null
          plate?: string | null
          vin?: string | null
          year?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "vehicles_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicles_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "v_customer_activity"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "vehicles_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "v_customer_contact_health"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "vehicles_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "v_lapsed_customers"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "vehicles_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "v_reminders_dismissed"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "vehicles_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "v_reminders_live"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "vehicles_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "v_tire_fitments"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "vehicles_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "v_tow_leads"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      v_customer_activity: {
        Row: {
          customer_id: string | null
          days_since_last: number | null
          first_job: string | null
          jobs: number | null
          last_job: string | null
          lifetime_revenue: number | null
          name_ar: string | null
          name_en: string | null
          phone: string | null
          whatsapp_opt_in: boolean | null
        }
        Relationships: []
      }
      v_customer_contact_health: {
        Row: {
          customer_id: string | null
          failed_sends: number | null
          last_attempt_failed: boolean | null
          last_failure: string | null
          last_success: string | null
          no_opt_in: boolean | null
          no_phone: boolean | null
        }
        Relationships: []
      }
      v_customer_mutes: {
        Row: {
          customer_id: string | null
          id: string | null
          muted_at: string | null
          reason: string | null
          service_ar: string | null
          service_en: string | null
          service_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reminder_mutes_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reminder_mutes_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "v_customer_activity"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "reminder_mutes_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "v_customer_contact_health"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "reminder_mutes_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "v_lapsed_customers"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "reminder_mutes_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "v_reminders_dismissed"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "reminder_mutes_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "v_reminders_live"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "reminder_mutes_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "v_tire_fitments"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "reminder_mutes_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "v_tow_leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reminder_mutes_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reminder_mutes_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "v_reminders_dismissed"
            referencedColumns: ["service_id"]
          },
          {
            foreignKeyName: "reminder_mutes_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "v_reminders_live"
            referencedColumns: ["service_id"]
          },
          {
            foreignKeyName: "reminder_mutes_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "v_revenue_by_service"
            referencedColumns: ["service_id"]
          },
        ]
      }
      v_flagged_work: {
        Row: {
          category: string | null
          customer: string | null
          days_open: number | null
          flagged_on: string | null
          make: string | null
          model: string | null
          phone: string | null
          plate: string | null
          service: string | null
          whatsapp_opt_in: boolean | null
        }
        Relationships: []
      }
      v_fleet_by_make: {
        Row: {
          customers: number | null
          jobs: number | null
          last_seen: string | null
          make: string | null
          vehicles: number | null
        }
        Relationships: []
      }
      v_fluid_brands: {
        Row: {
          brand: string | null
          service_id: string | null
          uses: number | null
        }
        Relationships: [
          {
            foreignKeyName: "job_items_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_items_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "v_reminders_dismissed"
            referencedColumns: ["service_id"]
          },
          {
            foreignKeyName: "job_items_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "v_reminders_live"
            referencedColumns: ["service_id"]
          },
          {
            foreignKeyName: "job_items_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "v_revenue_by_service"
            referencedColumns: ["service_id"]
          },
        ]
      }
      v_fluid_usage: {
        Row: {
          brand: string | null
          jobs: number | null
          month: string | null
          quantity: number | null
          service: string | null
          type: string | null
          unit: string | null
        }
        Relationships: []
      }
      v_job_items: {
        Row: {
          category_id: number | null
          created_at: string | null
          description: string | null
          details: Json | null
          id: string | null
          installed_by: string | null
          item_cost: number | null
          item_price: number | null
          job_id: string | null
          labor_cost: number | null
          labor_price: number | null
          notes: string | null
          part_cost: number | null
          part_price: number | null
          service_id: string | null
          service_name_ar: string | null
          service_name_en: string | null
          status: Database["public"]["Enums"]["item_status"] | null
          sub_cost: number | null
          sub_price: number | null
          subcontractor_id: string | null
          warranty_months: number | null
        }
        Relationships: [
          {
            foreignKeyName: "job_items_installed_by_fkey"
            columns: ["installed_by"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_items_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_items_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "v_job_totals"
            referencedColumns: ["job_id"]
          },
          {
            foreignKeyName: "job_items_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "v_tire_fitments"
            referencedColumns: ["job_id"]
          },
          {
            foreignKeyName: "job_items_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_items_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "v_reminders_dismissed"
            referencedColumns: ["service_id"]
          },
          {
            foreignKeyName: "job_items_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "v_reminders_live"
            referencedColumns: ["service_id"]
          },
          {
            foreignKeyName: "job_items_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "v_revenue_by_service"
            referencedColumns: ["service_id"]
          },
          {
            foreignKeyName: "job_items_subcontractor_id_fkey"
            columns: ["subcontractor_id"]
            isOneToOne: false
            referencedRelation: "subcontractors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "services_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "service_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "services_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "v_revenue_by_category"
            referencedColumns: ["category_id"]
          },
        ]
      }
      v_job_items_nocost: {
        Row: {
          category_id: number | null
          created_at: string | null
          description: string | null
          details: Json | null
          id: string | null
          installed_by: string | null
          item_price: number | null
          job_id: string | null
          labor_price: number | null
          notes: string | null
          part_price: number | null
          service_id: string | null
          service_name_ar: string | null
          service_name_en: string | null
          status: Database["public"]["Enums"]["item_status"] | null
          sub_price: number | null
          warranty_months: number | null
        }
        Relationships: [
          {
            foreignKeyName: "job_items_installed_by_fkey"
            columns: ["installed_by"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_items_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_items_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "v_job_totals"
            referencedColumns: ["job_id"]
          },
          {
            foreignKeyName: "job_items_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "v_tire_fitments"
            referencedColumns: ["job_id"]
          },
          {
            foreignKeyName: "job_items_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_items_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "v_reminders_dismissed"
            referencedColumns: ["service_id"]
          },
          {
            foreignKeyName: "job_items_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "v_reminders_live"
            referencedColumns: ["service_id"]
          },
          {
            foreignKeyName: "job_items_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "v_revenue_by_service"
            referencedColumns: ["service_id"]
          },
          {
            foreignKeyName: "services_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "service_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "services_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "v_revenue_by_category"
            referencedColumns: ["category_id"]
          },
        ]
      }
      v_job_totals: {
        Row: {
          discount: number | null
          gross_margin: number | null
          items_done: number | null
          items_flagged: number | null
          job_cost: number | null
          job_id: string | null
          job_no: number | null
          labor_cost: number | null
          labor_price: number | null
          parts_cost: number | null
          parts_price: number | null
          start_date: string | null
          status: Database["public"]["Enums"]["job_status"] | null
          sub_cost: number | null
          sub_price: number | null
          subtotal: number | null
          total_before_tax: number | null
          total_with_tax: number | null
          vehicle_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "jobs_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "v_reminders_dismissed"
            referencedColumns: ["vehicle_id"]
          },
          {
            foreignKeyName: "jobs_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "v_reminders_live"
            referencedColumns: ["vehicle_id"]
          },
          {
            foreignKeyName: "jobs_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "v_tire_fitments"
            referencedColumns: ["vehicle_id"]
          },
          {
            foreignKeyName: "jobs_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      v_lapsed_customers: {
        Row: {
          customer_id: string | null
          days_since_last: number | null
          first_job: string | null
          jobs: number | null
          last_job: string | null
          lifetime_revenue: number | null
          name_ar: string | null
          name_en: string | null
          phone: string | null
          whatsapp_opt_in: boolean | null
        }
        Relationships: []
      }
      v_margin_by_category: {
        Row: {
          code: string | null
          cost: number | null
          jobs: number | null
          margin: number | null
          margin_pct: number | null
          month: string | null
          name_en: string | null
          revenue: number | null
        }
        Relationships: []
      }
      v_reminders_dismissed: {
        Row: {
          category: string | null
          current_odometer: number | null
          customer_id: string | null
          due_date: string | null
          due_odometer: number | null
          id: string | null
          make: string | null
          model: string | null
          name_ar: string | null
          name_en: string | null
          note: string | null
          phone: string | null
          plate: string | null
          service_ar: string | null
          service_en: string | null
          service_id: string | null
          status: Database["public"]["Enums"]["reminder_status"] | null
          vehicle_id: string | null
          whatsapp_opt_in: boolean | null
        }
        Relationships: []
      }
      v_reminders_live: {
        Row: {
          bucket: string | null
          category: string | null
          created_at: string | null
          current_odometer: number | null
          customer_id: string | null
          date_reached: boolean | null
          due_date: string | null
          due_odometer: number | null
          id: string | null
          make: string | null
          model: string | null
          name_ar: string | null
          name_en: string | null
          note: string | null
          odometer_reached: boolean | null
          phone: string | null
          plate: string | null
          service_ar: string | null
          service_en: string | null
          service_id: string | null
          triggered_by: string | null
          vehicle_id: string | null
          whatsapp_opt_in: boolean | null
        }
        Relationships: []
      }
      v_retention_by_month: {
        Row: {
          active_customers: number | null
          month: string | null
          new_customers: number | null
          returning_customers: number | null
        }
        Relationships: []
      }
      v_revenue_by_category: {
        Row: {
          category: string | null
          category_ar: string | null
          category_code: string | null
          category_id: number | null
          jobs: number | null
          lines: number | null
          month: string | null
          revenue: number | null
        }
        Relationships: []
      }
      v_revenue_by_month: {
        Row: {
          avg_job_value: number | null
          customers: number | null
          jobs: number | null
          month: string | null
          revenue: number | null
        }
        Relationships: []
      }
      v_revenue_by_service: {
        Row: {
          avg_price: number | null
          category: string | null
          month: string | null
          revenue: number | null
          service: string | null
          service_ar: string | null
          service_id: string | null
          times_done: number | null
        }
        Relationships: []
      }
      v_service_usage: {
        Row: {
          last_used: string | null
          service_id: string | null
          uses: number | null
          uses_90d: number | null
        }
        Relationships: [
          {
            foreignKeyName: "job_items_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_items_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "v_reminders_dismissed"
            referencedColumns: ["service_id"]
          },
          {
            foreignKeyName: "job_items_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "v_reminders_live"
            referencedColumns: ["service_id"]
          },
          {
            foreignKeyName: "job_items_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "v_revenue_by_service"
            referencedColumns: ["service_id"]
          },
        ]
      }
      v_tire_brands: {
        Row: {
          brand: string | null
          last_used: string | null
          uses: number | null
        }
        Relationships: []
      }
      v_tire_fitments: {
        Row: {
          brand: string | null
          condition: string | null
          customer_id: string | null
          dot: string | null
          job_id: string | null
          job_item_id: string | null
          job_no: number | null
          make: string | null
          model: string | null
          name_ar: string | null
          name_en: string | null
          odometer: number | null
          phone: string | null
          plate: string | null
          qty: number | null
          run_flat: boolean | null
          service: string | null
          size: string | null
          start_date: string | null
          vehicle_id: string | null
          warranty_months: number | null
          warranty_until: string | null
        }
        Relationships: []
      }
      v_tire_sizes: {
        Row: {
          last_used: string | null
          size: string | null
          uses: number | null
        }
        Relationships: []
      }
      v_tow_leads: {
        Row: {
          id: string | null
          last_tow: string | null
          make: string | null
          model: string | null
          name_ar: string | null
          phone: string | null
          plate: string | null
          whatsapp_opt_in: boolean | null
        }
        Relationships: []
      }
      v_vehicle_models: {
        Row: {
          make: string | null
          model: string | null
          uses: number | null
        }
        Relationships: []
      }
      v_vehicle_tire_sizes: {
        Row: {
          last_brand: string | null
          last_fitted: string | null
          size: string | null
          vehicle_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "jobs_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "v_reminders_dismissed"
            referencedColumns: ["vehicle_id"]
          },
          {
            foreignKeyName: "jobs_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "v_reminders_live"
            referencedColumns: ["vehicle_id"]
          },
          {
            foreignKeyName: "jobs_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "v_tire_fitments"
            referencedColumns: ["vehicle_id"]
          },
          {
            foreignKeyName: "jobs_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      add_manual_reminder: {
        Args: {
          p_due_date?: string
          p_due_odometer?: number
          p_note?: string
          p_service_id: string
          p_vehicle_id: string
        }
        Returns: string
      }
      current_staff_role: {
        Args: never
        Returns: Database["public"]["Enums"]["staff_role"]
      }
      is_manager: { Args: never; Returns: boolean }
      is_staff: { Args: never; Returns: boolean }
      job_items_for_me: {
        Args: { p_job_id: string }
        Returns: {
          category_id: number | null
          created_at: string | null
          description: string | null
          details: Json | null
          id: string | null
          installed_by: string | null
          item_cost: number | null
          item_price: number | null
          job_id: string | null
          labor_cost: number | null
          labor_price: number | null
          notes: string | null
          part_cost: number | null
          part_price: number | null
          service_id: string | null
          service_name_ar: string | null
          service_name_en: string | null
          status: Database["public"]["Enums"]["item_status"] | null
          sub_cost: number | null
          sub_price: number | null
          subcontractor_id: string | null
          warranty_months: number | null
        }[]
        SetofOptions: {
          from: "*"
          to: "v_job_items"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      log_reminder_send: {
        Args: {
          p_channel?: string
          p_error_code?: string
          p_error_detail?: string
          p_message_id?: string
          p_reminder_id: string
          p_status: string
        }
        Returns: string
      }
      odometer_looks_wrong: {
        Args: { p_reading: number; p_vehicle_id: string }
        Returns: string
      }
      set_reminder_due: {
        Args: {
          p_due_date?: string
          p_due_odometer?: number
          p_reminder_id: string
        }
        Returns: undefined
      }
      shop_hourly_rate: { Args: never; Returns: number }
      upsert_reminder_for_line: {
        Args: { p_line_id: string }
        Returns: undefined
      }
      vehicle_odometer_without_job: {
        Args: { p_job_id: string; p_vehicle_id: string }
        Returns: number
      }
    }
    Enums: {
      item_status: "flagged" | "declined" | "done"
      job_status: "open" | "in_progress" | "completed" | "cancelled"
      job_type: "workshop" | "roadside" | "tow_only"
      part_type: "part" | "fluid" | "consumable" | "tool"
      pricing_model: "parts_labor" | "fixed" | "per_km" | "hourly"
      reminder_status:
        | "pending"
        | "queued"
        | "sent"
        | "cancelled"
        | "superseded"
      staff_role: "admin" | "advisor" | "technician"
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
      item_status: ["flagged", "declined", "done"],
      job_status: ["open", "in_progress", "completed", "cancelled"],
      job_type: ["workshop", "roadside", "tow_only"],
      part_type: ["part", "fluid", "consumable", "tool"],
      pricing_model: ["parts_labor", "fixed", "per_km", "hourly"],
      reminder_status: ["pending", "queued", "sent", "cancelled", "superseded"],
      staff_role: ["admin", "advisor", "technician"],
    },
  },
} as const
