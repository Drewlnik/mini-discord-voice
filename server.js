const express = require('express');
const app = express();
const server = require('http').createServer(app);
const io = require('socket.io')(server, {
    cors: { origin: "*" }
});

app.use(express.static('public'));

const roomUsers = {};
const roomAdmin = {}; 
const userSocketMap = {}; 

// Ваш секретный пароль администратора
const SECRET_ADMIN_PASSWORD = "48103650550";

io.on('connection', (socket) => {
    let currentRoom = null;
    let currentUsername = null;

    socket.on('join-room', (roomId, userId, customUsername, inputPassword) => {
        currentRoom = roomId;
        currentUsername = customUsername;
        userSocketMap[currentUsername] = socket.id; 

        socket.join(roomId);
        
        if (!roomUsers[roomId]) {
            roomUsers[roomId] = [];
        }
        
        if (!roomUsers[roomId].includes(currentUsername)) {
            roomUsers[roomId].push(currentUsername);
        }

        // Проверяем секретный ключ на подлинность
        if (inputPassword === SECRET_ADMIN_PASSWORD) {
            roomAdmin[roomId] = currentUsername; 
            socket.emit('admin-verified'); 
        }

        socket.to(roomId).emit('user-connected', userId);
        io.to(roomId).emit('update-user-list', roomUsers[roomId], roomAdmin[roomId] || null);
    });

    socket.on('send-chat-message', (roomId, author, text) => {
        const isAdminMsg = (roomAdmin[roomId] === author);
        io.to(roomId).emit('receive-chat-message', author, text, isAdminMsg);
    });

    socket.on('start-screen-share', (roomId, userId, username) => {
        socket.to(roomId).emit('screen-shared-by-user', userId, username);
    });

    socket.on('stop-screen-share', (roomId) => {
        socket.to(roomId).emit('screen-share-stopped-by-user');
    });

    socket.on('speech-state-change', (roomId, username, isSpeaking) => {
        io.to(roomId).emit('user-speech-updated', username, isSpeaking);
    });

    // Обработка команды кика от администратора
    socket.on('kick-user-request', (roomId, targetUsername) => {
        if (roomAdmin[roomId] === currentUsername) {
            const targetSocketId = userSocketMap[targetUsername];
            if (targetSocketId) {
                io.to(targetSocketId).emit('you-are-kicked'); 
            }
        }
    });

    socket.on('disconnect', () => {
        if (currentRoom && currentUsername && roomUsers[currentRoom]) {
            roomUsers[currentRoom] = roomUsers[currentRoom].filter(user => user !== currentUsername);
            
            if (roomAdmin[currentRoom] === currentUsername) {
                roomAdmin[currentRoom] = null;
            }
            
            delete userSocketMap[currentUsername];
            
            io.to(currentRoom).emit('update-user-list', roomUsers[currentRoom], roomAdmin[currentRoom] || null);
            socket.to(currentRoom).emit('screen-share-stopped-by-user');
            io.to(currentRoom).emit('user-speech-updated', currentUsername, false);
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log('Бэкенд успешно запущен!'));
