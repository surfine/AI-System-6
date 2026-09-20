// Can a phone actually play One More Tune — sound by itself, a full round, one
// screen, and the round's own result?
//
//   node tests/e2e/probe-one-more-tune-phone.spec.mjs
//
// Reported from an iPhone: "it used to make a sound, now it does not." Four
// things have to hold on the phone the game is drawn for (402×874), and the
// first two are what a desktop browser cannot see:
//
//   1. The sound starts by itself. The sound *is* the question, so a question
//      must not wait for a Play tap. iOS only lets a gesture unlock audio, so
//      the round's own tap does it and every question after that starts alone.
//   2. A preview WebKit will not decode still plays. `decodeAudioData` refuses
//      these store previews on WebKit/iOS (EncodingError), so the same URL
//      plays through a media element — which the page's own CSP has to allow
//      under media-src, not only connect-src.
//   3. Every face stays inside the screen the phone really has: 874 with the
//      app installed, ~745 in Safari with its bars and the home indicator.
//      Nothing scrolls the page; a long list may scroll inside itself.
//   4. The round result shows all ten answers, its score and its actions
//      without the page moving.
//
// Both engines run: Chromium takes the Web Audio path, WebKit takes the
// media-element path iOS uses.

import { chromium, webkit } from "@playwright/test";
import { repositoryRoot } from "../../tooling/lib/paths.mjs";
import { startAppServer, stopProcess } from "../../tooling/lib/app-preview-server.mjs";
import { bootApp, dismissGuide } from "./helpers.mjs";

const IPHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const INSETS = { "safe-area-top": "59px", "safe-area-bottom": "34px" };
const HEIGHTS = [
  { height: 874, insets: false, label: "874 installed" },
  { height: 874, insets: true, label: "874 with the notch" },
  { height: 780, insets: true, label: "780 one Safari bar" },
  { height: 745, insets: true, label: "745 both bars" },
];

const failures = [];
const check = (condition, message) => {
  console.log(`${condition ? "OK  " : "NO  "} ${message}`);
  if (!condition) failures.push(message);
};

const { child: server, url: baseURL } = await startAppServer(repositoryRoot);

async function openGame(page, { insets = true } = {}) {
  // Safari 16.4 added the audio session a page can declare, and no Playwright
  // engine has it. The stub is only here to watch the page use it: iOS plays
  // Web Audio as ambient sound, which the phone's ring/silent switch mutes,
  // and media elements as playback, which it does not — the one difference
  // between a desk, an iPad and a phone that this game is played on.
  await page.addInitScript(() => {
    const session = { type: "auto" };
    Object.defineProperty(navigator, "audioSession", { configurable: true, get: () => session });
    window.__audioSessionProbe = session;
  });
  if (insets) {
    await page.addInitScript((vars) => {
      document.addEventListener("DOMContentLoaded", () => {
        Object.entries(vars).forEach(([name, value]) => document.documentElement.style.setProperty(`--${name}`, value));
      });
    }, INSETS);
  }
  await bootApp(page);
  await dismissGuide(page);
  await page.evaluate(() => handleAction("open-one-more-tune"));
  await page.waitForSelector('[data-window="oneMoreTune"]:not(.is-hidden)', { timeout: 20_000 });
  await page.locator('[data-one-more-tune-view="challenge"]').click();
  await page.waitForTimeout(400);
}

async function answerEveryQuestion(page) {
  for (let step = 0; step < 12; step += 1) {
    const choice = page.locator("[data-one-more-tune-submit]").first();
    if (!(await choice.count())) break;
    await choice.click().catch(() => {});
    await page.waitForTimeout(500);
    const next = page.locator('[data-one-more-tune-command="one-more-tune-round-next"]');
    if (await next.count()) {
      await next.first().click().catch(() => {});
      await page.waitForTimeout(700);
    }
  }
}

async function geometry(page) {
  return page.evaluate(() => {
    const win = document.querySelector('[data-window="oneMoreTune"]');
    const pad = parseFloat(getComputedStyle(win).paddingBottom) || 0;
    const limit = window.innerHeight - pad;
    // Window chrome (the resize corner) is not a control of this game.
    const clipped = [...win.querySelectorAll("button, .choice, li")]
      .filter((el) => el.getBoundingClientRect().height > 0 && !el.classList.contains("grow-box"))
      .filter((el) => el.getBoundingClientRect().bottom > limit + 1)
      .map((el) => el.textContent.trim().replace(/\s+/g, " ").slice(0, 20) || el.tagName.toLowerCase());
    const list = win.querySelector(".one-more-tune-review-list");
    return {
      pageScroll: document.scrollingElement.scrollHeight - window.innerHeight,
      clipped,
      reviewRows: list ? list.querySelectorAll("li").length : 0,
      reviewScroll: list ? list.scrollHeight - list.clientHeight : 0,
    };
  });
}

try {
  for (const [engine, launcher] of [["chromium", chromium], ["webkit", webkit]]) {
    for (const { height, insets, label } of HEIGHTS) {
      const browser = await launcher.launch(engine === "chromium" ? { args: ["--autoplay-policy=no-user-gesture-required"] } : {});
      const context = await browser.newContext({
        baseURL,
        viewport: { width: 402, height },
        deviceScaleFactor: 3,
        isMobile: true,
        hasTouch: true,
        userAgent: IPHONE_UA,
      });
      const page = await context.newPage();
      await openGame(page, { insets });
      await page.locator('[data-one-more-tune-command="one-more-tune-start-round"]').click();
      await page.waitForTimeout(3_500);

        const round = await page.evaluate(() => ({
          contextState: oneMoreTuneAudio.context?.state || "(none)",
          buffers: oneMoreTuneAudio.buffers.size,
          elements: oneMoreTuneAudio.elements.size,
          playing: oneMoreTuneAudio.playingCardId,
          heard: oneMoreTuneQuestion()?.heard || 0,
          autoPlayed: oneMoreTuneQuestion()?.autoPlayed === true,
          mediaFailed: oneMoreTuneQuestion()?.mediaFailed === true,
        }));
        check(
          round.playing !== "" && round.heard > 0 && round.mediaFailed === false && round.autoPlayed,
          `${engine} ${label}: the first question sounds by itself (playing=${round.playing || "none"}, buffers=${round.buffers}, elements=${round.elements}, heard=${round.heard})`,
        );
        const session = await page.evaluate(() => window.__audioSessionProbe?.type || "(no session api)");
        check(
          session === "playback",
          `${engine} ${label}: the page declares a playback session, so the phone's ring switch cannot silence it (${session})`,
        );

      const first = await geometry(page);
      check(first.pageScroll <= 0, `${engine} ${label}: the round does not scroll the page (${first.pageScroll}px)`);
      check(first.clipped.length === 0, `${engine} ${label}: every control is on screen (${first.clipped.join(", ") || "clear"})`);

      if (height === 745) {
        // The next question has to start alone too: the tap that starts a round
        // is what unlocked the audio, and nothing else may be needed.
        await page.locator("[data-one-more-tune-submit]").first().click().catch(() => {});
        await page.waitForTimeout(600);
        const next = page.locator('[data-one-more-tune-command="one-more-tune-round-next"]');
        if (await next.count()) {
          await next.first().click();
          await page.waitForTimeout(3_500);
        }
        const second = await page.evaluate(() => ({
          playing: oneMoreTuneAudio.playingCardId,
          heard: oneMoreTuneQuestion()?.heard || 0,
          mediaFailed: oneMoreTuneQuestion()?.mediaFailed === true,
        }));
        check(
          second.playing !== "" && second.heard > 0 && !second.mediaFailed,
          `${engine} ${label}: the second question sounds by itself too (playing=${second.playing || "none"})`,
        );

        await answerEveryQuestion(page);
        const result = await geometry(page);
        check(result.reviewRows === 10, `${engine} ${label}: the result lists ten answers (${result.reviewRows})`);
        check(result.pageScroll <= 0, `${engine} ${label}: the result page does not scroll (${result.pageScroll}px)`);
        check(result.clipped.length === 0, `${engine} ${label}: the score and every action stay on screen (${result.clipped.join(", ") || "clear"})`);
        check(
          result.reviewScroll <= 60,
          `${engine} ${label}: the ten answers fit the screen with at most a nudge (${result.reviewScroll}px inside the list)`,
        );
      }

      if (height === 874 && !insets) {
        // The film window on the phone: the app page takes the screen, and the
        // 16:9 stage stays inside it with the page itself unmoved.
        let opened = false;
        for (let attempt = 0; attempt < 10 && !opened; attempt += 1) {
          const button = page.locator('[data-one-more-tune-command="one-more-tune-play-film"]').first();
          if (await button.count()) {
            await button.click().catch(() => {});
            await page.waitForTimeout(2_000);
            opened = await page.evaluate(() => {
              const win = document.querySelector('[data-window="oneMoreTuneFilm"]');
              return !!win && !win.classList.contains("is-hidden");
            });
            break;
          }
          // The film button is on the reveal, so the answer comes first and the
          // look happens after it.
          const answer = page.locator("[data-one-more-tune-submit]").first();
          if (await answer.count()) {
            await answer.click().catch(() => {});
            await page.waitForTimeout(1_000);
            continue;
          }
          const next = page.locator('[data-one-more-tune-command="one-more-tune-round-next"]').first();
          if (await next.count()) { await next.click().catch(() => {}); await page.waitForTimeout(900); }
          else break;
        }
        const phoneFilm = await page.evaluate(() => {
          const win = document.querySelector('[data-window="oneMoreTuneFilm"]');
          if (!win || win.classList.contains("is-hidden")) return null;
          const stage = win.querySelector(".one-more-tune-film-stage").getBoundingClientRect();
          return {
            stageBottom: Math.round(stage.bottom),
            viewport: window.innerHeight,
            scroll: document.scrollingElement.scrollHeight - window.innerHeight,
            width: Math.round(win.getBoundingClientRect().width),
          };
        });
        check(!!phoneFilm && phoneFilm.stageBottom <= phoneFilm.viewport && phoneFilm.scroll <= 0,
          `${engine} ${label}: the film window fits the phone screen (${phoneFilm ? `${phoneFilm.stageBottom}px stage bottom of ${phoneFilm.viewport}, ${phoneFilm.scroll}px scroll` : "never opened"})`);
        if (phoneFilm) await page.locator('[data-window="oneMoreTuneFilm"] .close-box').click().catch(() => {});
      }
      await context.close();
      await browser.close();
    }
  }

  // A study card sounds itself in both engines: Web Audio where the context can
  // decode the store preview, the media element where WebKit cannot — which is
  // the path an iPhone takes, and the one that has to make a sound.
  for (const [engine, launcher] of [["chromium", chromium], ["webkit", webkit]]) {
    const browser = await launcher.launch(engine === "chromium" ? { args: ["--autoplay-policy=no-user-gesture-required"] } : {});
    const context = await browser.newContext({
      baseURL,
      viewport: { width: 402, height: 874 },
      deviceScaleFactor: 3,
      isMobile: true,
      hasTouch: true,
      userAgent: IPHONE_UA,
    });
    const page = await context.newPage();
    await bootApp(page);
    await dismissGuide(page);
    await page.evaluate(() => handleAction("open-one-more-tune"));
    await page.waitForSelector('[data-window="oneMoreTune"]:not(.is-hidden)', { timeout: 20_000 });
    await page.waitForTimeout(1_200);
    // Entered the way a person does: the Study tab, then a unit — that tap is
    // what unlocks the audio the card then plays on its own.
    await page.locator('[data-one-more-tune-view="study"]').click();
    await page.waitForTimeout(400);
    await page.locator("[data-one-more-tune-open-unit]").first().click();
    await page.waitForTimeout(3_500);
    const card = await page.evaluate(() => ({
      step: window.AISystem6OneMoreTune.session()?.step,
      autoPlayed: window.AISystem6OneMoreTune.session()?.autoPlayed === true,
      playing: oneMoreTuneAudio.playingCardId,
      buffers: oneMoreTuneAudio.buffers.size,
      elements: oneMoreTuneAudio.elements.size,
      status: (document.querySelector("#status")?.textContent || "").slice(0, 40),
    }));
    check(card.autoPlayed && card.playing.startsWith("study-"),
      `${engine}: a study card sounds by itself (${card.step}, playing=${card.playing || "none"}, buffers=${card.buffers}, elements=${card.elements}, status=${card.status})`);
    await page.locator('[data-one-more-tune-command="one-more-tune-next"]').first().click().catch(() => {});
    await page.waitForTimeout(3_500);
    const next = await page.evaluate(() => ({
      index: window.AISystem6OneMoreTune.session()?.index,
      playing: oneMoreTuneAudio.playingCardId,
    }));
    check(next.index === 1 && next.playing.startsWith("study-"),
      `${engine}: and the next card sounds by itself too (playing=${next.playing || "none"})`);
    await context.close();
    await browser.close();
  }

  // The round's commands live in the menu bar, the two keys work, and the face
  // uses the window it is given instead of stopping short of the bottom.
  {
    const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
    const context = await browser.newContext({ baseURL, viewport: { width: 1680, height: 1000 } });
    const page = await context.newPage();
    await bootApp(page);
    await dismissGuide(page);
    await page.evaluate(() => handleAction("open-one-more-tune"));
    await page.waitForSelector('[data-window="oneMoreTune"]:not(.is-hidden)', { timeout: 20_000 });
    await page.evaluate(() => maximizeWindow(getWindow("oneMoreTune")));
    await page.locator('[data-one-more-tune-view="challenge"]').click();
    await page.waitForTimeout(400);
    await page.locator('[data-one-more-tune-command="one-more-tune-start-round"]').click();
    await page.waitForTimeout(3_000);

    const face = await page.evaluate(() => {
      const win = document.querySelector('[data-window="oneMoreTune"]');
      const pane = win.querySelector(".one-more-tune-pane");
      const question = win.querySelector(".one-more-tune-step-challenge");
      const buttons = [...win.querySelectorAll(".one-more-tune-step-challenge button")];
      return {
        paneScroll: pane.scrollHeight - pane.clientHeight,
        gapBelow: Math.round(win.getBoundingClientRect().bottom - question.getBoundingClientRect().bottom),
        faceWidth: Math.round(question.getBoundingClientRect().width),
        controls: buttons.length,
      };
    });
    check(face.paneScroll === 0 && face.gapBelow <= 30,
      `the question face fills the window it was given (${face.paneScroll}px of scroll, ${face.gapBelow}px below it)`);
    check(face.faceWidth <= 1121, `and the content frame stops growing at a readable width (${face.faceWidth}px)`);
    check(face.controls === 5, `the face carries the player and four answers, nothing else (${face.controls})`);

    // The composition, not just the box: a face that fills the window and dumps
    // its content against the top edge is the emptiness this pass is here to
    // remove, and a box-shaped check cannot see it.
    const room = await page.evaluate(() => {
      const win = document.querySelector('[data-window="oneMoreTune"]');
      const face = win.querySelector(".one-more-tune-step-challenge");
      const ask = win.querySelector(".one-more-tune-ask");
      const question = ask.querySelector(".questionlabel");
      const answers = ask.querySelector(".choices");
      const last = answers.lastElementChild;
      const faceTop = face.getBoundingClientRect().top;
      const faceBottom = face.getBoundingClientRect().bottom;
      return {
        above: Math.round(question.getBoundingClientRect().top - faceTop),
        below: Math.round(faceBottom - last.getBoundingClientRect().bottom),
      };
    });
    check(Math.abs(room.above - room.below) <= 140,
      `and the air is spread around the round, not dumped below it (${room.above}px above, ${room.below}px below)`);

    // The Study menu is where the round's commands went.
    await page.click('button[data-i18n="one_more_tune_menu_study"]');
    await page.waitForTimeout(300);
    check(await page.locator('[data-action="one-more-tune-round-skip"]').isVisible(),
      "the Study menu carries the skip the face used to carry");
    await page.click('[data-action="one-more-tune-round-skip"]');
    await page.waitForTimeout(1_500);
    check(await page.evaluate(() => oneMoreTuneQuestion()?.outcome === "skipped"),
      "and skipping from the menu scores the same as the button did");

    // Return takes the next question; Space plays the cue — both from the same
    // commands the menu uses, and only while this window has the focus.
    const beforeKey = await page.evaluate(() => oneMoreTuneRound.index);
    await page.keyboard.press("Enter");
    await page.waitForTimeout(1_200);
    check(await page.evaluate(() => oneMoreTuneRound.index) === beforeKey + 1, "Return takes the next question");
    const heardBefore = await page.evaluate(() => oneMoreTuneQuestion()?.heard || 0);
    await page.keyboard.press(" ");
    await page.waitForTimeout(3_000);
    const heardAfter = await page.evaluate(() => oneMoreTuneQuestion()?.heard || 0);
    check(heardAfter > heardBefore, `Space plays the cue (${heardBefore} → ${heardAfter})`);

    // "Watch it here" opens the original in a window of its own — centered, with
    // the desk's own chrome — instead of pasting a 16:9 player into the answer
    // card. Closing that window has to stop the film: a video playing behind a
    // closed window is sound with nothing on screen to stop it.
    let film = null;
    for (let attempt = 0; attempt < 10 && !film; attempt += 1) {
      const button = page.locator('[data-one-more-tune-command="one-more-tune-play-film"]').first();
      if (await button.count()) {
        const inline = await page.evaluate(() => !!document.querySelector('[data-window="oneMoreTune"] #one-more-tune-film'));
        check(!inline, "the reveal embeds no player of its own");
        await button.click();
        await page.waitForTimeout(2_500);
        film = await page.evaluate(() => {
          const win = document.querySelector('[data-window="oneMoreTuneFilm"]');
          if (!win || win.classList.contains("is-hidden")) return null;
          const rect = win.getBoundingClientRect();
          const desktop = document.querySelector(".desktop").getBoundingClientRect();
          const frame = win.querySelector(".one-more-tune-film-stage iframe");
          return {
            centerX: Math.round((rect.left + rect.right) / 2 - (desktop.left + desktop.right) / 2),
            centerY: Math.round((rect.top + rect.bottom) / 2 - (desktop.top + desktop.bottom) / 2),
            title: win.querySelector(".title-bar h1, .title-bar h2")?.textContent || "",
            src: frame ? frame.getAttribute("src") || "" : "",
            active: document.querySelector(".window.is-active")?.dataset.window || "",
          };
        });
        break;
      }
      // Answer, then look: the reveal — where the film button lives — is only
      // on screen between the answer and the next question.
      const answer = page.locator("[data-one-more-tune-submit]").first();
      if (await answer.count()) {
        await answer.click().catch(() => {});
        await page.waitForTimeout(1_200);
        continue;
      }
      const next = page.locator('[data-one-more-tune-command="one-more-tune-round-next"]').first();
      if (await next.count()) {
        await next.click().catch(() => {});
        await page.waitForTimeout(900);
      } else {
        break;
      }
    }
    check(!!film, "a card with an original has a way to watch it");
    if (film) {
      check(film.src.startsWith("https://www.youtube-nocookie.com/embed/"),
        `and it opens the privacy-enhanced embed in a window of its own (${film.src.slice(0, 46)})`);
      check(film.title.trim() !== "", `whose title names the film (${film.title})`);
      check(film.active === "oneMoreTuneFilm", "and which comes to the front when it opens");
      check(Math.abs(film.centerX) <= 140 && Math.abs(film.centerY) <= 140,
        `centered on the work area (${film.centerX}px, ${film.centerY}px off)`);
      await page.locator('[data-window="oneMoreTuneFilm"] .close-box').click();
      await page.waitForTimeout(1_000);
      const closed = await page.evaluate(() => {
        const win = document.querySelector('[data-window="oneMoreTuneFilm"]');
        return { hidden: win.classList.contains("is-hidden"), frame: !!win.querySelector("iframe") };
      });
      check(closed.hidden && !closed.frame, "and closing it takes the film down with it");
    }


    await context.close();
    await browser.close();
  }

  // "Find the song on Apple Music" has to land on Apple Music. Apple answers a
  // search at the storefront it resolves the reader to and bounces every other
  // storefront to that storefront's home page, so this checks the link against
  // the reader's own language — a zh-CN reader, which is the case the hard-coded
  // /us/ broke.
  {
    const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
    const context = await browser.newContext({ baseURL, viewport: { width: 1440, height: 900 }, locale: "zh-CN", timezoneId: "Asia/Shanghai" });
    const page = await context.newPage();
    await bootApp(page);
    await dismissGuide(page);
    await page.evaluate(() => handleAction("open-one-more-tune"));
    await page.waitForSelector('[data-window="oneMoreTune"]:not(.is-hidden)', { timeout: 20_000 });
    await page.locator('[data-one-more-tune-view="challenge"]').click();
    await page.waitForTimeout(400);
    await page.locator('[data-one-more-tune-command="one-more-tune-start-round"]').click();
    await page.waitForTimeout(2_500);
    await page.locator("[data-one-more-tune-submit]").first().click();
    await page.waitForTimeout(1_500);

    const listen = page.locator('.one-more-tune-plain-links a[data-one-more-tune-listen]').first();
    const initial = await listen.getAttribute("href");
    check(/^https:\/\/music\.apple\.com\/[a-z]{2}\//.test(initial || ""),
      `the listen link names a storefront, not a fixed one (${initial})`);
    // The face paints with the search and upgrades to the recording's own store
    // page when Apple's catalogue answers. A search URL is not a way into the
    // Music app — macOS opens an empty Search pane — so the store page is the
    // outcome this waits for, and a card the catalogue cannot name keeps the
    // search with its own label rather than pretending otherwise.
    let upgraded = initial;
    for (let attempt = 0; attempt < 20 && !/\/album\//.test(upgraded || ""); attempt += 1) {
      await page.waitForTimeout(400);
      upgraded = await listen.getAttribute("href");
    }
    const label = (await listen.textContent())?.trim();
    if (/\/album\//.test(upgraded || "")) {
      check(/^https:\/\/music\.apple\.com\/[a-z]{2}\/album\/[^?]+\?i=\d+/.test(upgraded || ""),
        `the reveal link became the recording's own store page (${upgraded})`);
      check(!/uo=/.test(upgraded || ""), "without Apple's tracking parameter");
      check(label && /whole song|完整/i.test(label), `and it says so (${label})`);
      const [landing] = await Promise.all([context.waitForEvent("page"), listen.click()]);
      await landing.waitForLoadState("domcontentloaded").catch(() => {});
      await landing.waitForTimeout(2_500);
      const landed = landing.url();
      check(/music\.apple\.com\/[a-z]{2}\/(album|song)\//.test(landed),
        `and following it lands on that store item, not the storefront home (${landed})`);
    } else {
      check(/\/search\?term=/.test(upgraded || ""), `an unnamed recording keeps the search link (${upgraded})`);
      check(label && /Apple Music/i.test(label), `and keeps saying it is a search (${label})`);
    }
    await context.close();
    await browser.close();
  }

  // The reveal dresses the desk in the card's era — and gives the writer's own
  // Appearance back when the window closes. A desk-sized window, because this
  // one is about the whole desk rather than one face.
  {
    const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
    const context = await browser.newContext({ baseURL, viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    await bootApp(page);
    await dismissGuide(page);
    const before = await page.evaluate(() => ({
      committed: window.AISystem6Theme.getCommittedTheme(),
      body: document.body.dataset.theme,
      recorded: settingsSnapshotPayload().theme,
    }));
    check(before.committed === before.body && before.recorded === before.committed,
      `the desk opens in the writer's own Appearance (${before.committed})`);

    await page.evaluate(() => handleAction("open-one-more-tune"));
    await page.waitForSelector('[data-window="oneMoreTune"]:not(.is-hidden)', { timeout: 20_000 });
    await page.locator('[data-one-more-tune-view="challenge"]').click();
    await page.waitForTimeout(400);
    await page.locator('[data-one-more-tune-command="one-more-tune-start-round"]').click();
    await page.waitForTimeout(3_000);
    await page.locator("[data-one-more-tune-submit]").first().click();
    await page.waitForTimeout(1_500);

    const revealed = await page.evaluate(() => {
      const reveal = oneMoreTuneQuestion()?.reveal || {};
      const card = window.AISystem6OneMoreTune.allCards()
        .find((entry) => entry.song === reveal.song && entry.artist === reveal.artist) || null;
      return {
        song: reveal.song || "",
        year: card?.year ?? null,
        era: card ? window.AISystem6OneMoreTune.eraFor(card.id) : { theme: "", name: "" },
        body: document.body.dataset.theme,
        current: window.AISystem6Theme.getCurrentTheme(),
        committed: window.AISystem6Theme.getCommittedTheme(),
        recorded: settingsSnapshotPayload().theme,
      };
    });
    if (revealed.era.theme) {
      check(revealed.body === revealed.era.theme,
        `the reveal put the desk in ${revealed.era.name || revealed.era.theme} (${revealed.year}) — ${revealed.body}`);
    } else {
      check(revealed.body === before.committed,
        `a card with no year (${revealed.song}) left the desk where it was — ${revealed.body}`);
    }
    check(revealed.committed === before.committed,
      `the writer's own Appearance did not move (${revealed.committed})`);
    check(revealed.recorded === before.committed,
      `and the desk record still stores it, not the visit (${revealed.recorded})`);

    await page.evaluate(() => closeWindow("oneMoreTune", true));
    await page.waitForTimeout(600);
    const closed = await page.evaluate(() => ({
      body: document.body.dataset.theme,
      committed: window.AISystem6Theme.getCommittedTheme(),
      recorded: settingsSnapshotPayload().theme,
    }));
    check(closed.body === before.committed && closed.recorded === before.committed,
      `closing the window gave the Appearance back (${closed.body})`);
    await context.close();
    await browser.close();
  }

  // A preview WebKit refuses in decodeAudioData still has to sound, through the
  // media element the CSP now allows.
  {
    const browser = await webkit.launch();
    const context = await browser.newContext({
      baseURL,
      viewport: { width: 402, height: 874 },
      deviceScaleFactor: 3,
      isMobile: true,
      hasTouch: true,
      userAgent: IPHONE_UA,
    });
    const page = await context.newPage();
    await openGame(page);
    await page.evaluate(() => {
      window.__decodeRefused = 0;
      const proto = window.AudioContext.prototype;
      proto.decodeAudioData = function decodeAudioData() {
        window.__decodeRefused += 1;
        return Promise.reject(new Error("probe: decode refused"));
      };
    });
    await page.locator('[data-one-more-tune-command="one-more-tune-start-round"]').click();
    await page.waitForTimeout(5_000);
    const fallback = await page.evaluate(() => ({
      refused: window.__decodeRefused,
      elements: oneMoreTuneAudio.elements.size,
      playing: oneMoreTuneAudio.playingCardId,
      paused: oneMoreTuneAudio.gate ? oneMoreTuneAudio.gate.paused : null,
      muted: oneMoreTuneAudio.gate ? oneMoreTuneAudio.gate.muted : null,
      heard: oneMoreTuneQuestion()?.heard || 0,
      status: (document.querySelector("#status")?.textContent || "").slice(0, 60),
    }));
    check(fallback.elements > 0, `webkit: a refused preview loads as a media element (${fallback.elements})`);
    check(fallback.playing !== "" && fallback.heard > 0, `webkit: and that element is what plays the question (${fallback.playing || "none"})`);
    check(fallback.muted === false && fallback.paused === false, `webkit: the element is unmuted and running (muted=${fallback.muted}, paused=${fallback.paused})`);
    await context.close();
    await browser.close();
  }

  // An answer the round refuses is not a wrong answer.
  //
  // Reported from a shared set: question two came back as an empty card under
  // the verdict "not that one" — the round had gone away and the page scored the
  // player for it. The face has to say what happened, and the same answer has to
  // be able to go out again. The refusal is injected at the service boundary the
  // window really uses — its own fetch, since the capability bag is frozen — so
  // this is the shipped path and not a stand-in.
  {
    const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
    const context = await browser.newContext({
      baseURL,
      viewport: { width: 402, height: 874 },
      deviceScaleFactor: 3,
      isMobile: true,
      hasTouch: true,
      userAgent: IPHONE_UA,
    });
    const page = await context.newPage();
    await openGame(page);
    await page.locator('[data-one-more-tune-command="one-more-tune-start-round"]').click();
    await page.waitForTimeout(2_500);
    await page.evaluate(() => {
      const realFetch = window.fetch.bind(window);
      window.__omtRefuseAnswers = true;
      window.fetch = (input, init) => {
        const target = typeof input === "string" ? input : String(input?.url || "");
        if (window.__omtRefuseAnswers && target.includes("/api/one-more-tune/answer")) {
          return Promise.resolve(new Response("{\"error\":\"probe: that round is gone\"}", {
            status: 404,
            headers: { "Content-Type": "application/json" },
          }));
        }
        return realFetch(input, init);
      };
    });
    await page.locator("[data-one-more-tune-submit]").first().click().catch(() => {});
    await page.waitForTimeout(900);
    const refused = await page.evaluate(() => ({
      failed: oneMoreTuneQuestion()?.answerFailed === true,
      reveal: oneMoreTuneQuestion()?.reveal,
      points: oneMoreTuneQuestion()?.points,
      text: document.querySelector('[data-window="oneMoreTune"]').innerText,
      retry: !!document.querySelector('[data-one-more-tune-command="one-more-tune-answer-retry"]'),
      scroll: document.scrollingElement.scrollHeight - window.innerHeight,
    }));
    check(refused.failed && !refused.reveal && refused.points === 0,
      "chromium: an answer the round refuses holds no reveal and no score");
    check(!/不是这个|Not that one/.test(refused.text),
      "and the face never calls it a wrong answer");
    check(refused.retry, "it offers the retry in the place the answer was given");
    check(refused.scroll <= 0, `and the refused face fits the screen (${refused.scroll}px)`);
    await page.evaluate(() => { window.__omtRefuseAnswers = false; });
    await page.locator('[data-one-more-tune-command="one-more-tune-answer-retry"]').click();
    await page.waitForTimeout(1_500);
    const retried = await page.evaluate(() => ({
      song: oneMoreTuneQuestion()?.reveal?.song || "",
      failed: oneMoreTuneQuestion()?.answerFailed === true,
      scroll: document.scrollingElement.scrollHeight - window.innerHeight,
    }));
    check(retried.song !== "" && !retried.failed,
      `the retry sends the same answer again and the reveal opens (${retried.song || "nothing"})`);
    check(retried.scroll <= 0, `and the reveal fits the screen too (${retried.scroll}px)`);
    await context.close();
    await browser.close();
  }

  // A game played by ear has to make a sound anywhere.
  //
  // Every question's sound is a store preview fetched straight from Apple's CDN.
  // A network that cannot reach it — the reason a reader's phone is silent while
  // the desk's own browser is not — must still hear the question. The probe
  // stands in for that network by refusing the direct host, then plays a round:
  // the sound has to arrive through this host relaying the same pinned file.
  for (const [engine, launcher] of [["chromium", chromium], ["webkit", webkit]]) {
    const browser = await launcher.launch(engine === "chromium" ? { args: ["--autoplay-policy=no-user-gesture-required"] } : {});
    const context = await browser.newContext({
      baseURL,
      viewport: { width: 402, height: 874 },
      deviceScaleFactor: 3,
      isMobile: true,
      hasTouch: true,
      userAgent: IPHONE_UA,
    });
    const page = await context.newPage();
    await bootApp(page);
    await dismissGuide(page);
    await page.evaluate(() => handleAction("open-one-more-tune"));
    await page.waitForSelector('[data-window="oneMoreTune"]:not(.is-hidden)', { timeout: 20_000 });
    await page.evaluate(() => {
      // The blocked network, from the page's point of view: Apple's CDN never
      // answers, everything else does.
      const real = window.fetch.bind(window);
      window.__omtBlockedApple = 0;
      window.fetch = (input, init) => {
        const target = typeof input === "string" ? input : String(input?.url || "");
        if (target.includes("audio-ssl.itunes.apple.com")) {
          window.__omtBlockedApple += 1;
          return Promise.reject(new TypeError("probe: cannot reach the store's CDN"));
        }
        return real(input, init);
      };
    });
    await page.locator('[data-one-more-tune-view="challenge"]').click();
    await page.waitForTimeout(300);
    await page.locator('[data-one-more-tune-command="one-more-tune-start-round"]').click();
    await page.waitForTimeout(6_000);
    const relayed = await page.evaluate(() => ({
      blocked: window.__omtBlockedApple,
      heard: oneMoreTuneQuestion()?.heard || 0,
      mediaFailed: oneMoreTuneQuestion()?.mediaFailed === true,
      playing: oneMoreTuneAudio.playingCardId || "",
      relayedElement: [...oneMoreTuneAudio.elements.values()].some((value) => String(value).includes("/api/one-more-tune/preview?url=")),
    }));
    check(relayed.blocked > 0, `${engine}: the store's CDN was refused, as a blocked network would`);
    check(relayed.playing !== "" && relayed.heard > 0 && !relayed.mediaFailed,
      `${engine}: the question still sounds, through this host (playing=${relayed.playing || "none"}, heard=${relayed.heard}, relayedElement=${relayed.relayedElement})`);
    await context.close();
    await browser.close();
  }

  // Six appearances, one window: each era has to reach the parts this deck
  // draws. Two things are checked, because they are the two that were wrong:
  // the player's small print has to stay legible on the stage the *appearance*
  // paints (Aqua and Liquid Glass had ink on ink), and the four answers have to
  // be drawn as the era's own control rather than one flat panel with pinstripes.
  {
    const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
    const context = await browser.newContext({
      baseURL,
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 2,
    });
    const page = await context.newPage();
    await bootApp(page);
    await dismissGuide(page);
    await page.evaluate(() => handleAction("open-one-more-tune"));
    await page.waitForSelector('[data-window="oneMoreTune"]:not(.is-hidden)', { timeout: 20_000 });
    await page.locator('[data-one-more-tune-view="challenge"]').click();
    await page.waitForTimeout(400);
    await page.locator('[data-one-more-tune-command="one-more-tune-start-round"]').click();
    await page.waitForTimeout(2_500);

    const signatures = new Map();
    for (const theme of ["classic", "platinum", "aqua", "snow-leopard", "yosemite", "liquid-glass"]) {
      await page.evaluate((t) => window.AISystem6Theme.applyTheme(t, { persist: false, announce: false }), theme);
      await page.waitForTimeout(500);
      const look = await page.evaluate(() => {
        // WCAG relative luminance, on the colours actually painted.
        const parse = (value) => {
          const nums = String(value).match(/[\d.]+/g) || [];
          const [r, g, b, a = "1"] = nums.map(Number);
          return { r, g, b, a };
        };
        const channel = (value) => {
          const c = value / 255;
          return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
        };
        const over = (fg, bg) => {
          const a = fg.a ?? 1;
          return { r: fg.r * a + bg.r * (1 - a), g: fg.g * a + bg.g * (1 - a), b: fg.b * a + bg.b * (1 - a) };
        };
        const luminance = (colour) => 0.2126 * channel(colour.r) + 0.7152 * channel(colour.g) + 0.0722 * channel(colour.b);
        const contrast = (fg, bg) => {
          const front = over(parse(fg), parse(bg));
          const back = parse(bg);
          const [light, dark] = [luminance(front), luminance(back)].sort((a, b) => b - a);
          return (light + 0.05) / (dark + 0.05);
        };
        // Aqua and Snow Leopard paint a button with a gradient, and a gradient
        // leaves backgroundColor transparent — reading that as "black" would
        // report ink on ink for two appearances that are perfectly legible. The
        // fill the era declares is the gradient's own first colour stop.
        const fillOf = (background, backgroundImage) => {
          if (background && background !== "rgba(0, 0, 0, 0)" && background !== "transparent") return background;
          const first = /(rgb\([^)]*\)|#[0-9a-f]{3,8})/i.exec(backgroundImage || "");
          return first ? first[1] : background || "rgb(255, 255, 255)";
        };
        const win = document.querySelector('[data-window="oneMoreTune"]');
        const stage = win.querySelector(".darkplayer");
        const head = win.querySelector(".playerhead");
        const foot = win.querySelector(".playerfoot");
        const choice = win.querySelector(".choice");
        const tab = win.querySelector(".one-more-tune-tabs .system-tab:not(.is-active)");
        const stageBg = getComputedStyle(stage).backgroundColor;
        const choiceStyle = getComputedStyle(choice);
        return {
          theme: document.body.dataset.theme,
          stageContrast: Math.min(contrast(getComputedStyle(head).color, stageBg), contrast(getComputedStyle(foot).color, stageBg)),
          tabCap: getComputedStyle(tab, "::before").width,
          choiceContrast: contrast(choiceStyle.color, fillOf(choiceStyle.backgroundColor, choiceStyle.backgroundImage)),
          choiceSignature: [choiceStyle.backgroundImage.slice(0, 40), choiceStyle.backgroundColor, choiceStyle.borderColor, choiceStyle.borderTopLeftRadius, choiceStyle.boxShadow.slice(0, 40)].join("|"),
        };
      });
      signatures.set(theme, look.choiceSignature);
      check(look.stageContrast >= 4.5,
        `${theme}: the player's small print is legible on the stage (${look.stageContrast.toFixed(1)}:1)`);
      check(look.choiceContrast >= 4.5,
        `${theme}: an answer's label is legible on its own fill (${look.choiceContrast.toFixed(1)}:1)`);
      check(look.tabCap === "0px",
        `${theme}: the tab strip paints no era end cap (${look.tabCap})`);
    }
    check(new Set(signatures.values()).size === 6,
      `each of the six appearances draws the answers as its own control (${new Set(signatures.values()).size} distinct)`);

    // The reveal keeps the question's own columns: the way onward is given in
    // the same column the answers were, not across the window from them.
    await page.evaluate(() => window.AISystem6Theme.applyTheme("yosemite", { persist: false, announce: false }));
    await page.waitForTimeout(400);
    await page.locator("[data-one-more-tune-submit]").first().click().catch(() => {});
    await page.waitForTimeout(1_400);
    const reveal = await page.evaluate(() => {
      const win = document.querySelector('[data-window="oneMoreTune"]');
      const next = win.querySelector('[data-one-more-tune-command="one-more-tune-round-next"]');
      const record = win.querySelector(".revealbox");
      const stage = win.querySelector(".darkplayer");
      return {
        nextX: next ? Math.round(next.getBoundingClientRect().x) : null,
        recordX: record ? Math.round(record.getBoundingClientRect().x) : null,
        stageX: stage ? Math.round(stage.getBoundingClientRect().x) : null,
        hasPlayAgain: !!win.querySelector('[data-one-more-tune-command="one-more-tune-play-again"]'),
      };
    });
    check(reveal.nextX !== null && reveal.nextX === reveal.recordX,
      `the reveal's way onward sits in the record's own column (${reveal.nextX} vs ${reveal.recordX})`);
    check(reveal.stageX !== null && reveal.stageX < reveal.recordX,
      "with the stage still on the listening side");
    check(!reveal.hasPlayAgain,
      "and another round is not offered mid-round — that belongs to the end of one");
    await context.close();
    await browser.close();
  }

  console.log(failures.length ? `PROBLEM:\n${failures.join("\n")}` : "probe: a phone plays the game, hears it, and sees every face");
  if (failures.length) process.exitCode = 1;
} finally {
  stopProcess(server);
}
