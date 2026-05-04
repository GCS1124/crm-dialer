export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          full_name: string | null;
          email: string | null;
          role: "admin" | "agent";
          status: "online" | "offline" | "busy" | "break";
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          full_name?: string | null;
          email?: string | null;
          role?: "admin" | "agent";
          status?: "online" | "offline" | "busy" | "break";
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["profiles"]["Insert"]>;
      };
      imports: {
        Row: {
          id: string;
          file_name: string;
          file_type: string | null;
          uploaded_by: string | null;
          storage_path: string | null;
          total_rows: number;
          valid_rows: number;
          invalid_rows: number;
          duplicate_rows: number;
          status:
            | "uploaded"
            | "processing"
            | "validated"
            | "imported"
            | "partial_import"
            | "failed";
          created_at: string;
        };
        Insert: {
          id?: string;
          file_name: string;
          file_type?: string | null;
          uploaded_by?: string | null;
          storage_path?: string | null;
          total_rows?: number;
          valid_rows?: number;
          invalid_rows?: number;
          duplicate_rows?: number;
          status?:
            | "uploaded"
            | "processing"
            | "validated"
            | "imported"
            | "partial_import"
            | "failed";
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["imports"]["Insert"]>;
      };
      import_mappings: {
        Row: {
          id: string;
          import_id: string;
          mapping_json: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          import_id: string;
          mapping_json: Json;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["import_mappings"]["Insert"]>;
      };
      caller_lists: {
        Row: {
          id: string;
          name: string;
          import_id: string | null;
          created_by: string | null;
          assigned_to: string | null;
          status: "draft" | "active" | "completed" | "archived";
          total_callers: number;
          pending_count: number;
          completed_count: number;
          callback_count: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          import_id?: string | null;
          created_by?: string | null;
          assigned_to?: string | null;
          status?: "draft" | "active" | "completed" | "archived";
          total_callers?: number;
          pending_count?: number;
          completed_count?: number;
          callback_count?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["caller_lists"]["Insert"]>;
      };
      callers: {
        Row: {
          id: string;
          caller_list_id: string;
          import_id: string | null;
          full_name: string | null;
          first_name: string | null;
          last_name: string | null;
          phone: string;
          alt_phone: string | null;
          email: string | null;
          company: string | null;
          city: string | null;
          state: string | null;
          country: string | null;
          notes: string | null;
          source: string | null;
          tags: string[];
          status:
            | "pending"
            | "in_progress"
            | "completed"
            | "callback"
            | "failed"
            | "dnc";
          disposition:
            | "interested"
            | "not_interested"
            | "no_answer"
            | "busy"
            | "wrong_number"
            | "voicemail"
            | "callback_requested"
            | "converted"
            | null;
          assigned_to: string | null;
          last_called_at: string | null;
          next_follow_up_at: string | null;
          import_row_number: number | null;
          raw_data: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          caller_list_id: string;
          import_id?: string | null;
          full_name?: string | null;
          first_name?: string | null;
          last_name?: string | null;
          phone: string;
          alt_phone?: string | null;
          email?: string | null;
          company?: string | null;
          city?: string | null;
          state?: string | null;
          country?: string | null;
          notes?: string | null;
          source?: string | null;
          tags?: string[];
          status?:
            | "pending"
            | "in_progress"
            | "completed"
            | "callback"
            | "failed"
            | "dnc";
          disposition?:
            | "interested"
            | "not_interested"
            | "no_answer"
            | "busy"
            | "wrong_number"
            | "voicemail"
            | "callback_requested"
            | "converted"
            | null;
          assigned_to?: string | null;
          last_called_at?: string | null;
          next_follow_up_at?: string | null;
          import_row_number?: number | null;
          raw_data?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["callers"]["Insert"]>;
      };
      call_logs: {
        Row: {
          id: string;
          caller_id: string | null;
          agent_id: string | null;
          phone_number: string;
          dial_mode: "preview" | "manual";
          started_at: string | null;
          ended_at: string | null;
          duration_seconds: number | null;
          status: string | null;
          disposition: string | null;
          notes: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          caller_id?: string | null;
          agent_id?: string | null;
          phone_number: string;
          dial_mode: "preview" | "manual";
          started_at?: string | null;
          ended_at?: string | null;
          duration_seconds?: number | null;
          status?: string | null;
          disposition?: string | null;
          notes?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["call_logs"]["Insert"]>;
      };
      caller_notes: {
        Row: {
          id: string;
          caller_id: string;
          agent_id: string | null;
          note: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          caller_id: string;
          agent_id?: string | null;
          note: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["caller_notes"]["Insert"]>;
      };
      follow_ups: {
        Row: {
          id: string;
          caller_id: string;
          assigned_to: string | null;
          due_at: string;
          type: string | null;
          status: "pending" | "completed" | "cancelled";
          note: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          caller_id: string;
          assigned_to?: string | null;
          due_at: string;
          type?: string | null;
          status?: "pending" | "completed" | "cancelled";
          note?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["follow_ups"]["Insert"]>;
      };
    };
  };
}
