# Spelling Quest

A lightweight Spelling Bee training game for children.

## Core rule

Hints may help learning, but every word must end with a **complete independent spelling attempt**.

## MVP flow

1. Hear the word
2. Optional meaning / sentence clue
3. Type the full word
4. Correct or incorrect result
5. Incorrect words enter the Tricky review pool
6. Correct full-spell attempts schedule spaced review
7. Boss Battle tests five words with the same full-spell rule
8. Progress is stored in the browser with localStorage

## Run locally

```bash
npm install
npm run dev
```

Then open http://localhost:3000.

## Current stage

The repository contains the first playable MVP skeleton. The next step is to replace the small starter dataset with the verified competition word list and then refine the training mini-games.
