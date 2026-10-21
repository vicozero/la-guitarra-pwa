@echo off
chcp 65001 >nul
setlocal

rem ===================================================================
rem  Puente La Guitarra PWA -> programa de mantenimiento del taller
rem  Deja esta ventana abierta mientras el taller trabaja.
rem ===================================================================

rem --- Carpeta de intercambio: debe ser la MISMA que se vincula en la PWA ---
set "CARPETA=%~dp0ordenes"

rem --- Base de datos del programa. Si esta ruta no existe en tu PC,
rem     buscala y cambiala aqui, o pasala con --db. ---
set "DB=%ProgramData%\MGA Mantenimiento\mga_mantenimiento.db"

set "AQUI=%~dp0puente_mantenimiento.py"

echo ==============================================================
echo   PUENTE LA GUITARRA  ->  MANTENIMIENTO
echo ==============================================================
echo.

where python >nul 2>nul
if errorlevel 1 (
  echo ERROR: no se encontro Python en esta PC.
  echo.
  echo Instala Python 3 desde https://www.python.org/downloads/
  echo y marca la casilla "Add Python to PATH" durante la instalacion.
  echo.
  pause
  exit /b 1
)

if not exist "%AQUI%" (
  echo ERROR: no se encontro puente_mantenimiento.py junto a este .bat
  echo Buscado en: %AQUI%
  echo.
  echo Copia el archivo en la misma carpeta que iniciar-puente.bat
  echo.
  pause
  exit /b 1
)

if not exist "%CARPETA%" (
  echo Creando carpeta de intercambio: %CARPETA%
  mkdir "%CARPETA%" 2>nul
)

echo Carpeta de intercambio : %CARPETA%
echo Base de datos          : %DB%
if not exist "%DB%" (
  echo.
  echo ATENCION: esa base de datos NO existe en esta PC.
  echo Las ordenes quedaran solo en el archivo de alerta.
  echo Revisa la ruta dentro de este .bat o pasa --db manualmente.
)
echo.
echo Vigilando... deja esta ventana abierta. Ctrl+C para salir.
echo.

python "%AQUI%" --carpeta "%CARPETA%" --db "%DB%"

echo.
echo El puente se detuvo.
pause
