"""Small nested Firestore fake for endpoint regression tests."""

from __future__ import annotations

import copy
import uuid


class Snapshot:
    def __init__(self, reference):
        self.id = reference.id
        self.reference = reference
        self._data = copy.deepcopy(reference.db.store.get(reference.path))

    @property
    def exists(self):
        return self._data is not None

    def to_dict(self):
        return copy.deepcopy(self._data)


class Document:
    def __init__(self, db, path):
        self.db = db
        self.path = path
        self.id = path.rsplit("/", 1)[-1]

    def get(self, **_kwargs):
        return Snapshot(self)

    def set(self, data, merge=False):
        if merge:
            self.db.store.setdefault(self.path, {}).update(copy.deepcopy(data))
        else:
            self.db.store[self.path] = copy.deepcopy(data)

    def update(self, updates):
        target = self.db.store[self.path]
        for field, value in updates.items():
            cursor = target
            parts = field.split(".")
            for part in parts[:-1]:
                cursor = cursor.setdefault(part, {})
            if type(value).__name__ == "Increment":
                value = cursor.get(parts[-1], 0) + value.value
            cursor[parts[-1]] = copy.deepcopy(value)

    def delete(self):
        self.db.store.pop(self.path, None)

    def collection(self, name):
        return Query(self.db, f"{self.path}/{name}")


class Query:
    def __init__(self, db, path, filters=(), order=None, limit_to=None):
        self.db = db
        self.path = path
        self.filters = filters
        self.order = order
        self.limit_to = limit_to

    def document(self, doc_id=None):
        return Document(self.db, f"{self.path}/{doc_id or uuid.uuid4().hex}")

    def where(self, field, op, value):
        return Query(
            self.db,
            self.path,
            self.filters + ((field, op, value),),
            self.order,
            self.limit_to,
        )

    def order_by(self, field, direction="ASCENDING"):
        return Query(
            self.db, self.path, self.filters, (field, str(direction)), self.limit_to
        )

    def limit(self, count):
        return Query(self.db, self.path, self.filters, self.order, count)

    def _matches(self, data):
        for field, op, value in self.filters:
            item = data
            for part in field.split("."):
                item = item.get(part) if isinstance(item, dict) else None
            if op == "==" and item != value:
                return False
            if op == "array_contains" and value not in (item or []):
                return False
            if op == "in" and item not in value:
                return False
        return True

    def stream(self):
        rows = [
            Snapshot(Document(self.db, path))
            for path, data in self.db.store.items()
            if path.rsplit("/", 1)[0] == self.path and self._matches(data)
        ]
        if self.order:
            field, direction = self.order
            rows.sort(
                key=lambda item: (item.to_dict() or {}).get(field, ""),
                reverse="DESC" in direction.upper(),
            )
        else:
            rows.sort(key=lambda item: item.id)
        return rows[: self.limit_to] if self.limit_to is not None else rows

    def get(self):
        return self.stream()


class NestedFirestore:
    def __init__(self, data=None):
        self.store = copy.deepcopy(data or {})

    def collection(self, name):
        return Query(self, name)

    def transaction(self):
        return Transaction()


class Transaction:
    """Immediate transaction fake; endpoint tests run single-threaded."""

    def get(self, reference):
        if isinstance(reference, Query):
            return reference.stream()
        return reference.get()

    def set(self, reference, data):
        reference.set(data)

    def update(self, reference, data):
        reference.update(data)

    def delete(self, reference):
        reference.delete()
