(() => {
  const bar = document.querySelector('.topbar');
  if (!bar) return;
  let lastY = window.scrollY;
  let ticking = false;

  const measure = () => {
    const h = Math.ceil(bar.getBoundingClientRect().height + 6);
    document.documentElement.style.setProperty('--smartbar-h', `${h}px`);
  };

  const show = () => {
    bar.classList.remove('topbar-hidden');
    document.body.classList.add('smart-topbar-visible');
  };
  const hide = () => {
    bar.classList.add('topbar-hidden');
    document.body.classList.remove('smart-topbar-visible');
  };

  const update = () => {
    ticking = false;
    const y = window.scrollY;
    const delta = y - lastY;
    if (y < 18) show();
    else if (delta > 5) hide();
    else if (delta < -5) show();
    lastY = y;
  };

  window.addEventListener('scroll', () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(update);
  }, { passive:true });
  window.addEventListener('resize', measure, { passive:true });
  measure();
  show();
})();
