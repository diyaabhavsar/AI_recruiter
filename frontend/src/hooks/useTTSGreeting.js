import { useRef, useEffect, useCallback } from "react";

// ── Scripted Phase-1 greeting (browser TTS only) ──────────────────────────────
// Plays immediately when the call connects so Alex speaks first.
// Phase-2 (Retell / Alex's real voice) takes over once the candidate responds.
const PHASE1_GREETING =
    "Hello! This is Alex from Mobio Solutions. " +
    "Your interview is about to begin. " +
    "Please say something so we can confirm your audio is working, " +
    "and then your interview will start.";

// ── Helpers ───────────────────────────────────────────────────────────────────
function pickBestVoice(voices) {
    // Prefer a natural-sounding en-US voice; fall back to any en voice, then system default
    const en = voices.filter(v => /en[-_]US/i.test(v.lang));
    const any = voices.filter(v => /^en/i.test(v.lang));
    return en[0] ?? any[0] ?? voices[0] ?? null;
}

function speak(text, voice, rate = 0.95, onEnd) {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.voice = voice;
    utterance.rate  = rate;
    utterance.pitch = 1;
    utterance.volume = 1;
    if (onEnd) utterance.onend = onEnd;
    window.speechSynthesis.speak(utterance);
    return utterance;
}

// ── Hook ─────────────────────────────────────────────────────────────────────
/**
 * useTTSGreeting
 *
 * Immediately speaks the combined GREETING_AND_INTRO via the browser's 
 * Web Speech API when `shouldStart` becomes true.
 *
 * @param {boolean}  shouldStart      - Flip to true once the Retell call is connected
 * @param {function} onIntroComplete  - Called after the TTS finishes playing
 *                                      (i.e. Retell microphone is now listening for the intro)
 * @returns {{ isTtsSpeaking: boolean }}
 */
export default function useTTSGreeting(shouldStart, onIntroComplete) {
    const isTtsSpeakingRef = useRef(false);
    const hasStartedRef    = useRef(false);
    const onIntroRef       = useRef(onIntroComplete);

    // Keep callback ref fresh without re-triggering the effect
    useEffect(() => { onIntroRef.current = onIntroComplete; }, [onIntroComplete]);

    const startTTS = useCallback(() => {
        if (hasStartedRef.current) return;
        hasStartedRef.current  = true;
        isTtsSpeakingRef.current = true;

        // Voices may not be loaded yet on first render — wait if needed
        const run = () => {
            const voices = window.speechSynthesis.getVoices();
            const voice  = pickBestVoice(voices);

            // Phase-1: speak greeting → hand off to Retell once done
            speak(PHASE1_GREETING, voice, 0.95, () => {
                isTtsSpeakingRef.current = false;
                onIntroRef.current?.();
            });
        };

        if (window.speechSynthesis.getVoices().length > 0) {
            run();
        } else {
            // Chrome needs the voiceschanged event before voices are available
            window.speechSynthesis.onvoiceschanged = () => {
                window.speechSynthesis.onvoiceschanged = null;
                run();
            };
        }
    }, []);

    useEffect(() => {
        if (shouldStart) startTTS();
    }, [shouldStart, startTTS]);

    // Cancel TTS on unmount (e.g. user navigates away mid-greeting)
    useEffect(() => {
        return () => {
            window.speechSynthesis.cancel();
        };
    }, []);

    // Expose a getter so callers can read isTtsSpeaking synchronously
    return {
        get isTtsSpeaking() { return isTtsSpeakingRef.current; },
    };
}
