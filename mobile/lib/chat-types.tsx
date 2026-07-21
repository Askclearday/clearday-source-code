// Local UI-facing chat types.
//
// These used to live in lib/chat-agent.ts alongside the tool-calling agent loop. That agent
// is gone -- every chat turn is now driven directly by lib/groq.ts's structuring calls plus
// the same persistence logic app/capture.tsx already used for its non-chat direct-Groq flow.
// This file only keeps the SHAPES ChatCards.tsx and capture.tsx need to talk to each other.
import type { StructuredItem } from "@/lib/types";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export type ChatCardItem =
  | {
      kind: "reminder";
      id: number;
      title: string;
      due_date: string | null;
      due_time: string | null;
      category?: string;
      completed?: boolean;
    }
  | {
      kind: "calendar_event";
      id: number;
      title: string;
      date: string | null;
      time: string | null;
      time_range_end?: string | null;
      category?: string;
      completed?: boolean;
    }
  | {
      kind: "note";
      id: number;
      title: string;
      content?: string | null;
      event_date?: string | null;
      event_time?: string | null;
    }
  | {
      kind: "free_slots";
      date: string;
      slots: { start: string; end: string }[];
    }
  // Rendered as a chat card instead of the old full-screen collision banner. Resolved
  // directly against the DB (see resolveChatCollision in capture.tsx) -- never routed back
  // through Groq, so a conflict can never be misread as "create a new item called reschedule."
  | {
      kind: "collision";
      message: string;
      pendingItem: StructuredItem;
      conflictWith: { id: number; title: string; time: string | null };
    }
  // Rendered as a chat card instead of the old full-screen "one more thing" banner. Holds
  // everything needed to finish saving once the user picks a time (or types one as their
  // next chat message).
  | {
      kind: "followup";
      message: string;
      pendingItem: StructuredItem;
      rawInput: string;
      suggestedTimes: { label: string; date: string; time: string }[];
      resolved?: boolean;
    };

export interface ChatCardGroup {
  id: string;
  label: string;
  items: ChatCardItem[];
}