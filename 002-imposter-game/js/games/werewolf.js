/**
 * Werewolf — pass-and-play, classic ruleset.
 *
 * Roles: Werewolf, Seer (optional), Doctor (optional), Villager.
 * Flow:
 *   reveal
 *     → night-werewolves → night-seer? → night-doctor?
 *     → dawn → day → vote → dusk
 *     → (loop back to night-werewolves until a faction wins)
 *     → results
 *
 * Win conditions:
 *   - Villagers win when no werewolves are alive.
 *   - Werewolves win when alive wolves >= alive non-wolves.
 *
 * Everything fits the existing engine API: phases with render/actions, state
 * in setup(), transitions via ctx.goTo. No engine changes required.
 */
(function () {
  'use strict';

  const ROLE_INFO = {
    werewolf: {
      label: 'Werewolf',
      cardClass: 'imposter',
      desc: 'Each night, agree with your fellow wolves on a victim. By day, blend in.',
    },
    seer: {
      label: 'Seer',
      cardClass: '',
      desc: 'Each night, inspect one player and learn whether they are a werewolf.',
    },
    doctor: {
      label: 'Doctor',
      cardClass: '',
      desc: 'Each night, choose one player to protect from the wolves.',
    },
    villager: {
      label: 'Villager',
      cardClass: '',
      desc: 'No special power. Use your wits to find the wolves by day.',
    },
  };

  const alive = (players, state) =>
    players.filter((p) => !state.eliminated.includes(p.id));

  const aliveByRole = (players, state, role) =>
    alive(players, state).filter((p) => state.roles[p.id] === role);

  function checkWin(state, players) {
    const a = alive(players, state);
    const wolves = a.filter((p) => state.roles[p.id] === 'werewolf').length;
    const others = a.length - wolves;
    if (wolves === 0) return 'villagers';
    if (wolves >= others) return 'werewolves';
    return null;
  }

  // After a given night sub-phase, return the next phase to enter.
  function afterNight(state, players, current) {
    const order = ['night-werewolves', 'night-seer', 'night-doctor'];
    const idx = order.indexOf(current);
    for (let i = idx + 1; i < order.length; i++) {
      const next = order[i];
      if (next === 'night-seer' && state.includeSeer && aliveByRole(players, state, 'seer').length) return next;
      if (next === 'night-doctor' && state.includeDoctor && aliveByRole(players, state, 'doctor').length) return next;
    }
    return 'dawn';
  }

  const nameOf = (players, id) => {
    const p = players.find((x) => x.id === id);
    return p ? p.name : '?';
  };

  const Werewolf = {
    id: 'werewolf',
    name: 'Werewolf',
    description:
      'Day-and-night social deduction. Villagers hunt the wolves. Wolves hunt at night.',
    minPlayers: 4,
    maxPlayers: 15,
    initialPhase: 'reveal',

    configSchema: [
      {
        key: 'seer',
        label: 'Include Seer',
        type: 'select',
        default: 'yes',
        options: [
          { value: 'yes', label: 'Yes' },
          { value: 'no', label: 'No' },
        ],
      },
      {
        key: 'doctor',
        label: 'Include Doctor',
        type: 'select',
        default: 'yes',
        options: [
          { value: 'yes', label: 'Yes' },
          { value: 'no', label: 'No' },
        ],
      },
    ],

    setup(ctx) {
      const n = ctx.players.length;
      const numWolves = n >= 12 ? 3 : n >= 8 ? 2 : 1;
      const includeSeer = ctx.config.seer === 'yes';
      const includeDoctor = ctx.config.doctor === 'yes';

      const shuffled = ctx.shuffle(ctx.players);
      const roles = {};
      let i = 0;
      for (let k = 0; k < numWolves && i < shuffled.length; k++) {
        roles[shuffled[i++].id] = 'werewolf';
      }
      if (includeSeer && i < shuffled.length) roles[shuffled[i++].id] = 'seer';
      if (includeDoctor && i < shuffled.length) roles[shuffled[i++].id] = 'doctor';
      while (i < shuffled.length) roles[shuffled[i++].id] = 'villager';

      return {
        roles,
        eliminated: [],
        revealIndex: 0,
        revealedFor: [],
        werewolfStep: 'pick', // pick | sleep
        nightVictim: null,
        seerStep: 'pick', // pick | sleep (sleep screen also shows the result)
        seerInspected: null,
        doctorStep: 'pick', // pick | sleep
        doctorSaved: null,
        votes: {},
        lynchTarget: null,
        round: 1,
        log: [],
        winner: null,
        includeSeer,
        includeDoctor,
      };
    },

    phases: {
      // ---- ROLE REVEAL ----
      reveal: {
        render(ctx) {
          const { state, players, escape } = ctx;
          const i = state.revealIndex;
          const player = players[i];
          const revealed = state.revealedFor.includes(player.id);
          const role = state.roles[player.id];
          const info = ROLE_INFO[role];

          if (!revealed) {
            return `
              <div class="reveal">
                <p class="muted">Pass to</p>
                <h2 class="big-name">${escape(player.name)}</h2>
                <p>Make sure no one else is looking, then tap to see your role.</p>
                <button class="primary big" data-action="show">Reveal my role</button>
              </div>
            `;
          }

          let extra = '';
          if (role === 'werewolf') {
            const teammates = players
              .filter((p) => p.id !== player.id && state.roles[p.id] === 'werewolf')
              .map((p) => escape(p.name));
            extra = teammates.length
              ? `<p class="muted">Your fellow wolves: <strong>${teammates.join(', ')}</strong></p>`
              : `<p class="muted">You are the only wolf. Hunt alone.</p>`;
          }

          return `
            <div class="reveal revealed">
              <div class="word-card ${info.cardClass}">
                <span class="label">Your role</span>
                <span class="word">${escape(info.label)}</span>
                <small>${escape(info.desc)}</small>
              </div>
              ${extra}
              <button class="primary big" data-action="next">
                ${i < players.length - 1 ? 'Hide & pass on →' : 'Begin Night 1 →'}
              </button>
            </div>
          `;
        },
        actions: {
          show(ctx) {
            ctx.state.revealedFor.push(ctx.players[ctx.state.revealIndex].id);
          },
          next(ctx) {
            ctx.state.revealIndex += 1;
            if (ctx.state.revealIndex >= ctx.players.length) {
              ctx.goTo('night-werewolves');
            }
          },
        },
      },

      // ---- NIGHT: WEREWOLVES ----
      'night-werewolves': {
        render(ctx) {
          const { state, players, escape } = ctx;

          if (state.werewolfStep === 'pick') {
            const targets = alive(players, state)
              .filter((p) => state.roles[p.id] !== 'werewolf')
              .map(
                (p) => `
                <button class="vote-choice" data-action="pick-victim" data-target="${p.id}">
                  ${escape(p.name)}
                </button>`
              )
              .join('');
            return `
              <div class="vote night">
                <p class="muted">Night ${state.round}</p>
                <h2>🌙 Everyone, close your eyes</h2>
                <p>🐺 Werewolves, open your eyes — choose a victim.</p>
                <div class="vote-grid">${targets}</div>
              </div>
            `;
          }
          // sleep
          return `
            <div class="reveal night">
              <h2>💤 Werewolves, close your eyes</h2>
              <p class="muted">Pass the device on quietly.</p>
              <button class="primary big" data-action="next">Continue →</button>
            </div>
          `;
        },
        actions: {
          'pick-victim'(ctx, payload) {
            ctx.state.nightVictim = payload.target;
            ctx.state.werewolfStep = 'sleep';
          },
          next(ctx) {
            ctx.state.werewolfStep = 'pick';
            ctx.goTo(afterNight(ctx.state, ctx.players, 'night-werewolves'));
          },
        },
      },

      // ---- NIGHT: SEER ----
      'night-seer': {
        render(ctx) {
          const { state, players, escape } = ctx;
          const seer = aliveByRole(players, state, 'seer')[0];
          if (!seer) {
            // Defensive — afterNight() already filters this out
            return `<div class="reveal"><button class="primary big" data-action="next">Continue</button></div>`;
          }

          if (state.seerStep === 'pick') {
            const targets = alive(players, state)
              .filter((p) => p.id !== seer.id)
              .map(
                (p) => `
                <button class="vote-choice" data-action="pick-inspect" data-target="${p.id}">
                  ${escape(p.name)}
                </button>`
              )
              .join('');
            return `
              <div class="vote night">
                <h2>🔮 Seer, open your eyes</h2>
                <p>Inspect one player to learn their role.</p>
                <div class="vote-grid">${targets}</div>
              </div>
            `;
          }

          // sleep — also shows the inspection result
          const target = players.find((p) => p.id === state.seerInspected);
          const role = state.roles[target.id];
          const isWolf = role === 'werewolf';
          return `
            <div class="reveal revealed night">
              <p class="muted">Your vision reveals…</p>
              <div class="word-card ${isWolf ? 'imposter' : ''}">
                <span class="label">${escape(target.name)} is a</span>
                <span class="word">${escape(ROLE_INFO[role].label)}</span>
              </div>
              <p>💤 Seer, close your eyes.</p>
              <button class="primary big" data-action="next">Continue →</button>
            </div>
          `;
        },
        actions: {
          'pick-inspect'(ctx, payload) {
            ctx.state.seerInspected = payload.target;
            ctx.state.seerStep = 'sleep';
          },
          next(ctx) {
            ctx.state.seerStep = 'pick';
            ctx.goTo(afterNight(ctx.state, ctx.players, 'night-seer'));
          },
        },
      },

      // ---- NIGHT: DOCTOR ----
      'night-doctor': {
        render(ctx) {
          const { state, players, escape } = ctx;
          const doctor = aliveByRole(players, state, 'doctor')[0];
          if (!doctor) {
            return `<div class="reveal"><button class="primary big" data-action="next">Continue</button></div>`;
          }

          if (state.doctorStep === 'pick') {
            const targets = alive(players, state)
              .map(
                (p) => `
                <button class="vote-choice" data-action="pick-save" data-target="${p.id}">
                  ${escape(p.name)}${p.id === doctor.id ? ' (yourself)' : ''}
                </button>`
              )
              .join('');
            return `
              <div class="vote night">
                <h2>⚕️ Doctor, open your eyes</h2>
                <p>Choose one player to protect tonight.</p>
                <div class="vote-grid">${targets}</div>
              </div>
            `;
          }
          // sleep
          return `
            <div class="reveal night">
              <h2>💤 Doctor, close your eyes</h2>
              <button class="primary big" data-action="next">Continue →</button>
            </div>
          `;
        },
        actions: {
          'pick-save'(ctx, payload) {
            ctx.state.doctorSaved = payload.target;
            ctx.state.doctorStep = 'sleep';
          },
          next(ctx) {
            ctx.state.doctorStep = 'pick';
            ctx.goTo(afterNight(ctx.state, ctx.players, 'night-doctor'));
          },
        },
      },

      // ---- DAWN: resolve night and announce ----
      dawn: {
        render(ctx) {
          const { state, players, escape } = ctx;

          // Resolve night kill once per round (idempotent guard via log).
          const alreadyResolved = state.log.some(
            (e) => e.round === state.round && e.type === 'dawn'
          );
          if (!alreadyResolved) {
            const killedId =
              state.nightVictim && state.nightVictim !== state.doctorSaved
                ? state.nightVictim
                : null;
            if (killedId) state.eliminated.push(killedId);
            state.log.push({
              round: state.round,
              type: 'dawn',
              message: killedId
                ? `${nameOf(players, killedId)} (${ROLE_INFO[state.roles[killedId]].label}) was killed`
                : 'Nobody died',
            });
          }

          const lastDawn = [...state.log].reverse().find((e) => e.type === 'dawn');
          const winner = checkWin(state, players);

          return `
            <div class="reveal">
              <h2>☀️ Dawn breaks</h2>
              <p>Everyone, open your eyes.</p>
              <p>${escape(lastDawn.message)}.</p>
              <button class="primary big" data-action="${winner ? 'end' : 'next'}">
                ${winner ? 'See results →' : 'Begin discussion →'}
              </button>
            </div>
          `;
        },
        actions: {
          next(ctx) {
            ctx.goTo('day');
          },
          end(ctx) {
            ctx.state.winner = checkWin(ctx.state, ctx.players);
            ctx.goTo('results');
          },
        },
      },

      // ---- DAY: discussion ----
      day: {
        render(ctx) {
          const { state, players, escape } = ctx;
          const aliveList = alive(players, state)
            .map((p) => `<li>${escape(p.name)}</li>`)
            .join('');
          const deadList = state.eliminated
            .map(
              (id) =>
                `<li class="dead">${escape(nameOf(players, id))} <span class="role-tag">${escape(
                  ROLE_INFO[state.roles[id]].label
                )}</span></li>`
            )
            .join('');
          return `
            <div class="day">
              <h2>🗣️ Day ${state.round}</h2>
              <p>Discuss. Make accusations. Defend yourself.</p>
              <div class="two-col">
                <div>
                  <h3>Alive</h3>
                  <ul>${aliveList}</ul>
                </div>
                <div>
                  <h3>Dead</h3>
                  <ul>${deadList || '<li class="muted">none</li>'}</ul>
                </div>
              </div>
              <button class="primary big" data-action="next">Start the vote →</button>
            </div>
          `;
        },
        actions: {
          next(ctx) {
            ctx.goTo('vote');
          },
        },
      },

      // ---- DAY: vote ----
      vote: {
        render(ctx) {
          const { state, players, escape } = ctx;
          const aliveP = alive(players, state);
          const voted = Object.keys(state.votes);
          const nextVoter = aliveP.find((p) => !voted.includes(p.id));

          if (!nextVoter) {
            return `
              <div class="vote">
                <h3>All votes cast</h3>
                <button class="primary big" data-action="tally">Reveal verdict →</button>
              </div>
            `;
          }

          const targets = aliveP
            .filter((p) => p.id !== nextVoter.id)
            .map(
              (p) => `
              <button class="vote-choice" data-action="cast-vote"
                      data-voter="${nextVoter.id}" data-target="${p.id}">
                ${escape(p.name)}
              </button>`
            )
            .join('');
          const abstain = `
            <button class="vote-choice abstain" data-action="cast-vote"
                    data-voter="${nextVoter.id}" data-target="abstain">
              Abstain
            </button>`;

          return `
            <div class="vote">
              <p class="muted">Pass to</p>
              <h2 class="big-name">${escape(nextVoter.name)}</h2>
              <p>Who should be lynched?</p>
              <div class="vote-grid">${targets}${abstain}</div>
              <p class="muted small">${voted.length} of ${aliveP.length} voted</p>
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
              if (t !== 'abstain') tally[t] = (tally[t] || 0) + 1;
            });
            const max = Math.max(...Object.values(tally), 0);
            if (max === 0) {
              ctx.state.lynchTarget = null;
            } else {
              const top = Object.keys(tally).filter((k) => tally[k] === max);
              ctx.state.lynchTarget = top.length === 1 ? top[0] : null;
            }
            ctx.goTo('dusk');
          },
        },
      },

      // ---- DUSK: resolve lynch and start next round ----
      dusk: {
        render(ctx) {
          const { state, players, escape } = ctx;
          const alreadyResolved = state.log.some(
            (e) => e.round === state.round && e.type === 'dusk'
          );
          if (!alreadyResolved) {
            if (state.lynchTarget) {
              state.eliminated.push(state.lynchTarget);
              state.log.push({
                round: state.round,
                type: 'dusk',
                message: `${nameOf(players, state.lynchTarget)} (${ROLE_INFO[state.roles[state.lynchTarget]].label}) was lynched`,
              });
            } else {
              state.log.push({
                round: state.round,
                type: 'dusk',
                message: 'Tie vote — nobody was lynched',
              });
            }
          }

          const lastDusk = [...state.log].reverse().find((e) => e.type === 'dusk');
          const winner = checkWin(state, players);

          return `
            <div class="reveal">
              <h2>🌅 Dusk</h2>
              <p>${escape(lastDusk.message)}.</p>
              <button class="primary big" data-action="${winner ? 'end' : 'next'}">
                ${winner ? 'See results →' : 'Night falls →'}
              </button>
            </div>
          `;
        },
        actions: {
          next(ctx) {
            ctx.state.round += 1;
            ctx.state.werewolfStep = 'pick';
            ctx.state.nightVictim = null;
            ctx.state.seerStep = 'pick';
            ctx.state.seerInspected = null;
            ctx.state.doctorStep = 'pick';
            ctx.state.doctorSaved = null;
            ctx.state.votes = {};
            ctx.state.lynchTarget = null;
            ctx.goTo('night-werewolves');
          },
          end(ctx) {
            ctx.state.winner = checkWin(ctx.state, ctx.players);
            ctx.goTo('results');
          },
        },
      },

      // ---- RESULTS ----
      results: {
        render(ctx) {
          const { state, players, escape } = ctx;
          const winner = state.winner;
          const headline = winner === 'villagers' ? '🏘️ Villagers win!' : '🐺 Werewolves win!';
          const rolesList = players
            .map((p) => {
              const role = state.roles[p.id];
              const dead = state.eliminated.includes(p.id);
              return `
                <li class="${dead ? 'dead' : ''}">
                  <span>${escape(p.name)}</span>
                  <span class="role-tag">${escape(ROLE_INFO[role].label)}</span>
                </li>`;
            })
            .join('');
          const log = state.log
            .map(
              (e) =>
                `<li><strong>${e.type === 'dawn' ? '☀️' : '🌅'} R${e.round}:</strong> ${escape(e.message)}</li>`
            )
            .join('');
          return `
            <div class="results">
              <h2>${headline}</h2>
              <h3>Final roles</h3>
              <ul class="roster">${rolesList}</ul>
              ${log ? `<h3>Game log</h3><ul class="log">${log}</ul>` : ''}
              <div class="actions-row">
                <button class="primary big" data-action="play-again">Play again</button>
                <button class="link" data-action="quit">Home</button>
              </div>
            </div>
          `;
        },
        actions: {
          'play-again'(ctx) {
            const fresh = Werewolf.setup(ctx);
            Object.keys(ctx.state).forEach((k) => delete ctx.state[k]);
            Object.assign(ctx.state, fresh);
            ctx.goTo('reveal');
          },
        },
      },
    },
  };

  GameRegistry.register(Werewolf);
})();
