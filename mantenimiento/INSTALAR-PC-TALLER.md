# Instalar el puente en la PC del taller

Esta guía es para la **PC donde trabaja el taller**, la que tiene el programa de
mantenimiento y la base de datos.

**No hay que tocar el programa de mantenimiento.** El puente escribe las órdenes
directo en su base de datos, así que el operador las ve al abrir o refrescar la
lista de órdenes de trabajo, igual que cualquier otra que se capture a mano.

---

## Qué necesitas en esa PC

| Requisito | Cómo comprobarlo |
|---|---|
| Python 3.8 o superior | Abre una terminal y escribe `python --version` |
| La base de datos del programa | Debe existir `C:\ProgramData\MGA Mantenimiento\mga_mantenimiento.db` |
| Una carpeta compartida para el intercambio | Puede ser local o de red |

El puente **no usa librerías externas**: solo la biblioteca estándar de Python.
No hay que instalar nada con `pip`.

---

## Paso 1: copiar la carpeta `mantenimiento`

Copia esta carpeta completa a la PC del taller, por ejemplo a:

```
C:\SIERRA MADRE Puente\
```

Debe contener al menos:

```
C:\SIERRA MADRE Puente\puente_mantenimiento.py
```

---

## Paso 2: crear la carpeta de intercambio

Es la carpeta que la PWA va a vincular desde el navegador. Crea por ejemplo:

```
C:\SIERRA MADRE Ordenes\
```

Puede estar en una unidad de red compartida si prefieres que la PWA la vea desde
otra PC. Solo tiene que ser la **misma** carpeta que se vincule en la PWA
(botón *Mantenimiento.exe* → *Vincular carpeta*).

---

## Paso 3: primera prueba (sin dejarlo corriendo)

En una terminal, dentro de `C:\SIERRA MADRE Puente\`:

```bat
python puente_mantenimiento.py --carpeta "C:\SIERRA MADRE Ordenes" --una-vez
```

Debe responder algo así:

```
[2026-10-21 08:00:00] Carpeta de intercambio: C:\SIERRA MADRE Ordenes
[2026-10-21 08:00:00] Base de datos: C:\ProgramData\MGA Mantenimiento\mga_mantenimiento.db
[2026-10-21 08:00:00] Resultado: {"nuevas": 0, "actualizadas": 0, "alertadas": 0}
```

**Si en lugar de eso aparece un recuadro de `ATENCION: NO SE ENCONTRO LA BASE DE
DATOS`**, la ruta no es la correcta en esa PC. Búscala y pásala con `--db`:

```bat
python puente_mantenimiento.py --carpeta "C:\SIERRA MADRE Ordenes" ^
  --db "D:\otra\ruta\mga_mantenimiento.db" --una-vez
```

---

## Paso 4: dejarlo corriendo siempre

Haz doble clic en **`iniciar-puente.bat`** (está en esta misma carpeta).

Eso abre una ventana negra que vigila la carpeta cada 5 segundos. **Déjala
abierta** mientras el taller trabaja; si la cierras, las órdenes dejan de llegar.

Para que arranque solo al encender la PC, copia un acceso directo de
`iniciar-puente.bat` en:

```
C:\Users\<usuario>\AppData\Roaming\Microsoft\Windows\Start Menu\Programs\Startup
```

---

## Paso 5: vincular la carpeta desde la PWA

En el celular o PC donde se usan las órdenes entre turnos:

1. Abre https://vicozero.github.io/la-guitarra-pwa/
2. Pestaña **Turnos** → botón **Mantenimiento.exe**
3. Elige **Vincular carpeta** y señala la misma carpeta del Paso 2
4. Desde ahí, cada orden que se cree o se entregue se envía sola

---

## Servicio HTTP (opcional)

Si prefieres que la PWA hable directo por red, sin carpeta, arranca el puente así:

```bat
python puente_mantenimiento.py --carpeta "C:\SIERRA MADRE Ordenes" --servir --puerto 8766
```

Después, en la PWA → *Mantenimiento.exe* → pestaña **Por red**, pon:

```
http://<IP-de-la-PC-del-taller>:8766
```

Comprueba desde un navegador que responde:
`http://<IP-de-la-PC-del-taller>:8766/health`

> Si no responde, casi siempre es el **Firewall de Windows** bloqueando el
> puerto 8766. Hay que permitirlo para la red privada.

---

## Preguntas rápidas

**¿Se puede dañar la base de datos del programa?**
No. El puente abre la base, escribe o actualiza la orden y la cierra. Nunca
borra datos. Aun así, ten tus respaldos habituales.

**¿Y si el programa está abierto mientras el puente escribe?**
Funciona. SQLite admite varias conexiones y espera hasta 15 segundos si la base
está ocupada.

**¿Qué pasa si la orden ya existe?**
No se duplica. El puente agrega una columna `source_id` la primera vez y desde
entonces actualiza la misma orden en lugar de crear otra.

**¿Cómo sé que está funcionando?**
Mira la ventana del puente: cada ciclo escribe cuántas nuevas y cuántas
actualizadas. Si algo falla, queda registrado en `puente.log`.
