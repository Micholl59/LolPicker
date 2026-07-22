@echo off
rem Lanceur double-clic : demarre le serveur + l'interface et ouvre le navigateur
cd /d "%~dp0"
set "PATH=C:\Program Files\nodejs;%PATH%"
start "" /b cmd /c "timeout /t 6 /nobreak >nul & start http://localhost:5173"
echo LolPicker demarre... (laisse cette fenetre ouverte, ferme-la pour arreter)
npm run dev
