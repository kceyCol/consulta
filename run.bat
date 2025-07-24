@echo off
echo Instalando dependencias...
pip install -r requirements.txt
echo.
echo Iniciando o servidor...
python app.py
pause