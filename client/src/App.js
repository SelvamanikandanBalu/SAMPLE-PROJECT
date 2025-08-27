import React, { useEffect, useState } from "react";
import socket from "./socket";
import "./App.css";
import Confetti from "react-confetti";
import { toast, Toaster } from "react-hot-toast";

// Utility: random avatar
function getAvatar(name) {
  return `https://api.dicebear.com/6.x/thumbs/svg?seed=${encodeURIComponent(
    name
  )}`;
}

function App() {
  const [players, setPlayers] = useState([]);
  const [roomId, setRoomId] = useState("");
  const [playerName, setPlayerName] = useState("");
  const [joined, setJoined] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);

  const [chooserId, setChooserId] = useState("");
  const [isNextChooser, setIsNextChooser] = useState(false);
  const [maskedMovie, setMaskedMovie] = useState("");
  const [strikes, setStrikes] = useState([]);
  const [clue, setClue] = useState(null);
  const [gameStarted, setGameStarted] = useState(false);

  const [guessInput, setGuessInput] = useState("");
  const [movieToChoose, setMovieToChoose] = useState("");
  const [scoreboard, setScoreboard] = useState({});
  const [timeLeft, setTimeLeft] = useState(30);

  const [roundSummary, setRoundSummary] = useState(null);

  // --- Socket Events ---
  useEffect(() => {
    socket.on("roomUpdate", setPlayers);

    socket.on("playerJoined", ({ playerName }) => {
      toast.success(`${playerName} joined the game!`, {
        icon: "👋",
      });
    });

    socket.on("playerLeft", ({ playerName }) => {
      toast.error(`${playerName} left the game!`, {
        icon: "🚪",
      });
    });

    socket.on("movieSelected", ({ chooserId, maskedMovie, strikes, clue }) => {
      setChooserId(chooserId);
      setMaskedMovie(maskedMovie);
      setStrikes(strikes);
      setClue(clue);
      setGameStarted(true);
      setTimeLeft(30);
      setRoundSummary(null);
    });

    socket.on("letterRevealed", ({ maskedMovie, scoreboard }) => {
      setMaskedMovie(maskedMovie);
      setScoreboard(scoreboard);
    });

    socket.on("strikeUpdate", ({ strikes }) => {
      setStrikes(strikes);
    });

    socket.on("clueReveal", ({ clue }) => {
      setClue(clue);
    });

    socket.on(
      "gameResult",
      ({ result, winnerId, correctMovie, scoreboard }) => {
        setScoreboard(scoreboard);
        const winnerName =
          players.find((p) => p.id === winnerId)?.name || "Someone";

        setRoundSummary({
          result,
          winnerName,
          correctMovie,
          scoreboard,
        });

        setGameStarted(false);
        setMaskedMovie("");
        setStrikes([]);
        setClue(null);
        setGuessInput("");
      }
    );

    socket.on("nextChooser", ({ chooserId }) => {
      setChooserId(chooserId);
      setIsNextChooser(chooserId === socket.id);
      setGameStarted(false);

      const chooser = players.find((p) => p.id === chooserId);
      toast(`🎬 It's ${chooser?.name || "someone"}'s turn to choose!`, {
        icon: "🎬",
      });
    });

    socket.on("sessionOver", ({ message }) => {
      toast(message, { icon: "🏁" });
    });

    return () => {
      socket.off();
    };
  }, [players]);

  // --- Timer ---
  useEffect(() => {
    let timer;
    if (gameStarted && timeLeft > 0) {
      timer = setTimeout(() => setTimeLeft((prev) => prev - 1), 1000);
    }
    return () => clearTimeout(timer);
  }, [gameStarted, timeLeft]);

  // --- Handlers ---
  const handleJoin = () => {
    if (roomId && playerName) {
      socket.emit("joinRoom", { roomId, playerName });
      setJoined(true);
    }
  };

  const handleSelectMovie = () => {
    if (movieToChoose.trim()) {
      socket.emit("selectMovie", { roomId, movie: movieToChoose });
    }
  };

  const handleGuess = () => {
    if (guessInput.trim()) {
      socket.emit("submitGuess", {
        roomId,
        guess: guessInput,
        playerId: socket.id,
      });
      setGuessInput("");
      setTimeLeft(30);
    }
  };

  const isChooser = chooserId === socket.id;

  // --- Screens ---
  if (!joined) {
    return (
      <div className="intro-screen">
        <h1>Kollywood Guessing Game</h1>
        {!showInstructions ? (
          <div className="join-container">
            <input
              placeholder="Enter Room ID"
              value={roomId}
              onChange={(e) => setRoomId(e.target.value)}
            />
            <input
              placeholder="Enter Your Name"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
            />
            <button onClick={handleJoin}>Join Room</button>
            <button onClick={() => setShowInstructions(true)}>
              View Instructions
            </button>
          </div>
        ) : (
          <div className="instructions">
            <h2>Instructions</h2>
            <p>1. Join a room with your name.</p>
            <p>2. Wait for your turn to choose a movie or guess.</p>
            <p>3. Guess letters or full movie names to win points.</p>
            <p>4. Strikes appear when guesses are wrong.</p>
            <button onClick={() => setShowInstructions(false)}>Back</button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="app-wrapper">
      <header>
        <h1>Kollywood Guessing Game</h1>
      </header>

      <div className="container">
        {/* Scoreboard */}
        <div className="scoreboard">
          <h3>Scoreboard</h3>
          <ul>
            {players.map((player) => (
              <li key={player.id} id="player-item">
                <img
                  src={getAvatar(player.name)}
                  alt={player.name}
                  className="avatar"
                />
                {player.name}: {scoreboard[player.id] || 0} pts
              </li>
            ))}
          </ul>
        </div>

        {/* Game Info */}
        <div className="game-info">
          <h3>Room: {roomId}</h3>
          <div className="timer">⏱ {timeLeft} sec</div>
          <div className="masked-movie">{maskedMovie || "_ _ _ _ _"}</div>
          <div className="status-message">
            {!gameStarted
              ? isNextChooser
                ? "Your Turn to choose a movie!"
                : "Waiting for chooser..."
              : isChooser
              ? "You selected the movie. Waiting for others..."
              : "Guess the movie!"}
          </div>
          {clue && <div className="clue">Clue: {clue}</div>}
          <div className="strikes">
            {strikes.map((s, i) => (
              <span key={i} className="strike">
                {s}
              </span>
            ))}
          </div>
        </div>

        {/* Input Section */}
        <div className="input-section">
          {!gameStarted && isNextChooser && (
            <>
              <input
                placeholder="Type Movie Name"
                value={movieToChoose}
                onChange={(e) => setMovieToChoose(e.target.value)}
              />
              <button onClick={handleSelectMovie}>Select Movie</button>
            </>
          )}

          {gameStarted && !isChooser && (
            <>
              <input
                placeholder="Guess Letter or Movie"
                value={guessInput}
                onChange={(e) => setGuessInput(e.target.value)}
              />
              <button onClick={handleGuess}>Submit Guess</button>
            </>
          )}
        </div>
      </div>

      {/* Round Summary Modal */}
      {roundSummary && (
        <div className="modal-overlay">
          <div className="modal">
            {roundSummary.result === "win" && <Confetti />}
            <h2>
              {roundSummary.result === "win"
                ? "🎉 Round Won!"
                : "😢 Round Lost"}
            </h2>
            {roundSummary.result === "win" && (
              <p>
                <strong>{roundSummary.winnerName}</strong> guessed it right!
              </p>
            )}
            <p>
              Correct Movie: <strong>{roundSummary.correctMovie}</strong>
            </p>

            <h3>Scoreboard</h3>
            <ul>
              {players.map((player) => (
                <li key={player.id}>
                  {player.name}: {roundSummary.scoreboard[player.id] || 0} pts
                </li>
              ))}
            </ul>
            <button onClick={() => setRoundSummary(null)}>Continue</button>
          </div>
        </div>
      )}

      <Toaster position="top-right" />
    </div>
  );
}

export default App;
