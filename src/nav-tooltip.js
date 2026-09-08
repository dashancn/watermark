(() => {
  const ecosystemNav = document.querySelector('.site-header nav');
  if (!ecosystemNav) return;

  const navTooltip = document.createElement('div');
  navTooltip.id = 'nav-tooltip';
  navTooltip.className = 'nav-tooltip';
  navTooltip.setAttribute('role', 'tooltip');
  document.body.append(navTooltip);
  let tooltipAnchor = null;

  function placeNavTooltip(anchor) {
    navTooltip.textContent = anchor.dataset.tooltip;
    navTooltip.classList.add('show');
    navTooltip.style.opacity = '1';
    const anchorRect = anchor.getBoundingClientRect();
    const tipRect = navTooltip.getBoundingClientRect();
    const edge = 8;
    const gap = 7;
    let left = anchorRect.left + (anchorRect.width - tipRect.width) / 2;
    left = Math.max(edge, Math.min(left, innerWidth - tipRect.width - edge));
    let top = anchorRect.bottom + gap;
    if (top + tipRect.height > innerHeight - edge) top = anchorRect.top - tipRect.height - gap;
    top = Math.max(edge, Math.min(top, innerHeight - tipRect.height - edge));
    navTooltip.style.left = `${left}px`;
    navTooltip.style.top = `${top}px`;
    tooltipAnchor = anchor;
  }

  function hideNavTooltip(anchor) {
    if (tooltipAnchor !== anchor) return;
    navTooltip.classList.remove('show');
    navTooltip.style.opacity = '0';
    tooltipAnchor = null;
  }

  for (const link of ecosystemNav.querySelectorAll('a[data-tooltip]')) link.setAttribute('aria-describedby', navTooltip.id);
  ecosystemNav.addEventListener('mouseover', event => {
    const link = event.target.closest('a[data-tooltip]');
    if (link) placeNavTooltip(link);
  });
  ecosystemNav.addEventListener('mouseout', event => {
    const link = event.target.closest('a[data-tooltip]');
    if (link && !link.contains(event.relatedTarget)) hideNavTooltip(link);
  });
  ecosystemNav.addEventListener('focusin', event => {
    const link = event.target.closest('a[data-tooltip]');
    if (link) placeNavTooltip(link);
  });
  ecosystemNav.addEventListener('focusout', event => {
    const link = event.target.closest('a[data-tooltip]');
    if (link) hideNavTooltip(link);
  });
  addEventListener('resize', () => tooltipAnchor && placeNavTooltip(tooltipAnchor));
  addEventListener('scroll', () => tooltipAnchor && placeNavTooltip(tooltipAnchor), { passive: true });
})();
