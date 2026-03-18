# 🐝 BuzzU Landing

A high-fidelity, premium landing page built with **React**, **Vite**, and **Framer Motion**. Featuring a cinematic side-split video background, glassmorphic UI elements, and a dynamic design system.

## ✨ Key Features

- **Cinematic Experience**: Side-split video background with real-time CSS filters.
- **Glassmorphism**: Premium frosted-glass UI components with smooth transitions.
- **Dynamic Themes**: Integrated theme context for seamless visual transitions.
- **Micro-animations**: Powered by Framer Motion for a "Hyper-Premium" feel.
- **Mobile Optimized**: Responsive design ensuring visual clarity across all devices.

## 🚀 Getting Started

### Prerequisites

- **Node.js** (v18 or higher recommended)
- **npm** (comes with Node.js)

### Installation

1. **Clone the repository**:
   ```bash
   git clone https://github.com/buzzu-p2p/buzzu-landing.git
   cd buzzu-landing
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Environment Setup**:
   Create a `.env.local` file and configure:
   ```env
   VITE_GOOGLE_CLIENT_ID=your_google_web_client_id.apps.googleusercontent.com
   GEMINI_API_KEY=your_api_key_here
   ```
   You can copy from `.env.example` and update values.

4. **Run the development server**:
   ```bash
   npm run dev
   ```

## 🛠️ Tech Stack

- **Framework**: [React 19](https://react.dev/)
- **Bundler**: [Vite](https://vitejs.dev/)
- **Animations**: [Framer Motion](https://www.framer.com/motion/)
- **Styling**: Vanilla CSS (Custom tokens & variables)
- **Icons**: Custom SVG icons & components

## 📂 Project Structure

- `components/`: Modular UI components (SocialLanding, Dashboard, etc.)
- `styles.css`: Core design system and global styles.
- `public/`: Assets and media.
- `extract_songs.cjs`: Custom script for audio/video asset management.

---

Built for **BuzzU P2P** 🐝
