// Multijoueur pair-à-pair (WebRTC via PeerJS, serveur de signalisation public 0.peerjs.com).
// L'hôte fait tourner la simulation ; l'invité envoie ses commandes et reçoit des snapshots.
import Peer from 'peerjs';

const PREFIX = 'aow3d-';
const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';

function code() {
  let s = '';
  for (let i = 0; i < 6; i++) s += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  return s;
}

export function joinCodeFromUrl() {
  const m = location.hash.match(/join=([a-z0-9]+)/);
  return m ? m[1] : null;
}

export function inviteLink(c) {
  return `${location.origin}${location.pathname}#join=${c}`;
}

export class Net {
  constructor() {
    this.peer = null;
    this.conn = null;
    this.onMessage = () => {};
    this.onClose = () => {};
  }

  host(onReady, onGuest, onError) {
    const c = code();
    this.peer = new Peer(PREFIX + c);
    this.peer.on('open', () => onReady(c));
    this.peer.on('error', (e) => onError(describe(e)));
    this.peer.on('connection', (conn) => {
      if (this.conn) { conn.close(); return; } // un seul invité
      this.attach(conn);
      conn.on('open', () => onGuest());
    });
  }

  join(c, onOpen, onError) {
    this.peer = new Peer();
    this.peer.on('error', (e) => onError(describe(e)));
    this.peer.on('open', () => {
      const conn = this.peer.connect(PREFIX + c, { reliable: true });
      this.attach(conn);
      conn.on('open', () => onOpen());
      setTimeout(() => { if (!conn.open) onError("Impossible de joindre l'hôte (lien expiré ou réseau bloquant le pair-à-pair)."); }, 12000);
    });
  }

  attach(conn) {
    this.conn = conn;
    this.closed = false;
    conn.on('data', (d) => {
      this.lastRecv = performance.now();
      if (d?.t === 'ping') return;
      if (d?.t === 'bye') return this.lost();
      this.onMessage(d);
    });
    conn.on('close', () => this.lost());
    conn.on('error', () => this.lost());
    // Battement de cœur : PeerJS ne signale pas toujours la fermeture brutale d'un onglet
    conn.on('open', () => {
      this.lastRecv = performance.now();
      clearInterval(this.hb);
      this.hb = setInterval(() => {
        this.send({ t: 'ping' });
        if (performance.now() - this.lastRecv > 6000) this.lost();
      }, 1000);
    });
    this.unload = () => this.send({ t: 'bye' });
    window.addEventListener('beforeunload', this.unload);
  }

  lost() {
    if (this.closed) return;
    this.closed = true;
    clearInterval(this.hb);
    this.onClose();
  }

  send(msg) {
    if (this.conn?.open) this.conn.send(msg);
  }

  close() {
    this.closed = true;
    clearInterval(this.hb);
    if (this.unload) window.removeEventListener('beforeunload', this.unload);
    try { this.conn?.close(); } catch {}
    try { this.peer?.destroy(); } catch {}
    this.conn = null;
    this.peer = null;
  }
}

function describe(e) {
  const t = e?.type ?? '';
  if (t === 'peer-unavailable') return "Cette partie n'existe plus (l'hôte a fermé ou le lien est incorrect).";
  if (t === 'network' || t === 'server-error' || t === 'socket-error') return 'Serveur de connexion injoignable. Vérifie ta connexion internet.';
  if (t === 'browser-incompatible') return 'Navigateur incompatible avec WebRTC.';
  return 'Erreur réseau : ' + (e?.message ?? t);
}
