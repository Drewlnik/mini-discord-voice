const express = require('express');
const app = express();
const server = require('http').createServer(app);
const io = require('socket.io')(server, {
    cors: { origin: "*" }
});

// --- ДОБАВЛЯЕМ ПОДДЕРЖКУ PEERJS ---
const { ExpressPeerServer } = require('peer');
const peerServer = ExpressPeerServer(server, {
    path: '/', // Это путь, по которому будет доступен PeerJS сервер
    allow_discovery: true, // Разрешает клиентам находить друг друга (для тестов)
    proxied: true // Важно для работы за прокси (например, в облаке)
});

app.use('/peerjs', peerServer); // Подключаем PeerJS сервер к пути /peerjs
// ------------------------------------

app.use(express.static('public'));

// ... остальной код server.js остаётся без изменений ...
const SECRET_ADMIN_PASSWORD = "48103650550";
const rooms = new Map();

function getOrCreateRoom(roomId) {
    if (!rooms.has(roomId)) {
        rooms.set(roomId, { users: new Map(), admin: null });
    }
    return rooms.get(roomId);
}

function getUserList(room) {
    return Array.from(room.users.keys());
}

io.on('connection', (socket) => {
    let currentRoom = null;
    let currentUsername = null;
    let currentPeerId = null;

    socket.on('join-room', (roomId, peerId, username, password) => {
        if (!roomId || !peerId || !username) return;
        username = String(username).slice(0, 24).trim();
        if (!username) return;

        currentRoom = roomId;
        currentUsername = username;
        currentPeerId = peerId;

        const room = getOrCreateRoom(roomId);

        if (room.users.has(username)) {
            const old = room.users.get(username);
            io.to(old.socketId).emit('you-are-kicked', 'Это имя уже используется');
            room.users.delete(username);
        }

        room.users.set(username, { socketId: socket.id, peerId });
        socket.join(roomId);

        if (password === SECRET_ADMIN_PASSWORD) {
            room.admin = username;
            socket.emit('admin-verified');
        }

        socket.to(roomId).emit('user-connected', peerId, username);

        const peers = [];
        room.users.forEach((val, key) => {
            if (key !== username) {
                peers.push({ peerId: val.peerId, username: key });
            }
        });
        socket.emit('room-state', peers, room.admin);

        io.to(roomId).emit('update-user-list', getUserList(room), room.admin);
    });

    socket.on('send-chat-message', (roomId, author, text) => {
        const room = rooms.get(roomId);
        if (!room) return;
        if (typeof text !== 'string') return;

        const safeText = text.slice(0, 2000);
        const safeAuthor = String(author).slice(0, 24);
        const isAdminMsg = (room.admin === safeAuthor);
        io.to(roomId).emit('receive-chat-message', safeAuthor, safeText, isAdminMsg);
    });

    socket.on('start-video-stream', (roomId, streamType) => {
        const room = rooms.get(roomId);
        if (!room || !currentPeerId) return;
        if (streamType !== 'screen' && streamType !== 'camera') return;

        const peers = [];
        room.users.forEach((val, key) => {
            if (key !== currentUsername) {
                peers.push({ peerId: val.peerId, username: key });
            }
        });
        socket.emit('call-peers-with-stream', streamType, peers);
    });

    socket.on('stop-video-stream', (roomId, streamType) => {
        if (!currentPeerId) return;
        socket.to(roomId).emit('video-stream-stopped', currentPeerId, streamType);
    });

    socket.on('speech-state-change', (roomId, username, isSpeaking) => {
        io.to(roomId).emit('user-speech-updated', username, !!isSpeaking);
    });

    socket.on('kick-user-request', (roomId, targetUsername) => {
        const room = rooms.get(roomId);
        if (!room) return;
        if (room.admin !== currentUsername) return;
        if (targetUsername === currentUsername) return;

        const target = room.users.get(targetUsername);
        if (target) {
            io.to(target.socketId).emit('you-are-kicked', 'Вы были исключены администратором');
        }
    });

    socket.on('disconnect', () => {
        if (!currentRoom || !currentUsername) return;
        const room = rooms.get(currentRoom);
        if (!room) return;

        const entry = room.users.get(currentUsername);
        if (entry && entry.socketId === socket.id) {
            room.users.delete(currentUsername);

            if (room.admin === currentUsername) {
                room.admin = null;
            }

            io.to(currentRoom).emit('update-user-list', getUserList(room), room.admin);

            if (currentPeerId) {
                socket.to(currentRoom).emit('video-stream-stopped', currentPeerId, 'screen');
                socket.to(currentRoom).emit('video-stream-stopped', currentPeerId, 'camera');
            }
            io.to(currentRoom).emit('user-speech-updated', currentUsername, false);
        }

        if (room.users.size === 0) {
            rooms.delete(currentRoom);
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log('Бэкенд запущен на порту ' + PORT));
