import * as Tone from "tone";

// ----- helper types -----
export type Grid = boolean[][];   // rows = pitches, cols = 16-th steps

export interface CanonOptions {
  voices?: number;      // default 6
  startBpm?: number;    // default 120
  bpmStep?: number;     // default +0.5 BPM per new voice
  synthType?: string;   // default "synth"
  onNotePlay?: (note: string, position: number) => void;
  onNoteStop?: (note: string, position: number) => void;
}

// ----- private constants -----
const NOTES: ReadonlyArray<string> = [
  "C5", "B4", "A4", "G4", "F4", "E4", "D4", "C4",
];

// Create synth based on type
function createSynth(type: string) {
  switch (type) {
    case "am":
      return new Tone.PolySynth(Tone.AMSynth).toDestination();
    case "fm":
      return new Tone.PolySynth(Tone.FMSynth).toDestination();
    case "membrane":
      return new Tone.PolySynth(Tone.MembraneSynth).toDestination();
    case "metal":
      return new Tone.PolySynth(Tone.MetalSynth).toDestination();
    case "synth":
    default:
      return new Tone.PolySynth(Tone.Synth).toDestination();
  }
}

// Build a Tone.Part for one voice of the canon
function buildPart(grid: Grid, bpm: number, synthType: string, onNotePlay?: (note: string, position: number) => void, onNoteStop?: (note: string, position: number) => void): Tone.Part {
  const events: Array<[number, string, number]> = [];
  const secondsPerBeat = 60 / bpm;
  const synth = createSynth(synthType);

  grid.forEach((row, r) =>
    row.forEach((on, c) => {
      if (on) events.push([c * secondsPerBeat / 4, NOTES[r], c]);
    }),
  );

  const part = new Tone.Part((time, value) => {
    const { note, position } = value as { note: string, position: number };
    synth.triggerAttackRelease(note, "16n", time);
    onNotePlay?.(note, position);
    // Schedule the note stop event
    Tone.getContext().transport.scheduleOnce(() => {
      onNoteStop?.(note, position);
    }, time + Tone.Time("16n").toSeconds());
  }, events.map(([time, note, position]) => [time, { note, position }]));

  // Set up independent timing
  part.loop = true;
  part.loopEnd = "1m";
  part.playbackRate = bpm / 120; // Scale playback rate based on BPM
  return part;
}

/**
 * Start the phasing canon.  
 * Returns a function to stop & dispose everything.
 */
export function startCanon(
  grid: Grid,
  {
    voices = 6,
    startBpm = 120,
    bpmStep = 0.5,
    synthType = "synth",
    onNotePlay,
    onNoteStop,
  }: CanonOptions = {},
): () => void {
  Tone.getContext().transport.stop();
  Tone.getContext().transport.cancel();

  const parts: Tone.Part[] = [];
  let bpm = startBpm;

  for (let i = 0; i < voices; i++) {
    console.log(`Voice ${i + 1} BPM: ${bpm}`);
    const part = buildPart(grid, bpm, synthType, onNotePlay, onNoteStop);
    part.start(0);  // Start all parts at the same time
    parts.push(part);
    bpm += bpmStep;
  }

  Tone.getContext().transport.start("+0.05");

  return () => {
    Tone.getContext().transport.stop();
    parts.forEach((p) => p.dispose());
  };
}