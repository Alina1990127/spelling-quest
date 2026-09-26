"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { words } from "@/data/words";
import { loadProgress, saveProgress, scheduleReview } from "@/lib/progress";
import type { SpellingWord, WordProgress } from "@/types";

type Phase = "home" | "training" | "review" | "boss" | "progress" | "summary";
type TrainingStep = "learn" | "sound" | "letter" | "spell";
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

function statusLabel(status?: WordProgress["status"]) {
  if (!status) return "New";
  return status === "bee-ready"
    ? "Bee Ready"
    : status.charAt(0).toUpperCase() + status.slice(1);
}

export default function HomePage() {
  const [phase, setPhase] = useState<Phase>("home");
  const [trainingStep, setTrainingStep] = useState<TrainingStep>("learn");
  const [progress, setProgress] = useState<Record<number, WordProgress>>({});
  const [sessionWords, setSessionWords] = useState<SpellingWord[]>([]);
  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState("");
  const [result, setResult] = useState<Result>(null);
  const [showMeaning, setShowMeaning] = useState(false);
  const [showSentence, setShowSentence] = useState(false);
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
    const alphabet = ["a", "e", "i", "o", "u", "r", "l", "n", "t", "s", "c", "d"];
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
    setSoundChoice("");
    setSoundChecked(false);
    setLetterChoice("");
    setLetterChecked(false);
  }

  function startTraining() {
    const newWords = words.filter(
      (word) => !progress[word.id] || progress[word.id].status === "new"
    );
    const fallback = words.filter((word) => progress[word.id]?.status !== "mastered");
    const chosen = (newWords.length ? newWords : fallback).slice(0, 10);

    setSessionWords(chosen.length ? chosen : words.slice(0, 10));
    setIndex(0);
    setTrainingStep("learn");
    setSessionScore(0);
    setTrainingStars(0);
    resetWordState();
    setPhase("training");
  }

  function startReview() {
    const now = new Date();
    const chosen = words
      .filter((word) => {
        const item = progress[word.id];
        if (!item) return false;
        const due = item.nextReviewAt ? new Date(item.nextReviewAt) <= now : false;
        return item.status === "tricky" || item.status === "learning" || due;
      })
      .slice(0, 10);

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
      setTrainingStep("learn");
    } else {
      setTimeout(() => speak(sessionWords[nextIndex].word), 150);
    }
  }

  function updateAfterSpell(isCorrect: boolean) {
    if (!current) return;

    const prev = progress[current.id] ?? blankProgress();
    const now = new Date().toISOString();

    if (isCorrect) {
      const correctFullSpells = prev.correctFullSpells + 1;
      let status: WordProgress["status"] = "learning";

      if (correctFullSpells >= 4) status = "mastered";
      else if ((phase === "review" || phase === "boss") && correctFullSpells >= 2) {
        status = "bee-ready";
      }

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
      setSessionScore((score) => score + 1);
      if (phase === "training") setTrainingStars((stars) => stars + 2);
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

  function submitFullSpell(event: FormEvent) {
    event.preventDefault();
    if (!current || !answer.trim() || result) return;
    updateAfterSpell(normalize(answer) === normalize(current.word));
  }

  if (phase === "home") {
    return (
      <main>
        <div className="dashboardHero">
          <span className="badge">SPELLING QUEST</span>
          <h1>Your Spelling Dashboard</h1>
          <p>Four clear modes. Every learning path still ends with a complete Full Spell.</p>
        </div>

        <div className="card">
          <div className="sectionHead">
            <div>
              <h2>Progress Snapshot</h2>
              <p className="small">Saved on this browser for the MVP.</p>
            </div>
          </div>

          <div className="stats statsFive">
            <div className="stat"><strong>{mastered}</strong><div className="small">Mastered</div></div>
            <div className="stat"><strong>{beeReady}</strong><div className="small">Bee Ready</div></div>
            <div className="stat"><strong>{learning}</strong><div className="small">Learning</div></div>
            <div className="stat"><strong>{tricky}</strong><div className="small">Tricky</div></div>
            <div className="stat"><strong>{words.length}</strong><div className="small">Total Words</div></div>
          </div>
        </div>

        <div className="moduleGrid">
          <button className="moduleCard moduleTraining" onClick={startTraining}>
            <span className="moduleIcon">🎧</span>
            <span className="moduleEyebrow">LEARN NEW WORDS</span>
            <strong>Training</strong>
            <span>Hear → understand → mini game → Full Spell.</span>
            <b>Start Training →</b>
          </button>

          <button className="moduleCard" onClick={startReview}>
            <span className="moduleIcon">🔁</span>
            <span className="moduleEyebrow">FIX WEAK WORDS</span>
            <strong>Review Box</strong>
            <span>Tricky, Learning and due-review words come first.</span>
            <b>Review Words →</b>
          </button>

          <button className="moduleCard" onClick={startBoss}>
            <span className="moduleIcon">👾</span>
            <span className="moduleEyebrow">TEST YOURSELF</span>
            <strong>Boss Battle</strong>
            <span>Five-word Spelling Bee challenge with no letter hints.</span>
            <b>Start Battle →</b>
          </button>

          <button className="moduleCard" onClick={() => setPhase("progress")}>
            <span className="moduleIcon">📊</span>
            <span className="moduleEyebrow">SEE YOUR GROWTH</span>
            <strong>Progress</strong>
            <span>See status, attempts and Full Spell success for every word.</span>
            <b>View Progress →</b>
          </button>
        </div>
      </main>
    );
  }

  if (phase === "progress") {
    return (
      <main>
        <div className="header">
          <div>
            <span className="badge">PROGRESS</span>
            <h1>Your Word Progress</h1>
          </div>
          <button className="secondary" onClick={() => setPhase("home")}>Back</button>
        </div>

        <div className="stats statsFive">
          <div className="stat"><strong>{mastered}</strong><div className="small">Mastered</div></div>
          <div className="stat"><strong>{beeReady}</strong><div className="small">Bee Ready</div></div>
          <div className="stat"><strong>{learning}</strong><div className="small">Learning</div></div>
          <div className="stat"><strong>{tricky}</strong><div className="small">Tricky</div></div>
          <div className="stat"><strong>{words.length}</strong><div className="small">Total</div></div>
        </div>

        <div className="card tableCard">
          <div className="wordTable">
            <div className="wordRow wordHead">
              <span>Word</span><span>Status</span><span>Attempts</span><span>Full Spell ✓</span>
            </div>

            {words.map((word) => {
              const item = progress[word.id];
              return (
                <div className="wordRow" key={word.id}>
                  <span>{word.word}</span>
                  <span>
                    <span className={`statusPill status-${item?.status ?? "new"}`}>
                      {statusLabel(item?.status)}
                    </span>
                  </span>
                  <span>{item?.attempts ?? 0}</span>
                  <span>{item?.correctFullSpells ?? 0}</span>
                </div>
              );
            })}
          </div>
        </div>
      </main>
    );
  }

  if (phase === "summary") {
    return (
      <main>
        <div className="card summaryCard">
          <span className="badge">SESSION COMPLETE</span>
          <h1>{summaryTitle}</h1>
          <div className="scoreCircle">{sessionScore}/{sessionWords.length}</div>
          <p>Full Spell results have been saved. Wrong words are placed in the Review Box automatically.</p>
          <div className="actions">
            <button className="primary" onClick={() => setPhase("home")}>Back to Dashboard</button>
            {summaryTitle.includes("Boss") && (
              <button className="secondary" onClick={startBoss}>Play Again</button>
            )}
          </div>
        </div>
      </main>
    );
  }

  if (phase === "review" && sessionWords.length === 0) {
    return (
      <main>
        <div className="card emptyState">
          <span className="badge">REVIEW BOX</span>
          <h1>Nothing to review yet.</h1>
          <p>Words will appear here after they become Tricky, Learning, or reach their review date.</p>
          <button className="primary" onClick={() => setPhase("home")}>Back to Dashboard</button>
        </div>
      </main>
    );
  }

  if (!current) {
    return (
      <main>
        <div className="card">
          <h2>No word is loaded.</h2>
          <button className="primary" onClick={() => setPhase("home")}>Back Home</button>
        </div>
      </main>
    );
  }

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
            <div
              key={word.id}
              className={`questNode ${i < index ? "done" : i === index ? "active" : ""}`}
            >
              {i < index ? "✓" : i + 1}
            </div>
          ))}
        </div>

        {trainingStep === "learn" && (
          <div className="card gameCard">
            <div className="gameRoundLabel">LEARN · MEET THE WORD</div>
            <div className="gameIcon">📚</div>
            <h1 className="learnWord">{current.word}</h1>
            <button className="soundButton" onClick={() => speak(current.word)}>🔊 Hear Pronunciation</button>

            <div className="learnFacts">
              <div>
                <strong>Meaning</strong>
                <p>{current.meaning}</p>
              </div>
              <div>
                <strong>Sentence</strong>
                <p>{current.sentence}</p>
              </div>
            </div>

            <div className="actions">
              <button className="primary" onClick={() => setTrainingStep("sound")}>
                I’ve Learned It → Start Game
              </button>
            </div>
          </div>
        )}

        {trainingStep === "sound" && (
          <div className="card gameCard">
            <div className="gameRoundLabel">GAME 1 · SOUND HUNT</div>
            <div className="gameIcon">🎧</div>
            <h1>Which meaning matches the word?</h1>
            <p className="small">Listen first. No spelling is shown yet.</p>

            <button className="soundButton" onClick={() => speak(current.word)}>
              🔊 PLAY WORD
            </button>

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
                {soundChoice === current.meaning
                  ? "Nice! You found the meaning. +1 ⭐"
                  : "Not quite. Here is the correct meaning."}
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
                    if (soundChoice === current.meaning) {
                      setTrainingStars((stars) => stars + 1);
                    }
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
            <div className="gameRoundLabel">GAME 2 · LETTER TRAP</div>
            <div className="gameIcon">🧩</div>
            <h1>Catch the missing letter</h1>

            <button className="secondary" onClick={() => speak(current.word)}>
              🔊 Hear Again
            </button>

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
                {letterChoice === letterPuzzle.correct
                  ? "Trap cleared! +1 ⭐"
                  : `The missing letter is “${letterPuzzle.correct}”.`}
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
                    if (letterChoice === letterPuzzle.correct) {
                      setTrainingStars((stars) => stars + 1);
                    }
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
            <div className="finalRoundBanner">FINAL GAME · FULL SPELL · Worth 2 ⭐</div>

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

      {showMeaning && (
        <div className="clue"><strong>Meaning:</strong> {current.meaning}</div>
      )}

      {showSentence && (
        <div className="clue">
          <strong>Sentence:</strong>{" "}
          {current.sentence.replace(new RegExp(current.word, "gi"), "_____")}
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
          <button
            className="primary"
            type="submit"
            disabled={!answer.trim() || Boolean(result)}
          >
            Submit Full Spell
          </button>
        </div>
      </form>

      {result === "correct" && (
        <div className="result ok">FULL SPELL ✓ — {current.word}</div>
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
            {index + 1 === total ? "Finish Session" : "Next Word"}
          </button>
        </div>
      )}
    </div>
  );
}
