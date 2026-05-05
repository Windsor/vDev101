/**
 * Two Truths and a Lie — each player privately writes 3 statements (2 true,
 * 1 made up). Other players guess which is the lie. Score: presenter +1
 * per fooled guesser; guessers +1 each if correct.
 *
 * This module exercises framework primitives the others didn't:
 *   - Per-player rounds with the same inner sub-flow (write → show → guess → reveal)
 *   - Persistent scoring across rounds
 *   - Form-based input with multiple text fields
 */
(function () {
  'use strict';

  const TwoTruths = {
    id: 'twotruths',
    name: 'Two Truths and a Lie',
    description: 'Each player tells three things — two true, one made up. Others guess the lie.',
    minPlayers: 3,
    maxPlayers: 12,
    initialPhase: 'intro',
    configSchema: [],

    setup(ctx) {
      const scores = {};
      ctx.players.forEach((p) => { scores[p.id] = 0; });
      return {
        scores,
        presenterIndex: 0,
        statements: ['', '', ''],
        lieIndex: 0,
        guesses: {},
        history: [],
      };
    },

    phases: {
      intro: {
        render() {
          return `
            <div class="reveal">
              <h2>Two Truths and a Lie</h2>
              <p>Each player gets a turn. Privately enter three things about yourself — two true, one a lie.</p>
              <p>The others try to spot the lie.</p>
              <p class="muted small">Score: 1 point per player you fool. 1 point if you guess right.</p>
              <button class="primary big" data-action="start">Begin →</button>
            </div>`;
        },
        actions: {
          start(ctx) { ctx.goTo('write'); },
        },
      },

      write: {
        render(ctx) {
          const { state, players, escape } = ctx;
          const presenter = players[state.presenterIndex];
          return `
            <div class="reveal">
              <p class="muted">Round ${state.presenterIndex + 1} of ${players.length}</p>
              <h2 class="big-name">${escape(presenter.name)}</h2>
              <p>Privately enter three statements about yourself. Mark the lie.</p>
              <form data-action="submit-statements" class="truths-form">
                <label class="field">
                  <span>Statement 1</span>
                  <input name="stmt0" maxlength="120" autocomplete="off" required />
                </label>
                <label class="field">
                  <span>Statement 2</span>
                  <input name="stmt1" maxlength="120" autocomplete="off" required />
                </label>
                <label class="field">
                  <span>Statement 3</span>
                  <input name="stmt2" maxlength="120" autocomplete="off" required />
                </label>
                <label class="field">
                  <span>Which is the lie?</span>
                  <select name="lie">
                    <option value="0">Statement 1</option>
                    <option value="1">Statement 2</option>
                    <option value="2">Statement 3</option>
                  </select>
                </label>
                <button type="submit" class="primary big">Submit & pass →</button>
              </form>
            </div>`;
        },
        actions: {
          'submit-statements'(ctx, payload) {
            ctx.state.statements = [payload.stmt0, payload.stmt1, payload.stmt2];
            ctx.state.lieIndex = parseInt(payload.lie, 10) || 0;
            ctx.state.guesses = {};
            ctx.goTo('show');
          },
        },
      },

      show: {
        render(ctx) {
          const { state, players, escape } = ctx;
          const presenter = players[state.presenterIndex];
          const items = state.statements
            .map((s, i) => `<li>${i + 1}. ${escape(s)}</li>`)
            .join('');
          return `
            <div class="reveal">
              <h2>${escape(presenter.name)}'s three statements</h2>
              <ol class="statements">${items}</ol>
              <p>Read them out loud, then pass — others will guess privately.</p>
              <button class="primary big" data-action="to-guess">Start guessing →</button>
            </div>`;
        },
        actions: {
          'to-guess'(ctx) { ctx.goTo('guess'); },
        },
      },

      guess: {
        render(ctx) {
          const { state, players, escape } = ctx;
          const presenter = players[state.presenterIndex];
          const guessers = players.filter((p) => p.id !== presenter.id);
          const guessed = Object.keys(state.guesses);
          const next = guessers.find((p) => !guessed.includes(p.id));

          if (!next) {
            return `
              <div class="vote">
                <h3>All guesses in</h3>
                <button class="primary big" data-action="reveal">Reveal the lie →</button>
              </div>`;
          }

          const buttons = state.statements
            .map(
              (s, i) => `
              <button class="statement-choice" data-action="cast-guess"
                      data-voter="${next.id}" data-index="${i}">
                <strong>${i + 1}.</strong> ${escape(s)}
              </button>`
            )
            .join('');
          return `
            <div class="vote">
              <p class="muted">Pass to</p>
              <h2 class="big-name">${escape(next.name)}</h2>
              <p>Which statement is the lie?</p>
              <div class="statement-grid">${buttons}</div>
              <p class="muted small">${guessed.length} of ${guessers.length} guessed</p>
            </div>`;
        },
        actions: {
          'cast-guess'(ctx, payload) {
            ctx.state.guesses[payload.voter] = parseInt(payload.index, 10);
          },
          reveal(ctx) {
            const presenter = ctx.players[ctx.state.presenterIndex];
            const correct = ctx.state.lieIndex;
            let fooled = 0;
            Object.entries(ctx.state.guesses).forEach(([voter, idx]) => {
              if (idx === correct) ctx.state.scores[voter] += 1;
              else fooled += 1;
            });
            ctx.state.scores[presenter.id] += fooled;
            ctx.state.history.push({
              presenterId: presenter.id,
              statements: ctx.state.statements.slice(),
              lieIndex: ctx.state.lieIndex,
              guesses: { ...ctx.state.guesses },
            });
            ctx.goTo('reveal');
          },
        },
      },

      reveal: {
        render(ctx) {
          const { state, players, escape } = ctx;
          const presenter = players[state.presenterIndex];
          const items = state.statements
            .map(
              (s, i) => `<li class="${i === state.lieIndex ? 'lie' : ''}">
                ${i + 1}. ${escape(s)} ${i === state.lieIndex ? '<span class="role-tag">LIE</span>' : ''}
              </li>`
            )
            .join('');
          const summary = Object.entries(state.guesses)
            .map(([voter, idx]) => {
              const p = players.find((x) => x.id === voter);
              const ok = idx === state.lieIndex;
              return `<li>${escape(p.name)}: guessed #${idx + 1} ${ok ? '✓' : '✗'}</li>`;
            })
            .join('');
          const isLast = state.presenterIndex >= players.length - 1;
          return `
            <div class="reveal">
              <h2>The truth from ${escape(presenter.name)}</h2>
              <ol class="statements">${items}</ol>
              <h3>Guesses</h3>
              <ul class="log">${summary || '<li class="muted">none</li>'}</ul>
              <button class="primary big" data-action="next">
                ${isLast ? 'See final scores →' : 'Next player →'}
              </button>
            </div>`;
        },
        actions: {
          next(ctx) {
            ctx.state.presenterIndex += 1;
            ctx.state.statements = ['', '', ''];
            ctx.state.lieIndex = 0;
            ctx.state.guesses = {};
            if (ctx.state.presenterIndex >= ctx.players.length) ctx.goTo('results');
            else ctx.goTo('write');
          },
        },
      },

      results: {
        render(ctx) {
          const { state, players, escape } = ctx;
          const ranked = players
            .slice()
            .sort((a, b) => state.scores[b.id] - state.scores[a.id]);
          const max = ranked.length ? state.scores[ranked[0].id] : 0;
          const items = ranked
            .map((p) => {
              const s = state.scores[p.id];
              const winner = s === max && s > 0;
              return `<li class="${winner ? 'top' : ''}">
                <span>${escape(p.name)}</span>
                <span class="role-tag">${s} pt${s === 1 ? '' : 's'}</span>
              </li>`;
            })
            .join('');
          return `
            <div class="results">
              <h2>🏆 Final scores</h2>
              <ul class="roster">${items}</ul>
              <div class="actions-row">
                <button class="primary big" data-action="play-again">Play again</button>
                <button class="link" data-action="quit">Home</button>
              </div>
            </div>`;
        },
        actions: {
          'play-again'(ctx) {
            const fresh = TwoTruths.setup(ctx);
            Object.keys(ctx.state).forEach((k) => delete ctx.state[k]);
            Object.assign(ctx.state, fresh);
            ctx.goTo('intro');
          },
        },
      },
    },
  };

  GameRegistry.register(TwoTruths);
})();
