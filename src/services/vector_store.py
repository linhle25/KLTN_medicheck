"""Vector store cho RAG tra cứu tương tác thuốc — dùng ChromaDB.

Theo đúng style factory function của services/llm.py có sẵn trong template.
"""
import chromadb
from chromadb.api.models.Collection import Collection

from src.config import get_settings


def get_vector_store() -> Collection:
    settings = get_settings()
    client = chromadb.PersistentClient(path=settings.chroma_persist_dir)
    return client.get_or_create_collection("medication_interactions")


def seed_vector_store(collection: Collection, records: list[dict]) -> None:
    """Nạp CSDL thuốc & tương tác mô phỏng vào ChromaDB.

    Args:
        collection: collection lấy từ get_vector_store()
        records: danh sách dict, mỗi dict gồm id, document (text để embed),
                 và metadata (muc_do, nguon_trich_dan, ten_thuoc_a, ten_thuoc_b...)
                 Xem file mẫu tại data/seed/interactions_seed.json
    """
    if not records:
        return
    collection.add(
        ids=[r["id"] for r in records],
        documents=[r["document"] for r in records],
        metadatas=[r["metadata"] for r in records],
    )
