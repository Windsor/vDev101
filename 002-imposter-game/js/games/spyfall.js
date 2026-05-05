/**
 * Spyfall — everyone shares a location and a role, except one Spy who knows
 * neither. Players ask each other questions; the spy bluffs to learn the
 * location, the others try to expose the spy.
 */
(function () {
  'use strict';

  const LOCATIONS = [
    { name: 'Beach', roles: ['Lifeguard', 'Tourist', 'Surfer', 'Photographer', 'Vendor', 'Surf Instructor'] },
    { name: 'Hospital', roles: ['Doctor', 'Nurse', 'Patient', 'Visitor', 'Surgeon', 'Janitor'] },
    { name: 'Restaurant', roles: ['Chef', 'Waiter', 'Customer', 'Manager', 'Bartender', 'Food Critic'] },
    { name: 'Airport', roles: ['Pilot', 'Passenger', 'TSA Agent', 'Flight Attendant', 'Security', 'Cleaner'] },
    { name: 'Casino', roles: ['Dealer', 'Gambler', 'Pit Boss', 'Bartender', 'Security', 'Tourist'] },
    { name: 'School', roles: ['Student', 'Teacher', 'Principal', 'Janitor', 'Coach', 'Librarian'] },
    { name: 'Submarine', roles: ['Captain', 'Cook', 'Engineer', 'Sailor', 'Doctor', 'First Mate'] },
    { name: 'Movie Set', roles: ['Director', 'Actor', 'Camera Op', 'Producer', 'Stunt Double', 'Makeup Artist'] },
    { name: 'Pirate Ship', roles: ['Captain', 'Cook', 'First Mate', 'Cabin Boy', 'Sailor', 'Prisoner'] },
    { name: 'Space Station', roles: ['Astronaut', 'Scientist', 'Mission Control', 'Tourist', 'Engineer', 'Pilot'] },
    { name: 'Ski Resort', roles: ['Instructor', 'Tourist', 'Lift Operator', 'Bartender', 'Lodge Owner', 'Patrol'] },
    { name: 'Bank', roles: ['Teller', 'Manager', 'Customer', 'Security Guard', 'Robber', 'Loan Officer'] },
    { name: 'Library', roles: ['Librarian', 'Student', 'Reader', 'Janitor', 'Visitor', 'Author'] },
    { name: 'Gym', roles: ['Trainer', 'Member', 'Receptionist', 'Cleaner', 'Manager', 'Yoga Instructor'] },
    { name: 'Wedding', roles: ['Bride', 'Groom', 'Officiant', 'Photographer', 'Caterer', 'Guest'] },
    { name: 'Theme Park', roles: ['Ride Operator', 'Tourist', 'Mascot', 'Vendor', 'Maintenance', 'Performer'] },
  ];

  const Spyfall = {
    id: 'spyfall',
    name: 'Spyfall',
    description: "Everyone's at a secret location — except the spy. Ask questions, find them.",
    minPlayers: 4,
    maxPlayers: 12,
    initialPhase: 'reveal',
    configSchema: [],

    setup(ctx) {
      const location = ctx.randomFrom(LOCATIONS);
      const order = ctx.shuffle(ctx.players);
      const spyId = order[0].id;
      const roles = ctx.shuffle(location.roles);
      const playerRoles = {};
      order.forEach((p, i) => {
        playerRoles[p.id] = i === 0 ? null : roles[(i - 1) % roles.length];
      });
      return {
        location: location.name,
        spyId,
        playerRoles,
        revealIndex: 0,
        revealedFor: [],
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
          const isSpy = player.id === state.spyId;

          if (!revealed) {
            return `
              <div class="reveal">
                <p class="muted">Pass to</p>
                <h2 class="big-name">${escape(player.name)}</h2>
                <p>Make sure no one else is looking, then tap.</p>
                <button class="primary big" data-action="show">Tap to reveal</button>
              </div>`;
          }

          if (isSpy) {
            const locList = LOCATIONS.map((l) => escape(l.name)).join(' • ');
            return `
              <div class="reveal revealed">
                <div class="word-card imposter">
                  <span class="label">You are the</span>
                  <span class="word">SPY</span>
                  <small>You don't know the location. Listen, ask vague questions, and try not to get caught.</small>
                </div>
                <p class="muted small">Possible locations: ${locList}</p>
                <button class="primary big" data-action="next">
                  ${i < players.length - 1 ? 'Hide & pass on →' : 'Start questioning →'}
                </button>
              </div>`;
          }

          return `
            <div class="reveal revealed">
              <div class="word-card">
                <span class="label">Location</span>
                <span class="word">${escape(state.location)}</span>
                <small>You are the <strong>${escape(state.playerRoles[player.id])}</strong>.<br>Ask questions to expose the spy — but don't reveal the location.</small>
              </div>
              <button class="primary big" data-action="next">
                ${i < players.length - 1 ? 'Hide & pass on →' : 'Start questioning →'}
              </button>
            </div>`;
        },
        actions: {
          show(ctx) {
            ctx.state.revealedFor.push(ctx.players[ctx.state.revealIndex].id);
          },
          next(ctx) {
            ctx.state.revealIndex += 1;
            if (ctx.state.revealIndex >= ctx.players.length) ctx.goTo('discuss');
          },
        },
      },

      discuss: {
        render() {
          return `
            <div class="reveal">
              <h2>🕵️ Question time</h2>
              <p>Take turns asking each other questions about the location.</p>
              <p class="muted">The spy is listening — keep it subtle.</p>
              <p class="muted small">Suggested time: 5 minutes.</p>
              <button class="primary big" data-action="to-vote">Done — vote on the spy →</button>
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
                <button class="primary big" data-action="tally">Reveal verdict →</button>
              </div>`;
          }
          const candidates = players
            .filter((p) => p.id !== next.id)
            .map(
              (p) => `
              <button class="vote-choice" data-action="cast-vote"
                      data-voter="${next.id}" data-target="${p.id}">${escape(p.name)}</button>`
            )
            .join('');
          return `
            <div class="vote">
              <p class="muted">Pass to</p>
              <h2 class="big-name">${escape(next.name)}</h2>
              <p>Who is the spy?</p>
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
            const caught = !tied && accused[0] === ctx.state.spyId;
            ctx.state.result = { tally, accused, tied, caught };
            ctx.goTo('results');
          },
        },
      },

      results: {
        render(ctx) {
          const { state, players, escape } = ctx;
          const r = state.result;
          const spy = players.find((p) => p.id === state.spyId);
          const headline = r.tied
            ? '🤝 Tie — spy escapes!'
            : r.caught
            ? '🎯 Spy caught!'
            : '🕵️ Spy wins!';
          const tallyRows = players
            .map((p) => {
              const count = r.tally[p.id] || 0;
              return `<li class="${r.accused.includes(p.id) ? 'top' : ''}">
                <span>${escape(p.name)}</span>
                <span class="bar" style="--n:${count}"></span>
                <span class="count">${count}</span>
              </li>`;
            })
            .join('');
          return `
            <div class="results">
              <h2>${headline}</h2>
              <p class="reveal-line">Location was <strong>${escape(state.location)}</strong></p>
              <p class="reveal-line">Spy was <strong>${escape(spy.name)}</strong></p>
              <ul class="tally">${tallyRows}</ul>
              <div class="actions-row">
                <button class="primary big" data-action="play-again">Play again</button>
                <button class="link" data-action="quit">Home</button>
              </div>
            </div>`;
        },
        actions: {
          'play-again'(ctx) {
            const fresh = Spyfall.setup(ctx);
            Object.keys(ctx.state).forEach((k) => delete ctx.state[k]);
            Object.assign(ctx.state, fresh);
            ctx.goTo('reveal');
          },
        },
      },
    },
  };

  GameRegistry.register(Spyfall);
})();
