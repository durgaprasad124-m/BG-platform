import test from "node:test";
import assert from "node:assert/strict";
import { applyMove, createGameState, winnerFor } from "./game-engine.mjs";

test("creates an empty game state", () => {
  assert.deepEqual(createGameState(), {
    board: [null, null, null, null, null, null, null, null, null],
    status: "playing",
    winner: null,
    currentPlayer: "X"
  });
});

test("accepts legal moves and alternates players", () => {
  const state = createGameState();
  const result = applyMove(state, 4, "X");
  assert.equal(result.ok, true);
  assert.equal(result.state.board[4], "X");
  assert.equal(result.state.currentPlayer, "O");
});

test("rejects illegal turns and occupied squares", () => {
  const state = { ...createGameState(), board: ["X", null, null, null, null, null, null, null, null] };
  assert.equal(applyMove(state, 0, "O").ok, false);
  assert.equal(applyMove(state, 1, "O").ok, false);
  assert.equal(applyMove(state, 9, "O").ok, false);
});

test("detects a winner and prevents further moves", () => {
  const state = { ...createGameState(), board: ["X", "X", null, "O", "O", null, null, null, null] };
  const result = applyMove(state, 2, "X");
  assert.equal(result.ok, true);
  assert.equal(winnerFor(result.state.board), "X");
  assert.equal(result.state.status, "finished");
  assert.equal(applyMove(result.state, 5, "O").ok, false);
});

test("detects a draw", () => {
  const state = { ...createGameState(), board: ["X", "O", "X", "X", "O", "O", "O", "X", null] };
  const result = applyMove(state, 8, "X");
  assert.equal(result.ok, true);
  assert.equal(result.state.status, "draw");
  assert.equal(result.state.winner, null);
});
