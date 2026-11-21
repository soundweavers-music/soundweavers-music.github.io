// 右鍵選單。items: { label, key?, action, disabled?, danger? } 或 '-'
let current = null;

export function closeMenu() { if (current) { current.remove(); current = null; } }

export function showMenu(x, y, items) {
  closeMenu();
  const m = document.createElement('div');
  m.className = 'ctxmenu';
  for (const it of items) {
    if (it === '-') { m.appendChild(document.createElement('hr')); continue; }
    const b = document.createElement('button');
    b.type = 'button';
    b.disabled = !!it.disabled;
    b.textContent = it.label;
    if (it.icon) { b.classList.add('has-icon'); b.insertAdjacentHTML('afterbegin', it.icon); }
    if (it.danger) b.style.color = 'var(--err-tx)';
    if (it.key) { const s = document.createElement('span'); s.textContent = it.key; b.appendChild(s); }
    b.addEventListener('click', () => { closeMenu(); it.action(); });
    m.appendChild(b);
  }
  document.body.appendChild(m);
  const r = m.getBoundingClientRect();
  m.style.left = Math.min(x, innerWidth - r.width - 4) + 'px';
  m.style.top = Math.min(y, innerHeight - r.height - 4) + 'px';
  current = m;
}

window.addEventListener('pointerdown', e => { if (current && !current.contains(e.target)) closeMenu(); }, true);
window.addEventListener('keydown', e => { if (e.key === 'Escape') closeMenu(); });
window.addEventListener('blur', closeMenu);
