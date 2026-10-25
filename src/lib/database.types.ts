/**
 * Types for the PL8 database (public schema), in the format produced by
 * `supabase gen types typescript`. Once the Supabase project is linked,
 * regenerate with: npm run db:types
 */
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type MessagingPolicy = 'everyone' | 'followers' | 'nobody';
export type VehicleVisibility = 'public' | 'private';
export type ClaimStatus = 'not_verified' | 'pending' | 'verified' | 'rejected' | 'revoked';
export type RequestStatus = 'awaiting_evidence' | 'submitted' | 'approved' | 'rejected' | 'expired';

type NoArgs = Record<PropertyKey, never>;

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: '12';
  };
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          username: string;
          display_name: string;
          bio: string;
          avatar_path: string | null;
          city: string | null;
          instagram_url: string | null;
          tiktok_url: string | null;
          linkedin_url: string | null;
          facebook_url: string | null;
          is_private: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          username: string;
          display_name: string;
          bio?: string;
          avatar_path?: string | null;
          city?: string | null;
          instagram_url?: string | null;
          tiktok_url?: string | null;
          linkedin_url?: string | null;
          facebook_url?: string | null;
          is_private?: boolean;
        };
        Update: {
          username?: string;
          display_name?: string;
          bio?: string;
          avatar_path?: string | null;
          city?: string | null;
          instagram_url?: string | null;
          tiktok_url?: string | null;
          linkedin_url?: string | null;
          facebook_url?: string | null;
          is_private?: boolean;
        };
        Relationships: [];
      };
      user_settings: {
        Row: {
          user_id: string;
          messaging_policy: MessagingPolicy;
          locale: 'de' | 'en';
          updated_at: string;
        };
        Insert: never;
        Update: {
          messaging_policy?: MessagingPolicy;
          locale?: 'de' | 'en';
        };
        Relationships: [];
      };
      blocks: {
        Row: {
          blocker_id: string;
          blocked_id: string;
          created_at: string;
        };
        Insert: {
          blocker_id: string;
          blocked_id: string;
        };
        Update: never;
        Relationships: [];
      };
      vehicles: {
        Row: {
          id: string;
          owner_id: string;
          make: string;
          model: string;
          generation: string | null;
          model_year: number;
          color: string | null;
          horsepower: number | null;
          modifications: string;
          description: string;
          visibility: VehicleVisibility;
          is_verified: boolean;
          is_restricted: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          owner_id: string;
          make: string;
          model: string;
          generation?: string | null;
          model_year: number;
          color?: string | null;
          horsepower?: number | null;
          modifications?: string;
          description?: string;
          visibility?: VehicleVisibility;
        };
        Update: {
          make?: string;
          model?: string;
          generation?: string | null;
          model_year?: number;
          color?: string | null;
          horsepower?: number | null;
          modifications?: string;
          description?: string;
          visibility?: VehicleVisibility;
        };
        Relationships: [];
      };
      vehicle_images: {
        Row: {
          id: string;
          vehicle_id: string;
          storage_path: string;
          position: number;
          width: number | null;
          height: number | null;
          created_at: string;
        };
        Insert: {
          vehicle_id: string;
          storage_path: string;
          position?: number;
          width?: number | null;
          height?: number | null;
        };
        Update: {
          position?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'vehicle_images_vehicle_id_fkey';
            columns: ['vehicle_id'];
            isOneToOne: false;
            referencedRelation: 'vehicles';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      is_username_available: {
        Args: { candidate: string };
        Returns: boolean;
      };
      list_blocked_users: {
        Args: NoArgs;
        Returns: {
          user_id: string;
          username: string;
          display_name: string;
          avatar_path: string | null;
          blocked_at: string;
        }[];
      };
      am_i_admin: { Args: NoArgs; Returns: boolean };
      claim_plate: {
        Args: {
          p_vehicle_id: string;
          p_country: string;
          p_district: string;
          p_letters: string;
          p_digits: string;
          p_suffix?: string;
        };
        Returns: string;
      };
      my_plate_claims: {
        Args: NoArgs;
        Returns: {
          claim_id: string;
          vehicle_id: string;
          country: string;
          plate: string;
          status: ClaimStatus;
          discoverable: boolean;
          show_owner: boolean;
          verified_at: string | null;
          revoke_reason: 'transfer' | 'owner_removed' | 'admin' | null;
          created_at: string;
          request_id: string | null;
          request_status: RequestStatus | null;
          challenge_code: string | null;
          decision_note: string | null;
        }[];
      };
      start_verification: {
        Args: { p_claim_id: string };
        Returns: { request_id: string; challenge_code: string }[];
      };
      submit_verification: { Args: { p_request_id: string }; Returns: undefined };
      set_plate_settings: {
        Args: { p_claim_id: string; p_discoverable: boolean; p_show_owner: boolean };
        Returns: undefined;
      };
      release_plate: { Args: { p_claim_id: string }; Returns: undefined };
      search_plate: {
        Args: { p_country: string; p_district: string; p_letters: string; p_digits: string; p_suffix?: string };
        Returns: {
          vehicle_id: string | null;
          make: string;
          model: string;
          generation: string | null;
          model_year: number;
          color: string | null;
          cover_path: string | null;
          owner_username: string | null;
          owner_display_name: string | null;
          owner_avatar_path: string | null;
        }[];
      };
      admin_verification_queue: {
        Args: NoArgs;
        Returns: {
          request_id: string;
          claim_id: string;
          submitted_at: string;
          challenge_code: string;
          country: string;
          plate: string;
          user_id: string;
          username: string;
          vehicle_id: string;
          make: string;
          model: string;
          model_year: number;
          color: string | null;
          evidence_paths: string[];
          has_conflict: boolean;
        }[];
      };
      admin_decide_verification: {
        Args: { p_request_id: string; p_approve: boolean; p_note?: string | null };
        Returns: string[];
      };
      admin_mark_evidence_purged: { Args: { p_request_id: string }; Returns: undefined };
      admin_pending_evidence_cleanup: {
        Args: NoArgs;
        Returns: { request_id: string; evidence_paths: string[] }[];
      };
      admin_revoke_claim: { Args: { p_claim_id: string; p_reason: string }; Returns: undefined };
    };
    Enums: {
      messaging_policy: MessagingPolicy;
      vehicle_visibility: VehicleVisibility;
    };
    CompositeTypes: { [_ in never]: never };
  };
};

type Fn = Database['public']['Functions'];

export type Profile = Database['public']['Tables']['profiles']['Row'];
export type ProfileUpdate = Database['public']['Tables']['profiles']['Update'];
export type UserSettings = Database['public']['Tables']['user_settings']['Row'];
export type BlockedUser = Fn['list_blocked_users']['Returns'][number];
export type Vehicle = Database['public']['Tables']['vehicles']['Row'];
export type VehicleInsert = Database['public']['Tables']['vehicles']['Insert'];
export type VehicleUpdate = Database['public']['Tables']['vehicles']['Update'];
export type VehicleImage = Database['public']['Tables']['vehicle_images']['Row'];
export type PlateClaim = Fn['my_plate_claims']['Returns'][number];
export type SearchResult = Fn['search_plate']['Returns'][number];
export type QueueItem = Fn['admin_verification_queue']['Returns'][number];
