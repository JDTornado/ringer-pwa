
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "frames": {
                  Row: {
                    "court_end": Database["public"]['Enums']["court_end"],"created_at": string,"dead_ringers": number | null,"game_detail_level": Database["public"]['Enums']["game_detail_level"] | null,"game_id": string,"id": string,"inning": number,"points": number,"ringers_a": number,"ringers_b": number,"scoring_side": Database["public"]['Enums']["game_side"] | null,"thrower_a_participant_id": string,"thrower_a_side": Database["public"]['Enums']["game_side"] | null,"thrower_b_participant_id": string,"thrower_b_side": Database["public"]['Enums']["game_side"] | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "court_end": Database["public"]['Enums']["court_end"],"created_at"?: string,"dead_ringers"?: never,"game_detail_level"?: never,"game_id": string,"id"?: string,"inning": number,"points"?: number,"ringers_a"?: number,"ringers_b"?: number,"scoring_side"?: Database["public"]['Enums']["game_side"] | null,"thrower_a_participant_id": string,"thrower_a_side"?: never,"thrower_b_participant_id": string,"thrower_b_side"?: never,"updated_at"?: string
                  }
                  Update: {
                    "court_end"?: Database["public"]['Enums']["court_end"],"created_at"?: string,"dead_ringers"?: never,"game_detail_level"?: never,"game_id"?: string,"id"?: string,"inning"?: number,"points"?: number,"ringers_a"?: number,"ringers_b"?: number,"scoring_side"?: Database["public"]['Enums']["game_side"] | null,"thrower_a_participant_id"?: string,"thrower_a_side"?: never,"thrower_b_participant_id"?: string,"thrower_b_side"?: never,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "frames_game_is_frame_level_fk"
      columns: ["game_id","game_detail_level"]
isOneToOne: false
      referencedRelation: "game_scores"
      referencedColumns: ["game_id","detail_level"]
    },{
      foreignKeyName: "frames_game_is_frame_level_fk"
      columns: ["game_id","game_detail_level"]
isOneToOne: false
      referencedRelation: "games"
      referencedColumns: ["id","detail_level"]
    },{
      foreignKeyName: "frames_thrower_a_fk"
      columns: ["thrower_a_participant_id","game_id","thrower_a_side"]
isOneToOne: false
      referencedRelation: "game_participants"
      referencedColumns: ["id","game_id","side"]
    },{
      foreignKeyName: "frames_thrower_b_fk"
      columns: ["thrower_b_participant_id","game_id","thrower_b_side"]
isOneToOne: false
      referencedRelation: "game_participants"
      referencedColumns: ["id","game_id","side"]
    }
                  ]
                },"game_participants": {
                  Row: {
                    "capacity": Database["public"]['Enums']["participant_capacity"],"court_end": Database["public"]['Enums']["court_end"],"created_at": string,"game_id": string,"home_team_id": string | null,"id": string,"player_id": string,"side": Database["public"]['Enums']["game_side"]
                  }
                  ComputedFields: never
                  Insert: {
                    "capacity"?: Database["public"]['Enums']["participant_capacity"],"court_end": Database["public"]['Enums']["court_end"],"created_at"?: string,"game_id": string,"home_team_id"?: string | null,"id"?: string,"player_id": string,"side": Database["public"]['Enums']["game_side"]
                  }
                  Update: {
                    "capacity"?: Database["public"]['Enums']["participant_capacity"],"court_end"?: Database["public"]['Enums']["court_end"],"created_at"?: string,"game_id"?: string,"home_team_id"?: string | null,"id"?: string,"player_id"?: string,"side"?: Database["public"]['Enums']["game_side"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "game_participants_game_id_fkey"
      columns: ["game_id"]
isOneToOne: false
      referencedRelation: "game_scores"
      referencedColumns: ["game_id"]
    },{
      foreignKeyName: "game_participants_game_id_fkey"
      columns: ["game_id"]
isOneToOne: false
      referencedRelation: "games"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "game_participants_home_team_id_fkey"
      columns: ["home_team_id"]
isOneToOne: false
      referencedRelation: "teams"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "game_participants_player_id_fkey"
      columns: ["player_id"]
isOneToOne: false
      referencedRelation: "players"
      referencedColumns: ["id"]
    }
                  ]
                },"game_scorer_handoffs": {
                  Row: {
                    "from_inning": number,"game_id": string,"handed_off_at": string,"id": string,"player_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "from_inning": number,"game_id": string,"handed_off_at"?: string,"id"?: string,"player_id": string
                  }
                  Update: {
                    "from_inning"?: number,"game_id"?: string,"handed_off_at"?: string,"id"?: string,"player_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "game_scorer_handoffs_game_id_fkey"
      columns: ["game_id"]
isOneToOne: false
      referencedRelation: "game_scores"
      referencedColumns: ["game_id"]
    },{
      foreignKeyName: "game_scorer_handoffs_game_id_fkey"
      columns: ["game_id"]
isOneToOne: false
      referencedRelation: "games"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "game_scorer_handoffs_player_id_fkey"
      columns: ["player_id"]
isOneToOne: false
      referencedRelation: "players"
      referencedColumns: ["id"]
    }
                  ]
                },"games": {
                  Row: {
                    "client_game_id": string,"completed_at": string | null,"court": number | null,"created_at": string,"current_scorer_player_id": string | null,"detail_level": Database["public"]['Enums']["game_detail_level"],"entered_by_player_id": string | null,"final_score_a": number | null,"final_score_b": number | null,"id": string,"pairing_a_id": string | null,"pairing_b_id": string | null,"played_at": string | null,"round": number | null,"rules": NonNullable<Json>,"source": Database["public"]['Enums']["game_source"],"status": Database["public"]['Enums']["entity_status"],"team_a_id": string,"team_b_id": string,"team_match_id": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "client_game_id": string,"completed_at"?: string | null,"court"?: number | null,"created_at"?: string,"current_scorer_player_id"?: string | null,"detail_level"?: Database["public"]['Enums']["game_detail_level"],"entered_by_player_id"?: string | null,"final_score_a"?: number | null,"final_score_b"?: number | null,"id"?: string,"pairing_a_id"?: string | null,"pairing_b_id"?: string | null,"played_at"?: string | null,"round"?: number | null,"rules": NonNullable<Json>,"source"?: Database["public"]['Enums']["game_source"],"status"?: Database["public"]['Enums']["entity_status"],"team_a_id": string,"team_b_id": string,"team_match_id"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "client_game_id"?: string,"completed_at"?: string | null,"court"?: number | null,"created_at"?: string,"current_scorer_player_id"?: string | null,"detail_level"?: Database["public"]['Enums']["game_detail_level"],"entered_by_player_id"?: string | null,"final_score_a"?: number | null,"final_score_b"?: number | null,"id"?: string,"pairing_a_id"?: string | null,"pairing_b_id"?: string | null,"played_at"?: string | null,"round"?: number | null,"rules"?: NonNullable<Json>,"source"?: Database["public"]['Enums']["game_source"],"status"?: Database["public"]['Enums']["entity_status"],"team_a_id"?: string,"team_b_id"?: string,"team_match_id"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "games_current_scorer_player_id_fkey"
      columns: ["current_scorer_player_id"]
isOneToOne: false
      referencedRelation: "players"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "games_entered_by_player_id_fkey"
      columns: ["entered_by_player_id"]
isOneToOne: false
      referencedRelation: "players"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "games_pairing_a_id_fkey"
      columns: ["pairing_a_id"]
isOneToOne: false
      referencedRelation: "pairings"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "games_pairing_b_id_fkey"
      columns: ["pairing_b_id"]
isOneToOne: false
      referencedRelation: "pairings"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "games_team_a_id_fkey"
      columns: ["team_a_id"]
isOneToOne: false
      referencedRelation: "teams"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "games_team_b_id_fkey"
      columns: ["team_b_id"]
isOneToOne: false
      referencedRelation: "teams"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "games_team_match_id_fkey"
      columns: ["team_match_id"]
isOneToOne: false
      referencedRelation: "team_matches"
      referencedColumns: ["id"]
    }
                  ]
                },"match_nights": {
                  Row: {
                    "created_at": string,"id": string,"played_on": string,"season_id": string,"status": Database["public"]['Enums']["entity_status"],"venue": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"played_on": string,"season_id": string,"status"?: Database["public"]['Enums']["entity_status"],"venue"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"played_on"?: string,"season_id"?: string,"status"?: Database["public"]['Enums']["entity_status"],"venue"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "match_nights_season_id_fkey"
      columns: ["season_id"]
isOneToOne: false
      referencedRelation: "seasons"
      referencedColumns: ["id"]
    }
                  ]
                },"pairing_members": {
                  Row: {
                    "capacity": Database["public"]['Enums']["participant_capacity"],"court_end": Database["public"]['Enums']["court_end"],"created_at": string,"home_team_id": string | null,"id": string,"pairing_id": string,"player_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "capacity"?: Database["public"]['Enums']["participant_capacity"],"court_end": Database["public"]['Enums']["court_end"],"created_at"?: string,"home_team_id"?: string | null,"id"?: string,"pairing_id": string,"player_id": string
                  }
                  Update: {
                    "capacity"?: Database["public"]['Enums']["participant_capacity"],"court_end"?: Database["public"]['Enums']["court_end"],"created_at"?: string,"home_team_id"?: string | null,"id"?: string,"pairing_id"?: string,"player_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "pairing_members_home_team_id_fkey"
      columns: ["home_team_id"]
isOneToOne: false
      referencedRelation: "teams"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pairing_members_pairing_id_fkey"
      columns: ["pairing_id"]
isOneToOne: false
      referencedRelation: "pairings"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pairing_members_player_id_fkey"
      columns: ["player_id"]
isOneToOne: false
      referencedRelation: "players"
      referencedColumns: ["id"]
    }
                  ]
                },"pairings": {
                  Row: {
                    "created_at": string,"id": string,"slot": number,"team_id": string,"team_match_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"slot": number,"team_id": string,"team_match_id": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"slot"?: number,"team_id"?: string,"team_match_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "pairings_team_id_fkey"
      columns: ["team_id"]
isOneToOne: false
      referencedRelation: "teams"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pairings_team_match_id_fkey"
      columns: ["team_match_id"]
isOneToOne: false
      referencedRelation: "team_matches"
      referencedColumns: ["id"]
    }
                  ]
                },"players": {
                  Row: {
                    "auth_user_id": string | null,"created_at": string,"display_name": string,"id": string,"is_guest": boolean,"merged_into_player_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "auth_user_id"?: string | null,"created_at"?: string,"display_name": string,"id"?: string,"is_guest"?: boolean,"merged_into_player_id"?: string | null
                  }
                  Update: {
                    "auth_user_id"?: string | null,"created_at"?: string,"display_name"?: string,"id"?: string,"is_guest"?: boolean,"merged_into_player_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "players_merged_into_player_id_fkey"
      columns: ["merged_into_player_id"]
isOneToOne: false
      referencedRelation: "players"
      referencedColumns: ["id"]
    }
                  ]
                },"seasons": {
                  Row: {
                    "created_at": string,"ends_on": string | null,"id": string,"name": string,"starts_on": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"ends_on"?: string | null,"id"?: string,"name": string,"starts_on"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"ends_on"?: string | null,"id"?: string,"name"?: string,"starts_on"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"team_matches": {
                  Row: {
                    "created_at": string,"id": string,"night_id": string,"season_id": string,"status": Database["public"]['Enums']["entity_status"],"team_a_id": string,"team_b_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"night_id": string,"season_id": string,"status"?: Database["public"]['Enums']["entity_status"],"team_a_id": string,"team_b_id": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"night_id"?: string,"season_id"?: string,"status"?: Database["public"]['Enums']["entity_status"],"team_a_id"?: string,"team_b_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "team_matches_night_id_fkey"
      columns: ["night_id"]
isOneToOne: false
      referencedRelation: "match_nights"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "team_matches_season_id_fkey"
      columns: ["season_id"]
isOneToOne: false
      referencedRelation: "seasons"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "team_matches_team_a_season_fk"
      columns: ["team_a_id","season_id"]
isOneToOne: false
      referencedRelation: "teams"
      referencedColumns: ["id","season_id"]
    },{
      foreignKeyName: "team_matches_team_b_season_fk"
      columns: ["team_b_id","season_id"]
isOneToOne: false
      referencedRelation: "teams"
      referencedColumns: ["id","season_id"]
    }
                  ]
                },"team_memberships": {
                  Row: {
                    "active": boolean,"created_at": string,"id": string,"player_id": string,"season_id": string,"team_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"created_at"?: string,"id"?: string,"player_id": string,"season_id": string,"team_id": string
                  }
                  Update: {
                    "active"?: boolean,"created_at"?: string,"id"?: string,"player_id"?: string,"season_id"?: string,"team_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "team_memberships_player_id_fkey"
      columns: ["player_id"]
isOneToOne: false
      referencedRelation: "players"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "team_memberships_season_id_fkey"
      columns: ["season_id"]
isOneToOne: false
      referencedRelation: "seasons"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "team_memberships_team_season_fk"
      columns: ["team_id","season_id"]
isOneToOne: false
      referencedRelation: "teams"
      referencedColumns: ["id","season_id"]
    }
                  ]
                },"teams": {
                  Row: {
                    "captain_player_id": string | null,"created_at": string,"id": string,"name": string,"season_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "captain_player_id"?: string | null,"created_at"?: string,"id"?: string,"name": string,"season_id": string
                  }
                  Update: {
                    "captain_player_id"?: string | null,"created_at"?: string,"id"?: string,"name"?: string,"season_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "teams_captain_player_id_fkey"
      columns: ["captain_player_id"]
isOneToOne: false
      referencedRelation: "players"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "teams_season_id_fkey"
      columns: ["season_id"]
isOneToOne: false
      referencedRelation: "seasons"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            "game_scores": {
                  Row: {
                    "detail_level": Database["public"]['Enums']["game_detail_level"],"game_id": string,"score_a": number | null,"score_b": number | null
                  }
                  ComputedFields: never
                  Relationships: [
                    
                  ]
                }
          }
          Functions: {
            [_ in never]: never
          }
          Enums: {
            "court_end": "south"|"north","entity_status": "scheduled"|"in_progress"|"complete"|"voided","game_detail_level": "frame"|"final_only","game_side": "a"|"b","game_source": "app"|"paper","participant_capacity": "roster"|"rover"|"sub_pool"|"guest"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            "court_end": ["south", "north"],"entity_status": ["scheduled", "in_progress", "complete", "voided"],"game_detail_level": ["frame", "final_only"],"game_side": ["a", "b"],"game_source": ["app", "paper"],"participant_capacity": ["roster", "rover", "sub_pool", "guest"]
          }
        }
} as const
