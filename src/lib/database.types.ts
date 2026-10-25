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

export type ConversationStatus = 'request' | 'active' | 'declined';

export type InboxItem = {
  conversation_id: string;
  status: ConversationStatus;
  is_request_for_me: boolean;
  other_id: string;
  other_username: string;
  other_display_name: string;
  other_avatar_path: string | null;
  last_message: string | null;
  last_message_mine: boolean | null;
  last_message_at: string;
  unread_count: number;
};

export type ConversationInfo = {
  conversation_id: string;
  status: ConversationStatus;
  is_request_for_me: boolean;
  i_sent_request: boolean;
  other_id: string;
  other_username: string;
  other_display_name: string;
  other_avatar_path: string | null;
  other_last_read_at: string;
};

export type FeedMode = 'home' | 'discover' | 'user' | 'saved' | 'single';

export type FeedPost = {
  post_id: string;
  author_id: string;
  author_username: string;
  author_display_name: string;
  author_avatar_path: string | null;
  vehicle_id: string | null;
  vehicle_make: string | null;
  vehicle_model: string | null;
  vehicle_generation: string | null;
  caption: string;
  media_paths: string[];
  like_count: number;
  comment_count: number;
  liked: boolean;
  saved: boolean;
  published_at: string;
};

export type PostComment = {
  comment_id: string;
  author_id: string;
  author_username: string;
  author_display_name: string;
  author_avatar_path: string | null;
  body: string;
  created_at: string;
  can_delete: boolean;
};

export type FollowListItem = {
  user_id: string;
  username: string;
  display_name: string;
  avatar_path: string | null;
  followed_at: string;
};

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
          follower_count: number;
          following_count: number;
          post_count: number;
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
      follows: {
        Row: { follower_id: string; followee_id: string; created_at: string };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      follow_requests: {
        Row: { requester_id: string; target_id: string; created_at: string };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      posts: {
        Row: {
          id: string;
          author_id: string;
          vehicle_id: string | null;
          caption: string;
          like_count: number;
          comment_count: number;
          published_at: string | null;
          is_removed: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: { author_id: string; vehicle_id?: string | null; caption?: string };
        Update: { caption?: string; vehicle_id?: string | null };
        Relationships: [];
      };
      post_media: {
        Row: {
          id: string;
          post_id: string;
          storage_path: string;
          position: number;
          width: number | null;
          height: number | null;
          created_at: string;
        };
        Insert: { post_id: string; storage_path: string; position?: number; width?: number | null; height?: number | null };
        Update: never;
        Relationships: [];
      };
      likes: {
        Row: { user_id: string; post_id: string; created_at: string };
        Insert: { user_id: string; post_id: string };
        Update: never;
        Relationships: [];
      };
      comments: {
        Row: { id: string; post_id: string; author_id: string; body: string; created_at: string };
        Insert: { post_id: string; author_id: string; body: string };
        Update: never;
        Relationships: [];
      };
      conversations: {
        Row: {
          id: string;
          created_by: string | null;
          pair_key: string;
          status: ConversationStatus;
          last_message_at: string | null;
          created_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      conversation_participants: {
        Row: { conversation_id: string; user_id: string; last_read_at: string; joined_at: string };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      messages: {
        Row: { id: string; conversation_id: string; sender_id: string | null; body: string; created_at: string };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      saved_posts: {
        Row: { user_id: string; post_id: string; created_at: string };
        Insert: { user_id: string; post_id: string };
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
      follow_user: { Args: { p_target: string }; Returns: 'following' | 'requested' };
      unfollow_user: { Args: { p_target: string }; Returns: undefined };
      respond_follow_request: { Args: { p_requester: string; p_accept: boolean }; Returns: undefined };
      relationship: {
        Args: { p_target: string };
        Returns: { following: boolean; requested: boolean; follows_me: boolean; requested_me: boolean }[];
      };
      list_follows: {
        Args: { p_user: string; p_kind: 'followers' | 'following'; p_before?: string | null; p_limit?: number };
        Returns: FollowListItem[];
      };
      my_follow_requests: {
        Args: NoArgs;
        Returns: { user_id: string; username: string; display_name: string; avatar_path: string | null; requested_at: string }[];
      };
      publish_post: { Args: { p_post_id: string }; Returns: undefined };
      get_posts: {
        Args: {
          p_mode: FeedMode;
          p_user?: string | null;
          p_post?: string | null;
          p_before?: string | null;
          p_before_id?: string | null;
          p_limit?: number;
        };
        Returns: FeedPost[];
      };
      get_comments: {
        Args: { p_post: string; p_after?: string | null; p_limit?: number };
        Returns: PostComment[];
      };
      start_conversation: { Args: { p_target: string }; Returns: string };
      send_message: { Args: { p_conversation: string; p_body: string }; Returns: string };
      respond_message_request: { Args: { p_conversation: string; p_accept: boolean }; Returns: undefined };
      mark_conversation_read: { Args: { p_conversation: string }; Returns: undefined };
      my_conversations: { Args: NoArgs; Returns: InboxItem[] };
      unread_message_count: { Args: NoArgs; Returns: number };
      conversation_info: { Args: { p_conversation: string }; Returns: ConversationInfo[] };
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
export type Message = Database['public']['Tables']['messages']['Row'];
export type QueueItem = Fn['admin_verification_queue']['Returns'][number];
