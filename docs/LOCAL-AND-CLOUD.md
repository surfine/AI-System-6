# Local and cloud: which track does a capability run on

<!-- doc-claims: verified | audited: 2026-09-18 -->

AI System 6 runs in two places at once, and that is a product decision rather
than an accident of packaging. The desk, your projects and the writing route
are local: they are yours, they work on a plane, and nothing leaves the machine
unless you send it somewhere. The site's shared AI is cloud: it exists so a
fresh desk can do something useful before you have installed a model of your
own.

This document decides which capabilities run where, and what the app is
allowed to do when one track is unavailable.

## The two tracks

**Local.** This Mac, or the browser tab you are in. It owns:

- the desk, its windows, and everything you have written, filed, clipped or
  scraped;
- the project disk, its folders, Project CD items, scraps, references and
  revisions;
- Memory Boundary notes, and anything else the app marks private;
- files on your disk — imports, exports, Project Hard Disk backups, USDZ and
  PNG captures;
- any model you installed yourself (LM Studio, Ollama, the in-browser
  embedder), on whatever port it listens on.

**Cloud.** The site's shared gateway. It owns:

- answers from a hosted model when no local model is configured;
- the hosted embedding and search endpoints the site provides;
- nothing else. It holds no project, no desk state, and no credential of
  yours.

## The rule that decides

Three questions, in this order. The first one that answers yes wins.

1. **Does it need your files?** Then it is local. The desk, the route, the
   project disk, imports and exports never leave the machine to do their job.
2. **Does it need a model you have not installed?** Then it is cloud, and only
   the text of the request travels. A question typed into ClioTalk may be
   answered in the cloud; the project it belongs to may not be uploaded to
   answer it.
3. **Is it long, stateful, or does it need a port?** Then it is local, because
   the cloud is a request-and-answer service, not a place your work waits.

## What the app does today

- A fresh Mac app connects itself to the site's shared AI on first run, so
  the first question a writer asks is answered without installing anything.
  The session token stays in the local store; the bridge is asked only where a
  bridge exists, so a plain browser page never fires that request.
- A local model, when one is running, is preferred for the work it can do, and
  the desk says which engine answered.
- The writing route is complete offline. Generating an outline is the one stop
  that wants a model; without one it says so and leaves the text you typed
  untouched.

## What the next slice owns

1. **One place that states the split.** A single panel that lists the
   capabilities with a model behind them (chat, outline, embeddings, search,
   image generation) and shows, per capability, which track is answering:
   *this Mac*, *the site*, or *off*. Today that fact is spread across status
   lines and a menu.
2. **A switch per capability, not one global switch.** Routing is already
   per-call; the UI should let a writer pin one capability to a track without
   moving the others. Defaults stay as they are: local when a local model is
   configured, the site otherwise.
3. **No silent fallback across the privacy line.** A local failure does not
   quietly become a cloud request. If the local model is gone, the capability
   reports it and offers the cloud as a choice, because sending the text
   somewhere is the writer's decision to make.
4. **A visible health line.** Offline, no model, quota spent, gateway down:
   each says which of those it is, in the place the capability lives, with the
   remedy that applies.

## Invariants

- File contents never travel to answer a question about them. An index built
  from your documents is a local index.
- Credentials stay local, in the same store as the rest of the desk.
- The app is useful with no network at all: every stop of the writing route
  reaches its own surface, and the ones that need a model say so in one
  sentence.

<!-- claim-check: apps/desktop/app/features/cloud-model.js (connectSharedAiOnFirstRun, mac target) | functions/api/capabilities.js -->
