export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string;
          display_name: string | null;
          created_at: string;
        };
        Insert: {
          id: string;
          email: string;
          display_name?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          display_name?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      user_settings: {
        Row: {
          owner_id: string;
          default_export_format: string;
          default_resolution_id: string;
          default_frame_preset_id: string;
          updated_at: string;
        };
        Insert: {
          owner_id: string;
          default_export_format?: string;
          default_resolution_id?: string;
          default_frame_preset_id?: string;
          updated_at?: string;
        };
        Update: {
          owner_id?: string;
          default_export_format?: string;
          default_resolution_id?: string;
          default_frame_preset_id?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      projects: {
        Row: {
          id: string;
          owner_id: string;
          name: string;
          thumbnail_url: string | null;
          favorite: boolean;
          deleted_at: string | null;
          frame_width: number;
          frame_height: number;
          folder_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          owner_id: string;
          name: string;
          thumbnail_url?: string | null;
          favorite?: boolean;
          deleted_at?: string | null;
          frame_width?: number;
          frame_height?: number;
          folder_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          owner_id?: string;
          name?: string;
          thumbnail_url?: string | null;
          favorite?: boolean;
          deleted_at?: string | null;
          frame_width?: number;
          frame_height?: number;
          folder_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      project_folders: {
        Row: {
          id: string;
          owner_id: string;
          name: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          owner_id: string;
          name: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          owner_id?: string;
          name?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      project_versions: {
        Row: {
          id: string;
          project_id: string;
          label: string | null;
          snapshot: unknown;
          created_at: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          label?: string | null;
          snapshot: unknown;
          created_at?: string;
        };
        Update: {
          id?: string;
          project_id?: string;
          label?: string | null;
          snapshot?: unknown;
          created_at?: string;
        };
        Relationships: [];
      };
      media_folders: {
        Row: {
          id: string;
          owner_id: string;
          name: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          owner_id: string;
          name: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          owner_id?: string;
          name?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      media_items: {
        Row: {
          id: string;
          owner_id: string;
          folder_id: string | null;
          name: string;
          type: "image" | "video" | "audio";
          mime_type: string;
          size: number;
          storage_path: string;
          thumbnail_path: string | null;
          duration: number | null;
          status: "processing" | "ready" | "error";
          created_at: string;
        };
        Insert: {
          id?: string;
          owner_id: string;
          folder_id?: string | null;
          name: string;
          type: "image" | "video" | "audio";
          mime_type: string;
          size?: number;
          storage_path: string;
          thumbnail_path?: string | null;
          duration?: number | null;
          status?: "processing" | "ready" | "error";
          created_at?: string;
        };
        Update: {
          id?: string;
          owner_id?: string;
          folder_id?: string | null;
          name?: string;
          type?: "image" | "video" | "audio";
          mime_type?: string;
          size?: number;
          storage_path?: string;
          thumbnail_path?: string | null;
          duration?: number | null;
          status?: "processing" | "ready" | "error";
          created_at?: string;
        };
        Relationships: [];
      };
      canvas_objects: {
        Row: {
          id: string;
          project_id: string;
          type: "image" | "video" | "text";
          name: string;
          media_id: string | null;
          src: string;
          video_src: string | null;
          x: number;
          y: number;
          width: number;
          height: number;
          rotation: number;
          locked: boolean;
          group_id: string | null;
          adjustments: unknown;
          video_adjustments: unknown;
          text_adjustments: unknown;
          start_time: number;
          end_time: number;
          fade_in: number;
          fade_out: number;
          keyframes: unknown;
          sort_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          type: "image" | "video" | "text";
          name: string;
          media_id?: string | null;
          src?: string;
          video_src?: string | null;
          x?: number;
          y?: number;
          width?: number;
          height?: number;
          rotation?: number;
          locked?: boolean;
          group_id?: string | null;
          adjustments?: unknown;
          video_adjustments?: unknown;
          text_adjustments?: unknown;
          start_time?: number;
          end_time?: number;
          fade_in?: number;
          fade_out?: number;
          keyframes?: unknown;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          project_id?: string;
          type?: "image" | "video" | "text";
          name?: string;
          media_id?: string | null;
          src?: string;
          video_src?: string | null;
          x?: number;
          y?: number;
          width?: number;
          height?: number;
          rotation?: number;
          locked?: boolean;
          group_id?: string | null;
          adjustments?: unknown;
          video_adjustments?: unknown;
          text_adjustments?: unknown;
          start_time?: number;
          end_time?: number;
          fade_in?: number;
          fade_out?: number;
          keyframes?: unknown;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      audio_tracks: {
        Row: {
          id: string;
          project_id: string;
          name: string;
          muted: boolean;
          solo: boolean;
          sort_order: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          name: string;
          muted?: boolean;
          solo?: boolean;
          sort_order?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          project_id?: string;
          name?: string;
          muted?: boolean;
          solo?: boolean;
          sort_order?: number;
          created_at?: string;
        };
        Relationships: [];
      };
      audio_clips: {
        Row: {
          id: string;
          project_id: string;
          track_id: string;
          media_id: string | null;
          src: string;
          name: string;
          start_time: number;
          trim_start: number;
          trim_end: number;
          source_duration: number;
          volume: number;
          fade_in: number;
          fade_out: number;
          loop: boolean;
          muted: boolean;
          waveform_peaks: unknown;
          created_at: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          track_id: string;
          media_id?: string | null;
          src?: string;
          name: string;
          start_time?: number;
          trim_start?: number;
          trim_end?: number;
          source_duration?: number;
          volume?: number;
          fade_in?: number;
          fade_out?: number;
          loop?: boolean;
          muted?: boolean;
          waveform_peaks?: unknown;
          created_at?: string;
        };
        Update: {
          id?: string;
          project_id?: string;
          track_id?: string;
          media_id?: string | null;
          src?: string;
          name?: string;
          start_time?: number;
          trim_start?: number;
          trim_end?: number;
          source_duration?: number;
          volume?: number;
          fade_in?: number;
          fade_out?: number;
          loop?: boolean;
          muted?: boolean;
          waveform_peaks?: unknown;
          created_at?: string;
        };
        Relationships: [];
      };
      custom_stickers: {
        Row: {
          id: string;
          owner_id: string;
          name: string;
          storage_path: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          owner_id: string;
          name: string;
          storage_path: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          owner_id?: string;
          name?: string;
          storage_path?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      custom_fonts: {
        Row: {
          id: string;
          owner_id: string;
          name: string;
          family: string;
          storage_path: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          owner_id: string;
          name: string;
          family: string;
          storage_path: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          owner_id?: string;
          name?: string;
          family?: string;
          storage_path?: string;
          created_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
