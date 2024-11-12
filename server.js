const { create } = require('domain');
const express = require('express');
const fs = require('fs');
const https = require('https');
const socketIo = require('socket.io');
const { v4: uuidV4 } = require('uuid');

const app = express();
const port = 3000;

app.use(function(req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
  next();
});
const options = {
  key: fs.readFileSync('key.pem'),  
  cert: fs.readFileSync('cert.pem') 
};


const server = https.createServer(options, app);
const io = socketIo(server);

app.set('view engine', 'ejs');
app.use(express.static('public'));

app.get('/', (req, res) => {
  res.redirect(`/${uuidV4()}`);
});

app.get('/:room', (req, res) => {
  res.render('room', { roomId: req.params.room });
});

io.on('connection', socket => {
  socket.on('join-room', (roomId, userId) => {
    socket.join(roomId);
    socket.roomId = roomId;

    socket.broadcast.to(roomId).emit('user-connected', userId);
  });

  socket.on('createMessage', (message, userId) => {
    const roomId = socket.roomId;

    if (roomId) {
      socket.broadcast.to(roomId).emit('createMessage', message, userId);
    } else {
      console.error('Room ID is undefined');
    }
  });
});

server.listen(port, '0.0.0.0', () => {
  console.log(`Server is running on https://192.168.170.143:${port}`);
});
