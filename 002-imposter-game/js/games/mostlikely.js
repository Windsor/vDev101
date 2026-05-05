/**
 * Most Likely To — read a question, every player votes for whoever fits best.
 * Configurable number of rounds. Tracks "wins" (most-voted) per player.
 *
 * Demonstrates polling-style voting with self-voting allowed and an explicit
 * round counter — no hidden roles, no elimination.
 */
(function () {
  'use strict';

  const QUESTIONS = [
    'become famous?',
    'forget their own birthday?',
    'survive a zombie apocalypse?',
    'laugh at the wrong moment?',
    'start their own business?',
    'win a reality TV show?',
    'become a professional gamer?',
    'live abroad someday?',
    'fall asleep during a movie?',
    'break their phone within a week?',
    'get lost in their own neighborhood?',
    'be late to their own wedding?',
    'win a dance-off?',
    'become a politician?',
    'talk to themselves in public?',
    'binge an entire show in one day?',
    'cry at a happy ending?',
    'forget where they parked?',
    'send a text to the wrong person?',
    'eat the last slice without asking?',
    'show up uninvited to a party?',
    'win at a quiz night?',
    'start an argument over nothing?',
    'go viral on social media?',
    'become a teacher?',
    'forget an anniversary?',
    'try a wild new haircut?',
    'sing in the shower at full volume?',
    'have the most pets?',
    'travel to the most countries?',
    'open a small bakery?',
    'adopt a stray animal on impulse?',
    'spend hours organizing their desk?',
    'argue about a movie ending?',
    'get a tattoo on a dare?',
  ];

  const MostLikely = {
    id: 'mostlikely',
    name: 'Most Likely To',
    description: 'Read a question, vote on who fits best. Highest tally each round wins.',
    minPlayers: 3,
    maxPlayers: 15,
    initialPhase: 'question',
    configSchema: [
      {
        key: 'rounds',
        label: 'Number of rounds',
        type: 'number',
        default: 5,
        min: 1,
        max: 20,
      },
    ],

    setup(ctx) {
      const shuffled = ctx.shuffle(QUESTIONS);
      const totalRounds = Math.max(1, parseInt(ctx.config.rounds, 10) || 5);
      const wins = {};
      ctx.players.forEach((p) => { wins[p.id] = 0; });
      return {
        questions: shuffled,
        round: 0,
        totalRounds,
        currentQuestion: shuffled[0],
        votes: {},
        history: [],
        wins,
      };
    },

    phases: {
      question: {
        render(ctx) {
          const { state, escape } = ctx;
          return `
            <div class="reveal">
              <p class="muted">Question ${state.round + 1} of ${state.totalRounds}</p>
              <h2>Who is most likely to…</h2>
              <div class="word-card">
                <span class="word question-word">${escape(state.currentQuestion)}</span>
              </div>
              <button class="primary big" data-action="to-vote">Start voting →</button>
            </div>`;
        },
        actions: {
          'to-vote'(ctx) { ctx.goTo('vote'); },
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
            .map(
              (p) => `
              <button class="vote-choice" data-action="cast-vote"
                      data-voter="${next.id}" data-target="${p.id}">${escape(p.name)}${p.id === next.id ? ' (you)' : ''}</button>`
            )
            .join('');
          return `
            <div class="vote">
              <p class="muted">Pass to</p>
              <h2 class="big-name">${escape(next.name)}</h2>
              <p>Most likely to <strong>${escape(state.currentQuestion)}</strong></p>
              <div class="vote-grid">${candidates}</div>
              <p class="muted small">${voted.length} of ${players.length} voted</p>
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
            const top = Object.keys(tally).filter((k) => tally[k] === max);
            top.forEach((id) => { ctx.state.wins[id] = (ctx.state.wins[id] || 0) + 1; });
            ctx.state.history.push({
              question: ctx.state.currentQuestion,
              tally,
              top,
            });
            ctx.goTo('round-result');
          },
        },
      },

      'round-result': {
        render(ctx) {
          const { state, players, escape } = ctx;
          const last = state.history[state.history.length - 1];
          const topNames = last.top.map((id) => {
            const p = players.find((x) => x.id === id);
            return p ? p.name : '?';
          });
          const tallyRows = players
            .map((p) => {
              const count = last.tally[p.id] || 0;
              return `<li class="${last.top.includes(p.id) ? 'top' : ''}">
                <span>${escape(p.name)}</span>
                <span class="bar" style="--n:${count}"></span>
                <span class="count">${count}</span>
              </li>`;
            })
            .join('');
          const isLast = state.round + 1 >= state.totalRounds;
          return `
            <div class="results">
              <h2>${escape(topNames.join(' & '))}</h2>
              <p class="reveal-line">most likely to <strong>${escape(last.question)}</strong></p>
              <ul class="tally">${tallyRows}</ul>
              <button class="primary big" data-action="next">
                ${isLast ? 'See final tally →' : 'Next question →'}
              </button>
            </div>`;
        },
        actions: {
          next(ctx) {
            ctx.state.round += 1;
            ctx.state.votes = {};
            if (ctx.state.round >= ctx.state.totalRounds) {
              ctx.goTo('final');
            } else {
              ctx.state.currentQuestion =
                ctx.state.questions[ctx.state.round] || ctx.randomFrom(QUESTIONS);
              ctx.goTo('question');
            }
          },
        },
      },

      final: {
        render(ctx) {
          const { state, players, escape } = ctx;
          const ranked = players
            .slice()
            .sort((a, b) => (state.wins[b.id] || 0) - (state.wins[a.id] || 0));
          const max = ranked.length ? state.wins[ranked[0].id] || 0 : 0;
          const items = ranked
            .map((p) => {
              const s = state.wins[p.id] || 0;
              const isWinner = s === max && s > 0;
              return `<li class="${isWinner ? 'top' : ''}">
                <span>${escape(p.name)}</span>
                <span class="role-tag">${s} round${s === 1 ? '' : 's'} won</span>
              </li>`;
            })
            .join('');
          return `
            <div class="results">
              <h2>🏆 Most likely overall</h2>
              <ul class="roster">${items}</ul>
              <div class="actions-row">
                <button class="primary big" data-action="play-again">Play again</button>
                <button class="link" data-action="quit">Home</button>
              </div>
            </div>`;
        },
        actions: {
          'play-again'(ctx) {
            const fresh = MostLikely.setup(ctx);
            Object.keys(ctx.state).forEach((k) => delete ctx.state[k]);
            Object.assign(ctx.state, fresh);
            ctx.goTo('question');
          },
        },
      },
    },
  };

  GameRegistry.register(MostLikely);
})();
