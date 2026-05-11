/**
 * FAQ master-detail wiring.
 *
 * Click a question button -> mark it active, unhide the matching answer,
 * hide the others. Only one answer visible at a time. No frameworks.
 */
(function () {
  document.addEventListener('click', function (e) {
    var btn = e.target.closest && e.target.closest('.faq-q');
    if (!btn) return;
    var id = btn.getAttribute('data-faq');
    if (!id) return;

    // Update questions
    var qs = document.querySelectorAll('.faq-q');
    for (var i = 0; i < qs.length; i++) {
      var active = qs[i] === btn;
      qs[i].classList.toggle('active', active);
      qs[i].setAttribute('aria-selected', active ? 'true' : 'false');
    }

    // Swap answers
    var as = document.querySelectorAll('.faq-a');
    for (var j = 0; j < as.length; j++) {
      if (as[j].getAttribute('data-faq') === id) {
        as[j].removeAttribute('hidden');
      } else {
        as[j].setAttribute('hidden', '');
      }
    }
  });
})();
