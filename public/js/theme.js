// Loaded synchronously in <head> so the saved theme applies before first paint.
(function () {
  // Lets CSS hide elements that scripts will animate in, only when scripts actually run.
  document.documentElement.classList.add('js');
  try {
    var t = localStorage.getItem('verifi-theme');
    if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
  } catch (e) {}
})();
