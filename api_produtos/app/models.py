from datetime import datetime, timezone
from typing import Optional

from sqlmodel import Field, SQLModel


def agora() -> datetime:
    return datetime.now(timezone.utc)


class Produto(SQLModel, table=True):
    __tablename__ = "produtos"

    id: Optional[int] = Field(default=None, primary_key=True)
    nome: str = Field(index=True)
    descricao: Optional[str] = Field(default=None)
    preco: float
    categoria: Optional[str] = Field(default=None, index=True)
    quantidade_estoque: int = Field(default=0)
    criado_em: datetime = Field(default_factory=agora)
