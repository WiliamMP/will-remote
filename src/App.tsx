import { useEffect, useRef, useState } from "react";
import Peer, { type DataConnection, type MediaConnection } from "peerjs";
import { invoke } from "@tauri-apps/api/core";
import { scanCode } from "./keys";

// Each app registers on the public PeerJS broker as PREFIX + a 9-digit ID. The
// controller opens a data connection (input events); once the host accepts, the
// host calls back with its screen stream. Media and data go peer to peer
// (PeerJS's default ICE config includes STUN and TURN).
const PREFIX = "will-remote-";
const newId = () => String(100000000 + Math.floor(Math.random() * 900000000));
const pretty = (id: string) => id.replace(/(\d{3})(?=\d)/g, "$1 ");
const short = (peerId: string) => pretty(peerId.slice(PREFIX.length));
const notches = (d: number) => Math.sign(d) * Math.max(1, Math.round(Math.abs(d) / 100));

type Mode =
  | { k: "idle" }
  | { k: "request"; conn: DataConnection }
  | { k: "hosting"; conn: DataConnection; stream: MediaStream }
  | { k: "calling"; conn: DataConnection }
  | { k: "controlling"; conn: DataConnection; call: MediaConnection; stream: MediaStream };

export default function App() {
  const [id, setId] = useState(() => localStorage.getItem("id") ?? newId());
  const [online, setOnline] = useState(false);
  const [status, setStatus] = useState("");
  const [target, setTarget] = useState("");
  const [mode, setModeState] = useState<Mode>({ k: "idle" });
  const modeRef = useRef<Mode>(mode);
  const peerRef = useRef<Peer>(null);
  const setMode = (m: Mode) => {
    modeRef.current = m;
    setModeState(m);
  };

  const end = (msg = "") => {
    const m = modeRef.current;
    if (m.k === "idle") return;
    setMode({ k: "idle" }); // before close(), so the close handlers see idle
    if (m.k === "hosting") {
      m.stream.getTracks().forEach((t) => t.stop());
      invoke("reset").catch(() => {});
    }
    if (m.k === "controlling") m.call.close();
    m.conn.close();
    setStatus(msg);
  };
  // only the connection of the current session may end it
  const endIf = (conn: DataConnection, msg: string) => {
    const m = modeRef.current;
    if (m.k !== "idle" && m.conn === conn) end(msg);
  };
  const send = (ev: object) => {
    const m = modeRef.current;
    if (m.k === "controlling") m.conn.send(ev);
  };

  useEffect(() => {
    localStorage.setItem("id", id);
    const peer = new Peer(PREFIX + id);
    peerRef.current = peer;
    peer.on("open", () => setOnline(true));
    peer.on("disconnected", () => {
      setOnline(false);
      setTimeout(() => !peer.destroyed && peer.disconnected && peer.reconnect(), 3000);
    });
    peer.on("error", (err) => {
      if (err.type === "unavailable-id") {
        peer.destroy();
        setId(newId());
      } else if (err.type === "peer-unavailable") {
        end("ID não encontrado ou offline");
      } else setStatus(err.message);
    });

    // host side: someone wants to control this machine
    peer.on("connection", (conn) => {
      if (modeRef.current.k !== "idle") {
        conn.on("open", () => conn.close());
        return;
      }
      setMode({ k: "request", conn });
      setStatus("");
      conn.on("close", () => endIf(conn, "Conexão encerrada"));
    });

    // controller side: the host accepted and sends its screen
    peer.on("call", (call) => {
      const m = modeRef.current;
      if (m.k !== "calling" || call.peer !== m.conn.peer) {
        call.close();
        return;
      }
      call.answer();
      call.on("stream", (stream) => {
        if (modeRef.current.k === "calling" && modeRef.current.conn === m.conn)
          setMode({ k: "controlling", conn: m.conn, call, stream });
      });
      call.on("close", () => endIf(m.conn, "Conexão encerrada"));
    });
    return () => peer.destroy();
  }, [id]);

  const connect = () => {
    const t = target.replace(/\D/g, "");
    if (t.length !== 9 || t === id) return setStatus("ID inválido");
    const conn = peerRef.current!.connect(PREFIX + t, { reliable: true });
    setMode({ k: "calling", conn });
    setStatus("");
    conn.on("close", () =>
      endIf(conn, modeRef.current.k === "calling" ? "Pedido recusado" : "Conexão encerrada"),
    );
  };

  const accept = async () => {
    const m = modeRef.current;
    if (m.k !== "request") return;
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 30 }, audio: false });
    } catch {
      return end("Compartilhamento de tela cancelado");
    }
    if (modeRef.current !== m) return stream.getTracks().forEach((t) => t.stop()); // cancelled meanwhile
    const track = stream.getVideoTracks()[0];
    track.contentHint = "detail"; // keep text sharp over motion
    track.onended = () => end(); // "stop sharing" in the system UI
    setMode({ k: "hosting", conn: m.conn, stream });
    m.conn.on("data", (ev) => {
      if (modeRef.current.k === "hosting" && modeRef.current.conn === m.conn)
        invoke("input", { ev }).catch(() => {});
    });
    peerRef.current!.call(m.conn.peer, stream);
  };

  // controller: forward the physical keys; release held ones if the window loses focus
  useEffect(() => {
    if (mode.k !== "controlling") return;
    const held = new Set<number>();
    const key = (down: boolean) => (e: KeyboardEvent) => {
      e.preventDefault();
      const scan = scanCode(e.code);
      if (scan === undefined) return;
      if (down) held.add(scan);
      else held.delete(scan);
      send({ t: "Key", scan, down });
    };
    const kd = key(true);
    const ku = key(false);
    const blur = () => {
      held.forEach((scan) => send({ t: "Key", scan, down: false }));
      held.clear();
    };
    window.addEventListener("keydown", kd);
    window.addEventListener("keyup", ku);
    window.addEventListener("blur", blur);
    return () => {
      blur();
      window.removeEventListener("keydown", kd);
      window.removeEventListener("keyup", ku);
      window.removeEventListener("blur", blur);
    };
  }, [mode.k]);

  if (mode.k === "controlling") {
    const pos = (e: React.PointerEvent<HTMLVideoElement>) => {
      const r = e.currentTarget.getBoundingClientRect();
      return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
    };
    return (
      <div className="remote">
        <div className="bar">
          <span className="mono">{short(mode.conn.peer)}</span>
          <span className="grow" />
          <button onClick={() => end()}>Encerrar</button>
        </div>
        <div className="stage">
          <video
            autoPlay
            muted
            playsInline
            ref={(v) => {
              if (v && v.srcObject !== mode.stream) v.srcObject = mode.stream;
            }}
            onPointerMove={(e) => send({ t: "Move", ...pos(e) })}
            onPointerDown={(e) => {
              if (e.button > 2) return;
              e.currentTarget.setPointerCapture(e.pointerId);
              send({ t: "Move", ...pos(e) });
              send({ t: "Button", b: e.button, down: true });
            }}
            onPointerUp={(e) => e.button <= 2 && send({ t: "Button", b: e.button, down: false })}
            onWheel={(e) => send({ t: "Wheel", dx: notches(e.deltaX), dy: notches(e.deltaY) })}
            onContextMenu={(e) => e.preventDefault()}
          />
        </div>
      </div>
    );
  }

  if (mode.k === "hosting") {
    return (
      <main className="home">
        <section className="card">
          <h2>Sessão ativa</h2>
          <p>
            <b className="mono">{short(mode.conn.peer)}</b> está vendo e controlando este computador.
          </p>
          <button className="primary" onClick={() => end()}>
            Encerrar
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="home">
      <section className="card">
        <h2>Este computador</h2>
        <div className="id mono">{online ? pretty(id) : "conectando…"}</div>
        <div className="row">
          <p className="dim grow">Passe este ID para quem vai acessar. Você aprova cada pedido.</p>
          <button disabled={!online} onClick={() => navigator.clipboard.writeText(id)}>
            Copiar
          </button>
        </div>
      </section>
      <section className="card">
        <h2>Acessar outro computador</h2>
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault();
            connect();
          }}
        >
          <input
            className="mono grow"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            placeholder="ID remoto"
            inputMode="numeric"
            autoFocus
          />
          {mode.k === "calling" ? (
            <button type="button" onClick={() => end()}>
              Cancelar
            </button>
          ) : (
            <button className="primary" disabled={!online || mode.k !== "idle"}>
              Conectar
            </button>
          )}
        </form>
        {mode.k === "calling" && <p className="dim">Aguardando o outro lado aceitar…</p>}
      </section>
      {status && <p className="status">{status}</p>}

      {mode.k === "request" && (
        <div className="overlay">
          <section className="card">
            <h2>Pedido de acesso</h2>
            <p>
              <b className="mono">{short(mode.conn.peer)}</b> quer ver e controlar este computador.
            </p>
            <div className="row">
              <span className="grow" />
              <button onClick={() => end()}>Recusar</button>
              <button className="primary" onClick={accept}>
                Aceitar
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
