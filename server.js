const express = require('express');
const app = express();
const server = require('http').createServer(app);
const io = require('socket.io')(server, {
    cors: { origin: "*" }
});

app.use(express.static('public'));

// Хранилище активных пользователей в комнатах
const roomUsers = {};

io.on('connection', (socket) => {
    let currentRoom = null;
    let currentUsername = null;

    socket.on('join-room', (roomId, userId) => {
        currentRoom = roomId;
        // Генерируем красивое отображаемое имя на основе короткого ID
        currentUsername = "User_" + userId.substr(0, 4);

        socket.join(roomId);
        
        if (!roomUsers[roomId]) {
            roomUsers[roomId] = [];
        }
        // Добавляем пользователя в список комнаты
        if (!roomUsers[roomId].includes(currentUsername)) {
            roomUsers[roomId].push(currentUsername);
        }

        // Говорим всем в комнате, что кто-то зашел, и отправляем обновленный список
        socket.to(roomId).emit('user-connected', userId);
        io.to(roomId).emit('update-user-list', roomUsers[roomId]);

        socket.on('disconnect', () => {
            socket.to(roomId).emit('user-disconnected', userId);
            
            // Удаляем пользователя из списка при отключении
            if (roomUsers[roomId]) {
                roomUsers[roomId] = roomUsers[roomId].filter(user => user !== currentUsername);
                io.to(roomId).emit('update-user-list', roomUsers[roomId]);
            }
        });
    });

    // Обработка запроса списка до нажатия кнопки входа в аудио
    socket.on('request-user-list', (roomId) => {
        const list = roomUsers[roomId] || [];
        socket.emit('update-user-list', list);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Сервер запущен на порту ${PORT}`));
