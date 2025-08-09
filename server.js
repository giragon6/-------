const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const PORT = process.env.PORT || 3000;

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Game state
const rooms = new Map();
const playerColors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4']; // Red, Teal, Blue, Green
const symbols = [
  // 'five-point star', 
  // 'asterisk', 
  // 'X', 
  // 'H', 
  // 'T', 
  'line'];

class Room {
    constructor(id) {
        this.id = id;
        this.players = [];
        this.gameState = 'waiting'; // waiting, playing, finished
        this.targetSymbols = [];
        this.completedSymbols = [];
    }

    addPlayer(playerId, playerName) {
        if (this.players.length >= 4) return false;
        
        // Starting positions for players (spread across the world)
        const startingPositions = [
            { x: 150, y: 450 }, // Red player
            { x: 350, y: 450 }, // Teal player  
            { x: 550, y: 450 }, // Blue player
            { x: 650, y: 450 }  // Green player
        ];
        
        const player = {
            id: playerId,
            name: playerName,
            color: playerColors[this.players.length],
            colorName: ['Red', 'Teal', 'Blue', 'Green'][this.players.length],
            avatar: ['red', 'teal', 'blue', 'green'][this.players.length],
            x: startingPositions[this.players.length].x,
            y: startingPositions[this.players.length].y,
            hearts: 3, // Each player starts with 3 hearts
            alive: true
        };
        
        this.players.push(player);
        return player;
    }

    removePlayer(playerId) {
        const index = this.players.findIndex(p => p.id === playerId);
        if (index !== -1) {
            this.players.splice(index, 1);
            // Reassign colors
            this.players.forEach((player, i) => {
                const startingPositions = [
                    { x: 150, y: 450 }, // Red player
                    { x: 350, y: 450 }, // Teal player  
                    { x: 550, y: 450 }, // Blue player
                    { x: 650, y: 450 }  // Green player
                ];
                
                player.color = playerColors[i];
                player.colorName = ['Red', 'Teal', 'Blue', 'Green'][i];
                player.avatar = ['red', 'teal', 'blue', 'green'][i];
                player.x = startingPositions[i].x;
                player.y = startingPositions[i].y;
                player.hearts = player.hearts || 3; // Preserve hearts or set default
                player.alive = player.alive !== undefined ? player.alive : true;
            });
        }
    }

    startGame() {
        if (this.players.length < 1) return false;
        
        this.gameState = 'playing';
        this.generateTargetSymbols();
        
        // Start the game update loop for tentacle movement
        this.startGameLoop();
        
        return true;
    }

    startGameLoop() {
        this.gameLoopInterval = setInterval(() => {
            this.updateTentacles();
            this.checkCollisions();
        }, 100); // Update 10 times per second
    }

    stopGameLoop() {
        if (this.gameLoopInterval) {
            clearInterval(this.gameLoopInterval);
            this.gameLoopInterval = null;
        }
    }

    updateTentacles() {
        if (this.gameState !== 'playing') return;

        const speed = 0.5; // Tentacle movement speed
        let updated = false;

        this.targetSymbols.forEach(symbol => {
            if (!symbol.completed) {
                // Find the nearest alive player
                const alivePlayers = this.players.filter(p => p.alive);
                if (alivePlayers.length === 0) return;

                let nearestPlayer = null;
                let minDistance = Infinity;

                alivePlayers.forEach(player => {
                    const distance = Math.sqrt(
                        Math.pow(symbol.x - player.x, 2) + 
                        Math.pow(symbol.y - player.y, 2)
                    );
                    if (distance < minDistance) {
                        minDistance = distance;
                        nearestPlayer = player;
                    }
                });

                if (nearestPlayer) {
                    // Move tentacle toward nearest player
                    const dx = nearestPlayer.x - symbol.x;
                    const dy = nearestPlayer.y - symbol.y;
                    const distance = Math.sqrt(dx * dx + dy * dy);

                    if (distance > 1) {
                        symbol.x += (dx / distance) * speed;
                        symbol.y += (dy / distance) * speed;
                        updated = true;
                    }
                }
            }
        });

        // Broadcast tentacle positions to all clients
        if (updated) {
            this.broadcastTentacleUpdate();
        }
    }

    checkCollisions() {
        if (this.gameState !== 'playing') return;

        const collisionDistance = 30; // Distance at which tentacle hits player
        let playerHit = false;

        this.players.forEach(player => {
            if (!player.alive) return;

            this.targetSymbols.forEach(symbol => {
                if (!symbol.completed) {
                    const distance = Math.sqrt(
                        Math.pow(symbol.x - player.x, 2) + 
                        Math.pow(symbol.y - player.y, 2)
                    );

                    if (distance < collisionDistance) {
                        // Player hit by tentacle
                        player.hearts--;
                        playerHit = true;
                        
                        if (player.hearts <= 0) {
                            player.alive = false;
                        }

                        // Remove the tentacle that hit the player
                        symbol.completed = true;
                        this.completedSymbols.push(symbol.id);
                    }
                }
            });
        });

        if (playerHit) {
            this.broadcastPlayerUpdate();
            
            // Check if all players are dead
            const alivePlayers = this.players.filter(p => p.alive);
            if (alivePlayers.length === 0) {
                this.gameState = 'lost';
                this.stopGameLoop();
                this.broadcastGameLost();
            }
        }

        // Check win condition
        if (this.targetSymbols.every(s => s.completed) && this.gameState === 'playing') {
            this.gameState = 'finished';
            this.stopGameLoop();
        }
    }

    broadcastTentacleUpdate() {
        // This will be called by the main server code
        if (this.broadcastCallback) {
            this.broadcastCallback('tentacleUpdate', this.getGameData());
        }
    }

    broadcastPlayerUpdate() {
        if (this.broadcastCallback) {
            this.broadcastCallback('playerUpdate', this.getGameData());
        }
    }

    broadcastGameLost() {
        if (this.broadcastCallback) {
            this.broadcastCallback('gameLost', this.getGameData());
        }
    }

    generateTargetSymbols() {
        this.targetSymbols = [];
        const baseSymbolsPerPlayer = 3;
        const numSymbols = this.players.length * baseSymbolsPerPlayer;
        
        // Ensure even distribution of symbols across player colors
        const symbolsPerPlayer = Math.floor(numSymbols / this.players.length);
        const extraSymbols = numSymbols % this.players.length;
        
        let symbolId = 0;
        
        // Create symbols for each player
        for (let playerIndex = 0; playerIndex < this.players.length; playerIndex++) {
            const playerColor = this.players[playerIndex].color;
            let playerSymbolCount = symbolsPerPlayer;
            
            // Distribute extra symbols
            if (playerIndex < extraSymbols) {
                playerSymbolCount++;
            }
            
            for (let i = 0; i < playerSymbolCount; i++) {
                const randomSymbol = symbols[Math.floor(Math.random() * symbols.length)];
                
                // Spawn tentacles from the edges of the screen
                const spawnSide = Math.floor(Math.random() * 4); // 0: top, 1: right, 2: bottom, 3: left
                let spawnX, spawnY;
                
                switch (spawnSide) {
                    case 0: // top
                        spawnX = Math.random() * 800;
                        spawnY = -50;
                        break;
                    case 1: // right
                        spawnX = 850;
                        spawnY = Math.random() * 600;
                        break;
                    case 2: // bottom
                        spawnX = Math.random() * 800;
                        spawnY = 650;
                        break;
                    case 3: // left
                        spawnX = -50;
                        spawnY = Math.random() * 600;
                        break;
                }
                
                this.targetSymbols.push({
                    id: `symbol_${symbolId++}`,
                    type: randomSymbol,
                    color: playerColor,
                    x: spawnX,
                    y: spawnY,
                    completed: false
                });
            }
        }
        
        // Shuffle the symbols array to randomize their positions
        for (let i = this.targetSymbols.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this.targetSymbols[i], this.targetSymbols[j]] = [this.targetSymbols[j], this.targetSymbols[i]];
        }
    }

    checkSymbolMatch(playerId, symbolType) {
        const player = this.players.find(p => p.id === playerId);
        if (!player) return null;

        console.log(`Checking match for player ${player.name} (${player.color}): ${symbolType})`);
        console.log(`Available symbols:`, this.targetSymbols.filter(s => !s.completed).map(s => `${s.type} (${s.color}) at (${s.x}, ${s.y})`));

        // Find nearby symbols of the player's color that match the drawn symbol
        const matchingSymbol = this.targetSymbols.find(symbol => 
            !symbol.completed &&
            symbol.type === symbolType &&
            symbol.color === player.color
        );

        if (matchingSymbol) {
            matchingSymbol.completed = true;
            this.completedSymbols.push(matchingSymbol.id);
            
            // Check if all symbols are completed
            if (this.targetSymbols.every(s => s.completed)) {
                this.gameState = 'finished';
            }
            
            return matchingSymbol;
        }
        
        return null;
    }

    getGameData() {
        return {
            id: this.id,
            players: this.players,
            gameState: this.gameState,
            targetSymbols: this.targetSymbols,
            completedSymbols: this.completedSymbols
        };
    }
}

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);
    
    socket.on('createRoom', (data) => {
        const roomId = Math.random().toString(36).substr(2, 6).toUpperCase();
        const room = new Room(roomId);
        
        // Set up broadcast callback
        room.broadcastCallback = (eventName, data) => {
            io.to(roomId).emit(eventName, data);
        };
        
        const player = room.addPlayer(socket.id, data.playerName);
        
        if (player) {
            rooms.set(roomId, room);
            socket.join(roomId);
            socket.roomId = roomId;
            socket.emit('roomCreated', { roomId, player, room: room.getGameData() });
            console.log(`Room ${roomId} created by ${data.playerName}`);
        }
    });

    socket.on('joinRoom', (data) => {
        const room = rooms.get(data.roomId);
        if (room && room.gameState === 'waiting') {
            const player = room.addPlayer(socket.id, data.playerName);
            if (player) {
                socket.join(data.roomId);
                socket.roomId = data.roomId;
                
                // Set up broadcast callback if not already set
                if (!room.broadcastCallback) {
                    room.broadcastCallback = (eventName, data) => {
                        io.to(data.roomId).emit(eventName, data);
                    };
                }
                
                socket.emit('roomJoined', { player, room: room.getGameData() });
                socket.to(data.roomId).emit('playerJoined', { player, room: room.getGameData() });
                console.log(`${data.playerName} joined room ${data.roomId}`);
            } else {
                socket.emit('roomFull');
            }
        } else {
            socket.emit('roomNotFound');
        }
    });

    socket.on('startGame', () => {
        if (socket.roomId) {
            const room = rooms.get(socket.roomId);
            if (room && room.startGame()) {
                io.to(socket.roomId).emit('gameStarted', room.getGameData());
                console.log(`Game started in room ${socket.roomId}`);
            }
        }
    });

    socket.on('drawingData', (data) => {
        if (socket.roomId) {
            socket.to(socket.roomId).emit('playerDrawing', {
                playerId: socket.id,
                ...data
            });
        }
    });

    socket.on('symbolRecognized', (data) => {
        if (socket.roomId) {
            const room = rooms.get(socket.roomId);
            if (room && room.gameState === 'playing') {
                console.log(`Symbol recognition attempt: ${data.symbolType} at (${data.x}, ${data.y}) by ${socket.id}`);
                const matchedSymbol = room.checkSymbolMatch(
                    socket.id, 
                    data.symbolType
                );
                
                if (matchedSymbol) {
                    console.log(`Symbol matched: ${matchedSymbol.id}`);
                    io.to(socket.roomId).emit('symbolMatched', {
                        playerId: socket.id,
                        symbol: matchedSymbol,
                        room: room.getGameData()
                    });
                    
                    if (room.gameState === 'finished') {
                        io.to(socket.roomId).emit('gameFinished', room.getGameData());
                        console.log(`Game finished in room ${socket.roomId}`);
                    }
                } else {
                    console.log(`No symbol match found for ${data.symbolType}`);
                }
            }
        }
    });

    socket.on('disconnect', () => {
        if (socket.roomId) {
            const room = rooms.get(socket.roomId);
            if (room) {
                room.removePlayer(socket.id);
                if (room.players.length === 0) {
                    room.stopGameLoop(); // Stop the game loop when room is empty
                    rooms.delete(socket.roomId);
                    console.log(`Room ${socket.roomId} deleted`);
                } else {
                    socket.to(socket.roomId).emit('playerLeft', room.getGameData());
                }
            }
        }
        console.log('User disconnected:', socket.id);
    });
});

server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
