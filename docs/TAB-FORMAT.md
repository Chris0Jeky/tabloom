# Tab format

The parser reads the ASCII tab guitarists already write. There is no new syntax to
learn: **columns are rhythm**.

```
# Verse
e|--0--2--3--2--|
B|--1--1--1--1--|
G|--0--0--0--0--|
D|--2--2--2--2--|
A|--3--3--3--3--|
E|--------------|
```

## Rules

### Strings

The first tab line is **string 1**, the highest-pitched string. Six lines map to
strings 1–6. Pass `{ reversed: true }` if your tab is written low string first.

Line labels (`e|`, `B|`, `D|`…) are optional and ignored for ordering — only the
number of lines matters.

If the tab has fewer lines than the tuning has strings, the lines you gave are
used top-down and a warning is recorded:

```
Section 1: Tab has 2 string line(s) but the tuning has 6; using the first 2
```

### Frets

- `-0-`, `-5-`, `-12-` are frets 0, 5 and 12.
- Multi-digit frets are read as one number, not two beats.
- `-` and `|` are structural. Everything else on a line is ignored, so
  hammer-ons, pull-offs and slides do not break a tab:

```
e|--0h2--5/7--|
```

### Chords

Anything starting on the same column is one beat:

```
e|--0--
B|--1--
```
is the beat `{ 1: 0, 2: 1 }`.

A wider number claims its columns, so a two-digit fret lines up with single
digits beside it:

```
e|--12--
B|---0--
```
These are grouped, because `0` starts inside the columns occupied by `12`.

### Bar lines

A column containing `|` on any line is a bar line. It attaches to the beat that
follows it.

```
e|--0--|--2--|
```
Beat 2 carries `barBefore: true`.

A trailing `|` is kept as the end of the last bar.

### Sections and metadata

| line | effect |
| --- | --- |
| `# Chorus` or `[Chorus]` | names the next tab block |
| blank line | ends the current block (one block = one section) |
| `Title: …` | score title |
| `Artist: …` | score artist |
| `Tuning: DADGAD` | tuning for the whole document |
| `Capo: 2` | read and kept in the source, not applied to pitches |
| anything else | if it is the first non-tab line and short, it becomes the title |

Known tuning names: `standard`, `dropD`, `halfStepDown`, `dadgad`, `openG`,
`openD`, `bass`. Aliases such as `drop d`, `eb standard` and `open g` work too,
and you can spell a tuning out: `Tuning: D2 A2 D3 G3 A3 D4`.

### Annotations

Trailing notes after two or more spaces, or an `x2`/`×2` repeat marker, are
stripped before parsing so they are never mistaken for frets.

```
e|--0--2--3--2--| x2
```

## What it will not do

- **No duration or rhythm beyond columns.** Beat *spacing* is not stored; a beat
  is a beat. Use the transport tempo for playback speed.
- **No ties, slides or bends as data.** The glyphs are tolerated, not interpreted.
- **No capo transposition.** `Capo:` is recorded, not applied.
- **No tabs mixed with lyrics.** A lyric line inside a tab block ends the block.

## API

```js
import { parseAsciiTab, parseTabLines } from 'tabloom';

const score = parseAsciiTab(text, {
  title: 'Song',        // overrides a title found in the text
  artist: '',
  tuning: 'dadgad',     // overrides Tuning: in the text
  reversed: false,      // true if line 1 is the lowest string
  strict: false,        // true to throw on any warning
});

// lower level: one block of lines -> { events, bars, warnings }
const block = parseTabLines(lines, { stringCount: 6 });
```

Warnings are collected rather than thrown so a partially readable tab is still
useful. `parseAsciiTab(text, { strict: true })` turns them into an error.
