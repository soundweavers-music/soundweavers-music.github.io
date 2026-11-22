// 右鍵選單。items: { label, key?, action, disabled?, danger? } 或 '-'
let current = null;

export function closeMenu() { if (current) { current.remove(); current = null; } }

// 把一批項目畫進容器（單欄或多欄共用）
function renderItems(box, items) {
  for (const it of items) {
    if (it === '-') { box.appendChild(document.createElement('hr')); continue; }
    if (it.header) {                       // 分類標題（例如效果器選單的「動態」「調變」）
      const h = document.createElement('div');
      h.className = 'ctx-head';
      h.textContent = it.header;
      box.appendChild(h);
      continue;
    }
    const b = document.createElement('button');
    b.type = 'button';
    b.disabled = !!it.disabled;
    b.textContent = it.label;
    if (it.indent) b.classList.add('indent');
    if (it.icon) { b.classList.add('has-icon'); b.insertAdjacentHTML('afterbegin', it.icon); }
    // 配色選單的色票：三個小方塊（背景、主色、文字）
    if (it.swatch) {
      b.classList.add('has-swatch');
      b.insertAdjacentHTML('beforeend',
        '<span class="sw-set">' + it.swatch.map(c => `<i style="background:${c}"></i>`).join('') + '</span>');
    }
    if (it.danger) b.style.color = 'var(--err-tx)';
    if (it.key) { const s = document.createElement('span'); s.textContent = it.key; b.appendChild(s); }
    b.addEventListener('click', () => { closeMenu(); it.action(); });
    box.appendChild(b);
  }
}

function place(m, x, y) {
  document.body.appendChild(m);
  const r = m.getBoundingClientRect();
  // 選單太長（例如 20 套配色、整份快捷鍵）時 CSS 會讓它自己捲動，
  // 位置只夾在視窗內，不要跑到上面或左邊去
  m.style.left = Math.max(4, Math.min(x, innerWidth - r.width - 4)) + 'px';
  m.style.top = Math.max(4, Math.min(y, innerHeight - r.height - 4)) + 'px';
  current = m;
}

export function showMenu(x, y, items) {
  closeMenu();
  const m = document.createElement('div');
  m.className = 'ctxmenu';
  renderItems(m, items);
  place(m, x, y);
}

// 多欄選單（快捷鍵一覽用）：columns = [[item, …], [item, …]]，一欄一欄排
export function showMenuCols(x, y, columns) {
  closeMenu();
  const m = document.createElement('div');
  m.className = 'ctxmenu cols';
  for (const col of columns) {
    const c = document.createElement('div');
    c.className = 'col';
    renderItems(c, col);
    m.appendChild(c);
  }
  place(m, x, y);
}

window.addEventListener('pointerdown', e => { if (current && !current.contains(e.target)) closeMenu(); }, true);
window.addEventListener('keydown', e => { if (e.key === 'Escape') closeMenu(); });
window.addEventListener('blur', closeMenu);
