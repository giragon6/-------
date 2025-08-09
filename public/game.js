class DrawingGame extends Phaser.Scene {
    constructor() {
        super({ key: 'DrawingGame' });
        this.socket = null;
        this.isDrawing = false;
        this.lastPointer = { x: 0, y: 0 };
        this.currentColor = '#000000';
        this.currentBrushSize = 8;
        this.graphics = null;
        this.playerCursors = {};
        this.players = {};
        this.myPlayerId = null;
    }

    preload() {
        // No assets to preload for basic drawing
    }

    create() {
        // Initialize Socket.io
        this.socket = io();
        
        // Create graphics object for drawing
        this.graphics = this.add.graphics();
        
        // Set up socket event listeners
        this.setupSocketEvents();
        
        // Set up input events
        this.setupInputEvents();
        
        // Set up UI event listeners
        this.setupUIEvents();
        
        console.log('Game initialized');
    }

    setupSocketEvents() {
        // Handle existing drawing data
        this.socket.on('existing-drawing', (drawingData) => {
            this.graphics.clear();
            drawingData.forEach(data => {
                this.drawLine(data);
            });
        });

        // Handle new drawing from other players
        this.socket.on('drawing', (data) => {
            this.drawLine(data);
        });

        // Handle players update
        this.socket.on('players-update', (players) => {
            this.players = players;
            this.updatePlayersUI();
        });

        // Handle new player joined
        this.socket.on('player-joined', (player) => {
            this.players[player.id] = player;
            this.updatePlayersUI();
            this.createPlayerCursor(player.id, player.color);
        });

        // Handle player left
        this.socket.on('player-left', (playerId) => {
            delete this.players[playerId];
            this.removePlayerCursor(playerId);
            this.updatePlayersUI();
        });

        // Handle cursor movement from other players
        this.socket.on('cursor-move', (data) => {
            this.updatePlayerCursor(data.playerId, data.x, data.y, data.color);
        });

        // Handle canvas clear
        this.socket.on('clear-canvas', () => {
            this.graphics.clear();
        });

        // Store our player ID
        this.socket.on('connect', () => {
            this.myPlayerId = this.socket.id;
        });
    }

    setupInputEvents() {
        // Mouse/touch input for drawing
        this.input.on('pointerdown', (pointer) => {
            this.isDrawing = true;
            this.lastPointer = { x: pointer.x, y: pointer.y };
        });

        this.input.on('pointermove', (pointer) => {
            // Send cursor position to other players
            this.socket.emit('cursor-move', { x: pointer.x, y: pointer.y });
            
            if (this.isDrawing) {
                const drawData = {
                    x1: this.lastPointer.x,
                    y1: this.lastPointer.y,
                    x2: pointer.x,
                    y2: pointer.y,
                    color: this.currentColor,
                    brushSize: this.currentBrushSize
                };
                
                // Draw locally
                this.drawLine(drawData);
                
                // Send to server
                this.socket.emit('drawing', drawData);
                
                this.lastPointer = { x: pointer.x, y: pointer.y };
            }
        });

        this.input.on('pointerup', () => {
            this.isDrawing = false;
        });
    }

    setupUIEvents() {
        // Color selection
        document.querySelectorAll('.color-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelector('.color-btn.active').classList.remove('active');
                e.target.classList.add('active');
                this.currentColor = e.target.dataset.color;
            });
        });

        // Brush size
        const brushSizeSlider = document.getElementById('brushSize');
        const brushSizeValue = document.getElementById('brushSizeValue');
        
        brushSizeSlider.addEventListener('input', (e) => {
            this.currentBrushSize = parseInt(e.target.value);
            brushSizeValue.textContent = this.currentBrushSize;
        });

        // Clear canvas
        document.getElementById('clearBtn').addEventListener('click', () => {
            this.socket.emit('clear-canvas');
            this.graphics.clear();
        });
    }

    drawLine(data) {
        this.graphics.lineStyle(data.brushSize, data.color, 1);
        this.graphics.beginPath();
        this.graphics.moveTo(data.x1, data.y1);
        this.graphics.lineTo(data.x2, data.y2);
        this.graphics.strokePath();
    }

    createPlayerCursor(playerId, color) {
        if (playerId === this.myPlayerId) return;
        
        const cursor = this.add.circle(0, 0, 8, color, 0.7);
        cursor.setVisible(false);
        this.playerCursors[playerId] = cursor;
    }

    updatePlayerCursor(playerId, x, y, color) {
        if (playerId === this.myPlayerId) return;
        
        if (!this.playerCursors[playerId]) {
            this.createPlayerCursor(playerId, color);
        }
        
        const cursor = this.playerCursors[playerId];
        cursor.setPosition(x, y);
        cursor.setVisible(true);
        cursor.setFillStyle(color, 0.7);
    }

    removePlayerCursor(playerId) {
        if (this.playerCursors[playerId]) {
            this.playerCursors[playerId].destroy();
            delete this.playerCursors[playerId];
        }
    }

    updatePlayersUI() {
        const playersList = document.getElementById('playersList');
        playersList.innerHTML = '';
        
        Object.values(this.players).forEach(player => {
            const playerDiv = document.createElement('div');
            playerDiv.className = 'player-item';
            
            const colorDiv = document.createElement('div');
            colorDiv.className = 'player-color';
            colorDiv.style.backgroundColor = player.color;
            
            const nameSpan = document.createElement('span');
            nameSpan.textContent = player.id === this.myPlayerId ? 'You' : `Player ${player.id.substring(0, 6)}`;
            
            playerDiv.appendChild(colorDiv);
            playerDiv.appendChild(nameSpan);
            playersList.appendChild(playerDiv);
        });
    }
}

// Phaser game configuration
const config = {
    type: Phaser.AUTO,
    width: 1000,
    height: 600,
    parent: 'gameCanvas',
    backgroundColor: '#ffffff',
    scene: DrawingGame
};

// Initialize the game
const game = new Phaser.Game(config);
