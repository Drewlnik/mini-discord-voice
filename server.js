const express = require('express');
const app = express();
const server = require('http').createServer(app);
const io = require('socket.io')(server, {
    cors: { origin: "*" }
});

// ---------- PeerJS сервер (свой, вместо публичного) ----------
const { ExpressPeerServer } = require('peer');
const peerServer = ExpressPeerServer(server, {
    path: '/',
    allow_discovery: true,
    proxied: true
});
app.use('/peerjs', peerServer);
// -----------------------------------------------------------

app.use(express.static('public'));

// Секретный пароль администратора
const SECRET_ADMIN_PASSWORD = "48103650550";

// rooms: roomId -> { users: Map<username, { socketId, peerId }>, admin: username|null }
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

    // ---------- Вход в комнату ----------
    socket.on('join-room', (roomId, peerId, username, password) => {
        if (!roomId || !peerId || !username) return;

        username = String(username).slice(0, 24).trim();
        if (!username) return;

        currentRoom = roomId;
        currentUsername = username;
        currentPeerId = peerId;

        const room = getOrCreateRoom(roomId);

        // Если такое имя уже занято — выгоняем старого
        if (room.users.has(username)) {
            const old = room.users.get(username);
            io.to(old.socketId).emit('you-are-kicked', 'Это имя уже используется');
            room.users.delete(username);
        }

        room.users.set(username, { socketId: socket.id, peerId });
        socket.join(roomId);

        // Проверка на админа
        if (password === SECRET_ADMIN_PASSWORD) {
            room.admin = username;
            socket.emit('admin-verified');
        }

        // Остальным сообщаем о новом пользователе
        socket.to(roomId).emit('user-connected', peerId, username);

        // Новому пользователю — список уже присутствующих
        const peers = [];
        room.users.forEach((val, key) => {
            if (key !== username) {
                peers.push({ peerId: val.peerId, username: key });
            }
        });
        socket.emit('room-state', peers, room.admin);

        io.to(roomId).emit('update-user-list', getUserList(room), room.admin);
    });

    // ---------- Чат ----------
    socket.on('send-chat-message', (roomId, author, text) => {
        const room = rooms.get(roomId);
        if (!room) return;
        if (typeof text !== 'string') return;

        const safeText = text.slice(0, 2000);
        const safeAuthor = String(author).slice(0, 24);
        const isAdminMsg = (room.admin === safeAuthor);
        io.to(roomId).emit('receive-chat-message', safeAuthor, safeText, isAdminMsg);
    });

    // ---------- Старт трансляции ----------
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

    // ---------- Стоп трансляции ----------
    socket.on('stop-video-stream', (roomId, streamType) => {
        if (!currentPeerId) return;
        socket.to(roomId).emit('video-stream-stopped', currentPeerId, streamType);
    });

    // ---------- Подсветка говорящего ----------
    socket.on('speech-state-change', (roomId, username, isSpeaking) => {
        io.to(roomId).emit('user-speech-updated', username, !!isSpeaking);
    });

    // ---------- Кик ----------
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

    // ---------- Отключение ----------
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
