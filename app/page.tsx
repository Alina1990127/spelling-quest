"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { words } from "@/data/words";
import { loadProgress, saveProgress, scheduleReview } from "@/lib/progress";
import type { SpellingWord, WordProgress } from "@/types";

type Phase = "home" | "training" | "boss" | "summary";

const blankProgress = (): WordProgress => ({
  status: "new",
  attempts: 0,
  correctFullSpells: 0
});

function speak(word: string) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(word);
  utterance.lang = "en-US";
  utterance.rate = 0.82;
  window.speechSynthesis.speak(utterance);
}

function normalize(value: string) {
  return value.trim().toLowerCase();
}

export default function HomePage() {
  const [phase, setPhase] = useState<Phase>("home");
  const [progress, setProgress] = useState<Record<number, WordProgress>>({});
  const [sessionWords, setSessionWords] = useState<SpellingWord[]>([]);
  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState("");
  const [result, setResult] = useState<"correct" | "wrong" | null>(null);
  const [showMeaning, setShowMeaning] = useState(false);
  const [showSentence, setShowSentence] = useState(false);
  const [bossScore, setBossScore] = useState(0);

  useEffect(() => {
    setProgress(loadProgress());
  }, []);

  const mastered = useMemo(
    () => Object.values(progress).filter((item) => item.status === "mastered").length,
    [progress]
  );

  const tricky = useMemo(
    () => Object.values(progress).filter((item) => item.status === "tricky").length,
    [progress]
  );

  const current = sessionWords[index];

  function persist(next: Record<number, WordProgress>) {
    setProgress(next);
    saveProgress(next);
  }

  function pickTrainingWords() {
    const dueOrTricky = words.filter((word) => {
      const item = progress[word.id];
      if (!item) return false;
      if (item.status === "tricky" || item.status === "learning") return true;
      if (item.nextReviewAt && new Date(item.nextReviewAt) <= new Date()) return true;
      return false;
    });

    const newWords = words.filter((word) => !progress[word.id] || progress[word.id].status === "new");
    const chosen = [...dueOrTricky, ...newWords]
      .filter((word, idx, arr) => arr.findIndex((x) => x.id === word.id) === idx)
      .slice(0, 10);

    setSessionWords(chosen.length ? chosen : words.slice(0, 10));
    setIndex(0);
    setAnswer("");
    setResult(null);
    setShowMeaning(false);
    setShowSentence(false);
    setPhase("training");
    setTimeout(() => speak((chosen.length ? chosen : words.slice(0, 10))[0].word), 200);
  }

  function beginBoss() {
    const pool = words.filter((word) => {
      const status = progress[word.id]?.status;
      return status && status !== "new";
    });
    const chosen = [...pool].sort(() => Math.random() - 0.5).slice(0, 5);
    const fallback = words.slice(0, 5);
    setSessionWords(chosen.length >= 5 ? chosen : fallback);
    setIndex(0);
    setBossScore(0);
    setAnswer("");
    setResult(null);
    setShowMeaning(false);
    setShowSentence(false);
    setPhase("boss");
    setTimeout(() => speak((chosen.length >= 5 ? chosen : fallback)[0].word), 200);
  }

  function nextWord() {
    const nextIndex = index + 1;
    if (nextIndex >= sessionWords.length) {
      setPhase("summary");
      return;
    }
    setIndex(nextIndex);
    setAnswer("");
    setResult(null);
    setShowMeaning(false);
    setShowSentence(false);
    setTimeout(() => speak(sessionWords[nextIndex].word), 200);
  }

  function submitFullSpell(event: FormEvent) {
    event.preventDefault();
    if (!current || !answer.trim() || result) return;

    const isCorrect = normalize(answer) === normalize(current.word);
    const prev = progress[current.id] ?? blankProgress();
    const now = new Date().toISOString();

    if (isCorrect) {
      const correctFullSpells = prev.correctFullSpells + 1;
      const status: WordProgress["status"] =
        correctFullSpells >= 4
          ? "mastered"
          : phase === "boss" && correctFullSpells >= 2
          ? "bee-ready"
          : "learning";

      const next: Record<number, WordProgress> = {
        ...progress,
        [current.id]: {
          ...prev,
          attempts: prev.attempts + 1,
          correctFullSpells,
          status,
          lastSeenAt: now,
          nextReviewAt: scheduleReview(correctFullSpells)
        }
      };
      persist(next);
      if (phase === "boss") setBossScore((score) => score + 1);
      setResult("correct");
    } else {
      const next: Record<number, WordProgress> = {
        ...progress,
        [current.id]: {
          ...prev,
          attempts: prev.attempts + 1,
          status: "tricky",
          lastSeenAt: now,
          nextReviewAt: scheduleReview(0)
        }
      };
      persist(next);
      setResult("wrong");
    }
  }

  if (phase === "home") {
    return (
      <main>
        <div className="header">
          <div>
            <span className="badge">SPELLING QUEST</span>
            <h1>Train. Spell. Conquer.</h1>
            <p>Every word must finish with a complete, independent spelling attempt.</p>
          </div>
        </div>

        <div className="card">
          <h2>Today's Mission</h2>
          <p>
            Practice up to 10 words, then enter Boss Battle. Hints can help you learn,
            but only a full spelling counts.
          </p>
          <div className="stats">
            <div className="stat"><strong>{mastered}</strong><div className="small">Mastered</div></div>
            <div className="stat"><strong>{tricky}</strong><div className="small">Tricky words</div></div>
            <div className="stat"><strong>{words.length}</strong><div className="small">Words loaded</div></div>
          </div>
          <div className="actions">
            <button className="primary" onClick={pickTrainingWords}>Start Training</button>
            <button className="secondary" onClick={beginBoss}>Boss Battle</button>
          </div>
        </div>
      </main>
    );
  }

  if (phase === "summary") {
    return (
      <main>
        <div className="card">
          <span className="badge">MISSION COMPLETE</span>
          <h2>{bossScore ? `Boss score: ${bossScore}/${sessionWords.length}` : "Training complete"}</h2>
          <p>Your difficult words have been saved for review. Full-spell successes schedule later reviews automatically.</p>
          <div className="actions">
            <button className="primary" onClick={() => setPhase("home")}>Back Home</button>
            <button className="secondary" onClick={beginBoss}>New Boss Battle</button>
          </div>
        </div>
      </main>
    );
  }

  if (!current) {
    return (
      <main>
        <div className="card">
          <h2>No word is loaded yet.</h2>
          <button className="primary" onClick={() => setPhase("home")}>Back Home</button>
        </div>
      </main>
    );
  }

  return (
    <main>
      <div className="header">
        <div>
          <span className="badge">{phase === "boss" ? "BOSS BATTLE" : "FULL SPELL TRAINING"}</span>
          <h2>Word {index + 1} of {sessionWords.length}</h2>
        </div>
        <button className="secondary" onClick={() => setPhase("home")}>Exit</button>
      </div>

      <div className="progress">
        <div style={{ width: `${((index + 1) / sessionWords.length) * 100}%` }} />
      </div>

      <div className="card">
        <h2>Listen, then spell the whole word.</h2>
        <p className="small">No letters are shown before you submit.</p>

        <div className="actions">
          <button className="primary" onClick={() => speak(current.word)}>🔊 Hear Word</button>
          <button className="secondary" onClick={() => setShowMeaning((v) => !v)}>Meaning</button>
          <button className="secondary" onClick={() => setShowSentence((v) => !v)}>Sentence</button>
        </div>

        {showMeaning && <div className="clue"><strong>Meaning:</strong> {current.meaning}</div>}
        {showSentence && <div className="clue"><strong>Sentence:</strong> {current.sentence.replace(new RegExp(current.word, "gi"), "_____")}</div>}

        <form onSubmit={submitFullSpell}>
          <input
            className="spell-input"
            value={answer}
            onChange={(event) => setAnswer(event.target.value)}
            placeholder="Type the complete word"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            disabled={Boolean(result)}
            aria-label="Spell the complete word"
          />
          <div className="actions">
            <button className="primary" type="submit" disabled={!answer.trim() || Boolean(result)}>Submit Full Spell</button>
          </div>
        </form>

        {result === "correct" && (
          <div className="result ok">
            Correct — {current.word}
          </div>
        )}

        {result === "wrong" && (
          <div className="result no">
            <div>Your spelling: <strong>{answer}</strong></div>
            <div>Correct spelling: <strong>{current.word}</strong></div>
            <div className="small">This word is now in the Tricky review box.</div>
          </div>
        )}

        {result && (
          <div className="actions">
            <button className="primary" onClick={nextWord}>
              {index + 1 === sessionWords.length ? "Finish Mission" : "Next Word"}
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
