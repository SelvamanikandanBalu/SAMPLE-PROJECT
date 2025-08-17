const express = require('express');
const app = express();
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');
const server = http.createServer(app);

app.use(cors({ origin: "*" }));

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const MOVIES = ["Mersal", "Vikram", "Jailer", "Ponniyin Selvan", "Ghilli", "Master"];
const KOLLYWOOD = ['K','O','L','L','Y','W','O','O','D'];
let rooms = {};
let roomStates = {};
let roomScores = {};
let roomTimers = {};

function maskMovieName(movie) {
  return movie.split('').map(char => {
    if ('AEIOUaeiou'.includes(char)) return char;
    if (char === ' ') return ' ';
    return '_';
  }).join(' ');
}

function maskMovieWithReveals(movie, revealedLetters) {
  return movie.split('').map(char => {
    if ('AEIOUaeiou'.includes(char)) return char;
    if (char === ' ') return ' ';
    if (revealedLetters.has(char.toLowerCase())) return char;
    return '_';
  }).join(' ');
}

function startGuessTimer(roomId) {
  clearGuessTimer(roomId);
  roomTimers[roomId] = setTimeout(() => {
    console.log(`⏰ Timer expired for Room ${roomId} — Adding Strike`);
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

  const elapsed = (Date.now() - state.startTime) / 1000;
  if (elapsed >= 300) {
    io.to(roomId).emit('sessionOver', { message: "Game Over! Session ended." });
    delete roomStates[roomId];
    clearGuessTimer(roomId);
    return;
  }

  state.chooserIndex = (state.chooserIndex + 1) % roomPlayers.length;
  const nextChooserId = roomPlayers[state.chooserIndex].id;
  console.log(`🔄 Room ${roomId} — Next chooser: ${nextChooserId}`);
  io.to(roomId).emit('nextChooser', { chooserId: nextChooserId });
}

function handleWrongGuess(roomId) {
  console.log(`❌ Wrong guess in room: ${roomId} | Current strikes: ${roomStates[roomId].strikes.length}`);
  const gameState = roomStates[roomId];
  const strikes = gameState.strikes;
  if (strikes.length < KOLLYWOOD.length) {
    strikes.push(KOLLYWOOD[strikes.length]);
    io.to(roomId).emit('strikeUpdate', { strikes });

    if (strikes.length === 5) {
      io.to(roomId).emit('clueReveal', { clue: 'Hint Example: Hero Vijay' });
    }

    if (strikes.length === 9) {
      console.log(`💀 LOSS — All strikes used. Movie was "${gameState.movie}" in Room ${roomId}`);
      io.to(roomId).emit('gameResult', {
        result: 'lose',
        correctMovie: gameState.movie,
        scoreboard: roomScores[roomId]
      });
      clearGuessTimer(roomId);
      rotateChooser(roomId);
    }
  }
}

io.on('connection', (socket) => {
  console.log(`⚡ Connected: ${socket.id}`);

  socket.on('joinRoom', ({ roomId, playerName }) => {
    socket.join(roomId);

    if (!rooms[roomId]) rooms[roomId] = [];
    rooms[roomId].push({ id: socket.id, name: playerName });

    if (!roomScores[roomId]) roomScores[roomId] = {};
    roomScores[roomId][socket.id] = 0;

    io.to(roomId).emit('roomUpdate', rooms[roomId]);

    io.to(roomId).emit('playerJoined', { playerName });

    if (!roomStates[roomId]) {
      roomStates[roomId] = { chooserIndex: 0 };
      console.log(`🎯 Room ${roomId} — Initial chooser set: ${firstChooser} (${playerName})`);
      io.to(roomId).emit('nextChooser', { chooserId: socket.id });
    }
  });

  socket.on('selectMovie', ({ roomId, movie }) => {
    console.log(`🎬 ${socket.id} selected movie: ${movie} in room: ${roomId}`);
    const roomPlayers = rooms[roomId];
    if (!roomPlayers) return;

    if (!roomStates[roomId].startTime) {
      roomStates[roomId].startTime = Date.now();
    }

    const masked = maskMovieName(movie);

    roomStates[roomId].movie = movie;
    roomStates[roomId].strikes = [];
    roomStates[roomId].revealedLetters = new Set();

    const chooserId = roomPlayers[roomStates[roomId].chooserIndex].id;

    io.to(roomId).emit('movieSelected', {
      chooserId,
      maskedMovie: masked,
      strikes: [],
      clue: null
    });

    console.log(`Movie selected in Room ${roomId}: ${movie}`);
    startGuessTimer(roomId);
  });

  socket.on('submitGuess', ({ roomId, guess, playerId }) => {
    clearGuessTimer(roomId);

    const gameState = roomStates[roomId];
    if (!gameState) return;

    const normalizedGuess = guess.trim().toLowerCase();
    const normalizedMovie = gameState.movie.toLowerCase();

    if (normalizedGuess.length > 1) {
      if (normalizedGuess === normalizedMovie) {
        const scoreGain = Math.max(50, 100 - (gameState.strikes.length * 10));
        roomScores[roomId][playerId] += scoreGain;

        console.log(`🏆 WIN — Player ${playerId} guessed full movie "${gameState.movie}" in Room ${roomId}`);

        io.to(roomId).emit('gameResult', {
          result: 'win',
          winnerId: playerId,
          correctMovie: gameState.movie,
          scoreboard: roomScores[roomId]
        });

        clearGuessTimer(roomId);
        rotateChooser(roomId);
      } else {
        handleWrongGuess(roomId);
        startGuessTimer(roomId);
      }
    } else if (normalizedGuess.length === 1) {
      const letter = normalizedGuess;
      if (normalizedMovie.includes(letter)) {
        gameState.revealedLetters.add(letter);
        const updatedMasked = maskMovieWithReveals(gameState.movie, gameState.revealedLetters);

        roomScores[roomId][playerId] += 10;
        io.to(roomId).emit('letterRevealed', { maskedMovie: updatedMasked, scoreboard: roomScores[roomId] });

        if (!updatedMasked.includes('_')) {
          console.log(`🏆 WIN — Player ${playerId} completed movie "${gameState.movie}" in Room ${roomId} by guessing letters`);
          io.to(roomId).emit('gameResult', {
            result: 'win',
            winnerId: playerId,
            correctMovie: gameState.movie,
            scoreboard: roomScores[roomId]
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

  socket.on('disconnect', () => {
    console.log(`❌ Disconnected: ${socket.id}`);
    for (const roomId in rooms) {
      const leavingPlayer = rooms[roomId].find(p => p.id === socket.id);
      rooms[roomId] = rooms[roomId].filter(player => player.id !== socket.id);
      io.to(roomId).emit('roomUpdate', rooms[roomId]);

      if (leavingPlayer) {
      // NEW: Announce player left
      io.to(roomId).emit('playerLeft', { playerName: leavingPlayer.name });
      }
    }
  });
});

app.get('/', (req, res) => {
  res.send('Kollywood Game Backend is running.');
});

server.listen(5000, () => {
  console.log('Server running on port 5000');
});
