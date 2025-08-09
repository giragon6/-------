# Multiplayer Drawing Game

A real-time multiplayer drawing game built with Phaser.js and Socket.io where players can draw together on a shared canvas.

## Features

- **Real-time Collaboration**: Multiple players can draw simultaneously on the same canvas
- **Color Selection**: Choose from 8 different colors for drawing
- **Adjustable Brush Size**: Customize brush size from 2 to 30 pixels
- **Player Cursors**: See other players' cursor positions in real-time
- **Clear Canvas**: Clear the entire canvas for everyone
- **Player List**: See all currently connected players
- **Responsive Design**: Works on desktop and mobile devices

## Technologies Used

- **Frontend**: Phaser.js 3.70.0, Socket.io Client, HTML5, CSS3
- **Backend**: Node.js, Express.js, Socket.io
- **Real-time Communication**: WebSocket connections via Socket.io

## Installation

1. Install Node.js dependencies:
```bash
npm install
```

2. Start the server:
```bash
npm start
```

3. Open your browser and navigate to `http://localhost:3000`

## Development

For development with auto-restart:
```bash
npm run dev
```

## How to Play

1. Open the game in your browser
2. Share the URL with friends to play together
3. Select your preferred color from the color palette
4. Adjust the brush size using the slider
5. Click and drag on the canvas to draw
6. See other players' drawings appear in real-time
7. Use the "Clear Canvas" button to start fresh

## Game Architecture

### Server (`server.js`)
- Manages WebSocket connections
- Stores and broadcasts drawing data
- Handles player connections/disconnections
- Manages canvas clearing events

### Client (`public/game.js`)
- Phaser.js scene for rendering and input handling
- Socket.io client for real-time communication
- Drawing mechanics with smooth line rendering
- Player cursor visualization

### UI (`public/index.html`)
- Responsive design with modern styling
- Color palette and brush size controls
- Player information panel
- Clear canvas functionality

## Customization

You can easily customize:
- **Colors**: Modify the color palette in both HTML and server.js
- **Canvas Size**: Adjust the Phaser game config dimensions
- **Brush Sizes**: Change the min/max values in the HTML range input
- **Styling**: Update the CSS for different themes

## Browser Compatibility

Works in all modern browsers that support:
- WebSocket/Socket.io
- HTML5 Canvas
- ES6+ JavaScript features

## License

MIT License - Feel free to use this project for learning or commercial purposes.
