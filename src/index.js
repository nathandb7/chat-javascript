const dotenv = require('dotenv');
dotenv.config();

const http = require('http');
const path = require('path');

const express = require('express');
const socketio = require('socket.io');

const mongoose = require('mongoose');

const app = express();
const server = http.createServer(app);
const io = new socketio.Server(server);

// db connection
const password = process.env.DB_PASSWORD;
const uri = `mongodb+srv://admin:${password}@chat-database.i36q0ix.mongodb.net/?retryWrites=true&w=majority&appName=chat-database`;

mongoose.connect(uri)
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

