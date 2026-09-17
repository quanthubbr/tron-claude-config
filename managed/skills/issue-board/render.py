#!/usr/bin/env python3
"""Desenha o board com rich, a partir de `node board.mjs render --json`.

Aceita as mesmas flags do `render` do board.mjs (--all, --por, --prioridade...).
Sem o pacote rich, cai no render ANSI do board.mjs.
"""

import json
import shutil
import subprocess
import sys
import unicodedata
from pathlib import Path

HERE = Path(__file__).resolve().parent
BOARD = HERE / "board.mjs"
WIDTH_WHEN_PIPED = 160
MIN_TITLE_WIDTH = 24

PRIORITY_STYLE = {
    "P0": "bold white on red3",
    "P1": "bold black on gold3",
    "P2": "bold black on steel_blue1",
    "P3": "white on grey37",
}
DIFFICULTY_STYLE = {1: "green3", 2: "gold3", 3: "red3"}
# Casado por trecho, sem acento: "Ready to Dev" e "Not ready" caem em "ready".
STATUS_STYLE = [
    ("progress", "bold dodger_blue2"),
    ("review", "bold magenta"),
    ("ready", "green3"),
    ("backlog", "grey50"),
    ("block", "bold red3"),
    ("done", "grey50"),
]


def fold(value):
    text = unicodedata.normalize("NFD", str(value))
    return "".join(ch for ch in text if unicodedata.category(ch) != "Mn").lower()


def run_board(args):
    node = shutil.which("node")
    if not node:
        sys.exit("node não encontrado: o board.mjs precisa de Node 18+.")
    return subprocess.run([node, str(BOARD), "render", *args], capture_output=True, text=True, encoding="utf-8")


def fallback(args, reason):
    sys.stderr.write(f"{reason} Usando o render do board.mjs.\n")
    node = shutil.which("node")
    if not node:
        sys.exit("node não encontrado: o board.mjs precisa de Node 18+.")
    sys.exit(subprocess.call([node, str(BOARD), "render", *args]))


def priority_cell(row, Text):
    priority = row["priority"]
    cell = Text(f" {priority} ", style=PRIORITY_STYLE.get(priority, "bold"))
    if row["prioritySuggested"]:
        cell.append(" ~", style="dim")
    return cell


def difficulty_cell(row, Text):
    level = row["difficulty"]
    if not level:
        return Text("—", style="dim")
    cell = Text("●" * level, style=DIFFICULTY_STYLE[level])
    cell.append("○" * (3 - level), style="grey42")
    if row["difficultySuggested"]:
        cell.append(" ~", style="dim")
    return cell


def issue_cell(row, Text):
    style = f"link {row['url']}" if row.get("url") else ""
    cell = Text(row["repo"], style=f"{style} grey70".strip())
    cell.append(f"#{row['number']}", style=f"{style} bold".strip())
    return cell


def title_cell(row, Text):
    cell = Text(row["title"])
    if row["note"]:
        cell.append(f"  {row['note']}", style="italic grey58")
    return cell


def status_cell(row, Text):
    status = row["status"] or "—"
    style = next((s for key, s in STATUS_STYLE if key in fold(status)), "")
    return Text(status, style=style)


def header(view, Text, Panel):
    body = Text()
    body.append(f"{view['total']} issues", style="bold")
    for priority, count in view["counts"].items():
        body.append("   ")
        body.append(f" {priority} ", style=PRIORITY_STYLE[priority])
        body.append(f" {count}", style="bold")
    body.append("\n")
    body.append("Dificuldade ", style="dim")
    for level, label in ((1, "fácil"), (2, "média"), (3, "difícil")):
        body.append("●" * level, style=DIFFICULTY_STYLE[level])
        body.append("○" * (3 - level), style="grey42")
        body.append(f" {label}   ", style="dim")
    body.append("~ sugestão do agente (campo vazio no board)", style="dim")
    who = view["user"] or "board inteiro"
    return Panel(body, title=f"[bold]Board {view['board']}[/] · {who}", title_align="left", border_style="grey50", expand=False)


def group_table(view, group, Table, Text, box):
    table = Table(
        title=f"[bold]{group['name']}[/] [grey58]({len(group['rows'])})[/]",
        title_justify="left",
        box=box.ROUNDED,
        border_style="grey42",
        header_style="bold grey85",
        expand=True,
        pad_edge=True,
    )
    table.add_column("Pri", no_wrap=True, width=6)
    table.add_column("Dif", no_wrap=True, width=5)
    table.add_column("Issue", no_wrap=True)
    table.add_column("Título", no_wrap=True, overflow="ellipsis", min_width=MIN_TITLE_WIDTH, ratio=1)
    table.add_column("Status", no_wrap=True)
    if view["groupField"]:
        table.add_column(view["groupField"], no_wrap=True, style="grey70")
    if view["groupBy"] != "tipo":
        table.add_column("Tipo", no_wrap=True, style="grey70")
    for row in group["rows"]:
        cells = [
            priority_cell(row, Text),
            difficulty_cell(row, Text),
            issue_cell(row, Text),
            title_cell(row, Text),
            status_cell(row, Text),
        ]
        if view["groupField"]:
            cells.append(row["group"] or "—")
        if view["groupBy"] != "tipo":
            cells.append(row["type"])
        table.add_row(*cells)
    return table


def main():
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8")
    args = sys.argv[1:]
    try:
        from rich import box
        from rich.console import Console
        from rich.panel import Panel
        from rich.table import Table
        from rich.text import Text
    except ImportError:
        fallback(args, "Pacote rich não instalado (pip install rich).")

    no_color = "--no-color" in args
    board_args = [a for a in args if a not in ("--color", "--no-color")] + ["--json"]
    result = run_board(board_args)
    if result.returncode != 0:
        sys.stderr.write(result.stderr)
        sys.exit(result.returncode)
    view = json.loads(result.stdout)

    piped = not sys.stdout.isatty()
    console = Console(
        width=WIDTH_WHEN_PIPED if piped else None,
        no_color=no_color,
        force_terminal=True if "--color" in args else None,
        legacy_windows=False,
    )
    if not view["total"]:
        console.print("Nenhuma issue nesse escopo. Tente [bold]--all[/] para ver o board inteiro.")
        return
    console.print(header(view, Text, Panel))
    for group in view["groups"]:
        console.print()
        console.print(group_table(view, group, Table, Text, box))


if __name__ == "__main__":
    main()
