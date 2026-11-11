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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      accounts: {
        Row: {
          balance: number
          created_at: string
          currency: string
          id: string
          is_default: boolean
          metadata: Json | null
          name: string
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          balance?: number
          created_at?: string
          currency: string
          id?: string
          is_default?: boolean
          metadata?: Json | null
          name: string
          type: string
          updated_at?: string
          user_id: string
        }
        Update: {
          balance?: number
          created_at?: string
          currency?: string
          id?: string
          is_default?: boolean
          metadata?: Json | null
          name?: string
          type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "accounts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      asset_valuations: {
        Row: {
          asset_id: string
          id: string
          notes: string
          updated_at: string
          user_id: string
          value: number
          value_date: string
        }
        Insert: {
          asset_id: string
          id?: string
          notes?: string
          updated_at?: string
          user_id: string
          value: number
          value_date: string
        }
        Update: {
          asset_id?: string
          id?: string
          notes?: string
          updated_at?: string
          user_id?: string
          value?: number
          value_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "asset_valuations_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "personal_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asset_valuations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          changes: Json | null
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          user_id: string
        }
        Insert: {
          action: string
          changes?: Json | null
          created_at?: string
          entity_id: string
          entity_type: string
          id?: string
          user_id: string
        }
        Update: {
          action?: string
          changes?: Json | null
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      bill_occurrences: {
        Row: {
          bill_id: string
          created_at: string
          due_date: string
          id: string
          occurrence_index: number
          payload: Json
          review_date: string
          status: string
          timezone: string
          transaction_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          bill_id: string
          created_at?: string
          due_date: string
          id?: string
          occurrence_index: number
          payload: Json
          review_date: string
          status?: string
          timezone: string
          transaction_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          bill_id?: string
          created_at?: string
          due_date?: string
          id?: string
          occurrence_index?: number
          payload?: Json
          review_date?: string
          status?: string
          timezone?: string
          transaction_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bill_occurrences_bill_id_fkey"
            columns: ["bill_id"]
            isOneToOne: false
            referencedRelation: "personal_bills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bill_occurrences_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bill_occurrences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      budget_overrides: {
        Row: {
          amount: number
          id: string
          period_start: string
          plan_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount: number
          id?: string
          period_start: string
          plan_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          id?: string
          period_start?: string
          plan_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "budget_overrides_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "budget_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budget_overrides_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      budget_plans: {
        Row: {
          alerts_enabled: boolean
          amount: number
          archived: boolean
          category_id: string | null
          created_at: string
          currency: string
          end_date: string | null
          frequency: string
          id: string
          name: string
          start_date: string
          updated_at: string
          user_id: string
        }
        Insert: {
          alerts_enabled?: boolean
          amount: number
          archived?: boolean
          category_id?: string | null
          created_at?: string
          currency: string
          end_date?: string | null
          frequency: string
          id?: string
          name: string
          start_date: string
          updated_at?: string
          user_id: string
        }
        Update: {
          alerts_enabled?: boolean
          amount?: number
          archived?: boolean
          category_id?: string | null
          created_at?: string
          currency?: string
          end_date?: string | null
          frequency?: string
          id?: string
          name?: string
          start_date?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "budget_plans_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budget_plans_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      budgets: {
        Row: {
          amount: number
          category_id: string | null
          created_at: string
          currency: string
          id: string
          month: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount: number
          category_id?: string | null
          created_at?: string
          currency: string
          id?: string
          month: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          category_id?: string | null
          created_at?: string
          currency?: string
          id?: string
          month?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "budgets_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budgets_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      card_installments: {
        Row: {
          account_id: string
          first_due_date: string
          id: string
          installment_count: number
          name: string
          paid_principal: number
          transaction_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          account_id: string
          first_due_date: string
          id?: string
          installment_count: number
          name: string
          paid_principal?: number
          transaction_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          account_id?: string
          first_due_date?: string
          id?: string
          installment_count?: number
          name?: string
          paid_principal?: number
          transaction_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "card_installments_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "card_installments_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: true
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "card_installments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      card_settings: {
        Row: {
          account_id: string
          credit_limit: number
          due_day: number
          statement_day: number
          updated_at: string
          user_id: string
        }
        Insert: {
          account_id: string
          credit_limit: number
          due_day: number
          statement_day: number
          updated_at?: string
          user_id: string
        }
        Update: {
          account_id?: string
          credit_limit?: number
          due_day?: number
          statement_day?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "card_settings_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: true
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "card_settings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          created_at: string
          id: string
          name: string
          parent_id: string | null
          type: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          parent_id?: string | null
          type: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          parent_id?: string | null
          type?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "categories_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      event_planned_costs: {
        Row: {
          amount: number
          category_id: string | null
          event_id: string
          id: string
          is_completed: boolean
          name: string
          recorded_transaction_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          amount: number
          category_id?: string | null
          event_id: string
          id?: string
          is_completed?: boolean
          name: string
          recorded_transaction_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          category_id?: string | null
          event_id?: string
          id?: string
          is_completed?: boolean
          name?: string
          recorded_transaction_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_planned_costs_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_planned_costs_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "finance_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_planned_costs_recorded_transaction_id_fkey"
            columns: ["recorded_transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_planned_costs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      event_transactions: {
        Row: {
          event_id: string
          id: string
          transaction_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          event_id: string
          id?: string
          transaction_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          event_id?: string
          id?: string
          transaction_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_transactions_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "finance_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_transactions_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: true
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_transactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_drafts: {
        Row: {
          created_at: string
          due_date: string
          expense_id: string | null
          group_id: string
          id: string
          payload: Json
          posted_by: string | null
          schedule_id: string
          status: string
          timezone: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          due_date: string
          expense_id?: string | null
          group_id: string
          id?: string
          payload: Json
          posted_by?: string | null
          schedule_id: string
          status?: string
          timezone: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          due_date?: string
          expense_id?: string | null
          group_id?: string
          id?: string
          payload?: Json
          posted_by?: string | null
          schedule_id?: string
          status?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "expense_drafts_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "split_expenses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_drafts_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_drafts_posted_by_fkey"
            columns: ["posted_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_drafts_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "expense_schedules"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_schedules: {
        Row: {
          created_at: string
          creator_id: string
          end_date: string | null
          frequency: string
          group_id: string
          id: string
          next_index: number
          start_date: string
          status: string
          template_id: string
          timezone: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          creator_id: string
          end_date?: string | null
          frequency: string
          group_id: string
          id?: string
          next_index?: number
          start_date: string
          status?: string
          template_id: string
          timezone: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          creator_id?: string
          end_date?: string | null
          frequency?: string
          group_id?: string
          id?: string
          next_index?: number
          start_date?: string
          status?: string
          template_id?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "expense_schedules_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_schedules_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_schedules_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "split_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      finance_events: {
        Row: {
          amount: number
          archived: boolean
          created_at: string
          currency: string
          end_date: string
          id: string
          kind: string
          name: string
          notes: string
          start_date: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount: number
          archived?: boolean
          created_at?: string
          currency: string
          end_date: string
          id?: string
          kind: string
          name: string
          notes?: string
          start_date: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          archived?: boolean
          created_at?: string
          currency?: string
          end_date?: string
          id?: string
          kind?: string
          name?: string
          notes?: string
          start_date?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "finance_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      finance_preferences: {
        Row: {
          pay_day: number
          updated_at: string
          user_id: string
        }
        Insert: {
          pay_day?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          pay_day?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "finance_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      group_activity: {
        Row: {
          action: string
          actor_id: string | null
          actor_name: string
          created_at: string
          entity_id: string
          entity_type: string
          group_id: string
          id: string
          summary: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_name: string
          created_at?: string
          entity_id: string
          entity_type: string
          group_id: string
          id?: string
          summary: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_name?: string
          created_at?: string
          entity_id?: string
          entity_type?: string
          group_id?: string
          id?: string
          summary?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_activity_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_activity_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      group_invitations: {
        Row: {
          created_at: string
          created_by: string
          expires_at: string
          group_id: string
          id: string
          revoked_at: string | null
          token_hash: string
        }
        Insert: {
          created_at?: string
          created_by: string
          expires_at?: string
          group_id: string
          id?: string
          revoked_at?: string | null
          token_hash: string
        }
        Update: {
          created_at?: string
          created_by?: string
          expires_at?: string
          group_id?: string
          id?: string
          revoked_at?: string | null
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_invitations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_invitations_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      group_join_requests: {
        Row: {
          created_at: string
          decided_at: string | null
          group_id: string
          id: string
          invitation_id: string
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          decided_at?: string | null
          group_id: string
          id?: string
          invitation_id: string
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string
          decided_at?: string | null
          group_id?: string
          id?: string
          invitation_id?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_join_requests_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_join_requests_invitation_id_fkey"
            columns: ["invitation_id"]
            isOneToOne: false
            referencedRelation: "group_invitations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_join_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      group_members: {
        Row: {
          group_id: string
          id: string
          joined_at: string
          user_id: string
        }
        Insert: {
          group_id: string
          id?: string
          joined_at?: string
          user_id: string
        }
        Update: {
          group_id?: string
          id?: string
          joined_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_members_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      group_preferences: {
        Row: {
          archived: boolean
          group_id: string
          user_id: string
        }
        Insert: {
          archived?: boolean
          group_id: string
          user_id: string
        }
        Update: {
          archived?: boolean
          group_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_preferences_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      group_split_defaults: {
        Row: {
          group_id: string
          template_id: string
          updated_at: string
          updated_by: string
        }
        Insert: {
          group_id: string
          template_id: string
          updated_at?: string
          updated_by: string
        }
        Update: {
          group_id?: string
          template_id?: string
          updated_at?: string
          updated_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_split_defaults_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: true
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_split_defaults_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "split_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_split_defaults_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      groups: {
        Row: {
          created_at: string
          currency: string
          id: string
          name: string
          owner_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          currency: string
          id?: string
          name: string
          owner_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          currency?: string
          id?: string
          name?: string
          owner_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "groups_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      loan_payments: {
        Row: {
          account_id: string
          created_at: string
          date_time: string
          id: string
          interest: number
          loan_id: string
          notes: string
          principal: number
          request_key: string
          reversed_at: string | null
          user_id: string
        }
        Insert: {
          account_id: string
          created_at?: string
          date_time: string
          id?: string
          interest: number
          loan_id: string
          notes?: string
          principal: number
          request_key: string
          reversed_at?: string | null
          user_id: string
        }
        Update: {
          account_id?: string
          created_at?: string
          date_time?: string
          id?: string
          interest?: number
          loan_id?: string
          notes?: string
          principal?: number
          request_key?: string
          reversed_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "loan_payments_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loan_payments_loan_id_fkey"
            columns: ["loan_id"]
            isOneToOne: false
            referencedRelation: "personal_loans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loan_payments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      monthly_plans: {
        Row: {
          currency: string
          expected_expense: number
          expected_income: number
          id: string
          month: string
          target_saving_rate: number
          updated_at: string
          user_id: string
        }
        Insert: {
          currency: string
          expected_expense: number
          expected_income: number
          id?: string
          month: string
          target_saving_rate?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          currency?: string
          expected_expense?: number
          expected_income?: number
          id?: string
          month?: string
          target_saving_rate?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "monthly_plans_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      personal_assets: {
        Row: {
          archived: boolean
          created_at: string
          currency: string
          id: string
          kind: string
          name: string
          notes: string
          updated_at: string
          user_id: string
        }
        Insert: {
          archived?: boolean
          created_at?: string
          currency: string
          id?: string
          kind: string
          name: string
          notes?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          archived?: boolean
          created_at?: string
          currency?: string
          id?: string
          kind?: string
          name?: string
          notes?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "personal_assets_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      personal_bills: {
        Row: {
          account_id: string | null
          amount: number
          category_id: string | null
          created_at: string
          currency: string
          end_date: string | null
          frequency: string
          id: string
          name: string
          next_index: number
          notes: string
          start_date: string
          status: string
          timezone: string
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          account_id?: string | null
          amount: number
          category_id?: string | null
          created_at?: string
          currency: string
          end_date?: string | null
          frequency: string
          id?: string
          name: string
          next_index?: number
          notes?: string
          start_date: string
          status?: string
          timezone: string
          type: string
          updated_at?: string
          user_id: string
        }
        Update: {
          account_id?: string | null
          amount?: number
          category_id?: string | null
          created_at?: string
          currency?: string
          end_date?: string | null
          frequency?: string
          id?: string
          name?: string
          next_index?: number
          notes?: string
          start_date?: string
          status?: string
          timezone?: string
          type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "personal_bills_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "personal_bills_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "personal_bills_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      personal_entries: {
        Row: {
          category_id: string | null
          created_at: string
          currency: string
          date_time: string
          deleted_at: string | null
          id: string
          notes: string
          request_key: string
          tags: Json
          total_amount: number
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          category_id?: string | null
          created_at?: string
          currency: string
          date_time: string
          deleted_at?: string | null
          id?: string
          notes?: string
          request_key: string
          tags?: Json
          total_amount: number
          type: string
          updated_at?: string
          user_id: string
        }
        Update: {
          category_id?: string | null
          created_at?: string
          currency?: string
          date_time?: string
          deleted_at?: string | null
          id?: string
          notes?: string
          request_key?: string
          tags?: Json
          total_amount?: number
          type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "personal_entries_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "personal_entries_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      personal_loans: {
        Row: {
          archived: boolean
          counterparty: string
          created_at: string
          currency: string
          direction: string
          disbursed: boolean
          first_due_date: string | null
          frequency: string
          id: string
          installment_count: number
          name: string
          notes: string
          principal: number
          request_key: string
          start_date: string
          updated_at: string
          user_id: string
        }
        Insert: {
          archived?: boolean
          counterparty: string
          created_at?: string
          currency: string
          direction: string
          disbursed?: boolean
          first_due_date?: string | null
          frequency?: string
          id?: string
          installment_count?: number
          name: string
          notes?: string
          principal: number
          request_key: string
          start_date: string
          updated_at?: string
          user_id: string
        }
        Update: {
          archived?: boolean
          counterparty?: string
          created_at?: string
          currency?: string
          direction?: string
          disbursed?: boolean
          first_due_date?: string | null
          frequency?: string
          id?: string
          installment_count?: number
          name?: string
          notes?: string
          principal?: number
          request_key?: string
          start_date?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "personal_loans_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      receipt_attachments: {
        Row: {
          byte_size: number
          created_at: string
          file_name: string
          id: string
          mime_type: string
          object_path: string
          split_id: string | null
          status: string
          transaction_id: string | null
          uploader_id: string
        }
        Insert: {
          byte_size: number
          created_at?: string
          file_name: string
          id?: string
          mime_type: string
          object_path: string
          split_id?: string | null
          status?: string
          transaction_id?: string | null
          uploader_id: string
        }
        Update: {
          byte_size?: number
          created_at?: string
          file_name?: string
          id?: string
          mime_type?: string
          object_path?: string
          split_id?: string | null
          status?: string
          transaction_id?: string | null
          uploader_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "receipt_attachments_split_id_fkey"
            columns: ["split_id"]
            isOneToOne: false
            referencedRelation: "split_expenses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipt_attachments_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipt_attachments_uploader_id_fkey"
            columns: ["uploader_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      reminders: {
        Row: {
          created_at: string
          description: string | null
          due_date: string
          id: string
          is_completed: boolean
          is_read: boolean
          title: string
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          due_date: string
          id?: string
          is_completed?: boolean
          is_read?: boolean
          title: string
          type: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          due_date?: string
          id?: string
          is_completed?: boolean
          is_read?: boolean
          title?: string
          type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reminders_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      savings_goals: {
        Row: {
          account_id: string
          created_at: string
          currency: string
          id: string
          name: string
          target_amount: number
          target_date: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          account_id: string
          created_at?: string
          currency: string
          id?: string
          name: string
          target_amount: number
          target_date?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          account_id?: string
          created_at?: string
          currency?: string
          id?: string
          name?: string
          target_amount?: number
          target_date?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "savings_goals_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: true
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "savings_goals_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      settlement_reversals: {
        Row: {
          amount: number
          currency: string
          group_id: string | null
          payee_id: string
          payer_id: string
          payment_date: string
          reversed_at: string
          reversed_by: string
          settlement_id: string
        }
        Insert: {
          amount: number
          currency: string
          group_id?: string | null
          payee_id: string
          payer_id: string
          payment_date: string
          reversed_at?: string
          reversed_by: string
          settlement_id: string
        }
        Update: {
          amount?: number
          currency?: string
          group_id?: string | null
          payee_id?: string
          payer_id?: string
          payment_date?: string
          reversed_at?: string
          reversed_by?: string
          settlement_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "settlement_reversals_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "settlement_reversals_payee_id_fkey"
            columns: ["payee_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "settlement_reversals_payer_id_fkey"
            columns: ["payer_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "settlement_reversals_reversed_by_fkey"
            columns: ["reversed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      settlements: {
        Row: {
          account_id: string
          amount: number
          created_at: string
          currency: string
          date: string
          group_id: string | null
          id: string
          method: string
          notes: string | null
          payee_id: string
          payer_id: string
          updated_at: string
        }
        Insert: {
          account_id: string
          amount: number
          created_at?: string
          currency: string
          date?: string
          group_id?: string | null
          id?: string
          method?: string
          notes?: string | null
          payee_id: string
          payer_id: string
          updated_at?: string
        }
        Update: {
          account_id?: string
          amount?: number
          created_at?: string
          currency?: string
          date?: string
          group_id?: string | null
          id?: string
          method?: string
          notes?: string | null
          payee_id?: string
          payer_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "settlements_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "settlements_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "settlements_payee_id_fkey"
            columns: ["payee_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "settlements_payer_id_fkey"
            columns: ["payer_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      split_comments: {
        Row: {
          author_name: string
          body: string
          created_at: string
          deleted_at: string | null
          group_id: string
          id: string
          split_expense_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          author_name: string
          body: string
          created_at?: string
          deleted_at?: string | null
          group_id: string
          id?: string
          split_expense_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          author_name?: string
          body?: string
          created_at?: string
          deleted_at?: string | null
          group_id?: string
          id?: string
          split_expense_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "split_comments_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "split_comments_split_expense_id_fkey"
            columns: ["split_expense_id"]
            isOneToOne: false
            referencedRelation: "split_expenses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "split_comments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      split_expenses: {
        Row: {
          category_id: string | null
          created_at: string
          creator_id: string
          currency: string
          date: string
          description: string
          group_id: string | null
          id: string
          itemization: Json | null
          split_type: string
          total_amount: number
          updated_at: string
        }
        Insert: {
          category_id?: string | null
          created_at?: string
          creator_id: string
          currency: string
          date?: string
          description: string
          group_id?: string | null
          id?: string
          itemization?: Json | null
          split_type: string
          total_amount: number
          updated_at?: string
        }
        Update: {
          category_id?: string | null
          created_at?: string
          creator_id?: string
          currency?: string
          date?: string
          description?: string
          group_id?: string | null
          id?: string
          itemization?: Json | null
          split_type?: string
          total_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "split_expenses_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "split_expenses_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "split_expenses_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      split_participants: {
        Row: {
          amount_owed: number
          id: string
          share_value: number | null
          split_expense_id: string
          user_id: string
        }
        Insert: {
          amount_owed: number
          id?: string
          share_value?: number | null
          split_expense_id: string
          user_id: string
        }
        Update: {
          amount_owed?: number
          id?: string
          share_value?: number | null
          split_expense_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "split_participants_split_expense_id_fkey"
            columns: ["split_expense_id"]
            isOneToOne: false
            referencedRelation: "split_expenses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "split_participants_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      split_payers: {
        Row: {
          account_id: string
          amount_paid: number
          id: string
          split_expense_id: string
          user_id: string
        }
        Insert: {
          account_id: string
          amount_paid: number
          id?: string
          split_expense_id: string
          user_id: string
        }
        Update: {
          account_id?: string
          amount_paid?: number
          id?: string
          split_expense_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "split_payers_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "split_payers_split_expense_id_fkey"
            columns: ["split_expense_id"]
            isOneToOne: false
            referencedRelation: "split_expenses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "split_payers_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      split_templates: {
        Row: {
          archived_at: string | null
          created_at: string
          creator_id: string
          group_id: string
          id: string
          name: string
          payload: Json
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          creator_id: string
          group_id: string
          id?: string
          name: string
          payload: Json
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          creator_id?: string
          group_id?: string
          id?: string
          name?: string
          payload?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "split_templates_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "split_templates_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      transaction_import_entries: {
        Row: {
          created_at: string
          fingerprint: string
          id: string
          import_id: string
          transaction_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          fingerprint: string
          id?: string
          import_id: string
          transaction_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          fingerprint?: string
          id?: string
          import_id?: string
          transaction_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transaction_import_entries_import_id_fkey"
            columns: ["import_id"]
            isOneToOne: false
            referencedRelation: "transaction_imports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_import_entries_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_import_entries_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      transaction_imports: {
        Row: {
          created_at: string
          id: string
          payload_hash: string
          result: Json
          user_id: string
        }
        Insert: {
          created_at?: string
          id: string
          payload_hash: string
          result: Json
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          payload_hash?: string
          result?: Json
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transaction_imports_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      transactions: {
        Row: {
          account_id: string
          amount: number
          analytics_amount: number
          attachments: Json | null
          balance_delta: number
          category_id: string | null
          created_at: string
          date_time: string
          id: string
          linked_transaction_id: string | null
          notes: string | null
          source_id: string | null
          source_type: string
          tags: Json | null
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          account_id: string
          amount: number
          analytics_amount?: number
          attachments?: Json | null
          balance_delta: number
          category_id?: string | null
          created_at?: string
          date_time?: string
          id?: string
          linked_transaction_id?: string | null
          notes?: string | null
          source_id?: string | null
          source_type?: string
          tags?: Json | null
          type: string
          updated_at?: string
          user_id: string
        }
        Update: {
          account_id?: string
          amount?: number
          analytics_amount?: number
          attachments?: Json | null
          balance_delta?: number
          category_id?: string | null
          created_at?: string
          date_time?: string
          id?: string
          linked_transaction_id?: string | null
          notes?: string | null
          source_id?: string | null
          source_type?: string
          tags?: Json | null
          type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transactions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_linked_transaction_id_fkey"
            columns: ["linked_transaction_id"]
            isOneToOne: true
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          created_at: string
          display_currency: string
          id: string
          name: string
          timezone: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_currency?: string
          id: string
          name: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_currency?: string
          id?: string
          name?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      budget_plan_summary: { Args: { p_date?: string }; Returns: Json }
      budget_summary: { Args: { p_month: string }; Returns: Json }
      bulk_manual_transactions: {
        Args: { p_delete?: boolean; p_ids: string[]; p_input?: Json }
        Returns: number
      }
      copy_budgets: { Args: { p_month: string }; Returns: number }
      create_personal_asset: { Args: { p_input: Json }; Returns: Json }
      create_split_expense_atomic: {
        Args: { p_delete?: boolean; p_id?: string; p_input: Json }
        Returns: Json
      }
      debt_people: {
        Args: never
        Returns: {
          id: string
          name: string
        }[]
      }
      decide_group_join_request: {
        Args: { p_decision: string; p_group_id: string; p_request_id: string }
        Returns: Json
      }
      deleted_split_expenses: {
        Args: { p_limit?: number; p_offset?: number }
        Returns: Json
      }
      event_finance_summary: { Args: never; Returns: Json }
      execute_settlement_atomic: { Args: { p_input: Json }; Returns: Json }
      group_financial_summary: {
        Args: { p_group_id: string; p_month?: string }
        Returns: Json
      }
      group_member_profiles: {
        Args: { p_group_id: string }
        Returns: {
          id: string
          name: string
        }[]
      }
      group_split_default: { Args: { p_group_id: string }; Returns: Json }
      import_transactions_atomic: {
        Args: { p_input: Json; p_preview?: boolean }
        Returns: Json
      }
      list_expense_drafts: { Args: { p_group_id?: string }; Returns: Json }
      list_split_templates: { Args: { p_group_id: string }; Returns: Json }
      local_date_bounds: {
        Args: { p_from: string; p_to: string }
        Returns: Json
      }
      lookup_user: {
        Args: { p_email: string }
        Returns: {
          id: string
          name: string
        }[]
      }
      manage_account: {
        Args: { p_delete?: boolean; p_id?: string; p_input: Json }
        Returns: Json
      }
      manage_expense_schedule: {
        Args: { p_id?: string; p_input: Json }
        Returns: Json
      }
      manage_group: {
        Args: { p_action?: string; p_id?: string; p_input: Json }
        Returns: Json
      }
      manage_group_invitation: {
        Args: { p_action?: string; p_group_id: string; p_token?: string }
        Returns: Json
      }
      manage_personal_bill: {
        Args: { p_id?: string; p_input: Json }
        Returns: Json
      }
      manage_personal_loan: {
        Args: { p_delete?: boolean; p_id?: string; p_input: Json }
        Returns: Json
      }
      manage_receipt: {
        Args: { p_action: string; p_id?: string; p_input?: Json }
        Returns: Json
      }
      manage_split_template: {
        Args: {
          p_archive?: boolean
          p_group_id: string
          p_id?: string
          p_input: Json
        }
        Returns: Json
      }
      monthly_plan_summary: { Args: { p_month: string }; Returns: Json }
      mutate_expense_draft: {
        Args: { p_action: string; p_id: string; p_input?: Json }
        Returns: Json
      }
      mutate_personal_entry: {
        Args: { p_delete?: boolean; p_id?: string; p_input: Json }
        Returns: Json
      }
      mutate_split_comment: {
        Args: {
          p_body?: string
          p_delete?: boolean
          p_id?: string
          p_split_id?: string
        }
        Returns: Json
      }
      mutate_transaction_atomic: {
        Args: { p_delete?: boolean; p_id?: string; p_input: Json }
        Returns: Json
      }
      net_worth_history: { Args: { p_range?: string }; Returns: Json }
      personal_loan_summary: { Args: never; Returns: Json }
      record_event_cost: {
        Args: { p_id: string; p_input: Json }
        Returns: Json
      }
      record_loan_payment: {
        Args: { p_input: Json; p_loan_id: string }
        Returns: Json
      }
      refresh_personal_bills: { Args: never; Returns: number }
      restore_split_expense_atomic: { Args: { p_id: string }; Returns: Json }
      reverse_loan_payment: { Args: { p_id: string }; Returns: Json }
      reverse_settlement_atomic: { Args: { p_id: string }; Returns: Json }
      review_bill_occurrence: {
        Args: { p_action: string; p_id: string; p_input?: Json }
        Returns: Json
      }
      set_group_split_default: {
        Args: { p_group_id: string; p_template_id?: string }
        Returns: Json
      }
      simplify_debts: { Args: { p_group_id?: string }; Returns: Json }
      transaction_labels: { Args: never; Returns: Json }
      transfer_accounts_atomic: { Args: { p_input: Json }; Returns: Json }
      update_profile: { Args: { p_input: Json }; Returns: Json }
      use_group_invitation: {
        Args: { p_request?: boolean; p_token: string }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
