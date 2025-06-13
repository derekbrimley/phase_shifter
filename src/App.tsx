import React, { useRef, useState, useEffect, type JSX } from "react";
import * as Tone from "tone";
import { startCanon } from "./phaseCanon";
import type { Grid } from "./phaseCanon";
import "./App.css";

const COLS = 16;
const ROWS = 8;
const NOTES = ["C5", "B4", "A4", "G4", "F4", "E4", "D4", "C4"];

const SYNTH_TYPES = [
  { value: "synth", label: "Basic Synth" },
  { value: "am", label: "AM Synth" },
  { value: "fm", label: "FM Synth" },
  { value: "membrane", label: "Membrane" },
  { value: "metal", label: "Metal" },
];

const BPM_STEPS = Array.from({ length: 6 }, (_, i) => (i + 1) * 0.5);

function FFTVisualizer() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [analyzer, setAnalyzer] = useState<Tone.FFT | null>(null);

  useEffect(() => {
    const fft = new Tone.FFT(128);
    Tone.getDestination().connect(fft);
    setAnalyzer(fft);

    return () => {
      fft.dispose();
    };
  }, []);

  useEffect(() => {
    if (!analyzer || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const draw = () => {
      if (!ctx || !canvas) return;

      const values = analyzer.getValue();
      const width = canvas.width;
      const height = canvas.height;
      const barWidth = width / values.length;

      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = '#6cf';

      values.forEach((value, i) => {
        const x = i * barWidth;
        const barHeight = (value + 140) * 2; // Scale the values
        ctx.fillRect(x, height - barHeight, barWidth - 1, barHeight);
      });

      requestAnimationFrame(draw);
    };

    draw();
  }, [analyzer]);

  return (
    <canvas 
      ref={canvasRef} 
      width={400} 
      height={200} 
      className="fft-visualizer"
    />
  );
}

function AudioPhase() {
  const [playing, setPlaying] = useState(false);
  const [voices, setVoices] = useState(3);
  const [bpmStep, setBpmStep] = useState(0.5);
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const players = useRef<Tone.Player[]>([]);
  const stopFn = useRef<(() => void) | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Check file type
      const validTypes = ['audio/mpeg', 'audio/wav', 'audio/mp3', 'audio/ogg'];
      if (!validTypes.includes(file.type)) {
        setError('Please use MP3, WAV, or OGG files. AIFF files are not supported.');
        setAudioFile(null);
        setAudioUrl(null);
        return;
      }
      setError(null);
      setAudioFile(file);
      const url = URL.createObjectURL(file);
      setAudioUrl(url);
    }
  };

  const handleStart = async () => {
    if (!audioUrl) return;

    try {
      setError(null);
      setIsLoading(true);
      await Tone.start();
      await Tone.getContext().resume();

      // Create and load players
      const newPlayers = await Promise.all(
        Array.from({ length: voices }, async () => {
          const player = new Tone.Player({
            loop: true,
            loopStart: 0,
            loopEnd: 0, // 0 means loop the entire file
          }).toDestination();
          try {
            await player.load(audioUrl);
            return player;
          } catch (err) {
            throw new Error('Failed to load audio file. Please try a different file format (MP3, WAV, or OGG).');
          }
        })
      );
      players.current = newPlayers;

      // Set different playback rates
      let bpm = 120;
      newPlayers.forEach((player, i) => {
        player.playbackRate = bpm / 120;
        bpm += bpmStep;
      });

      // Start all players
      newPlayers.forEach(player => player.start());
      setPlaying(true);
    } catch (err) {
      console.error("Failed to start audio:", err);
      setError(err instanceof Error ? err.message : 'Failed to start audio playback');
    } finally {
      setIsLoading(false);
    }
  };

  const handleStop = () => {
    players.current.forEach(player => {
      player.stop();
      player.dispose();
    });
    players.current = [];
    setPlaying(false);
  };

  return (
    <div className="audio-phase">
      <h2>Audio Phase</h2>
      <div className="controls">
        <label>
          Audio File:{" "}
          <input 
            type="file" 
            accept="audio/mpeg,audio/wav,audio/mp3,audio/ogg"
            onChange={handleFileChange}
            disabled={playing || isLoading}
          />
        </label>
        <label>
          Voices:{" "}
          <select 
            value={voices} 
            onChange={(e) => setVoices(Number(e.target.value))}
            disabled={playing || isLoading}
          >
            {[2,3,4,5,6].map(n => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </label>
        <label>
          BPM Step:{" "}
          <select 
            value={bpmStep} 
            onChange={(e) => setBpmStep(Number(e.target.value))}
            disabled={playing || isLoading}
          >
            {BPM_STEPS.map(step => (
              <option key={step} value={step}>{step}</option>
            ))}
          </select>
        </label>
      </div>
      <button 
        onClick={playing ? handleStop : handleStart}
        disabled={!audioFile || isLoading}
      >
        {isLoading ? "Loading..." : playing ? "Stop" : "Start"}
      </button>
      {error && <p className="error">{error}</p>}
      <p className="hint">
        Upload an audio file (MP3, WAV, or OGG) to create a phase canon with multiple versions playing at different speeds
      </p>
    </div>
  );
}

export default function App(): JSX.Element {
  const [activeTab, setActiveTab] = useState<'synth' | 'audio'>('synth');
  const [grid, setGrid] = useState<Grid>(
    Array.from({ length: ROWS }, () => Array(COLS).fill(false)),
  );
  const [playing, setPlaying] = useState(false);
  const [voices, setVoices] = useState(3);
  const [synthType, setSynthType] = useState("synth");
  const [bpmStep, setBpmStep] = useState(0.5);
  const [activeCells, setActiveCells] = useState<Set<string>>(new Set());
  const stopFn = useRef<(() => void) | null>(null);

  // flip one cell
  const flip = (r: number, c: number) =>
    setGrid((g) => g.map((row, ri) =>
      ri === r ? row.map((v, ci) => (ci === c ? !v : v)) : row,
    ));

  // start/stop handlers
  const handleStart = async () => {
    try {
      await Tone.start();
      await Tone.getContext().resume();
      stopFn.current = startCanon(grid, { 
        voices, 
        synthType, 
        bpmStep,
        onNotePlay: (note, position) => {
          setActiveCells(prev => new Set([...prev, `${note}-${position}`]));
        },
        onNoteStop: (note, position) => {
          setActiveCells(prev => {
            const next = new Set(prev);
            next.delete(`${note}-${position}`);
            return next;
          });
        },
      });
      setPlaying(true);
    } catch (err) {
      console.error("Failed to start audio:", err);
    }
  };

  const handleStop = () => {
    stopFn.current?.();
    setPlaying(false);
    setActiveCells(new Set());
  };

  return (
    <div className="wrapper">
      <h1>Phase-Canon Playground</h1>
      <div className="tabs">
        <button 
          className={activeTab === 'synth' ? 'active' : ''} 
          onClick={() => setActiveTab('synth')}
        >
          Synth
        </button>
        <button 
          className={activeTab === 'audio' ? 'active' : ''} 
          onClick={() => setActiveTab('audio')}
        >
          Audio
        </button>
      </div>
      {activeTab === 'synth' ? (
        <>
          <div className="controls">
            <label>
              Voices:{" "}
              <select 
                value={voices} 
                onChange={(e) => setVoices(Number(e.target.value))}
                disabled={playing}
              >
                {[2,3,4,5,6,7,8].map(n => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </label>
            <label>
              Sound:{" "}
              <select 
                value={synthType} 
                onChange={(e) => setSynthType(e.target.value)}
                disabled={playing}
              >
                {SYNTH_TYPES.map(({ value, label }) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </label>
            <label>
              BPM Step:{" "}
              <select 
                value={bpmStep} 
                onChange={(e) => setBpmStep(Number(e.target.value))}
                disabled={playing}
              >
                {BPM_STEPS.map(step => (
                  <option key={step} value={step}>{step}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="grid-container">
            <div className="note-labels">
              {NOTES.map((note, i) => (
                <div key={note} className="note-label">{note}</div>
              ))}
            </div>
            <div className="roll">
              <div className="beat-labels">
                {Array.from({ length: COLS }, (_, i) => (
                  <div key={i} className="beat-label">{i + 1}</div>
                ))}
              </div>
              {grid.map((row, r) => (
                <div key={r} className="row">
                  {row.map((on, c) => (
                    <div
                      key={c}
                      className={`cell ${on ? "on" : ""} ${activeCells.has(`${NOTES[r]}-${c}`) ? "playing" : ""}`}
                      onClick={() => flip(r, c)}
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>
          <button onClick={playing ? handleStop : handleStart}>
            {playing ? "Stop" : "Start"}
          </button>
          <p className="hint">
            click cells to create a 1-bar seed • top row = C5, bottom = C4
          </p>
          {playing && <FFTVisualizer />}
        </>
      ) : (
        <AudioPhase />
      )}
    </div>
  );
}