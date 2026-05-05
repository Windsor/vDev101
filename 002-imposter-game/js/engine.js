/**
 * GameEngine — minimal extensible state machine for party games.
 *
 * Game modules register a definition with this shape:
 * {
 *   id, name, description, minPlayers, maxPlayers,
 *   configSchema?: [{ key, label, type, options?, default }],
 *   setup(ctx)         -> initial game state from ctx.players + ctx.config
 *   phases: {
 *     [phaseId]: {
 *       render(ctx)    -> string (HTML)   // what to show
 *       actions?: {
 *         [actionId](ctx, payload) -> void // mutate state, call ctx.goTo()
 *       }
 *     }
 *   },
 *   initialPhase: phaseId
 * }
 *
 * The engine is intentionally tiny: it owns players + config + the active
 * phase, and delegates everything else to the registered game.
 */
(function (global) {
  'use strict';

  const escape = (s) =>
    String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

  class GameEngine {
    constructor(rootEl) {
      this.root = rootEl;
      this.games = {};
      this.reset();
    }

    reset() {
      this.activeGame = null;
      this.players = [];
      this.config = {};
      this.state = {};
      this.phaseId = null;
      this.screen = 'home'; // home | lobby | playing
    }

    register(game) {
      if (!game || !game.id) throw new Error('Game must have an id');
      this.games[game.id] = game;
    }

    listGames() {
      return Object.values(this.games);
    }

    // ---- Lifecycle ----
    chooseGame(id) {
      const game = this.games[id];
      if (!game) throw new Error(`Unknown game: ${id}`);
      this.activeGame = game;
      this.players = [];
      this.config = (game.configSchema || []).reduce((acc, f) => {
        acc[f.key] = f.default;
        return acc;
      }, {});
      this.screen = 'lobby';
      this.render();
    }

    addPlayer(name) {
      const trimmed = (name || '').trim();
      if (!trimmed) return;
      if (this.players.length >= this.activeGame.maxPlayers) return;
      if (this.players.some((p) => p.name.toLowerCase() === trimmed.toLowerCase())) return;
      this.players.push({ id: crypto.randomUUID(), name: trimmed });
      this.render();
    }

    removePlayer(id) {
      this.players = this.players.filter((p) => p.id !== id);
      this.render();
    }

    setConfig(key, value) {
      this.config[key] = value;
      this.render();
    }

    startGame() {
      if (this.players.length < this.activeGame.minPlayers) return;
      const ctx = this._buildCtx();
      this.state = this.activeGame.setup(ctx) || {};
      this.phaseId = this.activeGame.initialPhase;
      this.screen = 'playing';
      this.render();
    }

    quit() {
      this.reset();
      this.render();
    }

    // ---- Phase actions ----
    dispatch(actionId, payload) {
      const phase = this.activeGame.phases[this.phaseId];
      const handler = phase && phase.actions && phase.actions[actionId];
      if (!handler) return;
      handler(this._buildCtx(), payload);
      this.render();
    }

    goTo(phaseId) {
      this.phaseId = phaseId;
    }

    _buildCtx() {
      const self = this;
      return {
        players: this.players,
        config: this.config,
        state: this.state,
        phaseId: this.phaseId,
        goTo: (id) => self.goTo(id),
        quit: () => self.quit(),
        // small helpers games commonly need
        shuffle: (arr) => {
          const a = arr.slice();
          for (let i = a.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [a[i], a[j]] = [a[j], a[i]];
          }
          return a;
        },
        randomFrom: (arr) => arr[Math.floor(Math.random() * arr.length)],
        escape,
      };
    }

    // ---- Rendering ----
    render() {
      let html = '';
      if (this.screen === 'home') html = this._renderHome();
      else if (this.screen === 'lobby') html = this._renderLobby();
      else if (this.screen === 'playing') html = this._renderPlaying();
      this.root.innerHTML = html;
      this._bind();
    }

    _renderHome() {
      const cards = this.listGames()
        .map(
          (g) => `
          <button class="game-card" data-action="choose-game" data-id="${escape(g.id)}">
            <h2>${escape(g.name)}</h2>
            <p>${escape(g.description)}</p>
            <small>${g.minPlayers}–${g.maxPlayers} players</small>
          </button>`
        )
        .join('');
      return `
        <header class="header">
          <h1>Party Games</h1>
          <p class="subtitle">Pass-and-play on one device</p>
        </header>
        <main class="grid">${cards}</main>
        <footer class="footer">Pluggable framework — add a new game by registering a module.</footer>
      `;
    }

    _renderLobby() {
      const g = this.activeGame;
      const playerList = this.players
        .map(
          (p) => `
          <li class="player-row">
            <span>${escape(p.name)}</span>
            <button class="link" data-action="remove-player" data-id="${p.id}">remove</button>
          </li>`
        )
        .join('');

      const configFields = (g.configSchema || [])
        .map((f) => {
          if (f.type === 'select') {
            const opts = f.options
              .map(
                (o) =>
                  `<option value="${escape(o.value)}" ${
                    String(this.config[f.key]) === String(o.value) ? 'selected' : ''
                  }>${escape(o.label)}</option>`
              )
              .join('');
            return `
              <label class="field">
                <span>${escape(f.label)}</span>
                <select data-action="set-config" data-key="${escape(f.key)}">${opts}</select>
              </label>`;
          }
          if (f.type === 'number') {
            return `
              <label class="field">
                <span>${escape(f.label)}</span>
                <input type="number" min="${f.min ?? 1}" max="${f.max ?? 99}"
                       value="${this.config[f.key]}"
                       data-action="set-config" data-key="${escape(f.key)}" />
              </label>`;
          }
          return '';
        })
        .join('');

      const canStart = this.players.length >= g.minPlayers;
      return `
        <header class="header">
          <button class="link back" data-action="quit">← back</button>
          <h1>${escape(g.name)}</h1>
        </header>
        <main class="lobby">
          <section class="card">
            <h3>Players (${this.players.length}/${g.maxPlayers})</h3>
            <form class="add-player" data-action="add-player">
              <input name="name" placeholder="Player name" autocomplete="off" maxlength="20" />
              <button type="submit">Add</button>
            </form>
            <ul class="player-list">${playerList || '<li class="muted">No players yet.</li>'}</ul>
          </section>

          ${
            configFields
              ? `<section class="card"><h3>Settings</h3><div class="fields">${configFields}</div></section>`
              : ''
          }

          <button class="primary big" data-action="start" ${canStart ? '' : 'disabled'}>
            ${canStart ? 'Start game' : `Need at least ${g.minPlayers} players`}
          </button>
        </main>
      `;
    }

    _renderPlaying() {
      const phase = this.activeGame.phases[this.phaseId];
      const inner = phase.render(this._buildCtx());
      return `
        <header class="header">
          <button class="link back" data-action="quit">← quit</button>
          <h1>${escape(this.activeGame.name)}</h1>
        </header>
        <main class="play">${inner}</main>
      `;
    }

    // ---- Event delegation ----
    _bind() {
      this.root.querySelectorAll('[data-action]').forEach((el) => {
        const action = el.dataset.action;
        if (el.tagName === 'FORM') {
          el.addEventListener('submit', (e) => {
            e.preventDefault();
            const data = Object.fromEntries(new FormData(el).entries());
            this._handle(action, data, el);
            el.reset();
          });
        } else if (el.tagName === 'SELECT' || el.tagName === 'INPUT') {
          el.addEventListener('change', () => {
            this._handle(action, { value: el.value }, el);
          });
        } else {
          el.addEventListener('click', (e) => {
            e.preventDefault();
            this._handle(action, { ...el.dataset }, el);
          });
        }
      });
    }

    _handle(action, payload, el) {
      switch (action) {
        case 'choose-game':
          return this.chooseGame(payload.id);
        case 'add-player':
          return this.addPlayer(payload.name);
        case 'remove-player':
          return this.removePlayer(payload.id);
        case 'set-config':
          return this.setConfig(el.dataset.key, payload.value);
        case 'start':
          return this.startGame();
        case 'quit':
          if (this.screen === 'playing' || this.screen === 'lobby') {
            if (!confirm('Quit and return to home?')) return;
          }
          return this.quit();
        default:
          // Forward to current phase
          return this.dispatch(action, payload);
      }
    }
  }

  global.GameEngine = GameEngine;
})(window);
