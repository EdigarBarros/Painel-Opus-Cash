/**
 * Marca do OpusCash (a mesma de src/components/Marca.tsx do site): o símbolo do infinito na proporção certa,
 * "OPUS" na cor do texto, "CASH" no verde-água, e a etiqueta "Painel" para não confundir com o app.
 */
export function Marca({ grande }: { grande?: boolean }) {
  return (
    <span className={`marca ${grande ? 'grande' : ''}`} aria-label="Painel OpusCash" translate="no">
      <img className="marca-simbolo" src="/simbolo.webp" alt="" width={320} height={156} />
      <span className="marca-textos" aria-hidden="true">
        <span className="marca-nome">OPUS<b>CASH</b></span>
        <span className="marca-painel">Painel</span>
      </span>
    </span>
  )
}
