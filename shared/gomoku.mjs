export const BOARD_SIZE = 15;
export const BLACK = 1;
export const WHITE = 2;
const directions = [[1, 0], [0, 1], [1, 1], [1, -1]];
const inside = (r, c) => r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE;
export const coordinate = index => `${'ABCDEFGHIJKLMNO'[index % BOARD_SIZE]}${BOARD_SIZE - Math.floor(index / BOARD_SIZE)}`;

export function winningLine(board, index) {
  const stone = board[index];
  if (!stone) return [];
  const row = Math.floor(index / BOARD_SIZE), col = index % BOARD_SIZE;
  for (const [dr, dc] of directions) {
    const line = [index];
    for (const sign of [-1, 1]) {
      let r = row + dr * sign, c = col + dc * sign;
      while (inside(r, c) && board[r * BOARD_SIZE + c] === stone) {
        line.push(r * BOARD_SIZE + c);
        r += dr * sign; c += dc * sign;
      }
    }
    if (line.length >= 5) return line;
  }
  return [];
}

export function createGame(human = BLACK, difficulty = 'casual') {
  return { board: Array(BOARD_SIZE ** 2).fill(0), moves: [], turn: BLACK, winner: 0, line: [], draw: false,
    human: human === WHITE ? WHITE : BLACK, difficulty: difficulty === 'challenge' ? 'challenge' : 'casual' };
}

export function playMove(game, index) {
  if (!Number.isInteger(index) || index < 0 || index >= BOARD_SIZE ** 2 || game.board[index] || game.winner || game.draw) return game;
  const board = [...game.board];
  board[index] = game.turn;
  const line = winningLine(board, index);
  const moves = [...game.moves, index];
  return { ...game, board, moves, line, winner: line.length ? game.turn : 0,
    draw: !line.length && moves.length === board.length, turn: 3 - game.turn };
}

export function undoHumanTurn(game) {
  // Remove the human's most recent move and the reply, including terminal moves.
  const lastHuman = game.moves.findLastIndex((_, i) => (i % 2 === 0 ? BLACK : WHITE) === game.human);
  if (lastHuman < 0) return game;
  return game.moves.slice(0, lastHuman).reduce(playMove, createGame(game.human, game.difficulty));
}

export function restoreGame(raw) {
  try {
    const saved = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (saved?.version !== 1 || ![BLACK, WHITE].includes(saved.human)
      || !['casual', 'challenge'].includes(saved.difficulty) || !Array.isArray(saved.moves) || saved.moves.length > BOARD_SIZE ** 2) return null;
    let game = createGame(saved.human, saved.difficulty);
    for (const index of saved.moves) {
      const next = playMove(game, index);
      if (next === game) return null;
      game = next;
    }
    return game;
  } catch { return null; }
}

export function saveGame(game) {
  return JSON.stringify({ version: 1, human: game.human, difficulty: game.difficulty, moves: game.moves });
}

function candidates(board) {
  const result = new Set();
  board.forEach((stone, index) => {
    if (!stone) return;
    const row = Math.floor(index / BOARD_SIZE), col = index % BOARD_SIZE;
    for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) {
      const r = row + dr, c = col + dc;
      if (inside(r, c) && !board[r * BOARD_SIZE + c]) result.add(r * BOARD_SIZE + c);
    }
  });
  return result.size ? [...result] : board.some(Boolean) ? [] : [112];
}

function attackScore(board, index, stone) {
  const row = Math.floor(index / BOARD_SIZE), col = index % BOARD_SIZE;
  let score = 0;
  board[index] = stone;
  for (const [dr, dc] of directions) {
    let count = 1, open = 0;
    for (const sign of [-1, 1]) {
      let r = row + dr * sign, c = col + dc * sign;
      while (inside(r, c) && board[r * BOARD_SIZE + c] === stone) {
        count++; r += dr * sign; c += dc * sign;
      }
      if (inside(r, c) && !board[r * BOARD_SIZE + c]) open++;
    }
    if (count >= 5) score += 1000000;
    else if (open) score += [0, 2, 30, 700, 25000][count] * (open === 2 ? 6 : 1);
    // Include broken lines (XX_XX, X_XXX) without crossing edges or opponents.
    for (let offset = -4; offset <= 0; offset++) {
      let own = 0, valid = true;
      for (let n = 0; n < 5; n++) {
        const r = row + dr * (offset + n), c = col + dc * (offset + n);
        if (!inside(r, c) || (board[r * BOARD_SIZE + c] && board[r * BOARD_SIZE + c] !== stone)) { valid = false; break; }
        if (board[r * BOARD_SIZE + c] === stone) own++;
      }
      if (valid) score += [0, 0, 3, 30, 900, 0][own];
    }
  }
  board[index] = 0;
  return score;
}

function rankMoves(board, stone) {
  return candidates(board).map(index => {
    const attack = attackScore(board, index, stone), defense = attackScore(board, index, 3 - stone);
    const center = 14 - Math.abs(Math.floor(index / BOARD_SIZE) - 7) - Math.abs(index % BOARD_SIZE - 7);
    return { index, attack, defense, score: attack + defense * 1.08 + center };
  }).sort((a, b) => b.score - a.score || a.index - b.index);
}

export function chooseMove(game, stone = game.turn) {
  if (game.winner || game.draw) return null;
  const board = [...game.board], ranked = rankMoves(board, stone);
  if (!ranked.length) return null;
  // Never miss a one-move win or an immediate block, at either difficulty.
  const win = ranked.find(move => move.attack >= 1000000);
  if (win) return win.index;
  const block = ranked.find(move => move.defense >= 1000000);
  if (block) return block.index;
  if (game.difficulty === 'casual') return ranked[0].index;
  // A bounded reply search keeps mobile turns short and favors safer positions.
  let best = ranked[0].index, bestScore = -Infinity;
  for (const move of ranked.slice(0, 8)) {
    board[move.index] = stone;
    const replies = rankMoves(board, 3 - stone);
    const threats = candidates(board).filter(index => attackScore(board, index, stone) >= 1000000).length;
    const score = move.score - (replies[0]?.score || 0) * 0.85 + (threats >= 2 ? 2000000 : 0);
    board[move.index] = 0;
    if (score > bestScore) { bestScore = score; best = move.index; }
  }
  return best;
}
