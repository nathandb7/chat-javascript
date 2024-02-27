const http = require('http');
const path = require('path');

const express = require('express');
const socketio = require('socket.io');

const mongoose = require('mongoose');

const app = express();
const server = http.createServer(app);
const io = new socketio.Server(server);

// db connection
mongoose.connect('mongodb://localhost/chat-database')
  .then(db => console.log('db is connected'))
  .catch(err => console.log(err));

// settings
app.set('port', process.env.PORT || 3000)

require('./sockets')(io);

// static files
app.use(express.static(path.join(__dirname, 'public')));

// starting tthe server
server.listen(app.get('port'), () => {
  console.log(`Servidor escuchando en el puerto ${app.get('port')}`);
});

