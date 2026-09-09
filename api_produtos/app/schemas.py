from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator


def _nome_valido(valor: Optional[str]) -> Optional[str]:
    if valor is None:
        return None
    limpo = valor.strip()
    if not limpo:
        raise ValueError("nome nao pode ser vazio")
    return limpo


class ProdutoCreate(BaseModel):
    nome: str
    descricao: Optional[str] = None
    preco: float = Field(gt=0, description="deve ser maior que zero")
    categoria: Optional[str] = None
    quantidade_estoque: int = Field(default=0, ge=0)

    @field_validator("nome")
    @classmethod
    def validar_nome(cls, v: str) -> str:
        return _nome_valido(v)


class ProdutoUpdate(BaseModel):
    """PUT nao altera quantidade_estoque (ver /produtos/{id}/estoque/baixa)."""

    nome: Optional[str] = None
    descricao: Optional[str] = None
    preco: Optional[float] = Field(default=None, gt=0)
    categoria: Optional[str] = None

    @field_validator("nome")
    @classmethod
    def validar_nome(cls, v: Optional[str]) -> Optional[str]:
        return _nome_valido(v)


class ProdutoOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    nome: str
    descricao: Optional[str] = None
    preco: float
    categoria: Optional[str] = None
    quantidade_estoque: int
    criado_em: datetime


class Paginacao(BaseModel):
    page: int
    limit: int
    total_itens: int
    total_paginas: int


class ProdutoListOut(BaseModel):
    data: List[ProdutoOut]
    pagination: Paginacao


class EstoqueOut(BaseModel):
    produto_id: int
    quantidade_disponivel: int


class BaixaEstoqueIn(BaseModel):
    quantidade: int = Field(gt=0, description="deve ser maior que zero")


class BaixaEstoqueOut(BaseModel):
    produto_id: int
    quantidade_anterior: int
    quantidade_atual: int


class ReposicaoEstoqueIn(BaseModel):
    quantidade: int = Field(gt=0, description="deve ser maior que zero")


class ReposicaoEstoqueOut(BaseModel):
    produto_id: int
    quantidade_anterior: int
    quantidade_atual: int
