import { useEffect, useRef, useCallback } from "react";

const IDLE_TIMEOUT_MS = 5 * 60 * 1000; // 5 Minuten
const WARN_BEFORE_MS = 60 * 1000;       // 1 Minute vor Logout warnen

type IdleTimerOptions = {
  onIdle: () => void;
  onWarn: (secondsLeft: number) => void;
  onActivity: () => void;
};

export function useIdleTimer({ onIdle, onWarn, onActivity }: IdleTimerOptions) {
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warnTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const warned = useRef(false);

  const clearAllTimers = useCallback(() => {
    if (idleTimer.current) clearTimeout(idleTimer.current);
    if (warnTimer.current) clearTimeout(warnTimer.current);
    if (countdownInterval.current) clearInterval(countdownInterval.current);
  }, []);

  const startCountdown = useCallback(() => {
    let secondsLeft = Math.floor(WARN_BEFORE_MS / 1000);
    onWarn(secondsLeft);

    countdownInterval.current = setInterval(() => {
      secondsLeft -= 1;
      if (secondsLeft <= 0) {
        if (countdownInterval.current) clearInterval(countdownInterval.current);
      } else {
        onWarn(secondsLeft);
      }
    }, 1000);
  }, [onWarn]);

  const resetTimer = useCallback(() => {
    clearAllTimers();

    if (warned.current) {
      warned.current = false;
      onActivity();
    }

    // Warn-Timer: 9 Minuten nach letzter Aktivität
    warnTimer.current = setTimeout(() => {
      warned.current = true;
      startCountdown();
    }, IDLE_TIMEOUT_MS - WARN_BEFORE_MS);

    // Logout-Timer: 10 Minuten nach letzter Aktivität
    idleTimer.current = setTimeout(() => {
      clearAllTimers();
      onIdle();
    }, IDLE_TIMEOUT_MS);
  }, [clearAllTimers, startCountdown, onIdle, onActivity]);

  useEffect(() => {
    const events = [
      "mousemove",
      "mousedown",
      "keydown",
      "touchstart",
      "scroll",
      "click",
    ];

    const handleActivity = () => {
      if (warned.current) {
        // Nur wenn wir im Warn-Zustand sind, wirklich resetten
        resetTimer();
      } else {
        // Normale Aktivität: Timer neu starten (debounced via Timer-Reset)
        resetTimer();
      }
    };

    events.forEach((e) => window.addEventListener(e, handleActivity, { passive: true }));
    resetTimer(); // Erstmalig starten

    return () => {
      events.forEach((e) => window.removeEventListener(e, handleActivity));
      clearAllTimers();
    };
  }, [resetTimer, clearAllTimers]);
}
