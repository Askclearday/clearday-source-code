// TTS (text-to-speech) helper using expo-speech.
// Lets us: list available voices, preview a voice, speak a brief.
import * as Speech from "expo-speech";
import type { VoiceInfo } from "./types";

// --- Layer 1: literal gender tokens baked into the platform's own voice
// identifiers. This is more reliable than name-guessing and works
// regardless of language, so it's tried first.
//
// Android (Google/system TTS engine): voice identifiers are NOT human
// names. They look like "en-us-x-sfg#male_1-local" or
// "en-us-x-tpc#female_2-local" — the word male/female is literally in
// the string. Confirmed via Android's TextToSpeech.getVoices() output.
//
// iOS (AVSpeechSynthesisVoice): Siri voices encode gender in the
// *identifier*, not the display name — e.g.
// "com.apple.ttsbundle.siri_female_en-US_compact" or
// "com.apple.ttsbundle.siri_male_en-GB_compact". The v.name for these
// is just "Nicky" / "Aaron" etc., so the identifier is the only place
// the literal token shows up.
const FEMALE_TOKEN = /\bfemale\b/i;
const MALE_TOKEN = /\bmale\b/i; // word-boundary safe: won't match inside "female"

// Used only to pick a display name for voices whose gender we detect via a
// literal token (Android "#male_1-local", iOS "siri_female_...") rather than
// via a recognizable name in the string itself. Ordered deepest-first for
// male so the first assigned name lines up with PREFERRED_MALE_VOICE_ORDER.

// --- Layer 2: known human voice names, used as a fallback for engines
// that don't expose a literal gender token (legacy/non-Siri Apple
// voices, Microsoft/Edge, Amazon Polly, Google Cloud named voices).
// Matched case-insensitively as whole words against the raw voice name,
// then used BOTH to set gender and to replace the ugly raw system
// string (e.g. "Microsoft Aria Online (Natural)") with just the name
// itself (e.g. "Aria").
//
// Verified against Apple's official AVSpeechSynthesisVoice list and
// known Microsoft/Google/Amazon voice catalogs. Corrected from an
// earlier version that had Xander, Kanya, and Nicky misclassified:
// - Xander is Apple's Dutch (nl-NL) voice — male.
// - Kanya is Apple's Thai (th-TH) voice — female.
// - Nicky is Apple's Siri en-US voice — female.
const FEMALE_NAMES = [
  "samantha", "victoria", "karen", "tessa", "fiona", "moira", "zira",
  "hazel", "serena", "kate", "amelie", "anna", "ellie", "julia", "june",
  "laila", "luciana", "luna", "maju", "megumi", "melina", "nora", "petra",
  "satu", "seoyeon", "sinji", "aria", "jenny", "sara", "nancy",
  "michelle", "emma", "ava", "zoe", "salli", "joanna", "kendra",
  "kimberly", "ivy", "amy", "libby", "olivia", "nicky", "kanya",
  "catherine", "martha", "helena", "marie", "carmit", "lekha", "mariska",
  "damayanti", "alice", "kyoko", "oren", "yuna", "ellen", "zosia",
  "joana", "ioana", "milena", "laura", "alva", "yelda", "tiantian",
  "yushu", "monica", "paulina", "zuzana",
];

const MALE_NAMES = [
  "daniel", "oliver", "arthur", "aaron", "alex", "fred", "thomas",
  "james", "rishi", "diego", "jorge", "lasse", "paul",
  "stefan", "tariq", "tom", "yannick", "guy", "davis", "tony",
  "christopher", "eric", "roger", "brian", "jason", "matthew", "justin",
  "kevin", "joey", "russell", "liam", "ryan", "xander", "maged", "martin",
  "gordon", "hattori", "limu",
];

// Deepest/lowest-pitched male voices first — used to pick the default.
// Guy, Roger, and Fred are consistently described as the deepest common
// engine voices; the rest follow roughly by how often they're described
// as "deep" vs "light/young" in engine docs.
const PREFERRED_MALE_VOICE_ORDER = [
  "guy", "fred", "roger", "christopher", "daniel", "davis", "eric",
  "tony", "thomas", "oliver", "arthur", "aaron", "james", "tom",
  "jason", "brian", "matthew", "justin", "kevin", "russell", "liam",
  "ryan", "diego", "jorge", "stefan", "yannick", "tariq", "alex", "xander",
];

function properCase(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

// Finds the first known name token inside a raw voice name/identifier.
// Returns null if nothing matches.
function findKnownName(lower: string, list: string[]): string | null {
  for (const known of list) {
    if (new RegExp(`\\b${known}\\b`, "i").test(lower)) return known;
  }
  return null;
}

export async function getAvailableVoices(): Promise<VoiceInfo[]> {
  try {
    const voices = await Speech.getAvailableVoicesAsync();
    const seen = new Set<string>();
    const out: VoiceInfo[] = [];

    // Counters used to cycle through the name pools whenever we detect
    // gender from a literal token but the underlying string has no human
    // name in it (e.g. Android's "en-us-x-sfg#male_1-local"). This is what
    // guarantees the UI never shows a raw system identifier.
    let femalePoolIdx = 0;
    let malePoolIdx = 0;
    let unknownCount = 0;

    for (const v of voices) {
      if (!v.identifier || seen.has(v.identifier)) continue;
      seen.add(v.identifier);

      const rawName = v.name ?? v.identifier;
      const lower = rawName.toLowerCase();
      // Also check the identifier — on Android it's where the raw
      // "male"/"female" token lives, and on iOS Siri voices it's where
      // "siri_male"/"siri_female" lives (the display name won't have it).
      const idLower = v.identifier.toLowerCase();

      let gender: VoiceInfo["gender"];
      let displayName: string;

      if (FEMALE_TOKEN.test(idLower) || FEMALE_TOKEN.test(lower)) {
        gender = "female";
        // Token told us the gender, but the string itself ("en-au-x-aub
        // #female_1-local") isn't a name — assign a real one instead of
        // ever surfacing that raw string in the UI.
        displayName = properCase(FEMALE_NAMES[femalePoolIdx % FEMALE_NAMES.length]);
        femalePoolIdx++;
      } else if (MALE_TOKEN.test(idLower) || MALE_TOKEN.test(lower)) {
        gender = "male";
        displayName = properCase(
          PREFERRED_MALE_VOICE_ORDER[malePoolIdx % PREFERRED_MALE_VOICE_ORDER.length]
        );
        malePoolIdx++;
      } else {
        const femaleMatch = findKnownName(lower, FEMALE_NAMES);
        const maleMatch = !femaleMatch ? findKnownName(lower, MALE_NAMES) : null;

        if (femaleMatch) {
          gender = "female";
          displayName = properCase(femaleMatch);
        } else if (maleMatch) {
          gender = "male";
          displayName = properCase(maleMatch);
        } else {
          // Truly nothing recognized — don't guess gender, but still never
          // show the raw system string. Give it a plain, clean label.
          gender = "unknown";
          unknownCount++;
          displayName = `Voice ${unknownCount}`;
        }
      }

      out.push({
        id: v.identifier,
        name: displayName,
        language: v.language ?? null,
        gender,
      });
    }

    out.sort((a, b) => {
      const aEn = a.language?.startsWith("en") ? 0 : 1;
      const bEn = b.language?.startsWith("en") ? 0 : 1;
      if (aEn !== bEn) return aEn - bEn;
      return a.name.localeCompare(b.name);
    });
    return out;
  } catch {
    return [];
  }
}

// Picks the best available male voice, walking PREFERRED_MALE_VOICE_ORDER
// in order and returning the first match found on this device. Falls back
// to any male voice, then null if none exist. Call this with the RAW list
// from getAvailableVoices() (not a post-curation list) so `gender` is
// still present.
export function getPreferredMaleVoiceId(voices: VoiceInfo[]): string | null {
  const maleVoices = voices.filter((v) => v.gender === "male");
  if (maleVoices.length === 0) return null;

  for (const keyword of PREFERRED_MALE_VOICE_ORDER) {
    const match = maleVoices.find((v) => v.name.toLowerCase() === keyword);
    if (match) return match.id;
  }
  // No named preference matched (e.g. an Android "en-us-x-...#male_N-local"
  // voice with no human name) — just take the first male voice found.
  return maleVoices[0].id;
}

type SpeakOptions = {
  onDone?: () => void;
  onError?: (err?: unknown) => void;
  sampleText?: string;
};

export function previewVoice(voiceId: string, options?: SpeakOptions): void {
  Speech.stop();
  const text =
    options?.sampleText ?? "Good morning. This is how your daily brief will sound.";
  Speech.speak(text, {
    voice: voiceId,
    rate: 0.95,
    pitch: 1.0,
    onDone: options?.onDone,
    onStopped: options?.onDone,
    onError: options?.onError,
  });
}

export function speakBrief(
  text: string,
  voiceId: string | null,
  options?: SpeakOptions
): void {
  Speech.stop();
  Speech.speak(text, {
    voice: voiceId ?? undefined,
    rate: 0.95,
    pitch: 1.0,
    onDone: options?.onDone,
    onStopped: options?.onDone,
    onError: options?.onError,
  });
}

export function stopSpeaking(): void {
  Speech.stop();
}