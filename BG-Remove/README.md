# BG-Remove (Background Remover)

> **⚡ Remove image backgrounds in seconds using AI—completely locally on your computer. No internet required after initial setup. No images uploaded anywhere.**

---

## � **GitHub Repository – START HERE!**

### **📥 DOWNLOAD & SETUP:**

| **OPTION 1: Download ZIP** | **OPTION 2: View on GitHub** |
|---|---|
| **👉 [CLICK HERE TO DOWNLOAD](https://github.com/aloksystems/BG-Remove/archive/refs/heads/main.zip)** | **👉 [VISIT REPOSITORY](https://github.com/aloksystems/BG-Remove)** |
| Extract ZIP and follow setup guide below | See code, contribute, track updates |

**Repository Link:** `https://github.com/aloksystems/BG-Remove`

---

A modern, user-friendly desktop application to remove image backgrounds instantly. Built with **Python**, **CustomTkinter** for a sleek dark UI, **Pillow** for image handling, and **rembg** (powered by U²-Net) for AI-driven background removal.

**Perfect for:**
- Content creators, designers, e-commerce sellers
- Anyone needing quick background removal without online tools
- Privacy-conscious users (all processing stays on your machine)

---

## ✨ Features
- 🎨 **Clean Dark UI** – Modern, responsive interface using CustomTkinter
- 🖼️ **Live Preview** – See before/after side-by-side in real-time
- ⚡ **One-Click Removal** – Fast background removal with progress feedback
- 💾 **Easy Export** – Save transparent PNG with one click
- 🔄 **Multi-threaded** – UI stays responsive while processing large images
- 🏗️ **Standalone Build** – Create a Windows `.exe` and share with anyone (no Python needed!)
- 🌐 **Dual Mode** – Choose between local AI (rembg, offline) or online API (remove.bg, faster for large images)
- 🔑 **API Key Support** – Bring your own remove.bg API key; persists across sessions
- 🔒 **100% Private** – All processing happens locally when using local mode; nothing is uploaded

---

## 📋 Project Structure
```
BG-Remove/
├── app.py                 # Main GUI application (launch this!)
├── remove.py              # Standalone script example (optional)
├── app.spec               # PyInstaller config for .exe build
├── requirements.txt       # Python dependencies
└── README.md              # This file
```

---

## 🔧 Prerequisites

### **For Running the App (Both Paths)**
- **Windows 10/11** (project tested on Windows)
- **Python 3.10–3.12** installed on your computer
- **Internet connection** (only needed first time for downloading AI model)

> **🤔 Don't have Python? See "PATH A: Complete Beginner Setup" below.**

### **For Building a Windows .exe (Optional)**
- All of the above, plus `pyinstaller` (we'll install it)

---

## 🚀 Quick Start (3 Steps)

### **If you already know Python & virtual environments:**

```powershell
# 1. Clone or download this folder, then navigate to it
cd path/to/BG-Remove

# 2. Create virtual environment & install
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt

# 3. Run
python app.py
```

**Done!** The app opens with a GUI. Click "Select Image" and start removing backgrounds.

---

## ⚡ Quick Setup

### PATH A: Beginner (6 steps)

1. **Install Python 3.11+** → [python.org](https://www.python.org/downloads/) (check "Add to PATH")
2. **Download** → [CLICK HERE](https://github.com/aloksystems/BG-Remove/archive/refs/heads/main.zip)
3. **Extract ZIP** → Open folder > Shift+Right Click > "Open PowerShell here"
4. **Create venv** → `python -m venv .venv`
5. **Activate** → `.\.venv\Scripts\Activate.ps1`
   - Got error? Run: `Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser`
6. **Install & Run** →
   ```powershell
   pip install -r requirements.txt
   python app.py
   ```

✅ Done! App window opens.

---

### PATH B: Developer (1 line)

```powershell
python -m venv .venv; .\.venv\Scripts\Activate.ps1; pip install -r requirements.txt; python app.py
```

---

### Build .exe (Optional)

```powershell
pip install pyinstaller
pyinstaller app.spec
# Find .exe at: dist/app/app.exe
```

---

## 📱 Using the App

1. **Click "Select Image"** → Choose `.png`, `.jpg`, `.bmp`, or `.gif`
2. **Select Mode** → Choose **"Local (rembg - offline)"** for offline AI processing, or **"API (remove.bg)"** for faster cloud-based removal
3. **Enter API Key** (only in API mode) → Paste your remove.bg API key (get one free at [remove.bg/api](https://www.remove.bg/api))
4. **Click "Remove Background"** → Wait 5-30 seconds (depends on image size and mode)
5. **Click "Save Image"** → Save transparent PNG

💡 **Tip:** Start with small images (512×512)  
💡 **Tip:** API mode is faster for large images but requires an internet connection and a remove.bg API key

---

## 🐍 Using in Your Code

```python
from rembg import remove
from PIL import Image

img = Image.open("photo.jpg")
result = remove(img)
result.save("transparent.png")
```

---

## ⚠️ Quick Fixes

| Issue | Solution |
|-------|----------|
| `python not recognized` | Reinstall Python, check "Add to PATH" |
| PowerShell won't activate | `Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser` |
| `ModuleNotFoundError` | Make sure venv is activated, then `pip install -r requirements.txt` |
| `DLL load failed` | `pip install onnxruntime==1.18.0` |
| App won't open | Run `python app.py` in terminal, check error message |
| Processing too slow | Resize image to 800×600px or smaller |
| Building .exe fails | `pip install pyinstaller`, then `pyinstaller app.spec` |

---

## 📊 Project Info

| File | Purpose |
|------|---------|
| `app.py` | Main GUI application |
| `app.spec` | PyInstaller config for .exe |
| `requirements.txt` | Python dependencies |

**Dependencies:** rembg, customtkinter, pillow, onnxruntime, numba, requests

---

## 🔒 Privacy

✅ All processing happens locally. No images are uploaded.

---

## 📝 License

MIT License. See LICENSE file for details.

---

**Made with ❤️ for creators and designers.**
