class MultiplayerShapeGame {
    constructor() {
        this.socket = io();
        this.currentPlayer = null;
        this.currentRoom = null;
        this.game = null;
        this.recognizer = new QDollarRecognizer();
        this.isDrawing = false;
        this.currentStroke = [];
        this.allStrokes = []; // Store all strokes for multi-stroke recognition
        this.strokeTimeout = null; // Timeout for completing multi-stroke gestures
        this.drawingGraphics = null;
        
        this.initializeUI();
        this.initializeSocket();
    }

    initializeUI() {
        // Menu elements
        this.playerNameInput = document.getElementById('playerName');
        this.createRoomBtn = document.getElementById('createRoomBtn');
        this.joinRoomBtn = document.getElementById('joinRoomBtn');
        this.roomCodeInput = document.getElementById('roomCode');
        this.messageArea = document.getElementById('messageArea');
        this.menuScreen = document.getElementById('menuScreen');
        this.gameScreen = document.getElementById('gameScreen');
        
        // Game elements
        this.playersListEl = document.getElementById('playersList');
        this.roomIdEl = document.getElementById('roomId');
        this.gameStatusEl = document.getElementById('gameStatus');
        this.startGameBtn = document.getElementById('startGameBtn');
        this.leaveRoomBtn = document.getElementById('leaveRoomBtn');
        this.instructionsEl = document.getElementById('instructions');
        this.playerColorNameEl = document.getElementById('playerColorName');
        this.gameModeEl = document.getElementById('gameMode');

        // Event listeners
        this.createRoomBtn.addEventListener('click', () => this.createRoom());
        this.joinRoomBtn.addEventListener('click', () => this.joinRoom());
        this.startGameBtn.addEventListener('click', () => this.startGame());
        this.leaveRoomBtn.addEventListener('click', () => this.leaveRoom());
        
        // Enter key support
        this.playerNameInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.createRoom();
        });
        this.roomCodeInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.joinRoom();
        });
        
        // Room code formatting
        this.roomCodeInput.addEventListener('input', (e) => {
            e.target.value = e.target.value.toUpperCase();
        });
    }

    initializeSocket() {
        this.socket.on('roomCreated', (data) => {
            this.currentPlayer = data.player;
            this.currentRoom = data.room;
            this.showGameScreen();
            this.updateGameUI();
            this.showMessage('Room created successfully!', 'success');
        });

        this.socket.on('roomJoined', (data) => {
            this.currentPlayer = data.player;
            this.currentRoom = data.room;
            this.showGameScreen();
            this.updateGameUI();
            this.showMessage('Joined room successfully!', 'success');
        });

        this.socket.on('playerJoined', (data) => {
            this.currentRoom = data.room;
            this.updateGameUI();
            
            // Update avatars if game is already running
            if (this.game && this.game.scene.scenes[0] && this.game.scene.scenes[0].updatePlayerAvatars) {
                this.game.scene.scenes[0].updatePlayerAvatars();
            }
            
            this.showMessage(`${data.player.name} joined the room!`, 'success');
        });

        this.socket.on('playerLeft', (data) => {
            this.currentRoom = data;
            this.updateGameUI();
            
            // Update avatars if game is already running
            if (this.game && this.game.scene.scenes[0] && this.game.scene.scenes[0].updatePlayerAvatars) {
                this.game.scene.scenes[0].updatePlayerAvatars();
            }
        });

        this.socket.on('gameStarted', (data) => {
            this.currentRoom = data;
            this.initializeGame();
            this.updateGameUI();
            this.showMessage('Game started! Start drawing!', 'success');
        });

        this.socket.on('playerDrawing', (data) => {
            if (this.game && this.game.scene.scenes[0].otherPlayersGraphics) {
                this.drawOtherPlayerStroke(data);
            }
        });

        this.socket.on('symbolMatched', (data) => {
            console.log('Symbol matched:', data);
            this.currentRoom = data.room;
            if (this.game && this.game.scene.scenes[0]) {
                console.log('Calling removeSymbol for:', data.symbol.id);
                this.game.scene.scenes[0].removeSymbol(data.symbol.id);
            }
            
            const playerName = this.currentRoom.players.find(p => p.id === data.playerId)?.name || 'Someone';
            this.showMessage(`${playerName} matched a ${data.symbol.type}!`, 'success');
        });

        this.socket.on('gameFinished', (data) => {
            this.currentRoom = data;
            const message = this.currentRoom.players.length === 1 
                ? '🎉 Congratulations! You completed all the symbols! 🎉'
                : '🎉 Congratulations! Your team won the game! 🎉';
            this.showMessage(message, 'success');
            this.updateGameUI();
        });

        this.socket.on('gameLost', (data) => {
            this.currentRoom = data;
            this.showMessage('💀 Game Over! All players have been defeated! 💀', 'error');
            setTimeout(() => {
                this.leaveRoom();
            }, 3000);
        });

        this.socket.on('tentacleUpdate', (data) => {
            this.currentRoom = data;
            if (this.game && this.game.scene.scenes[0]) {
                this.game.scene.scenes[0].updateTentacles();
            }
        });

        this.socket.on('playerUpdate', (data) => {
            this.currentRoom = data;
            if (this.game && this.game.scene.scenes[0]) {
                this.game.scene.scenes[0].updatePlayerHearts();
            }
            this.updateGameUI();
        });

        this.socket.on('roomFull', () => {
            this.showMessage('Room is full!', 'error');
        });

        this.socket.on('roomNotFound', () => {
            this.showMessage('Room not found!', 'error');
        });
    }

    createRoom() {
        const playerName = this.playerNameInput.value.trim();
        if (!playerName) {
            this.showMessage('Please enter your name!', 'error');
            return;
        }
        
        this.socket.emit('createRoom', { playerName });
    }

    joinRoom() {
        const playerName = this.playerNameInput.value.trim();
        const roomId = this.roomCodeInput.value.trim();
        
        if (!playerName) {
            this.showMessage('Please enter your name!', 'error');
            return;
        }
        
        if (!roomId) {
            this.showMessage('Please enter a room code!', 'error');
            return;
        }
        
        this.socket.emit('joinRoom', { playerName, roomId });
    }

    startGame() {
        this.socket.emit('startGame');
    }

    leaveRoom() {
        if (this.game) {
            this.game.destroy(true);
            this.game = null;
        }
        
        this.currentPlayer = null;
        this.currentRoom = null;
        this.showMenuScreen();
    }

    showMenuScreen() {
        this.menuScreen.classList.remove('hidden');
        this.gameScreen.classList.add('hidden');
        this.playerNameInput.value = '';
        this.roomCodeInput.value = '';
        this.messageArea.innerHTML = '';
    }

    showGameScreen() {
        this.menuScreen.classList.add('hidden');
        this.gameScreen.classList.remove('hidden');
    }

    updateGameUI() {
        if (!this.currentRoom || !this.currentPlayer) return;

        // Update room ID
        this.roomIdEl.textContent = this.currentRoom.id;

        // Update players list
        this.playersListEl.innerHTML = '';
        this.currentRoom.players.forEach(player => {
            const playerEl = document.createElement('div');
            playerEl.className = 'player-item';
            
            // Show hearts for each player
            const heartsHtml = '❤️'.repeat(player.hearts) + '💔'.repeat(Math.max(0, 3 - player.hearts));
            const statusText = player.alive ? '' : ' (💀 Defeated)';
            
            playerEl.innerHTML = `
                <div class="player-color" style="background-color: ${player.color}"></div>
                <span>${player.name}${player.id === this.currentPlayer.id ? ' (You)' : ''}${statusText}</span>
                <div style="margin-left: 10px;">${heartsHtml}</div>
            `;
            this.playersListEl.appendChild(playerEl);
        });

        // Update player color name and game mode text
        this.playerColorNameEl.textContent = this.currentPlayer.colorName;
        this.playerColorNameEl.style.color = this.currentPlayer.color;
        
        // Update game mode instructions based on player count
        if (this.gameModeEl) {
            if (this.currentRoom.players.length === 1) {
                this.gameModeEl.textContent = 'Clear all symbols to win!';
            } else {
                this.gameModeEl.textContent = 'Work together with your team to clear all symbols and win!';
            }
        }

        // Update game status and show/hide UI elements based on game state
        if (this.currentRoom.gameState === 'waiting') {
            this.gameStatusEl.textContent = `Waiting for players... (${this.currentRoom.players.length}/4)`;
            if (this.currentRoom.players[0].id === this.currentPlayer.id && this.currentRoom.players.length >= 1) {
                this.startGameBtn.classList.remove('hidden');
            } else {
                this.startGameBtn.classList.add('hidden');
            }
            this.instructionsEl.classList.remove('hidden');
            
            // Show lobby elements, hide game canvas
            document.querySelector('.game-info').classList.remove('hidden');
            document.getElementById('gameCanvas').classList.add('hidden');
        } else if (this.currentRoom.gameState === 'playing') {
            const completedCount = this.currentRoom.completedSymbols.length;
            const totalCount = this.currentRoom.targetSymbols.length;
            this.gameStatusEl.textContent = `Playing... (${completedCount}/${totalCount} symbols completed)`;
            this.startGameBtn.classList.add('hidden');
            this.instructionsEl.classList.add('hidden');
            
            // Hide lobby elements, show game canvas
            document.querySelector('.game-info').classList.add('hidden');
            document.getElementById('gameCanvas').classList.remove('hidden');
        } else if (this.currentRoom.gameState === 'finished') {
            const message = this.currentRoom.players.length === 1 
                ? 'Game finished! You completed all symbols! 🎉'
                : 'Game finished! Your team won! 🎉';
            this.gameStatusEl.textContent = message;
            this.startGameBtn.classList.add('hidden');
            this.instructionsEl.classList.add('hidden');
            
            // Show lobby elements again for post-game
            document.querySelector('.game-info').classList.remove('hidden');
            document.getElementById('gameCanvas').classList.remove('hidden');
        } else if (this.currentRoom.gameState === 'lost') {
            this.gameStatusEl.textContent = 'Game Over! All players defeated! 💀';
            this.startGameBtn.classList.add('hidden');
            this.instructionsEl.classList.add('hidden');
            
            // Show lobby elements again for post-game
            document.querySelector('.game-info').classList.remove('hidden');
            document.getElementById('gameCanvas').classList.add('hidden');
        }
    }

    initializeGame() {
        if (this.game) {
            this.game.destroy(true);
        }

        const config = {
            type: Phaser.AUTO,
            width: window.innerWidth,
            height: window.innerHeight,
            parent: 'gameCanvas',
            backgroundColor: '#fff',
            scene: {
                preload: () => this.preload(),
                create: () => this.create(),
                update: () => this.update()
            }
        };

        this.game = new Phaser.Game(config);
    }

    preload() {
        const scene = this.game.scene.scenes[0];
        
        // Try to load background, fallback if not available
        scene.load.image('background', 'assets/background.svg');
        
        // Try to load player avatars, fallback if not available
        scene.load.image('avatar_red', 'assets/avatars/red.svg');
        scene.load.image('avatar_teal', 'assets/avatars/teal.svg');
        scene.load.image('avatar_blue', 'assets/avatars/blue.svg');
        scene.load.image('avatar_green', 'assets/avatars/green.svg');
        
        // Try to load symbol assets, fallback if not available
        scene.load.image('symbol_star', 'assets/symbols/star.svg');
        scene.load.image('symbol_asterisk', 'assets/symbols/asterisk.svg');
        scene.load.image('symbol_x', 'assets/symbols/x.svg');
        scene.load.image('symbol_h', 'assets/symbols/h.svg');
        scene.load.image('symbol_t', 'assets/symbols/t.svg');
        scene.load.image('symbol_line', 'assets/symbols/line.svg');
        
        // Load tentacle asset
        scene.load.image('tentacle', 'assets/tentacle.png');
        
        // Handle load errors gracefully
        scene.load.on('loaderror', (file) => {
            console.warn('Failed to load asset:', file.key);
        });
    }

    create() {
        const scene = this.game.scene.scenes[0];
        
        // Add background (or colored rectangle if asset missing)
        let background;
        try {
            background = scene.add.image(window.innerWidth / 2, window.innerHeight / 2, 'background');
            background.setDisplaySize(window.innerWidth, window.innerHeight);
        } catch (e) {
            // Fallback: create a simple colored background
            background = scene.add.rectangle(window.innerWidth / 2, window.innerHeight / 2, window.innerWidth, window.innerHeight, 0x2c3e50);
        }
        
        // Create graphics object for drawing (on top of background)
        this.drawingGraphics = scene.add.graphics();
        
        // Create graphics for other players' drawings
        scene.otherPlayersGraphics = scene.add.graphics();
        
        // Create text for multi-stroke indicator
        scene.strokeIndicator = scene.add.text(10, 10, '', {
            fontSize: '16px',
            fill: '#ffffff',
            backgroundColor: '#000000',
            padding: { x: 10, y: 5 }
        }).setScrollFactor(0); // Keep it fixed on screen
        scene.strokeIndicator.setVisible(false);
        
        // Create player avatars
        scene.playerAvatars = new Map();
        this.createPlayerAvatars(scene);
        
        // Create symbols (tentacles)
        scene.symbols = new Map();
        scene.tentacles = new Map(); // Separate map for tentacle sprites
        this.createSymbols(scene);
        
        // Create hearts display
        scene.heartsDisplay = new Map();
        this.createHeartsDisplay(scene);

        // Store player drawing positions for showing above avatars
        scene.playerDrawings = new Map();
        
        // Add methods
        scene.removeSymbol = (symbolId) => {
            const symbolObj = scene.symbols.get(symbolId);
            if (symbolObj) {
                symbolObj.destroy();
                scene.symbols.delete(symbolId);
            }
            const tentacleObj = scene.tentacles.get(symbolId);
            if (tentacleObj) {
                tentacleObj.destroy();
                scene.tentacles.delete(symbolId);
            }
        };
        
        scene.updateTentacles = () => {
            this.updateTentacles(scene);
        };
        
        scene.updatePlayerHearts = () => {
            this.updateHeartsDisplay(scene);
        };
        
        // Input handling - ensure pointer events work across the entire canvas
        scene.input.on('pointerdown', (pointer) => {
            // If starting a completely new gesture, clear previous drawing
            if (!this.isDrawing && this.allStrokes.length === 0) {
                this.drawingGraphics.clear();
            }
            this.startDrawing(pointer.x, pointer.y);
        });
        
        scene.input.on('pointermove', (pointer) => {
            if (this.isDrawing) {
                this.addDrawingPoint(pointer.x, pointer.y);
            }
        });
        
        scene.input.on('pointerup', (pointer) => {
            this.stopDrawing(pointer.x, pointer.y);
        });

        // Add method to update player avatars
        scene.updatePlayerAvatars = () => {
            this.updatePlayerAvatars(scene);
        };
    }

    update() {
        // Game update logic if needed
    }

    createPlayerAvatars(scene) {
        if (!this.currentRoom || !this.currentRoom.players) return;

        // Clear existing avatars
        scene.playerAvatars.forEach(avatarData => {
            if (avatarData.avatar) avatarData.avatar.destroy();
            if (avatarData.nameText) avatarData.nameText.destroy();
        });
        scene.playerAvatars.clear();

        this.currentRoom.players.forEach(player => {
            let avatar;
            try {
                const avatarKey = `avatar_${player.avatar}`;
                avatar = scene.add.image(player.x, player.y, avatarKey);
                avatar.setScale(0.5);
            } catch (e) {
                // Fallback: create a colored circle as avatar
                avatar = scene.add.circle(player.x, player.y, 25, Phaser.Display.Color.HexStringToColor(player.color).color);
            }
            
            // Add player name text above avatar
            const nameText = scene.add.text(player.x, player.y - 40, player.name, {
                fontSize: '14px',
                fill: player.color,
                stroke: '#000000',
                strokeThickness: 2,
                align: 'center'
            }).setOrigin(0.5);
            
            // Store both avatar and name text
            scene.playerAvatars.set(player.id, {
                avatar: avatar,
                nameText: nameText,
                player: player
            });
        });
    }

    updatePlayerAvatars(scene) {
        this.createPlayerAvatars(scene);
    }

    createSymbols(scene) {
        if (!this.currentRoom || !this.currentRoom.targetSymbols) return;

        this.currentRoom.targetSymbols.forEach(symbol => {
            if (!symbol.completed) {
                // Create tentacle sprite
                let tentacleSprite;
                try {
                    tentacleSprite = scene.add.image(symbol.x, symbol.y, 'tentacle');
                    tentacleSprite.setScale(0.6);
                } catch (e) {
                    // Fallback: create a circle
                    tentacleSprite = scene.add.circle(symbol.x, symbol.y, 20, 0x444444);
                }
                
                scene.tentacles.set(symbol.id, tentacleSprite);
                
                // Create symbol on top of tentacle
                const symbolObj = this.createSymbolSprite(scene, symbol);
                scene.symbols.set(symbol.id, symbolObj);
            }
        });
    }

    updateTentacles(scene) {
        if (!this.currentRoom || !this.currentRoom.targetSymbols) return;

        this.currentRoom.targetSymbols.forEach(symbol => {
            if (!symbol.completed) {
                const tentacleSprite = scene.tentacles.get(symbol.id);
                const symbolSprite = scene.symbols.get(symbol.id);
                
                if (tentacleSprite) {
                    tentacleSprite.setPosition(symbol.x, symbol.y);
                }
                if (symbolSprite) {
                    symbolSprite.setPosition(symbol.x, symbol.y);
                }
            }
        });
    }

    createHeartsDisplay(scene) {
        if (!this.currentRoom || !this.currentRoom.players) return;

        this.currentRoom.players.forEach(player => {
            const heartsContainer = scene.add.container(player.x, player.y - 60);
            
            const hearts = [];
            for (let i = 0; i < 3; i++) {
                try {
                    // Try to create heart sprite (assuming heart.png exists)
                    const heart = scene.add.image(i * 20 - 20, 0, 'heart');
                    heart.setScale(0.3);
                    hearts.push(heart);
                } catch (e) {
                    // Fallback: create red circles
                    const heart = scene.add.circle(i * 20 - 20, 0, 8, 0xff0000);
                    hearts.push(heart);
                }
                heartsContainer.add(hearts[i]);
            }
            
            scene.heartsDisplay.set(player.id, { container: heartsContainer, hearts: hearts });
        });
    }

    updateHeartsDisplay(scene) {
        if (!this.currentRoom || !this.currentRoom.players) return;

        this.currentRoom.players.forEach(player => {
            const heartsData = scene.heartsDisplay.get(player.id);
            if (heartsData) {
                // Update heart visibility based on player's remaining hearts
                heartsData.hearts.forEach((heart, index) => {
                    heart.setVisible(index < player.hearts);
                    if (index < player.hearts) {
                        heart.setAlpha(1);
                    } else {
                        heart.setAlpha(0.3);
                    }
                });
                
                // Update position
                heartsData.container.setPosition(player.x, player.y - 60);
            }
        });
    }

    createSymbolSprite(scene, symbol) {
        // Map symbol types to asset keys
        const symbolAssetMap = {
            'five-point star': 'symbol_star',
            'asterisk': 'symbol_asterisk',
            'X': 'symbol_x',
            'H': 'symbol_h',
            'T': 'symbol_t',
            'line': 'symbol_line'
        };
        
        const assetKey = symbolAssetMap[symbol.type] || 'symbol_star';
        let symbolSprite;
        
        // Always use graphics fallback for now to ensure symbols appear
        const graphics = scene.add.graphics();
        graphics.x = symbol.x;
        graphics.y = symbol.y;
        
        const color = Phaser.Display.Color.HexStringToColor(symbol.color).color;
        graphics.lineStyle(4, color);
        graphics.fillStyle(color, 0.3);
        
        switch (symbol.type) {
            case 'five-point star':
                this.drawStar(graphics, 0, 0, 30);
                break;
            case 'asterisk':
                this.drawAsterisk(graphics, 0, 0, 25);
                break;
            case 'X':
                this.drawX(graphics, 0, 0, 25);
                break;
            case 'H':
                this.drawH(graphics, 0, 0, 25);
                break;
            case 'T':
                this.drawT(graphics, 0, 0, 25);
                break;
            case 'line':
                this.drawLine(graphics, 0, 0, 40);
                break;
            default:
                this.drawStar(graphics, 0, 0, 30);
                break;
        }
        
        symbolSprite = graphics;
        return symbolSprite;
    }

    drawStar(graphics, x, y, radius) {
        const points = [];
        for (let i = 0; i < 5; i++) {
            const angle = (i * Math.PI * 2) / 5 - Math.PI / 2;
            const outerX = x + Math.cos(angle) * radius;
            const outerY = y + Math.sin(angle) * radius;
            points.push(outerX, outerY);
            
            const innerAngle = angle + Math.PI / 5;
            const innerX = x + Math.cos(innerAngle) * radius * 0.4;
            const innerY = y + Math.sin(innerAngle) * radius * 0.4;
            points.push(innerX, innerY);
        }
        graphics.fillPoints(points);
        graphics.strokePoints(points);
    }

    drawAsterisk(graphics, x, y, size) {
        // Draw three lines forming an asterisk
        graphics.beginPath();
        graphics.moveTo(x - size, y);
        graphics.lineTo(x + size, y);
        graphics.moveTo(x, y - size);
        graphics.lineTo(x, y + size);
        graphics.moveTo(x - size * 0.7, y - size * 0.7);
        graphics.lineTo(x + size * 0.7, y + size * 0.7);
        graphics.strokePath();
    }

    drawX(graphics, x, y, size) {
        graphics.beginPath();
        graphics.moveTo(x - size, y - size);
        graphics.lineTo(x + size, y + size);
        graphics.moveTo(x + size, y - size);
        graphics.lineTo(x - size, y + size);
        graphics.strokePath();
    }

    drawH(graphics, x, y, size) {
        graphics.beginPath();
        graphics.moveTo(x - size, y - size);
        graphics.lineTo(x - size, y + size);
        graphics.moveTo(x - size, y);
        graphics.lineTo(x + size, y);
        graphics.moveTo(x + size, y - size);
        graphics.lineTo(x + size, y + size);
        graphics.strokePath();
    }

    drawT(graphics, x, y, size) {
        graphics.beginPath();
        graphics.moveTo(x - size, y - size);
        graphics.lineTo(x + size, y - size);
        graphics.moveTo(x, y - size);
        graphics.lineTo(x, y + size);
        graphics.strokePath();
    }

    drawLine(graphics, x, y, size) {
        graphics.beginPath();
        graphics.moveTo(x - size, y);
        graphics.lineTo(x + size, y);
        graphics.strokePath();
    }

    startDrawing(x, y) {
        this.isDrawing = true;
        this.currentStroke = [];
        
        // Clear stroke timeout if exists
        if (this.strokeTimeout) {
            clearTimeout(this.strokeTimeout);
            this.strokeTimeout = null;
        }
        
        // Start first point of new stroke
        this.addDrawingPoint(x, y);
    }

    addDrawingPoint(x, y) {
        if (!this.isDrawing) return;
        
        // Use current stroke ID based on number of completed strokes + 1
        const strokeId = this.allStrokes.length + 1;
        const point = new Point(x, y, strokeId);
        this.currentStroke.push(point);
        
        // Draw the stroke - make it more visible
        if (this.currentStroke.length > 1) {
            const prevPoint = this.currentStroke[this.currentStroke.length - 2];
            this.drawingGraphics.lineStyle(4, Phaser.Display.Color.HexStringToColor(this.currentPlayer.color).color, 1.0);
            this.drawingGraphics.lineBetween(prevPoint.X, prevPoint.Y, x, y);
        } else {
            // Draw a small dot for single points
            this.drawingGraphics.fillStyle(Phaser.Display.Color.HexStringToColor(this.currentPlayer.color).color);
            this.drawingGraphics.fillCircle(x, y, 2);
        }
        
        // Emit drawing data to other players
        this.socket.emit('drawingData', {
            x: x,
            y: y,
            isStart: this.currentStroke.length === 1,
            color: this.currentPlayer.color
        });
    }

    stopDrawing(x, y) {
        if (!this.isDrawing) return;
        
        this.isDrawing = false;
        const scene = this.game.scene.scenes[0];
        
        // Add current stroke to all strokes if it has enough points
        if (this.currentStroke.length > 3) {
            this.allStrokes.push([...this.currentStroke]);
            
            // Update stroke indicator
            if (scene.strokeIndicator) {
                scene.strokeIndicator.setText(`Strokes: ${this.allStrokes.length} (Drawing more in 1.5s...)`);
                scene.strokeIndicator.setVisible(true);
            }
            
            // Set timeout to complete the gesture after 1.5 seconds of no new strokes
            if (this.strokeTimeout) {
                clearTimeout(this.strokeTimeout);
            }
            
            this.strokeTimeout = setTimeout(() => {
                this.completeGesture();
            }, 1500);
            
            console.log(`Added stroke ${this.allStrokes.length}, waiting for more strokes or timeout...`);
        } else {
            // If stroke is too short, still try to recognize single-stroke gestures
            if (this.allStrokes.length === 0) {
                console.log('Single stroke too short, ignoring');
                this.clearDrawing();
            }
        }
    }
    
    completeGesture() {
        if (this.allStrokes.length === 0) {
            this.clearDrawing();
            return;
        }
        
        // Combine all strokes into single point array for recognition
        let allPoints = [];
        this.allStrokes.forEach((stroke, index) => {
            stroke.forEach(point => {
                // Create new point with correct stroke ID
                allPoints.push(new Point(point.X, point.Y, index + 1));
            });
        });
        
        console.log(`Recognizing gesture with ${this.allStrokes.length} strokes and ${allPoints.length} total points`);
        
        // Recognize the complete gesture
        const result = this.recognizer.Recognize(allPoints);
        
        console.log(`Recognition result: ${result.Name} (confidence: ${result.Score})`);
        
        if (result.Score > 0.3) { // Lower confidence threshold to make matching easier
            console.log(`Sending recognition: ${result.Name}`);
            
            // Calculate centroid of all strokes for position
            let totalX = 0, totalY = 0, totalPoints = 0;
            this.allStrokes.forEach(stroke => {
                stroke.forEach(point => {
                    totalX += point.X;
                    totalY += point.Y;
                    totalPoints++;
                });
            });
            
            const centerX = totalX / totalPoints;
            const centerY = totalY / totalPoints;
            
            // Send recognition result to server
            this.socket.emit('symbolRecognized', {
                symbolType: result.Name,
                x: centerX,
                y: centerY,
                confidence: result.Score
            });
        }
        
        // Clear all drawing data
        this.clearDrawing();
    }
    
    clearDrawing() {
        const scene = this.game.scene.scenes[0];
        
        // Hide stroke indicator
        if (scene.strokeIndicator) {
            scene.strokeIndicator.setVisible(false);
        }
        
        // Reset all stroke data
        this.allStrokes = [];
        this.currentStroke = [];
        
        // Clear timeout
        if (this.strokeTimeout) {
            clearTimeout(this.strokeTimeout);
            this.strokeTimeout = null;
        }
        
        // Clear visual drawing after a short delay
        setTimeout(() => {
            if (this.drawingGraphics) {
                this.drawingGraphics.clear();
            }
        }, 500);
    }

    drawOtherPlayerStroke(data) {
        const scene = this.game.scene.scenes[0];
        if (!scene.otherPlayersGraphics) return;
        
        // Get the player's avatar position to draw above it
        const playerAvatar = scene.playerAvatars.get(data.playerId);
        let drawingOffset = { x: 0, y: -60 }; // Default offset above where avatar would be
        
        if (playerAvatar) {
            drawingOffset = { 
                x: playerAvatar.player.x - data.x, 
                y: playerAvatar.player.y - 60 - data.y 
            };
        }
        
        if (data.isStart) {
            // Start new stroke
            scene.otherPlayersLastPos = scene.otherPlayersLastPos || {};
            scene.otherPlayersLastPos[data.playerId] = { x: data.x, y: data.y };
        } else {
            // Continue stroke
            const lastPos = scene.otherPlayersLastPos?.[data.playerId];
            if (lastPos) {
                scene.otherPlayersGraphics.lineStyle(2, Phaser.Display.Color.HexStringToColor(data.color).color, 0.7);
                scene.otherPlayersGraphics.lineBetween(lastPos.x, lastPos.y, data.x, data.y);
                scene.otherPlayersLastPos[data.playerId] = { x: data.x, y: data.y };
            }
        }
        
        // Clear other players' drawings after a delay
        setTimeout(() => {
            if (scene.otherPlayersGraphics) {
                scene.otherPlayersGraphics.clear();
            }
        }, 1500);
    }

    showMessage(message, type) {
        const messageEl = document.createElement('div');
        messageEl.className = `message ${type}`;
        messageEl.textContent = message;
        
        // Add to appropriate message area
        if (this.menuScreen.classList.contains('hidden')) {
            // Show in game area
            if (!document.getElementById('gameMessageArea')) {
                const gameMessageArea = document.createElement('div');
                gameMessageArea.id = 'gameMessageArea';
                gameMessageArea.style.position = 'fixed';
                gameMessageArea.style.top = '10px';
                gameMessageArea.style.right = '10px';
                gameMessageArea.style.zIndex = '1000';
                gameMessageArea.style.maxWidth = '300px';
                document.body.appendChild(gameMessageArea);
            }
            document.getElementById('gameMessageArea').appendChild(messageEl);
        } else {
            // Show in menu area
            this.messageArea.appendChild(messageEl);
        }
        
        // Remove message after 3 seconds
        setTimeout(() => {
            messageEl.remove();
        }, 3000);
    }
}

// Initialize the game when the page loads
window.addEventListener('load', () => {
    new MultiplayerShapeGame();
});
