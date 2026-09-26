"""A tiny in-memory stand-in for the Firestore client.

Supports only what the contribution service uses: document get/set, equality
filters, ordering, limits, cursors and transactions. No Firebase, no network.

`run_transaction` buffers writes and applies them only if the work function
returns, which is what lets a test prove an SPG award is all-or-nothing.
"""

import copy
from typing import Any, Dict, List, Optional


class FakeSnapshot:
    def __init__(self, doc_id: str, data: Optional[dict]):
        self.id = doc_id
        self._data = data

    @property
    def exists(self) -> bool:
        return self._data is not None

    def to_dict(self) -> Optional[dict]:
        return None if self._data is None else copy.deepcopy(self._data)


class FakeDocumentRef:
    def __init__(self, store: Dict[str, Dict[str, dict]], collection: str, doc_id: str):
        self._store = store
        self._collection = collection
        self.id = doc_id

    def get(self, transaction: Any = None) -> FakeSnapshot:
        return FakeSnapshot(self.id, self._store.get(self._collection, {}).get(self.id))

    def set(self, data: dict) -> None:
        self._store.setdefault(self._collection, {})[self.id] = copy.deepcopy(data)

    def update(self, data: dict) -> None:
        self._store.setdefault(self._collection, {}).setdefault(self.id, {}).update(
            copy.deepcopy(data)
        )


class FakeQuery:
    def __init__(
        self,
        store: Dict[str, Dict[str, dict]],
        collection: str,
        filters: Optional[List[tuple]] = None,
        order: Optional[tuple] = None,
        limit_to: Optional[int] = None,
        after: Optional[str] = None,
    ):
        self._store = store
        self._collection = collection
        self._filters = list(filters or [])
        self._order = order
        self._limit = limit_to
        self._after = after

    def _clone(self, **changes) -> "FakeQuery":
        state = {
            "filters": self._filters,
            "order": self._order,
            "limit_to": self._limit,
            "after": self._after,
        }
        state.update(changes)
        return FakeQuery(self._store, self._collection, **state)

    def where(self, field: str, op: str, value: Any) -> "FakeQuery":
        if op != "==":
            raise NotImplementedError(f"fake Firestore supports '==' only, got {op!r}")
        return self._clone(filters=self._filters + [(field, value)])

    def order_by(self, field: str, direction: str = "ASCENDING") -> "FakeQuery":
        return self._clone(order=(field, direction))

    def limit(self, count: int) -> "FakeQuery":
        return self._clone(limit_to=count)

    def start_after(self, snapshot: FakeSnapshot) -> "FakeQuery":
        return self._clone(after=snapshot.id)

    def stream(self):
        rows = [
            (doc_id, data)
            for doc_id, data in self._store.get(self._collection, {}).items()
            if all(data.get(field) == value for field, value in self._filters)
        ]

        if self._order:
            field, direction = self._order
            rows.sort(key=lambda row: row[1].get(field), reverse=direction == "DESCENDING")
        else:
            rows.sort(key=lambda row: row[0])

        if self._after is not None:
            ids = [doc_id for doc_id, _ in rows]
            rows = rows[ids.index(self._after) + 1:] if self._after in ids else []

        if self._limit is not None:
            rows = rows[: self._limit]

        return [FakeSnapshot(doc_id, data) for doc_id, data in rows]


class FakeCollection(FakeQuery):
    def document(self, doc_id: str) -> FakeDocumentRef:
        return FakeDocumentRef(self._store, self._collection, doc_id)


class FakeTransaction:
    """Buffers writes; `commit` applies them together."""

    def __init__(self):
        self.writes: List[tuple] = []

    def set(self, reference: FakeDocumentRef, data: dict) -> None:
        self.writes.append((reference, data))

    def commit(self) -> None:
        for reference, data in self.writes:
            reference.set(data)


class FakeFirestore:
    def __init__(self, data: Optional[Dict[str, Dict[str, dict]]] = None):
        self.store: Dict[str, Dict[str, dict]] = copy.deepcopy(data or {})

    def collection(self, name: str) -> FakeCollection:
        return FakeCollection(self.store, name)

    def documents(self, collection: str) -> Dict[str, dict]:
        """Test helper: everything stored in one collection."""
        return self.store.get(collection, {})


def run_transaction(db: FakeFirestore, work):
    """Transaction runner for tests: writes land only if `work` returns."""
    transaction = FakeTransaction()
    result = work(transaction)
    transaction.commit()
    return result
