# AI Smart Board

An intelligent digital whiteboard application that leverages the power of local AI to analyze and understand content drawn, written, or placed on the canvas. With specialized modules for Mathematics and Text, the AI Smart Board can solve equations, read handwriting, and provide detailed explanations directly within your workspace.

## 🚀 Features

- **Interactive Canvas**: A feature-rich digital whiteboard for drawing, writing, and organizing ideas.
- **AI-Powered Analysis**: Select any content on the board and let the AI analyze it locally.
- **Specialized AI Modules**:
  - **Math**: Automatically detects, solves, and renders mathematical equations using Pix2Text.
  - **Text**: Reads and converts handwriting to text using Tesseract OCR.
- **PDF & Export Support**: Import PDFs to annotate directly on the board, or export your entire canvas as a PDF using `jspdf`.
- **History & Selection**: Full undo/redo capabilities (`history`), advanced selection tools (`selection`), and clipboard support.
- **Local Storage**: Automatically saves your board state locally so you never lose your work.

## 🛠️ Tech Stack

### Frontend
- **Framework**: Vite + TypeScript
- **Canvas Rendering**: Native HTML5 Canvas API
- **Mathematics Rendering**: KaTeX
- **PDF Operations**: `pdfjs-dist` (Import), `jspdf` (Export)

### Backend
- **Framework**: FastAPI (Python)
- **AI Integration**: Pix2Text and Tesseract OCR
- **Database**: SQLAlchemy (Async) with SQLite / PostgreSQL
- **Architecture**: Modular routing system for handling different AI analysis types (Math, Text)

## 📁 Project Structure

```
.
├── backend/                  # FastAPI backend
│   ├── main.py               # Application entry point
│   ├── models.py             # SQLAlchemy database models
│   ├── schemas.py            # Pydantic validation schemas
│   ├── database.py           # Database connection and session
│   ├── requirements.txt      # Python dependencies
│   └── services/             # Core business logic and AI routing
│       └── modules/          # Specialized AI modules (math, text)
├── src/                      # Frontend source code
│   ├── ai/                   # AI integration on frontend
│   ├── canvas/               # Core whiteboard canvas logic
│   ├── tools/                # Drawing and selection tools
│   ├── equations/            # KaTeX rendering components
│   ├── pdf/                  # PDF import handling
│   ├── export/               # PDF export handling
│   ├── history/              # Undo/Redo state management
│   ├── storage/              # LocalStorage handling
│   ├── selection/            # Bounding box and selection logic
│   ├── style.css             # Vanilla CSS styling
│   └── main.ts               # Frontend entry point
├── package.json              # NPM dependencies
└── tsconfig.json             # TypeScript configuration
```

## ⚙️ Setup & Installation

### Prerequisites
- Node.js (v18+ recommended)
- Python 3.9+
- Local AI Tools (Pix2Text, Tesseract)

### Backend Setup

1. Navigate to the backend directory:
   ```bash
   cd backend
   ```
2. Create and activate a virtual environment:
   ```bash
   python -m venv venv
   # On Windows:
   venv\Scripts\activate
   # On macOS/Linux:
   source venv/bin/activate
   ```
3. Install the required Python packages:
   ```bash
   pip install -r requirements.txt
   ```
   # DATABASE_URL=postgresql+psycopg2://... (Optional, defaults to SQLite)
5. Start the FastAPI development server:
   ```bash
   uvicorn main:app --reload
   ```
   The backend will be available at `http://localhost:8000`. You can view the API documentation at `http://localhost:8000/docs`.

### Frontend Setup

1. From the project root directory, install dependencies:
   ```bash
   npm install
   ```
2. Start the Vite development server:
   ```bash
   npm run dev
   ```
3. Open your browser and navigate to the URL provided in the terminal (usually `http://localhost:5173`).

## 🤝 Contributing
Feel free to open issues or submit pull requests for any bugs or feature requests!
