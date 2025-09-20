// roulette-storage.js
class StorageAdapter {
  // tableId: "american" | "european" (or any string)
  constructor(tableId) { this.tableId = tableId; }
  async load() { return []; }
  async saveAll(history) {}
  async append(num) {}
  async bulkAppend(nums) {}
  async reset() {}
}

/* ---------- LocalStorage ---------- */
class LocalStorageAdapter extends StorageAdapter {
  constructor(tableId) {
    super(tableId);
    this.key = tableId === "american" ? "american_roulette_v1" : "european_roulette_v1";
  }
  async load() {
    try { return JSON.parse(localStorage.getItem(this.key)) || []; } catch { return []; }
  }
  async saveAll(history) {
    try { localStorage.setItem(this.key, JSON.stringify(history)); } catch {}
  }
  async append(num) {
    const hist = await this.load();
    hist.push(num);
    await this.saveAll(hist);
  }
  async bulkAppend(nums) {
    const hist = await this.load();
    Array.prototype.push.apply(hist, nums);
    await this.saveAll(hist);
  }
  async reset() { try { localStorage.removeItem(this.key); } catch {} }
}

/* ---------- SessionStorage ---------- */
class SessionStorageAdapter extends StorageAdapter {
  constructor(tableId) {
    super(tableId);
    this.key = tableId === "american" ? "american_roulette_v1" : "european_roulette_v1";
  }
  async load() {
    try { return JSON.parse(sessionStorage.getItem(this.key)) || []; } catch { return []; }
  }
  async saveAll(history) {
    try { sessionStorage.setItem(this.key, JSON.stringify(history)); } catch {}
  }
  async append(num) {
    const hist = await this.load();
    hist.push(num);
    await this.saveAll(hist);
  }
  async bulkAppend(nums) {
    const hist = await this.load();
    Array.prototype.push.apply(hist, nums);
    await this.saveAll(hist);
  }
  async reset() { try { sessionStorage.removeItem(this.key); } catch {} }
}

/* ---------- REST Adapter ----------
  Expected API (customize to match your backend):

  GET    /api/roulette/history?table={american|european}&user={userId}
         -> { history: number[] }

  POST   /api/roulette/inputs
         body: { table: "american"| "european", user: string, inputs: number[] }
         -> { ok: true }

  DELETE /api/roulette/history?table={american|european}&user={userId}
         -> { ok: true }

  Optional: Authorization: Bearer <token>
----------------------------------- */
class RestStorageAdapter extends StorageAdapter {
  constructor(tableId, { baseUrl, userId, token } = {}) {
    super(tableId);
    this.baseUrl = baseUrl;
    this.userId = userId;
    this.token = token;
  }
  _headers() {
    const h = { "Content-Type": "application/json" };
    if (this.token) h["Authorization"] = `Bearer ${this.token}`;
    return h;
  }
  async load() {
    const url = `${this.baseUrl}/api/roulette/history?table=${encodeURIComponent(this.tableId)}&user=${encodeURIComponent(this.userId)}`;
    const res = await fetch(url, { headers: this._headers() });
    if (!res.ok) throw new Error(`Load failed: ${res.status}`);
    const json = await res.json();
    return Array.isArray(json.history) ? json.history : [];
  }
  async saveAll(history) {
    // overwrite by deleting then inserting everything
    await this.reset();
    if (history.length) {
      await this.bulkAppend(history);
    }
  }
  async append(num) { return this.bulkAppend([num]); }
  async bulkAppend(nums) {
    const url = `${this.baseUrl}/api/roulette/inputs`;
    const res = await fetch(url, {
      method: "POST",
      headers: this._headers(),
      body: JSON.stringify({ table: this.tableId, user: this.userId, inputs: nums })
    });
    if (!res.ok) throw new Error(`Append failed: ${res.status}`);
    return true;
  }
  async reset() {
    const url = `${this.baseUrl}/api/roulette/history?table=${encodeURIComponent(this.tableId)}&user=${encodeURIComponent(this.userId)}`;
    const res = await fetch(url, { method: "DELETE", headers: this._headers() });
    if (!res.ok) throw new Error(`Reset failed: ${res.status}`);
    return true;
  }
}

/* Factory */
function createStorageAdapter(mode, tableId, options = {}) {
  if (typeof mode === "object" && mode !== null && mode.__customAdapter) {
    return mode; // power users can pass their own adapter instance
  }
  if (mode === "session") return new SessionStorageAdapter(tableId);
  if (mode === "rest")    return new RestStorageAdapter(tableId, options);
  // default
  return new LocalStorageAdapter(tableId);
}

window.RouletteStorage = {
  StorageAdapter,
  LocalStorageAdapter,
  SessionStorageAdapter,
  RestStorageAdapter,
  createStorageAdapter
};
