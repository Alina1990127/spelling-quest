"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { words } from "@/data/words";
import { loadProgress, saveProgress, scheduleReview } from "@/lib/progress";
import type { SpellingWord, WordProgress } from "@/types";

type Phase = "home" | "training" | "review" | "boss" | "progress" | "summary";
type TrainingStep = "sound" | "letter" | "spell";
type Result = "correct" | "wrong" | null;

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

function makeDecoys(word: string) {
  const candidates = new Set<string>();
  if (word.length > 3) {
    const mid = Math.floor(word.length / 2);
    candidates.add(word.slice(0, mid) + word[mid + 1] + word[mid] + word.slice(mid + 2));
    candidates.add(word.slice(0, mid) + word[mid] + word[mid] + word.slice(mid + 1));
    candidates.add(word.slice(0, mid - 1) + word.slice(mid));
  }
  candidates.delete(word);
  const fallback = [word + "e", word.slice(0, -1), word[0] + word];
  for (const item of fallback) {
    if (item && item !== word) candidates.add(item);
  }
  return [word, ...Array.from(candidates).slice(0, 2)].sort();
}

function statusLabel(status?: WordProgress["status"]) {
  if (!status) return "New";
  return status === "bee-ready"
    ? "Bee Ready"
    : status.charAt(0).toUpperCase() + status.slice(1);
}

export default function HomePage() {
  const [phase, setPhase] = useState<Phase>("home");
  const [trainingStep, setTrainingStep] = useState<TrainingStep>("sound");
  const [progress, setProgress] = useState<Record<number, WordProgress>>({});
  const [sessionWords, setSessionWords] = useState<SpellingWord[]>([]);
  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState("");
  const [result, setResult] = useState<Result>(null);
  const [showMeaning, setShowMeaning] = useState(false);
  const [showSentence, setShowSentence] = useState(false);
  const [miniChoice, setMiniChoice] = useState("");
  const [miniChecked, setMiniChecked] = useState(false);
  const [sessionScore, setSessionScore] = useState(0);
  const [summaryTitle, setSummaryTitle] = useState("");
  const [trainingStars, setTrainingStars] = useState(0);
  const [soundChoice, setSoundChoice] = useState("");
  const [soundChecked, setSoundChecked] = useState(false);
  const [letterChoice, setLetterChoice] = useState("");
  const [letterChecked, setLetterChecked] = useState(false);

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
  const learning = useMemo(
    () => Object.values(progress).filter((item) => item.status === "learning").length,
    [progress]
  );
  const beeReady = useMemo(
    () => Object.values(progress).filter((item) => item.status === "bee-ready").length,
    [progress]
  );

  const current = sessionWords[index];
  const miniOptions = useMemo(() => current ? makeDecoys(current.word) : [], [current?.id]);

  const meaningOptions = useMemo(() => {
    if (!current) return [];
    const others = words
      .filter((word) => word.id !== current.id)
      .slice(0, 2)
      .map((word) => word.meaning);
    return [current.meaning, ...others].sort();
  }, [current?.id]);

  const letterPuzzle = useMemo(() => {
    if (!current) return { display: "", correct: "", options: [] as string[] };
    const word = current.word.toLowerCase();
    const hideIndex = Math.max(1, Math.min(word.length - 2, Math.floor(word.length / 2)));
    const correct = word[hideIndex];
    const display = word.slice(0, hideIndex) + "_" + word.slice(hideIndex + 1);
    const alphabet = ["a","e","i","o","u","r","l","n","t","s","c","d"];
    const options = [correct, ...alphabet.filter((x) => x !== correct).slice(0, 2)].sort();
    return { display, correct, options };
  }, [current?.id]);

  function persist(next: Record<number, WordProgress>) {
    setProgress(next);
    saveProgress(next);
  }

  function resetWordState() {
    setAnswer("");
    setResult(null);
    setShowMeaning(false);
    setShowSentence(false);
    setMiniChoice("");
    setMiniChecked(false);
    setSoundChoice("");
    setSoundChecked(false);
    setLetterChoice("");
    setLetterChecked(false);
  }

  function startTraining() {
    const newWords = words.filter((word) => !progress[word.id] || progress[word.id].status === "new");
    const fallback = words.filter((word) => progress[word.id]?.status !== "mastered");
    const chosen = (newWords.length ? newWords : fallback).slice(0, 10);

    setSessionWords(chosen.length ? chosen : words.slice(0, 10));
    setIndex(0);
    setTrainingStep("sound");
    setSessionScore(0);
    setTrainingStars(0);
    resetWordState();
    setPhase("training");
  }

  function startReview() {
    const now = new Date();
    const chosen = words.filter((word) => {
      const item = progress[word.id];
      if (!item) return false;
      const due = item.nextReviewAt ? new Date(item.nextReviewAt) <= now : false;
      return item.status === "tricky" || item.status === "learning" || due;
    }).slice(0, 10);

    setSessionWords(chosen);
    setIndex(0);
    setSessionScore(0);
    resetWordState();
    setPhase("review");
    if (chosen[0]) setTimeout(() => speak(chosen[0].word), 150);
  }

  function startBoss() {
    const practiced = words.filter((word) => {
      const status = progress[word.id]?.status;
      return status && status !== "new";
    });
    const pool = practiced.length >= 5 ? practiced : words;
    const chosen = [...pool].sort(() => Math.random() - 0.5).slice(0, 5);

    setSessionWords(chosen);
    setIndex(0);
    setSessionScore(0);
    resetWordState();
    setPhase("boss");
    if (chosen[0]) setTimeout(() => speak(chosen[0].word), 150);
  }

  function finishSession(title: string) {
    setSummaryTitle(title);
    setPhase("summary");
  }

  function nextWord() {
    const nextIndex = index + 1;
    if (nextIndex >= sessionWords.length) {
      const title =
        phase === "boss"
          ? "Boss Battle Complete"
          : phase === "review"
          ? "Review Complete"
          : "Training Complete";
      finishSession(title);
      return;
    }

    setIndex(nextIndex);
    resetWordState();
    if (phase === "training") {
    return (
      <main>
        <div className="gameTopBar">
          <div>
            <span className="badge">TRAINING QUEST</span>
            <h2>Word {index + 1} of {sessionWords.length}</h2>
          </div>
          <div className="gameScore">
            <span>⭐ {trainingStars}</span>
            <button className="secondary" onClick={() => setPhase("home")}>Exit</button>
          </div>
        </div>

        <div className="questTrack">
          {sessionWords.map((word, i) => (
            <div key={word.id} className={`questNode ${i < index ? "done" : i === index ? "active" : ""}`}>
              {i < index ? "✓" : i + 1}
            </div>
          ))}
        </div>

        {trainingStep === "sound" && (
          <div className="card gameCard">
            <div className="gameRoundLabel">ROUND 1 · SOUND HUNT</div>
            <div className="gameIcon">🎧</div>
            <h1>Which meaning matches the word?</h1>
            <p className="small">Listen first. No spelling is shown yet.</p>

            <button className="soundButton" onClick={() => speak(current.word)}>🔊 PLAY WORD</button>

            <div className="choiceGrid">
              {meaningOptions.map((option) => (
                <button
                  key={option}
                  className={`choiceButton ${soundChoice === option ? "selected" : ""}`}
                  onClick={() => !soundChecked && setSoundChoice(option)}
                >
                  {option}
                </button>
              ))}
            </div>

            {soundChecked && (
              <div className={`result ${soundChoice === current.meaning ? "ok" : "no"}`}>
                {soundChoice === current.meaning ? "Nice! You found the meaning. +1 ⭐" : "Not quite. Here is the correct meaning."}
                <div className="small">{current.meaning}</div>
              </div>
            )}

            <div className="actions">
              {!soundChecked ? (
                <button
                  className="primary"
                  disabled={!soundChoice}
                  onClick={() => {
                    setSoundChecked(true);
                    if (soundChoice === current.meaning) setTrainingStars((s) => s + 1);
                  }}
                >
                  Lock Answer
                </button>
              ) : (
                <button className="primary" onClick={() => setTrainingStep("letter")}>
                  Next Round →
                </button>
              )}
            </div>
          </div>
        )}

        {trainingStep === "letter" && (
          <div className="card gameCard">
            <div className="gameRoundLabel">ROUND 2 · LETTER TRAP</div>
            <div className="gameIcon">🧩</div>
            <h1>Catch the missing letter</h1>
            <button className="secondary" onClick={() => speak(current.word)}>🔊 Hear Again</button>

            <div className="letterPuzzle">{letterPuzzle.display}</div>

            <div className="letterChoices">
              {letterPuzzle.options.map((letter) => (
                <button
                  key={letter}
                  className={`letterChoice ${letterChoice === letter ? "selected" : ""}`}
                  onClick={() => !letterChecked && setLetterChoice(letter)}
                >
                  {letter}
                </button>
              ))}
            </div>

            {letterChecked && (
              <div className={`result ${letterChoice === letterPuzzle.correct ? "ok" : "no"}`}>
                {letterChoice === letterPuzzle.correct ? "Trap cleared! +1 ⭐" : `The missing letter is “${letterPuzzle.correct}”.`}
                <div className="small">Word: {current.word}</div>
              </div>
            )}

            <div className="actions">
              {!letterChecked ? (
                <button
                  className="primary"
                  disabled={!letterChoice}
                  onClick={() => {
                    setLetterChecked(true);
                    if (letterChoice === letterPuzzle.correct) setTrainingStars((s) => s + 1);
                  }}
                >
                  Check Letter
                </button>
              ) : (
                <button
                  className="primary"
                  onClick={() => {
                    setTrainingStep("spell");
                    setAnswer("");
                    setResult(null);
                    setTimeout(() => speak(current.word), 150);
                  }}
                >
                  Final Round: Full Spell →
                </button>
              )}
            </div>
          </div>
        )}

        {trainingStep === "spell" && (
          <div className="gameCardShell">
            <div className="finalRoundBanner">FINAL ROUND · FULL SPELL · Worth 2 ⭐</div>
            <FullSpellCard
              current={current}
              index={index}
              total={sessionWords.length}
              answer={answer}
              setAnswer={setAnswer}
              result={result}
              showMeaning={showMeaning}
              setShowMeaning={setShowMeaning}
              showSentence={showSentence}
              setShowSentence={setShowSentence}
              submitFullSpell={submitFullSpell}
              nextWord={nextWord}
              mode="TRAINING · FULL SPELL"
            />
          </div>
        )}
      </main>
    );
  }

  return (
    <main>
      <div className="header">
        <div>
          <span className="badge">{phase === "boss" ? "BOSS BATTLE" : "REVIEW BOX"}</span>
          <h2>Word {index + 1} of {sessionWords.length}</h2>
        </div>
        <button className="secondary" onClick={() => setPhase("home")}>Exit</button>
      </div>

      <div className="progress">
        <div style={{ width: `${((index + 1) / sessionWords.length) * 100}%` }} />
      </div>

      <FullSpellCard
        current={current}
        index={index}
        total={sessionWords.length}
        answer={answer}
        setAnswer={setAnswer}
        result={result}
        showMeaning={showMeaning}
        setShowMeaning={setShowMeaning}
        showSentence={showSentence}
        setShowSentence={setShowSentence}
        submitFullSpell={submitFullSpell}
        nextWord={nextWord}
        mode={phase === "boss" ? "BOSS BATTLE · FULL SPELL" : "REVIEW · FULL SPELL"}
      />
    </main>
  );
}

type FullSpellProps = {
  current: SpellingWord;
  index: number;
  total: number;
  answer: string;
  setAnswer: (value: string) => void;
  result: Result;
  showMeaning: boolean;
  setShowMeaning: (value: boolean) => void;
  showSentence: boolean;
  setShowSentence: (value: boolean) => void;
  submitFullSpell: (event: FormEvent) => void;
  nextWord: () => void;
  mode: string;
};

function FullSpellCard({
  current,
  index,
  total,
  answer,
  setAnswer,
  result,
  showMeaning,
  setShowMeaning,
  showSentence,
  setShowSentence,
  submitFullSpell,
  nextWord,
  mode
}: FullSpellProps) {
  return (
    <div className="card">
      <span className="stepLabel">{mode}</span>
      <h2>Listen, then spell the whole word.</h2>
      <p className="small">No letters are shown before you submit.</p>

      <div className="actions">
        <button className="primary" onClick={() => speak(current.word)}>🔊 Hear Word</button>
        <button className="secondary" onClick={() => setShowMeaning(!showMeaning)}>Meaning</button>
        <button className="secondary" onClick={() => setShowSentence(!showSentence)}>Sentence</button>
      </div>

      {showMeaning && <div className="clue"><strong>Meaning:</strong> {current.meaning}</div>}
      {showSentence && (
        <div className="clue">
          <strong>Sentence:</strong> {current.sentence.replace(new RegExp(current.word, "gi"), "_____")}
        </div>
      )}

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
          <button className="primary" type="submit" disabled={!answer.trim() || Boolean(result)}>
            Submit Full Spell
          </button>
        </div>
      </form>

      {result === "correct" && <div className="result ok">FULL SPELL ✓ — {current.word}</div>}

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
            {index + 1 === total ? "Finish Session" : "Next Word"}
          </button>
        </div>
      )}
    </div>
  );
}
