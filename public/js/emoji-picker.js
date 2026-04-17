/**
 * Emoji Picker - Notion-style icon selector
 * Supports: Emoji, Image URL
 */
const EmojiPicker = (() => {
  // Popular emojis grouped by category (curated like Notion)
  const EMOJI_DATA = {
    'Smileys': ['😀','😃','😄','😁','😆','😅','🤣','😂','🙂','😊','😇','🥰','😍','🤩','😘','😋','😛','🤔','🤗','🤫','😎','🥳','😏','😒','😞','😔','😟','😕','😤','😠','🤯','😳','🥺','😱','😨','😰','😥','😢','😭','😩'],
    'People': ['👋','🤚','🖐️','✋','🖖','👌','🤌','🤏','✌️','🤞','🤟','🤘','🤙','👈','👉','👆','👇','☝️','👍','👎','✊','👊','🤛','🤜','👏','🙌','👐','🤲','🤝','🙏','💪','🦾','🖕'],
    'Nature': ['🌱','🌲','🌳','🌴','🌵','🌾','🌿','☘️','🍀','🍁','🍂','🍃','🌺','🌻','🌼','🌷','🌹','🥀','💐','🌸','🍄','🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐨','🐯','🦁','🐮','🐷'],
    'Food': ['🍎','🍊','🍋','🍌','🍉','🍇','🍓','🫐','🍈','🍒','🍑','🥭','🍍','🥥','🥝','🍅','🥑','🥦','🥬','🌽','🥕','🧄','🧅','🍔','🍕','🌮','🍜','🍣','🍩','🍪','🎂','🍰','☕','🍵','🧃'],
    'Activities': ['⚽','🏀','🏈','⚾','🥎','🎾','🏐','🏉','🥏','🎱','🏓','🏸','🏒','🥅','⛳','🎯','🏹','🎣','🥊','🥋','🎿','⛷️','🏂','🏋️','🤸','⛹️','🤺','🏇','🧘','🏄','🏊','🚴','🧗'],
    'Travel': ['🚗','🚕','🚙','🚌','🚎','🏎️','🚓','🚑','🚒','🚐','🛻','🚚','🚛','🚜','🛵','🏍️','🚲','🛴','🚃','🚋','🚆','✈️','🛩️','🚀','🛸','🚁','🛶','⛵','🚢','🏠','🏢','🏥','🏦','🏫'],
    'Objects': ['⌚','📱','💻','⌨️','🖥️','🖨️','🖱️','🖲️','💽','💾','💿','📀','📷','📹','🎥','📽️','🎞️','📞','📟','📠','📺','📻','🎙️','🎚️','🎛️','⏱️','⏰','📡','🔋','🔌','💡','🔦','🕯️','📦','📮'],
    'Symbols': ['❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❣️','💕','💞','💓','💗','💖','💘','💝','⭐','🌟','✨','⚡','🔥','💯','✅','❌','⛔','🚫','❓','❗','💤','💬','💭','🔔','🔇','📌','📍','🏳️','🏴','🚩'],
    'Business': ['📊','📈','📉','📋','📝','📄','📃','📑','📎','🖇️','📐','📏','🗂️','📁','📂','🗃️','🗄️','🗑️','🔒','🔓','🔑','🗝️','🔨','⚙️','🔧','🔩','🧲','💼','📌','📍','🏷️','🔖','📬','📭','📮','📯'],
    'Medical': ['💊','💉','🩺','🩹','🩻','🧬','🦠','🔬','🧪','🏥','⚕️','🩸','🫀','🫁','🧠','🦷','🦴','👁️','👃','👂','🫂','❤️‍🩹'],
  };

  let currentCallback = null;
  let pickerEl = null;

  function create() {
    if (pickerEl) return pickerEl;

    pickerEl = document.createElement('div');
    pickerEl.className = 'emoji-picker-overlay';
    pickerEl.innerHTML = `
      <div class="emoji-picker">
        <div class="emoji-picker-header">
          <h3>เลือก Icon</h3>
          <button class="emoji-picker-close">&times;</button>
        </div>
        <div class="emoji-picker-tabs">
          <button class="emoji-tab active" data-mode="emoji">😀 Emoji</button>
          <button class="emoji-tab" data-mode="url">🔗 URL รูปภาพ</button>
        </div>
        <div class="emoji-picker-body">
          <div class="emoji-mode-emoji">
            <input type="text" class="emoji-search" placeholder="ค้นหา emoji...">
            <div class="emoji-categories"></div>
          </div>
          <div class="emoji-mode-url" style="display:none;">
            <div class="form-group" style="margin:16px 0;">
              <label>URL รูปภาพ</label>
              <input type="url" class="emoji-url-input" placeholder="https://example.com/icon.png">
              <div class="emoji-url-preview" style="margin-top:8px;"></div>
            </div>
            <button class="btn btn-primary btn-sm emoji-url-confirm">ใช้รูปนี้</button>
          </div>
        </div>
      </div>
    `;

    // Render emoji grid
    const categoriesEl = pickerEl.querySelector('.emoji-categories');
    let html = '';
    for (const [category, emojis] of Object.entries(EMOJI_DATA)) {
      html += `<div class="emoji-cat-label">${category}</div>`;
      html += '<div class="emoji-grid">';
      emojis.forEach(e => {
        html += `<button class="emoji-btn" data-emoji="${e}" title="${e}">${e}</button>`;
      });
      html += '</div>';
    }
    categoriesEl.innerHTML = html;

    // Event: close
    pickerEl.querySelector('.emoji-picker-close').addEventListener('click', close);
    pickerEl.addEventListener('click', (e) => {
      if (e.target === pickerEl) close();
    });

    // Event: emoji click
    categoriesEl.addEventListener('click', (e) => {
      const btn = e.target.closest('.emoji-btn');
      if (!btn) return;
      if (currentCallback) currentCallback({ type: 'emoji', value: btn.dataset.emoji });
      close();
    });

    // Event: search
    const searchInput = pickerEl.querySelector('.emoji-search');
    searchInput.addEventListener('input', () => {
      const q = searchInput.value.toLowerCase();
      pickerEl.querySelectorAll('.emoji-btn').forEach(btn => {
        btn.style.display = '';
      });
      pickerEl.querySelectorAll('.emoji-cat-label').forEach(label => {
        label.style.display = '';
      });
      if (q) {
        pickerEl.querySelectorAll('.emoji-cat-label').forEach(label => {
          label.style.display = 'none';
        });
      }
    });

    // Event: tab switching
    pickerEl.querySelectorAll('.emoji-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        pickerEl.querySelectorAll('.emoji-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        const mode = tab.dataset.mode;
        pickerEl.querySelector('.emoji-mode-emoji').style.display = mode === 'emoji' ? '' : 'none';
        pickerEl.querySelector('.emoji-mode-url').style.display = mode === 'url' ? '' : 'none';
      });
    });

    // Event: URL preview
    const urlInput = pickerEl.querySelector('.emoji-url-input');
    const urlPreview = pickerEl.querySelector('.emoji-url-preview');
    urlInput.addEventListener('input', () => {
      const url = urlInput.value.trim();
      if (url) {
        urlPreview.innerHTML = `<img src="${url}" style="width:64px;height:64px;object-fit:contain;border-radius:8px;border:1px solid var(--border);" onerror="this.style.display='none'" onload="this.style.display=''">`;
      } else {
        urlPreview.innerHTML = '';
      }
    });

    // Event: URL confirm
    pickerEl.querySelector('.emoji-url-confirm').addEventListener('click', () => {
      const url = urlInput.value.trim();
      if (url && currentCallback) {
        currentCallback({ type: 'url', value: url });
      }
      close();
    });

    document.body.appendChild(pickerEl);
    return pickerEl;
  }

  function open(callback) {
    currentCallback = callback;
    const el = create();
    el.style.display = 'flex';
    // Reset
    el.querySelector('.emoji-search').value = '';
    el.querySelector('.emoji-url-input').value = '';
    el.querySelector('.emoji-url-preview').innerHTML = '';
    el.querySelectorAll('.emoji-btn').forEach(b => b.style.display = '');
    el.querySelectorAll('.emoji-cat-label').forEach(l => l.style.display = '');
    // Reset to emoji tab
    el.querySelectorAll('.emoji-tab').forEach(t => t.classList.remove('active'));
    el.querySelector('.emoji-tab[data-mode="emoji"]').classList.add('active');
    el.querySelector('.emoji-mode-emoji').style.display = '';
    el.querySelector('.emoji-mode-url').style.display = 'none';
  }

  function close() {
    if (pickerEl) pickerEl.style.display = 'none';
    currentCallback = null;
  }

  // Render icon in HTML (for display)
  function renderIcon(iconType, iconValue, size = 48) {
    if (!iconType || !iconValue) {
      return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="color:var(--text-muted);">
        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
      </svg>`;
    }
    if (iconType === 'emoji') {
      return `<span style="font-size:${size}px;line-height:1;">${iconValue}</span>`;
    }
    if (iconType === 'url') {
      return `<img src="${iconValue}" style="width:${size}px;height:${size}px;object-fit:contain;" loading="lazy">`;
    }
    // Legacy base64 image
    if (iconType === 'image' || iconValue.startsWith('data:')) {
      return `<img src="${iconValue}" style="width:${size}px;height:${size}px;object-fit:cover;" loading="lazy">`;
    }
    return `<span style="font-size:${size}px;line-height:1;">${iconValue}</span>`;
  }

  return { open, close, renderIcon };
})();
