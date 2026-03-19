// Floating orbs background animation
(function () {
  const container = document.getElementById('bg-orbs');
  if (!container) return;

  const colors = [
    'rgba(108, 92, 231, 0.35)',
    'rgba(253, 121, 168, 0.3)',
    'rgba(0, 206, 209, 0.3)',
    'rgba(162, 155, 254, 0.25)',
    'rgba(129, 236, 236, 0.25)',
  ];

  function spawnOrb() {
    const orb = document.createElement('span');
    const size = Math.random() * 120 + 40;
    const color = colors[Math.floor(Math.random() * colors.length)];
    const left = Math.random() * 100;
    const duration = Math.random() * 15 + 15;
    const delay = Math.random() * 5;

    orb.style.width = size + 'px';
    orb.style.height = size + 'px';
    orb.style.left = left + '%';
    orb.style.background = color;
    orb.style.animationDuration = duration + 's';
    orb.style.animationDelay = delay + 's';

    container.appendChild(orb);

    // Remove after animation ends
    setTimeout(() => {
      orb.remove();
    }, (duration + delay) * 1000);
  }

  // Spawn initial batch
  for (let i = 0; i < 6; i++) {
    spawnOrb();
  }

  // Keep spawning
  setInterval(spawnOrb, 4000);
})();
