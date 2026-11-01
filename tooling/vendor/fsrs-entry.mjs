// The spaced-repetition scheduler, bundled for the study window.
//
// ts-fsrs is the one third-party library this desk's learning side depends on,
// and it is the library the design names: the four buttons show what
// `repeat()` computes and a commit stores what `next()` returns. Nothing here
// is re-exported "just in case" — the entry lists exactly the surface the
// window uses, so the bundle cannot grow without this file changing.

export { fsrs, createEmptyCard, Rating, State, generatorParameters } from "ts-fsrs";
