// server.js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

// Simple in-memory room store: { roomId: { hostSocketId, password } }
const rooms = {};

io.on('connection', (socket) => {
  console.log('socket connected', socket.id);

  socket.on('create-room', ({ roomId, password }) => {
    if (!roomId) return socket.emit('err', 'roomId required');
    rooms[roomId] = { hostSocketId: socket.id, password };
    socket.join(roomId);
    socket.emit('room-created', { roomId });
    console.log(`Room ${roomId} created by ${socket.id}`);
  });

  socket.on('join-room', ({ roomId, password }) => {
    const meta = rooms[roomId];
    if (!meta) return socket.emit('join-failed', 'Room does not exist');
    if (meta.password !== password) return socket.emit('join-failed', 'Bad password');
    socket.join(roomId);
    socket.emit('joined', { roomId, hostSocketId: meta.hostSocketId });
    // notify host someone joined
    io.to(meta.hostSocketId).emit('viewer-joined', { viewerId: socket.id });
    console.log(`${socket.id} joined ${roomId}`);
  });

  // Signalling: offer from host -> server -> emit to room viewers
  socket.on('offer', ({ roomId, offer }) => {
    socket.to(roomId).emit('offer', { offer, from: socket.id });
  });

  // answer from viewer -> to host
  socket.on('answer', ({ roomId, answer }) => {
    socket.to(roomId).emit('answer', { answer, from: socket.id });
  });

  // Ice candidates
  socket.on('ice-candidate', ({ roomId, candidate }) => {
    socket.to(roomId).emit('ice-candidate', { candidate, from: socket.id });
  });

  socket.on('disconnecting', () => {
    // cleanup rooms owned by this socket
    for (const [roomId, meta] of Object.entries(rooms)) {
      if (meta.hostSocketId === socket.id) {
        // close room
        io.to(roomId).emit('room-closed');
        delete rooms[roomId];
        console.log(`Room ${roomId} closed (host disconnected)`);
      }
    }
  });

  socket.on('disconnect', () => {
    console.log('socket disconnected', socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));