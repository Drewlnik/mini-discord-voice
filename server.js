const express = require('express');
const app = express();
const server = require('http').createServer(app);
const io = require('socket.io')(server, {
    cors: { origin: "*" }
});

app.use(express.static('public'));

const roomUsers = {};

io.on('connection', (socket) => {
    let currentRoom = null;
    let currentUsername = null;

    socket.on('join-room', (roomId, userId) => {
        currentRoom = roomId;
        currentUsername = "User_" + userId.substr(0, 4);

        socket.join(roomId);
        
        if (!roomUsers[roomId]) {
            roomUsers[roomId] = [];
        }
        
        if (!roomUsers[roomId].includes(currentUsername)) {
            roomUsers[roomId].push(currentUsername);
        }

        socket.to(roomId).emit('user-connected', userId);
        io.to(roomId).emit('update-user-list', roomUsers[roomId]);
    });

    socket.on('disconnect', () => {
        if (currentRoom && currentUsername && roomUsers[currentRoom]) {
            roomUsers[currentRoom] = roomUsers[currentRoom].filter(user => user !== currentUsername);
            io.to(currentRoom).emit('update-user-list', roomUsers[currentRoom]);
        }
    });

    socket.on('request-user-list', (roomId) => {
        const list = roomUsers[roomId] || [];
        socket.emit('update-user-list', list);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Сервер запущен на порту ${PORT}`));
