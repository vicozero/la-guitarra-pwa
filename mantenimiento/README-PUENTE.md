# Puente La Guitarra PWA → SIERRA MADRE

Este carpeta contiene el lado "mantenimiento" del puente: el programa que recibe
las órdenes de trabajo que la PWA deja al siguiente turno, las registra en la
aplicación de mantenimiento y devuelve al taller y a la PWA el estado de avance.

No requiere instalar nada: usa solo la biblioteca estándar de Python 3.8+.

---

## 1. Qué hace

| Paso | Quién | Qué ocurre |
|---|---|---|
| 1 | La PWA | Escribe `ordenes-mantenimiento.json` con todas las órdenes y `mantenimiento_watch.json` como señal |
| 2 | El puente | Lee el archivo, inserta o actualiza la orden en la base de SIERRA MADRE y escribe `alerta_ordenes.txt` |
| 3 | El taller | Trabaja la orden en SIERRA MADRE o en el propio programa |
| 4 | El puente | Devuelve `ordenes-mantenimiento-import.json` con lo que se cerró |
| 5 | La PWA | Con **Importar de carpeta** (o **Recibir del servicio**) trae los cambios de vuelta |

La alerta es el archivo `alerta_ordenes.txt`, que el taller puede abrir para ver
las órdenes pendientes y darles continuidad.

---

## 2. Uso rápido

### Solo alertas (sin base de datos)

Útil para verificar el flujo antes de conectar la base real:

```powershell
python puente_mantenimiento.py --carpeta "$env:USERPROFILE\Documents\La Guitarra Ordenes" --una-vez
```

### Vigilando en forma continua

```powershell
python puente_mantenimiento.py --carpeta "$env:USERPROFILE\Documents\La Guitarra Ordenes"
```

### Con servicio HTTP para la PWA

```powershell
python puente_mantenimiento.py --carpeta "$env:USERPROFILE\Documents\La Guitarra Ordenes" --servir --puerto 8766
```

En la PWA: **Turnos → Mantenimiento.exe → Envío por red**, dirección
`http://127.0.0.1:8766/api/work-orders`.

### Opciones

| Opción | Para qué |
|---|---|
| `--carpeta` | Carpeta de intercambio (obligatoria). Debe ser la misma que vincula la PWA |
| `--db` | Ruta de la base de datos del programa (por omisión `C:\ProgramData\MGA Mantenimiento\mga_mantenimiento.db`) |
| `--intervalo` | Segundos entre revisiones (por omisión 5) |
| `--servir` | Levanta el servicio HTTP |
| `--puerto` | Puerto del servicio (por omisión 8766) |
| `--una-vez` | Revisa una sola vez y sale (para tareas programadas) |

---

## 3. Enlace idempotente con la base

La tabla `work_order` de SIERRA MADRE **no trae** una columna para saber de
qué orden de la PWA viene cada fila. El puente lo resuelve solo:

1. La primera vez agrega la columna `source_id` con `ALTER TABLE`
   (solo una vez; la siguiente arranque la ve y no hace nada).
2. Enlaza las órdenes que ya existían por equipo y descripción, para no
   duplicarlas.
3. En cada ciclo compara por `source_id` y **actualiza** en lugar de duplicar.

Campos que escribe en `work_order` (los que existan en el esquema real):

`order_number`, `created_at`, `work_date`, `supervisor`, `mechanic`, `shift`,
`location`, `equipment_id`, `equipment_number`, `priority`, `maintenance_type`,
`instructions`, `reported_failure`, `correction`, `status`, `origin`, `source_id`.

La correspondencia con la orden de la PWA es:

| PWA | SIERRA MADRE |
|---|---|
| `description` | `instructions` |
| `details` | `reported_failure` |
| `priority` | `priority` + `maintenance_type` |
| `eco` | `equipment_number` |
| `equipment` | `location` |
| `createdBy` | `supervisor` |
| `assignedTo` | `mechanic` |
| `toShift` | `shift` |
| `completionNotes` | `correction` |
| `PENDIENTE` / `EN_PROCESO` | `Abierta` |
| `COMPLETADA` | `Cerrada` |

---

## 4. Servicio HTTP

| Método | Ruta | Qué hace |
|---|---|---|
| `GET` | `/health` | Comprueba que el servicio está vivo |
| `POST` | `/api/work-orders` | Recibe el paquete de la PWA y registra las órdenes |
| `GET` | `/api/work-orders` | Devuelve las órdenes que el taller cerró o modificó |

Las respuestas llevan `Access-Control-Allow-Origin: *` y aceptan las cabeceras
`X-SierraMadre-API-Key` y `X-Portal-API-Key`, de modo que la PWA puede llamarlo desde el
navegador.

Ejemplo de comprobación:

```powershell
Invoke-WebRequest http://127.0.0.1:8766/health -UseBasicParsing
```

---

## 5. Cómo se integra con el programa de mantenimiento

**No hay que modificar el programa de mantenimiento.** El puente escribe las
órdenes directo en su base de datos, así que el operador las ve al abrir o
refrescar la lista de órdenes de trabajo, igual que las capturadas a mano.

Flujo completo:

```
PWA (Turnos)  ->  carpeta de intercambio  ->  puente  ->  base de datos  ->  programa
                                                  |
                                                  +->  alerta_ordenes.txt
```

Para instalarlo en la PC del taller, sigue **[INSTALAR-PC-TALLER.md](INSTALAR-PC-TALLER.md)**
y arranca con **`iniciar-puente.bat`**.

### ¿Y si algún día quieres el aviso en vivo dentro del programa?

Solo entonces haría falta tocar su código. El fragmento sería:

```python
import threading, time
from puente_mantenimiento import Puente, construir_servidor

puente = Puente(CARPETA_DE_INTERCAMBIO, DB_PATH)   # DB_PATH es la base que ya usa la app

# Servicio para la PWA
servidor = construir_servidor(puente, 8766)
threading.Thread(target=servidor.serve_forever, daemon=True).start()

# Vigilancia de la carpeta, con aviso en pantalla
def vigilar():
    while True:
        resultado = puente.revisar()
        if resultado["alertadas"]:
            ventana.after(0, lambda: mostrar_alerta(resultado))
        time.sleep(5)

threading.Thread(target=vigilar, daemon=True).start()
```

Eso es opcional. El envío a mantenimiento funciona sin ello.

---

## 6. Archivos que se intercambian

| Archivo | Lo escribe | Contenido |
|---|---|---|
| `ordenes-mantenimiento.json` | La PWA | Todas las órdenes y entregas de turno |
| `mantenimiento_watch.json` | La PWA | Señal de que hay algo nuevo (con el conteo pendiente) |
| `alerta_ordenes.txt` | El puente | Alerta legible para el taller |
| `ordenes-mantenimiento-import.json` | El puente | Órdenes cerradas o modificadas para devolver a la PWA |
| `puente_estado.json` | El puente | Control interno para no repetir trabajo |

---

## 7. Prueba sin la aplicación de mantenimiento

El puente se puede verificar completo por sí solo:

```powershell
# 1) Un archivo de ejemplo
Set-Content ordenes-mantenimiento.json '{"format":"laguitarra-ordenes","version":2,"orders":[{"id":"demo-1","equipment":"JUMBO","eco":"1","description":"Prueba","priority":"ALTA","status":"PENDIENTE","fromShift":"Turno 1","toShift":"Turno 2"}]}'

# 2) Procesarlo (sin base de datos: solo alerta)
python puente_mantenimiento.py --carpeta . --db no-existe.db --una-vez

# 3) Ver el resultado
Get-Content alerta_ordenes.txt
```

---

## Nota importante

El programa de mantenimiento que usa el taller **no está en esta PC**: se ejecuta
en otra máquina, y aquí solo quedaron respaldos de su código. Por eso el puente
se entrega como pieza independiente: **no necesita ese código**. Escribe directo
en la base de datos, que es lo único con lo que tiene que hablar.

La PWA ya quedó publicada en https://vicozero.github.io/la-guitarra-pwa/ con las
órdenes entre turnos y el panel de administración.
