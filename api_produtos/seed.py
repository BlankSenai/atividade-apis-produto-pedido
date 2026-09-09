"""Popula o banco com produtos de teste.

Uso:  python seed.py          (nao duplica: so insere se a tabela estiver vazia)
      python seed.py --reset  (apaga tudo e recria)
"""

import sys

from sqlmodel import Session, delete, func, select

from app.database import criar_tabelas, engine
from app.models import Produto

PRODUTOS = [
    Produto(
        nome="Teclado Mecânico",
        descricao="Switch azul, ABNT2",
        preco=250.0,
        categoria="Periféricos",
        quantidade_estoque=20,
    ),
    Produto(
        nome="Mouse Gamer",
        descricao="6 botões, 12000 DPI",
        preco=149.9,
        categoria="Periféricos",
        quantidade_estoque=35,
    ),
    Produto(
        nome="Monitor 24 polegadas",
        descricao="Full HD, 75Hz",
        preco=899.0,
        categoria="Monitores",
        quantidade_estoque=8,
    ),
    Produto(
        nome="Headset Sem Fio",
        descricao="Bluetooth 5.0",
        preco=320.5,
        categoria="Áudio",
        quantidade_estoque=12,
    ),
    Produto(
        nome="Webcam HD",
        descricao="1080p com microfone",
        preco=189.0,
        categoria="Periféricos",
        quantidade_estoque=2,
    ),
    Produto(
        nome="SSD 1TB",
        descricao="NVMe PCIe 4.0",
        preco=549.9,
        categoria="Armazenamento",
        quantidade_estoque=0,
    ),
]


def main() -> None:
    reset = "--reset" in sys.argv
    criar_tabelas()

    with Session(engine) as session:
        if reset:
            session.exec(delete(Produto))
            session.commit()
            print("Tabela limpa.")

        total = session.exec(select(func.count()).select_from(Produto)).one()
        if total:
            print(f"Banco ja possui {total} produto(s). Nada a fazer (use --reset).")
            return

        for produto in PRODUTOS:
            session.add(produto)
        session.commit()
        print(f"{len(PRODUTOS)} produtos inseridos.")


if __name__ == "__main__":
    main()
