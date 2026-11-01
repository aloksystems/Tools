# AI Chat App

A modern web application for chatting with various AI models using the OpenRouter.ai API. The app allows users to select from multiple AI models and maintains chat history for each model.

## Features

- **Multiple AI Models**: Choose from a variety of AI models including Claude, GPT-4o, Gemini Pro, and more
- **Chat History**: Persistent conversation history for each AI model
- **Clean UI**: Modern and responsive user interface
- **Dark Mode**: Toggle between light and dark themes
- **Mobile Responsive**: Works well on all device sizes

## Setup and Usage

1. **Clone the repository**
   ```
   git clone <repository-url>
   cd ai-chat-app
   ```

2. **Open the application**
   - Open `app/index.html` in your browser
   - Alternatively, use a local server for better performance:
     ```
     cd app
     python -m http.server
     ```
     Then visit `http://localhost:8000` in your browser

3. **Enter your OpenRouter API Key**
   - You'll be prompted to enter your OpenRouter API key on first use
   - Get a key from [OpenRouter.ai](https://openrouter.ai) if you don't have one
   - The API key is stored in your browser's localStorage for convenience

4. **Using the App**
   - Select an AI model from the home screen
   - Type your message and press Enter or click the send button
   - View your conversation history in the sidebar menu
   - Toggle dark mode in the settings section

## Project Structure

```
app/
├── index.html         # Main HTML file
├── css/
│   └── style.css      # Styling for the application
├── js/
│   ├── app.js         # Main application logic
│   ├── models.js      # AI model definitions and selection
│   └── engine.js      # Chat functionality and API integration
└── assets/            # Icons and images (if needed)
```

## Customization

- **Adding New Models**: Edit the `availableModels` array in `js/models.js`
- **Styling**: Modify the CSS variables in `css/style.css` to change colors and appearance
- **Features**: Extend functionality by editing the JavaScript files

## Technical Details

- Built with vanilla JavaScript, HTML, and CSS
- Uses the OpenRouter.ai API for AI model access
- Stores conversations in browser localStorage
- No framework dependencies

## Credits

- [OpenRouter.ai](https://openrouter.ai) for providing API access to various AI models
- [Font Awesome](https://fontawesome.com) for icons 