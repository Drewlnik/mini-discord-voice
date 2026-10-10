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

    socket.on('join-room', (roomId, userId, customUsername) => {
        currentRoom = roomId;
        currentUsername = customUsername;

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

    socket.on('send-chat-message', (roomId, author, text) => {
        io.to(roomId).emit('receive-chat-message', author, text);
    });

    // Передаем сигнал начала демонстрации экрана всем участникам
    socket.on('start-screen-share', (roomId, userId, username) => {
        socket.to(roomId).emit('screen-shared-by-user', userId, username);
    });

    // Передаем сигнал остановки демонстрации экрана
    socket.on('stop-screen-share', (roomId) => {
        socket.to(roomId).emit('screen-share-stopped-by-user');
    });

    socket.on('disconnect', () => {
        if (currentRoom && currentUsername && roomUsers[currentRoom]) {
            roomUsers[currentRoom] = roomUsers[currentRoom].filter(user => user !== currentUsername);
            io.to(currentRoom).emit('update-user-list', roomUsers[currentRoom]);
            socket.to(currentRoom).emit('screen-share-stopped-by-user');
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log('Бэкенд успешно запущен!'));
