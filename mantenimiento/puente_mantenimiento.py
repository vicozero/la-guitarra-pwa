#!/usr/bin/env python3
"""Puente entre la PWA La Guitarra y SIERRA MADRE (mantenimiento.exe).

Hace tres cosas, todas con la biblioteca estándar (no requiere instalar nada):

1. VIGILA una carpeta de intercambio y lee ``ordenes-mantenimiento.json``.
   Cuando la PWA exporta una orden nueva o actualiza una, este proceso la
   registra en la base de datos de SIERRA MADRE y genera la alerta.
2. ESCRIBE ``ordenes-mantenimiento-import.json`` con las órdenes que cerró o
   modificó el taller, para que la PWA las recupere con "Importar de carpeta".
3. Opcionalmente sirve un servicio HTTP (``--servir``) con el que la PWA se
   comunica directamente por red, sin carpetas.

Uso típico en la PC del taller::

    python puente_mantenimiento.py --carpeta "%USERPROFILE%\\Documentos\\La Guitarra Ordenes"
    python puente_mantenimiento.py --carpeta ... --servir --puerto 8766

Base de datos por omisión (la que usa SIERRA MADRE):
    C:\\ProgramData\\SIERRA MADRE\\sierra_madre.db
Se puede cambiar con ``--db``.

El script es tolerante: si la base no existe o no tiene la tabla ``work_order``,
solo deja un archivo ``alerta_ordenes.txt`` y un registro en el log, sin fallar.
"""

import argparse
import json
import os
import sqlite3
import sys
import threading
import time
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

EXPORT_FILE = "ordenes-mantenimiento.json"
IMPORT_FILE = "ordenes-mantenimiento-import.json"
WATCH_FILE = "mantenimiento_watch.json"
ALERT_FILE = "alerta_ordenes.txt"
STATE_FILE = "puente_estado.json"
FORMAT = "laguitarra-ordenes"

# Base de datos real que usa el programa de mantenimiento del taller.
# La carpeta conserva el nombre historico "MGA Mantenimiento" porque es donde
# el programa guarda los datos; NO cambiar sin migrar la base primero.
DEFAULT_DB = os.path.join(
    os.environ.get("PROGRAMDATA", r"C:\ProgramData"),
    "MGA Mantenimiento",
    "mga_mantenimiento.db",
)

PRIORIDAD_A_TIPO = {
    "CRÍTICA": "Correctivo urgente",
    "ALTA": "Correctivo",
    "MEDIA": "Correctivo programado",
    "BAJA": "Mejora",
}


def log(mensaje):
    texto = "[%s] %s" % (datetime.now().strftime("%Y-%m-%d %H:%M:%S"), mensaje)
    try:
        print(texto, flush=True)
    except UnicodeEncodeError:
        # Consolas antiguas de Windows (cp1252/cp850) no traen todos los signos.
        # Se reemplaza lo que no se pueda mostrar en vez de cortar el programa.
        codificacion = getattr(sys.stdout, "encoding", None) or "ascii"
        print(texto.encode(codificacion, "replace").decode(codificacion, "replace"), flush=True)


def leer_json(ruta):
    """Lee JSON tolerando el BOM que agregan algunas herramientas de Windows."""
    try:
        with open(ruta, "r", encoding="utf-8-sig") as f:
            return json.load(f)
    except FileNotFoundError:
        return None
    except Exception as error:  # archivo a medio escribir, JSON inválido, etc.
        log("No se pudo leer %s: %s" % (os.path.basename(ruta), error))
        return None


def escribir_json(ruta, datos):
    tmp = ruta + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(datos, f, ensure_ascii=False, indent=2)
    os.replace(tmp, ruta)


# ---------------------------------------------------------------- base de datos

def columnas(conexion, tabla):
    try:
        filas = conexion.execute("PRAGMA table_info(%s)" % tabla).fetchall()
    except sqlite3.Error:
        return []
    return [fila[1] for fila in filas]


def existe_tabla(conexion, tabla):
    fila = conexion.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name=?", (tabla,)
    ).fetchone()
    return fila is not None


def siguiente_numero(conexion):
    fila = conexion.execute("SELECT COUNT(*) FROM work_order").fetchone()
    total = (fila[0] if fila else 0) + 1
    return "OT-%s-%04d" % (datetime.now().strftime("%Y"), total)


def ensure_source_id(conexion):
    """Garantiza la columna de enlace source_id.

    SIERRA MADRE no la trae de fábrica. Se agrega una sola vez; así el
    puente puede reconocer las órdenes que ya insertó y actualizarlas en lugar
    de duplicarlas en cada ciclo.
    """
    campos = columnas(conexion, "work_order")
    if not campos:
        return False
    if "source_id" in campos:
        return True
    try:
        conexion.execute("ALTER TABLE work_order ADD COLUMN source_id TEXT")
        conexion.commit()
        log("Se agregó la columna source_id a work_order para enlazar con la PWA")
        return True
    except sqlite3.Error as error:
        log("No se pudo agregar source_id (%s). Sin enlace idempotente." % error)
        return False


def adoptar_huerfanas(conexion, ordenes):
    """Empareja órdenes ya insertadas (sin source_id) con las de la PWA.

    Si el taller ya tenía filas creadas por una versión anterior del puente, se
    reconocen por número de equipo + descripción para no duplicarlas.
    """
    if "source_id" not in columnas(conexion, "work_order"):
        return 0
    adoptadas = 0
    for orden in ordenes:
        ident = orden.get("id")
        if not ident or buscar_por_origen(conexion, ident):
            continue
        fila = conexion.execute(
            "SELECT id FROM work_order WHERE (source_id IS NULL OR source_id = '')"
            " AND equipment_number = ? AND instructions = ?",
            (orden.get("eco") or "", orden.get("description") or ""),
        ).fetchone()
        if fila:
            conexion.execute(
                "UPDATE work_order SET source_id = ? WHERE id = ?", (ident, fila[0])
            )
            adoptadas += 1
    if adoptadas:
        conexion.commit()
        log("Se enlazaron %d órdenes ya existentes con la PWA" % adoptadas)
    return adoptadas


def insertar_orden(conexion, orden):
    """Inserta la orden respetando el esquema real de la tabla work_order."""
    campos = columnas(conexion, "work_order")
    if not campos:
        raise RuntimeError("La tabla work_order no existe en esta base")

    valores = {
        "order_number": siguiente_numero(conexion),
        "created_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "work_date": orden.get("toDate") or datetime.now().strftime("%Y-%m-%d"),
        "supervisor": orden.get("createdBy") or "",
        "mechanic": orden.get("assignedTo") or "",
        "assistant": "",
        "shift": orden.get("toShift") or "Turno 1",
        "location": orden.get("equipment") or "",
        "equipment_id": orden.get("equipmentId") or "",
        "equipment_number": orden.get("eco") or "",
        "priority": orden.get("priority") or "MEDIA",
        "maintenance_type": PRIORIDAD_A_TIPO.get(orden.get("priority"), "Correctivo"),
        "instructions": orden.get("description") or "",
        "reported_failure": orden.get("details") or "",
        "correction": orden.get("completionNotes") or "",
        "status": "Abierta" if orden.get("status") in ("PENDIENTE", "EN_PROCESO") else "Cerrada",
        "origin": "La Guitarra PWA",
        "source_id": orden.get("id") or "",
    }

    usados = [(k, v) for k, v in valores.items() if k in campos]
    if not usados:
        raise RuntimeError("Ningún campo coincide con el esquema de work_order")

    sql = "INSERT INTO work_order (%s) VALUES (%s)" % (
        ", ".join(k for k, _ in usados),
        ", ".join("?" for _ in usados),
    )
    conexion.execute(sql, [v for _, v in usados])
    conexion.commit()
    return valores["order_number"]


def buscar_por_origen(conexion, origen):
    if "source_id" not in columnas(conexion, "work_order"):
        return None
    fila = conexion.execute(
        "SELECT id, order_number, status FROM work_order WHERE source_id=?", (origen,)
    ).fetchone()
    return fila


def actualizar_orden(conexion, orden):
    campos = columnas(conexion, "work_order")
    if "source_id" not in campos:
        return None

    nuevos = {}
    if "status" in campos:
        nuevos["status"] = "Cerrada" if orden.get("status") == "COMPLETADA" else "Abierta"
    if "correction" in campos and orden.get("completionNotes"):
        nuevos["correction"] = orden["completionNotes"]
    if "mechanic" in campos and orden.get("assignedTo"):
        nuevos["mechanic"] = orden["assignedTo"]

    if not nuevos:
        return None

    conexion.execute(
        "UPDATE work_order SET %s WHERE source_id=?" % ", ".join("%s=?" % k for k in nuevos),
        list(nuevos.values()) + [orden.get("id")],
    )
    conexion.commit()
    return list(nuevos.keys())


# ---------------------------------------------------------------- procesamiento

class Puente:
    def __init__(self, carpeta, db_path):
        self.carpeta = carpeta
        self.db_path = db_path
        self.estado = leer_json(os.path.join(carpeta, STATE_FILE)) or {
            "procesadas": {}, "ultima_revision": ""
        }

    # --- utilidades ---
    def guardar_estado(self):
        self.estado["ultima_revision"] = datetime.now().isoformat(timespec="seconds")
        escribir_json(os.path.join(self.carpeta, STATE_FILE), self.estado)

    def conectar(self):
        if not os.path.exists(self.db_path):
            return None
        conexion = sqlite3.connect(self.db_path, timeout=15)
        if not existe_tabla(conexion, "work_order"):
            conexion.close()
            return None
        ensure_source_id(conexion)
        return conexion

    def alertar(self, ordenes):
        """Deja la alerta legible que el taller ve incluso sin base de datos."""
        lineas = ["ALERTA DE ORDENES DE TRABAJO - La Guitarra", "=" * 46, ""]
        for o in ordenes:
            detalle = (o.get("details") or "").replace("\n", " ").strip()
            lineas.append(
                "%s %s  [%s]\n  %s -> %s\n  %s\n  Detalle: %s\n"
                % (
                    o.get("equipment") or "Equipo",
                    ("#" + str(o.get("eco"))) if o.get("eco") else "",
                    o.get("priority") or "MEDIA",
                    o.get("fromShift") or "—",
                    o.get("toShift") or "—",
                    o.get("description") or "",
                    detalle or "sin detalle",
                )
            )
        lineas.append("Generado: " + datetime.now().strftime("%Y-%m-%d %H:%M:%S"))
        ruta = os.path.join(self.carpeta, ALERT_FILE)
        with open(ruta, "w", encoding="utf-8") as f:
            f.write("\n".join(lineas))
        return ruta

    # --- ciclo principal ---
    def revisar(self):
        datos = leer_json(os.path.join(self.carpeta, EXPORT_FILE))
        if not datos:
            return {"nuevas": 0, "actualizadas": 0, "alertadas": 0}

        ordenes = datos.get("orders") or []
        procesadas = self.estado.setdefault("procesadas", {})
        nuevas, actualizadas, pendientes_alerta = [], [], []

        conexion = self.conectar()
        if conexion is not None:
            adoptar_huerfanas(conexion, ordenes)

        for orden in ordenes:
            ident = orden.get("id")
            if not ident:
                continue
            huella = json.dumps(
                [orden.get("status"), orden.get("completionNotes"), orden.get("assignedTo")],
                sort_keys=True,
            )
            if procesadas.get(ident) == huella:
                continue

            aplicada = False
            try:
                if conexion is None:
                    pendientes_alerta.append(orden)
                    aplicada = True
                else:
                    fila = buscar_por_origen(conexion, ident)
                    if fila:
                        cambios = actualizar_orden(conexion, orden)
                        if cambios:
                            actualizadas.append((ident, cambios))
                        aplicada = True
                    elif orden.get("status") in ("PENDIENTE", "EN_PROCESO"):
                        numero = insertar_orden(conexion, orden)
                        nuevas.append((ident, numero))
                        pendientes_alerta.append(orden)
                        aplicada = True
                    else:
                        # Orden ya cerrada en la PWA que nunca llegó a la base:
                        # no hay nada que registrar, pero se deja constancia.
                        log("Orden %s (%s) ya estaba cerrada; no se inserta." % (ident, orden.get("description")))
                        aplicada = True
            except Exception as error:
                log("Orden %s no se pudo registrar: %s" % (ident, error))

            # Solo se marca como procesada si el cambio realmente se aplicó;
            # así un fallo se reintenta en el siguiente ciclo.
            if aplicada:
                procesadas[ident] = huella

        if conexion is not None:
            conexion.close()

        if pendientes_alerta:
            ruta = self.alertar(pendientes_alerta)
            log("Alerta escrita en %s (%d órdenes)" % (ruta, len(pendientes_alerta)))

        if nuevas or actualizadas:
            log(
                "Órdenes: %d nuevas, %d actualizadas"
                % (len(nuevas), len(actualizadas))
            )

        self.guardar_estado()
        return {
            "nuevas": len(nuevas),
            "actualizadas": len(actualizadas),
            "alertadas": len(pendientes_alerta),
        }

    def recibir_de_pwa(self, datos):
        """Recibe el paquete que la PWA manda por HTTP."""
        escribir_json(os.path.join(self.carpeta, EXPORT_FILE), datos)
        return self.revisar()

    def exportar_para_pwa(self, ordenes):
        """Devuelve a la PWA las órdenes cerradas o modificadas en el taller."""
        paquete = {
            "format": FORMAT,
            "version": 2,
            "exportedAt": datetime.now().isoformat(timespec="seconds"),
            "origin": "sierra-madre",
            "orders": ordenes,
        }
        escribir_json(os.path.join(self.carpeta, IMPORT_FILE), paquete)
        return paquete

    def leer_cerradas(self):
        """Lee de la base las órdenes que el taller ya cerró o cambió."""
        conexion = self.conectar()
        if conexion is None:
            return []
        try:
            campos = columnas(conexion, "work_order")
            if "source_id" not in campos:
                return []
            seleccion = ["source_id", "status"]
            for extra in ("order_number", "correction", "mechanic", "updated_at"):
                if extra in campos:
                    seleccion.append(extra)
            sql = "SELECT %s FROM work_order WHERE source_id IS NOT NULL AND source_id <> ''" % ", ".join(seleccion)
            salida = []
            for fila in conexion.execute(sql).fetchall():
                registro = dict(zip(seleccion, fila))
                estado = str(registro.get("status") or "").strip().lower()
                salida.append(
                    {
                        "id": registro["source_id"],
                        "status": "COMPLETADA" if estado in ("cerrada", "cerrado", "completada") else "EN_PROCESO",
                        "assignedTo": registro.get("mechanic") or "",
                        "completionNotes": registro.get("correction") or "",
                        "orderNumber": registro.get("order_number") or "",
                    }
                )
            return salida
        finally:
            conexion.close()


# ---------------------------------------------------------------- servicio HTTP

def construir_servidor(puente, puerto):
    class Handler(BaseHTTPRequestHandler):
        server_version = "SierraMadreOrdenesBridge/1.0"

        def _cors(self):
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Access-Control-Allow-Headers", "Content-Type, X-SierraMadre-API-Key, X-Portal-API-Key")
            self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")

        def _json(self, codigo, datos):
            cuerpo = json.dumps(datos, ensure_ascii=False).encode("utf-8")
            self.send_response(codigo)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(cuerpo)))
            self._cors()
            self.end_headers()
            self.wfile.write(cuerpo)

        def do_OPTIONS(self):
            self.send_response(204)
            self._cors()
            self.end_headers()

        def do_GET(self):
            if self.path.startswith("/health"):
                self._json(200, {"ok": True, "service": "sierra-madre-ordenes-bridge", "carpeta": puente.carpeta})
                return
            if self.path.startswith("/api/work-orders"):
                self._json(200, {"format": FORMAT, "version": 2, "orders": puente.leer_cerradas()})
                return
            self._json(404, {"ok": False, "error": "Ruta no encontrada"})

        def do_POST(self):
            if not self.path.startswith("/api/work-orders"):
                self._json(404, {"ok": False, "error": "Ruta no encontrada"})
                return
            try:
                largo = int(self.headers.get("Content-Length") or 0)
                datos = json.loads(self.rfile.read(largo).decode("utf-8"))
            except Exception as error:
                self._json(400, {"ok": False, "error": "JSON inválido: %s" % error})
                return
            try:
                resultado = puente.recibir_de_pwa(datos)
                self._json(200, {"ok": True, "resultado": resultado})
            except Exception as error:
                self._json(500, {"ok": False, "error": str(error)})

        def log_message(self, formato, *args):
            log("HTTP " + (formato % args))

    return ThreadingHTTPServer(("0.0.0.0", puerto), Handler)


# ---------------------------------------------------------------- principal

def main():
    parser = argparse.ArgumentParser(description="Puente La Guitarra PWA -> SIERRA MADRE")
    parser.add_argument("--carpeta", required=True, help="Carpeta de intercambio (la misma que vincula la PWA)")
    parser.add_argument("--db", default=DEFAULT_DB, help="Ruta de la base de datos del programa de mantenimiento")
    parser.add_argument("--intervalo", type=float, default=5.0, help="Segundos entre revisiones")
    parser.add_argument("--servir", action="store_true", help="Levantar servicio HTTP para la PWA")
    parser.add_argument("--puerto", type=int, default=8766, help="Puerto del servicio HTTP")
    parser.add_argument("--una-vez", action="store_true", help="Revisar una vez y salir")
    args = parser.parse_args()

    os.makedirs(args.carpeta, exist_ok=True)
    puente = Puente(args.carpeta, args.db)

    log("Carpeta de intercambio: %s" % args.carpeta)
    if os.path.exists(args.db):
        log("Base de datos: %s" % args.db)
    else:
        # Aviso imposible de ignorar: sin la base las ordenes NO llegan al
        # programa de mantenimiento, solo queda el archivo de alerta.
        log("=" * 62)
        log("ATENCION: NO SE ENCONTRO LA BASE DE DATOS DEL PROGRAMA")
        log("  Ruta buscada: %s" % args.db)
        log("  Las ordenes NO se registraran en mantenimiento.")
        log("  Solo se escribira el archivo de alerta en la carpeta.")
        log("  Indique la ruta correcta con:  --db \"RUTA\\completa\\base.db\"")
        log("=" * 62)
    if os.path.exists(args.db) and not os.access(args.db, os.W_OK):
        log("ATENCION: no hay permiso de escritura sobre %s" % args.db)
        log("  Ejecute este puente con permisos de administrador.")

    if args.servir:
        servidor = construir_servidor(puente, args.puerto)
        hilo = threading.Thread(target=servidor.serve_forever, daemon=True)
        hilo.start()
        log("Servicio HTTP escuchando en http://127.0.0.1:%d/api/work-orders" % args.puerto)

    if args.una_vez:
        log("Resultado: %s" % json.dumps(puente.revisar(), ensure_ascii=False))
        return 0

    log("Vigilando cambios cada %.1f s. Use Ctrl+C para salir." % args.intervalo)
    try:
        while True:
            puente.revisar()
            time.sleep(max(1.0, args.intervalo))
    except KeyboardInterrupt:
        log("Puente detenido.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
