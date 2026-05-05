/**
 * Tiny global registry. Game modules call GameRegistry.register(def).
 * The engine reads from it on bootstrap.
 */
(function (global) {
  'use strict';
  const games = [];
  global.GameRegistry = {
    register(def) {
      games.push(def);
    },
    all() {
      return games.slice();
    },
  };
})(window);
