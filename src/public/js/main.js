// public/js/main.js
$(function () {
    const socket = io();
  
    // DOM
    const $menssageForm = $('#message-form');
    const $menssageBox  = $('#message');
    const $chat         = $('#chat');
  
    const $nickForm  = $('#nickForm');
    const $nickError = $('#nickError');
    const $nickname  = $('#nickname');
  
    const $users = $('#usernames');
  
    // Guardo mi nick para diferenciar burbujas
    let currentNick = null;
  
    // Utilidad: escape básico para evitar inyección de HTML
    const escapeHtml = (str) =>
      String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
  
    // Autoscroll al final después de inyectar contenido
    function scrollToBottom() {
      const el = $chat.get(0);
      if (!el) return;
      el.scrollTop = el.scrollHeight;
    }
  
    // Construyo una burbuja (mensaje normal)
    function bubbleHtml({ nick, msg, self = false }) {
      const safeNick = escapeHtml(nick);
      const safeMsg  = escapeHtml(msg);
  
      // Clases Tailwind para self/other
      const align   = self ? 'justify-end' : 'justify-start';
      const bubble  = self
        ? 'bg-amber-500 text-white'
        : 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-100';
  
      const nickClr = self ? 'text-white/90' : 'text-slate-500 dark:text-slate-400';
  
      return `
        <div class="mb-2 flex ${align}">
          <div class="max-w-[85%] rounded-2xl ${bubble} px-3 py-2 shadow-sm">
            <div class="mb-0.5 text-xs ${nickClr}">${safeNick}</div>
            <div class="whitespace-pre-wrap break-words">${safeMsg}</div>
          </div>
        </div>
      `;
    }
  
    // Burbuja especial para whispers
    function whisperHtml({ nick, msg }) {
      const safeNick = escapeHtml(nick);
      const safeMsg  = escapeHtml(msg);
  
      return `
        <div class="mb-2 flex justify-start">
          <div class="max-w-[85%] rounded-2xl border border-amber-400/50 bg-amber-50/70 px-3 py-2 text-amber-900 shadow-sm dark:border-amber-300/40 dark:bg-amber-950/30 dark:text-amber-100">
            <div class="mb-0.5 text-xs text-amber-600 dark:text-amber-300">whisper · ${safeNick}</div>
            <div class="whitespace-pre-wrap break-words">${safeMsg}</div>
          </div>
        </div>
      `;
    }
  
    // Mensaje de sistema o error
    function systemHtml(text, tone = 'error') {
      const t = escapeHtml(text);
      const base = 'rounded-xl px-3 py-2 text-sm';
      const cls =
        tone === 'ok'
          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-100 dark:border-emerald-800'
          : 'bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-900/30 dark:text-rose-100 dark:border-rose-800';
      return `<div class="mb-2 flex justify-center"><div class="${base} ${cls}">${t}</div></div>`;
    }
  
    // ------- Login --------
    $nickForm.on('submit', (e) => {
      e.preventDefault();
      const name = ($nickname.val() || '').trim();
      if (!name) {
        $nickError
          .html('<div class="text-sm rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-rose-700 dark:border-rose-800 dark:bg-rose-900/30 dark:text-rose-100">El nombre de usuario no puede estar vacío.</div>');
        return;
      }
  
      socket.emit('new user', name, (ok, message) => {
        if (ok) {
          currentNick = name; // guardo mi nick para distinguir burbujas
          // tolero tanto CSS como clases Tailwind
          $('#nickWrap').addClass('hidden').hide();
          $('#contentWrap').removeClass('hidden').show();
  
          // limpio error si había
          $nickError.empty();
        } else {
          const reason = message || 'That username already exists.';
          $nickError
            .html(`<div class="text-sm rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-rose-700 dark:border-rose-800 dark:bg-rose-900/30 dark:text-rose-100">${escapeHtml(reason)}</div>`);
        }
        $nickname.val('');
      });
    });
  
    // ------- Enviar mensaje --------
    // Enter envía, Shift+Enter hace salto de línea
    $menssageBox.on('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        $menssageForm.trigger('submit');
      }
    });
  
    $menssageForm.on('submit', (e) => {
      e.preventDefault();
      const $btn = $menssageForm.find('button[type="submit"]');
  
      const text = ($menssageBox.val() || '').trim();
      if (!text) return;
  
      // deshabilito para evitar dobles envíos
      $btn.prop('disabled', true).addClass('opacity-60');
  
      socket.emit('send message', text, (err) => {
        if (err) {
          $chat.append(systemHtml(err, 'error'));
          scrollToBottom();
        }
        // si no hay error, renderizo mi propio mensaje localmente (el server también emite)
        if (!err) {
          $chat.append(
            bubbleHtml({ nick: currentNick || 'me', msg: text, self: true })
          );
          scrollToBottom();
        }
        $menssageBox.val('');
        $btn.prop('disabled', false).removeClass('opacity-60');
      });
    });
  
    // ------- Sockets in --------
    socket.on('new message', function (data) {
      const self = (currentNick && data && data.nick && data.nick.toLowerCase() === currentNick.toLowerCase());
  
      // Evito duplicar: si ya lo mostré como "self" al enviar, no vuelvo a renderizar el eco del servidor
      if (self) return;
  
      $chat.append(
        bubbleHtml({ nick: data.nick, msg: data.msg, self })
      );
      scrollToBottom();
    });
  
    socket.on('usernames', (data) => {
      // render chips de usuarios
      let html = '';
      for (let i = 0; i < data.length; i++) {
        const u = escapeHtml(data[i]);
        html += `
          <span class="mr-2 mt-2 inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
            <i class="fa-regular fa-user"></i> ${u}
          </span>`;
      }
      $users.html(html);
    });
  
    socket.on('whisper', (data) => {
      $chat.append(whisperHtml(data));
      scrollToBottom();
    });
  
    socket.on('load old msgs', (msgs) => {
      for (let i = 0; i < msgs.length; i++) {
        const m = msgs[i] || {};
        const self = (currentNick && m.nick && m.nick.toLowerCase() === currentNick.toLowerCase());
        $chat.append(
          bubbleHtml({ nick: m.nick || 'user', msg: m.msg || '', self })
        );
      }
      scrollToBottom();
    });
  });
  