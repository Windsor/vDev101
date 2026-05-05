/**
 * Whodunnit — variant of Imposter where the odd-one-out gets a RELATED word
 * instead of "imposter". Same engine, same flow, different rules.
 *
 * This module exists to prove the framework is extensible: it reuses every
 * primitive (players, phases, votes, tally) and only swaps the role logic.
 */
(function () {
  'use strict';

  // Pairs of related-but-different words. The "odd one" gets the second.
  const WORD_PAIRS = [
    ['Coffee', 'Tea'],
    ['Cat', 'Dog'],
    ['Summer', 'Winter'],
    ['Pizza', 'Burger'],
    ['Movie', 'TV Show'],
    ['Book', 'Magazine'],
    ['Train', 'Bus'],
    ['Beach', 'Mountain'],
    ['Soccer', 'Basketball'],
    ['Pen', 'Pencil'],
    ['Doctor', 'Nurse'],
    ['Sun', 'Moon'],
    ['Apple', 'Orange'],
    ['Guitar', 'Piano'],
    ['Painter', 'Sculptor'],
  ];

  const Whodunnit = {
    id: 'whodunnit',
    name: 'Odd One Out',
    description:
      'One player has a slightly different word. Find them before they blend in.',
    minPlayers: 4,
    maxPlayers: 12,
    initialPhase: 'reveal',

    configSchema: [],

    setup(ctx) {
      const [main, odd] = ctx.randomFrom(WORD_PAIRS);
      const oddOneId = ctx.randomFrom(ctx.players).id;
      return {
        mainWord: main,
        oddWord: odd,
        oddOneId,
        revealIndex: 0,
        revealedFor: [],
        order: ctx.shuffle(ctx.players).map((p) => p.id),
        currentClueGiver: 0,
        clues: [],
        votes: {},
        result: null,
      };
    },

    phases: {
      reveal: {
        render(ctx) {
          const { state, players, escape } = ctx;
          const i = state.revealIndex;
          const player = players[i];
          const revealed = state.revealedFor.includes(player.id);
          const word = player.id === state.oddOneId ? state.oddWord : state.mainWord;

          if (!revealed) {
            return `
              <div class="reveal">
                <p class="muted">Pass the device to</p>
                <h2 class="big-name">${escape(player.name)}</h2>
                <button class="primary big" data-action="show">Tap to reveal your word</button>
              </div>`;
          }
          return `
            <div class="reveal revealed">
              <div class="word-card">
                <span class="label">Your word</span>
                <span class="word">${escape(word)}</span>
                <small>Everyone has a word. One of them is different. Don't out yourself.</small>
              </div>
              <button class="primary big" data-action="next">
                ${i < players.length - 1 ? 'Hide & pass on →' : 'Start clues →'}
              </button>
            </div>`;
        },
        actions: {
          show(ctx) {
            ctx.state.revealedFor.push(ctx.players[ctx.state.revealIndex].id);
          },
          next(ctx) {
            ctx.state.revealIndex += 1;
            if (ctx.state.revealIndex >= ctx.players.length) ctx.goTo('clues');
          },
        },
      },

      clues: {
        render(ctx) {
          const { state, players, escape } = ctx;
          const idx = state.currentClueGiver;
          const cluesList = state.clues
            .map(
              (c) =>
                `<li><strong>${escape(name(players, c.playerId))}:</strong> ${escape(c.text)}</li>`
            )
            .join('');

          if (idx >= state.order.length) {
            return `
              <div class="clues">
                <h3>All clues given</h3>
                <ol class="clue-list">${cluesList}</ol>
                <button class="primary big" data-action="to-vote">Vote →</button>
              </div>`;
          }
          const player = players.find((p) => p.id === state.order[idx]);
          return `
            <div class="clues">
              <p class="muted">Clue ${idx + 1} of ${state.order.length}</p>
              <h2 class="big-name">${escape(player.name)}</h2>
              <form data-action="submit-clue" class="clue-form">
                <input name="text" placeholder="One word…" autocomplete="off" maxlength="30" required />
                <button type="submit">Submit</button>
              </form>
              ${cluesList ? `<ol class="clue-list">${cluesList}</ol>` : ''}
            </div>`;
        },
        actions: {
          'submit-clue'(ctx, payload) {
            ctx.state.clues.push({
              playerId: ctx.state.order[ctx.state.currentClueGiver],
              text: payload.text.trim(),
            });
            ctx.state.currentClueGiver += 1;
          },
          'to-vote'(ctx) {
            ctx.goTo('vote');
          },
        },
      },

      vote: {
        render(ctx) {
          const { state, players, escape } = ctx;
          const voted = Object.keys(state.votes);
          const next = players.find((p) => !voted.includes(p.id));
          if (!next) {
            return `
              <div class="vote">
                <h3>All votes in</h3>
                <button class="primary big" data-action="tally">Reveal →</button>
              </div>`;
          }
          const candidates = players
            .filter((p) => p.id !== next.id)
            .map(
              (p) =>
                `<button class="vote-choice" data-action="cast-vote"
                  data-voter="${next.id}" data-target="${p.id}">${escape(p.name)}</button>`
            )
            .join('');
          return `
            <div class="vote">
              <p class="muted">Pass to</p>
              <h2 class="big-name">${escape(next.name)}</h2>
              <p>Who has a different word?</p>
              <div class="vote-grid">${candidates}</div>
            </div>`;
        },
        actions: {
          'cast-vote'(ctx, payload) {
            ctx.state.votes[payload.voter] = payload.target;
          },
          tally(ctx) {
            const tally = {};
            Object.values(ctx.state.votes).forEach((t) => {
              tally[t] = (tally[t] || 0) + 1;
            });
            const max = Math.max(...Object.values(tally), 0);
            const accused = Object.keys(tally).filter((k) => tally[k] === max);
            const tied = accused.length > 1;
            const caught = !tied && accused[0] === ctx.state.oddOneId;
            ctx.state.result = { tally, accused, tied, caught };
            ctx.goTo('results');
          },
        },
      },

      results: {
        render(ctx) {
          const { state, players, escape } = ctx;
          const r = state.result;
          const oddName = name(players, state.oddOneId);
          const headline = r.tied
            ? '🤝 Tie — odd one slips away!'
            : r.caught
            ? '🎯 Found them!'
            : '🕵️ Odd one wins!';
          const tallyRows = players
            .map((p) => {
              const count = r.tally[p.id] || 0;
              return `
                <li class="${r.accused.includes(p.id) ? 'top' : ''}">
                  <span>${escape(p.name)}</span>
                  <span class="bar" style="--n:${count}"></span>
                  <span class="count">${count}</span>
                </li>`;
            })
            .join('');
          return `
            <div class="results">
              <h2>${headline}</h2>
              <p class="reveal-line">Most had: <strong>${escape(state.mainWord)}</strong></p>
              <p class="reveal-line">
                <strong>${escape(oddName)}</strong> had: <strong>${escape(state.oddWord)}</strong>
              </p>
              <ul class="tally">${tallyRows}</ul>
              <div class="actions-row">
                <button class="primary big" data-action="play-again">Play again</button>
                <button class="link" data-action="quit">Home</button>
              </div>
            </div>`;
        },
        actions: {
          'play-again'(ctx) {
            const fresh = Whodunnit.setup(ctx);
            Object.keys(ctx.state).forEach((k) => delete ctx.state[k]);
            Object.assign(ctx.state, fresh);
            ctx.goTo('reveal');
          },
        },
      },
    },
  };

  function name(players, id) {
    const p = players.find((x) => x.id === id);
    return p ? p.name : '?';
  }

  GameRegistry.register(Whodunnit);
})();
