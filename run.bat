@echo off
echo ============================================================
echo   EchoVision - AI Reading Assistant for Blind Learners
echo   React.js + FastAPI + Google Gemini
echo ============================================================
echo.

IF NOT EXIST "venv\Scripts\activate.bat" (
    echo [1] Creating Python virtual environment...
    python -m venv venv
)

call venv\Scripts\activate.bat

echo [2] Installing Python packages...
pip install -q -r requirements.txt

IF NOT EXIST ".env" (
    copy .env.example .env
    echo  [ACTION REQUIRED] Open .env and set your GEMINI_API_KEY !
    echo  Location: %CD%\.env
    pause
)

echo [3] Installing React packages (first run only)...
cmd /c "cd frontend && npm install"

echo.
echo [4] Starting FastAPI backend  http://localhost:8080 ...
start "EchoVision Backend" cmd /k "call venv\Scripts\activate && python -m uvicorn api:app --host 0.0.0.0 --port 8080 --reload"

timeout /t 3 /nobreak >nul

echo [5] Starting React frontend  http://localhost:5173 ...
start "EchoVision Frontend" cmd /k "cd frontend && npm run dev"

echo.
echo ============================================================
echo   EchoVision is live!
echo   Open: http://localhost:5173
echo   Backend API docs: http://localhost:8000/docs
echo ============================================================
echo.
pause
