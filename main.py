import os
import sqlite3
from datetime import datetime

from flask import Flask, g, jsonify, render_template, request, send_from_directory

BASE_DIR = os.path.abspath(os.path.dirname(__file__))
DATABASE = os.path.join(BASE_DIR, "database.db")
CATEGORIAS = ["Minérios", "Construção", "Naturais", "Raros", "Outros"]
AVISOS_MIN = [0, 5, 10, 15, 30, 60, 120, 1440]

app = Flask(__name__)


# ============================================================
# BANCO DE DADOS (SQLite)
# ============================================================
def get_db():
    if "db" not in g:
        g.db = sqlite3.connect(DATABASE)
        g.db.row_factory = sqlite3.Row
    return g.db


@app.teardown_appcontext
def close_db(_):
    db = g.pop("db", None)
    if db is not None:
        db.close()


def init_db():
    with sqlite3.connect(DATABASE) as db:
        db.execute(
            """
            CREATE TABLE IF NOT EXISTS materiais (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                nome       TEXT    NOT NULL,
                categoria  TEXT    NOT NULL,
                encontrado INTEGER NOT NULL DEFAULT 0
            )
            """
        )
        db.execute(
            """
            CREATE TABLE IF NOT EXISTS compromissos (
                id        INTEGER PRIMARY KEY AUTOINCREMENT,
                titulo    TEXT    NOT NULL,
                data_hora TEXT    NOT NULL,  -- "AAAA-MM-DDTHH:MM", horário local
                aviso_min INTEGER NOT NULL DEFAULT 10
            )
            """
        )


def to_dict(row):
    return {
        "id": row["id"],
        "nome": row["nome"],
        "categoria": row["categoria"],
        "encontrado": bool(row["encontrado"]),
    }


def compromisso_dict(row):
    return {
        "id": row["id"],
        "titulo": row["titulo"],
        "data_hora": row["data_hora"],
        "aviso_min": row["aviso_min"],
    }


# ============================================================
# PÁGINA
# ============================================================
@app.get("/")
def index():
    return render_template("index.html", categorias=CATEGORIAS, avisos=AVISOS_MIN)


# O service worker precisa ser servido na raiz para controlar o site inteiro
@app.get("/sw.js")
def service_worker():
    resp = send_from_directory(os.path.join(BASE_DIR, "static"), "sw.js")
    resp.headers["Cache-Control"] = "no-cache"
    return resp


# ============================================================
# API — MATERIAIS
# ============================================================
@app.get("/api/materiais")
def listar_materiais():
    rows = get_db().execute("SELECT * FROM materiais ORDER BY id").fetchall()
    return jsonify([to_dict(r) for r in rows])


@app.post("/api/materiais")
def criar_material():
    data = request.get_json(silent=True) or {}
    nome = (data.get("nome") or "").strip()
    categoria = data.get("categoria")

    if not nome:
        return jsonify(erro="O campo 'nome' é obrigatório"), 400
    if categoria not in CATEGORIAS:
        return jsonify(erro="Categoria inválida"), 400

    db = get_db()
    cur = db.execute(
        "INSERT INTO materiais (nome, categoria) VALUES (?, ?)", (nome, categoria)
    )
    db.commit()
    row = db.execute("SELECT * FROM materiais WHERE id = ?", (cur.lastrowid,)).fetchone()
    return jsonify(to_dict(row)), 201


@app.patch("/api/materiais/<int:material_id>")
def atualizar_material(material_id):
    data = request.get_json(silent=True) or {}
    if "encontrado" not in data:
        return jsonify(erro="O campo 'encontrado' é obrigatório"), 400

    db = get_db()
    cur = db.execute(
        "UPDATE materiais SET encontrado = ? WHERE id = ?",
        (int(bool(data["encontrado"])), material_id),
    )
    db.commit()
    if cur.rowcount == 0:
        return jsonify(erro="Material não encontrado"), 404

    row = db.execute("SELECT * FROM materiais WHERE id = ?", (material_id,)).fetchone()
    return jsonify(to_dict(row))


@app.patch("/api/materiais")
def marcar_todos():
    data = request.get_json(silent=True) or {}
    db = get_db()
    db.execute("UPDATE materiais SET encontrado = ?", (int(bool(data.get("encontrado"))),))
    db.commit()
    return listar_materiais()


@app.delete("/api/materiais/<int:material_id>")
def remover_material(material_id):
    db = get_db()
    cur = db.execute("DELETE FROM materiais WHERE id = ?", (material_id,))
    db.commit()
    if cur.rowcount == 0:
        return jsonify(erro="Material não encontrado"), 404
    return "", 204


@app.delete("/api/materiais")
def resetar_lista():
    db = get_db()
    db.execute("DELETE FROM materiais")
    db.commit()
    return "", 204


# ============================================================
# API — COMPROMISSOS
# ============================================================
@app.get("/api/compromissos")
def listar_compromissos():
    rows = get_db().execute("SELECT * FROM compromissos ORDER BY data_hora").fetchall()
    return jsonify([compromisso_dict(r) for r in rows])


@app.post("/api/compromissos")
def criar_compromisso():
    data = request.get_json(silent=True) or {}
    titulo = (data.get("titulo") or "").strip()
    data_hora = data.get("data_hora") or ""

    try:
        datetime.strptime(data_hora, "%Y-%m-%dT%H:%M")
    except ValueError:
        return jsonify(erro="Data/hora inválida"), 400
    try:
        aviso_min = int(data.get("aviso_min", 10))
    except (TypeError, ValueError):
        return jsonify(erro="Aviso inválido"), 400

    if not titulo:
        return jsonify(erro="O campo 'titulo' é obrigatório"), 400
    if aviso_min not in AVISOS_MIN:
        return jsonify(erro="Aviso inválido"), 400

    db = get_db()
    cur = db.execute(
        "INSERT INTO compromissos (titulo, data_hora, aviso_min) VALUES (?, ?, ?)",
        (titulo, data_hora, aviso_min),
    )
    db.commit()
    row = db.execute("SELECT * FROM compromissos WHERE id = ?", (cur.lastrowid,)).fetchone()
    return jsonify(compromisso_dict(row)), 201


@app.delete("/api/compromissos/<int:compromisso_id>")
def remover_compromisso(compromisso_id):
    db = get_db()
    cur = db.execute("DELETE FROM compromissos WHERE id = ?", (compromisso_id,))
    db.commit()
    if cur.rowcount == 0:
        return jsonify(erro="Compromisso não encontrado"), 404
    return "", 204


init_db()

if __name__ == "__main__":
    # host="0.0.0.0" permite acessar pelo celular na mesma rede Wi-Fi
    app.run(host="0.0.0.0", debug=True)
