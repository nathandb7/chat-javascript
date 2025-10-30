// src/sockets.js
// Módulo de sockets. Manejo de usuarios conectados, chat público y susurros (/w).
// Agrego validaciones, orden correcto de históricos, control simple de flood
// y manejo de errores para que no tumbe el proceso si falla la DB.

const Chat = require('./models/Chat');

// Mapa de usuarios conectados: key = nickname normalizado, value = { socket, displayName }
const users = new Map();

// Normalizo nombres para comparación case-insensitive y evitar colisiones visuales
function normalizeName(name = '') {
  return String(name).trim().toLowerCase();
}

// Restrinjo el nickname a un patrón razonable
function isValidNickname(name) {
  if (typeof name !== 'string') return false;
  const n = name.trim();
  if (n.length < 3 || n.length > 20) return false;
  // Letras, números, guión bajo, puntos y guiones
  return /^[a-zA-Z0-9._-]+$/.test(n);
}

// Limito tamaño de mensaje y quito basura
function sanitizeMessage(msg) {
  let s = '';
  try {
    s = String(msg ?? '').replace(/\r\n/g, '\n').trim();
  } catch {
    s = '';
  }
  const MAX = 2000; // tamaño máximo para evitar payloads enormes
  if (s.length > MAX) s = s.slice(0, MAX);
  return s;
}

// Control simple de flood por socket: intervalo mínimo entre mensajes
function canSendNow(socket, minMs = 300) {
  const now = Date.now();
  if (!socket._lastMsgAt) {
    socket._lastMsgAt = now;
    return true;
  }
  if (now - socket._lastMsgAt >= minMs) {
    socket._lastMsgAt = now;
    return true;
  }
  return false;
}

module.exports = function (io) {
  io.on('connection', async (socket) => {
    console.log('usuario conectado:', socket.id);

    // Cargo últimos N mensajes en orden cronológico (viejos -> nuevos)
    try {
      const messages = await Chat.find({})
        .sort({ created_at: -1, _id: -1 })
        .limit(50)
        .lean();

      const ordered = messages.reverse();
      socket.emit('load old msgs', ordered);
    } catch (err) {
      console.error('error cargando mensajes:', err.message);
      socket.emit('load old msgs', []); // no bloqueo al cliente
    }

    // Alta de usuario
    socket.on('new user', (data, cb) => {
      const displayName = typeof data === 'string' ? data.trim() : '';
      const key = normalizeName(displayName);

      if (!isValidNickname(displayName)) {
        if (typeof cb === 'function') cb(false, 'El usuario debe tener 3-20 caracteres y solo letras, números, . _ -');
        return;
      }
      if (users.has(key)) {
        if (typeof cb === 'function') cb(false, 'Ese usuario ya está en uso');
        return;
      }

      socket.nickname = displayName;
      socket.nicknameKey = key;
      users.set(key, { socket, displayName });

      if (typeof cb === 'function') cb(true);
      updateNicknames();
    });

    // Envío de mensajes
    socket.on('send message', async (data, cb) => {
      try {
        if (!socket.nickname || !socket.nicknameKey || !users.has(socket.nicknameKey)) {
          if (typeof cb === 'function') cb('Primero tenés que elegir un usuario');
          return;
        }

        if (!canSendNow(socket)) {
          if (typeof cb === 'function') cb('Estás enviando muy rápido, esperá un momento');
          return;
        }

        let msg = sanitizeMessage(data);
        if (!msg) {
          if (typeof cb === 'function') cb('El mensaje está vacío');
          return;
        }

        // Susurro: formato "/w usuario mensaje"
        if (msg.startsWith('/w ')) {
          msg = msg.slice(3).trim();
          const index = msg.indexOf(' ');
          if (index === -1) {
            if (typeof cb === 'function') cb('Error: usá /w usuario mensaje');
            return;
          }

          const targetDisplay = msg.substring(0, index).trim();
          const content = sanitizeMessage(msg.substring(index + 1));

          if (!content) {
            if (typeof cb === 'function') cb('Error: el susurro no puede estar vacío');
            return;
          }

          const targetKey = normalizeName(targetDisplay);
          if (!users.has(targetKey)) {
            if (typeof cb === 'function') cb('Error: usuario destino no está conectado');
            return;
          }

          if (targetKey === socket.nicknameKey) {
            if (typeof cb === 'function') cb('No podés susurrarte a vos mismo');
            return;
          }

          const target = users.get(targetKey);
          target.socket.emit('whisper', {
            msg: content,
            nick: socket.nickname,
          });

          if (typeof cb === 'function') cb(null); // sin error
          return;
        }

        // Mensaje público: persisto y luego emito
        const newMsg = new Chat({
          msg,
          nick: socket.nickname,
        });

        try {
          await newMsg.save();
        } catch (err) {
          console.error('error guardando mensaje:', err.message);
          if (typeof cb === 'function') cb('No se pudo guardar tu mensaje');
          return;
        }

        io.emit('new message', {
          msg,
          nick: socket.nickname,
        });

        if (typeof cb === 'function') cb(null); // OK
      } catch (err) {
        console.error('error en send message:', err);
        if (typeof cb === 'function') cb('Ocurrió un error enviando el mensaje');
      }
    });

    // Desconexión
    socket.on('disconnect', () => {
      if (!socket.nicknameKey) return;
      const user = users.get(socket.nicknameKey);
      if (user && user.socket.id === socket.id) {
        users.delete(socket.nicknameKey);
        updateNicknames();
      }
    });

    // Emite la lista de usuarios conectados a todos
    function updateNicknames() {
      const list = Array.from(users.values()).map((u) => u.displayName);
      io.emit('usernames', list);
    }
  });
};
