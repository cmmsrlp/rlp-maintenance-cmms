import { useRef, useState } from "react";
import { Camera, X } from "lucide-react";
import { uploadRotablePhoto, deleteRotablePhoto } from "../api/rotableEquipment";
import { useToast } from "./Toast";
import { getApiErrorMessage } from "../api/client";
import { FORMATOS_DE_IMAGEM, problemaNaImagem } from "../lib/imagens";

interface Props {
  rotableId: string;
  code?: string | null;
  photoUrl?: string | null;
  /** Quem so consulta ve a foto, mas nao troca. */
  podeEditar: boolean;
  /** Recarregar a ficha depois de trocar/remover. */
  aoMudar: () => void;
}

/**
 * Foto do equipamento recondicionavel na propria ficha - mesmo raciocinio e mesmo visual
 * da foto do ativo (AssetPhoto), so' que aqui e' a peca fisica (motor, redutor, rolo) que
 * ganha o registro, nao a posicao onde ela esta instalada.
 */
export function RotablePhoto({ rotableId, code, photoUrl, podeEditar, aoMudar }: Props) {
  const { notify } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(arquivo: File) {
    const problema = problemaNaImagem(arquivo);
    if (problema) return notify("error", problema);
    setEnviando(true);
    try {
      await uploadRotablePhoto(rotableId, arquivo);
      notify("success", "Foto do equipamento atualizada.");
      aoMudar();
    } catch (error) {
      notify("error", getApiErrorMessage(error));
    } finally {
      setEnviando(false);
    }
  }

  async function remover() {
    setEnviando(true);
    try {
      await deleteRotablePhoto(rotableId);
      notify("success", "Foto removida.");
      aoMudar();
    } catch (error) {
      notify("error", getApiErrorMessage(error));
    } finally {
      setEnviando(false);
    }
  }

  const alt = `Foto do equipamento ${code ?? ""}`.trim();

  if (!podeEditar) {
    return photoUrl ? (
      <img src={photoUrl} alt={alt} className="h-16 w-16 rounded-lg border border-gray-200 object-cover" />
    ) : null;
  }

  return (
    <div className="relative">
      <button
        type="button"
        className="group block"
        disabled={enviando}
        onClick={() => inputRef.current?.click()}
        title={photoUrl ? "Trocar a foto do equipamento" : "Adicionar uma foto do equipamento"}
      >
        {photoUrl ? (
          <img
            src={photoUrl}
            alt={alt}
            className="h-16 w-16 rounded-lg border border-gray-200 object-cover group-hover:opacity-80"
          />
        ) : (
          <span className="flex h-16 w-16 flex-col items-center justify-center gap-0.5 rounded-lg border border-dashed border-gray-300 bg-gray-50 text-graphite-400 group-hover:border-navy-400 group-hover:text-navy-600">
            <Camera className="h-5 w-5" />
            <span className="text-[10px] leading-none">{enviando ? "..." : "Foto"}</span>
          </span>
        )}
      </button>

      {photoUrl && (
        <button
          type="button"
          onClick={remover}
          disabled={enviando}
          aria-label="Remover a foto do equipamento"
          title="Remover a foto"
          className="absolute -right-1.5 -top-1.5 rounded-full border border-gray-200 bg-white p-0.5 text-graphite-400 shadow-sm hover:text-safety-red"
        >
          <X className="h-3 w-3" />
        </button>
      )}

      <input
        ref={inputRef}
        type="file"
        accept={FORMATOS_DE_IMAGEM.join(",")}
        className="hidden"
        onChange={(e) => {
          const arquivo = e.target.files?.[0];
          e.target.value = "";
          if (arquivo) void enviar(arquivo);
        }}
      />
    </div>
  );
}
