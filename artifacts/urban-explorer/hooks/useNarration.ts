import * as Speech from "expo-speech";
import { useCallback, useRef, useState } from "react";
import { Platform } from "react-native";

interface NarrationItem {
  id: string;
  text: string;
  placeName: string;
}

let webSpeechUnlocked = false;

export function unlockWebSpeech() {
  if (Platform.OS !== "web" || webSpeechUnlocked) return;
  try {
    const u = new SpeechSynthesisUtterance("");
    u.volume = 0;
    window.speechSynthesis.speak(u);
    window.speechSynthesis.cancel();
    webSpeechUnlocked = true;
  } catch {}
}

export function useNarration() {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [currentPlace, setCurrentPlace] = useState<string | null>(null);
  const queueRef = useRef<NarrationItem[]>([]);
  const speakingRef = useRef(false);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const processQueue = useCallback(() => {
    if (speakingRef.current || queueRef.current.length === 0) return;

    const item = queueRef.current.shift()!;
    speakingRef.current = true;
    setIsSpeaking(true);
    setCurrentPlace(item.placeName);

    const onFinish = () => {
      speakingRef.current = false;
      setIsSpeaking(false);
      setCurrentPlace(null);
      processQueue();
    };

    if (Platform.OS === "web") {
      window.speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(item.text);
      utterance.lang = "en-US";
      utterance.rate = 0.9;
      utterance.pitch = 1.05;
      utterance.onend = onFinish;
      utterance.onerror = (e) => {
        console.warn("Speech error:", e);
        onFinish();
      };

      const voices = window.speechSynthesis.getVoices();
      const preferredNames = ["samantha", "karen", "daniel", "moira", "tessa", "rishi", "google us english", "google uk english"];
      const premium = voices.find(
        (v) => v.lang.startsWith("en") && preferredNames.some((n) => v.name.toLowerCase().includes(n))
      );
      const fallback = voices.find(
        (v) => v.lang.startsWith("en-") && !v.name.toLowerCase().includes("compact")
      ) || voices.find((v) => v.lang.startsWith("en"));
      const selectedVoice = premium || fallback;
      if (selectedVoice) utterance.voice = selectedVoice;

      window.speechSynthesis.speak(utterance);

      retryTimerRef.current = setTimeout(() => {
        if (speakingRef.current && !window.speechSynthesis.speaking) {
          console.warn("Speech did not start, retrying...");
          window.speechSynthesis.cancel();
          window.speechSynthesis.speak(utterance);
        }
      }, 500);
    } else {
      Speech.speak(item.text, {
        language: "en-US",
        rate: 0.9,
        pitch: 1.05,
        onStart: () => {
          console.log("Speech started:", item.placeName);
        },
        onDone: onFinish,
        onError: (err) => {
          console.warn("Speech error:", err);
          onFinish();
        },
      });
    }
  }, []);

  const enqueue = useCallback(
    (id: string, text: string, placeName: string) => {
      queueRef.current.push({ id, text, placeName });
      processQueue();
    },
    [processQueue],
  );

  const stop = useCallback(() => {
    queueRef.current = [];
    if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    if (Platform.OS === "web") {
      window.speechSynthesis.cancel();
    } else {
      Speech.stop();
    }
    speakingRef.current = false;
    setIsSpeaking(false);
    setIsPaused(false);
    setCurrentPlace(null);
  }, []);

  const pause = useCallback(() => {
    if (Platform.OS === "web") {
      window.speechSynthesis.pause();
    } else {
      Speech.pause();
    }
    setIsPaused(true);
  }, []);

  const resume = useCallback(() => {
    if (Platform.OS === "web") {
      window.speechSynthesis.resume();
    } else {
      Speech.resume();
    }
    setIsPaused(false);
  }, []);

  const skip = useCallback(() => {
    if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    if (Platform.OS === "web") {
      window.speechSynthesis.cancel();
    } else {
      Speech.stop();
    }
    speakingRef.current = false;
    setIsSpeaking(false);
    setIsPaused(false);
    setCurrentPlace(null);
    setTimeout(() => processQueue(), 100);
  }, [processQueue]);

  return {
    enqueue,
    stop,
    pause,
    resume,
    skip,
    isSpeaking,
    isPaused,
    currentPlace,
    queueLength: queueRef.current.length,
  };
}
