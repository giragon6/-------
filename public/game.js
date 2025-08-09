class MultiplayerShapeGame {
    constructor() {
        console.log('MultiplayerShapeGame constructor called'); // Debug log
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
        this.thumbnailGame = null; // For thumbnail drawing
        this.availableRooms = new Map(); // Store available rooms
        
        this.initializeUI();
        this.initializeSocket();
    }

    initializeUI() {
        console.log('initializeUI called'); // Debug log
        // Menu elements
        this.createRoomBtn = document.getElementById('createRoomBtn');
        console.log('createRoomBtn:', this.createRoomBtn); // Debug log
        this.roomsGallery = document.getElementById('roomsGallery');
        this.thumbnailCanvas = document.getElementById('thumbnailCanvas');
        console.log('thumbnailCanvas:', this.thumbnailCanvas); // Debug log
        this.messageArea = document.getElementById('messageArea');
        this.menuScreen = document.getElementById('menuScreen');
        this.gameScreen = document.getElementById('gameScreen');
        
        // Game elements
        this.lobbyScreen = document.getElementById('lobbyScreen');
        this.lobbyPlayersList = document.getElementById('lobbyPlayersList');
        this.startGameBtn = document.getElementById('startGameBtn');
        this.leaveLobbyBtn = document.getElementById('leaveLobbyBtn');
        this.exitGameBtn = document.getElementById('exitGameBtn');
        this.gameUI = document.getElementById('gameUI');
        this.playersListEl = document.getElementById('playersList');

        // Event listeners
        console.log('Adding event listener to createRoomBtn'); // Debug log
        this.createRoomBtn.addEventListener('click', () => this.startCreatingRoom());
        this.startGameBtn.addEventListener('click', () => this.startGame());
        this.leaveLobbyBtn.addEventListener('click', () => this.leaveRoom());
        this.exitGameBtn.addEventListener('click', () => this.leaveRoom());
    }

    initializeSocket() {
        // Listen for rooms list updates
        this.socket.on('roomsList', (rooms) => {
            this.updateRoomsGallery(rooms);
        });

        this.socket.on('roomCreated', (data) => {
            this.currentPlayer = data.player;
            this.currentRoom = data.room;
            this.hideThumbnailCanvas();
            this.showLobbyScreen();
            this.updateLobbyUI();
        });

        this.socket.on('roomJoined', (data) => {
            this.currentPlayer = data.player;
            this.currentRoom = data.room;
            this.showLobbyScreen();
            this.updateLobbyUI();
        });

        this.socket.on('playerJoined', (data) => {
            this.currentRoom = data.room;
            if (this.currentRoom.gameState === 'lobby') {
                this.updateLobbyUI();
            } else {
                // Update game UI and avatars if game is running
                this.updateGameUI();
                if (this.game && this.game.scene.scenes[0] && this.game.scene.scenes[0].updatePlayerAvatars) {
                    this.game.scene.scenes[0].updatePlayerAvatars();
                }
            }
        });

        this.socket.on('playerLeft', (data) => {
            this.currentRoom = data;
            if (this.currentRoom.gameState === 'lobby') {
                this.updateLobbyUI();
            } else {
                // Update game UI and avatars if game is running
                this.updateGameUI();
                if (this.game && this.game.scene.scenes[0] && this.game.scene.scenes[0].updatePlayerAvatars) {
                    this.game.scene.scenes[0].updatePlayerAvatars();
                }
            }
        });

        this.socket.on('gameStarted', (data) => {
            this.currentRoom = data;
            this.showGameScreen();
            this.initializeGame();
            this.updateGameUI();
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
        });

        this.socket.on('roundCompleted', (data) => {
            this.currentRoom = data;
            console.log(`Round ${data.currentRound - 1} completed! Starting round ${data.currentRound}/${data.maxRounds}`);
            
            // Trigger winning animation for round completion
            if (this.game && this.game.scene.scenes[0]) {
                this.playWinAnimation();
            }
            
            // Clear existing tentacles/symbols and create new ones for next round
            if (this.game && this.game.scene.scenes[0]) {
                this.clearAllTentaclesAndSymbols(this.game.scene.scenes[0]);
                this.createSymbols(this.game.scene.scenes[0]);
            }
            
            this.updateGameUI();
        });

        this.socket.on('gameLost', (data) => {
            this.currentRoom = data;
            if (this.game && this.game.scene.scenes[0]) {
                this.playLoseAnimation();
            }
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
            this.updateGameUI();
        });

        this.socket.on('roomFull', () => {
        });

        this.socket.on('roomNotFound', () => {
        });
    }

    startCreatingRoom() {
        console.log('startCreatingRoom called'); // Debug log
        // Show thumbnail creation canvas
        this.showThumbnailCanvas();
    }

    showThumbnailCanvas() {
        console.log('showThumbnailCanvas called'); // Debug log
        this.thumbnailCanvas.classList.remove('hidden');
        
        // Initialize thumbnail drawing game
        const config = {
            type: Phaser.AUTO,
            width: 300,
            height: 300,
            parent: 'thumbnailCanvas',
            backgroundColor: '#ffffff',
            scene: {
                create: () => this.createThumbnailScene(),
            }
        };

        this.thumbnailGame = new Phaser.Game(config);
    }

    createThumbnailScene() {
        const scene = this.thumbnailGame.scene.scenes[0];
        
        // Create graphics for drawing
        const graphics = scene.add.graphics();
        let isDrawing = false;
        let currentStroke = [];
        let allStrokes = [];

        // Add instructions text
        const instructions = scene.add.text(150, 30, '✏️', {
            fontSize: '32px',
            fill: '#666666',
            align: 'center'
        }).setOrigin(0.5);

        // Input handling
        scene.input.on('pointerdown', (pointer) => {
            isDrawing = true;
            currentStroke = [];
            currentStroke.push({ x: pointer.x, y: pointer.y });
        });

        scene.input.on('pointermove', (pointer) => {
            if (isDrawing) {
                currentStroke.push({ x: pointer.x, y: pointer.y });
                
                // Draw the stroke
                if (currentStroke.length > 1) {
                    const prevPoint = currentStroke[currentStroke.length - 2];
                    graphics.lineStyle(3, 0x333333, 1.0);
                    graphics.lineBetween(prevPoint.x, prevPoint.y, pointer.x, pointer.y);
                }
            }
        });

        scene.input.on('pointerup', (pointer) => {
            if (isDrawing) {
                isDrawing = false;
                if (currentStroke.length > 3) {
                    allStrokes.push([...currentStroke]);
                }
            }
        });

        // Store references for thumbnail capture
        scene.graphics = graphics;
        scene.allStrokes = allStrokes;

        // Add buttons
        const createBtn = scene.add.text(150, 250, '✓', {
            fontSize: '24px',
            fill: '#4ECDC4',
            backgroundColor: '#ffffff',
            padding: { x: 15, y: 10 },
            align: 'center'
        }).setOrigin(0.5);
        createBtn.setInteractive();
        createBtn.on('pointerdown', () => {
            this.createRoomWithThumbnail(this.captureThumbnail(scene));
        });

        const cancelBtn = scene.add.text(100, 250, '✕', {
            fontSize: '24px',
            fill: '#ff6b6b',
            backgroundColor: '#ffffff',
            padding: { x: 15, y: 10 },
            align: 'center'
        }).setOrigin(0.5);
        cancelBtn.setInteractive();
        cancelBtn.on('pointerdown', () => {
            this.hideThumbnailCanvas();
        });

        const clearBtn = scene.add.text(200, 250, '⟲', {
            fontSize: '24px',
            fill: '#666666',
            backgroundColor: '#ffffff',
            padding: { x: 15, y: 10 },
            align: 'center'
        }).setOrigin(0.5);
        clearBtn.setInteractive();
        clearBtn.on('pointerdown', () => {
            graphics.clear();
            allStrokes.length = 0; // Clear the strokes array
        });
    }

    captureThumbnail(scene) {
        // Capture the actual stroke data
        return {
            strokes: scene.allStrokes.map(stroke => [...stroke]), // Deep copy the strokes
            timestamp: Date.now()
        };
    }

    createRoomWithThumbnail(thumbnail) {
        this.socket.emit('createRoom', { thumbnail });
    }

    hideThumbnailCanvas() {
        this.thumbnailCanvas.classList.add('hidden');
        if (this.thumbnailGame) {
            this.thumbnailGame.destroy(true);
            this.thumbnailGame = null;
        }
    }

    updateRoomsGallery(rooms) {
        // Clear existing rooms except the title
        const galleryTitle = this.roomsGallery.querySelector('.gallery-title');
        this.roomsGallery.innerHTML = '';

        // Add room thumbnails
        rooms.forEach(room => {
            if (room.gameState === 'lobby') { // Only show lobby rooms
                const thumbnailEl = document.createElement('div');
                thumbnailEl.className = 'room-thumbnail';
                
                // Create thumbnail content
                const thumbnailContent = document.createElement('canvas');
                thumbnailContent.width = 120;
                thumbnailContent.height = 120;
                thumbnailContent.style.width = '100%';
                thumbnailContent.style.height = '100%';
                thumbnailContent.style.borderRadius = '15px';
                
                // Draw the thumbnail from stroke data
                this.renderThumbnailStrokes(thumbnailContent, room.thumbnail);
                
                // Add play icon
                const playIcon = document.createElement('div');
                playIcon.className = 'play-icon';
                playIcon.textContent = '▶';
                
                // Add player count
                const playerCount = document.createElement('div');
                playerCount.className = 'player-count';
                playerCount.textContent = `${room.playerCount}/4`;
                
                thumbnailEl.appendChild(thumbnailContent);
                thumbnailEl.appendChild(playIcon);
                thumbnailEl.appendChild(playerCount);
                
                // Add click handler to join room
                thumbnailEl.addEventListener('click', () => {
                    this.joinRoom(room.id);
                });
                
                this.roomsGallery.appendChild(thumbnailEl);
            }
        });
    }

    joinRoom(roomId) {
        this.socket.emit('joinRoom', { roomId });
    }

    renderThumbnailStrokes(canvas, thumbnailData) {
        const ctx = canvas.getContext('2d');
        
        // Set background
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        // If no thumbnail data, show placeholder
        if (!thumbnailData || !thumbnailData.strokes || thumbnailData.strokes.length === 0) {
            ctx.fillStyle = '#666666';
            ctx.font = '24px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('🎨', canvas.width / 2, canvas.height / 2);
            return;
        }
        
        // Set up drawing style
        ctx.strokeStyle = '#333333';
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        
        // Calculate scaling to fit the drawing in the thumbnail
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        
        thumbnailData.strokes.forEach(stroke => {
            stroke.forEach(point => {
                minX = Math.min(minX, point.x);
                minY = Math.min(minY, point.y);
                maxX = Math.max(maxX, point.x);
                maxY = Math.max(maxY, point.y);
            });
        });
        
        // Add padding and scale to fit
        const padding = 10;
        const scaleX = (canvas.width - padding * 2) / (maxX - minX || 1);
        const scaleY = (canvas.height - padding * 2) / (maxY - minY || 1);
        const scale = Math.min(scaleX, scaleY, 1); // Don't scale up
        
        const offsetX = padding + (canvas.width - padding * 2 - (maxX - minX) * scale) / 2;
        const offsetY = padding + (canvas.height - padding * 2 - (maxY - minY) * scale) / 2;
        
        // Draw each stroke
        thumbnailData.strokes.forEach(stroke => {
            if (stroke.length < 2) return;
            
            ctx.beginPath();
            const firstPoint = stroke[0];
            ctx.moveTo(
                (firstPoint.x - minX) * scale + offsetX,
                (firstPoint.y - minY) * scale + offsetY
            );
            
            for (let i = 1; i < stroke.length; i++) {
                const point = stroke[i];
                ctx.lineTo(
                    (point.x - minX) * scale + offsetX,
                    (point.y - minY) * scale + offsetY
                );
            }
            
            ctx.stroke();
        });
    }

    startGame() {
        this.socket.emit('startGame');
    }

    leaveRoom() {
        if (this.game) {
            // Clean up any animation timers before destroying the game
            const scene = this.game.scene.scenes[0];
            if (scene && scene.playerAvatars) {
                scene.playerAvatars.forEach(avatarData => {
                    if (avatarData.animationTimer) {
                        clearInterval(avatarData.animationTimer);
                    }
                });
            }
            
            // Clean up tentacle animation timers
            if (scene && scene.tentacles) {
                scene.tentacles.forEach(tentacleData => {
                    if (tentacleData.animationTimer) {
                        clearInterval(tentacleData.animationTimer);
                    }
                });
            }
            
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
    }

    showGameScreen() {
        this.menuScreen.classList.add('hidden');
        this.gameScreen.classList.remove('hidden');
        this.lobbyScreen.classList.add('hidden');
        this.gameUI.classList.remove('hidden');
        
        // Show game canvas and exit button
        document.getElementById('gameCanvas').classList.remove('hidden');
        this.exitGameBtn.style.display = 'block';
    }

    showLobbyScreen() {
        this.menuScreen.classList.add('hidden');
        this.gameScreen.classList.remove('hidden');
        this.lobbyScreen.classList.remove('hidden');
        this.gameUI.classList.add('hidden');
        
        // Hide game canvas and exit button
        document.getElementById('gameCanvas').classList.add('hidden');
        this.exitGameBtn.style.display = 'none';
    }

    updateLobbyUI() {
        if (!this.currentRoom || !this.currentPlayer) return;

        // Clear and update players list
        this.lobbyPlayersList.innerHTML = '';
        
        this.currentRoom.players.forEach(player => {
            const playerEl = document.createElement('div');
            playerEl.className = `lobby-player ${player.isHost ? 'host' : ''}`;
            
            const avatarEl = document.createElement('div');
            avatarEl.className = 'lobby-player-avatar';
            avatarEl.style.backgroundColor = player.color;
            
            playerEl.appendChild(avatarEl);
            this.lobbyPlayersList.appendChild(playerEl);
        });

        // Show start button only for host
        if (this.currentPlayer.isHost) {
            this.startGameBtn.classList.remove('hidden');
        } else {
            this.startGameBtn.classList.add('hidden');
        }
    }

    updateGameUI() {
        if (!this.currentRoom || !this.currentPlayer) return;
        
        this.playersListEl.innerHTML = '';

        if (this.currentRoom.sharedHearts !== undefined) {
            const sharedHeartsEl = document.createElement('div');
            sharedHeartsEl.className = 'shared-hearts';
            sharedHeartsEl.innerHTML = `${'❤️'.repeat(this.currentRoom.sharedHearts)}${'💔'.repeat(Math.max(0, 6 - this.currentRoom.sharedHearts))}`;
            sharedHeartsEl.style.marginBottom = '10px';
            sharedHeartsEl.style.textAlign = 'center';
            this.playersListEl.appendChild(sharedHeartsEl);
        }

        if (this.currentRoom.gameState === 'playing' || this.currentRoom.gameState === 'finished') {
            this.exitGameBtn.style.display = 'block';
        } else {
            this.exitGameBtn.style.display = 'none';
        }
    }

    initializeGame() {
        if (this.game) {
            // Clean up any animation timers before destroying the game
            const scene = this.game.scene.scenes[0];
            if (scene && scene.playerAvatars) {
                scene.playerAvatars.forEach(avatarData => {
                    if (avatarData.animationTimer) {
                        clearInterval(avatarData.animationTimer);
                    }
                });
            }
            
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
        
        // Always show the canvas when game starts
        document.getElementById('gameCanvas').classList.remove('hidden');
    }

    preload() {
        const scene = this.game.scene.scenes[0];
        
        scene.load.image('background', 'assets/background.jpg');
        
        scene.load.image('avatar_red_1', 'assets/avatars/red1.png');
        scene.load.image('avatar_red_2', 'assets/avatars/red2.png');
        scene.load.image('avatar_teal_1', 'assets/avatars/teal1.png');
        scene.load.image('avatar_teal_2', 'assets/avatars/teal2.png');
        scene.load.image('avatar_blue_1', 'assets/avatars/blue1.png');
        scene.load.image('avatar_blue_2', 'assets/avatars/blue2.png');
        scene.load.image('avatar_green_1', 'assets/avatars/green1.png');
        scene.load.image('avatar_green_2', 'assets/avatars/green2.png');
        
        scene.load.image('symbol_star', 'assets/symbols/star.svg');
        scene.load.image('symbol_asterisk', 'assets/symbols/asterisk.svg');
        scene.load.image('symbol_x', 'assets/symbols/x.svg');
        scene.load.image('symbol_line', 'assets/symbols/line.svg');
        scene.load.image('symbol_arrowhead', 'assets/symbols/arrowhead.svg');
        
        scene.load.image('tentacle1', 'assets/tentacle1.png');
        scene.load.image('tentacle2', 'assets/tentacle2.png');
        
        scene.load.on('loaderror', (file) => {
            console.warn('Failed to load asset:', file.key);
        });
    }

    create() {
        const scene = this.game.scene.scenes[0];
        
        let background;
        try {
            background = scene.add.image(window.innerWidth / 2, window.innerHeight / 2, 'background');
            background.setDisplaySize(window.innerWidth, window.innerHeight);
        } catch (e) {
            background = scene.add.rectangle(window.innerWidth / 2, window.innerHeight / 2, window.innerWidth, window.innerHeight, 0x2c3e50);
        }
        
        // Create graphics object for drawing (on top of background)
        this.drawingGraphics = scene.add.graphics();
        
        // Create graphics for other players' drawings
        scene.otherPlayersGraphics = scene.add.graphics();
        
        // Create player avatars
        scene.playerAvatars = new Map();
        this.createPlayerAvatars(scene);
        
        // Create symbols (tentacles)
        scene.symbols = new Map();
        scene.tentacles = new Map(); // Separate map for tentacle sprites
        this.createSymbols(scene);
        
        // Create hearts display
        scene.sharedHeartsDisplay = null;

        // Store player drawing positions for showing above avatars
        scene.playerDrawings = new Map();
        
        // Add methods
        scene.removeSymbol = (symbolId) => {
            const symbolObj = scene.symbols.get(symbolId);
            if (symbolObj) {
                symbolObj.destroy();
                scene.symbols.delete(symbolId);
            }
            const tentacleData = scene.tentacles.get(symbolId);
            if (tentacleData) {
                if (tentacleData.animationTimer) {
                    clearInterval(tentacleData.animationTimer);
                }
                if (tentacleData.sprite) {
                    tentacleData.sprite.destroy();
                }
                scene.tentacles.delete(symbolId);
            }
        };
        
        scene.updateTentacles = () => {
            this.updateTentacles(scene);
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
            if (avatarData.animationTimer) clearInterval(avatarData.animationTimer);
        });
        scene.playerAvatars.clear();

        this.currentRoom.players.forEach(player => {
            let avatar;
              const avatarKey1 = `avatar_${player.avatar}_1`;
              avatar = scene.add.image(player.x, player.y, avatarKey1);
              avatar.setScale(0.1);
              
              let currentFrame = 1;
              const animationTimer = setInterval(() => {
                  currentFrame = currentFrame === 1 ? 2 : 1;
                  const newKey = `avatar_${player.avatar}_${currentFrame}`;
                  try {
                      avatar.setTexture(newKey);
                  } catch (e) {
                      console.warn('Could not set texture:', newKey);
                  }
              }, 1000); // Switch every 1 second
              
              scene.playerAvatars.set(player.id, {
                  avatar: avatar,
                  player: player,
                  animationTimer: animationTimer
              });
        });
    }

    updatePlayerAvatars(scene) {
        this.createPlayerAvatars(scene);
    }

    clearAllTentaclesAndSymbols(scene) {
        // Clear all existing tentacles and their animation timers
        if (scene.tentacles) {
            scene.tentacles.forEach(tentacleData => {
                if (tentacleData.animationTimer) {
                    clearInterval(tentacleData.animationTimer);
                }
                if (tentacleData.sprite) {
                    tentacleData.sprite.destroy();
                }
            });
            scene.tentacles.clear();
        }

        // Clear all existing symbols
        if (scene.symbols) {
            scene.symbols.forEach(symbolSprite => {
                symbolSprite.destroy();
            });
            scene.symbols.clear();
        }
    }

    createSymbols(scene) {
        if (!this.currentRoom || !this.currentRoom.targetSymbols) return;

        this.currentRoom.targetSymbols.forEach(symbol => {
            if (!symbol.completed) {
                let tentacleSprite;
                const tentacleY = window.innerHeight - 150;
                tentacleSprite = scene.add.image(symbol.x, tentacleY, 'tentacle1');
                
                const randomScale = 0.6 * (0.25 + Math.random() * 0.05); // 0.15 to 0.18
                tentacleSprite.setScale(randomScale);
                
                // Tint tentacle based on target player's color
                if (symbol.targetPlayerId) {
                    const targetPlayer = this.currentRoom.players.find(p => p.id === symbol.targetPlayerId);
                    if (targetPlayer) {
                        // Apply a subtle tint using the player's color
                        const playerColor = Phaser.Display.Color.HexStringToColor(targetPlayer.color);
                        const tintColor = Phaser.Display.Color.Interpolate.ColorWithColor(
                            { r: 255, g: 255, b: 255 }, // White base
                            { r: playerColor.r, g: playerColor.g, b: playerColor.b }, // Player color
                            100, // Total steps
                            30 // 30% tint intensity
                        );
                        const finalTint = Phaser.Display.Color.GetColor32(tintColor.r, tintColor.g, tintColor.b, 255);
                        tentacleSprite.setTint(finalTint);
                    }
                }
                                
                // Create animation timer to alternate between tentacle frames
                let currentFrame = 1;
                const animationTimer = setInterval(() => {
                    currentFrame = currentFrame === 1 ? 2 : 1;
                    const newKey = `tentacle${currentFrame}`;
                    try {
                        tentacleSprite.setTexture(newKey);
                    } catch (e) {
                        console.warn('Could not set tentacle texture:', newKey);
                    }
                }, 1000); // Switch every 1 second
                
                // Store tentacle with its animation timer
                scene.tentacles.set(symbol.id, {
                    sprite: tentacleSprite,
                    animationTimer: animationTimer
                });
                
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
                const tentacleData = scene.tentacles.get(symbol.id);
                const symbolSprite = scene.symbols.get(symbol.id);
                
                if (tentacleData && tentacleData.sprite) {
                    // Keep tentacles at ocean level (bottom of screen)
                    const tentacleY = window.innerHeight - 150;
                    tentacleData.sprite.setPosition(symbol.x, tentacleY);
                }
                if (symbolSprite) {
                    // Keep symbols at the same Y as tentacles (ocean level)
                    const symbolY = window.innerHeight - 150;
                    symbolSprite.setPosition(symbol.x, symbolY);
                }
            } else {
                // Remove completed tentacles and symbols (collision despawn)
                const tentacleData = scene.tentacles.get(symbol.id);
                const symbolSprite = scene.symbols.get(symbol.id);
                
                if (tentacleData) {
                    if (tentacleData.animationTimer) {
                        clearInterval(tentacleData.animationTimer);
                    }
                    if (tentacleData.sprite) {
                        tentacleData.sprite.destroy();
                    }
                    scene.tentacles.delete(symbol.id);
                }
                if (symbolSprite) {
                    symbolSprite.destroy();
                    scene.symbols.delete(symbol.id);
                }
            }
        });
    }

    createSymbolSprite(scene, symbol) {
        const symbolAssetMap = {
            'five-point star': 'symbol_star',
            'asterisk': 'symbol_asterisk',
            'arrowhead': 'symbol_arrowhead',
            'X': 'symbol_x',
            'line': 'symbol_line'
        };
        
        const assetKey = symbolAssetMap[symbol.type] || 'symbol_star';
        let symbolSprite;
        
        const symbolY = window.innerHeight - 150;
        symbolSprite = scene.add.image(symbol.x, symbolY, assetKey);
        symbolSprite.setScale(1); 
        
        const color = Phaser.Display.Color.HexStringToColor(symbol.color).color;
        symbolSprite.setTint(color);
        
        return symbolSprite;
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

        // Clear all drawing data
        this.clearDrawing();
    }
    
    clearDrawing() {        
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

    playWinAnimation() {
        const scene = this.game.scene.scenes[0];
        if (!scene || !scene.playerAvatars) return;

        scene.playerAvatars.forEach((avatarData) => {
            const avatar = avatarData.avatar;
            if (!avatar) return;

            const originalY = avatar.y;
            
            scene.tweens.add({
                targets: avatar,
                y: originalY - 100, 
                duration: 500,
                ease: 'Power2',
                yoyo: true, 
                repeat: 2, 
                onComplete: () => {
                    avatar.y = originalY;
                }
            });
        });
    }

    playLoseAnimation() {
        const scene = this.game.scene.scenes[0];
        if (!scene || !scene.playerAvatars) return;
        
        scene.playerAvatars.forEach((avatarData) => {
            const avatar = avatarData.avatar;
            if (!avatar) return;

            const originalRotation = avatar.rotation;
            
            scene.tweens.add({
                targets: avatar,
                rotation: originalRotation - 0.3,
                duration: 100,
                ease: 'Power2',
                yoyo: true,
                repeat: 15, 
                onComplete: () => {
                    avatar.rotation = originalRotation;
                }
            });
        });
    }

}

// Initialize the game when the page loads
window.addEventListener('load', () => {
    console.log('Page loaded, creating game instance'); // Debug log
    const gameInstance = new MultiplayerShapeGame();
    
    const gameScreen = document.getElementById('gameScreen');
    const gameCanvas = document.getElementById('gameCanvas');
    const body = document.body;

    const observer = new MutationObserver(() => {
        if (!gameCanvas.classList.contains('hidden') && !gameScreen.classList.contains('hidden')) {
            body.classList.add('game-active');
        } else {
            body.classList.remove('game-active');
        }
    });
    observer.observe(gameCanvas, { attributes: true, attributeFilter: ['class'] });
    observer.observe(gameScreen, { attributes: true, attributeFilter: ['class'] });
});
