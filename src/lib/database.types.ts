/**
 * Types for the PL8 database (public schema), in the format produced by
 * `supabase gen types typescript`. Once the Supabase project is linked,
 * regenerate with: npm run db:types
 */
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type MessagingPolicy = 'everyone' | 'followers' | 'nobody';

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
    };
    Views: { [_ in never]: never };
    Functions: {
      is_username_available: {
        Args: { candidate: string };
        Returns: boolean;
      };
      list_blocked_users: {
        Args: Record<PropertyKey, never>;
        Returns: {
          user_id: string;
          username: string;
          display_name: string;
          avatar_path: string | null;
          blocked_at: string;
        }[];
      };
    };
    Enums: {
      messaging_policy: MessagingPolicy;
    };
    CompositeTypes: { [_ in never]: never };
  };
};

export type Profile = Database['public']['Tables']['profiles']['Row'];
export type ProfileUpdate = Database['public']['Tables']['profiles']['Update'];
export type UserSettings = Database['public']['Tables']['user_settings']['Row'];
export type BlockedUser = Database['public']['Functions']['list_blocked_users']['Returns'][number];
