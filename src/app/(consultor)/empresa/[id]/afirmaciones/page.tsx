import { Encabezado } from "@/components/base/Vacio";
import { MatrizRealidad } from "@/components/realidad/MatrizRealidad";
import { BotonJob } from "@/components/consultor/BotonJob";

export default async function Afirmaciones({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ pilar?: string; estado?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  return (
    <>
      <Encabezado titulo="Afirmaciones" sub="Todas, filtrables. Nada entra sin fuente, fecha y estado." acciones={<BotonJob url={`/api/companies/${id}/contrast`} texto="Contrastar ahora" secundario />} />
      <MatrizRealidad companyId={id} modo="consultor" filtroInicial={sp} />
    </>
  );
}
