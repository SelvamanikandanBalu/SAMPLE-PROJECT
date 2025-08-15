import React, { useEffect, useState } from 'react';
import socket from './socket';
import './App.css';

console.log("✅ App component mounted");

function App() {
  const [players, setPlayers] = useState([]);
  const [roomId, setRoomId] = useState('');
  const [playerName, setPlayerName] = useState('');
  const [joined, setJoined] = useState(false);
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

  useEffect(() => {
    socket.on('roomUpdate', setPlayers);

    socket.on('movieSelected', ({ chooserId, maskedMovie, strikes, clue }) => {
      setChooserId(chooserId);
      setMaskedMovie(maskedMovie);
      setStrikes(strikes);
      setClue(clue);
      setGameStarted(true);
      setTimeLeft(30);
    });

    socket.on('letterRevealed', ({ maskedMovie, scoreboard }) => {
      setMaskedMovie(maskedMovie);
      setScoreboard(scoreboard);
    });

    socket.on('strikeUpdate', ({ strikes }) => {
      setStrikes(strikes);
    });

    socket.on('clueReveal', ({ clue }) => {
      setClue(clue);
    });

    socket.on('gameResult', ({ result, winnerId, correctMovie, scoreboard }) => {
      alert(result === 'win'
        ? `🎉 Player ${players.find(p => p.id === winnerId)?.name || 'Someone'} guessed it! Movie: ${correctMovie}`
        : `😢 Game Over! The movie was: ${correctMovie}`);

      setScoreboard(scoreboard);
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

    socket.on('sessionOver', ({ message }) => {
      alert(message);
      window.location.reload();
    });

    let timer;
    if (gameStarted && timeLeft > 0) {
      timer = setTimeout(() => {
        setTimeLeft(prev => prev - 1);
      }, 1000);
    }

    return () => {
      clearTimeout(timer);
      socket.off('roomUpdate');
      socket.off('movieSelected');
      socket.off('letterRevealed');
      socket.off('strikeUpdate');
      socket.off('clueReveal');
      socket.off('gameResult');
      socket.off('nextChooser');
      socket.off('sessionOver');
    };
  }, [players, timeLeft, gameStarted]);

  const handleJoin = () => {
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

  return (
    <div>
      <header>Kollywood Guessing Game</header>
      <div className="container">
        <div className="scoreboard">
          <h3>Scoreboard</h3>
          <ul>
            {players.map(player => (
              <li key={player.id}>
                {player.name}: {scoreboard[player.id] || 0} pts
              </li>
            ))}
          </ul>
        </div>

        <div className="game-info">
          <h3>Room: {roomId}</h3>
          <div className="timer">Time Left: {timeLeft} sec</div>
          <div className="masked-movie">{maskedMovie || '_ _ _ _ _'}</div>
          <div className="status-message">
            {!joined ? 'Please Join a Room' :
              !gameStarted ? (isNextChooser ? 'Your Turn to choose a movie!' : 'Waiting for chooser...') :
              (isChooser ? 'You selected the movie. Waiting for others...' : 'Guess the movie!')}
          </div>
          {clue && <div className="clue">Clue: {clue}</div>}
          {strikes.length > 0 && <div className="strikes">Strikes: {strikes.join(', ')}</div>}
        </div>

        <div className="input-section">
          {!joined ? (
            <>
              <input placeholder="Room ID" value={roomId} onChange={e => setRoomId(e.target.value)} />
              <input placeholder="Your Name" value={playerName} onChange={e => setPlayerName(e.target.value)} />
              <button onClick={handleJoin}>Join</button>
            </>
          ) : !gameStarted ? (
            isNextChooser && (
              <>
                <input placeholder="Type Movie Name" value={movieToChoose} onChange={e => setMovieToChoose(e.target.value)} />
                <button onClick={handleSelectMovie}>Select Movie</button>
              </>
            )
          ) : !isChooser ? (
            <>
              <input placeholder="Guess Letter or Movie" value={guessInput} onChange={e => setGuessInput(e.target.value)} />
              <button onClick={handleGuess}>Submit Guess</button>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default App;
