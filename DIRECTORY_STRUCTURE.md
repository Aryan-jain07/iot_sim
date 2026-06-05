# IoT Simulator Directory Structure

```text
iot_sim/
├── public/                     - Publicly accessible static assets
│   ├── favicon.svg             - The website's favicon
│   └── icons.svg               - SVGs and icons used across the app
├── src/                        - Main source code folder
│   ├── assets/                 - Application assets (images, icons)
│   │   ├── hero.png            - Main hero image used in the UI
│   │   ├── react.svg           - Default React logo
│   │   └── vite.svg            - Default Vite logo
│   ├── App.css                 - Styles specific to the App component
│   ├── App.tsx                 - Main application component containing the UI, dashboards, and state management
│   ├── index.css               - Global CSS styles including Tailwind configurations and theming
│   ├── main.tsx                - Entry point for the React application
│   ├── simulation.ts           - Core simulation logic, graph generation, and coloring algorithms (Greedy, Tabu, SA)
│   └── types.ts                - TypeScript interfaces and type definitions used throughout the app
├── .gitignore                  - Specifies intentionally untracked files to ignore in version control
├── .npmrc                      - NPM configuration file
├── README.md                   - Project documentation and setup instructions
├── eslint.config.js            - Configuration for ESLint linting rules
├── index.html                  - Main HTML template for the Vite application
├── package-lock.json           - Locked dependency tree to ensure consistent installs
├── package.json                - Project metadata, scripts, and dependency definitions
├── tsconfig.app.json           - TypeScript configuration specifically for application code
├── tsconfig.json               - Main TypeScript configuration tying together sub-configs
├── tsconfig.node.json          - TypeScript configuration for Vite and Node environment files
└── vite.config.ts              - Configuration for the Vite bundler
```
