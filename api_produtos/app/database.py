import os

from dotenv import load_dotenv
from sqlmodel import SQLModel, Session, create_engine

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./produtos.db")

# check_same_thread=False: o FastAPI atende requisicoes em threads diferentes
engine = create_engine(
    DATABASE_URL,
    echo=False,
    connect_args={"check_same_thread": False},
)


def criar_tabelas() -> None:
    """Cria as tabelas no startup da aplicacao."""
    SQLModel.metadata.create_all(engine)


def get_session():
    """Dependency do FastAPI: abre e fecha a sessao por requisicao."""
    with Session(engine) as session:
        yield session
