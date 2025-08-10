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
  // 'X', 
  'line',
  'five-point star', 
  'arrowhead',
  'asterisk'
];

// Broadcast available rooms to all clients
function broadcastRoomsList() {
    const roomsList = Array.from(rooms.values())
        .filter(room => room.gameState === 'lobby') // Only show lobby rooms
        .map(room => ({
            id: room.id,
            playerCount: room.players.length,
            gameState: room.gameState,
            thumbnail: room.thumbnail,
            createdAt: room.createdAt
        }));
    
    io.emit('roomsList', roomsList);
}

class Room {
    constructor(id) {
        this.id = id;
        this.players = [];
        this.gameState = 'lobby'; // lobby, playing, finished
        this.targetSymbols = [];
        this.completedSymbols = [];
        this.sharedHearts = 6; // 6 hearts shared among all players
        this.thumbnail = null; // Store room thumbnail drawing
        this.createdAt = Date.now();
        this.hostId = null; // Track who created the room
        this.currentRound = 1; // Track current round (infinite rounds until hearts run out)
    }

    addPlayer(playerId) {
        if (this.players.length >= 4 || this.gameState !== 'lobby') return false;
        
        // Set host as the first player
        if (this.players.length === 0) {
            this.hostId = playerId;
        }
        
        const startingPositions = [
            { x: 70, y: 590 }, // Red player
            { x: 250, y: 570 }, // Teal player  
            { x: 430, y: 550 }, // Blue player
            { x: 610, y: 510 }  // Green player
        ];
        
        const player = {
            id: playerId,
            color: playerColors[this.players.length],
            colorName: ['Red', 'Teal', 'Blue', 'Green'][this.players.length],
            avatar: ['red', 'teal', 'blue', 'green'][this.players.length],
            x: startingPositions[this.players.length].x,
            y: startingPositions[this.players.length].y,
            alive: true,
            isHost: playerId === this.hostId || this.players.length === 0
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
                player.alive = player.alive !== undefined ? player.alive : true;
            });
        }
    }

    startGame() {
        if (this.players.length < 1) return false;
        
        this.gameState = 'playing';
        this.generateTargetSymbols();
        
        // Assign target players to each tentacle
        this.assignTentacleTargets();
        
        // Start the game update loop for tentacle movement
        this.startGameLoop();
        
        return true;
    }

    assignTentacleTargets() {
        const alivePlayers = this.players.filter(p => p.alive);
        if (alivePlayers.length === 0) return;

        // Assign each tentacle a random target player
        this.targetSymbols.forEach(symbol => {
            if (!symbol.completed && !symbol.targetPlayerId) {
                const randomPlayer = alivePlayers[Math.floor(Math.random() * alivePlayers.length)];
                symbol.targetPlayerId = randomPlayer.id;
                console.log(`Tentacle ${symbol.id} (${symbol.type}, ${symbol.color}) assigned to target player ${randomPlayer.name}`);
            }
        });
    }

    reassignTentacleTargets() {
        const alivePlayers = this.players.filter(p => p.alive);
        if (alivePlayers.length === 0) return;

        // Reassign tentacles that are targeting dead players
        this.targetSymbols.forEach(symbol => {
            if (!symbol.completed && symbol.targetPlayerId) {
                const targetPlayer = this.players.find(p => p.id === symbol.targetPlayerId);
                if (!targetPlayer || !targetPlayer.alive) {
                    const randomPlayer = alivePlayers[Math.floor(Math.random() * alivePlayers.length)];
                    symbol.targetPlayerId = randomPlayer.id;
                    console.log(`Tentacle ${symbol.id} reassigned to target player ${randomPlayer.color}`);
                }
            }
        });
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

        const speed = 1; // Tentacle movement speed (pixels per update)
        let updated = false;

        this.targetSymbols.forEach(symbol => {
            if (!symbol.completed) {
                // Find the assigned target player
                const targetPlayer = this.players.find(p => p.id === symbol.targetPlayerId && p.alive);
                
                if (!targetPlayer) {
                    // If target player is dead, reassign to a random alive player
                    const alivePlayers = this.players.filter(p => p.alive);
                    if (alivePlayers.length > 0) {
                        const newTarget = alivePlayers[Math.floor(Math.random() * alivePlayers.length)];
                        symbol.targetPlayerId = newTarget.id;
                        console.log(`Tentacle ${symbol.id} reassigned from dead player to ${newTarget.color}`);
                    } else {
                        return; // No alive players
                    }
                }

                const assignedTarget = this.players.find(p => p.id === symbol.targetPlayerId);
                if (assignedTarget) {
                    const dx = assignedTarget.x - symbol.x;

                    if (Math.abs(dx) > speed) {
                        if (dx > 0) {
                            symbol.x += speed;
                        } else {
                            symbol.x -= speed;
                        }
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

        const collisionDistance = 30; // Distance at which tentacle hits player (x-axis only)
        let playerHit = false;
        const tentaclesToRemove = []; // Track tentacles to remove after collision

        this.players.forEach(player => {
            if (!player.alive) return;

            this.targetSymbols.forEach(symbol => {
                if (!symbol.completed) {
                    // Only check x-axis distance for ocean tentacle collision
                    const xDistance = Math.abs(symbol.x - player.x);

                    if (xDistance < collisionDistance) {
                        // Player hit by tentacle - reduce shared hearts
                        this.sharedHearts--;
                        playerHit = true;
                        
                        // Mark tentacle for removal after collision
                        tentaclesToRemove.push(symbol.id);
                        
                        if (this.sharedHearts <= 0) {
                            // All players lose when shared hearts reach 0
                            this.players.forEach(p => p.alive = false);
                        } else {
                            // Reassign tentacle targets if any player died
                            this.reassignTentacleTargets();
                        }

                        console.log(`Tentacle ${symbol.id} hit player ${player.id}, removing tentacle. Hearts remaining: ${this.sharedHearts}`);
                    }
                }
            });
        });

        // Remove tentacles that collided with players
        tentaclesToRemove.forEach(tentacleId => {
            const symbol = this.targetSymbols.find(s => s.id === tentacleId);
            if (symbol) {
                symbol.completed = true;
                this.completedSymbols.push(symbol.id);
            }
        });

        if (playerHit) {
            this.broadcastPlayerUpdate();
            
            // Check if all players are dead (shared hearts depleted)
            if (this.sharedHearts <= 0) {
                this.gameState = 'lost';
                this.stopGameLoop();
                this.broadcastGameLost();
            }
        }

        // Check round completion condition (all symbols cleared)
        if (this.targetSymbols.every(s => s.completed) && this.gameState === 'playing') {
            console.log(`Round ${this.currentRound} completed!`);
            
            // Always start next round - game continues until hearts run out
            this.startNextRound();
        }
    }

    startNextRound() {
        this.currentRound++;
        console.log(`Starting round ${this.currentRound}`);
        
        // Reset symbols for next round
        this.targetSymbols = [];
        this.completedSymbols = [];
        
        // Generate new symbols for this round
        this.generateTargetSymbols();
        
        // Reassign tentacle targets
        this.assignTentacleTargets();
        
        // Broadcast round completion and new round start
        if (this.broadcastCallback) {
            this.broadcastCallback('roundCompleted', this.getGameData());
        }
        
        console.log(`Round ${this.currentRound} started with ${this.targetSymbols.length} new symbols`);
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
        
        // Create symbols for each player color
        for (let playerIndex = 0; playerIndex < this.players.length; playerIndex++) {
            const playerColor = this.players[playerIndex].color;
            let playerSymbolCount = symbolsPerPlayer;
            
            // Distribute extra symbols
            if (playerIndex < extraSymbols) {
                playerSymbolCount++;
            }
            
            for (let i = 0; i < playerSymbolCount; i++) {
                const randomSymbol = symbols[Math.floor(Math.random() * symbols.length)];
                
                // Spawn tentacles from the ocean (off-screen at bottom)
                let spawnX, spawnY;
                let validSpawn = false;
                let attempts = 0;
                
                while (!validSpawn && attempts < 10) {
                    spawnX = Math.random() * 800; // Random x position across screen width
                    spawnY = 700; // Fixed at ocean floor (off-screen at bottom)
                    
                    // Check if spawn position is far enough from all players
                    validSpawn = true;
                    for (let player of this.players) {
                        const distanceToPlayer = Math.abs(spawnX - player.x);
                        if (distanceToPlayer < 100) { // Minimum 100px distance from players
                            validSpawn = false;
                            break;
                        }
                    }
                    attempts++;
                }
                
                // Fallback if no valid spawn found
                if (!validSpawn) {
                    spawnX = Math.random() * 800;
                    spawnY = 700;
                }
                
                this.targetSymbols.push({
                    id: `symbol_${symbolId++}`,
                    type: randomSymbol,
                    color: playerColor, // Keep player-specific colors for drawing matching
                    x: spawnX,
                    y: spawnY,
                    completed: false,
                    targetPlayerId: null // Will be assigned when game starts
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

        console.log(`Checking match for player ${player.color}: ${symbolType})`);
        console.log(`Available symbols:`, this.targetSymbols.filter(s => !s.completed).map(s => `${s.type} (${s.color}) at (${s.x}, ${s.y})`));

        // Find symbols that match both the drawn symbol type AND the player's color
        const matchingSymbol = this.targetSymbols.find(symbol => 
            !symbol.completed &&
            symbol.type === symbolType &&
            symbol.color === player.color
        );

        if (matchingSymbol) {
            matchingSymbol.completed = true;
            this.completedSymbols.push(matchingSymbol.id);
            
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
            completedSymbols: this.completedSymbols,
            sharedHearts: this.sharedHearts,
            currentRound: this.currentRound
        };
    }
}

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);
    
    // Send current rooms list to new client
    const roomsList = Array.from(rooms.values()).map(room => ({
        id: room.id,
        playerCount: room.players.length,
        gameState: room.gameState,
        thumbnail: room.thumbnail,
        createdAt: room.createdAt
    }));
    socket.emit('roomsList', roomsList);
    
    socket.on('createRoom', (data) => {
        const roomId = Math.random().toString(36).substr(2, 6).toUpperCase();
        const room = new Room(roomId);
        
        // Set thumbnail from client drawing
        if (data.thumbnail) {
            room.thumbnail = data.thumbnail;
        }
        
        // Set up broadcast callback
        room.broadcastCallback = (eventName, data) => {
            io.to(roomId).emit(eventName, data);
        };
        
        const player = room.addPlayer(socket.id);
        
        if (player) {
            rooms.set(roomId, room);
            socket.join(roomId);
            socket.roomId = roomId;
            socket.emit('roomCreated', { roomId, player, room: room.getGameData() });
            
            // Broadcast updated rooms list to all clients
            broadcastRoomsList();
            
            console.log(`Room ${roomId} created by ${socket.id}`);
        }
    });

    socket.on('joinRoom', (data) => {
        const room = rooms.get(data.roomId);
        if (room && room.gameState === 'lobby') { // Only allow joining lobby rooms
            const player = room.addPlayer(socket.id);
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
                
                // Broadcast updated rooms list to all clients
                broadcastRoomsList();
                
                console.log(`${socket.id} joined room ${data.roomId}`);
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
            // Only allow host to start the game
            if (room && socket.id === room.hostId && room.gameState === 'lobby') {
                if (room.startGame()) {
                    // Remove room from public list once game starts
                    broadcastRoomsList();
                    
                    io.to(socket.roomId).emit('gameStarted', room.getGameData());
                    console.log(`Game started in room ${socket.roomId} by host ${socket.id}`);
                }
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
                    // Broadcast updated rooms list to all clients
                    broadcastRoomsList();
                } else {
                    socket.to(socket.roomId).emit('playerLeft', room.getGameData());
                    // Broadcast updated rooms list to all clients
                    broadcastRoomsList();
                }
            }
        }
        console.log('User disconnected:', socket.id);
    });
});

server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
