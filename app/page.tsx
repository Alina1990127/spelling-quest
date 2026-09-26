"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { words } from "@/data/words";
import { loadProgress, saveProgress, scheduleReview } from "@/lib/progress";
import type { SpellingWord, WordProgress } from "@/types";

type Phase = "home" | "training" | "review" | "boss" | "progress" | "summary";
type TrainingStep =
  | "learn"
  | "hear"
  | "map"
  | "blend"
  | "context"
  | "recall"
  | "spell"
  | "repair";
type Result = "correct" | "wrong" | null;

const blankProgress = (): WordProgress => ({
  status: "new",
  attempts: 0,
  correctFullSpells: 0
});

function speak(text: string) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
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

function chunkOptions(correct: string) {
  const vowels = ["a", "e", "i", "o", "u"];
  const options = new Set<string>([correct]);

  if (correct.length === 1) {
    for (const v of vowels) {
      if (v !== correct) options.add(v);
      if (options.size >= 3) break;
    }
  } else {
    options.add(correct.replace(/[aeiou]/i, "e"));
    options.add(correct.replace(/[aeiou]/i, "i"));
    options.add(correct + correct.slice(-1));
  }

  return Array.from(options).filter(Boolean).slice(0, 3).sort();
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

  const [soundCountChoice, setSoundCountChoice] = useState<number | null>(null);
  const [soundCountChecked, setSoundCountChecked] = useState(false);

  const [mapIndex, setMapIndex] = useState(0);
  const [mapChoice, setMapChoice] = useState("");
  const [mapChecked, setMapChecked] = useState(false);

  const [blendChoices, setBlendChoices] = useState<string[]>([]);
  const [contextChoice, setContextChoice] = useState("");
  const [contextChecked, setContextChecked] = useState(false);

  const [recallAnswer, setRecallAnswer] = useState("");
  const [recallChecked, setRecallChecked] = useState(false);

  const [delayedRetryIds, setDelayedRetryIds] = useState<number[]>([]);
  const [delayedMode, setDelayedMode] = useState(false);

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

  const contextOptions = useMemo(() => {
    if (!current) return [];
    return [current.sentence, ...current.contextDistractors].sort();
  }, [current?.id]);

  const currentMapCorrect = current?.spellingChunks[mapIndex] ?? "";
  const currentMapSound = current?.soundChunks[mapIndex] ?? "";
  const currentMapOptions = useMemo(
    () => chunkOptions(currentMapCorrect),
    [currentMapCorrect]
  );

  const blendPool = useMemo(() => {
    if (!current) return [];
    return [...current.spellingChunks].reverse();
  }, [current?.id]);

  const assistedDisplay = useMemo(() => {
    if (!current) return "";
    const i = current.word.toLowerCase().indexOf(current.trickyChunk.toLowerCase());
    if (i < 0) return current.word;
    return current.word.slice(0, i) + "____" + current.word.slice(i + current.trickyChunk.length);
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

    setSoundCountChoice(null);
    setSoundCountChecked(false);

    setMapIndex(0);
    setMapChoice("");
    setMapChecked(false);

    setBlendChoices([]);
    setContextChoice("");
    setContextChecked(false);

    setRecallAnswer("");
    setRecallChecked(false);
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
    setDelayedRetryIds([]);
    setDelayedMode(false);
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
      if (phase === "training" && !delayedMode && delayedRetryIds.length > 0) {
        const retryWords = delayedRetryIds
          .map((id) => words.find((word) => word.id === id))
          .filter((word): word is SpellingWord => Boolean(word));

        setSessionWords(retryWords);
        setIndex(0);
        setDelayedMode(true);
        resetWordState();
        setTrainingStep("spell");
        if (retryWords[0]) setTimeout(() => speak(retryWords[0].word), 150);
        return;
      }

      const title =
        phase === "boss"
          ? "Boss Battle Complete"
          : phase === "review"
          ? "Review Complete"
          : delayedMode
          ? "Delayed Check Complete"
          : "Training Complete";

      finishSession(title);
      return;
    }

    setIndex(nextIndex);
    resetWordState();

    if (phase === "training") {
      setTrainingStep(delayedMode ? "spell" : "learn");
      if (delayedMode) setTimeout(() => speak(sessionWords[nextIndex].word), 150);
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
      else if ((phase === "review" || phase === "boss" || delayedMode) && correctFullSpells >= 2) {
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

      if (phase === "training" && !delayedMode) {
        setDelayedRetryIds((ids) => (ids.includes(current.id) ? ids : [...ids, current.id]));
        setTrainingStep("repair");
      }

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
            <span>Learn → hear parts → map sounds → build → context → recall → Full Spell.</span>
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
            <span className="badge">{delayedMode ? "DELAYED CHECK" : "TRAINING QUEST"}</span>
            <h2>Word {index + 1} of {sessionWords.length}</h2>
          </div>

          <div className="gameScore">
            <span>⭐ {trainingStars}</span>
            <button className="secondary" onClick={() => setPhase("home")}>Exit</button>
          </div>
        </div>

        {!delayedMode && (
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
        )}

        {trainingStep === "learn" && (
          <div className="card gameCard">
            <div className="gameRoundLabel">1 · MEET THE WORD</div>
            <div className="gameIcon">📚</div>
            <h1 className="learnWord">{current.word}</h1>

            <button className="soundButton" onClick={() => speak(current.word)}>
              🔊 Hear the whole word
            </button>

            <div className="learnFacts">
              <div>
                <strong>Meaning</strong>
                <p>{current.meaning}</p>
              </div>
              <div>
                <strong>In a sentence</strong>
                <p>{current.sentence}</p>
              </div>
            </div>

            <p className="small learningTip">
              Look at the word while you listen. Say it once yourself before moving on.
            </p>

            <div className="actions">
              <button className="primary" onClick={() => setTrainingStep("hear")}>
                I know what it means → Hear the Parts
              </button>
            </div>
          </div>
        )}

        {trainingStep === "hear" && (
          <div className="card gameCard">
            <div className="gameRoundLabel">2 · HEAR THE PARTS</div>
            <div className="gameIcon">👂</div>
            <h1>How many sound parts can you hear?</h1>
            <p className="small">Listen before you look at any spelling chunks.</p>

            <button className="soundButton" onClick={() => speak(current.word)}>
              🔊 Play word
            </button>

            <div className="countChoices">
              {[1, 2, 3, 4].map((count) => (
                <button
                  key={count}
                  className={`countChoice ${soundCountChoice === count ? "selected" : ""}`}
                  onClick={() => !soundCountChecked && setSoundCountChoice(count)}
                >
                  {count}
                </button>
              ))}
            </div>

            {!soundCountChecked ? (
              <button
                className="primary"
                disabled={soundCountChoice === null}
                onClick={() => setSoundCountChecked(true)}
              >
                Check
              </button>
            ) : (
              <>
                <div className={`result ${soundCountChoice === current.soundChunks.length ? "ok" : "no"}`}>
                  {soundCountChoice === current.soundChunks.length
                    ? "Yes — you heard the sound structure."
                    : `Listen again. This word has ${current.soundChunks.length} sound part(s).`}
                </div>

                <div className="soundChunks">
                  {current.soundChunks.map((chunk, i) => (
                    <button key={i} className="soundChunk" onClick={() => speak(chunk)}>
                      🔊 {chunk}
                    </button>
                  ))}
                </div>

                <button className="primary" onClick={() => setTrainingStep("map")}>
                  Match Sounds to Letters →
                </button>
              </>
            )}
          </div>
        )}

        {trainingStep === "map" && (
          <div className="card gameCard">
            <div className="gameRoundLabel">3 · SOUND → LETTERS</div>
            <div className="gameIcon">🔤</div>
            <h1>How would you spell this sound part?</h1>

            <button className="soundButton" onClick={() => speak(currentMapSound)}>
              🔊 {currentMapSound}
            </button>

            <div className="choiceGrid">
              {currentMapOptions.map((option) => (
                <button
                  key={option}
                  className={`choiceButton ${mapChoice === option ? "selected" : ""}`}
                  onClick={() => !mapChecked && setMapChoice(option)}
                >
                  {option}
                </button>
              ))}
            </div>

            {!mapChecked ? (
              <button
                className="primary"
                disabled={!mapChoice}
                onClick={() => setMapChecked(true)}
              >
                Check mapping
              </button>
            ) : (
              <>
                <div className={`result ${mapChoice === currentMapCorrect ? "ok" : "no"}`}>
                  {mapChoice === currentMapCorrect
                    ? "Correct sound-to-spelling match."
                    : `This sound is written “${currentMapCorrect}” in this word.`}
                </div>

                <button
                  className="primary"
                  onClick={() => {
                    if (mapIndex + 1 < current.spellingChunks.length) {
                      setMapIndex((value) => value + 1);
                      setMapChoice("");
                      setMapChecked(false);
                    } else {
                      setTrainingStep("blend");
                    }
                  }}
                >
                  {mapIndex + 1 < current.spellingChunks.length ? "Next sound part →" : "Build the Word →"}
                </button>
              </>
            )}
          </div>
        )}

        {trainingStep === "blend" && (
          <div className="card gameCard">
            <div className="gameRoundLabel">4 · BLEND BACK</div>
            <div className="gameIcon">🧱</div>
            <h1>Build the word from the spelling chunks</h1>

            <button className="secondary" onClick={() => speak(current.word)}>
              🔊 Hear whole word
            </button>

            <div className="builtWord">
              {blendChoices.length ? blendChoices.join("") : "Tap the chunks below"}
            </div>

            <div className="chunkBank">
              {blendPool.map((chunk, i) => (
                <button
                  key={`${chunk}-${i}`}
                  className="chunkTile"
                  disabled={blendChoices.length >= current.spellingChunks.length}
                  onClick={() => setBlendChoices((items) => [...items, chunk])}
                >
                  {chunk}
                </button>
              ))}
            </div>

            <div className="actions">
              <button className="secondary" onClick={() => setBlendChoices([])}>Reset</button>
              <button
                className="primary"
                disabled={blendChoices.length !== current.spellingChunks.length}
                onClick={() => {
                  if (blendChoices.join("") === current.word) {
                    setTrainingStars((stars) => stars + 1);
                    setTrainingStep("context");
                  } else {
                    setBlendChoices([]);
                  }
                }}
              >
                Check & Continue
              </button>
            </div>
          </div>
        )}

        {trainingStep === "context" && (
          <div className="card gameCard">
            <div className="gameRoundLabel">5 · CONTEXT DETECTIVE</div>
            <div className="gameIcon">🕵️</div>
            <h1>Which sentence uses the word correctly?</h1>
            <p className="small"><strong>{current.word}</strong> means {current.meaning}.</p>

            <div className="choiceGrid">
              {contextOptions.map((sentence) => (
                <button
                  key={sentence}
                  className={`choiceButton ${contextChoice === sentence ? "selected" : ""}`}
                  onClick={() => !contextChecked && setContextChoice(sentence)}
                >
                  {sentence}
                </button>
              ))}
            </div>

            {!contextChecked ? (
              <button
                className="primary"
                disabled={!contextChoice}
                onClick={() => setContextChecked(true)}
              >
                Check sentence
              </button>
            ) : (
              <>
                <div className={`result ${contextChoice === current.sentence ? "ok" : "no"}`}>
                  {contextChoice === current.sentence
                    ? "Yes — that sentence fits the meaning."
                    : `Best sentence: ${current.sentence}`}
                </div>
                <button className="primary" onClick={() => setTrainingStep("recall")}>
                  Try a Memory Challenge →
                </button>
              </>
            )}
          </div>
        )}

        {trainingStep === "recall" && (
          <div className="card gameCard">
            <div className="gameRoundLabel">6 · ASSISTED RECALL</div>
            <div className="gameIcon">🧠</div>
            <h1>Fill the tricky sound-spelling part</h1>

            <button className="secondary" onClick={() => speak(current.word)}>
              🔊 Hear word
            </button>

            <div className="letterPuzzle">{assistedDisplay}</div>

            <input
              className="chunkInput"
              value={recallAnswer}
              onChange={(event) => setRecallAnswer(event.target.value)}
              placeholder="Type the missing chunk"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              disabled={recallChecked}
            />

            {!recallChecked ? (
              <button
                className="primary"
                disabled={!recallAnswer.trim()}
                onClick={() => setRecallChecked(true)}
              >
                Check chunk
              </button>
            ) : (
              <>
                <div className={`result ${normalize(recallAnswer) === normalize(current.trickyChunk) ? "ok" : "no"}`}>
                  {normalize(recallAnswer) === normalize(current.trickyChunk)
                    ? "Good recall. Now remove all hints."
                    : `The tricky part is “${current.trickyChunk}”. Look once, then hide it.`}
                </div>
                <button
                  className="primary"
                  onClick={() => {
                    setTrainingStep("spell");
                    setAnswer("");
                    setResult(null);
                    setTimeout(() => speak(current.word), 150);
                  }}
                >
                  Final: Full Spell →
                </button>
              </>
            )}
          </div>
        )}

        {trainingStep === "spell" && (
          <div className="gameCardShell">
            <div className="finalRoundBanner">
              {delayedMode ? "DELAYED CHECK · NO LEARNING HINTS FIRST" : "7 · FULL SPELL · PROVE YOU KNOW IT"}
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
              mode={delayedMode ? "DELAYED CHECK" : "TRAINING · FULL SPELL"}
            />
          </div>
        )}

        {trainingStep === "repair" && result === "wrong" && (
          <div className="card gameCard">
            <div className="gameRoundLabel">8 · REPAIR ROUND</div>
            <div className="gameIcon">🛠️</div>
            <h1>Fix the part that fooled you</h1>

            <div className="repairCompare">
              <div><span>You wrote</span><strong>{answer}</strong></div>
              <div><span>Correct word</span><strong>{current.word}</strong></div>
            </div>

            <div className="trickyFocus">
              Focus on this spelling chunk: <strong>{current.trickyChunk}</strong>
            </div>

            <button className="secondary" onClick={() => speak(current.word)}>
              🔊 Hear the word again
            </button>

            <p className="small">
              You will not repeat it immediately. This word will return later for another Full Spell.
            </p>

            <button className="primary" onClick={nextWord}>
              Continue — bring it back later →
            </button>
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

      {result && mode !== "TRAINING · FULL SPELL" && mode !== "DELAYED CHECK" && (
        <div className="actions">
          <button className="primary" onClick={nextWord}>
            {index + 1 === total ? "Finish Session" : "Next Word"}
          </button>
        </div>
      )}

      {result === "correct" && (mode === "TRAINING · FULL SPELL" || mode === "DELAYED CHECK") && (
        <div className="actions">
          <button className="primary" onClick={nextWord}>
            {index + 1 === total ? "Finish Session" : "Next Word"}
          </button>
        </div>
      )}
    </div>
  );
}
