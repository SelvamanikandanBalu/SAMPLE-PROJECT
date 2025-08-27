const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

app.use(cors({ origin: "*" }));

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

// ================== Game Constants ==================
const MOVIES = require("./movies.json");
const KOLLYWOOD = ["K", "O", "L", "L", "Y", "W", "O", "O", "D"];

// Room-level data stores
let rooms = {}; // players per room
let roomStates = {}; // chooser, strikes, movie
let roomScores = {}; // scores per player
let roomTimers = {}; // guess timers

// ================== Helpers ==================
function maskMovieName(movie) {
  return movie
    .split("")
    .map((char) => {
      if ("AEIOUaeiou".includes(char)) return char;
      if (char === " ") return " ";
      return "_";
    })
    .join(" ");
}

function maskMovieWithReveals(movie, revealedLetters) {
  return movie
    .split("")
    .map((char) => {
      if ("AEIOUaeiou".includes(char)) return char;
      if (char === " ") return " ";
      if (revealedLetters.has(char.toLowerCase())) return char;
      return "_";
    })
    .join(" ");
}

function startGuessTimer(roomId) {
  clearGuessTimer(roomId);
  roomTimers[roomId] = setTimeout(() => {
    console.log(`⏰ Timer expired in Room ${roomId} — Adding strike`);
    handleWrongGuess(roomId);
    startGuessTimer(roomId);
  }, 30000);
}

function clearGuessTimer(roomId) {
  if (roomTimers[roomId]) {
    clearTimeout(roomTimers[roomId]);
    delete roomTimers[roomId];
  }
}

function rotateChooser(roomId) {
  const roomPlayers = rooms[roomId];
  const state = roomStates[roomId];
  if (!roomPlayers || !state) return;

  // Session duration check (5 minutes)
  const elapsed = (Date.now() - state.startTime) / 1000;
  if (elapsed >= 300) {
    io.to(roomId).emit("sessionOver", {
      message: "🏁 Game Over! Session ended.",
    });
    delete roomStates[roomId];
    clearGuessTimer(roomId);
    return;
  }

  state.chooserIndex = (state.chooserIndex + 1) % roomPlayers.length;
  const nextChooserId = roomPlayers[state.chooserIndex].id;

  console.log(`🔄 Room ${roomId} — Next chooser: ${nextChooserId}`);
  io.to(roomId).emit("nextChooser", { chooserId: nextChooserId });
}

function handleWrongGuess(roomId) {
  const gameState = roomStates[roomId];
  if (!gameState) return;

  const strikes = gameState.strikes;
  console.log(
    `❌ Wrong guess in Room ${roomId} | Current strikes: ${strikes.length}`
  );

  if (strikes.length < KOLLYWOOD.length) {
    strikes.push(KOLLYWOOD[strikes.length]);
    io.to(roomId).emit("strikeUpdate", { strikes });

    if (strikes.length === 5) {
      io.to(roomId).emit("clueReveal", {
        clue: "Hint Example: Hero Vijay",
      });
    }

    if (strikes.length === 9) {
      console.log(
        `💀 LOSS — All strikes used. Movie was "${gameState.movie}" in Room ${roomId}`
      );
      io.to(roomId).emit("gameResult", {
        result: "lose",
        correctMovie: gameState.movie,
        scoreboard: roomScores[roomId],
      });
      clearGuessTimer(roomId);
      rotateChooser(roomId);
    }
  }
}

// ================== Socket.IO Events ==================
io.on("connection", (socket) => {
  console.log(`⚡ Player connected: ${socket.id}`);

  // --- Join Room ---
  socket.on("joinRoom", ({ roomId, playerName }) => {
    socket.join(roomId);

    if (!rooms[roomId]) rooms[roomId] = [];
    rooms[roomId].push({ id: socket.id, name: playerName });

    if (!roomScores[roomId]) roomScores[roomId] = {};
    roomScores[roomId][socket.id] = 0;

    io.to(roomId).emit("roomUpdate", rooms[roomId]);
    io.to(roomId).emit("playerJoined", { playerName });

    if (!roomStates[roomId]) {
      roomStates[roomId] = { chooserIndex: 0 };
      console.log(
        `🎯 Room ${roomId} — Initial chooser: ${socket.id} (${playerName})`
      );
      io.to(roomId).emit("nextChooser", { chooserId: socket.id });
    }
  });

  // --- Select Movie ---
  socket.on("selectMovie", ({ roomId, movie }) => {
    const roomPlayers = rooms[roomId];
    if (!roomPlayers) return;

    console.log(`🎬 ${socket.id} selected "${movie}" in Room ${roomId}`);

    if (!roomStates[roomId].startTime) {
      roomStates[roomId].startTime = Date.now();
    }

    const masked = maskMovieName(movie);
    roomStates[roomId].movie = movie;
    roomStates[roomId].strikes = [];
    roomStates[roomId].revealedLetters = new Set();

    const chooserId = roomPlayers[roomStates[roomId].chooserIndex].id;
    io.to(roomId).emit("movieSelected", {
      chooserId,
      maskedMovie: masked,
      strikes: [],
      clue: null,
    });

    startGuessTimer(roomId);
  });

  // --- Submit Guess ---
  socket.on("submitGuess", ({ roomId, guess, playerId }) => {
    clearGuessTimer(roomId);

    const gameState = roomStates[roomId];
    if (!gameState) return;

    const normalizedGuess = guess.trim().toLowerCase();
    const normalizedMovie = gameState.movie.toLowerCase();

    if (normalizedGuess.length > 1) {
      // Full movie guess
      if (normalizedGuess === normalizedMovie) {
        const scoreGain = Math.max(50, 100 - gameState.strikes.length * 10);
        roomScores[roomId][playerId] += scoreGain;

        console.log(
          `🏆 WIN — Player ${playerId} guessed full movie "${gameState.movie}" in Room ${roomId}`
        );

        io.to(roomId).emit("gameResult", {
          result: "win",
          winnerId: playerId,
          correctMovie: gameState.movie,
          scoreboard: roomScores[roomId],
        });

        clearGuessTimer(roomId);
        rotateChooser(roomId);
      } else {
        handleWrongGuess(roomId);
        startGuessTimer(roomId);
      }
    } else if (normalizedGuess.length === 1) {
      // Letter guess
      const letter = normalizedGuess;
      if (normalizedMovie.includes(letter)) {
        gameState.revealedLetters.add(letter);
        const updatedMasked = maskMovieWithReveals(
          gameState.movie,
          gameState.revealedLetters
        );

        roomScores[roomId][playerId] += 10;
        io.to(roomId).emit("letterRevealed", {
          maskedMovie: updatedMasked,
          scoreboard: roomScores[roomId],
        });

        if (!updatedMasked.includes("_")) {
          console.log(
            `🏆 WIN — Player ${playerId} completed movie "${gameState.movie}" by guessing letters in Room ${roomId}`
          );
          io.to(roomId).emit("gameResult", {
            result: "win",
            winnerId: playerId,
            correctMovie: gameState.movie,
            scoreboard: roomScores[roomId],
          });
          clearGuessTimer(roomId);
          rotateChooser(roomId);
        } else {
          startGuessTimer(roomId);
        }
      } else {
        handleWrongGuess(roomId);
        startGuessTimer(roomId);
      }
    }
  });

  // --- Disconnect ---
  socket.on("disconnect", () => {
    console.log(`❌ Player disconnected: ${socket.id}`);
    for (const roomId in rooms) {
      const leavingPlayer = rooms[roomId].find((p) => p.id === socket.id);
      rooms[roomId] = rooms[roomId].filter((p) => p.id !== socket.id);
      io.to(roomId).emit("roomUpdate", rooms[roomId]);

      if (leavingPlayer) {
        io.to(roomId).emit("playerLeft", { playerName: leavingPlayer.name });
      }
    }
  });
});

// ================== Routes ==================
app.get("/", (req, res) => {
  res.send("Kollywood Game Backend is running 🎬");
});

// ================== Start Server ==================
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
