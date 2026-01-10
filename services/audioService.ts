
export const GOOGLE_VOICE_URI = 'online-google';

// A unified interface for our UI to consume
export interface AudioVoice {
  name: string;
  voiceURI: string;
  lang: string;
  localService?: boolean; // true if browser native
  originalVoice?: SpeechSynthesisVoice; // Reference to the actual browser object
}

let currentAudio: HTMLAudioElement | null = null;

export const getBrowserVoices = (): AudioVoice[] => {
  if (typeof window === 'undefined' || !window.speechSynthesis) return [];
  
  const voices = window.speechSynthesis.getVoices();
  // Filter for Russian voices
  return voices
    .filter(v => v.lang.toLowerCase().includes('ru'))
    .map(v => ({
      name: `${v.name} (Offline)`,
      voiceURI: v.voiceURI,
      lang: v.lang,
      localService: v.localService,
      originalVoice: v
    }));
};

export const speakRussian = async (
    text: string, 
    selectedVoice: AudioVoice | null = null, 
    rate: number = 0.85
) => {
  // 1. Cancel any ongoing browser speech
  if (window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }

  // 2. Cancel any ongoing audio element playback
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.src = ""; // Detach source
    currentAudio = null;
  }

  if (!text) return;

  const voiceURI = selectedVoice ? selectedVoice.voiceURI : null;

  // --- OPTION A: GOOGLE ONLINE TTS ---
  if (voiceURI === GOOGLE_VOICE_URI) {
      // Use the client=tw-ob parameter which is often more permissive for direct access
      const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(text)}&tl=ru&client=tw-ob`;
      
      try {
        const audio = new Audio(url);
        currentAudio = audio;
        audio.playbackRate = rate; 
        
        const playPromise = audio.play();
        if (playPromise !== undefined) {
          playPromise.catch(e => {
              if (e.name === 'AbortError') return;
              console.warn(`Online playback failed for ${voiceURI}, trying browser fallback.`, e);
              // Fallback to browser synthesis if URL fails
              speakBrowserNative(text, rate);
          });
        }
      } catch (e) {
        console.error("Error setting up audio", e);
        speakBrowserNative(text, rate);
      }
      return;
  }

  // --- OPTION B: BROWSER NATIVE SYNTHESIS ---
  speakBrowserNative(text, rate, selectedVoice?.originalVoice);
};

// Helper for browser native speech
const speakBrowserNative = (text: string, rate: number, preferredVoice?: SpeechSynthesisVoice) => {
    if (!window.speechSynthesis) {
        console.warn("Speech synthesis not supported");
        return;
    }

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'ru-RU';
    utterance.rate = rate; 
    utterance.pitch = 1;

    // Use preferred voice if provided
    if (preferredVoice) {
        utterance.voice = preferredVoice;
    } else {
        // Auto-select best available Russian voice if none specified
        const voices = window.speechSynthesis.getVoices();
        const ruVoices = voices.filter(v => v.lang.toLowerCase().includes('ru'));
        
        // Prioritize "Google" or "Microsoft" voices (usually higher quality)
        const bestVoice = ruVoices.find(v => v.name.includes('Google') && v.lang.includes('ru')) || 
                          ruVoices.find(v => v.name.includes('Microsoft') && v.lang.includes('ru')) || 
                          ruVoices[0];
                          
        if (bestVoice) {
            utterance.voice = bestVoice;
        }
    }

    window.speechSynthesis.speak(utterance);
}
