"""In-memory boundary double; production handlers and schemas remain real."""
from copy import deepcopy

class Snapshot:
    def __init__(self, ref, data):
        self.reference, self.id, self.data = ref, ref.path.split('/')[-1], deepcopy(data)
        self.exists = data is not None
    def to_dict(self):
        return deepcopy(self.data)

class Ref:
    def __init__(self, db, path): self.db, self.path = db, path
    def get(self, transaction=None):
        if transaction and transaction.writes:
            raise AssertionError('Firestore disallows reads after writes')
        return Snapshot(self, self.db.data.get(self.path))
    def set(self, data, merge=False):
        self.db.data[self.path] = {**(self.db.data.get(self.path, {}) if merge else {}), **deepcopy(data)}
    def delete(self): self.db.data.pop(self.path, None)
    def collection(self, name): return Query(self.db, self.path + '/' + name)

class Query:
    def __init__(self, db, path, filters=(), order=None, direction=None, cap=None):
        self.db, self.path, self.filters, self.order, self.direction, self.cap = db, path, filters, order, direction, cap
    def document(self, name): return Ref(self.db, self.path + '/' + name)
    def where(self, field=None, op=None, value=None, *, filter=None):
        if filter: field, op, value = filter.field_path, filter.op_string, filter.value
        return Query(self.db, self.path, self.filters + ((field, value),), self.order, self.direction, self.cap)
    def limit(self, cap): return Query(self.db, self.path, self.filters, self.order, self.direction, cap)
    def order_by(self, field, direction=None): return Query(self.db, self.path, self.filters, field, direction, self.cap)
    def stream(self):
        def value(data, field):
            for key in field.split('.'): data = (data or {}).get(key)
            return data
        docs = [Snapshot(Ref(self.db, path), data) for path, data in sorted(self.db.data.items())
                if path.rsplit('/', 1)[0] == self.path and all(value(data, f) == v for f, v in self.filters)]
        if self.order: docs.sort(key=lambda d: value(d.data, self.order), reverse=self.direction == 'DESCENDING')
        return iter(docs if self.cap is None else docs[:self.cap])

class Transaction:
    def __init__(self): self.writes = []
    def set(self, ref, data, merge=False): self.writes.append((ref.set, (data, merge)))
    def delete(self, ref): self.writes.append((ref.delete, ()))
    def commit(self):
        for fn, args in self.writes: fn(*args)

class DB:
    def __init__(self, data=None): self.data = deepcopy(data or {})
    def collection(self, name): return Query(self, name)
