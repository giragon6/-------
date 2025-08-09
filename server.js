const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const PORT = process.env.PORT || 3000;

// Serve static files from public directory
app.use(express.static(path.join(__dirname, 'public')));

// Store drawing data and connected players
let drawingData = [];
let players = {};

io.on('connection', (socket) => {
    console.log(`Player connected: ${socket.id}`);
    
    // Add new player
    players[socket.id] = {
        id: socket.id,
        color: getRandomColor(),
        x: 0,
        y: 0
    };
    
    // Send existing drawing data to new player
    socket.emit('existing-drawing', drawingData);
    
    // Send current players to new player
    socket.emit('players-update', players);
    
    // Notify all players about new player
    socket.broadcast.emit('player-joined', players[socket.id]);
    
    // Handle drawing events
    socket.on('drawing', (data) => {
        // Add player color to drawing data
        const drawData = {
            ...data,
            playerId: socket.id,
            color: players[socket.id].color
        };
        
        // Store drawing data
        drawingData.push(drawData);
        
        // Broadcast to all other players
        socket.broadcast.emit('drawing', drawData);
    });
    
    // Handle cursor movement
    socket.on('cursor-move', (data) => {
        if (players[socket.id]) {
            players[socket.id].x = data.x;
            players[socket.id].y = data.y;
            
            // Broadcast cursor position to other players
            socket.broadcast.emit('cursor-move', {
                playerId: socket.id,
                x: data.x,
                y: data.y,
                color: players[socket.id].color
            });
        }
    });
    
    // Handle clear canvas
    socket.on('clear-canvas', () => {
        drawingData = [];
        io.emit('clear-canvas');
    });
    
    // Handle disconnect
    socket.on('disconnect', () => {
        console.log(`Player disconnected: ${socket.id}`);
        delete players[socket.id];
        
        // Notify all players about disconnection
        socket.broadcast.emit('player-left', socket.id);
    });
});

// Generate random color for new players
function getRandomColor() {
    const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FECA57', '#FF9FF3', '#54A0FF', '#5F27CD'];
    return colors[Math.floor(Math.random() * colors.length)];
}

server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
