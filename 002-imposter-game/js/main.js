/**
 * Bootstrap: instantiate the engine, hand it the registered games, render.
 */
(function () {
  'use strict';
  const root = document.getElementById('app');
  const engine = new GameEngine(root);
  GameRegistry.all().forEach((g) => engine.register(g));
  engine.render();

  // Expose for debugging in the console.
  window.__engine = engine;
})();
