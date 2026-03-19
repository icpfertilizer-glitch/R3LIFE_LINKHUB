// === DNA Helix Animation ===
(function () {
  const canvas = document.getElementById('dna-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  resize();
  window.addEventListener('resize', resize);

  const nodeCount = 20;
  const speed = 0.008;
  let time = 0;

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const centerX = canvas.width * 0.85;
    const amplitude = 60;
    const spacing = canvas.height / (nodeCount - 1);

    for (let i = 0; i < nodeCount; i++) {
      const y = i * spacing;
      const phase = (i / nodeCount) * Math.PI * 4 + time;

      const x1 = centerX + Math.sin(phase) * amplitude;
      const x2 = centerX + Math.sin(phase + Math.PI) * amplitude;

      // Depth factor for 3D feel
      const depth1 = (Math.cos(phase) + 1) / 2;
      const depth2 = (Math.cos(phase + Math.PI) + 1) / 2;

      // Connecting bar
      ctx.beginPath();
      ctx.moveTo(x1, y);
      ctx.lineTo(x2, y);
      ctx.strokeStyle = 'rgba(33, 150, 243, 0.08)';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Strand 1 node
      ctx.beginPath();
      ctx.arc(x1, y, 3 + depth1 * 3, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(33, 150, 243, ${0.15 + depth1 * 0.2})`;
      ctx.fill();

      // Strand 2 node
      ctx.beginPath();
      ctx.arc(x2, y, 3 + depth2 * 3, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(100, 181, 246, ${0.15 + depth2 * 0.2})`;
      ctx.fill();
    }

    // Draw strand lines
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(33, 150, 243, 0.12)';
    ctx.lineWidth = 1.5;
    for (let i = 0; i < nodeCount; i++) {
      const y = i * spacing;
      const phase = (i / nodeCount) * Math.PI * 4 + time;
      const x = centerX + Math.sin(phase) * amplitude;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    ctx.beginPath();
    ctx.strokeStyle = 'rgba(100, 181, 246, 0.12)';
    ctx.lineWidth = 1.5;
    for (let i = 0; i < nodeCount; i++) {
      const y = i * spacing;
      const phase = (i / nodeCount) * Math.PI * 4 + time + Math.PI;
      const x = centerX + Math.sin(phase) * amplitude;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    time += speed;
    requestAnimationFrame(draw);
  }

  draw();
})();

// === Gentle Bubbles ===
(function () {
  const container = document.getElementById('bg-orbs');
  if (!container) return;

  function spawnBubble() {
    const bubble = document.createElement('span');
    const size = Math.random() * 30 + 10;
    const left = Math.random() * 100;
    const duration = Math.random() * 20 + 20;
    const delay = Math.random() * 3;

    bubble.style.width = size + 'px';
    bubble.style.height = size + 'px';
    bubble.style.left = left + '%';
    bubble.style.animationDuration = duration + 's';
    bubble.style.animationDelay = delay + 's';

    container.appendChild(bubble);

    setTimeout(() => bubble.remove(), (duration + delay) * 1000);
  }

  // Start with a few
  for (let i = 0; i < 4; i++) {
    spawnBubble();
  }

  // Spawn slowly
  setInterval(spawnBubble, 6000);
})();
