"""torch無しで .pt (zip+pickle) を読む。state_dict を numpy 配列で返す。"""
import pickle, zipfile, numpy as np, collections

class _Storage:
    def __init__(self, dtype): self.dtype = dtype
def _rebuild(storage, offset, size, stride, *a):
    arr = storage.arr
    n = int(np.prod(size)) if size else 1
    # contiguous前提
    return arr[offset:offset + n].reshape(size)

class U(pickle.Unpickler):
    def __init__(self, f, zf, prefix):
        super().__init__(f); self.zf, self.prefix = zf, prefix
    def find_class(self, mod, name):
        if name == "_rebuild_tensor_v2": return _rebuild
        if name == "OrderedDict": return collections.OrderedDict
        if mod == "torch" and name.endswith("Storage"):
            return {"FloatStorage": np.float32, "LongStorage": np.int64, "HalfStorage": np.float16}[name]
        return super().find_class(mod, name)
    def persistent_load(self, pid):
        _, dt, key, _, numel = pid
        s = _Storage(dt); s.arr = np.frombuffer(self.zf.read(f"{self.prefix}/data/{key}"), dtype=dt)
        return s

def load(path):
    zf = zipfile.ZipFile(path)
    pkl = [n for n in zf.namelist() if n.endswith("data.pkl")][0]
    prefix = pkl.rsplit("/", 1)[0]
    return U(zf.open(pkl), zf, prefix).load()
