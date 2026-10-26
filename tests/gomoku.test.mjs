import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BLACK, WHITE, coordinate, createGame, playMove, undoHumanTurn, winningLine, chooseMove, saveGame, restoreGame } from '../src/frontend/services/games/gomoku.mjs';

test('legal turns are immutable; occupied, out-of-range and non-integer cells are rejected', () => {
  const initial = createGame(), first = playMove(initial, 112);
  assert.equal(initial.board[112], 0);
  assert.equal(first.turn, WHITE);
  assert.equal(first.board[112], BLACK);
  for (const index of [112, -1, 225, 0.5, '1', NaN]) assert.equal(playMove(first, index), first);
  assert.equal(coordinate(0), 'A15'); assert.equal(coordinate(224), 'O1');
});

test('all four directions, board edges and overlines win without wrapping rows', () => {
  for (const indices of [[0, 1, 2, 3, 4], [14, 29, 44, 59, 74], [0, 16, 32, 48, 64], [14, 28, 42, 56, 70], [219, 220, 221, 222, 223, 224]]) {
    const board = Array(225).fill(0);
    for (const index of indices) board[index] = WHITE;
    assert.equal(winningLine(board, indices[2]).length, indices.length);
  }
  const board = Array(225).fill(0);
  [12, 13, 14, 15, 16].forEach(index => board[index] = BLACK);
  assert.deepEqual(winningLine(board, 14), []);
});

test('terminal games reject more moves; both winners can undo back to the human turn', () => {
  for (const human of [BLACK, WHITE]) {
    const game = [0, 30, 1, 31, 2, 32, 3, 33, 4].reduce(playMove, createGame(human));
    assert.equal(game.winner, BLACK);
    assert.equal(playMove(game, 80), game);
    assert.equal(chooseMove(game), null);
    const undone = undoHumanTurn(game);
    assert.equal(undone.winner, 0);
    assert.equal(undone.turn, human);
    assert.equal(undone.moves.length, human === BLACK ? 8 : 7);
  }
});

test('undo handles a pending reply and preserves an opponent opening', () => {
  assert.deepEqual(undoHumanTurn(playMove(createGame(), 112)).moves, []);
  const opening = playMove(createGame(WHITE), 112);
  assert.equal(undoHumanTurn(opening), opening);
  const game = [112, 113, 127].reduce(playMove, createGame(WHITE));
  assert.deepEqual(undoHumanTurn(game).moves, [112]);
  assert.equal(undoHumanTurn(game).turn, WHITE);
});

test('save restoration validates version, colors, difficulty, chronology and terminal boundaries', () => {
  const game = [112, 113, 114].reduce(playMove, createGame(BLACK, 'challenge'));
  assert.deepEqual(restoreGame(saveGame(game)), game);
  for (const raw of ['{', 'null', '{}', JSON.stringify({ version: 1, human: 1, difficulty: 'casual', moves: [1, 1] }),
    JSON.stringify({ version: 1, human: 1, difficulty: 'casual', moves: [0, 30, 1, 31, 2, 32, 3, 33, 4, 80] }),
    JSON.stringify({ version: 1, human: 4, difficulty: 'casual', moves: [] })]) assert.equal(restoreGame(raw), null);
});

test('full board draw is detected and no move is suggested', () => {
  const board = Array.from({ length: 225 }, (_, index) => (Math.floor(Math.floor(index / 15) / 2) + index % 15) % 2 + 1);
  assert.ok(board.every((_, index) => winningLine(board, index).length === 0));
  const last = board[224]; board[224] = 0;
  const game = playMove({ ...createGame(), board, moves: Array.from({ length: 224 }, (_, i) => i), turn: last }, 224);
  assert.equal(game.draw, true);
  assert.equal(game.winner, 0);
  assert.equal(chooseMove(game), null);
});

for (const difficulty of ['casual', 'challenge']) {
  test(`${difficulty}: wins before blocking and blocks straight or broken threats on every axis`, () => {
    const game = createGame(BLACK, difficulty);
    [0, 1, 2, 3].forEach(index => game.board[index] = WHITE);
    [30, 31, 32, 33].forEach(index => game.board[index] = BLACK);
    assert.equal(chooseMove(game, WHITE), 4);
    for (const [threat, answer] of [[[0, 1, 2, 3], 4], [[0, 1, 3, 4], 2], [[14, 29, 44, 59], 74], [[0, 16, 32, 64], 48], [[14, 28, 56, 70], 42]]) {
      const state = createGame(BLACK, difficulty);
      threat.forEach(index => state.board[index] = BLACK);
      const before = [...state.board];
      assert.equal(chooseMove(state, WHITE), answer);
      assert.deepEqual(state.board, before);
    }
  });
}

test('focused opponent creates a forced fork and remains within a bounded turn budget', () => {
  const game = createGame(BLACK, 'challenge');
  [109, 110, 111].forEach(index => game.board[index] = WHITE);
  game.board[10] = BLACK;
  assert.ok([108, 112].includes(chooseMove(game, WHITE)));
  let current = createGame(BLACK, 'challenge');
  const start = performance.now();
  for (let n = 0; n < 40 && !current.winner && !current.draw; n++) {
    const index = chooseMove(current);
    assert.equal(current.board[index], 0);
    current = playMove(current, index);
  }
  assert.ok(performance.now() - start < 5000, '40 bounded turns should finish within five seconds');
});
