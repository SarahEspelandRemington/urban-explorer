import * as Speech from "expo-speech";
import { useCallback, useRef, useState } from "react";
import { Platform } from "react-native";

interface NarrationItem {
  id: string;
  text: string;
  placeName: string;
}

export function useNarration() {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [currentPlace, setCurrentPlace] = useState<string | null>(null);
  const queueRef = useRef<NarrationItem[]>([]);
  const speakingRef = useRef(false);

  const processQueue = useCallback(() => {
    if (speakingRef.current || queueRef.current.length === 0) return;

    const item = queueRef.current.shift()!;
    speakingRef.current = true;
    setIsSpeaking(true);
    setCurrentPlace(item.placeName);

    if (Platform.OS === "web") {
      const utterance = new SpeechSynthesisUtterance(item.text);
      utterance.rate = 0.95;
      utterance.pitch = 1.0;
      utterance.onend = () => {
        speakingRef.current = false;
        setIsSpeaking(false);
        setCurrentPlace(null);
        processQueue();
      };
      utterance.onerror = () => {
        speakingRef.current = false;
        setIsSpeaking(false);
        setCurrentPlace(null);
        processQueue();
      };
      window.speechSynthesis.speak(utterance);
    } else {
      Speech.speak(item.text, {
        rate: 0.95,
        pitch: 1.0,
        onDone: () => {
          speakingRef.current = false;
          setIsSpeaking(false);
          setCurrentPlace(null);
          processQueue();
        },
        onError: () => {
          speakingRef.current = false;
          setIsSpeaking(false);
          setCurrentPlace(null);
          processQueue();
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
