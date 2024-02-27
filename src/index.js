const http = require('http');
const path = require('path');

const express = require('express');
const socketio = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new socketio.Server(server);

// settings
app.set('port', process.env.PORT || 3000)

require('./sockets')(io);

// static files
app.use(express.static(path.join(__dirname, 'public')));

// starting tthe server
server.listen(app.get('port'), () => {
  console.log(`Servidor escuchando en el puerto ${app.get('port')}`);
});

