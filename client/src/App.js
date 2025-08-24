import React, { useEffect, useState } from 'react'; 
import socket from './socket';
import './App.css';
import Select from 'react-select';
import movies from './movies.json';
import { motion } from 'framer-motion';
import Confetti from 'react-confetti';
import toast, { Toaster } from 'react-hot-toast';

function App() {
  const [players, setPlayers] = useState([]);
  const [roomId, setRoomId] = useState('');
  const [playerName, setPlayerName] = useState('');
  const [joined, setJoined] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);
  const [chooserId, setChooserId] = useState('');
  const [isNextChooser, setIsNextChooser] = useState(false);
  const [maskedMovie, setMaskedMovie] = useState('');
  const [strikes, setStrikes] = useState([]);
  const [clue, setClue] = useState(null);
  const [gameStarted, setGameStarted] = useState(false);
  const [guessInput, setGuessInput] = useState('');
  const [movieToChoose, setMovieToChoose] = useState('');
  const [scoreboard, setScoreboard] = useState({});
  const [timeLeft, setTimeLeft] = useState(30);
  const [gameMessage, setGameMessage] = useState('');
  const [notifications, setNotifications] = useState([]);
  const [roundSummary, setRoundSummary] = useState(null);
  const [sessionOver, setSessionOver] = useState(null);
  const [muted, setMuted] = useState(false);
  const getAvatar = (name) => 
  `https://api.dicebear.com/7.x/identicon/svg?seed=${encodeURIComponent(name)}`;

  const playSound = (file) => {
   if (muted) return;
   const audio = new Audio(`/sounds/${file}`);
   audio.volume = 0.7;
   audio.play().catch(err => console.log("Sound play blocked:", err));
  };

  // Handle socket events
  useEffect(() => {
    socket.on('roomUpdate', setPlayers);

    socket.on('playerJoined', ({ playerName }) => {
      toast.success(t => (
      <div style={{ display: "flex", alignItems: "center" }}>
          <img src={getAvatar({playerName})} alt={playerName} className="avatar" />
          <span>{playerName} joined the game 🎉</span>
      </div>
      ),
    { duration: 3000 }
    );
    });

    socket.on('playerLeft', ({ playerName }) => {
      toast.error(t => (
      <div style={{ display: "flex", alignItems: "center" }}>
          <img src={getAvatar({playerName})} alt={playerName} className="avatar" />
          <span>{playerName} joined the game 🎉</span>
      </div>
      ),
    { duration: 3000 }
    );
    });

    socket.on('movieSelected', ({ chooserId, maskedMovie, strikes, clue }) => {
      setChooserId(chooserId);
      setMaskedMovie(maskedMovie);
      setStrikes(strikes);
      setClue(clue);
      setGameStarted(true);
      setTimeLeft(30);
      setGameMessage('');
    });

    socket.on('letterRevealed', ({ maskedMovie, scoreboard }) => {
      setMaskedMovie(maskedMovie);
      setScoreboard(scoreboard);
      playSound("success.wav");
    });

    socket.on('strikeUpdate', ({ strikes }) => {
      setStrikes(strikes);
      playSound("error.wav");
    });

    socket.on('clueReveal', ({ clue }) => {
      setClue(clue);
    });

    socket.on('gameResult', ({ result, winnerId, correctMovie, scoreboard }) => {
      setScoreboard(scoreboard);
      if (result === 'win') {
        playSound("win.wav");
      } else {
        playSound("lose.wav");
      }

      const winnerName = players.find(p => p.id === winnerId)?.name || "Someone";

      setRoundSummary({
      result,
      winnerName,
      correctMovie,
      scoreboard
    });

    setGameStarted(false);
    setMaskedMovie('');
    setStrikes([]);
    setClue(null);
    setGuessInput('');
  });

    socket.on('nextChooser', ({ chooserId }) => {
      setChooserId(chooserId);
      setIsNextChooser(chooserId === socket.id);
      setGameStarted(false);
    });

    socket.on('nextChooser', ({ chooserId }) => {
      const chooser = players.find(p => p.id === chooserId);
      toast(`🎬 It's ${chooser?.name || 'someone'}'s turn to choose!`, { icon: '🎬' });
    });

    socket.on('sessionOver', ({ message }) => {
      setSessionOver({
      message,
      scoreboard
    });
      setGameStarted(false);
    });

    let timer;
    if (gameStarted && timeLeft > 0) {
      timer = setTimeout(() => setTimeLeft(prev => prev - 1), 1000);
    }

    return () => {
      clearTimeout(timer);
      socket.off();
    };
  }, [players, gameStarted, timeLeft]);

  const handleJoin = () => {
    console.log("Joining room", roomId, playerName);
    if (roomId && playerName) {
      socket.emit('joinRoom', { roomId, playerName });
      setJoined(true);
    }
  };

  const handleSelectMovie = () => {
    if (movieToChoose.trim()) {
      socket.emit('selectMovie', { roomId, movie: movieToChoose });
    }
  };

  const handleGuess = () => {
    if (guessInput.trim()) {
      socket.emit('submitGuess', { roomId, guess: guessInput, playerId: socket.id });
      setGuessInput('');
      setTimeLeft(30);
    }
  };

  const isChooser = chooserId === socket.id;

  if (!joined) {
    return (
      <div className="intro-screen">
        <h1>Kollywood Guessing Game
          <button 
          className="mute-btn" 
          onClick={() => setMuted(!muted)}
          >
          {muted ? "🔇 Mute" : "🔊 Sound"}
        </button>
        </h1>
        {!showInstructions ? (
          <div className="join-container">
            <input
            placeholder="Enter Room ID"
            value={roomId}
            onChange={e => setRoomId(e.target.value)}
            />
            <input
            placeholder="Enter Your Name"
            value={playerName}
            onChange={e => setPlayerName(e.target.value)}
            />
            <button onClick={handleJoin}>Join Room</button>
            <button onClick={() => setShowInstructions(true)}>View Instructions</button>
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
    <div className="container">
      <header>Kollywood Guessing Game</header>

      <div className="scoreboard">
        <h3>Scoreboard</h3>
        <ul>
          {players.map(player => (
          <li key={player.id} id="player-item" className={player.id === chooserId ? "chooser" : ""}>
          <img src={getAvatar(player.name)} alt={player.name} className="avatar" />
          <span>{player.name}</span>
          <span>{scoreboard[player.id] || 0} pts</span>
          {player.id === chooserId && <span className="chooser-badge">🎬</span>}
          </li>
          ))}
        </ul>
      </div>
      <div className="game-info">
        <h3>Room: {roomId}</h3>
        <div className="timer-bar">
        <div 
        className="timer-fill" 
        style={{ width: `${(timeLeft / 30) * 100}%` }}
        ></div>
        <span>{timeLeft}s</span>
        </div>
        <div className="masked-movie">{maskedMovie || '_ _ _ _ _'}</div>
        <div className="status-message">
          {!gameStarted ? (isNextChooser ? 'Your Turn to choose a movie!' : 'Waiting for chooser...') :
            (isChooser ? 'You selected the movie. Waiting for others...' : 'Guess the movie!')}
        </div>
        {clue && <div className="clue">Clue: {clue}</div>}
        <div className="strike-word">
        {"KOLLYWOOD".split("").map((letter, i) => (
        <span
        key={i}
        className={`strike-letter ${i < strikes.length ? "struck" : ""}`}
        >
        {letter}
        </span>
        ))}
        </div>
        {gameMessage && <div className="game-message">
        {gameMessage}
        {/* Show Confetti if it's a win */}
        {gameMessage.includes('🎉') && <Confetti />}
        </div>}
      </div>

      <div className="input-section">
        {!gameStarted && isNextChooser && (
          <>
            <Select
            options={movies.map(m => ({ label: m, value: m }))}
            onChange={(selected) => setMovieToChoose(selected.value)}
            placeholder="Search & Select Movie..."
            isSearchable
            styles={{
              control: (base) => ({
              ...base,
              backgroundColor: 'transparent',
              border: '1px solid rgba(255,255,255,0.2)',
              color: '#fff',
              }),
              singleValue: (base) => ({ ...base, color: '#fff' }),
              menu: (base) => ({ ...base, backgroundColor: '#121827' }),
              option: (base, { isFocused }) => ({
              ...base,
              backgroundColor: isFocused ? '#ff7b00' : 'transparent',
              color: isFocused ? '#031218' : '#fff',
              }),
            }}
        />
        <button onClick={handleSelectMovie}>Select Movie</button>
        </>
        )}

        {gameStarted && !isChooser && (
          <>
            <input placeholder="Guess Letter or Movie" value={guessInput} onChange={e => setGuessInput(e.target.value)} />
            <button onClick={handleGuess}>Submit Guess</button>
          </>
        )}
      </div>
      {roundSummary && (
      <div className="modal-overlay">
        <div className="modal">
         <h2>{roundSummary.result === 'win' ? '🎉 Round Won!' : '😢 Round Lost'}</h2>
         {roundSummary.result === 'win' && (
         <p><strong>{roundSummary.winnerName}</strong> guessed it right!</p>
         )}
         <p>Correct Movie: <strong>{roundSummary.correctMovie}</strong></p>
      
        <h3>Scoreboard</h3>
        <ul>
        {players.map(player => (
          <li key={player.id}>
            {player.name}: {roundSummary.scoreboard[player.id] || 0} pts
          </li>
        ))}
        </ul>
      <button onClick={() => setRoundSummary(null)}>Continue</button>
      </div>
     </div>
     )}

     {sessionOver && (
     <div className="modal-overlay">
       <div className="modal">
         <h2>🏆 {sessionOver.message}</h2>
         <h3>Final Leaderboard</h3>
         <ul>
            {players
            .sort((a, b) => (scoreboard[b.id] || 0) - (scoreboard[a.id] || 0))
            .map((player, i) => (
            <li key={player.id}>
              {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : "🎮"}{" "}
              {player.name}: {scoreboard[player.id] || 0} pts
            </li>
            ))}
         </ul>
      <button onClick={() => window.location.reload()}>
        Play Again
      </button>
      </div>
    </div>
    )}
    <Toaster position="top-right" />
    </div>
  );
}

export default App;
