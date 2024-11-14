require('dotenv').config();

const express = require('express');
const https = require('https');
const socketIo = require('socket.io');
const { v4: uuidV4 } = require('uuid');
const fs = require('fs');

const app = express();

app.use(function(req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
  next();
});

const options = {
  key: fs.readFileSync('key.pem'),  
  cert: fs.readFileSync('cert.pem'),
  secureOptions: require('constants').SSL_OP_NO_TLSv1 | require('constants').SSL_OP_NO_TLSv1_1,
  ciphers: [
    'ECDHE-RSA-AES128-GCM-SHA256',
    'ECDHE-RSA-AES256-GCM-SHA384',
    'ECDHE-RSA-AES128-SHA256',
    'ECDHE-RSA-AES256-SHA384',
    'AES128-GCM-SHA256',
    'AES256-GCM-SHA384',
    'AES128-SHA256',
    'AES256-SHA256'
  ].join(':'),
  honorCipherOrder: true
};

const server = https.createServer(options, app);

const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const rooms = {};

// Add debugging
function logRooms() {
    console.log('Current active rooms:', Object.keys(rooms));
}

function generateRoomCode() {
    return Math.floor(1000 + Math.random() * 9000).toString();
}

app.use(express.static('public'));
app.set('view engine', 'ejs');

app.get('/', (req, res) => {
    res.redirect('/join-room');
});

app.get('/join-room', (req, res) => {
    res.render('join-room');
});

app.get('/room/:room', (req, res) => {
    res.render('room', { roomId: req.params.room });
});

app.get('/active-rooms', (req, res) => {
    res.render('active-rooms');
});

app.get('/api/active-rooms', (req, res) => {
    logRooms();
    const activeRooms = Object.keys(rooms)
        .filter(roomId => rooms[roomId] && rooms[roomId].length > 0)
        .map(roomId => ({
            id: roomId,
            name: `Room ${roomId.slice(0,8)}...`,
            participants: rooms[roomId].length
        }));
    res.json(activeRooms);
});

app.get('/create-room', (req, res) => {
    const roomId = generateRoomCode();
    if (!rooms[roomId]) {
        rooms[roomId] = [];
        res.json({ roomId });
    } else {
        // Try again if code exists
        res.redirect('/create-room');
    }
});

io.on('connection', socket => {
    socket.on('join-room', (roomId) => {
        if (!rooms[roomId]) {
            rooms[roomId] = [];
        }
        rooms[roomId].push(socket.id);
        logRooms();
        socket.join(roomId);
        socket.to(roomId).emit('user-connected', socket.id);

        socket.on('disconnect', () => {
            if (rooms[roomId]) {
                // Remove user from room
                rooms[roomId] = rooms[roomId].filter(id => id !== socket.id);
                
                // Notify other users in the room
                socket.to(roomId).emit('user-disconnected', socket.id);
                
                // Cleanup empty room
                if (rooms[roomId].length === 0) {
                    delete rooms[roomId];
                    console.log(`Room ${roomId} deleted - no participants left`);
                } else {
                    console.log(`User ${socket.id} left room ${roomId}. Remaining participants: ${rooms[roomId].length}`);
                }
                logRooms();
            }
        });

        socket.on('offer', (userId, offer) => {
            socket.to(userId).emit('offer', socket.id, offer);
        });

        socket.on('answer', (userId, answer) => {
            socket.to(userId).emit('answer', socket.id, answer);
        });

        socket.on('candidate', (userId, candidate) => {
            socket.to(userId).emit('candidate', socket.id, candidate);
        });

        socket.on('createMessage', (message, username) => {
            socket.to(roomId).emit('createMessage', message, username);
        });
    });
});

const server = app.listen(process.env.PORT || 3000, process.env.HOST || 'localhost', () => {
    console.log(`Server running on http://${process.env.HOST || 'localhost'}:${process.env.PORT || 3000}`);
});

server.listen(3000,"0.0.0.0" ,() => {
    console.log('Server is running on port 3000');
});
