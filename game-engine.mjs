export const WINNING_LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6]
];

export function winnerFor(board) {
  for (const [a, b, c] of WINNING_LINES) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) return board[a];
  }
  return null;
}

export function createGameState() {
  return { board: Array(9).fill(null), status: "playing", winner: null, currentPlayer: "X" };
}

export function applyMove(state, index, player) {
  if (state.status !== "playing" || !Number.isInteger(index) || index < 0 || index > 8) {
    return { ok: false, error: "Invalid move." };
  }
  if (state.board[index] || state.currentPlayer !== player) {
    return { ok: false, error: "That move is not allowed." };
  }
  const board = [...state.board];
  board[index] = player;
  const winner = winnerFor(board);
  const status = winner ? "finished" : board.every(Boolean) ? "draw" : "playing";
  return {
    ok: true,
    state: {
      board,
      status,
      winner,
      currentPlayer: status === "playing" ? (player === "X" ? "O" : "X") : player
    }
  };
}

export function validateRoom(game) {
  return game && game.status === "playing" && game.players.length === 2;
}
