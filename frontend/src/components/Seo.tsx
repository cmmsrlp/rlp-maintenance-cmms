import { useEffect } from "react";

const SITE_NAME = "RLP Maintenance CMMS";
const SITE_URL = "https://rlpmaintenance.com.br";
const DEFAULT_IMAGE = `${SITE_URL}/brand/rlp-maintenance.png`;

interface SeoProps {
  title: string;
  description: string;
  /** Caminho da pagina, ex.: "/lubrificacao". "/" para a home. */
  path: string;
}

function setMeta(attr: "name" | "property", key: string, content: string) {
  let tag = document.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!tag) {
    tag = document.createElement("meta");
    tag.setAttribute(attr, key);
    document.head.appendChild(tag);
  }
  tag.setAttribute("content", content);
}

function setCanonical(href: string) {
  let link = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!link) {
    link = document.createElement("link");
    link.setAttribute("rel", "canonical");
    document.head.appendChild(link);
  }
  link.setAttribute("href", href);
}

/** Titulo, description, canonical e Open Graph por pagina - sem isso, todas as paginas
 * publicas competiam pelo mesmo titulo/descricao generico no Google, e compartilhar o link
 * no WhatsApp/LinkedIn nao mostrava nada (sem og:title, og:description, og:image). */
export function Seo({ title, description, path }: SeoProps) {
  useEffect(() => {
    const fullTitle = path === "/" ? title : `${title} - ${SITE_NAME}`;
    const url = `${SITE_URL}${path}`;

    document.title = fullTitle;
    setMeta("name", "description", description);
    setCanonical(url);

    setMeta("property", "og:type", "website");
    setMeta("property", "og:site_name", SITE_NAME);
    setMeta("property", "og:title", fullTitle);
    setMeta("property", "og:description", description);
    setMeta("property", "og:url", url);
    setMeta("property", "og:image", DEFAULT_IMAGE);
    setMeta("property", "og:locale", "pt_BR");

    setMeta("name", "twitter:card", "summary_large_image");
    setMeta("name", "twitter:title", fullTitle);
    setMeta("name", "twitter:description", description);
    setMeta("name", "twitter:image", DEFAULT_IMAGE);
  }, [title, description, path]);

  return null;
}
