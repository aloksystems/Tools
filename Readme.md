# Developer Tools Portfolio

A modern, responsive portfolio website showcasing a collection of developer tools, utilities, and applications built with cutting-edge web technologies. This portfolio serves as a centralized hub for browsing, searching, and accessing various projects organized by categories.

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Project Categories](#project-categories)
- [Technologies Used](#technologies-used)
- [Getting Started](#getting-started)
- [Project Structure](#project-structure)
- [Customization](#customization)
- [Deployment](#deployment)
- [Contributing](#contributing)
- [License](#license)
- [Contact](#contact)

## Overview

This portfolio website showcases over 40+ projects across 7 different categories including Developer Tools, Productivity Utilities, Media Processing Tools, AI & Chatbots, Finance Applications, and All-In-One Solutions. The site features a modern dark/light theme toggle, responsive design, and intuitive filtering system with enhanced visual aesthetics.

## Features

- **Modern UI Design**: Sleek, contemporary interface with improved visual hierarchy
- **Enhanced Animations**: Smooth transitions, hover effects, and scroll animations
- **Responsive Design**: Works seamlessly across desktop, tablet, and mobile devices
- **Theme Switching**: Toggle between light and dark modes with preference saving
- **Project Filtering**: Sort projects by category with 7 distinct filters
- **Search Functionality**: Real-time search across project titles, descriptions, and tags
- **Project Showcase**: Detailed project cards with GitHub links and live demos
- **Modal Details**: Interactive modals with expanded project information
- **Pinned Projects**: Highlighted featured projects for easy access
- **Keyboard Shortcuts**: Efficient navigation using keyboard commands
- **Statistics Display**: Project counts and user metrics

## Project Categories

2. **Productivity & Utilities** - Calculators, generators, and everyday tools
3. **Media Tools** - Image and video processing applications
4. **AI & Chatbots** - Artificial intelligence and conversational interfaces
5. **Finance & Business** - Financial management and business solutions
6. **All-In-One Projects** - Comprehensive suites combining multiple tools

## Technologies Used

- **Frontend**: HTML5, CSS3, JavaScript (ES6+)
- **Styling**: Custom CSS with Flexbox and Grid layouts
- **Icons**: Font Awesome 6.0
- **Fonts**: Google Fonts (Inter)
- **Animations**: CSS transitions and JavaScript-powered animations
- **Responsive Design**: Mobile-first approach with media queries

## Getting Started

### Prerequisites

To run this portfolio locally, you only need a modern web browser. No additional installations are required.

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/aloksingh2005/portfolio.git
   ```

2. Navigate to the project directory:
   ```bash
   cd portfolio
   ```

3. Open `index.html` in your preferred web browser

Alternatively, you can simply double-click the `index.html` file to open it in your default browser.

## Project Structure

```
portfolio/
│
├── index.html              # Main HTML file
├── styles.css              # Custom styling with modern design
├── script.js               # JavaScript functionality
├── projects-data.js        # Project information data
├── img/                    # Image assets
│   ├── img1.png           # Background image for hero section
│   └── img2.png           # Additional image asset
└── README.md              # This file
```

## Customization

### Adding New Projects

To add new projects to the portfolio:

1. Open `projects-data.js`
2. Add a new project object to the `projectsData` array:
   ```javascript
   {
       name: "Project Name",
       category: "Category Name",
       description: "Brief project description",
       tags: ["Tag1", "Tag2", "Tag3"],
       repo: "https://github.com/username/repository",
       demo: "https://demo-url.com",
       pinned: true/false,           // Optional: pin to featured section
       featured: true/false,         // Optional: highlight as featured
       stars: 45,                    // Optional: GitHub star count
       language: "Primary Language"  // Optional: main tech used
   }
   ```

### Modifying Styles

All styling is contained in `styles.css`. Key areas you might want to customize:

- Color scheme (in `:root` variables)
- Typography and fonts
- Card layouts and animations
- Responsive breakpoints

### Updating Content

Modify content directly in:
- `index.html` - For structural changes
- `projects-data.js` - For project information
- `script.js` - For interactive functionality

## Deployment

This is a static website that can be deployed to any web hosting service:

### GitHub Pages
1. Push your code to a GitHub repository
2. Go to Repository Settings
3. Scroll to "GitHub Pages" section
4. Select source branch and folder
5. Click "Save"

### Other Hosting Options
- Netlify
- Vercel
- Firebase Hosting
- AWS S3
- Any static web hosting service

## Contributing

Contributions are welcome! Here's how you can contribute:

1. Fork the repository
2. Create a new branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Commit your changes (`git commit -m 'Add some amazing feature'`)
5. Push to the branch (`git push origin feature/amazing-feature`)
6. Open a Pull Request

Please ensure your code follows the existing style and includes appropriate comments.

## License

This project is open source and available under the [MIT License](LICENSE).

## Contact

**Alok Kumar** - Developer & Software Engineer

- GitHub: [@aloksingh2005](https://github.com/aloksingh2005)
- Email: helloalokmail@gmail.com
- LinkedIn: [@alok-kumar-a3201a432](https://www.linkedin.com/in/alok-kumar-a3201a432/)
- Twitter: [@kumar_alok39268](https://x.com/kumar_alok39268)

---

*Built with ❤️ by Alok Kumar | Web Developer & Software Engineer*