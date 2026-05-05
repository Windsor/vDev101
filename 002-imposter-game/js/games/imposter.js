/**
 * Imposter Who? — pass-and-play social deduction word game.
 *
 * Flow:
 *   reveal → clues → vote → results
 *
 * State shape:
 *   { secret, category, imposterIds[], revealIndex, currentClueGiver,
 *     votes: {voterId: targetId}, revealedFor: Set<id> }
 */
(function () {
  'use strict';

  const Imposter = {
    id: 'imposter',
    name: 'Imposter Who?',
    description:
      "All players see the same secret word — except one. Give a clue, find the imposter.",
    minPlayers: 3,
    maxPlayers: 15,
    initialPhase: 'reveal',

    configSchema: [
      {
        key: 'category',
        label: 'Category',
        type: 'select',
        default: 'mixed',
        options: [
          { value: 'mixed', label: 'Mixed (all)' },
          ...WORD_CATEGORIES.map((c) => ({ value: c.id, label: c.name })),
        ],
      },
      {
        key: 'imposters',
        label: 'Imposters',
        type: 'number',
        default: 1,
        min: 1,
        max: 3,
      },
    ],

    setup(ctx) {
      const pool =
        ctx.config.category === 'mixed'
          ? WORD_CATEGORIES.flatMap((c) =>
              c.words.map((w) => ({ word: w, category: c.name }))
            )
          : (() => {
              const c = WORD_CATEGORIES.find((x) => x.id === ctx.config.category);
              return c.words.map((w) => ({ word: w, category: c.name }));
            })();

      const pick = ctx.randomFrom(pool);

      const numImposters = Math.min(
        Math.max(1, parseInt(ctx.config.imposters, 10) || 1),
        Math.max(1, ctx.players.length - 2)
      );

      const shuffled = ctx.shuffle(ctx.players);
      const imposterIds = shuffled.slice(0, numImposters).map((p) => p.id);

      // Randomize speaking order
      const order = ctx.shuffle(ctx.players).map((p) => p.id);

      return {
        secret: pick.word,
        category: pick.category,
        imposterIds,
        revealIndex: 0,
        revealedFor: [],
        order,
        currentClueGiver: 0,
        clues: [], // {playerId, text}
        votes: {}, // voterId -> targetId
        result: null,
      };
    },

    phases: {
      // ---- 1. Pass the device, each player taps to see their role ----
      reveal: {
        render(ctx) {
          const { state, players, escape } = ctx;
          const i = state.revealIndex;
          if (i >= players.length) {
            // shouldn't render, advance handled by action
            return '';
          }
          const player = players[i];
          const revealed = state.revealedFor.includes(player.id);
          const isImposter = state.imposterIds.includes(player.id);

          if (!revealed) {
            return `
              <div class="reveal">
                <p class="muted">Pass the device to</p>
                <h2 class="big-name">${escape(player.name)}</h2>
                <p>Make sure no one else is looking, then tap to see your role.</p>
                <button class="primary big" data-action="show">Tap to reveal</button>
              </div>
            `;
          }

          return `
            <div class="reveal revealed">
              <p class="muted">Category</p>
              <h3>${escape(state.category)}</h3>
              <div class="word-card ${isImposter ? 'imposter' : ''}">
                ${isImposter
                  ? `<span class="label">You are the</span><span class="word">IMPOSTER</span><small>Bluff your way through. Don't get caught.</small>`
                  : `<span class="label">Secret word</span><span class="word">${escape(state.secret)}</span><small>Give a clue that proves you know it — without giving it away.</small>`
                }
              </div>
              <button class="primary big" data-action="next">
                ${i < players.length - 1 ? 'Hide & pass on →' : 'Start clues →'}
              </button>
            </div>
          `;
        },
        actions: {
          show(ctx) {
            const player = ctx.players[ctx.state.revealIndex];
            ctx.state.revealedFor.push(player.id);
          },
          next(ctx) {
            ctx.state.revealIndex += 1;
            if (ctx.state.revealIndex >= ctx.players.length) {
              ctx.goTo('clues');
            }
          },
        },
      },

      // ---- 2. Players give clues in order ----
      clues: {
        render(ctx) {
          const { state, players, escape } = ctx;
          const idx = state.currentClueGiver;
          const allDone = idx >= state.order.length;

          if (allDone) {
            const cluesList = state.clues
              .map(
                (c) => `
                <li><strong>${escape(playerName(players, c.playerId))}:</strong> ${escape(c.text)}</li>`
              )
              .join('');
            return `
              <div class="clues">
                <h3>All clues given</h3>
                <ol class="clue-list">${cluesList}</ol>
                <button class="primary big" data-action="to-vote">Vote for the imposter →</button>
              </div>
            `;
          }

          const pid = state.order[idx];
          const player = players.find((p) => p.id === pid);
          const cluesList = state.clues
            .map(
              (c) => `
              <li><strong>${escape(playerName(players, c.playerId))}:</strong> ${escape(c.text)}</li>`
            )
            .join('');

          return `
            <div class="clues">
              <p class="muted">Clue ${idx + 1} of ${state.order.length}</p>
              <h2 class="big-name">${escape(player.name)}</h2>
              <p>Say one word out loud that relates to the secret.</p>
              <form data-action="submit-clue" class="clue-form">
                <input name="text" placeholder="e.g. cheesy, hot, slice…" autocomplete="off" maxlength="30" required />
                <button type="submit">Submit</button>
              </form>
              ${cluesList ? `<ol class="clue-list">${cluesList}</ol>` : ''}
            </div>
          `;
        },
        actions: {
          'submit-clue'(ctx, payload) {
            const idx = ctx.state.currentClueGiver;
            const pid = ctx.state.order[idx];
            ctx.state.clues.push({ playerId: pid, text: payload.text.trim() });
            ctx.state.currentClueGiver += 1;
          },
          'to-vote'(ctx) {
            ctx.goTo('vote');
          },
        },
      },

      // ---- 3. Each player privately votes ----
      vote: {
        render(ctx) {
          const { state, players, escape } = ctx;
          const voted = Object.keys(state.votes);
          const next = players.find((p) => !voted.includes(p.id));

          if (!next) {
            return `
              <div class="vote">
                <h3>All votes in</h3>
                <button class="primary big" data-action="tally">Reveal results →</button>
              </div>
            `;
          }

          const candidates = players
            .filter((p) => p.id !== next.id)
            .map(
              (p) => `
              <button class="vote-choice" data-action="cast-vote"
                      data-voter="${next.id}" data-target="${p.id}">
                ${escape(p.name)}
              </button>`
            )
            .join('');

          return `
            <div class="vote">
              <p class="muted">Pass to</p>
              <h2 class="big-name">${escape(next.name)}</h2>
              <p>Who do you think is the imposter?</p>
              <div class="vote-grid">${candidates}</div>
              <p class="muted small">${voted.length} of ${players.length} voted</p>
            </div>
          `;
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
            const caught =
              !tied && ctx.state.imposterIds.includes(accused[0]);
            ctx.state.result = { tally, accused, tied, caught };
            ctx.goTo('results');
          },
        },
      },

      // ---- 4. Reveal & outcome ----
      results: {
        render(ctx) {
          const { state, players, escape } = ctx;
          const r = state.result;
          const imposters = state.imposterIds
            .map((id) => playerName(players, id))
            .join(', ');

          const headline = r.tied
            ? '🤝 Tie vote — imposter escapes!'
            : r.caught
            ? '🎯 Imposter caught!'
            : '🕵️ Imposter wins!';

          const tallyRows = players
            .map((p) => {
              const count = r.tally[p.id] || 0;
              const accused = r.accused.includes(p.id);
              return `
                <li class="${accused ? 'top' : ''}">
                  <span>${escape(p.name)}</span>
                  <span class="bar" style="--n:${count}"></span>
                  <span class="count">${count}</span>
                </li>`;
            })
            .join('');

          return `
            <div class="results">
              <h2>${headline}</h2>
              <p class="reveal-line">
                The secret was <strong>${escape(state.secret)}</strong>
                (${escape(state.category)})
              </p>
              <p class="reveal-line">
                Imposter${state.imposterIds.length > 1 ? 's' : ''}:
                <strong>${escape(imposters)}</strong>
              </p>
              <ul class="tally">${tallyRows}</ul>
              <div class="actions-row">
                <button class="primary big" data-action="play-again">Play again</button>
                <button class="link" data-action="quit">Home</button>
              </div>
            </div>
          `;
        },
        actions: {
          'play-again'(ctx) {
            // Re-run setup with same players & config
            const fresh = Imposter.setup(ctx);
            Object.keys(ctx.state).forEach((k) => delete ctx.state[k]);
            Object.assign(ctx.state, fresh);
            ctx.goTo('reveal');
          },
        },
      },
    },
  };

  function playerName(players, id) {
    const p = players.find((x) => x.id === id);
    return p ? p.name : 'Unknown';
  }

  GameRegistry.register(Imposter);
})();
